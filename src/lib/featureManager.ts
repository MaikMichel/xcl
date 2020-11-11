//Imports
import * as yaml from "yaml";
import * as fs from "fs-extra";
import * as os from "os";
import * as request from "request-promise-native";
import chalk from 'chalk'
import { Feature } from './Feature';
import { integer } from '@oclif/command/lib/flags';
import { ProjectManager } from './ProjectManager';
import { ProjectFeature } from './ProjectFeature';
import { Request } from 'request';
import requestPromise = require('request-promise-native');
import { GithubCredentials } from './GithubCredentials';
import * as AdmZip from "adm-zip";
import { Executer } from './Executer';
import { DBHelper, IConnectionProperties } from './DBHelper';
import  { deliveryFactory }  from './DeliveryFactory';
import { DeliveryMethod } from './DeliveryMethod';
import {Project} from './Project';
import e = require('express');
import { Environment } from './Environment';
const Table = require('cli-table');

export class FeatureManager{
    public static softwareYMLfile: string = "software.yml";

    private static manager: FeatureManager;
    private static xclHome = os.homedir + "/AppData/Roaming/xcl";
    private static softwareYaml: yaml.Document;
    private static softwareJson: any;
    private static features: Map<String, Feature>;
 

    private constructor(){
        FeatureManager.softwareYaml = yaml.parseDocument(fs.readFileSync(FeatureManager.xclHome + "/" 
                                                            + FeatureManager.softwareYMLfile).toString());


        // convert to json of create an empty definition
        FeatureManager.softwareJson = FeatureManager.softwareYaml.toJSON();
        FeatureManager.features = new Map();

        Object.keys(FeatureManager.softwareJson.software).forEach(function(softwareName){
          let softwareJSON = FeatureManager.softwareJson.software[softwareName];
          let featureType="";
         
          if (softwareJSON.deploy){
            featureType="DEPLOY";
          }else{
            featureType="DB";
          }
            
          FeatureManager.features.set(softwareName, new Feature({ name: softwareName, 
                                                                  owner: softwareJSON.owner, 
                                                                  repo: softwareJSON.repo, 
                                                                  gitAttribute: softwareJSON.call,
                                                                  type: featureType
                                                                })
                                                              );
        });
        // what else belongs to FM?
    }

    static getInstance() {
        if (!FeatureManager.manager ) {
          FeatureManager.manager = new FeatureManager();
        }
        return FeatureManager.manager;
      }

    public listFeatures(type:string) {
        if (ProjectManager.getInstance().getProjectNameByPath(process.cwd())=="all"){
          const table = new Table({
            head: [        
              chalk.blueBright('name'),
              chalk.blueBright('github-repository'),
              chalk.blueBright('owner'),
              chalk.blueBright('type')
            ]
          });
          let feature:Feature;

          for(feature of FeatureManager.features.values()){
            if (feature.getType()===type || type==="ALL"){
              table.push([ feature.getName(), feature.getRepo(), feature.getOwner(), feature.getType() ]);
            }
          }
          console.log(table.toString());
        }else{
          //ab hier neues Verhalten des List-befehls
          let p:Project = ProjectManager.getInstance().getProject(ProjectManager.getInstance().getProjectNameByPath(process.cwd()));                                                    
          const table = new Table({
            head: [        
              chalk.blueBright('name'),
              chalk.blueBright('github-repository'),
              chalk.blueBright('owner'),
              chalk.blueBright('type'),
              chalk.blueBright('status'),
              chalk.blueBright('')
            ]
          });
          let feature:Feature;

          for(feature of FeatureManager.features.values()){
            if (feature.getType()===type || type==="ALL"){
              if(p.getFeatures().has(feature.getName())){
                table.push([ feature.getName(), feature.getRepo(), feature.getOwner(), feature.getType(),'added ',  p.getFeatures().get(feature.getName())?.getStatus()]);
              }else{
                table.push([ feature.getName(), feature.getRepo(), feature.getOwner(), feature.getType(),'not added','' ]);
              }
            }
          }
          console.log(table.toString());
          //Bis hier neues Verhalten
        }
        
      }

