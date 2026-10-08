import { COLOR } from './ansi.ts';
import type { Item } from './ansi.ts';
import type { Instruments, UsageWindow } from './instruments.ts';

export type Row =
  | { kind: 'list'; label: string | null; items: Item[] }
  | { kind: 'meter'; label: string; percent: number };

export type Panel = { title: string; rows: Row[] };

const text = (value: string, color: string = COLOR.value): Item => [[value, color]];
const kv = (label: string, value: string, color?: string): Row => ({ kind: 'list', label, items: [text(value, color)] });
const line = (...items: Item[]): Row => ({ kind: 'list', label: null, items });
const meter = (label: string, percent: number): Row => ({ kind: 'meter', label, percent });
const present = <T>(value: T | null | false | ''): value is T => value !== null && value !== false && value !== '';

export function formatTokens(n: number): string {
  if (n >= 1_000_000) return `${(n / 1_000_000).toFixed(1).replace(/\.0$/, '')}M`;
  if (n >= 1_000) return `${Math.round(n / 1_000)}k`;
  return String(n);
}

export function formatSpan(ms: number): string {
  const seconds = Math.max(0, Math.ceil(ms / 1000));
  const days = Math.floor(seconds / 86_400);
  const hours = Math.floor((seconds % 86_400) / 3600);
  const minutes = Math.floor((seconds % 3600) / 60);
  if (days > 0) return `${days}d ${hours}h`;
  if (hours > 0) return `${hours}h ${minutes}m`;
  return `${minutes}m ${seconds % 60}s`;
}

const gigabytes = (bytes: number): string => String(Math.round(bytes / 1024 ** 3));

function resets(windows: (UsageWindow | null)[]): Row | null {
  const spans = windows.filter(present).map(w => w.resetInMs).filter(present);
  return spans.length ? { kind: 'list', label: 'resets', items: spans.map(ms => text(formatSpan(ms))) } : null;
}

export function buildPanels(ins: Instruments): Panel[] {
  const { model, context, usage, session, system, project, tools, skills, mcp, agents, todos } = ins;
  const cache = context.cacheRemainingMs;
  const git = project.git;
  const config = system.config;
  const configItems = config
    ? (
        [
          [config.claudeMd, 'CLAUDE.md'],
          [config.rules, 'rules'],
          [config.mcps, 'MCPs'],
          [config.hooks, 'hooks'],
        ] as const
      )
        .filter(([count]) => count > 0)
        .map(([count, name]) => text(`${count} ${name}`))
    : [];

  const panels: Panel[] = [
    {
      title: 'MODEL',
      rows: [
        kv('model', [model.name, model.effort].filter(present).join(' '), COLOR.bright),
        model.advisor && kv('advisor', model.advisor),
        model.claudeCode && kv('claude', `v${model.claudeCode.replace(/^v/, '')}`),
      ].filter(present),
    },
    {
      title: 'CONTEXT',
      rows: [
        meter('used', context.percent),
        context.usedTokens !== null && context.windowTokens !== null
          ? kv('tokens', `${formatTokens(context.usedTokens)} / ${formatTokens(context.windowTokens)}`)
          : null,
        cache !== null ? kv('cache', cache > 0 ? formatSpan(cache) : 'expired', cache > 60_000 ? COLOR.ok : cache > 0 ? COLOR.run : COLOR.label) : null,
        context.compactions ? kv('compact', `×${context.compactions}`) : null,
      ].filter(present),
    },
    {
      title: 'USAGE',
      rows: usage
        ? [
            usage.fiveHour && meter('5h', usage.fiveHour.percent),
            usage.sevenDay && meter('7d', usage.sevenDay.percent),
            resets([usage.fiveHour, usage.sevenDay]),
          ].filter(present)
        : [],
    },
    {
      title: 'SESSION',
      rows: [
        session.name && kv('name', session.name),
        session.duration && kv('time', session.duration),
        session.costUsd !== null ? kv('cost', `$${session.costUsd.toFixed(2)}`, COLOR.accent) : null,
        session.tokens !== null ? kv('tokens', formatTokens(session.tokens)) : null,
        session.speed !== null ? kv('speed', `${Math.round(session.speed)} tok/s`) : null,
      ].filter(present),
    },
    {
      title: 'SYSTEM',
      rows: [
        system.ram && meter('ram', system.ram.percent),
        system.ram && kv('memory', `${gigabytes(system.ram.usedBytes)} / ${gigabytes(system.ram.totalBytes)} GB`),
        config && ({ kind: 'list', label: 'config', items: configItems.length ? configItems : [text('—', COLOR.label)] } as Row),
      ].filter(present),
    },
    {
      title: 'PROJECT',
      rows: [
        kv('name', project.name, COLOR.accent),
        git
          ? kv(
              'git',
              [`${git.branch}${git.dirty ? '*' : ''}`, git.ahead > 0 && `↑${git.ahead}`, git.behind > 0 && `↓${git.behind}`]
                .filter(present)
                .join(' '),
              COLOR.info,
            )
          : kv('git', '—', COLOR.label),
        project.addedDirs > 0 ? kv('dirs', `+${project.addedDirs} added`) : kv('dirs', '—', COLOR.label),
        project.outputStyle && kv('style', project.outputStyle),
      ].filter(present),
    },
    {
      title: 'TOOLS',
      rows:
        tools && tools.running.length + tools.completed.length > 0
          ? [
              line(
                ...tools.running.map(
                  (tool): Item => [
                    ['◐ ', COLOR.run],
                    [tool.name, COLOR.info],
                    ...(tool.target ? [[`: ${tool.target}`, COLOR.label] as const] : []),
                  ],
                ),
                ...tools.completed.map(
                  (tool): Item => [
                    ['✓ ', COLOR.ok],
                    [tool.name, COLOR.value],
                    [` ×${tool.count}`, COLOR.label],
                  ],
                ),
              ),
            ]
          : [],
    },
    {
      title: 'SKILLS · MCP',
      rows: [
        skills && skills.length > 0 ? ({ kind: 'list', label: 'skills', items: skills.map(s => text(s)) } as Row) : null,
        mcp && mcp.length > 0
          ? ({ kind: 'list', label: 'mcp', items: mcp.map(s => text(s.failed ? `${s.name} ✘` : s.name, s.failed ? COLOR.bad : COLOR.value)) } as Row)
          : null,
      ].filter(present),
    },
    {
      title: 'AGENTS',
      rows: (agents ?? []).flatMap(agent => [
        line([
          agent.running ? ['◐ ', COLOR.run] : ['✓ ', COLOR.ok],
          [agent.type, agent.running ? COLOR.info : COLOR.value],
          [`${agent.model ? ` [${agent.model}]` : ''} ${formatSpan(agent.seconds * 1000)}`, COLOR.label],
        ]),
        ...(agent.running && agent.description ? [line(text(agent.description))] : []),
      ]),
    },
    {
      title: 'TODOS',
      rows: todos
        ? [
            meter('done', Math.round((todos.done / todos.total) * 100)),
            todos.current ? line([['▸ ', COLOR.accent], [todos.current, COLOR.value]]) : null,
            kv('left', `${todos.total - todos.done} of ${todos.total}`),
          ].filter(present)
        : [],
    },
  ];

  return panels;
}
