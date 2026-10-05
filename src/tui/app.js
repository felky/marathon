import process from 'node:process';
import { PaneView } from './terminal-view.js';
import { computeLayout } from './layout.js';
import { ScreenWriter, drawFrame, drawPaneContent, drawFooter, drawHelp, drawTooSmall } from './render.js';
import { handleInput } from './keys.js';
import { spawnPty, killPty } from '../pty.js';

const RENDER_DELAY = 20;

export async function runTui(project, tasks, options = {}) {
  if (!process.stdin.isTTY || !process.stdout.isTTY) {
    throw new Error('The pane UI needs an interactive terminal (use --plain to pipe output).');
  }

  const state = {
    project,
    panes: tasks.map((task) => ({
      task,
      view: new PaneView({ cols: 20, rows: 5 }),
      proc: null,
      rect: null,
      status: 'starting',
      exitCode: null,
      signal: null,
      error: null,
      gen: 0,
    })),
    focus: 0,
    layout: null,
    width: process.stdout.columns || 80,
    height: process.stdout.rows || 24,
    mode: 'normal',
    leader: false,
    quitting: false,
    tooSmall: false,
    message: null,
    messageTimer: null,
    renderTimer: null,
    renderOpts: {},
    sizeTimer: null,
  };

  const actions = {
    quit: (s) => quit(s, 0),
    fullRedraw: (s) => fullRedraw(s),
    focus: (s, index) => focusPane(s, index),
    focusBy: (s, delta) => focusPane(s, s.focus + delta),
    restart: (s, pane) => restartPane(s, pane),
    kill: (s, pane) => killPane(s, pane),
    forward: (s, data) => forward(s, data),
    scrollEnter: (s) => setMode(s, 'scroll'),
    scrollExit: (s) => setMode(s, 'normal'),
    scroll: (s, direction) => {
      const pane = focusedPane(s);
      if (!pane) return;
      if (direction === 'up') pane.view.scrollUp();
      else pane.view.scrollDown();
      requestRender(s, { footer: true });
    },
    scrollPage: (s, direction) => {
      const pane = focusedPane(s);
      if (!pane) return;
      if (direction === 'up') pane.view.scrollPageUp();
      else pane.view.scrollPageDown();
      requestRender(s, { footer: true });
    },
    scrollToTop: (s) => {
      const pane = focusedPane(s);
      if (!pane) return;
      pane.view.scrollToTop();
      requestRender(s, { footer: true });
    },
    scrollToBottom: (s) => {
      const pane = focusedPane(s);
      if (!pane) return;
      pane.view.scrollToBottom();
      requestRender(s, { footer: true });
    },
    help: (s) => {
      s.mode = 'help';
      fullRedraw(s);
    },
  };

  process.stdin.setRawMode(true);
  process.stdin.resume();
  process.stdin.setEncoding('utf8');
  enterTerminal();

  relayout(state);
  fullRedraw(state);
  for (const pane of state.panes) startPane(state, pane);

  process.stdin.on('data', (chunk) => {
    try {
      handleInput(state, chunk, actions);
    } catch (error) {
      setMessage(state, `input error: ${error.message}`);
    }
  });

  const onResize = () => syncSize(state);
  process.stdout.on('resize', onResize);
  state.sizeTimer = setInterval(onResize, 250);

  const onSignal = () => quit(state, 0);
  process.on('SIGINT', onSignal);
  process.on('SIGTERM', onSignal);
  process.on('exit', () => restoreTerminal());

  const crash = (error) => {
    if (state.crashing) return;
    state.crashing = true;
    for (const pane of state.panes) killPty(pane.proc);
    restoreTerminal();
    console.error(error);
    process.exit(1);
  };
  process.on('uncaughtException', crash);
  process.on('unhandledRejection', crash);

  return new Promise(() => {});
}

function focusedPane(state) {
  return state.panes[state.focus];
}

function startPane(state, pane) {
  pane.gen += 1;
  const gen = pane.gen;
  pane.status = 'starting';
  pane.exitCode = null;
  pane.signal = null;
  pane.error = null;
  pane.proc = null;
  pane.view.reset();
  if (pane.rect) pane.view.resize(pane.rect.w, pane.rect.h);

  spawnPty({
    cmd: pane.task.cmd,
    cwd: pane.task.cwd,
    env: pane.task.env,
    shell: pane.task.shell ?? state.project.shell,
    cols: pane.rect ? pane.rect.w : 80,
    rows: pane.rect ? pane.rect.h : 24,
  })
    .then((proc) => {
      if (pane.gen !== gen || state.quitting) {
        killPty(proc);
        return;
      }
      pane.proc = proc;
      pane.status = 'running';
      proc.onData((data) => {
        if (pane.gen !== gen) return;
        pane.view.write(data);
        requestRender(state, {});
      });
      proc.onExit((event) => {
        if (pane.gen !== gen) return;
        pane.proc = null;
        pane.status = event.signal ? 'killed' : 'exited';
        pane.exitCode = event.exitCode;
        pane.signal = event.signal;
        requestRender(state, { frame: true, footer: true });
      });
      requestRender(state, { frame: true, footer: true });
    })
    .catch((error) => {
      if (pane.gen !== gen) return;
      pane.status = 'error';
      pane.error = error.message;
      pane.view.write(`\x1b[31mmth: failed to start: ${error.message}\x1b[0m\r\n`);
      requestRender(state, { frame: true, footer: true });
      requestRender(state, {});
    });
}

