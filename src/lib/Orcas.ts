import { injectable } from "inversify";
import { CliUx } from "@oclif/core";
import "reflect-metadata";
import { DeliveryMethod } from "./DeliveryMethod";
import { ProjectFeature } from './ProjectFeature';
import * as fs from "fs-extra";
import { ProjectManager } from './ProjectManager';
import { Project } from './Project';
import { ShellHelper } from "./ShellHelper";
import { DBHelper } from './DBHelper';
import { Application } from './Application';
import { Git } from "./Git";
import yaml from "yaml";
import os from "os";
import AdmZip from "adm-zip";
import chalk from 'chalk'
import { Utils } from "./Utils";

import * as ps from "ps-node";
import { Program } from "ps-node";
@injectable()
export class Orcas implements DeliveryMethod{
    public install(feature:ProjectFeature, projectPath:string, singleSchema:boolean){

      let featurePath:string = projectPath + '/dependencies/' + feature.getName() + '_' + feature.getReleaseInformation();
      let projectName:string = ProjectManager.getInstance().getProjectNameByPath(projectPath);

        if (!singleSchema){
          fs.copyFileSync(featurePath + '/schema/build.gradle', projectPath + '/db/' + projectName + '_app/build.gradle');
          fs.copyFileSync(featurePath + '/schema/build.gradle', projectPath + '/db/' + projectName + '_logic/build.gradle');
          fs.copyFileSync(featurePath + '/schema/build.gradle', projectPath + '/db/' + projectName + '_data/build.gradle');

          fs.copyFileSync(featurePath + '/gradlew', projectPath + '/db/' + projectName + '_app/gradlew');
          fs.copyFileSync(featurePath + '/gradlew', projectPath + '/db/' + projectName + '_logic/gradlew');
          fs.copyFileSync(featurePath + '/gradlew', projectPath + '/db/' + projectName + '_data/gradlew');

          fs.copyFileSync(featurePath + '/gradlew.bat', projectPath + '/db/' + projectName + '_app/gradlew.bat');
          fs.copyFileSync(featurePath + '/gradlew.bat', projectPath + '/db/' + projectName + '_logic/gradlew.bat');
          fs.copyFileSync(featurePath + '/gradlew.bat', projectPath + '/db/' + projectName + '_data/gradlew.bat');

          fs.copySync(featurePath+'/gradle/', projectPath + '/db/' + projectName + '_app/gradle/');
          fs.copySync(featurePath+'/gradle/', projectPath + '/db/' + projectName + '_logic/gradle/');
          fs.copySync(featurePath+'/gradle/', projectPath + '/db/' + projectName + '_data/gradle/');

          fs.copySync(featurePath + '/buildSrc/', `${projectPath}/db/${projectName}_app/buildSrc/`);
          fs.copySync(featurePath + '/buildSrc/', `${projectPath}/db/${projectName}_logic/buildSrc/`);
          fs.copySync(featurePath + '/buildSrc/', `${projectPath}/db/${projectName}_data/buildSrc/`);
          
        }else{
          fs.copyFileSync(featurePath + '/app/build.gradle', projectPath + '/db/' + projectName + '/build.gradle');
          fs.copyFileSync(featurePath + '/gradlew',          projectPath + '/db/' + projectName + '/gradlew');
          fs.copyFileSync(featurePath + '/gradlew.bat',      projectPath + '/db/' + projectName + '/gradlew.bat');
          fs.copySync    (featurePath + '/gradle/',          projectPath + '/db/' + projectName + '/gradle/');
          fs.copySync    (featurePath + '/buildSrc/',        `${projectPath}/db/${projectName}/buildSrc/`);

          //fs.removeSync(projectPath + '/db/'+ projectName + '/tables_ddl');
        }
      fs.removeSync(featurePath);

      feature.setInstalled(true);
    }

