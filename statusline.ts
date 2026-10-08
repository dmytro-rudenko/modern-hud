#!/usr/bin/env node
import { readdirSync } from 'node:fs';
import { homedir } from 'node:os';
import { join } from 'node:path';
import { pathToFileURL } from 'node:url';

import { COLOR, paint } from './src/ansi.ts';
import { toInstruments } from './src/hud-adapter.ts';
import { renderLines } from './src/layout.ts';
import { buildPanels } from './src/panel.ts';

const SEMVER = /^\d+\.\d+\.\d+$/;

export function findClaudeHud(configDir: string): string | null {
  const cache = join(configDir, 'plugins', 'cache');
  const found: { version: number[]; dir: string }[] = [];
  let marketplaces: string[];
  try {
    marketplaces = readdirSync(cache);
  } catch {
    return null;
  }
  for (const marketplace of marketplaces) {
    const root = join(cache, marketplace, 'claude-hud');
    let versions: string[];
    try {
      versions = readdirSync(root);
    } catch {
      continue;
    }
    for (const version of versions) {
      if (SEMVER.test(version)) found.push({ version: version.split('.').map(Number), dir: join(root, version) });
    }
  }
  found.sort((a, b) => a.version[0]! - b.version[0]! || a.version[1]! - b.version[1]! || a.version[2]! - b.version[2]!);
  return found.at(-1)?.dir ?? null;
}

function terminalWidth(): number | null {
  const fromEnv = Number.parseInt(process.env.COLUMNS ?? '', 10);
  if (Number.isFinite(fromEnv) && fromEnv > 0) return fromEnv;
  return process.stdout.columns ?? null;
}

const note = (message: string): void => console.log(paint(`modern-hud: ${message}`, COLOR.label));
const reason = (error: unknown): string => (error instanceof Error ? error.message : String(error));

export async function run(): Promise<void> {
  const hudDir = findClaudeHud(process.env.CLAUDE_CONFIG_DIR ?? join(homedir(), '.claude'));
  if (!hudDir) {
    note('claude-hud не знайдено');
    return;
  }

  let main: (overrides: { render: (ctx: unknown) => void }) => Promise<void>;
  let nativeRender: (ctx: unknown) => void;
  try {
    const load = (file: string) => import(pathToFileURL(join(hudDir, 'dist', file)).href);
    ({ main } = await load('index.js'));
    ({ render: nativeRender } = await load('render/index.js'));
    if (typeof main !== 'function' || typeof nativeRender !== 'function') throw new Error('main/render відсутні');
  } catch (error) {
    note(`claude-hud не знайдено (${reason(error)})`);
    return;
  }

  let getOutputSpeed: ((stdin: unknown) => number | null) | null = null;
  try {
    ({ getOutputSpeed } = await import(pathToFileURL(join(hudDir, 'dist', 'speed-tracker.js')).href));
  } catch {
    getOutputSpeed = null;
  }

  await main({
    render: ctx => {
      let lines: string[] | null;
      try {
        const width = terminalWidth();
        let speed: number | null = null;
        try {
          speed = getOutputSpeed?.((ctx as { stdin?: unknown }).stdin) ?? null;
        } catch {
          speed = null;
        }
        lines = width === null ? null : renderLines(buildPanels(toInstruments(ctx, { now: Date.now(), speed })), width);
      } catch (error) {
        nativeRender(ctx);
        note(`fallback (${reason(error)})`);
        return;
      }
      if (lines === null) {
        nativeRender(ctx);
        return;
      }
      for (const line of lines) console.log(line);
    },
  });
}

if (import.meta.main) await run();
