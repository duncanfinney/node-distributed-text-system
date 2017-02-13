const Promise = require('bluebird');
const MQTTClient = require('../../raft/communication/MQTTClient');
const Raft = require('../../raft/raft');
const RaftCommands = require('../../raft/raft-commands');
const _ = require('lodash');
const debug = require('../../lib/debug').createLogger('test', 'red');
const config = require('../../raft/config');

describe('Raft', () => {

  let cluster;
  let conn;
  beforeEach(async() => {
    cluster = await makeRaftCluster(3);
    conn = await getTestMqttClient();
  });

  afterEach(async() => {
    await cluster.dispose();
    await conn.dispose();
  });

  describe('#handleRequestVote', () => {

    it('leader should step down if behind', async() => {
      //arrange
      const { node1 } = cluster;
      node1._becomeLeader();
      assert.equal(node1.state.term, 1); //redundant, but for clarity

      //act
      node1.onMessage({
        type: RaftCommands.RequestVote,
        term: 2,
        success: false,
        from: 'test'
      });

      //assert
      assert.equal(node1.state.state, 'follower', 'node should become a follower');

    });

    it('1. should return false if term < currentTerm', async() => {
      //arrange
      const { node0 } = cluster;
      node0.state.term = 4;

      //act
      node0.onMessage({
        type: RaftCommands.RequestVote,
        term: 3,
        from: 'test'
      });

      //assert
      const message = await conn.getNextMessage('RequestVoteReply');
      assert.deepEqual(message, {
        type: 'RequestVoteReply',
        voteGranted: false,
        to: 'test',
        from: 'node0',
        term: 4
      });
    });

    it('2a. If candidate’s log term > our term, grant vote', async() => {
      //arrange
      const { node0, node1, node2 } = cluster;
      await node1.dispose();
      await node2.dispose();
      node0.peers = ['node0', 'test'];
      node0.state.term = 4;

      //act
      node0.onMessage({
        type: RaftCommands.RequestVote,
        term: 5,
        from: 'test',
      });

      //assert
      const message = await conn.getNextMessage('RequestVoteReply');
      assert.deepEqual(message, {
        type: 'RequestVoteReply',
        voteGranted: true,
        term: 5,
        to: 'test',
        from: 'node0'
      });

    });

    it('2b. If candidate’s log term = our term and up to date, grant vote', async() => {
      //arrange
      const { node0, node1, node2 } = cluster;
      await node1.dispose();
      await node2.dispose();
      node0.state.term = 5;
      node0.state.log = [
        { index: 0, term: 4 }
      ];
      node0.state.votedFor = null;

      //act
      node0.onMessage({
        type: RaftCommands.RequestVote,
        term: 5,
        lastLogIndex: 4,
        lastLogTerm: 5,
        from: 'test'
      });

      //assert
      const message = await conn.getNextMessage('RequestVoteReply');

      assert.deepEqual(message, {
        type: 'RequestVoteReply',
        voteGranted: true,
        to: 'test',
        from: 'node0',
        term: 5
      });

    });

  });

  describe('#handleRequestVoteReply', () => {

    it('leader should step down if behind', async() => {
      //arrange
      const { node1 } = cluster;
      node1._becomeLeader();
      assert.equal(node1.state.term, 1); //redundant, but for clarity

      //act
      node1.onMessage({
        type: RaftCommands.RequestVoteReply,
        term: 2,
        success: false,
        from: 'test'
      });

      //assert
      assert.equal(node1.state.state, 'follower', 'node should become a follower');

    });

    it('should set voteGranted based on reply', async() => {
      //arrange
      const { node1 } = cluster;
      node1._beginElection();
      assert.equal(node1.state.state, 'candidate');

      //act
      node1.onMessage({
        type: RaftCommands.RequestVoteReply,
        voteGranted: true,
        term: 2,
        from: 'test'
      });

      //assert
      assert.equal(node1.state.voteGranted['test'], true);

    });

    it('should become leader if we get a quorum of votes', async() => {
      //arrange
      const { node1 } = cluster;
      node1.state.peers = ['node1', 'test'];
      node1._beginElection();

      //act
      node1.onMessage({
        type: RaftCommands.RequestVoteReply,
        voteGranted: true,
        term: 2,
        from: 'test'
      });

      //assert
      assert.equal(node1.state.state, 'leader');

    });

    it('should not become leader unless it has a quorum', async() => {
      //arrange
      const { node1 } = cluster;
      node1.state.peers = ['node1', 'test', 'nonexistient', 'dead', 'more nodes', 'wontgetquorum'];
      node1._beginElection();

      //act
      node1.onMessage({
        type: RaftCommands.RequestVoteReply,
        voteGranted: true,
        term: 2,
        from: 'test'
      });

      //assert
      assert.equal(node1.state.state, 'candidate');

    });

  });

  describe('#handleAppendEntries', () => {

    it('leader should step down if behind', async() => {
      //arrange
      const { node1 } = cluster;
      node1._becomeLeader();
      assert.equal(node1.state.term, 1); //redundant, but for clarity

      //act
      node1.onMessage({
        type: RaftCommands.AppendEntries,
        term: 2,
        success: false,
        from: 'test'
      });

      //assert
      assert.equal(node1.state.state, 'follower', 'node should become a follower');

    });

    it('1. return false if term < currentTerm', async() => {
      //arrange
      const { node1 } = cluster;

      //act
      node1.onMessage({
        type: RaftCommands.AppendEntries,
        term: -1,
        leaderId: 'test',
        prevLogIndex: 0,
        prevLogTerm: 1,
        entries: [],
        from: 'test'
      });

      //assert
      const message = await conn.getNextMessage(RaftCommands.AppendEntriesReply);
      assert.isFalse(message.success);

    });

    it('2. Reply false if log doesn’t contain an entry at prevLogIndex whose term matches prevLogTerm (§5.3)', async() => {
      //arrange
      const { node1 } = cluster;
      node1.state.term = 3;
      node1.state.log = [
        { index: 0, term: 1 },
        { index: 1, term: 1 },
        { index: 2, term: 2 },
        { index: 3, term: 3 },
      ];

      //act
      node1.onMessage({
        type: RaftCommands.AppendEntries,
        term: 4,
        prevLogIndex: 3,
        prevLogTerm: 4,
        entries: [],
        from: 'test'
      });

      //assert
      const message = await conn.getNextMessage('AppendEntriesReply');
      assert.deepEqual(message, {
        type: RaftCommands.AppendEntriesReply,
        term: 4,
        success: false,
        lastLogIndex: 3,
        from: 'node1',
        to: 'test'
      });

    });

    it('3. If an existing entry conflicts with a new one (same index but different terms), delete the existing entry and all that follow it (§5.3)', async() => {
      //arrange
      const { node1 } = cluster;
      node1.state.term = 3;
      node1.state.log = [
        { index: 0, term: 1 },
        { index: 1, term: 1 },
        { index: 2, term: 2 },
        { index: 3, term: 3 },
        { index: 4, term: 3 },
        { index: 5, term: 3 },
        { index: 6, term: 3 },
        { index: 7, term: 3 },
        { index: 8, term: 3 },
        { index: 9, term: 3 },
        { index: 10, term: 3 },
        { index: 11, term: 3 },
      ];

      //act
      node1.onMessage({
        type: RaftCommands.AppendEntries,
        term: 3,
        prevLogIndex: 1,
        prevLogTerm: 1,
        entries: [
          { index: 3, term: 4 },
          { index: 4, term: 4 },
        ],
        from: 'test'
      });

      //assert
      const message = await conn.getNextMessage('AppendEntriesReply');
      assert.deepEqual(message, {
        type: RaftCommands.AppendEntriesReply,
        term: 3,
        success: true,
        lastLogIndex: 4,
        from: 'node1',
        to: 'test'
      });

      assert.deepEqual(node1.state.log, [
        { index: 0, term: 1 },
        { index: 1, term: 1 },
        { index: 2, term: 2 },
        { index: 3, term: 4 },
        { index: 4, term: 4 }
      ]);

    });

    it('4. Append any new entries not already in the log', async() => {
      //arrange
      const { node1 } = cluster;
      node1.state.term = 3;
      node1.state.log = [
        { index: 0, term: 1 },
        { index: 1, term: 1 },
        { index: 2, term: 2 },
        { index: 3, term: 3 }
      ];

      //act
      node1.onMessage({
        type: RaftCommands.AppendEntries,
        term: 3,
        prevLogIndex: 1,
        prevLogTerm: 1,
        entries: [
          { index: 3, term: 4 },
          { index: 4, term: 4 },
        ],
        from: 'test'
      });

      //assert
      const message = await conn.getNextMessage('AppendEntriesReply');
      assert.deepEqual(message, {
        type: RaftCommands.AppendEntriesReply,
        term: 3,
        success: true,
        lastLogIndex: 4,
        from: 'node1',
        to: 'test'
      });

      assert.deepEqual(node1.state.log, [
        { index: 0, term: 1 },
        { index: 1, term: 1 },
        { index: 2, term: 2 },
        { index: 3, term: 4 },
        { index: 4, term: 4 }
      ]);
    });

    it('5. If leaderCommit > commitIndex, set commitIndex = min(leaderCommit, index of last new entry)', async() => {
      //arrange
      const { node1 } = cluster;
      node1.state.term = 3;
      node1.state.log = [
        { index: 0, term: 1 },
        { index: 1, term: 1 },
        { index: 2, term: 2 },
        { index: 3, term: 3 }
      ];

      //act
      node1.onMessage({
        type: RaftCommands.AppendEntries,
        term: 3,
        prevLogIndex: 1,
        prevLogTerm: 1,
        entries: [
          { index: 3, term: 4 },
          { index: 4, term: 4 },
        ],
        leaderCommit: 4,
        from: 'test'
      });

      //assert
      const message = await conn.getNextMessage('AppendEntriesReply');
      assert.deepEqual(message, {
        type: RaftCommands.AppendEntriesReply,
        term: 3,
        success: true,
        lastLogIndex: 4,
        from: 'node1',
        to: 'test'
      });

      assert.deepEqual(node1.state.log, [
        { index: 0, term: 1 },
        { index: 1, term: 1 },
        { index: 2, term: 2 },
        { index: 3, term: 4 },
        { index: 4, term: 4 }
      ]);
    });

  });

  describe('#_handleAppendEntriesReply', () => {

    it('leader should step down if behind', async() => {
      //arrange
      const { node1 } = cluster;
      node1._becomeLeader();
      assert.equal(node1.state.term, 1); //redundant, but for clarity

      //act
      node1.onMessage({
        type: RaftCommands.AppendEntriesReply,
        term: 2,
        success: false,
        from: 'test'
      });

      //assert
      assert.equal(node1.state.state, 'follower', 'node should become a follower');

    });

    it('on success, update nextIndex and matchIndex for the cluster', async() => {
      //arrange
      const { node1 } = cluster;
      node1.state.state = 'leader';
      node1.state.term = 3;
      node1.state.log = [
        { index: 0, term: 1 },
        { index: 1, term: 1 },
        { index: 2, term: 2 },
        { index: 3, term: 3 },
        { index: 4, term: 3 },
        { index: 5, term: 3 },
        { index: 6, term: 3 },
        { index: 7, term: 3 },
        { index: 8, term: 3 },
        { index: 9, term: 3 },
        { index: 10, term: 3 },
        { index: 11, term: 3 },
      ];

      //act
      node1.onMessage({
        type: RaftCommands.AppendEntriesReply,
        term: 3,
        success: true,
        lastLogIndex: 5,
        from: 'test'
      });

      //assert
      assert.deepEqual(node1.state.matchIndex, { test: 5 });
      assert.deepEqual(node1.state.nextIndex, { test: 6 });

    });

    it('on failure, decrement nextIndex and retry', async() => {
      //arrange
      const { node1 } = cluster;
      node1.state.state = 'leader';
      node1.state.term = 3;
      node1.state.log = [
        { index: 0, term: 1 },
        { index: 1, term: 1 },
        { index: 2, term: 2 },
        { index: 3, term: 3 },
        { index: 4, term: 3 },
        { index: 5, term: 3 },
        { index: 6, term: 3 },
        { index: 7, term: 3 },
        { index: 8, term: 3 },
        { index: 9, term: 3 },
        { index: 10, term: 3 },
        { index: 11, term: 3 },
      ];
      node1.state.matchIndex = { test: 5 };
      node1.state.nextIndex = { test: 11 };

      //act
      node1.onMessage({
        type: RaftCommands.AppendEntriesReply,
        term: 3,
        success: false,
        lastLogIndex: 5,
        from: 'test'
      });

      //assert
      assert.deepEqual(node1.state.matchIndex, { test: 5 });
      assert.deepEqual(node1.state.nextIndex.test, 10);
    });

    it('if a quorum has committed, advance commitIndex', async() => {
      //arrange
      const { node1 } = cluster;
      node1.state.state = 'leader';
      node1.state.term = 3;
      node1.state.log = [
        { index: 0, term: 1 },
        { index: 1, term: 1 },
        { index: 2, term: 2 },
        { index: 3, term: 3 },
        { index: 4, term: 3 },
        { index: 5, term: 3 },
        { index: 6, term: 3 },
        { index: 7, term: 3 },
        { index: 8, term: 3 },
        { index: 9, term: 3 },
        { index: 10, term: 3 },
        { index: 11, term: 3 },
      ];
      node1.state.peers = ['test', 'node0', 'node1', 'node2', 'node3']
      node1.state.matchIndex = {
        test: 0,
        node0: 0,
        node1: 0,
        node2: 10,
        node3: 0
      };

      //act
      node1.onMessage({
        type: RaftCommands.AppendEntriesReply,
        term: 3,
        success: true,
        lastLogIndex: 4,
        from: 'test'
      });

      //assert
      assert.equal(node1.state.commitIndex, 4, 'should move up commitIndex');

    });

  });

  describe('#append', () => {

    it('should forward RPCs to the leader', async() => {
      //arrange
      const { node0, node1, node2 } = cluster;
      await node1.dispose();
      await node2.dispose();
      node0.state.lastKnownLeaderId = 'test';

      //act
      node0.append({ text: 'new data for the commit log' });

      //assert
      const message = await conn.getNextMessage(RaftCommands.AppendRPC);
      assert.deepEqual(message, {
        type: RaftCommands.AppendRPC,
        data: { text: 'new data for the commit log' },
        from: 'node0',
        to: 'test'
      })

    });

  });

});

