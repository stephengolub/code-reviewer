# code-reviewer

A **code comprehension tool** for pull requests. It helps the human reviewer understand
a change faster — then offers advisory notes they can take or leave. It does not replace
the reviewer or gate the merge. You stay in the driver's seat; the tool helps you read.

Powered by OpenCode. Works with any model provider. Out of the box for **Python,
TypeScript, and Rust**; extends to any language OpenCode's LSP supports.

## The idea

Reviewing agent-generated diffs and other people's PRs is mostly a *reading* problem:
holding the changed call paths in your head, separating real logic from boilerplate,
finding the tests, knowing what a change ripples into. This tool decorates the diff so
that reading is faster — and surfaces things worth a closer look as advisory notes, not
verdicts.

## What it gives you

On every PR, it posts a comment built to aid comprehension:

- **Call graph** — a Mermaid diagram of how the changed functions call each other, so
  you see the *shape* of the change before reading a line. Cross-language (Python,
  TypeScript, Rust) via tree-sitter. Includes a mermaid.live link for full interactive
  viewing. This is the headline feature — nothing else in the PR tooling space does this.
- **PR summary** — what the change does in plain language, plus its stated goals
- **Files changed table** — categorized logic / test / config / boilerplate, core-logic
  first, so the real change isn't buried under generated files
- **Test co-location** — each changed logic file paired with its tests, side-by-side,
  so you don't have to hunt
- **Boilerplate collapse** — generated and config files folded away so they don't
  dominate reading
- **Advisory notes** — things worth a closer look: potential bugs, security concerns,
  missing tests, smells. Framed as a reviewer's notes ("worth checking…", "I'd look
  at…"), not as pass/fail judgments. You decide what matters.

Want to dig in interactively? The companion [OpenCode plugin](#interactive-comprehension-the-plugin)
gives you the same call graph and comprehension skill as a conversational partner in
your terminal — point it at any PR URL or local diff and ask questions.

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

## Customizing what the tool notices

The tool has two tiers of advisory notes:

**Tier 1 — Security flags (always on, can't be disabled).** Always surfaces potential
security concerns — hardcoded secrets, injection patterns, weak crypto, path traversal,
missing authorization — so they're never silently skipped. Framed as flags for the
reviewer to judge, not automatic rejections. You still decide.

**Tier 2 — Comprehension baseline (fully overridable).** Default notes on code quality,
structure, and test coverage. Tune these to match your project's conventions.

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

### Acknowledge a security flag

If a Tier 1 flag is a false positive, acknowledge it inline with a reason — the flag
stays visible in the review comment but is marked as noted:

```python
password = "hunter2"  # review-ignore: HARDCODED_SECRET — test fixture, not production
```

The flag moves from ❌ to ⚠️ acknowledged, logged visibly. It is never silently hidden —
it remains in the comment for reviewers to see.

## Interactive comprehension: the plugin

The companion OpenCode plugin brings the same comprehension tools into your local
terminal as a conversational session — not a report, but a thinking partner.

```
/code-review https://github.com/owner/repo/pull/42
/code-review                   # review current working-tree diff
/code-review main..my-branch   # review a branch
```

In a session you can:
- Ask "show me the call graph for these files" → gets a Mermaid diagram + mermaid.live link
- Ask "what does this function affect?" → traces call paths via tree-sitter
- Ask "walk me through the auth changes" → conversational, file by file
- Ask "is this already discussed in the PR thread?" → loads existing comments first

The plugin is the purest expression of comprehension-first: you read the diff at your
own pace, the tool answers questions, and nothing is posted anywhere unless you ask.

**Setup:** add to your `opencode.json`:

```json
{
  "plugin": ["/path/to/code-reviewer/plugin"]
}
```

Symlink the companion skill into your global config:

```bash
mkdir -p ~/.config/opencode/skills/code-review
ln -sf /path/to/code-reviewer/plugin/skills/code-review/SKILL.md \
       ~/.config/opencode/skills/code-review/SKILL.md
```

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
