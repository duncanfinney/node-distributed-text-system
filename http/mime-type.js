const MIME_TYPES = {
  '.js': 'text/javascript',
  '.css': 'text/css',
  '.json': 'application/json',
  '.png': 'image/png',
  '.jpg': 'image/jpg',
  '.html': 'text/html',
  '.htm': 'text/html'
};

const getMimeType = ext => MIME_TYPES[ext] || 'text/plain';

module.exports = getMimeType;
