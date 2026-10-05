const NAMED = {
  red: 203,
  orange: 215,
  yellow: 221,
  green: 114,
  teal: 80,
  cyan: 117,
  blue: 111,
  purple: 141,
  magenta: 176,
  pink: 212,
  white: 255,
  gray: 245,
};

export const COLOR_NAMES = Object.keys(NAMED);
export const RESET = '\x1b[0m';

let colorEnabled;

export function setColorEnabled(value) {
  colorEnabled = Boolean(value);
}

export function colorsEnabled() {
  if (colorEnabled === undefined) colorEnabled = supportsColor(process.stdout);
  return colorEnabled;
}

export function colorCode(name) {
  if (!colorsEnabled()) return '';
  const value = NAMED[name] ?? NAMED.gray;
  return `\x1b[38;5;${value}m`;
}

export function fg(name, text) {
  return colorsEnabled() ? colorCode(name) + text + '\x1b[39m' : text;
}

export function dim(text) {
  return colorsEnabled() ? '\x1b[2m' + text + '\x1b[22m' : text;
}

export function bold(text) {
  return colorsEnabled() ? '\x1b[1m' + text + '\x1b[22m' : text;
}

export function supportsColor(stream = process.stdout) {
  return Boolean(stream && stream.isTTY) && process.env.NO_COLOR === undefined;
}

const ANSI_RE = /\x1b\[[0-9;]*m/g;

export function stripAnsi(text) {
  return text.replace(ANSI_RE, '');
}

export function visibleWidth(text) {
  const plain = stripAnsi(text);
  let width = 0;
  for (const char of plain) {
    width += isWide(char.codePointAt(0)) ? 2 : 1;
  }
  return width;
}

function isWide(codePoint) {
  return (
    (codePoint >= 0x1100 && codePoint <= 0x115f) ||
    (codePoint >= 0x2e80 && codePoint <= 0xa4cf && codePoint !== 0x303f) ||
    (codePoint >= 0xac00 && codePoint <= 0xd7a3) ||
    (codePoint >= 0xf900 && codePoint <= 0xfaff) ||
    (codePoint >= 0xfe30 && codePoint <= 0xfe4f) ||
    (codePoint >= 0xff00 && codePoint <= 0xff60) ||
    (codePoint >= 0xffe0 && codePoint <= 0xffe6) ||
    (codePoint >= 0x1f300 && codePoint <= 0x1f64f) ||
    (codePoint >= 0x1f900 && codePoint <= 0x1f9ff) ||
    (codePoint >= 0x20000 && codePoint <= 0x3fffd)
  );
}