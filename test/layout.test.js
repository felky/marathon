import test from 'node:test';
import assert from 'node:assert/strict';
import { computeLayout } from '../src/tui/layout.js';

test('single pane fills the frame above the footer', () => {
  const layout = computeLayout(1, 80, 24, 'auto');
  assert.equal(layout.tooSmall, false);
  assert.equal(layout.rects.length, 1);
  const rect = layout.rects[0];
  assert.deepEqual(
    { x: rect.x, y: rect.y, w: rect.w, h: rect.h, titleY: rect.titleY },
    { x: 1, y: 1, w: 78, h: 21, titleY: 0 },
  );
  assert.deepEqual(layout.separatorXs, []);
});

test('three panes use two columns with one separator', () => {
  const layout = computeLayout(3, 100, 30, 'auto');
  assert.equal(layout.tooSmall, false);
  assert.equal(layout.columns.length, 2);
  assert.equal(layout.rects.length, 3);
  assert.equal(layout.separatorXs.length, 1);
  assert.equal(layout.dividerRows.length, 1);
  for (const rect of layout.rects) {
    assert.ok(rect.w > 10, `pane width ${rect.w}`);
    assert.ok(rect.h >= 1, `pane height ${rect.h}`);
  }
  const separatorX = layout.separatorXs[0];
  for (const rect of layout.rects) {
    assert.ok(rect.x >= 1);
    assert.ok(rect.x + rect.w <= layout.width - 1);
    assert.ok(rect.y >= 1);
    assert.ok(rect.y + rect.h <= layout.frameBottom);
    assert.ok(rect.x > separatorX || rect.x + rect.w <= separatorX);
  }
});

test('cols mode places every pane side by side', () => {
  const layout = computeLayout(3, 120, 20, 'cols');
  assert.equal(layout.columns.length, 3);
  assert.equal(layout.separatorXs.length, 2);
  assert.equal(layout.rects.length, 3);
});

test('flags terminals that are too small', () => {
  const layout = computeLayout(4, 30, 5, 'auto');
  assert.equal(layout.tooSmall, true);
});