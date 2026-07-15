import type { SandboxNetworkOpts } from 'e2b';
import { env } from '@/env';

export function network(): SandboxNetworkOpts {
  const rules: NonNullable<SandboxNetworkOpts['rules']> = {};

  if (env.AGENTMAIL_API_KEY) {
    rules['api.agentmail.to'] = [
      {
        transform: {
          headers: { Authorization: `Bearer ${env.AGENTMAIL_API_KEY}` },
        },
      },
    ];
  }

  if (env.GITHUB_TOKEN) {
    const apiRule = [
      {
        transform: {
          headers: { Authorization: `Bearer ${env.GITHUB_TOKEN}` },
        },
      },
    ];
    rules['api.github.com'] = apiRule;
    rules['uploads.github.com'] = apiRule;

    rules['github.com'] = [
      {
        transform: {
          headers: {
            Authorization: `Basic ${Buffer.from(
              `x-access-token:${env.GITHUB_TOKEN}`,
              'utf8'
            ).toString('base64')}`,
          },
        },
      },
    ];
  }

  return { rules };
}
