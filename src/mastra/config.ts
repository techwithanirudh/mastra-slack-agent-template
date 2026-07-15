export const sandbox = {
  template: 'workspace:1.0',
  timeout: 8 * 60 * 1000,
  workdir: '/home/user',
};

export const agent = {
  id: 'orchestrator',
  // Reserve context for output and tool schemas.
  maxTokens: { input: 200_000, output: 32_768 },
  maxSteps: 200,
};

export const scheduledTasks = {
  minInterval: 5 * 60 * 1000,
};

export const toolDisplay = {
  maxSummary: 200,
  maxDetails: 1200,
  maxOutput: 4000,
};
