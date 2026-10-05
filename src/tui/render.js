import { colorCode, RESET, visibleWidth } from '../colors.js';

const DIM_ON = '\x1b[2m';
const DIM_OFF = '\x1b[22m';

export class ScreenWriter {
  constructor() {
    this.parts = [];
  }

  at(x, y) {
    this.parts.push(`\x1b[${Math.max(0, y) + 1};${Math.max(0, x) + 1}H`);
    return this;
  }

  text(value) {
    this.parts.push(value);
    return this;
  }

  flush() {
    return this.parts.join('');
  }
}

export function drawFrame(writer, state) {
  const { layout, width } = state;
  const bottom = layout.frameBottom;

  writer.at(0, 0).text(DIM_ON + edgeRow(width, layout.separatorXs, '┌', '┬', '┐') + DIM_OFF);
  writer.at(0, bottom).text(DIM_ON + edgeRow(width, layout.separatorXs, '└', '┴', '┘') + DIM_OFF);

  for (let y = 1; y < bottom; y += 1) {
    writer.at(0, y).text(DIM_ON + '│' + DIM_OFF);
    writer.at(width - 1, y).text(DIM_ON + '│' + DIM_OFF);
  }

  for (const x of layout.separatorXs) {
    for (let y = 1; y < bottom; y += 1) {
      writer.at(x, y).text(DIM_ON + '│' + DIM_OFF);
    }
  }

  for (const column of layout.columns) {
    for (const dividerY of column.dividerYs) {
      writer.at(column.x0, dividerY).text(DIM_ON + '─'.repeat(column.x1 - column.x0 + 1) + DIM_OFF);
    }
  }

  for (const row of layout.dividerRows) {
    for (const x of layout.separatorXs) {
      writer.at(x, row).text(DIM_ON + '┼' + DIM_OFF);
    }
  }
  const firstColumn = layout.columns[0];
  const lastColumn = layout.columns[layout.columns.length - 1];
  if (firstColumn) {
    for (const row of firstColumn.dividerYs) writer.at(0, row).text(DIM_ON + '├' + DIM_OFF);
  }
  if (lastColumn) {
    for (const row of lastColumn.dividerYs) writer.at(width - 1, row).text(DIM_ON + '┤' + DIM_OFF);
  }

  state.panes.forEach((pane, index) => {
    if (!pane.rect) return;
    writer.at(pane.rect.x, pane.rect.titleY).text(titleFor(pane, index === state.focus));
  });
}

export function drawPaneContent(writer, pane) {
  const { rect } = pane;
  if (!rect) return;
  for (let row = 0; row < rect.h; row += 1) {
    const line = pane.view.line(row);
    const visible = visibleWidth(line);
    const padding = visible < rect.w ? ' '.repeat(rect.w - visible) : '';
    writer.at(rect.x, rect.y + row).text(line + padding + RESET);
  }
}

export function drawFooter(writer, state) {
  const y = state.height - 1;
  const chips = state.panes
    .map((pane, index) => {
      const label = ` ${index + 1} ${pane.task.id} `;
      return index === state.focus ? `\x1b[7m${label}\x1b[27m` : DIM_ON + label + DIM_OFF;
    })
    .join('');

  const running = state.panes.filter((pane) => pane.status === 'running' || pane.status === 'starting').length;
  let right;
  if (state.mode === 'scroll') right = 'SCROLL · arrows/PgUp/PgDn · Esc exits';
  else if (state.message) right = state.message;
  else right = `${running}/${state.panes.length} running · Ctrl-B ? help`;

  let line = chips;
  const space = state.width - visibleWidth(chips) - visibleWidth(right) - 1;
  if (space > 0) line += ' '.repeat(space);
  else right = '';
  line += right;

  writer.at(0, y).text(line + RESET + '\x1b[K');
}

const HELP_LINES = [
  ['Ctrl-B ?', 'toggle this help'],
  ['Ctrl-B q', 'quit mth and stop all tasks'],
  ['Ctrl-B r', 'restart the focused task'],
  ['Ctrl-B x', 'kill the focused task'],
  ['Ctrl-B n / p', 'focus next / previous pane'],
  ['Ctrl-B 1..9', 'focus a pane by number'],
  ['Ctrl-B arrows', 'move focus'],
  ['Ctrl-B [', 'scroll mode (arrows, PgUp/PgDn, Esc)'],
  ['Ctrl-B Ctrl-B', 'send Ctrl-B to the focused task'],
  ['any other key', 'is sent to the focused task'],
];

export function drawHelp(writer, state) {
  const width = Math.min(state.width - 4, 54);
  const height = HELP_LINES.length + 4;
  const x = Math.max(0, Math.floor((state.width - width) / 2));
  const y = Math.max(0, Math.floor((state.height - height) / 2));

  for (let row = 0; row < height; row += 1) {
    writer.at(x, y + row).text(' '.repeat(width));
  }

  const border = DIM_ON + '─'.repeat(width - 2) + DIM_OFF;
  writer.at(x, y).text('┌' + border + '┐');
  writer.at(x, y + height - 1).text('└' + border + '┘');
  for (let row = 1; row < height - 1; row += 1) {
    writer.at(x, y + row).text('│');
    writer.at(x + width - 1, y + row).text('│');
  }

  writer.at(x + 2, y).text(' mth help ');
  HELP_LINES.forEach(([key, description], index) => {
    const row = `${key.padEnd(15)} ${description}`;
    writer.at(x + 2, y + 1 + index).text(row.slice(0, width - 4).padEnd(width - 4));
  });

  const hint = 'press any key to close';
  writer.at(x + Math.max(0, Math.floor((width - hint.length) / 2)), y + height - 1).text(hint);
}

export function drawTooSmall(writer, state) {
  const message = 'Terminal too small — resize the window';
  const x = Math.max(0, Math.floor((state.width - message.length) / 2));
  const y = Math.floor(state.height / 2);
  writer.at(x, y).text(message);
}

function edgeRow(width, junctions, left, junction, right) {
  const cells = new Array(Math.max(2, width)).fill('─');
  cells[0] = left;
  cells[cells.length - 1] = right;
  for (const x of junctions) {
    if (x > 0 && x < cells.length - 1) cells[x] = junction;
  }
  return cells.join('');
}

function titleFor(pane, focused) {
  const w = pane.rect.w;
  const available = Math.max(1, w - 4);
  let label = pane.task.id + suffixFor(pane);
  if (label.length > available) label = label.slice(0, Math.max(1, available - 1)) + '…';
  const body = ` ${statusDot(pane)} ${colorCode(pane.task.color)}${label}\x1b[39m `;
  return focused ? `\x1b[1m\x1b[4m${body}\x1b[24m\x1b[22m` : body;
}

function statusDot(pane) {
  return colorCode(statusColor(pane)) + '●' + '\x1b[39m';
}

function statusColor(pane) {
  switch (pane.status) {
    case 'running':
      return 'green';
    case 'exited':
      return pane.exitCode ? 'red' : 'gray';
    case 'killed':
      return 'yellow';
    case 'error':
      return 'red';
    default:
      return 'gray';
  }
}

function suffixFor(pane) {
  switch (pane.status) {
    case 'exited':
      return pane.exitCode ? ` (exit ${pane.exitCode})` : '';
    case 'killed':
      return ' (killed)';
    case 'error':
      return ' (failed)';
    default:
      return '';
  }
}