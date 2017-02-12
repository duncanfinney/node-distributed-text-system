const bodyParser = (req, res) => new Promise((resolve, reject) => {
  if (req.method !== 'POST') {
    resolve();
  }

  var body = '';

  req.on('data',  data => body += data);

  req.on('end', () => {
    try {
      req.body = JSON.parse(body);
      resolve();
    } catch (err) {
      reject(err);
    }
  });
});

bodyParser.name = 'bodyParser';

module.exports = bodyParser;
