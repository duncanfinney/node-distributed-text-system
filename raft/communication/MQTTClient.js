const { EventEmitter } = require('events');
const mqtt = require('mqtt');
const debug = require('../../lib/debug').createLogger('mqtt', 'cyan');

class MQTTClient extends EventEmitter {

  constructor({ clientId, connectionString = 'mqtt://localhost' }) {
    super();
    if (!clientId) {
      throw new Error('clientId is required');
    }

    this.client = mqtt.connect(connectionString, {
      will: {
        topic: `nodes/${clientId}/status`,
        payload: 'offline',
        retain: true,
        qos: 2
      }
    });
    this.nodes = new Set();

    this.clientId = clientId;
    this._onConnect = this._onConnect.bind(this);
    this._onMessage = this._onMessage.bind(this);
    this.send = this.send.bind(this);
    this.dispose = this.dispose.bind(this);
    this.client.on('connect', this._onConnect);
    this.client.on('message', this._onMessage);
  }

  send(clientId, message) {
    if (!message || !message.type) {
      throw new Error('message.type undefined for message: ' + JSON.stringify(message));
    }
    const topic = `rpc/${clientId}`;
    message.from = this.clientId;
    message.to = clientId; //not really needed, but convenient
    if (message.from === message.to) {
      setImmediate(() => this.emit('message', message));
    } else {
      this.client.publish(topic, JSON.stringify(message));
    }
  }

  dispose() {
    if (this.isDisposed) {
      return;
    }
    this.isDisposed = true;

    return new Promise(resolve => {

      this.emit('dispose');
      this.removeAllListeners();

      //publish that we are leaving
      this.client.publish(`nodes/${this.clientId}/status`, 'offline', { qos: 2, retain: true }, () => {

        //and close the client
        this.client.end(resolve)

      });
    })
  }

  _onConnect() {
    this.client.publish(`nodes/${this.clientId}/status`, 'online', { retain: true, qos: 2 });
    this.client.subscribe(`nodes/#`);

    this.client.subscribe(`rpc/${this.clientId}`);
    this.client.subscribe(`rpc/broadcast`);
  }

  _onMessage(topic, rawMessage) {
    if (topic.startsWith('nodes/')) {
      this._handlePeerPresence(topic, rawMessage);
      return;
    }

    const message = JSON.parse(rawMessage);
    this.emit('message', message);
  }

  _handlePeerPresence(topic, rawMessage) {
    //peer bootstrapping
    const nodeName = topic.split('/')[1];
    if (rawMessage.toString() === 'online') {
      this.nodes.add(nodeName);
    } else {
      this.nodes.delete(nodeName);
    }
    this.emit('clusterMembership', [...this.nodes]);
  }

}

module.exports = MQTTClient;
