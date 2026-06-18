# AGENTS.md — code-reviewer

Context and constraints for coding agents working in this repo.

## Positioning: comprehension tool, not review bot

**This is a code comprehension tool, not a PR review bot.** The distinction matters for
every decision about what to build and how to frame output.

The goal is to help a human reviewer *understand a change faster* — the call graph,
the test co-location, the plain-language summary, the structure before the line-by-line
reading. The tool surfaces advisory notes ("worth checking…") not verdicts ("this is
wrong"). The reviewer decides what matters and whether to merge.

This means:
- The call graph is the headline feature, not a nice-to-have
- Findings are framed as advisory ("I'd look at…"), never as pass/fail
- Security flags are always-on because a reviewer shouldn't accidentally *miss* them,
  not because the tool is a gatekeeper — the reviewer still judges
- "Approve / Request changes" language does not belong in output
- The local interactive plugin (conversational, question-answering) is as important as
  the CI comment

Do not drift toward bot-review framing. Claude Code review and Copilot do that already.
The differentiator is comprehension: the call graph, the local interactive surface, the
reading experience.

## What this repo is

Two sibling surfaces sharing a core, not a single tool:

| Surface | File | Invocation | Output |
|---|---|---|---|
| **CI reviewer** | `action.yml` | `uses: stephengolub/code-reviewer@v1` in any GitHub workflow | Single PR comment, updated in place |
| **Interactive plugin** | `plugin/` | `"plugin": ["/path/to/plugin"]` in `opencode.json` | Conversational session, `/code-review` command |

They share `src/call-graph.js`. Everything else is intentionally separate.

## Architecture decisions — do not reverse without good reason

### The two prompts are different on purpose

The **action prompt** (`action.yml`) is GitHub-shaped: formal voice, emoji section headers,
`<details>` blocks, tables with severity columns, designed for a team reading a PR comment.

The **skill** (`plugin/skills/code-review/SKILL.md`) is terminal-shaped: personal "I"
statement voice, `---` separators, blockquotes, conversational, designed for one person
reading in a TUI.

Do not consolidate them. Do not make the skill emit emoji tables. Do not make the action
prompt use the personal voice. They serve different masters.

### The skill is the single source of truth for interactive review behavior

The `/code-review` command in the plugin is a **thin pointer**:
> "Load the code-review skill, then review $ARGUMENTS"

All review logic — voice, diff dispatch, standards loading, PR state-awareness, call_graph
guidance, output format — lives in `SKILL.md`. If you change review behavior for the
interactive path, change the skill. Do not duplicate behavior into the command template.

### No agent — command + skill is sufficient

There was a `code-reviewer` primary agent. It was removed because it duplicated the skill
(voice drift risk) and the `/code-review` command already simulates "entering a state"
the same way `/review` does in this config. The `cfg.agent` registration is also
undocumented/unofficial in OpenCode's plugin API. Don't re-add the agent.

### tree-sitter over LSP for the call graph

The call graph (`src/call-graph.js`) uses `web-tree-sitter` WASM grammars, not OpenCode's
LSP integration. This was deliberate:

- OpenCode's plugin LSP surface is **diagnostics-only** — no go-to-def, find-refs, or
  call hierarchy exposed to plugins
- tree-sitter is language-agnostic: Python, TypeScript, Rust all use the same pipeline
- No native compilation, no peer-dep conflicts (WASM avoids both)

The grammar versions that work together: `web-tree-sitter@0.24.0` +
`tree-sitter-wasms@^0.1.13`. Do not upgrade `web-tree-sitter` past 0.24.x without
verifying the WASM ABI compatibility with `tree-sitter-wasms`. The 0.26.x line breaks
Language.load() with these grammar files.

### The plugin imports call-graph.js by relative path (option b)

`plugin/src/index.js` imports `../../src/call-graph.js` directly. This means the Action
and the plugin share one copy of the core. Do not duplicate `call-graph.js` into the
plugin. If the core needs to be published as its own npm package (option c), that is a
future decision when a third consumer appears.

### The action uses composite action syntax, not reusable workflow syntax

`action.yml` at the repo root is a **composite action**. Consumers use it as a step:
```yaml
- uses: stephengolub/code-reviewer@v1
```
This is intentional — it's NOT a reusable workflow (`.github/workflows/...`). If you see
`uses:` at the job level pointing to a workflow file, that's the wrong pattern for this
repo.

### The PR comment uses a hidden marker for update-in-place

The action posts ONE comment per PR and updates it on every push. The marker is:
```
<!-- code-reviewer:summary -->
```
This must remain on the first line of the comment body. Do not remove it. Do not change
it without updating the `gh api` search command in the prompt (STEP 1). Changing the
marker is a breaking change for any existing PR that already has a review comment.

### Standards are two-tier

- **Tier 1 (security floor)**: always runs, consumers cannot disable via config
- **Tier 2 (loose baseline)**: overridable via `AGENTS.md ## Review Standards` prose
  and `.review/standards.yml` structured config

Do not add new Tier 2 knobs to `standards.yml` without justification. Every structured
key is a public API commitment once consumers adopt it. Prose in `AGENTS.md` absorbs
nuance; graduate to structured config only when determinism is required. See
`docs/standards.md` for the full schema.

## Repo layout

```
action.yml                   — composite action (CI surface)
src/call-graph.js            — shared core: tree-sitter AST parsing, Mermaid + mermaid.live URL
tests/                       — core tests (23): extractDefinitions, extractEdges, toMermaid,
                               toMermaidLiveUrl, buildCallGraph across Python/TS/Rust
tests/fixtures/              — real files used as test fixtures:
                               latency_report.py (from 0din-ai/litellm-shield#1), simple.ts, simple.rs
package.json                 — web-tree-sitter + tree-sitter-wasms deps for the core
docs/configuration.md        — Action inputs, secrets, workflow options
docs/standards.md            — Tier 2 standards schema, AGENTS.md + standards.yml guide
plugin/                      — OpenCode plugin (interactive surface)
  src/index.js               — call_graph tool + code-review command registration
  skills/code-review/SKILL.md — single source of truth for interactive review behavior
  tests/                     — plugin tests (15): tool output contract, command registration
```

## Testing

```bash
# Core tests (tree-sitter parsing + mermaid generation)
node --test tests/

# Plugin tests (tool + command)
cd plugin && node --test tests/
```

All tests use Node's built-in test runner (`node --test`). No Jest, no Bun required.
Keep both test suites green before committing either surface.

## Distribution

- **CI**: `uses: stephengolub/code-reviewer@v1` — pinned to major tag. The `v1` tag is
  force-updated on every `main` push. Consumers should pin to `@v1`, not `@latest`.
- **Plugin (personal)**: local path in `opencode.json`. Not yet published to npm.
  When publishing, the plugin's `package.json` declares its own deps; `call-graph.js`
  will be bundled at publish time.

## What a future agent should NOT do

- Re-add the agent registration to the plugin
- Consolidate the action prompt and the skill into one file
- Upgrade `web-tree-sitter` without checking WASM ABI compatibility
- Add `.review/standards.yml` keys without documenting them in `docs/standards.md`
- Change the `<!-- code-reviewer:summary -->` marker without updating the search command
- Use `uses:` at the step level for the plugin (it's a composite action, not a workflow)
- Duplicate `call-graph.js` into the plugin directory
