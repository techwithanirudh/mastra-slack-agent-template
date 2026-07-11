interface SlackPlatformError extends Error {
  code: 'slack_webapi_platform_error';
  data: { error: string; needed?: string };
}

function isSlackPlatformError(error: Error): error is SlackPlatformError {
  return (error as { code?: unknown }).code === 'slack_webapi_platform_error';
}

const SLACK_ERROR_HINTS: Record<string, string> = {
  channel_not_found: 'Channel not found, or the bot is not a member of it.',
  not_in_channel: 'The bot is not a member of that channel.',
  rate_limited: 'Slack rate-limited this request, try again shortly.',
  restricted_action: 'Blocked by a workspace restriction.',
};

export function formatChatError(error: Error): string {
  if (isSlackPlatformError(error)) {
    const code = error.data.error;
    if (code === 'missing_scope') {
      const scope = error.data.needed;
      return scope
        ? `*Missing Slack permission:* \`${scope}\`. Add it in \`slack-manifest.json\` and reinstall the app.`
        : '*Missing Slack permission.* Add the required OAuth scope in `slack-manifest.json` and reinstall the app.';
    }
    const hint = SLACK_ERROR_HINTS[code];
    return `*Slack error:* \`${code}\`${hint ? `. ${hint}` : ''}`;
  }
  return `*Oops, something went wrong.*\n\n> ${error.message}`;
}
