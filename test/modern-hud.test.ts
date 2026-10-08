import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { mkdirSync, mkdtempSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { test } from 'node:test';

import { stripAnsi, textWidth } from '../src/ansi.ts';
import { AdapterError, toInstruments } from '../src/hud-adapter.ts';
import { MIN_WIDTH, renderLines } from '../src/layout.ts';
import { buildPanels } from '../src/panel.ts';
import { hudContext } from './fixture.ts';

const NOW = Date.UTC(2026, 9, 8, 12);
const extras = { now: NOW, speed: 82 };
const plain = (lines: string[]): string[] => lines.map(stripAnsi);

test('adapter maps a claude-hud context to instruments', () => {
  const ins = toInstruments(hudContext(NOW), extras);

  assert.equal(ins.model.name, 'Opus 5.5');
  assert.equal(ins.model.effort, '◕ xhigh');
  assert.equal(ins.model.advisor, 'fable-5-1');
  assert.equal(ins.context.percent, 17);
  assert.equal(ins.context.usedTokens, 170_054);
  assert.equal(ins.context.cacheRemainingMs, 252_000);
  assert.deepEqual(ins.usage?.fiveHour, { percent: 3, resetInMs: 10_920_000 });
  assert.equal(ins.session.tokens, 3_215_054);
  assert.deepEqual(ins.project.git, { branch: 'feat/panel', dirty: true, ahead: 1, behind: 0 });
  assert.deepEqual(ins.tools?.completed, [
    { name: 'Bash', count: 2 },
    { name: 'browser_click', count: 1 },
  ]);
  assert.deepEqual(ins.tools?.running, [{ name: 'Edit', target: 'layout.ts' }]);
  assert.deepEqual(ins.mcp, [
    { name: 'playwright', failed: false },
    { name: 'verbum-dev', failed: true },
  ]);
});

test('adapter names the field when the context shape changed', () => {
  const broken = { ...hudContext(NOW), transcript: undefined };
  assert.throws(() => toInstruments(broken, extras), (error: unknown) => error instanceof AdapterError && /transcript/.test(error.message));
});

test('adapter strips terminal control characters from transcript text', () => {
  const ctx = hudContext(NOW);
  ctx.gitStatus = { branch: 'main\x1b]0;pwned\x07\x1b[2J', isDirty: false, ahead: 0, behind: 0 };
  ctx.transcript = { ...(ctx.transcript as object), skills: ['ok\x1b[31m'], tools: [{ name: 'Edit', target: 'do\x9b2Jit', status: 'running' }] };
  const ins = toInstruments(ctx, extras);
  const all = JSON.stringify(ins);

  assert.ok(!/[\u0000-\u001f\u007f-\u009f]/.test(all));
  assert.equal(ins.skills?.[0], 'ok [31m');
});

test('display flags remove readings', () => {
  const ctx = hudContext(NOW);
  ctx.config = { display: { showCost: false, showTools: false, showAdvisor: false } };
  const ins = toInstruments(ctx, extras);

  assert.equal(ins.session.costUsd, null);
  assert.equal(ins.tools, null);
  assert.equal(ins.model.advisor, null);
});

test('every line fills the terminal width exactly', () => {
  const panels = buildPanels(toInstruments(hudContext(NOW), extras));
  for (const width of [120, 121, 140, 173, 220]) {
    const lines = plain(renderLines(panels, width)!);
    for (const line of lines) assert.equal(textWidth(line), width, `width ${width}: ${line}`);
  }
});

test('below the minimum width nothing is drawn', () => {
  const panels = buildPanels(toInstruments(hudContext(NOW), extras));
  assert.equal(renderLines(panels, MIN_WIDTH - 1), null);
});

test('long values wrap instead of being cut', () => {
  const ctx = hudContext(NOW);
  const branch = 'feature/PROJ-1482-rewrite-statusline-cockpit-layout-engine';
  ctx.gitStatus = { branch, isDirty: false, ahead: 0, behind: 0 };
  const lines = plain(renderLines(buildPanels(toInstruments(ctx, extras)), 120)!);
  const joined = lines.map(line => line.slice(0, 40).replace(/[│╭╰─╮╯]/g, '').replace(/^\s*(git)?\s*/, '').trimEnd()).join('');

  assert.ok(!lines.some(line => line.includes('…')));
  assert.ok(joined.includes(branch));
});

test('panels without data keep their frame and show a dash', () => {
  const ctx = hudContext(NOW);
  ctx.transcript = { ...(ctx.transcript as object), skills: [], mcpServers: [] };
  ctx.usageData = null;
  const lines = plain(renderLines(buildPanels(toInstruments(ctx, extras)), 140)!);
  const titles = lines.filter(line => line.startsWith('╭')).join('');

  for (const title of ['USAGE', 'SKILLS · MCP']) assert.ok(titles.includes(`─ ${title} `));
  for (const title of ['AGENTS', 'TODOS']) assert.ok(!titles.includes(title));
  assert.equal(lines.filter(line => /│ —\s+│/.test(line)).length, 2);
});

function fakeClaudeHud(): string {
  const configDir = mkdtempSync(join(tmpdir(), 'modern-hud-'));
  const dist = join(configDir, 'plugins', 'cache', 'claude-hud', 'claude-hud', '9.9.9', 'dist');
  mkdirSync(join(dist, 'render'), { recursive: true });
  writeFileSync(
    join(dist, 'index.js'),
    `export async function main(overrides) {
       const ctx = JSON.parse(process.env.FAKE_CTX);
       overrides.render(ctx);
     }`,
  );
  writeFileSync(join(dist, 'render', 'index.js'), `export function render() { console.log('NATIVE HUD'); }`);
  return configDir;
}

function statusline(env: Record<string, string>): string {
  return stripAnsi(
    execFileSync(process.execPath, [join(import.meta.dirname, '..', 'statusline.ts')], {
      env: { PATH: process.env.PATH ?? '', ...env },
      encoding: 'utf8',
    }),
  );
}

test('statusline draws the panel from claude-hud data', () => {
  const out = statusline({ CLAUDE_CONFIG_DIR: fakeClaudeHud(), COLUMNS: '140', FAKE_CTX: JSON.stringify(hudContext(Date.now())) });
  assert.match(out, /╭─ MODEL /);
  assert.match(out, /Opus 5\.5 ◕ xhigh/);
  assert.doesNotMatch(out, /NATIVE HUD/);
});

test('statusline falls back to the native HUD when the context shape changed', () => {
  const out = statusline({ CLAUDE_CONFIG_DIR: fakeClaudeHud(), COLUMNS: '140', FAKE_CTX: JSON.stringify({ stdin: {} }) });
  assert.match(out, /NATIVE HUD/);
  assert.match(out, /modern-hud: fallback \(.*transcript/);
});

test('statusline hands a narrow terminal to the native HUD', () => {
  const out = statusline({ CLAUDE_CONFIG_DIR: fakeClaudeHud(), COLUMNS: '100', FAKE_CTX: JSON.stringify(hudContext(Date.now())) });
  assert.equal(out.trim(), 'NATIVE HUD');
});

test('statusline reports a missing claude-hud', () => {
  const out = statusline({ CLAUDE_CONFIG_DIR: mkdtempSync(join(tmpdir(), 'modern-hud-empty-')), COLUMNS: '140' });
  assert.match(out, /modern-hud: claude-hud не знайдено/);
});
