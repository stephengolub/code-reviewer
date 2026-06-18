# Configuration

## Action inputs

| Input | Required | Default | Description |
|---|---|---|---|
| `model` | No | `anthropic/claude-sonnet-4-5` | Model to use. Format: `provider/model-id`. See [OpenCode providers docs](https://opencode.ai/docs/providers). |
| `api_key` | No* | — | API key for your model provider. Use with `api_key_env_var` to set the correct env var. |
| `api_key_env_var` | No | `ANTHROPIC_API_KEY` | Environment variable name OpenCode reads the API key from. Set this when using a non-Anthropic provider. |
| `anthropic_api_key` | No* | — | Anthropic API key shorthand. Equivalent to `api_key` + `api_key_env_var=ANTHROPIC_API_KEY`. Kept for backward compatibility. |
| `github_token` | Yes | — | GitHub token for posting review comments. Use `${{ secrets.GITHUB_TOKEN }}`. |

*One of `api_key` or `anthropic_api_key` is required. Use `anthropic_api_key` for
Anthropic (the default). Use `api_key` + `api_key_env_var` for any other provider.

## Required secrets

| Secret | Description |
|---|---|
| *(your provider key)* | API key for your chosen model provider, stored as an Actions secret under the name you pass to `api_key_env_var`. |
| `GITHUB_TOKEN` | Automatically available in all GitHub Actions workflows — no setup needed. |

The environment variable name varies by provider. Common examples:

| Provider | `api_key_env_var` value | Where to get the key |
|---|---|---|
| Anthropic (default) | `ANTHROPIC_API_KEY` | [console.anthropic.com](https://console.anthropic.com) |
| OpenAI | `OPENAI_API_KEY` | [platform.openai.com](https://platform.openai.com) |
| Google | `GOOGLE_GENERATIVE_AI_API_KEY` | [aistudio.google.com](https://aistudio.google.com) |
| Groq | `GROQ_API_KEY` | [console.groq.com](https://console.groq.com) |

For the full list of supported providers and their environment variable names, see the
[OpenCode providers documentation](https://opencode.ai/docs/providers).

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

Any model provider supported by OpenCode works. The `model` input takes the format
`provider/model-id`. For a complete list of providers, model IDs, and their API key
environment variable names, see the
[OpenCode providers documentation](https://opencode.ai/docs/providers).

Recommended starting points:

| Model | Provider | Speed | Quality |
|---|---|---|---|
| `anthropic/claude-sonnet-4-5` | Anthropic | Fast | High |
| `anthropic/claude-opus-4-8` | Anthropic | Slower | Highest |
| `openai/gpt-4o` | OpenAI | Fast | High |
| `google/gemini-2.0-flash` | Google | Fastest | Good |

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

**With Anthropic (default):**

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

**With any other provider** (OpenAI shown as example):

```yaml
      - uses: stephengolub/code-reviewer@v1
        with:
          model: openai/gpt-4o
          api_key: ${{ secrets.OPENAI_API_KEY }}
          api_key_env_var: OPENAI_API_KEY
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