      public getFeatureReleases(name:string){
        const table = new Table({
          head: [        
            chalk.blueBright(name)
          ]
        });
        
        if(FeatureManager.features.has(name.toLowerCase())){
            (FeatureManager.features.get(name.toLowerCase()) ! ).getReleaseInformation().then(function(releases:String[]){
            for (let i=0; i<releases.length; i++){
              table.push([releases[i]]);
            }
            console.log(table.toString());
          });
          
        }else{
          throw Error('Unknown Feature: '+name+' Try: xcl feature:list');
        }
      }

      public addFeatureToProject(featureName:string, version:string, projectName:string, username: string, password: string){
        return new Promise((resolve,reject)=>{
          let pManager:ProjectManager=ProjectManager.getInstance();
          pManager.getProject(projectName).addFeature( (this.getProjectFeature(featureName, version, username, password) ! ));
          this.downloadFeature(pManager.getProject(projectName).getFeatures().get(featureName)!, projectName).then(()=>resolve());
        });
      }

      private downloadFeature(feature:ProjectFeature, projectName:string){
        let pManager:ProjectManager=ProjectManager.getInstance();
        return new Promise((resolve, reject)=>{
          var filename = pManager.getProject(projectName).getPath() +'/dependencies/'+feature.getName()+'_'+feature.getReleaseInformation()+'.zip';
          feature.getDownloadUrl()
                    .then(function(url){
                    var options = {
                      uri: "",
                      headers: {}
                    };
                    
                    options.uri=url;

                    if (GithubCredentials.get()){
                        options.headers= {
                            'User-Agent': 'xcl',
                            'Authorization': 'token '+GithubCredentials.get()
                        };
                    }else{
                      options.headers= {
                        'User-Agent': 'xcl'
                      }
                    }

              if(!fs.pathExistsSync(pManager.getProject(projectName).getPath() +'/dependencies')){
                  fs.mkdirSync(pManager.getProject(projectName).getPath() +'/dependencies');
              }

              request(options)
                    .pipe(
                      fs.createWriteStream(filename)
                          .on('close', function(){
                            resolve();
                          })
                      );
                });
          });
      }

      public listProjectFeatures(projectName:string, type:string){
        const table = new Table({
          head: [        
            chalk.blueBright('name'),
            chalk.blueBright('version'),
            chalk.blueBright('type'),
            chalk.blueBright('status')
            
          ]
        });

        let feature:ProjectFeature;

        for(feature of ProjectManager.getInstance().getProject(projectName).getFeatures().values()){
          if (feature.getType()===type || type==="ALL"){
            table.push([
              feature.getName(), 
              feature.getReleaseInformation(),
              feature.getType(),
              feature.getStatus()  
            ]);
          }
        }
      
        console.log('Showing Features for Project: '+projectName);
        console.log(table.toString());
      }

      public getProjectFeature(featureName:string, version:string, username:string, password:string, installed:Boolean=false):ProjectFeature|undefined{
        let feature:ProjectFeature|undefined;
        if( FeatureManager.features.has(featureName.toLowerCase()) ){
          if (FeatureManager.features.get(featureName.toLowerCase()) !== undefined ){
            feature = new ProjectFeature({parent: (FeatureManager.features.get(featureName.toLowerCase()) !),
                                              version: version,
                                              username: username,
                                              password: password,
                                              installed: installed
                                          });
            if (feature === undefined){                                            
              throw Error("Feature could not be found!");
            }
          }
        }else{
          throw Error ("Unkown feature!");
        }
        return feature;
      }

      public async installAllProjectFeatures(projectName:string, connection:string, syspw:string, forceInstall:boolean){
        for (const feature of ProjectManager.getInstance().getProject(projectName).getFeaturesOfType('DB').values()){
          if(feature.isInstalled() && forceInstall){
            await FeatureManager.updateFeatureVersion(feature.getName(), feature.getReleaseInformation().toString(), projectName, connection, syspw);
          }else{
            FeatureManager.getInstance().installProjectFeature(feature.getName(), connection, syspw, projectName);
          }
        }
      }

