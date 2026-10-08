export type Segment = readonly [text: string, color: string];
export type Item = readonly Segment[];

export const RESET = '\x1b[0m';

export const COLOR = {
  frame: '#5c6370',
  title: '#56d4dd',
  label: '#8b93a1',
  value: '#e6e6e6',
  bright: '#ffffff',
  empty: '#3a3f4b',
  ok: '#4fd6be',
  run: '#ffd75f',
  accent: '#ffaf5f',
  info: '#61afef',
  bad: '#ff5f5f',
} as const;

const RAINBOW = ['#8a5cf6', '#4f8cff', '#22c3e6', '#3ddc84', '#f5d547', '#ff9f43', '#ff4d4d'];

type Rgb = readonly [number, number, number];

function toRgb(hex: string): Rgb {
  const n = Number.parseInt(hex.slice(1), 16);
  return [n >> 16, (n >> 8) & 255, n & 255];
}

function sgr([r, g, b]: Rgb): string {
  return `\x1b[38;2;${r};${g};${b}m`;
}

export function paint(text: string, color: string, bold = false): string {
  return `${bold ? '\x1b[1m' : ''}${sgr(toRgb(color))}${text}${RESET}`;
}

export function rainbow(t: number): string {
  const clamped = Math.min(1, Math.max(0, t));
  const scaled = clamped * (RAINBOW.length - 1);
  const index = Math.min(RAINBOW.length - 2, Math.floor(scaled));
  const from = toRgb(RAINBOW[index]!);
  const to = toRgb(RAINBOW[index + 1]!);
  const k = scaled - index;
  return sgr([0, 1, 2].map(i => Math.round(from[i]! + (to[i]! - from[i]!) * k)) as unknown as Rgb);
}

export function charWidth(char: string): number {
  const cp = char.codePointAt(0) ?? 0;
  if (cp === 0x200d || (cp >= 0xfe00 && cp <= 0xfe0f) || (cp >= 0x300 && cp <= 0x36f)) return 0;
  const wide =
    cp >= 0x1100 &&
    (cp <= 0x115f ||
      (cp >= 0x2e80 && cp <= 0xa4cf && cp !== 0x303f) ||
      (cp >= 0xac00 && cp <= 0xd7a3) ||
      (cp >= 0xf900 && cp <= 0xfaff) ||
      (cp >= 0xfe30 && cp <= 0xfe6f) ||
      (cp >= 0xff00 && cp <= 0xff60) ||
      (cp >= 0xffe0 && cp <= 0xffe6) ||
      (cp >= 0x1f300 && cp <= 0x1faff) ||
      (cp >= 0x20000 && cp <= 0x3fffd));
  return wide ? 2 : 1;
}

export function textWidth(text: string): number {
  let width = 0;
  for (const char of text) width += charWidth(char);
  return width;
}

export function itemWidth(item: Item): number {
  return item.reduce((sum, [text]) => sum + textWidth(text), 0);
}

export function paintItem(item: Item): string {
  return item.map(([text, color]) => paint(text, color)).join('');
}

export function stripAnsi(text: string): string {
  return text.replace(/\x1b\[[0-9;]*m/g, '');
}
