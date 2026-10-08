import { basename } from 'node:path';
import type { Instruments, UsageWindow } from './instruments.ts';

export class AdapterError extends Error {
  constructor(field: string) {
    super(`claude-hud context: unexpected ${field}`);
    this.name = 'AdapterError';
  }
}

type Rec = Record<string, unknown>;

const isRec = (v: unknown): v is Rec => typeof v === 'object' && v !== null && !Array.isArray(v);
const optRec = (v: unknown): Rec => (isRec(v) ? v : {});
const num = (v: unknown): number | null => (typeof v === 'number' && Number.isFinite(v) ? v : null);
const CONTROL = /[\u0000-\u001f\u007f-\u009f‎‏‪-‮⁦-⁩]/g;
const clean = (v: string): string => v.replace(CONTROL, ' ').trim();
const str = (v: unknown): string | null => (typeof v === 'string' && clean(v) !== '' ? clean(v) : null);

function rec(v: unknown, field: string): Rec {
  if (!isRec(v)) throw new AdapterError(field);
  return v;
}

function list(v: unknown, field: string): Rec[] {
  if (!Array.isArray(v)) throw new AdapterError(field);
  return v.filter(isRec);
}

function strings(v: unknown, field: string): string[] {
  if (!Array.isArray(v)) throw new AdapterError(field);
  return v.map(str).filter((item): item is string => item !== null);
}

function time(v: unknown): number | null {
  const ms = v instanceof Date ? v.getTime() : typeof v === 'string' || typeof v === 'number' ? new Date(v).getTime() : NaN;
  return Number.isNaN(ms) ? null : ms;
}

function usageWindow(percent: unknown, resetAt: unknown, now: number): UsageWindow | null {
  const value = num(percent);
  if (value === null) return null;
  const reset = time(resetAt);
  return { percent: Math.round(value), resetInMs: reset === null ? null : Math.max(0, reset - now) };
}

const shortTool = (name: string): string => (/^mcp__.+__.+$/.test(name) ? (name.split('__').pop() ?? name) : name);

