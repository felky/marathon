import test from 'node:test';
import assert from 'node:assert/strict';
import { handleInput } from '../src/tui/keys.js';

const LEADER = '\u0002';

function makeHarness() {
  const state = {
    panes: [{ id: 'api' }, { id: 'web' }],
    focus: 0,
    mode: 'normal',
    leader: false,
    quitting: false,
  };
  const events = [];
  const actions = {
    quit: () => events.push({ type: 'quit' }),
    fullRedraw: () => events.push({ type: 'fullRedraw' }),
    focus: (_s, index) => events.push({ type: 'focus', index }),
    focusBy: (_s, delta) => events.push({ type: 'focusBy', delta }),
    restart: (_s, pane) => events.push({ type: 'restart', id: pane.id }),
    kill: (_s, pane) => events.push({ type: 'kill', id: pane.id }),
    forward: (_s, data) => events.push({ type: 'forward', data }),
    scrollEnter: () => events.push({ type: 'scrollEnter' }),
    scrollExit: () => events.push({ type: 'scrollExit' }),
    scroll: (_s, direction) => events.push({ type: 'scroll', direction }),
    scrollPage: (_s, direction) => events.push({ type: 'scrollPage', direction }),
    scrollToTop: () => events.push({ type: 'scrollToTop' }),
    scrollToBottom: () => events.push({ type: 'scrollToBottom' }),
    help: () => events.push({ type: 'help' }),
  };
  const type = (chunks) => {
    for (const chunk of chunks) handleInput(state, chunk, actions);
    return events;
  };
  return { state, events, type };
}

test('intercepts the leader even when a chunk starts with ordinary input', () => {
  const { type } = makeHarness();

  // A real terminal can coalesce a keystroke and Ctrl-B into one chunk.
  assert.deepEqual(type(['a' + LEADER + 'q']), [
    { type: 'forward', data: 'a' },
    { type: 'quit' },
  ]);
});

test('forwards text before the leader and acts on the key after it', () => {
  const { type } = makeHarness();

  const events = type(['hello' + LEADER + 'x']);
  assert.deepEqual(events, [
    { type: 'forward', data: 'hello' },
    { type: 'kill', id: 'api' },
  ]);
});

test('keeps the leader armed across separate chunks', () => {
  const { state, type } = makeHarness();

  type([LEADER]);
  assert.equal(state.leader, true);

  assert.deepEqual(type(['n']), [{ type: 'focusBy', delta: 1 }]);
  assert.equal(state.leader, false);
});

test('forwards ordinary input untouched and does not arm the leader', () => {
  const { state, type } = makeHarness();

  assert.deepEqual(type(['ls -la\r']), [{ type: 'forward', data: 'ls -la\r' }]);
  assert.equal(state.leader, false);
});

test('Ctrl-B Ctrl-B sends a literal Ctrl-B to the focused pane', () => {
  const { type } = makeHarness();

  assert.deepEqual(type([LEADER + LEADER]), [{ type: 'forward', data: LEADER }]);
});

test('leader followed by an arrow focuses a pane', () => {
  assert.deepEqual(makeHarness().type([LEADER + '\x1b[B']), [{ type: 'focusBy', delta: 1 }]);
  assert.deepEqual(makeHarness().type([LEADER + '\x1b[A']), [{ type: 'focusBy', delta: -1 }]);
});

test('leader followed by a digit focuses that pane', () => {
  const { type } = makeHarness();

  assert.deepEqual(type([LEADER + '2']), [{ type: 'focus', index: 1 }]);
});

test('plain arrow keys are forwarded to the pane when the leader is not armed', () => {
  const { state, type } = makeHarness();

  assert.deepEqual(type(['\x1b[C']), [{ type: 'forward', data: '\x1b[C' }]);
  assert.equal(state.leader, false);
});