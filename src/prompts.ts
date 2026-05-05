import type { Goal } from "./goal-store.js"

export const continuationPrompt = `---
## Active Goal Check

**Current Goal:** {{objective}}
**Iteration:** {{iteration}} | **Tokens used:** {{tokens_used}} / {{token_budget}}

Before ending this turn, evaluate:

1. **Is the goal achieved?** Check against the original objective concretely.
   - If YES, respond with \`GOAL_ACHIEVED: <brief summary>\` and stop.
   - If NO, identify the next concrete action needed.

2. **Are you blocked?** (missing info, permission, unclear requirement)
   - If YES, respond with \`GOAL_BLOCKED: <reason>\` and stop.

3. **Continue working.** Execute the next action immediately without asking.

Do not ask for confirmation. Do not summarize what you did. Just work.
---`

export const budgetLimitPrompt = `---
## Token Budget Warning

Token budget is nearly exhausted ({{tokens_used}} / {{token_budget}}).

Prioritize:
1. Committing any completed work
2. Documenting current progress and blockers
3. Leaving the codebase in a clean state

Do not start new major changes.
---`

export const achievedPrompt = `---
## Goal Achieved

The goal "{{objective}}" has been marked as achieved after {{iteration}} iterations.

Provide a final summary:
- What was accomplished
- Files changed
- How to verify the result
---`

export function renderPrompt(template: string, goal: Goal): string {
  return template
    .replaceAll("{{objective}}", goal.objective)
    .replaceAll("{{iteration}}", String(goal.iteration))
    .replaceAll("{{tokens_used}}", String(goal.tokens_used))
    .replaceAll("{{token_budget}}", String(goal.token_budget))
}
