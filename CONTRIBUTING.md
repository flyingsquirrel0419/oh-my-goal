# Contributing

Thanks for helping improve oh-my-goal.

## Development Setup

```bash
npm ci
npm run check
npm run build
```

## Quality Gates

Before opening a pull request, run:

```bash
npm run typecheck
npm run lint
npm run format:check
npm run build
```

Use `npm run format` and `npm run lint:fix` for automatic fixes.

## Pull Requests

- Keep changes focused.
- Include tests or a smoke-test note for behavior changes.
- Update `README.md` or `CHANGELOG.md` when user-facing behavior changes.
- Do not commit `node_modules/`, `dist/`, or local `.opencode/goal.json` state.

## Releases

Releases are published from GitHub Actions when the `NPM_TOKEN` repository secret is configured. If the token is missing, the release workflow exits successfully and records a skipped summary.
