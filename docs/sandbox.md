# Configure Sandboxes

The template runs agent commands and filesystem operations in one isolated E2B
sandbox per Slack thread. The host process keeps Slack, model, database, and E2B
credentials outside those sandboxes.

## Set Up E2B

1. Create an account at [E2B](https://e2b.dev/).
2. Create or copy an API key from the E2B dashboard.
3. Set the key in the host `.env`:

```dotenv
E2B_API_KEY="e2b_your_api_key"
```

4. Install dependencies and build the template image:

```bash
bun install
bun run build:template
```

E2B currently offers new Hobby accounts a one-time $100 usage credit with no
credit card required. Check the [E2B pricing page](https://e2b.dev/pricing)
before relying on a specific credit amount or usage limit.

`bun run build:template` uploads the image recipe from
`src/mastra/workspace/build-template.ts` under the template name configured in
`src/mastra/config.ts`. Run it during initial setup and again after changing the
base image, installed packages, system commands, user, or working directory.
Ordinary application and prompt changes do not require rebuilding the image.

## Customize the Image

Edit `src/mastra/workspace/build-template.ts` to add operating-system packages,
language packages, files, environment defaults, or setup commands. Keep secrets
out of the image because built templates are reusable artifacts.

After editing the recipe or changing `sandbox.template`, build it again:

```bash
bun run build:template
```

The command waits for E2B to finish the build and prints the resulting template
identifier. Runtime sandboxes will use the configured template on their next
creation.

See E2B's [custom template quickstart](https://e2b.dev/docs/template/quickstart)
and [build reference](https://e2b.dev/docs/template/build) for supported image
operations and build options.

## Switch Providers

Mastra workspaces support multiple sandbox providers. Review the current
[Mastra sandbox guide](https://mastra.ai/docs/workspace/sandbox) and the chosen
provider's package before changing the implementation.

To replace E2B:

1. Install the provider package and add its host credential to `src/env.ts` and
   `.env.example`.
2. Replace `E2BSandbox` construction in `src/mastra/workspace/sandbox.ts`.
3. Update the resolver and return types in `src/mastra/workspace/index.ts`.
4. Replace `E2BFilesystem` with a filesystem or mount arrangement supported by
   the new provider.
5. Recreate equivalent timeout, lifecycle, network, and per-thread cache
   behavior.
6. Remove E2B-specific dependencies and configuration after the replacement
   passes the repository checks and a Slack smoke test.

Do not switch user-directed commands to `LocalSandbox` without reviewing the
security model. In this template, untrusted agent commands are expected to run
outside the host operating system.
