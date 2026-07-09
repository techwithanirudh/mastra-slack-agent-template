# Configure Sandboxes

The template runs agent commands and filesystem operations in one isolated E2B
sandbox per Slack thread. Credentials stay on the host.

## Set Up E2B

1. Create an account at [E2B](https://e2b.dev/), create an API key, and add it
   to `.env`:

```dotenv
E2B_API_KEY="e2b_your_api_key"
```

2. Build the template image. E2B Hobby accounts get a one-time $100 usage credit
   (no credit card required):

```bash
bun install
bun run build:template
```

`bun run build:template` uploads the recipe from
`src/mastra/workspace/build-template.ts`. Rebuild after changing the base image,
packages, commands, user, or working directory. Ordinary code changes do not
need a rebuild.

## Customize the Image

Edit `src/mastra/workspace/build-template.ts` to add OS packages, language
runtimes, files, or setup commands. Keep secrets out of the image.

After editing:

```bash
bun run build:template
```

See E2B's [custom template quickstart](https://e2b.dev/docs/template/quickstart)
and [build reference](https://e2b.dev/docs/template/build).