/**
 * Initiates a cluster of n
 * @param numNodes number of nodes to make
 * @returns Object
 */
async function makeRaftCluster(numNodes) {
  debug.log(`making ${numNodes} node cluster`);
  const cluster = {};
  const clientIds = [];
  _.times(numNodes, i => {
    const clientId = 'node' + i;
    clientIds.push(clientId);
    const mqttClient = new MQTTClient({
      clientId
    });
    cluster[clientId] = new Raft(mqttClient, clientId);
  });
  clientIds.forEach(p => {
    cluster[p].state.peers = [...clientIds];
  });

  cluster.dispose = () => Promise
    .all(clientIds.map(p => cluster[p].dispose()))
    .then(() => debug.log(`tore down ${numNodes} node cluster`));

  return cluster;
}

/**
 * creates an enriched MQTTClient instance with #getNextMessage(type) function
 */
function getTestMqttClient() {
  const conn = new MQTTClient({ clientId: 'test' });
  let replies = [];
  conn.on('message', msg => replies.push(msg));
  conn.getNextMessage = async type => {
    const idx = _.findIndex(replies, { type });
    if (idx !== -1) {
      console.log("pulling");
      return _.pullAt(replies, idx)[0];
    }

    return new Promise(resolve => {

      const onMessage = message => {
        if (message.type === type) {
          conn.removeListener('message', onMessage);
          resolve(message);
        }
      };

      conn.on('message', onMessage);
    });
  };

  return new Promise(resolve => {
    conn.client.on('connect', () => {
      resolve(conn);
    });
  });
}
