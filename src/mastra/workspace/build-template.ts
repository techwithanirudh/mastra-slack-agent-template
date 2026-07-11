import { defaultBuildLogger, Template } from 'e2b';
import { env } from '@/env';
import { sandbox as config } from '../config';

async function main(): Promise<void> {
  console.log(`[sandbox] building e2b template: ${config.template}`);

  const build = await Template.build(
    Template()
      .fromBaseImage()
      .setEnvs({ HOME: '/home/user' })
      .setUser('root')
      .runCmd('apt-get update')
      .aptInstall(
        [
          'curl',
          'ca-certificates',
          'git',
          'fd-find',
          'ripgrep',
          'imagemagick',
          'ffmpeg',
          'python3-pip',
          'python3-pil',
          'expect',
          'zip',
          'unzip',
          'jq',
          'sudo',
        ],
        { noInstallRecommends: true }
      )
      .runCmd([
        // Repos an agent clones or works in may ship hooks (lefthook, husky) that
        // assume tools/network access the sandbox doesn't have. Point hooksPath
        // at an empty directory so no hook script runs unless a repo explicitly
        // overrides core.hooksPath itself.
        'mkdir -p /etc/git/disabled-hooks',
        'git config --system core.hooksPath /etc/git/disabled-hooks',
        'if command -v fdfind >/dev/null 2>&1; then ln -sf "$(command -v fdfind)" /usr/local/bin/fd; fi',
        'apt-get purge -y nodejs nodejs-doc || true',
        'apt-get autoremove -y || true',
        'curl -fsSL https://deb.nodesource.com/setup_24.x | bash -',
        'curl -fsSL https://cli.github.com/packages/githubcli-archive-keyring.gpg | dd of=/usr/share/keyrings/githubcli-archive-keyring.gpg',
        'chmod go+r /usr/share/keyrings/githubcli-archive-keyring.gpg',
        'echo "deb [arch=$(dpkg --print-architecture) signed-by=/usr/share/keyrings/githubcli-archive-keyring.gpg] https://cli.github.com/packages stable main" | tee /etc/apt/sources.list.d/github-cli.list >/dev/null',
        'apt-get update',
        'apt-get install -y nodejs',
        'apt-get install -y gh',
        'ln -sf /usr/bin/node /usr/local/bin/node && ln -sf /usr/bin/npm /usr/local/bin/npm && ln -sf /usr/bin/npx /usr/local/bin/npx',
        'npm config --global set prefix /usr/local',
        'python3 -m pip install --no-cache-dir --break-system-packages --no-user --upgrade pip',
        'python3 -m pip install --no-cache-dir --break-system-packages --no-user pillow matplotlib numpy pandas requests agentmail',
        'npm install -g agent-browser',
        'bash -lc "yes | agent-browser install --with-deps"',
        'python3 -m pip install --no-cache-dir --break-system-packages --no-user cloakbrowser',
        // CloakBrowser supplies a stealth Chromium binary; agent-browser needs its
        // path and launch args as env vars on every invocation. Both are resolved
        // dynamically (the binary auto-downloads on first use), so they can't be
        // baked in as static template env vars. Shadow the real agent-browser with
        // a wrapper that resolves them and execs through, so every invocation
        // (however execute_command runs it) picks them up without relying on
        // shell profile sourcing.
        'mv /usr/local/bin/agent-browser /usr/local/bin/agent-browser-real',
        `cat > /usr/local/bin/agent-browser <<'CLOAKBROWSER_WRAPPER'
#!/bin/bash
BINARY_PATH=$(python3 -c "from cloakbrowser.download import ensure_binary; print(ensure_binary())")
STEALTH_ARGS=$(python3 -c "from cloakbrowser.config import get_default_stealth_args; print(','.join(get_default_stealth_args()))")
export AGENT_BROWSER_EXECUTABLE_PATH="$BINARY_PATH"
export AGENT_BROWSER_ARGS="$STEALTH_ARGS"
exec agent-browser-real "$@"
CLOAKBROWSER_WRAPPER`,
        'chmod +x /usr/local/bin/agent-browser',
        // Pre-download the stealth binary at build time so the first live
        // sandbox call does not pay for it.
        'python3 -c "from cloakbrowser.download import ensure_binary; ensure_binary()"',
        `chown -R user:user ${config.workdir}`,
      ])
      .setUser('user')
      .setWorkdir(config.workdir),
    config.template,
    { apiKey: env.E2B_API_KEY, onBuildLogs: defaultBuildLogger() }
  );

  console.log(`[sandbox] built e2b template: ${build.templateId}`);
}

main().catch((error: unknown) => {
  console.error('[sandbox] failed to build e2b template', error);
  process.exit(1);
});