    public async deploy(projectName:string, connection:string, password:string, schemaOnly: boolean, ords: string, silentMode:boolean, version:string, mode:string|undefined, schema:string|undefined, nocompile:boolean|undefined):Promise<{success: boolean, mode: string}>{

      let project=ProjectManager.getInstance().getProject(projectName);
      
      let unix = os.platform() === "win32" ? false : true;
      let prefix = os.platform() === "win32" ? "" : "./"; 
      let path:string = "";
      let buildZip:AdmZip;
      let buildInfo       = {name: version, type: mode, date: ""};

      if (version){
        if (fs.pathExistsSync(`${project.getPath()}/dist/${version}.zip`)){
          path = `${project.getPath()}/dist/${version}`;

          buildZip = new AdmZip(`${path}.zip`);
          buildZip.extractAllTo(`${path}`,true);
          if(unix){
            (await ShellHelper.executeScript('chmod -R +x *', 'dist/', false, project.getLogger()));
          }
          buildInfo = yaml.parse(fs.readFileSync(`${path}/buildInfo.yml`).toString());
        }else{
          project.getLogger().getFileLogger().log("error",'BUILD NOT FOUND');
          console.log(chalk.red(`Build to deploy not found. Use xcl project:build to create it`));
          process.exit();
        }
      }else{
        path = project.getPath();
      }

      let gradleAttributes = "";
      if(unix){
        gradleAttributes = ` -Ppassword='${password}' -Pnocompile=${nocompile} -Pmode=${buildInfo.type} `;
      }else{
        gradleAttributes = ` -Ppassword="${password}" -Pnocompile=${nocompile} -Pmode=${buildInfo.type} `;
      } 
      
      let gradleStringData  = `${prefix}gradlew deploy -Ptarget=${connection} -Pusername=${project.getUsers().get('DATA')?.getConnectionName()} ${gradleAttributes}`;
      let gradleStringLogic = `${prefix}gradlew deploy -Ptarget=${connection} -Pusername=${project.getUsers().get('LOGIC')?.getConnectionName()} ${gradleAttributes}`;
      let gradleStringApp   = `${prefix}gradlew deploy -Ptarget=${connection} -Pusername=${project.getUsers().get('APP')?.getConnectionName()} ${gradleAttributes}`;
      
      project.getLogger().getLogger().log("info", `Starting deployment in ${buildInfo.type} - mode...`);

      if (schema){
        let gradleString:string = "";
        switch (schema){
          case "data":
            gradleString = gradleStringData;
            break;
          case "logic":
            gradleString = gradleStringLogic;
            break;
          case "app":
            gradleString = gradleStringApp;
            break;
          default:
            gradleString = "";
            break;
        }

        if (gradleString){
          
          if(project.getMode()===Project.MODE_MULTI){
            path = project.getPath() + "/db/" + project.getName() + "_" + schema;
          }else{
            path = project.getPath() + "/db/" + project.getName();
          }

          project.getLogger().getLogger().log("info", `SCHEMA: ${schema.toUpperCase()}`);
          await this.hook(schema, "pre", projectName, connection, password, project);
          let success = await this.deploySchema(gradleString, project, path);
          await this.hook(schema, "post", projectName, connection, password, project);
          await this.hasInvalidObjects(project, schema, password, connection);
          
          /*let invalids = await DBHelper.getInvalidObjects(DBHelper.getConnectionProps(project.getUsers().get(schema.toUpperCase())?.getConnectionName(),password,connection)!);
          project.getLogger().getLogger().log("info",`Number of invalid objects: ${invalids.length}`);
          
          invalids.forEach((element: { name: string; type: string; }) => {
            project.getLogger().getLogger().log("info",`${element.name} (${element.type})`);
          });*/

          if(success){

            if (project.getMode() === Project.MODE_SINGLE && !schemaOnly){
              Application.installApplication(projectName, connection, password, ords);
            }

            this.cleanUp(path);
            return {success: true, mode: buildInfo.type!};
          }else{
            return  {success: false, mode: buildInfo.type!};
          }
        }else{
          return  {success: false, mode: buildInfo.type!};
        }

      }else{
        if (silentMode){
          CliUx.ux.action.start('Deploy...');
          let success = await this.silentDeploy(gradleStringData, gradleStringLogic, gradleStringApp, projectName, connection, password, ords, project, schemaOnly, path);
          if(success){
            if(path.includes('dist')){
              this.cleanUp(path);
            }
            CliUx.ux.action.stop('done');
            return {success: true, mode: buildInfo.type!};
          }else{
            this.cleanUp(path);
            CliUx.ux.action.stop('failed');
            return {success: false, mode: buildInfo.type!};
          }
        }else{
          let success = await this.unsilentDeploy(gradleStringData, gradleStringLogic, gradleStringApp, projectName, connection, password, ords, project, schemaOnly, path);
          if (success){
            this.cleanUp(path);
            return  {success: true, mode: buildInfo.type!};
          }else{
            return {success: false, mode: buildInfo.type!};
          }
        }
      }
    }

