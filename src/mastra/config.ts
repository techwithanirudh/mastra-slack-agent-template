export const sandbox = {
  template: 'agent-workspace:1.0',
  timeout: 8 * 60 * 1000,
  workdir: '/home/user',
};

export const agent = {
  id: 'agent',
  // Leave room for output tokens and system/tool-schema overhead within the
  // selected model's context window.
  maxTokens: { input: 200_000, output: 32_768 },
  maxSteps: 200,
};

export const scheduledTasks = {
  minInterval: 15 * 60 * 1000,
};

export const toolDisplay = {
  maxSummary: 200,
  maxDetails: 1200,
  maxOutput: 4000,
};
