const http = require('http');
const serveStaticAssets = require('./middleware/serve-static-assets');
const handleRaftState = require('./middleware/handle-raft-state');
const bodyParser = require('./middleware/body-parser');
const redirectRoot = require('./middleware/redirect-root');
const debug = require('../lib/debug').createLogger('http', 'magenta');
const config = require('../raft/config');


module.exports = (raft, port, initialText) => {

  const middleware = [
    bodyParser,
    handleRaftState(initialText),
    redirectRoot,
    serveStaticAssets
  ];

  const server = http.createServer(async(req, res) => {

    req.raft = raft;

    for (let mwFunc of middleware) {
      await mwFunc(req, res);
      if (res.finished || req.handled) {
        debug.log({ method: req.method, url: req.url, returnStatus: res.statusCode })
        return;
      }
    }
  });

  server.on('listening', () => {
    debug.log('server listening on', server.address().address, server.address().port);
  });

  server.listen(port);
  return server;
};
