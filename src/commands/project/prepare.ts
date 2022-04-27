import {Command, Flags} from '@oclif/core'

export default class ProjectPrepare extends Command {
  static description = 'describe the command here'

  static flags = {
    help:  Flags.help({char: 'h'}),
    // flag with a value (-n, --name=VALUE)
    name:  Flags.string({char: 'n', description: 'name to print'}),
    // flag with no value (-f, --force)
    force: Flags.boolean({char: 'f'}),
  }

  static args = [{name: 'file'}]

  async run() {
    const {args, flags} = await this.parse(ProjectPrepare)

    const name = flags.name || 'world'
    this.log(`hello ${name} from C:\\Users\\mmi\\Projekte\\xcl\\src\\commands\\project\\prepare.ts`)
    if (args.file && flags.force) {
      this.log(`you input --force and --file: ${args.file}`)
    }
  }
}
