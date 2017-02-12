const { colorText, COLORS } = require('./console-colors');

class Logger {

  constructor(namespace, formatter, outputter, color) {
    this.namespace = namespace;
    this.formatter = formatter;
    this.outputter = outputter;
    this.color = color;
  }

  log(...args) {
    const time = getCurrentTime();
    const content = args.map(this.formatter).join(' ');
    const color = this.color ? COLORS[this.color] : COLORS.white;
    const logLine = `${colorText(COLORS.whiteBold, time)}|${colorText(color, this.namespace)}|${content}`;
    this.outputter(logLine);
  }
}

const formatter = arg => {
  if (arg instanceof Set) {
    return `Set{${JSON.stringify([...arg])}}`
  }

  if (arg instanceof Map) {
    return `Map{${JSON.stringify([...arg])}}`
  }

  if (arg instanceof Array) {
    return JSON.stringify(arg);
  }

  if (typeof arg === 'boolean' || typeof arg === 'number') {
    return arg.toString()
  }

  if (!arg) {
    return String(arg);
  }

  if (typeof arg === 'object') {
    const props = Object
      .keys(arg)
      .map(key => `${key}=${formatter(arg[key])}`)
      .join(' ')
    return `(${props})`;
  }

  return arg || '';
}

const getCurrentTime = () => {
  let [date, time] = new Date().toISOString().split('T');
  return time.replace('Z', '');
};

const LogFactory = {
  createLogger: (namespace, color) => new Logger(namespace, LogFactory.formatter, LogFactory.output, color),
  formatter,
  output: line => console.log(line)
}

module.exports = LogFactory;