    private async hook(schema:string, type:string, projectName:string, connection:string, password:string, project:Project):Promise<void>{

      let conn:any;
      CliUx.ux.action.start(`${type}-${schema}-hooks: ...` );
      project.getLogger().getFileLogger().log("info",`${type}-${schema}-hooks`);
      switch (schema.toLowerCase()){
        case 'data':
          conn=DBHelper.getConnectionProps(project.getUsers().get('DATA')?.getConnectionName(),
                                          password,
                                          connection);
          break;
        case 'logic':
          conn=DBHelper.getConnectionProps(project.getUsers().get('LOGIC')?.getConnectionName(),
                                          password,
                                          connection);
          break;
        case 'app':
          conn=DBHelper.getConnectionProps(project.getUsers().get('APP')?.getConnectionName(),
                                          password,
                                          connection);
          break;
        }

        fs.readdirSync(project.getPath() + "/db/.hooks/")
              .filter( f => (
                            f.toLowerCase().substring(0, f.indexOf('_', f.indexOf('_', 0) + 1)).includes( type.toLowerCase() ) &&
                            f.toLowerCase().substring(0, f.indexOf('_', f.indexOf('_', 0) + 1)).includes( schema.toLowerCase() )
                          )
                     )
              .forEach(file=>{
                DBHelper.executeScriptIn(conn,
                                         file,
                                         project.getPath() + "/db/.hooks/",
                                         project.getLogger()
                                        );
              });
        CliUx.ux.action.stop('done');
        project.getLogger().getFileLogger().log("info",`${type}-${schema}-hooks done`);
    }

