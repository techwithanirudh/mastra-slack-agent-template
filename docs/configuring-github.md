# Configure GitHub Access

GitHub access is optional. Without `GITHUB_TOKEN`, the agent can still clone
public repositories, but authenticated `gh` commands and private repositories
are unavailable.

## 1. Choose an identity

For a personal installation, use your existing GitHub account. For shared
automation, create one dedicated machine-user account manually at
[GitHub](https://github.com/). Verify its email, enable two-factor
authentication, and grant it access only to repositories the agent should use.
GitHub does not permit automated account creation.

## 2. Create a token

Create a
[fine-grained personal access token](https://github.com/settings/personal-access-tokens/new)
with:

- A short expiration.
- The dedicated account or target organization as resource owner.
- Only the repositories the agent should access.
- `Contents` read access for cloning and inspection, or read and write access
  when the agent should push branches.
- `Pull requests` read access, or read and write access when it should open or
  edit pull requests.
- `Issues` read access, or read and write access when it should manage issues.
- `Actions` read access when it should inspect workflow runs.

GitHub grants metadata read access automatically. Add other permissions only
for a workflow that demonstrably needs them. Use GitHub's
[permission reference](https://docs.github.com/en/rest/authentication/permissions-required-for-fine-grained-personal-access-tokens)
to map a failing API operation to the smallest additional permission.

Do NOT select every permission. A leaked all-permissions token exposes every
resource the account can reach.

## Classic token fallback

Use a
[personal access token (classic)](https://github.com/settings/tokens/new) only
when fine-grained tokens cannot support the required repositories or GitHub CLI
operation. Set an expiration and select:

- `repo` for private repository access and repository writes.
- `read:org` only when organization or team membership lookup is required.
- `workflow` only when the agent must modify GitHub Actions workflow files.

Do NOT tick every scope. Classic tokens apply broad scopes across repositories
the account can access, and GitHub recommends fine-grained tokens instead.

## 3. Configure the template

Put the token in the host `.env`:

```bash
GITHUB_TOKEN="github_pat_..."
```

Restart the user-managed bot after changing `.env`. Do not paste the token into
Slack, a skill, a prompt, or a committed file.

## 4. Verify

Ask the running agent to execute these checks in its sandbox:

```bash
gh auth status
gh api user --jq .login
gh repo view OWNER/REPOSITORY --json nameWithOwner,viewerPermission
```

For write access, use a disposable branch in a test repository before granting
the account access to production repositories. If an operation returns `403`,
add only the permission named by the relevant GitHub API documentation.
