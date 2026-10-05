const LEADER = '\u0002'; // Ctrl-B

const SCROLL_SEQUENCES = [
  { seq: '\x1b[5~', action: 'scrollPage', arg: 'up' },
  { seq: '\x1b[6~', action: 'scrollPage', arg: 'down' },
  { seq: '\x1b[A', action: 'scroll', arg: 'up' },
  { seq: '\x1b[B', action: 'scroll', arg: 'down' },
  { seq: '\x1bOA', action: 'scroll', arg: 'up' },
  { seq: '\x1bOB', action: 'scroll', arg: 'down' },
  { seq: '\x1b[H', action: 'scrollToTop' },
  { seq: '\x1b[1~', action: 'scrollToTop' },
  { seq: '\x1b[F', action: 'scrollToBottom' },
  { seq: '\x1b[4~', action: 'scrollToBottom' },
];

const FOCUS_SEQUENCES = [
  { seq: '\x1b[A', delta: -1 },
  { seq: '\x1b[B', delta: 1 },
  { seq: '\x1b[C', delta: 1 },
  { seq: '\x1b[D', delta: -1 },
  { seq: '\x1bOA', delta: -1 },
  { seq: '\x1bOB', delta: 1 },
  { seq: '\x1bOC', delta: 1 },
  { seq: '\x1bOD', delta: -1 },
];

export function handleInput(state, chunk, actions) {
  if (state.quitting || !chunk) return;

  if (state.mode === 'help') {
    state.mode = 'normal';
    actions.fullRedraw(state);
    return;
  }

  if (state.mode === 'scroll') {
    handleScrollInput(state, chunk, actions);
    return;
  }

  let index = 0;
  let pending = '';

  // Forward any buffered non-leader input before acting on a leader command.
  const flush = () => {
    if (!pending) return;
    actions.forward(state, pending);
    pending = '';
  };

  while (index < chunk.length) {
    if (state.leader) {
      state.leader = false;
      const rest = chunk.slice(index);

      const focus = FOCUS_SEQUENCES.find((entry) => rest.startsWith(entry.seq));
      if (focus) {
        actions.focusBy(state, focus.delta);
        index += focus.seq.length;
        continue;
      }

      const char = chunk[index];
      index += 1;
      switch (char) {
        case 'q':
          actions.quit(state);
          return;
        case 'r':
          actions.restart(state, state.panes[state.focus]);
          break;
        case 'x':
          actions.kill(state, state.panes[state.focus]);
          break;
        case '\t':
        case 'n':
          actions.focusBy(state, 1);
          break;
        case 'p':
          actions.focusBy(state, -1);
          break;
        case '[':
        case 's':
          actions.scrollEnter(state);
          break;
        case '?':
          actions.help(state);
          break;
        case LEADER:
          actions.forward(state, LEADER);
          break;
        default:
          if (char >= '1' && char <= '9') actions.focus(state, Number(char) - 1);
          else actions.forward(state, char);
      }
      continue;
    }

    if (chunk[index] === LEADER) {
      // A chunk can mix ordinary keystrokes and the leader; forward what came
      // before the leader, then arm the leader for the next key.
      flush();
      state.leader = true;
      index += 1;
      continue;
    }

    pending += chunk[index];
    index += 1;
  }

  flush();
}

function handleScrollInput(state, chunk, actions) {
  let index = 0;
  while (index < chunk.length) {
    if (chunk[index] === '\x1b') {
      const match = SCROLL_SEQUENCES.find((entry) => chunk.startsWith(entry.seq, index));
      if (match) {
        if (match.action === 'scroll') actions.scroll(state, match.arg);
        else if (match.action === 'scrollPage') actions.scrollPage(state, match.arg);
        else if (match.action === 'scrollToTop') actions.scrollToTop(state);
        else actions.scrollToBottom(state);
        index += match.seq.length;
        continue;
      }
      if (chunk.startsWith('\x1b[', index) || chunk.startsWith('\x1bO', index)) {
        index = consumeEscape(chunk, index);
        continue;
      }
      actions.scrollExit(state);
      index += 1;
      continue;
    }

    const char = chunk[index];
    index += 1;
    if (char === 'q') actions.scrollExit(state);
    else if (char === 'g') actions.scrollToTop(state);
    else if (char === 'G') actions.scrollToBottom(state);
  }
}

function consumeEscape(chunk, index) {
  if (chunk.startsWith('\x1bO', index)) return index + 3;
  const match = /^\x1b\[[0-9;]*[A-Za-z~]/.exec(chunk.slice(index));
  if (match) return index + match[0].length;
  return index + 1;
}