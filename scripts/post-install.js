const fs = require('fs-extra');
const homedir = require('os').homedir();
const xclHome = homedir + '/AppData/Roaming/xcl';

if (!fs.existsSync(xclHome)) {
  fs.mkdirSync(xclHome);
}

fs.copySync('./scripts/artifacts/software.yml', xclHome + '/software.yml');
fs.closeSync(fs.openSync(xclHome + '/projects.yml', 'w'));
fs.closeSync(fs.openSync(xclHome + '/local.yml', 'w'));
