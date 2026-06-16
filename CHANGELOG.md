# Changelog

## Unreleased

### Added
- `action.yml` composite action — correct `uses: stephengolub/code-reviewer@v1` step syntax
- Phase 0A: structured PR review prompt covering quality, security, test co-location,
  and boilerplate collapse
- Per-repo standards: reviewer reads `AGENTS.md` (`## Review Standards` section) and
  `.review/standards.yml` before each review and applies project-specific rules
- `docs/standards.md` — full guide to customizing review standards via `AGENTS.md`
  prose and `.review/standards.yml` structured config, including full schema reference
- README with 5-minute adoption guide
- `docs/configuration.md` covering all Action inputs, secrets, and workflow options

### Fixed
- Workflow was incorrectly structured as a reusable workflow instead of a composite
  action; converted to `action.yml` so `uses: stephengolub/code-reviewer@v1` works
  correctly as a step
