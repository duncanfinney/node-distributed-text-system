const debug = require('../lib/debug').createLogger('save', 'green');
const fs = require('fs');
const path = require('path');
const config = require('./config');

module.exports = obj => {

  const { id } = obj;
  const persistPath = path.join(config.DATA_DIRECTORY, id + '.state');

  obj.saveToDisk = () => new Promise((resolve, reject) => {
    const { currentTerm, votedFor, log } = obj;
    const toSave = { currentTerm, votedFor, log };
    fs.writeFile(persistPath, JSON.stringify(toSave, null, '  '), (err) => {
      if (err) {
        debug.log('save error:', err);
        reject(err);
        return;
      }
      debug.log('saved state to ' + persistPath);
      resolve();
    })
  });

  obj.loadFromDisk = () => {
    debug.log('attempting to load state from ', persistPath);
    if (fs.existsSync(persistPath)) {
      try {
        const contents = fs.readFileSync(persistPath, { encoding: 'utf8' })
        const fromDisk = JSON.parse(contents);
        debug.log('successfully loaded from disk');
        Object.assign(obj, fromDisk);
      } catch (err) {
        debug.log('CORRUPTED STATE FILE: ' + persistPath);
      }

    }
  };

  return obj;
};
