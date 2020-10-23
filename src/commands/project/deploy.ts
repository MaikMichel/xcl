import { Command, flags } from '@oclif/command'
import { ProjectManager } from '../../lib/ProjectManager'
import { FeatureManager } from '../../lib/FeatureManager'
import { Environment } from '../../lib/Environment'
import chalk from 'chalk'
import { cli } from 'cli-ux';

export default class ProjectDeploy extends Command {
  static description = 'deploy the project'

  static flags = {
    help: flags.help({char: 'h'}),
    connection: flags.string( {char: 'c', description:'connection string HOST:PORT/SERVICE_NAME', required: true, default: Environment.readConfigFrom(process.cwd(),"connection")}),
    password: flags.string( {char: 'p', description:'Password for Deployment User', required: true} ),
    dependencies: flags.boolean({char: 'd', description:'Deploy inclusive dependencies (you will be asked for sys-user password)'}),
    syspw: flags.string({char:'s', description:'Provide sys-password for silent mode dependency installation [IMPORTANT: All existing users will be overwritten!]'}),
    'schema-only': flags.boolean({description:'Deploys only schema objects', default: false})
  }

  static args = [{name: 'project', description: 'Name of the project that should be deployed', default: Environment.readConfigFrom(process.cwd(),"project")}]

  async run() {
    const {args, flags} = this.parse(ProjectDeploy);
    if (!args.project && ProjectManager.getInstance().getProjectNameByPath(process.cwd()) === 'all'){
      console.log(chalk.red('ERROR: You need to specify a project or be in a xcl-Project directory!'));
      console.log(chalk.blueBright('INFO: Try ´xcl project:list´ to get an overview of your projects!'));
    }else{

      if (!args.project){
        args.project=ProjectManager.getInstance().getProjectNameByPath(process.cwd());
      }

      if(ProjectManager.getInstance().getProject((args.project)).getDeployMethod()!==""){
        if (flags.dependencies && !flags.syspw){
          let syspw=await cli.prompt('sys', {type: 'hide'});
          await FeatureManager.getInstance().installAllProjectFeatures(args.project, flags.connection, syspw, false);
        }else{
          if (flags.dependencies){
            await FeatureManager.getInstance().installAllProjectFeatures(args.project, flags.connection, flags.syspw!, true);
          }
        }
        ProjectManager.getInstance().deploy(args.project, flags.connection, flags.password, flags["schema-only"]); 
       
      }else{
        console.log(chalk.red("ERROR: Deploy-Method undefined!"));
        console.log(chalk.yellow("INFO: xcl feature:list DEPLOY -a to get an overview about deployment methods"));
      }
    }
  }
}