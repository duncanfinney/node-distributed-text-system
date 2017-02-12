/**
 * CLI argument validation:
 */
const CONFIG_LOCATION = process.argv[2];
const PORT = parseInt(process.env.PORT, 10) || process.argv[3];

if (!CONFIG_LOCATION || !PORT) {
  console.error(`Usage: node --harmony index.js [CONFIG_FILE] [PORT]`);
  process.exit(1);
}

/**
 * Config file validation
 */
const fs = require('fs');
const path = require('path');
if (!fs.existsSync(CONFIG_LOCATION)) {
  console.error(`Error: configuration file "${CONFIG_LOCATION}" does not exit`);
  console.error(`Usage: node --harmony index.js [CONFIG_FILE] [PORT]`);
  process.exit(1);
}
if (fs.lstatSync(CONFIG_LOCATION).isDirectory()) {
  console.error(`Error: configuration file "${CONFIG_LOCATION}" is a directory not a file`);
  process.exit(1);
}

const config = require(path.resolve(CONFIG_LOCATION));
if (!config.mqttBrokerUrl || !config.initialTextLocation) {
  console.error(`Invalid config file. config.mqttBrokerUrl and initialTextLocation required`);
  process.exit(1);
}

let initialText;
try {
  initialText = fs.readFileSync(path.resolve(config.initialTextLocation), 'utf8');
} catch (err) {
  console.error(`Error reading initial text file "${config.initialTextLocation}"`);
}

/***
 * Start Server
 */
process.on('unhandledRejection', (error) => {
  throw error;
});
const MQTTClient = require('./raft/communication/MQTTClient');
const Raft = require('./raft/Raft');
const HttpServer = require('./http/http-serve');

const clientId = PORT;
const mqttClient = new MQTTClient({
  clientId,
  connectionString: config.mqttBrokerUrl
});

const raft = new Raft(mqttClient, clientId);
const httpServer = HttpServer(raft, PORT, initialText);
module.exports.raft = raft;
module.exports.httpServer = httpServer;
