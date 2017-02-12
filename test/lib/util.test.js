const _ = require('../../lib/util');

describe('util', () => {

  describe('#last', () => {

    it('should return the last item in the array', () => {
      const toTest = _.last([1, 2, 3]);
      assert.equal(toTest, 3);
    })

    it('should return defVal for empty', () => {
      const toTest = _.last(null, 1);
      assert.equal(toTest, 1)
    });

  })

  describe('lastWhere', () => {
    it('should return based on condition', () => {
      const toTest = _.lastWhere([1, 2, 3], x => x <= 2);
      assert.equal(toTest, 2);
    })

    it('should return null if none match', () => {
      const toTest = _.lastWhere([1, 2, 3], x => x === 4);
      assert.isNull(toTest);
    })
  })

  describe('#makeMap', () => {
    it('should work', () => {
      const toTest = _.makeMap(['a', 'b', 'c'], 1);
      assert.deepEqual(toTest, {
        a: 1,
        b: 1,
        c: 1
      })
    })
  })

  describe('#random', () => {
    it('should return a random between min and max', () => {
      const toTest = _.random(0, 5);
      assert.ok(toTest <= 5 && toTest >= 0);
    })
  })


})
