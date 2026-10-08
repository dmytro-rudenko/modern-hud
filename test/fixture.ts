export function hudContext(now: number): Record<string, unknown> {
  return {
    stdin: {
      cwd: '/home/user/projects/my-app',
      model: { id: 'claude-opus-5-5', display_name: 'Opus 5.5' },
      context_window: {
        context_window_size: 1_000_000,
        used_percentage: 17,
        current_usage: { input_tokens: 54, cache_creation_input_tokens: 2_000, cache_read_input_tokens: 168_000 },
      },
      cost: { total_cost_usd: 3.53 },
      workspace: { added_dirs: ['/tmp/extra'] },
    },
    transcript: {
      tools: [
        { id: '1', name: 'Bash', status: 'completed' },
        { id: '2', name: 'Bash', status: 'completed' },
        { id: '3', name: 'mcp__playwright__browser_click', status: 'completed' },
        { id: '4', name: 'Skill', status: 'completed' },
        { id: '5', name: 'Edit', target: 'layout.ts', status: 'running' },
      ],
      skills: ['pasadena:sheldon', 'plugin-authoring'],
      mcpServers: ['playwright', 'verbum-dev'],
      mcpErrors: ['verbum-dev'],
      lastAssistantResponseAt: new Date(now - 48_000),
      sessionTokens: { inputTokens: 54, outputTokens: 15_000, cacheCreationTokens: 200_000, cacheReadTokens: 3_000_000 },
      compactionCount: 0,
      advisorModel: 'claude-fable-5-1',
    },
    config: { display: { showSkills: true } },
    claudeMdCount: 1,
    rulesCount: 0,
    mcpCount: 2,
    hooksCount: 0,
    sessionDuration: '16m',
    gitStatus: { branch: 'feat/panel', isDirty: true, ahead: 1, behind: 0 },
    usageData: {
      fiveHour: 3,
      sevenDay: 21,
      fiveHourResetAt: new Date(now + 10_920_000),
      sevenDayResetAt: new Date(now + 388_800_000),
    },
    memoryUsage: { totalBytes: 33_254_748_160, usedBytes: 11_811_160_064, usedPercent: 36 },
    claudeCodeVersion: '2.1.294',
    effortLevel: 'xhigh',
    effortSymbol: '◕',
  };
}
