const _ = require('../../lib/util');
const debug = require('../../lib/debug').createLogger('api');

const handleGetState = initialText => async(req, res) => {
  if (!req.url.startsWith('/api/text')) {
    return;
  }

  req.handled = true;

  switch (req.method) {
    case 'POST': {
      const { text } = req.body;
      req.raft.append({ type: 'SET_TEXT', text }, () => res.end());
      return;
    }

    case 'GET': {
      req.socket.setTimeout(2 * 60 * 1000); //2 minutes
      res.writeHead(200, {
        'Content-Type': 'text/event-stream',
        'Cache-Control': 'no-cache',
        'Connection': 'keep-alive'
      });

      const sendState = () => res.write(`data: ${deriveText(req.raft, initialText)}\n\n`);

      req.raft.on('commitIndexChanged', sendState);
      req.socket.on('close', () => req.raft.removeListener('commitIndexChanged', sendState));

      sendState();
      return;

    }
  }
};

const deriveText = (raft, initialText) => {
  const commits = raft.state.log.map(d => d.data);
  const lastSetTextItem = _.lastWhere(commits, (c, idx) => c.type === 'SET_TEXT');
  if (lastSetTextItem) {
    return lastSetTextItem.text || '';
  }
  return initialText;
};

handleGetState.name = 'handleGetState';

module.exports = handleGetState;
