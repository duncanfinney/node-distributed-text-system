const path = require('path');
const fs = require('fs');
const getMimeType = require('../mime-type');

const serveStaticAssets = (req, res) => {
  let filePath = './assets' + req.url;
  if (req.url === '/editor') {
    filePath = './assets/index.html';
  }

  var extName = path.extname(filePath);
  const contentType = getMimeType(extName);
  fs.readFile(filePath, (err, content) => {
    if (err) {
      if (err.code == 'ENOENT') {
        res.writeHead(404, { 'Content-Type': contentType });
        res.end();
      } else {
        res.writeHead(500, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ message: err.message }));
        res.end();
      }
      return;
    }
    //success
    res.writeHead(200, { 'Content-Type': contentType });
    res.end(content, 'utf-8');
  });
};

serveStaticAssets.name = 'serveStaticAssets';

module.exports = serveStaticAssets;
