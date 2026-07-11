import type {
  ProcessOutputResultArgs,
  ProcessOutputStepArgs,
} from '@mastra/core/processors';
import { agent as agentConfig, sandbox as sandboxConfig } from '../config';
import { resolveE2BSandbox } from '../workspace';

const sandboxTools = new Set([
  'execute_command',
  'get_process_output',
  'kill_process',
  'get_slack_file',
  'upload_file',
  'read_file',
  'write_file',
  'edit_file',
  'list_files',
  'delete_file',
  'file_stat',
  'mkdir',
  'grep',
  'ast_edit',
]);

export const sandbox = {
  id: 'sandbox',
  name: 'Sandbox Lifecycle',
  description:
    'Extends sandbox lifetime during tool use and pauses after root turns.',
  async processOutputStep(args: ProcessOutputStepArgs) {
    const { toolCalls, requestContext, messages } = args;
    if (
      requestContext &&
      toolCalls?.some(
        (t) =>
          t.toolName.startsWith('mastra_workspace_') ||
          sandboxTools.has(t.toolName)
      )
    ) {
      try {
        const sandbox = await resolveE2BSandbox(requestContext);
        await sandbox?.retryOnDead(() =>
          sandbox.e2b.setTimeout(sandboxConfig.timeout)
        );
      } catch {
        return messages;
      }
    }
    return messages;
  },
  async processOutputResult(args: ProcessOutputResultArgs) {
    const { agent, requestContext, messages } = args;
    if (agent?.id !== agentConfig.id || !requestContext) {
      return messages;
    }
    try {
      const sandbox = await resolveE2BSandbox(requestContext);
      await sandbox?.retryOnDead(() => sandbox.e2b.pause());
    } catch {
      return messages;
    }
    return messages;
  },
};
