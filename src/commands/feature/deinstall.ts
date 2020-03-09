import {Command, flags} from '@oclif/command'
import { FeatureManager } from '../../lib/featureManager'

export default class FeatureDeinstall extends Command {
  static description = 'describe the command here'

  static flags = {
    help: flags.help({char: 'h'}),
    connection: flags.string( {char: 'c', required: true} ),
    syspw: flags.string( {char: 'p', required: true}),
    owner: flags.boolean ( {char: 'o', description: 'drop owner schema'} )
  }

  static args = [
        {
          name: 'feature',
          description: 'Name of the Project-Feature to be installed',
          required: true          
        },
        {
          name: 'project',
          description: 'name of the Project (when not in a xcl-Project path)'
        }
      ]

      
  async run() {
    const {args, flags} = this.parse(FeatureDeinstall)
    await FeatureManager.getInstance().deinstallProjectFeature(args.feature, flags.connection, flags.syspw ,args.project);
    if (flags.owner){
      FeatureManager.getInstance().dropOwnerSchema(args.feature, flags.connection, flags.syspw ,args.project);
    }
  }
}