      public installProjectFeature(featureName:string, connection:string, syspw:string, projectName:string){
          return new Promise((resolve, reject)=>{
            var connectionWithUser="";
            var projectPath=ProjectManager.getInstance().getProject(projectName).getPath();
            syspw = syspw ? syspw : Environment.readConfigFrom(projectPath, "syspw");
            var project = ProjectManager.getInstance().getProject(projectName);
            if (project.getFeatures().has(featureName)){
              let feature:ProjectFeature=project.getFeatures().get(featureName)!;
              
              if (feature.getType()==="DB"){
                var c:IConnectionProperties = DBHelper.getConnectionProps('sys', syspw, connection);
                if (!project.getStatus().checkDependency(feature)){
                  DBHelper.isFeatureInstalled(feature,c)
                    .then((installed) => {
                      if(! installed){
                        var installSteps = FeatureManager.getInstallSteps(feature.getName());
                        FeatureManager.unzipFeature(installSteps, projectPath, feature).then(()=>{
                        if (installSteps.scripts){
                          for (var i=0; i<installSteps.scripts.length; i++){
                            var argumentString="";
                            var argumentValues=[];

                            if (installSteps.scripts[i].arguments){
                              for (var j=0; j<installSteps.scripts[i].arguments.length; j++){
                                if (installSteps.scripts[i].arguments[j] == 'credentials'){
                                  argumentString = " " + feature.getUser().getName() + " ";
                                  argumentString = argumentString+feature.getUser().getPassword();
                                }else if(installSteps.scripts[i].arguments[j] == 'username'){
                                  argumentString = " " + feature.getUser().getName(); 
                                }else{
                                  argumentString = argumentString + " " + installSteps.parameters[installSteps.scripts[i].arguments[j]];
                                }
                              }
                            }

                            if (installSteps.scripts[i].sys === true){
                              connectionWithUser="sys/" + syspw + "@" + connection + " AS SYSDBA";
                              c = DBHelper.getConnectionProps('sys',syspw,connection);
                            }else{
                              connectionWithUser=feature.getUser().getName() + "/" + feature.getUser().getPassword() + "@" + connection;
                              c = DBHelper.getConnectionProps(feature.getUser().getName(),feature.getUser().getPassword(),connection);
                            }

                            var executeString="";
                            if (fs.existsSync(projectPath + '/dependencies/' + feature.getName() + '_' + feature.getReleaseInformation() + '/' + installSteps.scripts[i].path)){
                              executeString = projectPath + '/dependencies/' 
                                                          + feature.getName() 
                                                          + '_' 
                                                          + feature.getReleaseInformation() 
                                                          + '/' 
                                                          + installSteps.scripts[i].path 
                                                          + argumentString;
                            }else{
                              if(fs.existsSync(__dirname + "/scripts/" + installSteps.scripts[i].path)){
                                executeString=__dirname + "/scripts/" + installSteps.scripts[i].path + argumentString;
                              }else{
                                throw Error("Script couldn't be found!");
                              }
                            }
                            DBHelper.executeScript(c, executeString);
                          }
                          fs.removeSync(projectPath + '/dependencies/' + feature.getName() + '_' + feature.getReleaseInformation());
                        }else{
                          throw Error('Could not find installation information! Update your software.yml File!');
                        }
                      });
                      }else{
                        console.warn(chalk.yellow(`WARNING: Feature '${feature.getName()}' is already installed! First remove feature or use xcl feature:update!`));
                        reject();
                      }
                  })
                  .finally( function(){
                      feature.setInstalled(true);
                      ProjectManager.getInstance().getProject(projectName).updateFeature(feature);
                      ProjectManager.getInstance().getProject(projectName).getStatus().updateDependencyStatus(feature);
                      resolve();
                    }
                );
                }
              }else{
                if(feature.getType() === "DEPLOY"){
                  FeatureManager.unzipFeature(undefined, projectPath, feature).then(()=>{
                    deliveryFactory.getNamed<DeliveryMethod>("Method",featureName.toUpperCase()).install(feature, projectPath);
                    ProjectManager.getInstance().getProject(projectPath).getStatus().updateDependencyStatus(feature);
                    resolve();
                  });
                }
              }
            }else{
              console.log(chalk.red('ERROR: Dependency missing! Execute ´xcl feature:add´ first!'));
              reject();
            } 
          });
      }

