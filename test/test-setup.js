global.assert = require('chai').assert;

if (!process.env.TEST_LOGGING) {
  require('../lib/debug').output(''); // the code coverage on this file was annoying me
  require('../lib/debug').output = line => {}
}
