# code-reviewer

A cross-language AI code review standard for GitHub PRs. Drop one workflow file into
any repo and get structured, augmented code review on every pull request — covering
quality findings, security issues, test coverage, and boilerplate triage — powered by
OpenCode and Claude.

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

In your repo's **Settings → Secrets and variables → Actions**, add:

- `ANTHROPIC_API_KEY` — your Anthropic API key

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

## Models

The default model is `anthropic/claude-sonnet-4-5`. Any model supported by OpenCode
works — see [docs/configuration.md](docs/configuration.md) for options.

## Versioning

Pin to a major tag (`@v1`) rather than `@latest` so engine changes don't silently
alter your review behavior:

```yaml
- uses: stephengolub/code-reviewer@v1
  with:
    anthropic_api_key: ${{ secrets.ANTHROPIC_API_KEY }}
    github_token: ${{ secrets.GITHUB_TOKEN }}
```

## License

MIT