      public deinstallProjectFeature(featureName:string, connection:string, syspw:string, projectName:string){
        return new Promise((resolve, reject)=>{
          var connectionWithUser="";
          var projectPath=ProjectManager.getInstance().getProject(projectName).getPath();
          var c:IConnectionProperties;
          syspw = syspw ? syspw : Environment.readConfigFrom(projectPath, "syspw");  
            if (ProjectManager.getInstance().getProject(projectName).getFeatures().has(featureName)){

              let feature:ProjectFeature=ProjectManager.getInstance().getProject(projectName).getFeatures().get(featureName)!;
              var deinstallSteps = FeatureManager.getDeinstallSteps(feature.getName());
              FeatureManager.unzipFeature(deinstallSteps, projectPath, feature)
                .then(()=>{
                  if (deinstallSteps.scripts){
                    for (var i=0; i<deinstallSteps.scripts.length; i++){
                      var argumentString="";
                      var argumentValues=[];

                      if (deinstallSteps.scripts[i].arguments){
                        for (var j=0; j<deinstallSteps.scripts[i].arguments.length; j++){
                          if (deinstallSteps.scripts[i].arguments[j] == 'credentials'){
                            argumentString = " " + feature.getUser().getName() + " ";
                            argumentString = argumentString+feature.getUser().getPassword();
                          }else if(deinstallSteps.scripts[i].arguments[j] == 'username'){
                            argumentString = " " + feature.getUser().getName(); 
                          }else{
                            argumentString = argumentString + " " + deinstallSteps.parameters[deinstallSteps.scripts[i].arguments[j]];
                          }
                        }
                      }

                      if (deinstallSteps.scripts[i].sys === true){
                        connectionWithUser="sys/" + syspw + "@" + connection + " AS SYSDBA";
                        c = DBHelper.getConnectionProps('sys',syspw,connection);
                      }else{
                        connectionWithUser=feature.getUser().getName() + "/" + feature.getUser().getPassword() + "@" + connection;
                        c = DBHelper.getConnectionProps(feature.getUser().getName(),feature.getUser().getPassword(),connection);
                      }

                      var executeString="";
                      if (fs.existsSync(projectPath + '/dependencies/' + feature.getName() + '_' + feature.getReleaseInformation() + '/' + deinstallSteps.scripts[i].path)){
                        executeString = projectPath + '/dependencies/' 
                                                    + feature.getName() 
                                                    + '_' 
                                                    + feature.getReleaseInformation() 
                                                    + '/' 
                                                    + deinstallSteps.scripts[i].path 
                                                    + argumentString;
                      }else{
                        if(fs.existsSync(__dirname + "/scripts/" + deinstallSteps.scripts[i].path)){
                          executeString=__dirname + "/scripts/" + deinstallSteps.scripts[i].path + argumentString;
                        }else{
                          throw Error("Script couldn't be found!");
                        }
                      }
                      console.log(executeString);
                      DBHelper.executeScript(c, executeString);
                    }
                    fs.removeSync(projectPath + '/dependencies/' + feature.getName() + '_' + feature.getReleaseInformation());
                  }else{
                    throw Error('Could not find installation information! Update your software.yml File!');
                  }
                })
                .finally(function(){
                  feature.setInstalled(false);
                  ProjectManager.getInstance().getProject(projectName).updateFeature(feature);
                   //TODO: Status-File Update
                  resolve();
                });
            }else{
              console.log(chalk.red('ERROR: Dependency missing! Execute ´xcl feature:add´ first!'));
              reject();
            }
        }); 
      }  

      public dropOwnerSchema(featureName:string, connection:string, syspw:string, projectName:string){
        return new Promise((resolve,reject)=>{
          var projectPath=ProjectManager.getInstance().getProject(projectName).getPath();
          const c:IConnectionProperties = DBHelper.getConnectionProps('sys',syspw,connection);
          if (ProjectManager.getInstance().getProject(projectName).getFeatures().has(featureName)){
            DBHelper.executeScript(c,`${__dirname}/scripts/drop_user.sql ${ProjectManager.getInstance().getProject(projectName).getFeatures().get(featureName)?.getUser().getName()}` );
            resolve();
          }else{
            reject();
          }
        });
      }

