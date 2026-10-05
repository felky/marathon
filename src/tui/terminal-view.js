import * as xtermNamespace from '@xterm/headless';

const Terminal = xtermNamespace.Terminal ?? xtermNamespace.default?.Terminal;

export class PaneView {
  constructor({ cols, rows }) {
    if (!Terminal) throw new Error('Could not load @xterm/headless.');
    this.term = new Terminal({
      cols: Math.max(2, cols),
      rows: Math.max(1, rows),
      scrollback: 3000,
      allowProposedApi: true,
      convertEol: false,
    });
    this.dirty = true;
    if (typeof this.term.onWriteParsed === 'function') {
      this.term.onWriteParsed(() => {
        this.dirty = true;
      });
    }
  }

  get cols() {
    return this.term.cols;
  }

  get rows() {
    return this.term.rows;
  }

  write(data) {
    this.term.write(data);
    this.dirty = true;
  }

  reset() {
    this.term.reset();
    this.dirty = true;
  }

  resize(cols, rows) {
    const c = Math.max(2, cols);
    const r = Math.max(1, rows);
    if (this.term.cols === c && this.term.rows === r) return;
    this.term.resize(c, r);
    this.dirty = true;
  }

  line(y) {
    const buffer = this.term.buffer.active;
    const line = buffer.getLine(buffer.viewportY + y);
    if (!line) return '';
    return renderLine(this.term, line);
  }

  cursor() {
    const buffer = this.term.buffer.active;
    if (buffer.viewportY < buffer.baseY) return null;
    const x = buffer.cursorX;
    const y = buffer.cursorY;
    if (x < 0 || y < 0 || x >= this.term.cols || y >= this.term.rows) return null;
    return { x, y };
  }

  atBottom() {
    const buffer = this.term.buffer.active;
    return buffer.viewportY >= buffer.baseY;
  }

  scrollUp(lines = 1) {
    this.term.scrollLines(-lines);
    this.dirty = true;
  }

  scrollDown(lines = 1) {
    this.term.scrollLines(lines);
    this.dirty = true;
  }

  scrollPageUp() {
    this.term.scrollPages(-1);
    this.dirty = true;
  }

  scrollPageDown() {
    this.term.scrollPages(1);
    this.dirty = true;
  }

  scrollToTop() {
    this.term.scrollToTop();
    this.dirty = true;
  }

  scrollToBottom() {
    this.term.scrollToBottom();
    this.dirty = true;
  }
}

function renderLine(term, line) {
  const cols = term.cols;
  let last = -1;
  for (let x = 0; x < cols; x += 1) {
    const cell = line.getCell(x);
    if (!cell) continue;
    const chars = cell.getChars();
    if ((chars && chars !== ' ') || !cell.isBgDefault() || cell.isInverse() || cell.isUnderline()) {
      last = x;
    }
  }
  if (last < 0) return '';

  let output = '';
  let currentSgr = '';
  for (let x = 0; x <= last; x += 1) {
    const cell = line.getCell(x);
    if (!cell) continue;
    const width = typeof cell.getWidth === 'function' ? cell.getWidth() : 1;
    if (width === 0) continue; // trailing half of a wide glyph
    const sgr = cellSgr(cell);
    if (sgr !== currentSgr) {
      output += `\x1b[${sgr}m`;
      currentSgr = sgr;
    }
    output += cell.getChars() || ' ';
  }
  return output + '\x1b[0m';
}

function cellSgr(cell) {
  const codes = ['0'];
  if (call(cell, 'isInverse')) {
    codes.push(bgSeq(cell), fgSeq(cell));
  } else {
    codes.push(fgSeq(cell), bgSeq(cell));
  }
  if (call(cell, 'isBold')) codes.push('1');
  if (call(cell, 'isDim')) codes.push('2');
  if (call(cell, 'isItalic')) codes.push('3');
  if (call(cell, 'isUnderline')) codes.push('4');
  if (call(cell, 'isBlink')) codes.push('5');
  if (call(cell, 'isStrikethrough')) codes.push('9');
  return codes.join(';');
}

function fgSeq(cell) {
  if (cell.isFgDefault()) return '39';
  if (cell.isFgRGB()) {
    const value = cell.getFgColor();
    return `38;2;${(value >> 16) & 255};${(value >> 8) & 255};${value & 255}`;
  }
  return `38;5;${cell.getFgColor()}`;
}

function bgSeq(cell) {
  if (cell.isBgDefault()) return '49';
  if (cell.isBgRGB()) {
    const value = cell.getBgColor();
    return `48;2;${(value >> 16) & 255};${(value >> 8) & 255};${value & 255}`;
  }
  return `48;5;${cell.getBgColor()}`;
}

function call(object, name) {
  return typeof object[name] === 'function' ? object[name]() : false;
}