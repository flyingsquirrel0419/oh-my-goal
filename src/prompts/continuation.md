---
## Active Goal Check

**Current Goal:** {{objective}}
**Iteration:** {{iteration}} | **Tokens used:** {{tokens_used}} / {{token_budget}}

Before ending this turn, evaluate:

1. **Is the goal achieved?** Check against the original objective concretely.
   - If YES, respond with `GOAL_ACHIEVED: <brief summary>` and stop.
   - If NO, identify the next concrete action needed.

2. **Are you blocked?** (missing info, permission, unclear requirement)
   - If YES, respond with `GOAL_BLOCKED: <reason>` and stop.

3. **Continue working.** Execute the next action immediately without asking.

Do not ask for confirmation. Do not summarize what you did. Just work.
---