export function toInstruments(input: unknown, extras: { now: number; speed: number | null }): Instruments {
  const ctx = rec(input, 'context');
  const stdin = rec(ctx.stdin, 'stdin');
  const transcript = rec(ctx.transcript, 'transcript');
  const display = rec(rec(ctx.config, 'config').display, 'config.display');
  const shown = (flag: string): boolean => display[flag] !== false;
  const { now } = extras;

  const model = optRec(stdin.model);
  const window = optRec(stdin.context_window);
  const current = optRec(window.current_usage);
  const windowTokens = num(window.context_window_size);
  const usedParts = [current.input_tokens, current.cache_creation_input_tokens, current.cache_read_input_tokens].map(num);
  const usedTokens = usedParts.some(part => part !== null) ? usedParts.reduce<number>((sum, part) => sum + (part ?? 0), 0) : null;
  const nativePercent = num(window.used_percentage);
  const percent =
    nativePercent ?? (usedTokens !== null && windowTokens ? (usedTokens / windowTokens) * 100 : 0);

  const lastResponse = time(transcript.lastAssistantResponseAt);
  const ttlSeconds = num(display.promptCacheTtlSeconds);
  const ttlMs = (ttlSeconds !== null && ttlSeconds > 0 ? Math.floor(ttlSeconds) : 300) * 1000;

  const usageData = isRec(ctx.usageData) ? ctx.usageData : null;
  const sessionTokens = isRec(transcript.sessionTokens) ? transcript.sessionTokens : null;
  const memory = isRec(ctx.memoryUsage) ? ctx.memoryUsage : null;
  const git = isRec(ctx.gitStatus) ? ctx.gitStatus : null;
  const advisor = str(transcript.advisorModel);

  const allTools = list(transcript.tools, 'transcript.tools').filter(
    tool => !(shown('showSkills') && tool.name === 'Skill'),
  );
  const counts = new Map<string, number>();
  for (const tool of allTools) {
    if (tool.status === 'running') continue;
    const name = shortTool(str(tool.name) ?? '?');
    counts.set(name, (counts.get(name) ?? 0) + 1);
  }

  const mcpErrors = new Set(strings(transcript.mcpErrors ?? [], 'transcript.mcpErrors'));
  const todos = list(transcript.todos, 'transcript.todos');
  const agents = list(transcript.agents, 'transcript.agents');
  const cwd = str(stdin.cwd) ?? str(optRec(stdin.workspace).current_dir);
  const addedDirs = optRec(stdin.workspace).added_dirs;
  const effort = [str(ctx.effortSymbol), str(ctx.effortLevel)].filter(Boolean).join(' ');

  return {
    model: {
      name: str(model.display_name) ?? str(model.id) ?? '?',
      effort: effort || null,
      advisor: shown('showAdvisor') && advisor ? advisor.replace(/^claude-/, '') : null,
      claudeCode: str(ctx.claudeCodeVersion),
    },
    context: {
      percent: Math.min(100, Math.max(0, Math.round(percent))),
      usedTokens,
      windowTokens,
      cacheRemainingMs: shown('showPromptCache') && lastResponse !== null ? lastResponse + ttlMs - now : null,
      compactions: shown('showCompactions') ? num(transcript.compactionCount) : null,
    },
    usage: usageData
      ? {
          fiveHour: usageWindow(usageData.fiveHour, usageData.fiveHourResetAt, now),
          sevenDay: usageWindow(usageData.sevenDay, usageData.sevenDayResetAt, now),
        }
      : null,
    session: {
      name: shown('showSessionName') ? str(transcript.sessionName) : null,
      duration: shown('showDuration') ? str(ctx.sessionDuration) : null,
      costUsd: shown('showCost') ? num(optRec(stdin.cost).total_cost_usd) : null,
      tokens:
        shown('showSessionTokens') && sessionTokens
          ? ['inputTokens', 'outputTokens', 'cacheCreationTokens', 'cacheReadTokens'].reduce(
              (sum, key) => sum + (num(sessionTokens[key]) ?? 0),
              0,
            )
          : null,
      speed: shown('showSpeed') ? extras.speed : null,
    },
    system: {
      ram:
        memory && num(memory.totalBytes) !== null && num(memory.usedBytes) !== null
          ? {
              usedBytes: num(memory.usedBytes)!,
              totalBytes: num(memory.totalBytes)!,
              percent: Math.round(num(memory.usedPercent) ?? (num(memory.usedBytes)! / num(memory.totalBytes)!) * 100),
            }
          : null,
      config: shown('showConfigCounts')
        ? {
            claudeMd: num(ctx.claudeMdCount) ?? 0,
            rules: num(ctx.rulesCount) ?? 0,
            mcps: num(ctx.mcpCount) ?? 0,
            hooks: num(ctx.hooksCount) ?? 0,
          }
        : null,
    },
    project: {
      name: cwd ? basename(cwd) : '?',
      git: git && str(git.branch)
        ? { branch: str(git.branch)!, dirty: git.isDirty === true, ahead: num(git.ahead) ?? 0, behind: num(git.behind) ?? 0 }
        : null,
      addedDirs: shown('showAddedDirs') && Array.isArray(addedDirs) ? addedDirs.length : 0,
      outputStyle: shown('showOutputStyle') ? str(ctx.outputStyle) : null,
    },
    tools: shown('showTools')
      ? {
          running: allTools
            .filter(tool => tool.status === 'running')
            .slice(-2)
            .map(tool => ({ name: shortTool(str(tool.name) ?? '?'), target: str(tool.target) })),
          completed: [...counts].sort((a, b) => b[1] - a[1]).map(([name, count]) => ({ name, count })),
        }
      : null,
    skills: shown('showSkills') ? strings(transcript.skills, 'transcript.skills') : null,
    mcp: shown('showMcp')
      ? strings(transcript.mcpServers, 'transcript.mcpServers').map(name => ({ name, failed: mcpErrors.has(name) }))
      : null,
    agents: shown('showAgents')
      ? agents.slice(-3).map(agent => {
          const start = time(agent.startTime) ?? now;
          const end = time(agent.endTime) ?? now;
          return {
            type: str(agent.type) ?? 'agent',
            model: str(agent.model),
            description: str(agent.description),
            running: agent.status === 'running',
            seconds: Math.max(0, Math.round((end - start) / 1000)),
          };
        })
      : null,
    todos:
      shown('showTodos') && todos.length > 0
        ? {
            done: todos.filter(todo => todo.status === 'completed').length,
            total: todos.length,
            current: str(todos.find(todo => todo.status === 'in_progress')?.content),
          }
        : null,
  };
}
