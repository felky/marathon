export function computeLayout(count, width, height, mode = 'auto') {
  const safeWidth = Math.max(1, width);
  const safeHeight = Math.max(1, height);
  const footerY = safeHeight - 1;
  const frameBottom = safeHeight - 2;

  const layout = {
    width: safeWidth,
    height: safeHeight,
    footerY,
    frameBottom,
    columns: [],
    separatorXs: [],
    dividerRows: [],
    rects: [],
    tooSmall: false,
  };

  if (count <= 0) return layout;
  if (safeWidth < 20 || safeHeight < 6 || frameBottom < 3) {
    layout.tooSmall = true;
    return layout;
  }

  const innerTop = 1;
  const innerBottom = frameBottom - 1;
  const innerHeight = innerBottom - innerTop + 1;
  const innerWidth = safeWidth - 2;

  let columnCount = pickColumns(count, mode);
  const maxColumns = Math.max(1, Math.floor((innerWidth + 1) / 12));
  columnCount = Math.min(columnCount, maxColumns, count);

  const rowsPerColumn = Math.ceil(count / columnCount);
  const groups = [];
  let assigned = 0;
  for (let c = 0; c < columnCount && assigned < count; c += 1) {
    const size = Math.min(rowsPerColumn, count - assigned);
    groups.push({ size, first: assigned });
    assigned += size;
  }

  const maxPanesInColumn = Math.max(...groups.map((group) => group.size));
  if (innerHeight < maxPanesInColumn + (maxPanesInColumn - 1)) {
    layout.tooSmall = true;
    return layout;
  }

  const separatorCount = groups.length - 1;
  const usableWidth = innerWidth - separatorCount;
  const baseWidth = Math.floor(usableWidth / groups.length);
  let extraWidth = usableWidth - baseWidth * groups.length;

  let x = 1;
  for (let c = 0; c < groups.length; c += 1) {
    const group = groups[c];
    const columnWidth = baseWidth + (extraWidth > 0 ? 1 : 0);
    if (extraWidth > 0) extraWidth -= 1;

    const x0 = x;
    const x1 = x + columnWidth - 1;
    const column = { x0, x1, dividerYs: [], panes: [] };

    const separators = group.size - 1;
    const usableHeight = innerHeight - separators;
    const baseHeight = Math.floor(usableHeight / group.size);
    let extraHeight = usableHeight - baseHeight * group.size;

    let y = innerTop;
    for (let p = 0; p < group.size; p += 1) {
      const paneHeight = baseHeight + (extraHeight > 0 ? 1 : 0);
      if (extraHeight > 0) extraHeight -= 1;

      const rect = {
        x: x0,
        y,
        w: columnWidth,
        h: paneHeight,
        titleY: y - 1,
        column: c,
      };
      column.panes.push(rect);
      layout.rects[group.first + p] = rect;
      y += paneHeight;
      if (p < group.size - 1) {
        column.dividerYs.push(y);
        layout.dividerRows.push(y);
        y += 1;
      }
    }

    layout.columns.push(column);
    x = x1 + 1;
    if (c < groups.length - 1) {
      layout.separatorXs.push(x);
      x += 1;
    }
  }

  return layout;
}

function pickColumns(count, mode) {
  if (count <= 1) return 1;
  switch (mode) {
    case 'rows':
      return 1;
    case 'cols':
      return count;
    case 'grid':
      return Math.ceil(Math.sqrt(count));
    default:
      if (count === 2) return 2;
      if (count <= 6) return 2;
      return 3;
  }
}