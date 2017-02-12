//set up debug module to use our log output
const config = require('./raft/config');
const debug = require('./lib/debug');
debug.output = line => setImmediate(() => {
  log.log(line);
  screen.render();
});

const { raft, httpServer } = require('./index');
const blessed = require('blessed');

const screen = blessed.screen({
  fastCSR: true,
  autoPadding: true
});

screen.title = `Node: ${raft.state.id}`;

const NUM_STATUS_LINES = 10;

const statusBoxHeight = NUM_STATUS_LINES + 2; //border
const log = blessed.log({
  width: '100%',
  height: `100%-${statusBoxHeight}`,
  tags: true,
  style: {}
});

const statusArea = blessed.box({
  width: '100%',
  height: statusBoxHeight,
  top: `100%-${statusBoxHeight}`,
  tags: true,
  border: 'line',
  content: '',
});

screen.append(log);
screen.append(statusArea);

setInterval(() => {
  statusArea.setContent(
    `{bold}Node:{/bold} ${raft.state.id}
{bold}State:{/bold} ${raft.state.state}
{bold}Term:{/bold} ${raft.state.term}
{bold}Peers:{/bold} ${raft.state.peers.sort().toString()}
{bold}Leader:{/bold} ${raft.state.lastKnownLeaderId}
{bold}Voted For:{/bold} ${raft.state.votedFor}
{bold}Log Length:{/bold} ${raft.state.log.length}
{bold}Commit Index:{/bold} ${raft.state.commitIndex}
{bold}Last:{/bold} ${debug.formatter(raft.state.log[raft.state.commitIndex]).substr(0, statusArea.width - 8)}
{bold}Port:{/bold} ${httpServer.address().port}
  `);
  let border = 'gray';
  switch (raft.state.state) {
    case 'leader':
      border = 'green';
      break;
    case 'candidate':
      border = 'yellow';
      break;
    default:
      border = 'gray';
      break;
  }
  statusArea.style.border.fg = border
  screen.render();
}, 16);

screen.key(['escape', 'q', 'C-c'], function (ch, key) {
  return process.exit(0);
});

screen.on('resize', (w, h) => {
  screen.render();
})

screen.render();
