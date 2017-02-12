const redirectRoot = async (req, res) => {

  if (req.url === '/') {
    res.writeHead(302, { 'Location': '/editor' });
    res.end();
  }

};

redirectRoot.name = 'redirectRoot';

module.exports = redirectRoot;
