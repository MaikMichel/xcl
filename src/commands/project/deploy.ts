import { Command, flags } from '@oclif/command'
import { ProjectManager } from '../../lib/ProjectManager'
import chalk from 'chalk'
import { FeatureManager } from '../../lib/FeatureManager'
import { cli } from 'cli-ux';

export default class ProjectDeploy extends Command {
  static description = 'deploy the project'

  static flags = {
    help: flags.help({char: 'h'}),
    connection: flags.string( {char: 'c', description:'connection string HOST:PORT/SERVICE_NAME', required: true}),
    password: flags.string( {char: 'p', description:'Password for Deployment User', required: true} ),
    dependencies: flags.boolean({char: 'd', description:'Deploy inclusive dependencies (you will be asked for sys-user password)'}),
    silent: flags.string({char:'s', description:'Provide sys-password for silent mode dependency installation [IMPORTANT: All existing users will be overwritten!]'})
  }

  static args = [{name: 'project'}]

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
        if (flags.dependencies && !flags.silent){
          let syspw=await cli.prompt('sys', {type: 'hide'});
          await FeatureManager.getInstance().installAllProjectFeatures(args.project, flags.connection, syspw, false);
        }else{
          await FeatureManager.getInstance().installAllProjectFeatures(args.project, flags.connection, flags.silent!, true);
        }
        ProjectManager.getInstance().deploy(args.project, flags.connection, flags.password); 
       
      }else{
        console.log(chalk.red("ERROR: Deploy-Method undefined!"));
        console.log(chalk.yellow("INFO: xcl feature:list DEPLOY -a to get an overview about deployment methods"));
      }
    }
  }
}
