export type UsageWindow = { percent: number; resetInMs: number | null };

export type Instruments = {
  model: {
    name: string;
    effort: string | null;
    advisor: string | null;
    claudeCode: string | null;
  };
  context: {
    percent: number;
    usedTokens: number | null;
    windowTokens: number | null;
    cacheRemainingMs: number | null;
    compactions: number | null;
  };
  usage: { fiveHour: UsageWindow | null; sevenDay: UsageWindow | null } | null;
  session: {
    name: string | null;
    duration: string | null;
    costUsd: number | null;
    tokens: number | null;
    speed: number | null;
  };
  system: {
    ram: { usedBytes: number; totalBytes: number; percent: number } | null;
    config: { claudeMd: number; rules: number; mcps: number; hooks: number } | null;
  };
  project: {
    name: string;
    git: { branch: string; dirty: boolean; ahead: number; behind: number } | null;
    addedDirs: number;
    outputStyle: string | null;
  };
  tools: {
    running: { name: string; target: string | null }[];
    completed: { name: string; count: number }[];
  } | null;
  skills: string[] | null;
  mcp: { name: string; failed: boolean }[] | null;
};
