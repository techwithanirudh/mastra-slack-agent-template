import { env } from '@/env';

const placeholder = Buffer.from(
  "nice try, we're not leaking real creds into a sandbox",
  'utf8'
).toString('base64');

export function sandboxEnv(): Record<string, string> {
  return {
    SSL_CERT_FILE: '/usr/lib/ssl/cert.pem',
    GIT_AUTHOR_NAME: 'slack-agent',
    GIT_AUTHOR_EMAIL: 'slack-agent@users.noreply.github.com',
    GIT_COMMITTER_NAME: 'slack-agent',
    GIT_COMMITTER_EMAIL: 'slack-agent@users.noreply.github.com',
    ...(env.AGENTMAIL_API_KEY ? { AGENTMAIL_API_KEY: placeholder } : {}),
    ...(env.GITHUB_TOKEN
      ? {
          GH_TOKEN: placeholder,
          GITHUB_TOKEN: placeholder,
        }
      : {}),
  };
}