    public async unsilentDeploy(gradleStringData:string, gradleStringLogic:string, gradleStringApp:string, projectName:string, connection:string, password:string, ords:string, project:Project, schemaOnly:boolean, executePath:string):Promise<boolean>{
      let _this = this;
      let resultData, resultLogic, resultApp:boolean;
        
        gradleStringData = await _this.getChangedTables(project.getName(), (executePath+"/db/"+project.getName()+"_data").replaceAll("\\","/") + "/tables/", gradleStringData);
        let proceed:boolean = false;
        await _this.hook("data", "pre", projectName, connection, password, project);
        resultData = (await ShellHelper.executeScript(gradleStringData, executePath + "/db/" + project.getName() + "_data", true, project.getLogger())).status;
        if(!resultData){
          process.exit(1);
        }
        await _this.hook("data", "post", projectName, connection, password, project);
        await _this.hasInvalidObjects(project, "data", password, connection);

        proceed = await CliUx.ux.confirm('Proceed with ' + projectName.toUpperCase() + '_LOGIC? (y/n)');

        if (proceed){
          
          gradleStringLogic = await _this.getChangedTables(project.getName(), (executePath+"/db/"+project.getName()+"_logic").replaceAll("\\","/") + "/tables/", gradleStringLogic);
          await _this.hook("logic","pre",projectName, connection, password, project);
          resultLogic = (await ShellHelper.executeScript(gradleStringLogic, executePath + "/db/" + project.getName() + "_logic", true, project.getLogger())).status;
          if(!resultLogic){
            process.exit(1);
          }
          await _this.hook("logic", "post", projectName, connection, password, project);
          await _this.hasInvalidObjects(project, "logic", password, connection);
          proceed = await CliUx.ux.confirm('Proceed with ' + projectName.toUpperCase() + '_APP? (y/n)');
          
          if (proceed){
            
            gradleStringApp = await _this.getChangedTables(project.getName(), (executePath+"/db/"+project.getName()+"_app").replaceAll("\\","/") + "/tables/", gradleStringApp);
            await _this.hook("app", "pre", projectName, connection, password, project);
            resultApp = (await ShellHelper.executeScript(gradleStringApp, executePath + "/db/" + project.getName() + "_app", true, project.getLogger())).status;
            if(!resultApp){
              process.exit(1);
            }
            await _this.hook("app", "post", projectName, connection, password, project);
            await _this.hasInvalidObjects(project, "app", password, connection);
            
            if (!schemaOnly){
              Application.installApplication(projectName, connection, password, ords, executePath);
            }
            
            await _this.hook("app","finally",projectName, connection, password, project);
            await _this.hook("logic","finally",projectName, connection, password, project);
            await _this.hook("data","finally",projectName, connection, password, project);
            
            project.getLogger().getLogger().log("info", 'XCL - deploy ready\n---------------------------------------------------------------');
            return(resultData && resultLogic && resultApp);

          }else{
            project.getLogger().getLogger().log("info", 'XCL - deploy ready\n---------------------------------------------------------------');
            return(resultData && resultLogic);
          }
        }else{
          project.getLogger().getLogger().log("info", 'XCL - deploy ready\n---------------------------------------------------------------');
          return(resultData);
        }
    }

    public async silentDeploy(gradleStringData:string, gradleStringLogic:string, gradleStringApp:string, projectName:string, connection:string, password:string, ords:string, project:Project, schemaOnly:boolean, executePath:string):Promise<boolean>{
      let _this = this;
      let resultData, resultLogic, resultApp:boolean;
      return new Promise( async(resolve, reject)=>{
        gradleStringData = await _this.getChangedTables(project.getName(), (executePath+"/db/"+project.getName()+"_data").replaceAll("\\","/") + "/tables/", gradleStringData);
        await _this.hook("data","pre",projectName, connection, password, project);
        resultData = (await ShellHelper.executeScript(gradleStringData, executePath+"/db/"+project.getName()+"_data", false, project.getLogger())).status;
        if(!resultData){
          process.exit(1);
        }
        await _this.hook("data","post",projectName, connection, password, project);
        await _this.hasInvalidObjects(project, "data", password, connection, true);
        
        gradleStringLogic = await _this.getChangedTables(project.getName(), (executePath+"/db/"+project.getName()+"_logic").replaceAll("\\","/") + "/tables/", gradleStringLogic);
        await _this.hook("logic","pre",projectName, connection, password, project);
        resultLogic = (await ShellHelper.executeScript(gradleStringLogic, executePath+"/db/"+project.getName()+"_logic", false, project.getLogger())).status;
        if(!resultLogic){
          process.exit(1);
        }
        await _this.hook("logic","post",projectName, connection, password, project);
        await _this.hasInvalidObjects(project, "logic", password, connection, true);

        gradleStringApp = await _this.getChangedTables(project.getName(), (executePath+"/db/"+project.getName()+"_app").replaceAll("\\","/") + "/tables/", gradleStringApp);
        await _this.hook("app","pre",projectName, connection, password, project);
        resultApp = (await ShellHelper.executeScript(gradleStringApp, executePath+"/db/"+project.getName()+"_app", false, project.getLogger())).status;
        if(!resultApp){
          process.exit(1);
        }
        await _this.hook("app","post", projectName, connection, password, project);
        await _this.hasInvalidObjects(project, "app", password, connection, true);
        if (!schemaOnly){
          Application.installApplication(projectName, connection, password, ords);
        }
        
        await _this.hook("app", "finally", projectName, connection, password, project);
        await _this.hook("logic", "finally", projectName, connection, password, project);
        await _this.hook("data", "finally", projectName, connection, password, project);
        project.getLogger().getLogger().log("info", 'XCL - deploy ready\n---------------------------------------------------------------');
        resolve(resultData && resultLogic && resultApp);
      });
    }

