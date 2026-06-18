# code-reviewer

A cross-language AI code review standard for GitHub PRs. Drop one workflow file into
any repo and get structured, augmented code review on every pull request — covering
quality findings, security issues, test coverage, and boilerplate triage — powered by
OpenCode. Works with any model provider OpenCode supports.

Works out of the box for **Python, TypeScript, and Rust**. Extends to any language
OpenCode's LSP supports.

## What it does

On every PR, it posts a structured review comment containing:

- **PR summary** — restated goals and acceptance criteria at the top
- **Files changed table** — categorized as logic / test / config / boilerplate, ordered
  core-logic first
- **Quality findings** — code smells, design issues, potential bugs, duplication
- **Security findings** — hardcoded secrets, injection, missing auth, weak crypto, and
  more (always on, can't be disabled)
- **Test co-location** — each changed logic file paired with its tests, quoted
  side-by-side
- **Boilerplate collapse** — generated/boilerplate files collapsed into a `<details>`
  block so they don't dominate the review
- **Inline comments** — high-severity findings anchored to the specific lines

## 5-minute setup

### 1. Add the workflow

Create `.github/workflows/code-review.yml` in your repo:

```yaml
name: Code Review

on:
  pull_request:
    types: [opened, synchronize, reopened, ready_for_review]

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

### 2. Add your API key

In your repo's **Settings → Secrets and variables → Actions**, add the API key for
your chosen model provider. The default model is `anthropic/claude-sonnet-4-5`, so the
default secret name is `ANTHROPIC_API_KEY`.

For other providers, set `api_key_env_var` to the correct environment variable name and
store your key under that name in Actions secrets. OpenCode supports Anthropic, OpenAI,
Google, Groq, and more — see the
[OpenCode providers documentation](https://opencode.ai/docs/providers) for the full list
of supported providers and their environment variable names.

That's it. Open a PR and the review runs automatically.

## Customizing standards

The review has two tiers:

**Tier 1 — Security floor (always on, can't be disabled).** Flags hardcoded secrets,
injection vulnerabilities, weak crypto, path traversal, missing authorization, and more.
This runs regardless of your configuration.

**Tier 2 — Loose baseline (fully overridable).** Default quality and style findings.
Tune these to match your project's conventions.

### Tune via `AGENTS.md`

Add a `## Review Standards` section to your repo's `AGENTS.md`:

```markdown
## Review Standards

- We use repository pattern — flag direct DB calls outside of repositories.
- `app/legacy/**` is frozen code; don't suggest refactors there.
- Our acceptance criteria live in linked Linear issues, not the PR body.
- Prefer early returns over nested conditionals.
```

### Tune via `.review/standards.yml`

For structured configuration:

```yaml
ignore_paths:
  - "vendor/**"
  - "**/*.generated.ts"
boilerplate_patterns:
  - "**/migrations/**"
  - "**/fixtures/**"
acceptance_criteria_source:
  type: github_issue   # github_issue | pr_body | none
smell_severity:
  long_method: warn    # off | info | warn | error
  duplicate_code: warn
```

See [docs/standards.md](docs/standards.md) for the full schema reference.

### Suppress a security finding

If a Tier 1 security finding is a false positive, suppress it inline with a reason:

```python
password = "hunter2"  # review-ignore: HARDCODED_SECRET — test fixture, not production
```

The finding is demoted from ❌ to ⚠️ acknowledged and logged visibly in the review
comment. It is never silently hidden.

## Iterative reviews

The reviewer runs on every push to a PR. Rather than accumulating a new comment on
each run, it maintains a **single comment that updates in place**.

On each run the reviewer:
1. Searches the PR's comments for one containing a hidden `<!-- code-reviewer:summary -->` marker
2. If found — edits that comment with the fresh review (reflecting the latest commit)
3. If not found — creates a new comment with the marker embedded

The comment shows which commit it last reviewed:

> _Last reviewed: commit `abc1234` · 2026-06-17T..._

This means you always see one clean, current review rather than a stack of stale ones.
The review reflects the state of the latest push; GitHub's comment edit history
preserves all prior versions if you need to compare.

**All findings (quality and security) are in the summary tables** with `file:line`
references that GitHub auto-links to the diff — no separate inline comments that
orphan when lines move.

## Models

The default model is `anthropic/claude-sonnet-4-5`. Any model provider supported by
OpenCode works. See the [OpenCode providers documentation](https://opencode.ai/docs/providers)
for the full list of providers, model IDs, and their environment variable names.

**Using a non-Anthropic provider:**

```yaml
- uses: stephengolub/code-reviewer@v1
  with:
    model: openai/gpt-4o
    api_key: ${{ secrets.OPENAI_API_KEY }}
    api_key_env_var: OPENAI_API_KEY
    github_token: ${{ secrets.GITHUB_TOKEN }}
```

See [docs/configuration.md](docs/configuration.md) for all action inputs.

## Versioning

Pin to a major tag (`@v1`) rather than `@latest` so engine changes don't silently
alter your review behavior:

```yaml
# Anthropic (default)
- uses: stephengolub/code-reviewer@v1
  with:
    model: anthropic/claude-sonnet-4-5
    anthropic_api_key: ${{ secrets.ANTHROPIC_API_KEY }}
    github_token: ${{ secrets.GITHUB_TOKEN }}

# Any other provider
- uses: stephengolub/code-reviewer@v1
  with:
    model: <provider>/<model-id>
    api_key: ${{ secrets.YOUR_PROVIDER_API_KEY }}
    api_key_env_var: YOUR_PROVIDER_API_KEY_ENV_VAR
    github_token: ${{ secrets.GITHUB_TOKEN }}
```

## License

MIT
