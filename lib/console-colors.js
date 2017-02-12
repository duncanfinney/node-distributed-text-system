function colorText(color, txt) {
  return '\x1b[' + color + 'm' + txt + '\x1b[0m';
}

const COLORS = {
  white: '0',
  whiteBold: '1',
  red: '31',
  green: '32',
  yellow: '33',
  blue: '34',
  magenta: '35',
  cyan: '36',
};

module.exports = {
  colorText,
  COLORS
}
