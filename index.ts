import type { Plugin } from "@opencode-ai/plugin"

import { createGoalCommandHandler } from "./src/handlers/command.js"
import { createGoalLoopHandler } from "./src/handlers/loop.js"
import { createGoalStore } from "./src/goal-store.js"

export const OhMyGoal: Plugin = async (ctx) => {
  const root = ctx.directory || ctx.worktree
  const store = createGoalStore(root)
  const command = createGoalCommandHandler(store)
  const loop = createGoalLoopHandler(store, ctx.client)

  await loop.log(ctx.client, "info", `oh-my-goal initialized at ${root}`)

  return {
    event: async ({ event }: { event: { type: string; properties?: unknown } }) => {
      if (event.type === "tui.command.execute") {
        await command.handle(event.properties, {})
      }
      if (event.type === "command.executed") {
        await command.handle(event.properties, {})
      }
      if (event.type === "session.idle") {
        await loop.handleSessionIdle(event.properties, {})
      }
      if (event.type === "message.updated") {
        await loop.handleMessageUpdated(event.properties, {})
      }
    },
    "tui.command.execute": async (input: unknown, output: unknown) => {
      await command.handle(input, output)
    },
    "command.execute.before": async (input: unknown, output: unknown) => {
      await command.handle(input, output)
    },
    "session.idle": async (input: unknown, output: unknown) => {
      await loop.handleSessionIdle(input, output)
    },
    "message.updated": async (input: unknown, output: unknown) => {
      await loop.handleMessageUpdated(input, output)
    },
    "experimental.session.compacting": async (input: unknown, output: unknown) => {
      await loop.handleCompacting(input, output)
    },
  } as never
}

export default OhMyGoal
