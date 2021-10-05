import {Command, flags} from '@oclif/command'
import { Environment } from '../../lib/Environment'
// import {ProjectManager} from '../../lib/ProjectManager'
import chalk from 'chalk';
import * as fs from "fs-extra";
import * as yaml from "yaml";
import inquirer = require("inquirer");
import { ProjectManager } from '../../lib/ProjectManager';

export default class ProjectCreate extends Command {
  static description = 'creates a project (folder and structure)'

  static flags = {
    help: flags.help({char: 'h'}),
    workspace: flags.string({char: 'w',
                             description: 'workspace name the application should be installed in'
                             ,default: Environment.readConfigFrom(process.cwd(),'project', false)
                            }),
    "single-schema" : flags.boolean ({description: 'one schema instead of three, no deployment user'}),
    "wizard" : flags.boolean ({description: 'kommt noch'})
  }

  static args = [
                  {
                    name: 'project',
                    description: 'name of the project to create',
                    required: false
                  }
                ]

  async run() {
    const {args, flags} = this.parse(ProjectCreate)

    // BUG: Wenn kein Projektname angegeben wird und das Flag falsch geschrieben wird,
    //      wird das Flag zum Projektnamen

    if (flags.wizard) {
      await doTheWizard(args.project)
    } else {
      if (!args.project) {
       console.error(chalk.red('ERROR: Missing project name'));
      }
      else {
        if(flags.workspace){
          ProjectManager.getInstance().createProject(args.project, flags.workspace, flags['single-schema']);
        } else {
          ProjectManager.getInstance().createProject(args.project, args.project, flags['single-schema']);
        }
      }
    }
  }
}

async function doTheWizard(projectName:string | undefined) {
  // read project and env to show current values
  let prj:any = fs.existsSync("xcl.yml") ? yaml.parse(fs.readFileSync("xcl.yml").toString()) : { xcl: {project: projectName} };
  let env:any = fs.existsSync(".xcl/env.yml") ? yaml.parse(fs.readFileSync(".xcl/env.yml").toString()) : { };

  await inquirer.prompt([{
      name: 'project',
      message: `Please give a project name`,
      type: 'input',
      default: prj.xcl.project
    },
    {
      name: 'multi',
      message: `Would you like to have a single or multi scheme app`,
      type: 'list',
      choices: ['Multi', 'Single'],
      default: toInitCapProjectType(prj.xcl.mode as string)
    },
    {
      name: 'workspace',
      message: `Enter workspace name`,
      type: 'input',
      default: prj.xcl.workspace || prj.xcl.project
    },
    {
      name: 'connection',
      message: `Enter database connections`,
      type: 'input',
      default: env.connection || 'localhost:1521/xepdb1'
    },
    {
      name: 'password',
      message: `Enter password for deployment user (Multi) or app user (Single)`,
      type: 'password'
    },
    {
      name: 'adminpass',
      message: `Enter password for admin user. Leave blank and you will be prompted when needed`,
      type: 'password'
    },
    {
      name: 'apexuser',
      message: `Enter APEX-Schema name`,
      type: 'input',
      default: env.schema || 'APEX_210100'
    },
    ],
  ).then((answer) => {
    console.log('responses', answer);
    ProjectManager.getInstance().createProjectFromConfig(answer);
  });
}

function toInitCapProjectType(pString:string):string {
  return pString ? pString[0].toUpperCase() + pString.slice(1) : "Multi";
}

export interface ProjectWizardConfiguration {
  project:    string;
  multi:      string;
  workspace:  string;
  connection: string;
  password:   string;
  adminpass:  string;
  apexuser:   string;
}