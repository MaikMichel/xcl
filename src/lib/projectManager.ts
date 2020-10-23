//Imports
import * as yaml from "yaml";
import * as fs from "fs-extra";
import * as os from "os";
import { Project } from "./Project";
import { ProjectNotFoundError } from "./errors/ProjectNotFoundError";
import chalk from 'chalk'
import { DBHelper, IConnectionProperties } from './DBHelper';
import cli from 'cli-ux'
import  { deliveryFactory }  from './DeliveryFactory';
import { DeliveryMethod } from './DeliveryMethod';
import { ProjectFeature } from './ProjectFeature';
import { Schema } from './Schema';
import { Environment } from './Environment';

const Table = require('cli-table')

//Implementation in Singleton-Pattern because there is no need for multiple instances of the ProjectManager!
export class ProjectManager {
  public static projectYMLfile: string = "projects.yml";

  private static manager: ProjectManager;
  private static xclHome = os.homedir + "/AppData/Roaming/xcl";
  // private static project: Project;
  private static projectsYaml: yaml.ast.Document;
  private static projectsJson: any;
  private static project: Project;

  private constructor() {
    // read projects
    ProjectManager.projectsYaml = yaml.parseDocument(fs.readFileSync(ProjectManager.xclHome + "/" + ProjectManager.projectYMLfile).toString());

    // convert to json of create an empty definition
    ProjectManager.projectsJson = ProjectManager.projectsYaml.toJSON() || { projects: {} };
    // what else belongs to PM?
  }

  /**
   * return Singelton-Instance of PM
   */
  static getInstance() {
    if (!ProjectManager.manager) {
      ProjectManager.manager = new ProjectManager();
    }
    return ProjectManager.manager;
  }

  /**
   * returns Project, when defined. Otherwise raises an exception
   *
   * @param projectName name of project
   */
  public getProject(projectName: string): Project {
    if(ProjectManager.project && ProjectManager.project.getName()==projectName){
      return ProjectManager.project;
    }else{
      if (ProjectManager.projectsJson.projects && ProjectManager.projectsJson.projects[projectName]) {
        let projectJSON = ProjectManager.projectsJson.projects[projectName];
        ProjectManager.project = new Project(projectName, projectJSON.path,'' , false);
        return ProjectManager.project;
      } else {
        throw new ProjectNotFoundError(`project ${projectName} not found`);
      }
    }
  }

  public getProjectNameByPath(projectPath: string):string{
    try {
      return new Project('',projectPath, '', false).getName();
    } catch (error) {
      return 'all';
    }

  }

  /**
   * return Project, when found otherwise creates it
   * @param projectName name of project
   */
  public createProject(projectName: string, workspaceName: string): Project {
    // check if not allready defined
    let project;
    try {
      project = this.getProject(projectName);
      console.log(projectName + " allready created. Look @: " + project.getPath());
    } catch (err) {
      if (err instanceof ProjectNotFoundError) {
        // start to create the project
        console.log(projectName + " is to be created in: " + process.cwd());
        project = new Project(projectName, process.cwd() + "/" + projectName, workspaceName, true);

        this.addProjectToGlobalConfig(project);
      } else {
        // undefined error. what happened?
        throw err;
      }
    }

    return project;
  }

  private addProjectToGlobalConfig(project: Project) {
    ProjectManager.projectsJson.projects[project.getName()] = project.toJSON();
    fs.writeFileSync(ProjectManager.xclHome + "/" + ProjectManager.projectYMLfile, yaml.stringify(ProjectManager.projectsJson));
  }


  public removeProject(projectName: string, path: boolean, database: boolean, connection:string, syspw:string) {
    // check if not allready defined
    let project;
    try {
      project = this.getProject(projectName);

      if(database){// remove from db?
        if (connection && syspw){
          const c:IConnectionProperties = DBHelper.getConnectionProps('sys',syspw,connection);
          DBHelper.executeScript(c, __dirname + '/scripts/drop_xcl_users.sql ' + project.getName() + '_data ' +
                                                                               project.getName() + '_logic ' +
                                                                               project.getName() + '_app ' +
                                                                               project.getName() + '_depl');
        }else{
          console.log(chalk.red("ERROR: You need to provide a connection-String and the sys-user password"));
          console.log(chalk.yellow("INFO: xcl project:remove -h to see command options"));
          throw new Error("Could not remove project due to missing information");
        }
      }
      // remove from
      this.removeProjectFromGlobalConfig(project);

      // todo remove from path?
      if (path) {
        fs.removeSync(project.getPath());
        console.log(`Path ${project.getPath()} removed`);
      }

    } catch (err) {
      // undefined error. what happened?
      throw err;
    }
  }

