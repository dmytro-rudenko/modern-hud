import { COLOR, RESET, charWidth, itemWidth, paint, paintItem, rainbow, textWidth } from './ansi.ts';
import type { Item, Segment } from './ansi.ts';
import type { Panel, Row } from './panel.ts';

export const GRID_COLUMNS = 5;
export const MIN_BOX_WIDTH = 24;
export const MIN_WIDTH = GRID_COLUMNS * MIN_BOX_WIDTH;

const LABEL_WIDTH = 8;
const ITEM_GAP = 2;

type Line = { text: string; width: number };

function hardSplit(item: Item, room: number): Item[] {
  const chunks: Segment[][] = [[]];
  let used = 0;
  for (const [text, color] of item) {
    for (const char of text) {
      const width = charWidth(char);
      if (used + width > room) {
        chunks.push([]);
        used = 0;
      }
      chunks.at(-1)!.push([char, color]);
      used += width;
    }
  }
  return chunks;
}

function flow(label: string | null, items: Item[], inner: number): Line[] {
  const indent = label === null ? 0 : LABEL_WIDTH;
  const room = inner - indent;
  const rows: Segment[][] = [];
  let current: Segment[] = [];
  let used = 0;

  for (const item of items.flatMap(it => (itemWidth(it) > room ? hardSplit(it, room) : [it]))) {
    const width = itemWidth(item);
    if (used > 0 && used + ITEM_GAP + width > room) {
      rows.push(current);
      current = [];
      used = 0;
    }
    if (used > 0) {
      current.push([' '.repeat(ITEM_GAP), COLOR.value]);
      used += ITEM_GAP;
    }
    current.push(...item);
    used += width;
  }
  if (current.length > 0) rows.push(current);

  return rows.map((row, index) => ({
    text: (label === null ? '' : paint((index === 0 ? label : '').padEnd(LABEL_WIDTH), COLOR.label)) + paintItem(row),
    width: indent + itemWidth(row),
  }));
}

function meter(label: string, percent: number, inner: number): Line {
  const cells = inner - LABEL_WIDTH - 5;
  const filled = Math.max(percent > 0 ? 1 : 0, Math.round((percent / 100) * cells));
  let text = paint(label.padEnd(LABEL_WIDTH), COLOR.label);
  for (let i = 0; i < cells; i++) {
    text += i < filled ? `${rainbow(i / (cells - 1))}■${RESET}` : paint('■', COLOR.empty);
  }
  text += `\x1b[1m${rainbow(percent / 100)}${String(percent).padStart(4)}%${RESET}`;
  return { text, width: inner };
}

function rowLines(row: Row, inner: number): Line[] {
  return row.kind === 'meter' ? [meter(row.label, row.percent, inner)] : flow(row.label, row.items, inner);
}

function split(total: number, parts: number): number[] {
  const base = Math.floor(total / parts);
  return Array.from({ length: parts }, (_, i) => base + (i < total - base * parts ? 1 : 0));
}

export function renderLines(panels: Panel[], width: number): string[] | null {
  if (width < MIN_WIDTH) return null;

  const frame = (text: string): string => paint(text, COLOR.frame);
  const out: string[] = [];

  for (let start = 0; start < panels.length; start += GRID_COLUMNS) {
    const row = panels.slice(start, start + GRID_COLUMNS);
    const widths = split(width, row.length);
    const boxes = row.map((panel, column) => {
      const boxWidth = widths[column]!;
      const lines = panel.rows.flatMap(row => rowLines(row, boxWidth - 4));
      return { title: panel.title, width: boxWidth, lines: lines.length > 0 ? lines : [{ text: paint('—', COLOR.label), width: 1 }] };
    });
    const height = Math.max(...boxes.map(box => box.lines.length));

    out.push(
      boxes
        .map(box => frame('╭─ ') + paint(box.title, COLOR.title, true) + frame(` ${'─'.repeat(box.width - textWidth(box.title) - 5)}╮`))
        .join(''),
    );
    for (let r = 0; r < height; r++) {
      out.push(
        boxes
          .map(box => {
            const line = box.lines[r] ?? { text: '', width: 0 };
            return frame('│ ') + line.text + ' '.repeat(box.width - 4 - line.width) + frame(' │');
          })
          .join(''),
      );
    }
    out.push(boxes.map(box => frame(`╰${'─'.repeat(box.width - 2)}╯`)).join(''));
  }

  return out;
}
