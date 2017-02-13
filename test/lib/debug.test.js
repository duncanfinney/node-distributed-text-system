const debug = require('../../lib/debug');
describe('debug', () => {

  it('should log Sets', () => {
    //arrange
    debug.output = log;
    const logger = debug.createLogger('test', 'red');

    //act
    logger.log(new Set([1,2,3]));

    //assert
    function log(line) {
      assert.ok(line.includes('Set{[1,2,3]}'));
    }
  });

  it('should log Maps', () => {
    //arrange
    debug.output = log;
    const logger = debug.createLogger('test', 'red');

    //act
    const map = new Map();
    map.set('foo', 'bar');
    logger.log(map);

    //assert
    function log(line) {
      assert.equal(line.split('|')[2], 'Map{[["foo","bar"]]}');
    }
  });

  it('should handle null', () => {
    //arrange
    debug.output = log;
    const logger = debug.createLogger('test', 'red');

    //act
    logger.log(null);

    //assert
    function log(line) {
      assert.equal(line.split('|')[2], 'null');
    }
  });

  it('should handle Arrays', () => {
    //arrange
    debug.output = log;
    const logger = debug.createLogger('test', 'red');

    //act
    logger.log([1,2]);

    //assert
    function log(line) {
      assert.equal(line.split('|')[2], '[1,2]');
    }
  });

});