  private removeProjectFromGlobalConfig(project: Project) {
    delete ProjectManager.projectsJson.projects[project.getName()];
    fs.writeFileSync(ProjectManager.xclHome + "/" + ProjectManager.projectYMLfile, yaml.stringify(ProjectManager.projectsJson));
    console.log(`Project ${project.getName()} removed`);
  }

  public getProjects():Project[] {

    let projects:Project[] = [];

    Object.keys(ProjectManager.projectsJson.projects).forEach(function(projectName) {
      let projectJSON = ProjectManager.projectsJson.projects[projectName];
      projects.push(new Project(projectName, projectJSON.path,'', false));
    });

    return projects;
  }

  public listProjects() {
    const table = new Table({
      head: [
        chalk.blueBright('name'),
        chalk.blueBright('path'),
        chalk.redBright('status')
      ]
    });

    const projects:Project[] = ProjectManager.getInstance().getProjects();
    for (let i = 0; i < projects.length; i++) {
      const project = projects[i];
      var status = project.getErrorText();
      table.push([ project.getName(), project.getPath(), status ? chalk.red(status) : chalk.green('VALID') ]);
    }

    console.log(table.toString());
  }

  public async initializeProject(projectName: string, flags: { help: void; password: string | undefined; connect: string | undefined; force: boolean; yes: boolean}) {
    const p:Project = this.getProject(projectName);
    const c:IConnectionProperties = DBHelper.getConnectionProps('sys', flags.password, flags.connect);    

    // Prüfen ober es den User schon gibt
    if (await DBHelper.isProjectInstalled(p, c)) {
      if ( !flags.force) {
        console.log(chalk.yellow(`Warning: ProjectSchemas already exists in db!!!`));
        console.log(chalk.yellow(`If you wish to drop users before, you could use force flag`));
        return;
      } else { 
        if (flags.force && !flags.yes) {
          const confirmYN = await cli.confirm(chalk.green(`Force option detected, schema will be dropped. Continue Y/N`));
          
          if (!confirmYN) {
            console.log(chalk.yellow(`Project initialization canceled`));          
            return;
          }
        }
        
        console.log(chalk.yellow(`Dropping existing schemas`));
        DBHelper.executeScript(c, __dirname + '/scripts/drop_xcl_users.sql ' + p.getName() + '_data ' +
                                                                           p.getName() + '_logic ' +
                                                                           p.getName() + '_app ' +
                                                                           p.getName() + '_depl');
      }
    }

    console.log(chalk.green(`OK, Schemas werden installiert`));
    DBHelper.executeScript(c, __dirname + '/scripts/create_xcl_users.sql ' + p.getName() + '_depl ' +
                                                                           p.getName() + ' ' +  //TODO: Generate strong password!
                                                                           p.getName() + '_data ' +
                                                                           p.getName() + '_logic ' +
                                                                           p.getName() + '_app');

    if (await DBHelper.isProjectInstalled(p, c)) {
      console.log(chalk.green(`Project successfully installed`));
    }

    // TODO: Abfrage nach syspwd?

    // Indextablespace auslagern
    // > data user bekommt das recht tablespaces anzulegen. hier muss ggf. auch das Rech weitergegegen werden

    
    // durch features loopen und deren install methode aufrufen

    // user erstellen

    // app erstellen
  }

  public async build(projectName: string, version:string){
    
    let  p:Project = this.getProject(projectName);
    p.getFeatures().forEach((feature:ProjectFeature, key:String)=>{
      if(feature.getType()==="DB" && !p.getStatus().checkDependency(feature)){
        console.log(chalk.green('+')+' install '+feature.getName());
        console.log(chalk.green('+++')+' xcl feature:install ' + feature.getName() + ' --connection=' + Environment.readConfigFrom(process.cwd(),"connection") + ' --syspw=#SYSPW#')
      }
    });

    if(!p.getStatus().checkUsers()){
      p.getUsers().forEach((user:Schema, key:String)=>{
          console.log(chalk.green('+') + ' create user '+key);
      });
    }
    
    //deliveryFactory.getNamed<DeliveryMethod>("Method",this.getProject(projectName).getDeployMethod().toUpperCase()).build(projectName,version);
  }

  public async deploy(projectName: string, connection:string, password:string, schemaOnly: boolean){
    deliveryFactory.getNamed<DeliveryMethod>("Method",this.getProject(projectName).getDeployMethod().toUpperCase()).deploy(projectName,connection, password, schemaOnly);
  }

}
