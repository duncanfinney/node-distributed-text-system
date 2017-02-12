const debug = require('../../lib/debug');
describe('debug', () => {

  it('should log Sets', () => {
    //Arrange
    debug.output = log;
    const logger = debug.createLogger('test', 'red');

    //Act
    logger.log(new Set([1,2,3]));

    //Assert
    function log(line) {
      assert.ok(line.includes('Set{[1,2,3]}'));
    }
  });

  it('should log Maps', () => {
    //Arrange
    debug.output = log;
    const logger = debug.createLogger('test', 'red');

    //Act
    const map = new Map();
    map.set('foo', 'bar');
    logger.log(map);

    //Assert
    function log(line) {
      assert.equal(line.split('|')[2], 'Map{[["foo","bar"]]}');
    }
  });

  it('should handle null', () => {
    debug.output = log;
    const logger = debug.createLogger('test', 'red');

    //Act
    logger.log(null);

    //Assert
    function log(line) {
      assert.equal(line.split('|')[2], 'null');
    }
  })

  it('should handle Arrays', () => {
    debug.output = log;
    const logger = debug.createLogger('test', 'red');

    //Act
    logger.log([1,2]);

    //Assert
    function log(line) {
      assert.equal(line.split('|')[2], '[1,2]');
    }
  })

});
