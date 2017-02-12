/**
 * These defaults can be overridden by corresponding ENV variables
 */
const DEFAULTS = {
  ELECTION_TIMEOUT: 500,
  HEARTBEAT_INTERVAL: 30,
  DATA_DIRECTORY: './data'
};

module.exports = Object
  .keys(DEFAULTS)
  .reduce((acc, key) => {


    const defVal = DEFAULTS[key];
    let envVarVal = process.env[key];
    if (typeof defVal === 'number') {
      envVarVal = parseInt(envVarVal, 10);
    }

    acc[key] = envVarVal || defVal;
    return acc;
  }, {});