    public async deploySchema(gradleString:string, project:Project, path:string):Promise<boolean>{
      return new Promise(async (resolve, reject)=>{
        gradleString = await this.getChangedTables(project.getName(), path.replaceAll("\\","/") + "/tables/", gradleString);
        resolve((await ShellHelper.executeScript(gradleString, path, true, project.getLogger())).status);
      });
    }

    public async build(projectName:string, version:string, mode:string, commit:string|undefined){
      let project:Project = ProjectManager.getInstance().getProject(projectName);
      let buildInfo       = {name: "", type:"", date: ""};

      //ProjectManager.getInstance().getProject(projectName).setVersion(version);
      let buildZip:AdmZip = await this.patch(version, project, mode, (commit ? commit : version));

      buildInfo.name = version;
      buildInfo.type = mode;
      buildInfo.date = new Date().toLocaleDateString();
      fs.writeFileSync('buildInfo.yml',yaml.stringify(buildInfo));

      buildZip.addLocalFile('buildInfo.yml');
      buildZip.writeZip(project.getPath()+ "/" + version + ".zip");
      fs.moveSync(project.getPath()+ "/" + version + ".zip",project.getPath()+ "/dist/" + version + ".zip");
      fs.unlinkSync('buildInfo.yml');
    }


    async patch(version:string, project:Project, mode:string, commit:string):Promise<AdmZip>{
      
      if(!mode){
        if(!project.getStatus().getCommitId()){
          mode = "init";
        }else{
          mode = "patch";
        }
      }

      if(mode === "init"){
        const checkoutCommand =`git checkout tags/${commit} -B xcl${commit}`;
        await ShellHelper.executeScript(checkoutCommand, process.cwd(), false, project.getLogger());
      }

      let fileMap:Map<string,string> = new Map();
      
      let fileList:string[] = await Git.getChangedFiles(mode, commit, project.getName());
      let appList:string[]  = await Git.getChangedApexApplications(project.getName(), commit, mode);
      let release           = project.getVersion();
      let apexAppsPath      = project.getPath() + "/apex/";
      let appPath           = "";
      let path              = "";

      const basePath:string = "db";
      let buildZip = new AdmZip();

      if (appList.length>0 || fileList.length>0){

        console.log(`Creating ${mode} - build: ${version}`);

        
        console.log('...adding .hook directories');
        
        
        buildZip.addLocalFolder(`${basePath}/.hooks`, `${basePath}/.hooks`);
        
        for await(const user of project.getUserNames()){
          buildZip.addLocalFolder(`${basePath}/${user.toLowerCase()}/.hooks`, `${basePath}/${user.toLowerCase()}/.hooks`);
        }
        
        console.log('...adding _setup directory');
        
        let executePath = `${project.getPath()}/${basePath}/_setup`.replaceAll('\\','/');
        // Der find ist für das "←[?25h" verantwortlich
        let scripts:string = (await ShellHelper.executeScript(`find -name '*.sql' -printf '%P#'`, executePath, false, project.getLogger())).result;
        let scriptList:string[] = scripts.substring(0,scripts.lastIndexOf('#')).split('#');
        for await(const setupScript of scriptList){  
          fileList.push(`${basePath}/_setup/${setupScript}`);
        }
        
        console.log('...adding changed files');
        
        for await(const file of fileList){
          if(file!='' && !file.endsWith('/') && !file.substring(file.lastIndexOf('/') + 1, file.length).startsWith('.') && !fs.statSync(file).isDirectory()){
            fileMap.set(file,file);
          }
        }

        for await (const iterator of fileMap.keys()) {
          if(fs.pathExistsSync(iterator)){
            try{
              let path = iterator.substring(0, iterator.lastIndexOf('/'));
              buildZip.addLocalFile(iterator, path);
            }catch(err){
              console.log(`...could not add: ${iterator} `);
              continue;
            }
          }
        }
        
        console.log('...adding necessities');
        
        for await (const schema of ["data","logic","app"]) {
          for await (const file of ["build.gradle","gradlew","gradlew.bat"]) {
          if (project.getMode()===Project.MODE_MULTI){
              if (!fileMap.has(`db/${project.getName()}_${schema}/${file}`)){
                buildZip.addLocalFile(`db/${project.getName()}_${schema}/${file}`, `db/${project.getName()}_${schema}/`);
              }
          }else{
            if (!fileMap.has(`db/${project.getName()}/${file}`)){
              buildZip.addLocalFile(`db/${project.getName()}/${file}`, `db/${project.getName()}/`);
            }
          }
          }
          buildZip.addLocalFolder(`db/${project.getName()}_${schema}/gradle/`,`db/${project.getName()}_${schema}/gradle`);
          buildZip.addLocalFolder(`db/${project.getName()}_${schema}/buildSrc/`,`db/${project.getName()}_${schema}/buildSrc`);
        }

        //Read apex-folder and find the correct file
        console.log('...adding apps and rest modules');

        for(let i=0; i<appList.length; i++){
          if(fs.pathExistsSync(apexAppsPath + appList[i])){
            if(fs.statSync(apexAppsPath + appList[i]).isDirectory()){
              if(fs.existsSync(apexAppsPath + appList[i] + "/application/create_application.sql")){
                path = apexAppsPath + appList[i] + "/application/create_application.sql";
              }
              //If Application was exportet with SplitFlat-Option
              else if(fs.existsSync(apexAppsPath + appList[i] + "/create_application.sql")){
                path = apexAppsPath + appList[i] + "/create_application.sql";
              }
              appPath = apexAppsPath + appList[i];
            }
          }else{
            if(fs.pathExistsSync(apexAppsPath + appList[i]+".sql")){
              appPath = apexAppsPath + appList[i]+".sql";
              path = apexAppsPath + appList[i]+".sql";
            }
          }

          if(path != ""){
            let createApp = fs.readFileSync(path);
            if(createApp.toString().search("p_flow_version=>'" + release + "'") > 0){
              let newCreateApp = createApp.toString().replace("p_flow_version=>'" + release + "'","p_flow_version=>'" + version + "'");
              fs.writeFileSync(path, newCreateApp);
            }else{
              if(createApp.toString().search("p_flow_version=>'Release 1.0'") > 0){
                let newCreateApp = createApp.toString().replace("p_flow_version=>'" + release + "'","p_flow_version=>'" + version + "'");
                fs.writeFileSync(path, newCreateApp);
              }else{
                console.log("......Replacement String was not found, Version-Number could not be set automatically!");
              }
            }
          }
          buildZip.addLocalFolder(appPath, "apex/" + appList[i]);
        }
      }else{
        console.log(chalk.yellow('WARNING: Created empty build in ' + mode + " mode! Please check your repository and commits and try again!"));
      }
      
      return buildZip;
    }

