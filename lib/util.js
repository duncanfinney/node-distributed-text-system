const crypto = require('crypto');

module.exports = {

  last(arr, defVal) {
    return (arr && arr[arr.length - 1]) || defVal;
  },

  makeMap(arr, defaultVal) {
    const toRet = {};
    arr.forEach(v => toRet[v] = defaultVal);
    return toRet;
  },

  random(min, max) {
    const range = max - min;
    return Math.floor(Math.random() * range) + min;
  },

  lastWhere(arr, condition) {
    const matching = arr.filter(x => condition(x));
    if (!matching.length) {
      return null;
    }
    return matching[matching.length - 1];
  },

  uniqueId(numBytes) {
    return crypto.randomBytes(numBytes).toString('hex');
  }
};
