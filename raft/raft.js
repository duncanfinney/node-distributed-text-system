const { EventEmitter } = require('events');
const _ = require('../lib/util');
const debug = require('../lib/debug').createLogger('raft', 'blue');
const RaftCommands = require('./raft-commands');
const RaftState = require('./raft-state');

//config vars
const {
  ELECTION_TIMEOUT,
  HEARTBEAT_INTERVAL
} = require('./config');

class Raft extends EventEmitter {

  constructor(client, id, peers = []) {
    super();
    debug.log('starting new raft node as ', id);
    this.client = client;
    this.client.on('message', message => this.onMessage(message));

    this.state = RaftState({
      id: id,
      peers,
      state: 'follower',
      term: 1,
      votedFor: null,
      log: [],
      commitIndex: -1,
      voteGranted: _.makeMap(peers, false),
      matchIndex: _.makeMap(peers, 0),
      nextIndex: {},
      lastKnownLeaderId: null
    });

    //bind all the methods
    this.append = this.append.bind(this);
    this.dispose = this.dispose.bind(this);
    this.onMessage = this.onMessage.bind(this);
    this._sendAppendEntries = this._sendAppendEntries.bind(this);
    this._sendEntriesToPeer = this._sendEntriesToPeer.bind(this);
    this._isQuorum = this._isQuorum.bind(this);


    //intervals
    this._timeouts = {};
    this._intervals = {};
    this._resetElectionTimer();
    this._watchClusterMembership();
    this.state.loadFromDisk();
  }

  async dispose() {
    debug.log('destroying node');
    Object.keys(this._timeouts).forEach(t => clearTimeout(this._timeouts[t]));
    Object.keys(this._intervals).forEach(i => clearInterval(this._intervals[i]));
    this.emit('destroy');
    await this.client.dispose();
    this.removeAllListeners();
  }

  _watchClusterMembership() {
    this.client.on('clusterMembership', peers => {
      this.state.peers = peers;
    })
  }

  onMessage(message) {
    if (![
        RaftCommands.AppendEntries,
        RaftCommands.AppendEntriesReply
      ].includes(message.type)) {
      debug.log('received', message);
    }
    switch (message.type) {

      case RaftCommands.AppendEntries:
        this.handleAppendEntries(message);
        break;

      case RaftCommands.AppendEntriesReply:
        this.handleAppendEntriesReply(message);
        break;

      case RaftCommands.RequestVote:
        this.handleRequestVote(message);
        break;

      case RaftCommands.RequestVoteReply:
        this.handleRequestVoteReply(message);
        break;

      case RaftCommands.AppendRPC:
        this.append(message.data);
        break;

    }
    this._resetElectionTimer();
    this.advanceCommitIndex();
  }

  handleRequestVote(request) {
    const { state } = this;

    let success = false;

    //step down if needed
    if (request.term > state.term) {
      this._stepDown(request.term);
      success = true;
    }

    if (request.term >= state.term) {
      const ourLastLogTerm = this._termAt(state.log.length - 1);
      const isUpToDate =
        request.term > ourLastLogTerm
        || request.lastLogTerm === ourLastLogTerm && request.lastLogIndex >= state.log.length - 1;

      if ((state.votedFor == null || state.votedFor === request.from) && isUpToDate) {
        state.votedFor = request.from;
        success = true;
        this._resetElectionTimer();
      }
    }
    this.client.send(request.from, {
      type: RaftCommands.RequestVoteReply,
      voteGranted: success,
      term: state.term
    });
  }

  handleAppendEntries(request) {
    let success = false;
    const { state } = this;

    if (state.term === request.term && request.from !== state.id) {

      state.state = 'follower';
      if (request.prevLogIndex === -1 ||
        (request.prevLogIndex < state.log.length &&
        this._termAt(request.prevLogIndex) == request.prevLogTerm)) {

        //actually apply the log to our log
        this._applyEntries(request.entries);

        if (request.leaderCommit > state.commitIndex) {
          this._setCommitIndex(Math.min(request.leaderCommit, state.log.length - 1));
        }

        success = true;
        state.lastKnownLeaderId = request.from;
      }

    }

    //step down
    if (this.state.term < request.term) {
      this._stepDown(request.term);
    }

    this.client.send(request.from, {
      type: RaftCommands.AppendEntriesReply,
      term: state.term,
      success,
      lastLogIndex: state.log.length - 1
    });
  }

  _applyEntries(entries) {
    entries.length && debug.log(`applying ${entries.length} entries to commit log`)
    const { state } = this;

    //remove conflicting entries
    const firstConflict = entries.find(entry => {
      const { index } = entry;
      return !state.log[index] || state.log[index].term !== entry.term;
    });
    const conflictedAt = firstConflict && firstConflict.index || -1;
    if (conflictedAt > 0) {
      state.log = state.log.slice(0, conflictedAt);
    }

    //add to the log
    entries.forEach(entry => {
      const { index } = entry;
      state.log[index] = Object.assign({}, entry);
    })
  }

  _stepDown(term) {
    this.state.term = term;
    if (this.state.state !== 'leader') {
      return;
    }
    debug.log('stepping down as leader');
    this.state.state = 'follower';
    this.state.votedFor = null;
    this._resetElectionTimer();
    this._stopHeartbeatTimer();
  }

  append(data, cb) {
    const { state } = this;
    if (state.state !== 'leader') {
      debug.log('forwarding append to leader', data);
      this.client.send(state.lastKnownLeaderId, {
        type: RaftCommands.AppendRPC,
        data
      });
      return;
    }
    debug.log('append', data);
    state.log.push({
      index: state.log.length,
      term: state.term,
      data
    });
    const idx = state.log.length - 1;
    if (cb) {
      //TODO: clean up handlers
      this.on('commitIndexChanged', newIdx => {
        if (newIdx >= idx) {
          cb();
        }
      });
    }
    this._sendAppendEntries();
    return idx;
  }

