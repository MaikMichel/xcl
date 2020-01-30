xcl
===

APEX commandline Utility

[![oclif](https://img.shields.io/badge/cli-oclif-brightgreen.svg)](https://oclif.io)
[![Version](https://img.shields.io/npm/v/xcl.svg)](https://npmjs.org/package/xcl)
[![Downloads/week](https://img.shields.io/npm/dw/xcl.svg)](https://npmjs.org/package/xcl)
[![License](https://img.shields.io/npm/l/xcl.svg)](https://github.com/MaikMichel/xcl/blob/master/package.json)

<!-- toc -->
* [Usage](#usage)
* [Commands](#commands)
<!-- tocstop -->
# Usage
<!-- usage -->
```sh-session
$ npm install -g xcl
$ xcl COMMAND
running command...
$ xcl (-v|--version|version)
xcl/0.0.0 win32-x64 node-v13.3.0
$ xcl --help [COMMAND]
USAGE
  $ xcl COMMAND
...
```
<!-- usagestop -->
# Commands
<!-- commands -->
* [`xcl feature:list [FILE]`](#xcl-featurelist-file)
* [`xcl feature:versions [FILE]`](#xcl-featureversions-file)
* [`xcl hello [FILE]`](#xcl-hello-file)
* [`xcl help [COMMAND]`](#xcl-help-command)
* [`xcl project:create PROJECT`](#xcl-projectcreate-project)
* [`xcl project:list [FILE]`](#xcl-projectlist-file)

## `xcl feature:list [FILE]`

lists all available Features

```
USAGE
  $ xcl feature:list [FILE]

OPTIONS
  -h, --help  show CLI help
```

_See code: [src\commands\feature\list.ts](https://github.com/MaikMichel/xcl/blob/v0.0.0/src\commands\feature\list.ts)_

## `xcl feature:versions [FILE]`

describe the command here

```
USAGE
  $ xcl feature:versions [FILE]

OPTIONS
  -f, --force
  -h, --help       show CLI help
  -n, --name=name  name to print
```

_See code: [src\commands\feature\versions.ts](https://github.com/MaikMichel/xcl/blob/v0.0.0/src\commands\feature\versions.ts)_

## `xcl hello [FILE]`

describe the command here

```
USAGE
  $ xcl hello [FILE]

OPTIONS
  -f, --force
  -h, --help       show CLI help
  -n, --name=name  name to print

EXAMPLE
  $ xcl hello
  hello world from ./src/hello.ts!
```

_See code: [src\commands\hello.ts](https://github.com/MaikMichel/xcl/blob/v0.0.0/src\commands\hello.ts)_

## `xcl help [COMMAND]`

display help for xcl

```
USAGE
  $ xcl help [COMMAND]

ARGUMENTS
  COMMAND  command to show help for

OPTIONS
  --all  see all commands in CLI
```

_See code: [@oclif/plugin-help](https://github.com/oclif/plugin-help/blob/v2.2.3/src\commands\help.ts)_

## `xcl project:create PROJECT`

create, list or remove a project

```
USAGE
  $ xcl project:create PROJECT

ARGUMENTS
  PROJECT  name of the project to create

OPTIONS
  -h, --help  show CLI help
```

_See code: [src\commands\project\create.ts](https://github.com/MaikMichel/xcl/blob/v0.0.0/src\commands\project\create.ts)_

## `xcl project:list [FILE]`

lists all known xcl projects

```
USAGE
  $ xcl project:list [FILE]

OPTIONS
  -h, --help  show CLI help
```

_See code: [src\commands\project\list.ts](https://github.com/MaikMichel/xcl/blob/v0.0.0/src\commands\project\list.ts)_
<!-- commandsstop -->
