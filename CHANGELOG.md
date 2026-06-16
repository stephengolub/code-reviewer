# Changelog

## Unreleased — Phase 0B

### Added
- `action.yml` composite action — correct `uses: stephengolub/code-reviewer@v1` step syntax
- Phase 0A: structured PR review prompt covering quality, security, test co-location,
  and boilerplate collapse
- Per-repo standards: reviewer reads `AGENTS.md` (`## Review Standards` section) and
  `.review/standards.yml` before each review and applies project-specific rules
- `docs/standards.md` — full guide to customizing review standards via `AGENTS.md`
  prose and `.review/standards.yml` structured config, including full schema reference
- Call graph (Phase 0B): `src/call-graph.js` uses tree-sitter WASM grammars to extract
  function definitions and call edges from changed files (Python, TypeScript, Rust),
  then renders a Mermaid `graph TD` injected into the PR review comment as
  `## 📊 Call Graph`; 20 tests covering all three languages including the real
  `latency_report.py` fixture from a live PR
- README with 5-minute adoption guide
- `docs/configuration.md` covering all Action inputs, secrets, and workflow options

### Fixed
- Workflow was incorrectly structured as a reusable workflow instead of a composite
  action; converted to `action.yml` so `uses: stephengolub/code-reviewer@v1` works
  correctly as a step