    private cleanUp(path:string){
      if(path.includes('dist')){
        try{
          CliUx.ux.action.start('Cleaning up...');
          ps.lookup({command: 'java', arguments: 'org.gradle.launcher.daemon.bootstrap.GradleDaemon'}, function(err:Error, resultList:Program[] ) {
              for (const process of resultList) {
                ps.kill(process.pid);
              }
              fs.removeSync(path);
              CliUx.ux.action.stop('done');
          });
        }catch(error){
          console.log(error);
        }
      }
    }

    public remove(feature:ProjectFeature, projectPath:string, singleSchema:boolean)    : void {
      let projectName:string = ProjectManager.getInstance().getProjectNameByPath(projectPath);

        if (!singleSchema){
          fs.removeSync(projectPath + '/db/' + projectName + '_app/build.gradle');
          fs.removeSync(projectPath + '/db/' + projectName + '_logic/build.gradle');
          fs.removeSync(projectPath + '/db/' + projectName + '_data/build.gradle');

          fs.removeSync(projectPath + '/db/' + projectName + '_app/gradlew');
          fs.removeSync(projectPath + '/db/' + projectName + '_logic/gradlew');
          fs.removeSync(projectPath + '/db/' + projectName + '_data/gradlew');

          fs.removeSync(projectPath + '/db/' + projectName + '_app/gradlew.bat');
          fs.removeSync(projectPath + '/db/' + projectName + '_logic/gradlew.bat');
          fs.removeSync(projectPath + '/db/' + projectName + '_data/gradlew.bat');

          fs.removeSync(projectPath + '/db/' + projectName + '_app/gradle/');
          fs.removeSync(projectPath + '/db/' + projectName + '_logic/gradle/');
          fs.removeSync(projectPath + '/db/' + projectName + '_data/gradle/');
        }else{
          fs.removeSync(projectPath + '/db/' + projectName + '/build.gradle');
          fs.removeSync(projectPath + '/db/' + projectName + '/gradlew');
          fs.removeSync(projectPath + '/db/' + projectName + '/gradlew.bat');
          fs.removeSync(projectPath + '/db/' + projectName + '/gradle/');
        }
      feature.setInstalled(false);
    }

