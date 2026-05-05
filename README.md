# oh-my-goal

Codex-style `/goal` loops for OpenCode.

Set one objective and the plugin keeps injecting a continuation prompt while the session is idle until the agent reports `GOAL_ACHIEVED`, blocks, pauses, or reaches its budget.

## Install

```bash
npm i -g oh-my-goal
```

Add it to `opencode.json`:

```json
{
  "plugin": ["oh-my-goal"]
}
```

## Usage

```text
/goal fix the login redirect bug
/goal status
/goal pause
/goal resume
/goal clear
```

You can override the default token budget when creating a goal:

```text
/goal raise payment module test coverage to 80% --token-budget 100000
```

## How It Works

The plugin stores project-local goal state in `.opencode/goal.json`.

When a goal is `pursuing`, each `session.idle` event injects a continuation prompt into the active session. The prompt asks the agent to concretely audit whether the original objective is done. If it is not done, the agent continues immediately.

The loop stops when:

- The assistant emits `GOAL_ACHIEVED: <summary>`
- The assistant emits `GOAL_BLOCKED: <reason>`
- `/goal pause` or `/goal clear` is used
- The token budget or max iteration limit is reached

Goal state is also added to compaction context so the loop can resume after OpenCode compacts the session.

## State File

`.opencode/goal.json` follows this shape:

```json
{
  "objective": "fix the login redirect bug",
  "status": "pursuing",
  "created_at": "2026-05-05T10:00:00.000Z",
  "updated_at": "2026-05-05T10:02:00.000Z",
  "token_budget": 50000,
  "tokens_used": 12400,
  "iteration": 3,
  "max_iterations": 100,
  "budget_warning_sent": false,
  "history": [
    {
      "iteration": 1,
      "summary": "Injected continuation prompt.",
      "status": "in_progress",
      "created_at": "2026-05-05T10:01:00.000Z"
    }
  ]
}
```

## Development

```bash
npm install
npm run typecheck
npm run build
```

## Notes

OpenCode's plugin surface is evolving. `oh-my-goal` uses the documented hooks from the OpenCode plugin docs and defensive output mutation for TUI affordances so it remains tolerant of minor SDK shape changes.