function killPane(state, pane) {
  if (!pane || !pane.proc) return;
  killPty(pane.proc);
  pane.proc = null;
  pane.status = 'killed';
  setMessage(state, `killed ${pane.task.id}`);
  requestRender(state, { frame: true, footer: true });
}

function restartPane(state, pane) {
  if (!pane) return;
  if (pane.proc) killPty(pane.proc);
  pane.proc = null;
  startPane(state, pane);
  setMessage(state, `restarted ${pane.task.id}`);
}

function focusPane(state, index) {
  const count = state.panes.length;
  if (count === 0) return;
  const next = ((index % count) + count) % count;
  if (next === state.focus) return;
  state.focus = next;
  requestRender(state, { frame: true, footer: true });
  requestRender(state, {});
}

function forward(state, data) {
  const pane = focusedPane(state);
  if (pane && pane.proc) {
    try {
      pane.proc.write(data);
    } catch {}
  }
}

function setMode(state, mode) {
  if (state.mode === mode) return;
  state.mode = mode;
  const pane = focusedPane(state);
  if (pane) pane.view.dirty = true;
  requestRender(state, { footer: true });
}

function setMessage(state, text) {
  state.message = text;
  clearTimeout(state.messageTimer);
  state.messageTimer = setTimeout(() => {
    state.message = null;
    requestRender(state, { footer: true });
  }, 2000);
  requestRender(state, { footer: true });
}

function relayout(state) {
  const layout = computeLayout(state.panes.length, state.width, state.height, state.project.layout);
  state.layout = layout;
  state.tooSmall = layout.tooSmall;
  state.panes.forEach((pane, index) => {
    const rect = layout.rects[index];
    if (!rect) return;
    pane.rect = rect;
    pane.view.resize(rect.w, rect.h);
    if (pane.proc) {
      try {
        pane.proc.resize(rect.w, rect.h);
      } catch {}
    }
  });
}

function syncSize(state) {
  const width = process.stdout.columns || state.width;
  const height = process.stdout.rows || state.height;
  if (width === state.width && height === state.height) return;
  state.width = width;
  state.height = height;
  relayout(state);
  fullRedraw(state);
}

function requestRender(state, options = {}) {
  state.renderOpts = {
    frame: state.renderOpts.frame || Boolean(options.frame),
    footer: state.renderOpts.footer || Boolean(options.footer),
  };
  if (state.renderTimer || state.quitting) return;
  state.renderTimer = setTimeout(() => {
    state.renderTimer = null;
    renderNow(state);
  }, RENDER_DELAY);
}

function renderNow(state) {
  if (state.quitting || !state.layout) return;
  const options = state.renderOpts;
  state.renderOpts = {};

  const writer = new ScreenWriter();
  if (state.tooSmall) {
    writer.text('\x1b[2J');
    drawTooSmall(writer, state);
    process.stdout.write(writer.flush());
    return;
  }
  if (options.frame) drawFrame(writer, state);
  for (const pane of state.panes) {
    if (pane.view.dirty) {
      drawPaneContent(writer, pane);
      pane.view.dirty = false;
    }
  }
  if (options.footer) drawFooter(writer, state);
  if (state.mode === 'help') drawHelp(writer, state);
  appendCursor(writer, state);
  process.stdout.write(writer.flush());
}

function fullRedraw(state) {
  const writer = new ScreenWriter();
  writer.text('\x1b[2J');
  if (state.tooSmall) {
    drawTooSmall(writer, state);
    process.stdout.write(writer.flush());
    return;
  }
  drawFrame(writer, state);
  for (const pane of state.panes) {
    drawPaneContent(writer, pane);
    pane.view.dirty = false;
  }
  drawFooter(writer, state);
  if (state.mode === 'help') drawHelp(writer, state);
  appendCursor(writer, state);
  process.stdout.write(writer.flush());
}

function appendCursor(writer, state) {
  if (state.mode === 'help') {
    writer.text('\x1b[?25l');
    return;
  }
  const pane = focusedPane(state);
  if (!pane || !pane.rect || !pane.proc) {
    writer.text('\x1b[?25l');
    return;
  }
  const cursor = pane.view.cursor();
  if (!cursor) {
    writer.text('\x1b[?25l');
    return;
  }
  const x = pane.rect.x + Math.min(cursor.x, pane.rect.w - 1);
  const y = pane.rect.y + Math.min(cursor.y, pane.rect.h - 1);
  writer.text(`\x1b[${y + 1};${x + 1}H\x1b[?25h`);
}

function quit(state, code) {
  if (state.quitting) return;
  state.quitting = true;
  clearInterval(state.sizeTimer);
  clearTimeout(state.renderTimer);
  clearTimeout(state.messageTimer);
  for (const pane of state.panes) killPty(pane.proc);
  setTimeout(() => {
    restoreTerminal();
    process.exit(code);
  }, 150);
}

function enterTerminal() {
  process.stdout.write('\x1b[?1049h\x1b[2J\x1b[?25l');
}

function restoreTerminal() {
  try {
    process.stdout.write('\x1b[?25h\x1b[?1049l');
  } catch {}
  try {
    if (process.stdin.isTTY && process.stdin.isRaw) process.stdin.setRawMode(false);
  } catch {}
  try {
    process.stdin.pause();
  } catch {}
}
