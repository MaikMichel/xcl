import {Command, Flags} from '@oclif/core'
import {FeatureManager} from '../../lib/FeatureManager'
import  Table from 'cli-table3'
import chalk from 'chalk'

export default class FeatureVersions extends Command {
  static description = 'lists all available Releases of the Feature'

  static flags = {
    help: Flags.help({char: 'h'}),
  }

  static args = [{
                  name: 'feature',
                  description: 'name of the feature',
                  required: true
                }];

  async run() {
    const {args, flags} = await this.parse(FeatureVersions)
    const table = new Table({
      head: [        
        chalk.blueBright(args.feature)
      ]
    });

    let versions:string[] = await (await FeatureManager.getInstance().getFeatureReleases(args.feature));
    for (let i=0; i<versions.length; i++){
      table.push([versions[i]]);
    }

    console.log(table.toString());
  }
}
