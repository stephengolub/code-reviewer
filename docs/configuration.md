# Configuration

## Action inputs

| Input | Required | Default | Description |
|---|---|---|---|
| `model` | No | `anthropic/claude-sonnet-4-5` | Model to use. Format: `provider/model-id`. See [Models](#models). |
| `anthropic_api_key` | No* | — | Anthropic API key. Required when using an Anthropic model. |
| `github_token` | Yes | — | GitHub token for posting review comments. Use `${{ secrets.GITHUB_TOKEN }}`. |

*Required if using any Anthropic model (the default). Substitute the appropriate input
for other providers — see [Models](#models).

## Required secrets

| Secret | Description |
|---|---|
| `ANTHROPIC_API_KEY` | Anthropic API key. Get one at [console.anthropic.com](https://console.anthropic.com). |
| `GITHUB_TOKEN` | Automatically available in all GitHub Actions workflows — no setup needed. |

For other model providers, substitute the appropriate secret:

| Provider | Secret name | Environment variable |
|---|---|---|
| Anthropic | `ANTHROPIC_API_KEY` | `ANTHROPIC_API_KEY` |
| OpenAI | `OPENAI_API_KEY` | `OPENAI_API_KEY` |
| Google | `GOOGLE_API_KEY` | `GOOGLE_API_KEY` |

## Required permissions

Your workflow needs these permissions for the Action to post review comments:

```yaml
permissions:
  id-token: write      # Required by OpenCode GitHub App
  contents: read       # Read the repository code
  pull-requests: write # Post PR comments and inline review comments
  issues: read         # Read linked issues for acceptance criteria
```

## Models

Any model supported by OpenCode works. Recommended options:

| Model | Speed | Quality | Cost |
|---|---|---|---|
| `anthropic/claude-sonnet-4-5` | Fast | High | Medium |
| `anthropic/claude-opus-4-8` | Slower | Highest | High |
| `anthropic/claude-haiku-3-5` | Fastest | Good | Low |

For a full list of supported models, see the
[OpenCode providers documentation](https://opencode.ai/docs/providers).

## Trigger events

The recommended trigger is `pull_request` with the following types:

```yaml
on:
  pull_request:
    types: [opened, synchronize, reopened, ready_for_review]
```

- `opened` — runs when a PR is first created
- `synchronize` — runs on every new commit pushed to the PR
- `reopened` — runs when a closed PR is reopened
- `ready_for_review` — runs when a draft PR is marked ready

To skip review on draft PRs (recommended — avoids noise during active development):

```yaml
jobs:
  review:
    if: github.event.pull_request.draft == false
```

## Manual trigger

To allow on-demand review via the Actions tab:

```yaml
on:
  pull_request:
    types: [opened, synchronize, reopened, ready_for_review]
  workflow_dispatch:
```

## Limiting to specific branches or paths

Only run on PRs targeting `main`:

```yaml
on:
  pull_request:
    types: [opened, synchronize, reopened, ready_for_review]
    branches: [main]
```

Only run when certain paths change (useful for monorepos):

```yaml
on:
  pull_request:
    types: [opened, synchronize, reopened, ready_for_review]
    paths:
      - "src/**"
      - "!src/generated/**"
```

## Full example workflow

```yaml
name: Code Review

on:
  pull_request:
    types: [opened, synchronize, reopened, ready_for_review]
    branches: [main]

jobs:
  review:
    runs-on: ubuntu-latest
    if: github.event.pull_request.draft == false
    permissions:
      id-token: write
      contents: read
      pull-requests: write
      issues: read
    steps:
      - uses: actions/checkout@v4
        with:
          fetch-depth: 0
          persist-credentials: false

      - uses: stephengolub/code-reviewer@v1
        with:
          model: anthropic/claude-sonnet-4-5
          anthropic_api_key: ${{ secrets.ANTHROPIC_API_KEY }}
          github_token: ${{ secrets.GITHUB_TOKEN }}
```

## Version pinning

Always pin to a major version tag rather than `@latest`:

```yaml
- uses: stephengolub/code-reviewer@v1   # good — stable
- uses: stephengolub/code-reviewer@latest  # avoid — may change behavior
```

To get patch fixes within a major version, re-tag `v1` to point to the latest `v1.x.y`
release. See [CHANGELOG.md](../CHANGELOG.md) for what changes between versions.