      private static unzipFeature(installSteps:any, projectPath:string, feature:ProjectFeature):Promise<any>{
        return new Promise<any>((resolve, reject)=>{
          if (installSteps && installSteps.installzip){
            var zip = new AdmZip(projectPath + '/dependencies/' + feature.getName() + '_' + feature.getReleaseInformation() + '.zip');
            zip.extractAllTo(projectPath + '/dependencies/');
            var zipEntries = zip.getEntries();
            var unzipped = zipEntries[0].entryName.toString();
            fs.renameSync(projectPath + '/dependencies/' + unzipped,
                          projectPath + '/dependencies/' + feature.getName().toLowerCase() + '_' + feature.getReleaseInformation() + '_tmp');
            var pathTmp = projectPath + '/dependencies/' + feature.getName().toLowerCase() + '_' + feature.getReleaseInformation() + '_tmp';
            
            zip = new AdmZip(pathTmp + '/' + installSteps.installzip[0].path + '/' + feature.getName().toLowerCase() + '_'+feature.getReleaseInformation() + '.zip');

            zip.extractAllTo(projectPath + '/dependencies/' + feature.getName().toLowerCase() + '_' + feature.getReleaseInformation() + '/');
            fs.removeSync(pathTmp);
          }else{
            var zip = new AdmZip(projectPath + '/dependencies/' + feature.getName() + '_' + feature.getReleaseInformation() + '.zip');
            zip.extractAllTo(projectPath+'/dependencies/');
            var zipEntries = zip.getEntries();
            var unzipped = zipEntries[0].entryName.toString();
            fs.renameSync(projectPath + '/dependencies/' + unzipped,
                          projectPath + '/dependencies/' + feature.getName().toLowerCase() + '_' + feature.getReleaseInformation());
          }
          resolve();
        });
      }

      private static getInstallSteps(featureName:string):any{
        if(FeatureManager.softwareJson.software[featureName]){
          return FeatureManager.softwareJson.software[featureName].install;
        }else{
          throw Error('Could not find install information! Please update your software.yml File!');
        }
      }

      private static getDeinstallSteps(featureName:string):any{
        if(FeatureManager.softwareJson.software[featureName]){
          return FeatureManager.softwareJson.software[featureName].uninstall;
        }else{
          throw Error('Could not find deinstall information! Please update your software.yml File!');
        }
      }

      public static priviledgedInstall(featureName:string):boolean{
        if(FeatureManager.softwareJson.software[featureName]){
          let installSteps = FeatureManager.softwareJson.software[featureName].install
          for (var i=0; i<installSteps.scripts.length; i++){
            if(installSteps.scripts[i].syspw){
              return true;
            }
          }
          return false;
        }else{
          throw Error('Could not find install information! Please update your software.yml File!');
        }
      }

      public static updateFeatureVersion(featureName:string, version:string, projectName:string, connection:string, syspw:string){
        return new Promise((resolve, reject)=>{
          if (ProjectManager.getInstance().getProject(projectName).getFeatures().has(featureName)){
            let feature = ProjectManager.getInstance().getProject(projectName).getFeatures().get(featureName);
            let newFeature = feature;
            newFeature?.setReleaseInformation(version);
            FeatureManager.getInstance().deinstallProjectFeature(featureName, connection, syspw, projectName)
              .then(function(){
                FeatureManager.getInstance().dropOwnerSchema(featureName, connection, syspw, projectName)
                  .then(function(){
                    FeatureManager.getInstance().removeFeatureFromProject(featureName, projectName)
                      .then(function(){
                        FeatureManager.getInstance().addFeatureToProject(featureName, version, projectName, newFeature?.getUser().getName()!, newFeature?.getUser().getPassword()!)
                          .then(function(){
                            FeatureManager.getInstance().installProjectFeature(featureName, connection, syspw, projectName)
                              .then(function(){
                                resolve();
                              })
                          })
                      })
                  })
              });
          }else{
            console.log(chalk.yellow(`WARNING: Feature ${featureName} was not added to the Project!`));
            console.log(chalk.blueBright(`INFO: xcl feature:add ${featureName} ${version} ${projectName}`));
            reject();
          }
        });
      }

      public removeFeatureFromProject(featureName:string, projectName:string){
        return new Promise((resolve, reject)=>{
          if(ProjectManager.getInstance().getProject(projectName).getFeatures().has(featureName)){
            ProjectManager.getInstance().getProject(projectName).removeFeature(ProjectManager.getInstance().getProject(projectName).getFeatures().get(featureName)!);
            console.log(chalk.green(`SUCCESS: Feature ${featureName} removed!`));
             //TODO: Status-File Update
            resolve();
          }else{
            console.log(chalk.yellow(`WARNING: Feature ${featureName} not in dependency list! Nothing removed!`));
            reject();
          }
        });
      }

      public getFeatureType(featureName:string){
        if(FeatureManager.features.has(featureName)){
          return FeatureManager.features.get(featureName)?.getType();
        }else{
         console.log(chalk.red("ERROR: Unkown Feature!")) 
        }
      }
}