    public async getChangedTables(projectName:string, path:string, gradleString:string):Promise<string>{
      let tables = await Git.getChangedTables(projectName, path, undefined);
      
      for(let i=0; i<tables.length; i++){
        tables[i] = tables[i].replace("\.sql","").substring(tables[i].lastIndexOf("/") + 1, tables[i].length).toUpperCase();
      }

      if(tables.length>0){
        return (gradleString + "-Ptables=" + tables.join(","));
      }else{
        return gradleString;
      }  
    }

    private async hasInvalidObjects(project:Project, schema:string, password:string, connection:string, silent:boolean=false, output:boolean=true):Promise<boolean>{
      let invalids = await DBHelper.getInvalidObjects(DBHelper.getConnectionProps(project.getUsers().get(schema.toUpperCase())?.getConnectionName(),password,connection)!);
      if (invalids.length>0){
        project.getLogger().getLogger().log("info",`Number of invalid objects: ${invalids.length}`);
        
        if(output){
          invalids.forEach((element: { name: string; type: string; errors:string[]}) => {
            project.getLogger().getLogger().log("info",`${element.name} (${element.type})`);
            element.errors.forEach((error)=>{
              project.getLogger().getLogger().log("info",`${error}`);
            })
          });
        }

        if(!silent){
          return await this.recompile(project, schema, password, connection);
        }
        return true;
      }else{
        return false;
      }
    }

    private async recompile(project:Project, schema:string, password:string, connection:string):Promise<boolean>{
      let recompile:boolean = true;
      recompile = await CliUx.ux.confirm('Recompile invalid objects? (y/n)');
      let invalids:boolean = true; 
      let output:boolean = false;
      let conn:any = DBHelper.getConnectionProps(project.getUsers().get(schema.toUpperCase())?.getConnectionName(),
                                                  password,
                                                  connection);
      while(invalids && recompile){
        output    = true;
        project.getLogger().getLogger().log('info','Trying to recompile invalid objects...');
        project.getLogger().getLogger().log('info',`${__dirname}`);
        await DBHelper.executeScript(conn, Utils.checkPathForSpaces( __dirname + '/scripts/schema_recompile.sql') + ` ${project.getUsers().get(schema.toUpperCase())?.getName().toUpperCase()}`, project.getLogger());
        invalids  = await this.hasInvalidObjects(project, schema, password, connection, output, true);
        if (invalids){
          recompile = await CliUx.ux.confirm('Recompile invalid objects? (y/n)');
        }
      }

      return invalids;
    }
}