  _termAt(index) {
    if (this.state.log[index]) {
      return this.state.log[index].term;
    }
    return -1;
  }

  _resetElectionTimer() {
    const interval = _.random(ELECTION_TIMEOUT / 2, ELECTION_TIMEOUT);
    if (this._timeouts._electionTimer) {
      clearTimeout(this._timeouts._electionTimer);
    }

    this._timeouts._electionTimer = setTimeout(() => this._beginElection(), interval);
  }

  _beginElection() {
    const { state } = this;
    if (state.state === 'leader' || state.peers.length === 0) {
      return;
    }

    debug.log('begin election');
    state.lastKnownLeaderId = null;
    state.term += 1;
    state.state = 'candidate';
    state.voteGranted = _.makeMap(state.peers, false);
    state.voteGranted[state.id] = true;
    state.votedFor = state.id;
    state.matchIndex = _.makeMap(state.peers, 0);
    state.nextIndex = _.makeMap(state.peers, 1);
    const lastLog = _.last(state.log, {});
    const reqVote = {
      type: RaftCommands.RequestVote,
      term: state.term,
      lastLogIndex: lastLog.index || 0,
      lastLogTerm: lastLog.term || -1
    };
    for (let peer of state.peers) {
      this.client.send(peer, reqVote);
    }
  }

  handleRequestVoteReply(reply) {
    const { state } = this;
    if (state.term < reply.term) {
      this._stepDown(reply.term);
      return;
    }

    if (state.state !== 'candidate') {
      //already been promoted to leader
      return;
    }

    //mark them as voted if we want
    if (state.term === reply.term) {
      state.voteGranted[reply.from] = reply.voteGranted;
    }

    //check if we have a consensus
    const numVotes = Object.values(state.voteGranted).filter(Boolean).length;
    if (this._isQuorum(numVotes)) {
      this._becomeLeader();
    }
  }

  _becomeLeader() {
    debug.log('have enough votes. becoming leader');
    const { state } = this;
    state.state = 'leader';
    state.nextIndex = _.makeMap(state.peers, state.log.length + 1);
    state.matchIndex = _.makeMap(state.peers, 1);
    state.votedFor = state.id;
    state.lastKnownLeaderId = state.id;
    this._sendAppendEntries();
    this._startHeartbeatTimer();
  }

  _startHeartbeatTimer() {
    this._stopHeartbeatTimer();
    this._intervals.heartBeat = setInterval(() => this._sendAppendEntries(), HEARTBEAT_INTERVAL);
  }

  _stopHeartbeatTimer() {
    if (this._intervals.heartBeat) {
      clearInterval(this.heartBeat);
      delete this._intervals.heartBeat;
    }
  }

  _sendAppendEntries() {
    const { state } = this;
    if (state.state !== 'leader') {
      return;
    }
    state.peers
      .filter(p => p !== state.id)
      .forEach(this._sendEntriesToPeer);
  }

  _sendEntriesToPeer(peer) {
    const { state } = this;
    if (state.nextIndex[peer] > state.log.length) {
      state.nextIndex[peer] = state.log.length;
    }

    const entries = [];
    let prevLogTerm = -1;
    let prevLogIndex = -1;
    for (let i = state.nextIndex[peer]; i < state.log.length; ++i) {
      entries.push(state.log[i]);
    }

    if (entries.length > 0) {
      prevLogIndex = entries[0].index - 1;

      if (prevLogIndex > -1) {
        prevLogTerm = state.log[prevLogIndex].term
      }
    }

    this.client.send(peer, {
      type: RaftCommands.AppendEntries,
      term: state.term,
      leaderId: state.id,
      prevLogIndex: prevLogIndex,
      prevLogTerm: prevLogTerm,
      entries,
      leaderCommit: state.commitIndex
    });
  }

  handleAppendEntriesReply(reply) {
    const { state } = this;
    if (state.term < reply.term) {
      this._stepDown(reply.term);
      return;
    }

    if (reply.success && reply.lastLogIndex > -1) {
      state.nextIndex[reply.from] = reply.lastLogIndex + 1;
      state.matchIndex[reply.from] = reply.lastLogIndex
    } else {

      if (state.nextIndex[reply.from] == null) {
        state.nextIndex[reply.from] = state.log.length
      }

      state.nextIndex[reply.from] = Math.max(state.nextIndex[reply.from] - 1, 0)
      if (state.nextIndex[reply.from] > 0) {
        //make recovery faster
        this._sendEntriesToPeer(reply.from);
      }
    }
  }

  advanceCommitIndex() {
    const { state } = this;
    if (state.state !== 'leader') {
      return;
    }
    let highestCommitIndex = state.commitIndex;
    for (let N = state.commitIndex + 1; N < state.log.length; N++) {

      if (this._termAt(N) === state.term) {

        const numPeersComittedToPoint = Object.values(state.matchIndex).filter(i => i >= N).length;
        if (this._isQuorum(numPeersComittedToPoint)) {
          highestCommitIndex = N;
        }

      }
    }
    this._setCommitIndex(highestCommitIndex);
  }

  _isQuorum(n) {
    return n + 1 > Math.floor(this.state.peers.length / 2);
  }

  _setCommitIndex(newIndex) {
    const { state:{ commitIndex } } = this;
    if (commitIndex !== newIndex) {
      this.state.commitIndex = newIndex;
      this.state.saveToDisk();
      this.emit('commitIndexChanged', newIndex);
      this._sendAppendEntries();
    }
  }

}

module.exports = Raft;
