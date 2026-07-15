import { createTool } from '@mastra/core/tools';
import { z } from 'zod';
import { resolveTarget, targetSchema } from '../../chat/target';
import { channelContext } from '../../lib/context';
import { getSandbox } from '../../workspace';
import { joinChannel } from './utils';

export const uploadFileTool = createTool({
  id: 'upload_file',
  description:
    'Upload a file from the sandbox to any Slack destination the bot can access. Defaults to the current thread; pass target to send it elsewhere.',
  inputSchema: z.object({
    path: z
      .string()
      .min(1)
      .describe(
        'Path to the file in the sandbox (relative to the working dir).'
      ),
    filename: z
      .string()
      .optional()
      .describe('Optional filename shown in Slack.'),
    comment: z
      .string()
      .optional()
      .describe('Optional message to post alongside the file.'),
    target: targetSchema
      .optional()
      .describe('Optional destination other than the current thread.'),
  }),
  execute: async ({ path, filename, comment, target }, context) => {
    if (!context?.requestContext) {
      throw new Error('No workspace context.');
    }
    const sandbox = await getSandbox(context.requestContext);
    if (!sandbox) {
      throw new Error('No sandbox available.');
    }
    await sandbox.ensureRunning();

    const bytes = await sandbox.retryOnDead(() =>
      sandbox.e2b.files.read(path, { format: 'bytes' })
    );
    const name = filename ?? path.split('/').pop() ?? 'file';

    const ctx = channelContext(context.requestContext);
    const resolved =
      target ??
      (ctx.threadId
        ? { type: 'thread' as const, id: ctx.threadId }
        : undefined);
    if (!resolved) {
      throw new Error('No current thread to upload to.');
    }
    if (resolved.type !== 'user') {
      await joinChannel(resolved.id);
    }
    const destination = await resolveTarget(resolved);

    const sent = await destination.post({
      markdown: comment ?? '',
      files: [{ data: Buffer.from(bytes), filename: name }],
    });

    // The Chat SDK doesn't surface the Slack file id directly on Attachment,
    // but the private download URL it does return embeds it in the path.
    const fileId = sent.attachments
      .map((attachment) => /(F[A-Z0-9]{6,})/.exec(attachment.url ?? '')?.[1])
      .find((id) => id !== undefined);

    return {
      success: true,
      filename: name,
      path,
      fileId,
      message: `Uploaded ${name} to ${target ? `${resolved.type} ${resolved.id}` : 'this Slack thread'}${fileId ? ` (file id: ${fileId}, use it with get_slack_file or embed it in a canvas)` : ''}.`,
    };
  },
});
