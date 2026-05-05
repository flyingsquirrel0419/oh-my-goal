import type { Goal, GoalStore } from "../goal-store.js"
import { achievedPrompt, budgetLimitPrompt, continuationPrompt, renderPrompt } from "../prompts.js"

const GOAL_ACHIEVED = /\bGOAL_ACHIEVED:\s*(.+)/i
const GOAL_BLOCKED = /\bGOAL_BLOCKED:\s*(.+)/i

export function createGoalLoopHandler(store: GoalStore, client?: unknown) {
  let inFlight = false
  let lastIdleKey = ""
  let lastIdleAt = 0

  async function handleSessionIdle(input: unknown, output: unknown): Promise<void> {
    if (inFlight) return
    const sessionID = extractSessionID(input)
    const idleKey = sessionID || "unknown"
    const now = Date.now()
    if (idleKey === lastIdleKey && now - lastIdleAt < 2_000) return
    lastIdleKey = idleKey
    lastIdleAt = now

    const goal = await store.read()
    if (!goal || goal.status !== "pursuing") return

    if (goal.tokens_used >= goal.token_budget) {
      await store.setStatus("budget-limited", "Token budget exhausted.")
      setToast(output, "Goal budget exhausted", goal.objective, "warning")
      return
    }

    if (goal.iteration >= goal.max_iterations) {
      await store.setStatus("budget-limited", "Maximum goal iterations reached.")
      setToast(output, "Goal iteration limit reached", goal.objective, "warning")
      return
    }

    const shouldWarn = !goal.budget_warning_sent && goal.tokens_used >= goal.token_budget * 0.9
    const next = await store.update((current) => ({
      ...current,
      iteration: current.iteration + 1,
      budget_warning_sent: current.budget_warning_sent || shouldWarn,
      history: [
        ...current.history,
        {
          iteration: current.iteration + 1,
          summary: shouldWarn ? "Injected budget warning and continuation prompt." : "Injected continuation prompt.",
          status: "in_progress",
          created_at: new Date().toISOString(),
        },
      ],
    }))
    if (!next) return

    const prompt = [
      shouldWarn ? renderPrompt(budgetLimitPrompt, next) : "",
      renderPrompt(continuationPrompt, next),
    ]
      .filter(Boolean)
      .join("\n\n")

    appendPrompt(output, prompt)
    setToast(output, "Goal continuing", `${next.objective} (iteration ${next.iteration})`, "info")

    if (sessionID) {
      inFlight = true
      try {
        await submitPrompt(client, sessionID, prompt)
      } finally {
        inFlight = false
      }
    }
  }

  async function handleMessageUpdated(input: unknown, output: unknown): Promise<void> {
    const goal = await store.read()
    if (!goal || goal.status !== "pursuing") return

    const messageID = extractString(input, ["info.id", "properties.info.id", "event.properties.info.id"])
    if (messageID && messageID === goal.last_message_id) return

    const sessionID = extractSessionID(input)
    const text = await extractResponseText(input, client)
    const tokens = extractTokens(input) ?? estimateTokens(text)
    const achieved = text.match(GOAL_ACHIEVED)
    const blocked = text.match(GOAL_BLOCKED)

    const updated = await store.update((current) => {
      const next: Goal = {
        ...current,
        tokens_used: Math.max(current.tokens_used, tokens ?? current.tokens_used),
        last_message_id: messageID ?? current.last_message_id,
        last_response_text: text || current.last_response_text,
      }

      if (achieved) {
        next.status = "achieved"
        next.history = [
          ...next.history,
          {
            iteration: next.iteration,
            summary: achieved[1]?.trim() || "Goal achieved.",
            status: "achieved",
            created_at: new Date().toISOString(),
          },
        ]
      } else if (blocked) {
        next.status = "blocked"
        next.history = [
          ...next.history,
          {
            iteration: next.iteration,
            summary: blocked[1]?.trim() || "Goal blocked.",
            status: "blocked",
            created_at: new Date().toISOString(),
          },
        ]
      }

      return next
    })

    if (!updated) return

    if (achieved) {
      const prompt = renderPrompt(achievedPrompt, updated)
      appendPrompt(output, prompt)
      setToast(output, "Goal achieved", achieved[1]?.trim() || updated.objective, "success")
      if (sessionID) await submitPrompt(client, sessionID, prompt)
      return
    }

    if (blocked) {
      setToast(output, "Goal blocked", blocked[1]?.trim() || updated.objective, "warning")
    }
  }

  async function handleCompacting(_input: unknown, output: unknown): Promise<void> {
    const goal = await store.read()
    if (!goal) return
    const context = `## oh-my-goal State

- Objective: ${goal.objective}
- Status: ${goal.status}
- Iteration: ${goal.iteration}
- Tokens: ${goal.tokens_used} / ${goal.token_budget}
- Store: ${store.path}

Continue preserving this goal state after compaction.`

    if (isRecord(output) && Array.isArray(output.context)) {
      output.context.push(context)
    }
  }

  async function log(opencodeClient: unknown, level: "info" | "warn" | "error", message: string): Promise<void> {
    const app = isRecord(opencodeClient) ? opencodeClient.app : undefined
    const logger = isRecord(app) ? app.log : undefined
    if (typeof logger !== "function") return
    await logger.call(app, {
      body: {
        service: "oh-my-goal",
        level,
        message,
      },
    })
  }

  return {
    handleSessionIdle,
    handleMessageUpdated,
    handleCompacting,
    log,
  }
}

async function submitPrompt(client: unknown, sessionID: string, text: string): Promise<void> {
  const session = isRecord(client) ? client.session : undefined
  if (!isRecord(session)) return

  const promptAsync = session.promptAsync
  if (typeof promptAsync === "function") {
    await promptAsync.call(session, {
      path: { id: sessionID },
      body: { parts: [{ type: "text", text }] },
    })
    return
  }

  const prompt = session.prompt
  if (typeof prompt === "function") {
    await prompt.call(session, {
      path: { id: sessionID },
      body: { parts: [{ type: "text", text }] },
    })
  }
}

async function extractResponseText(input: unknown, client: unknown): Promise<string> {
  const direct = extractString(input, [
    "text",
    "info.text",
    "properties.text",
    "properties.info.text",
    "event.properties.text",
    "event.properties.info.text",
  ])
  if (direct) return direct

  const sessionID = extractSessionID(input)
  const messageID = extractString(input, ["info.id", "properties.info.id", "event.properties.info.id"])
  if (!sessionID || !messageID) return JSON.stringify(input)

  const session = isRecord(client) ? client.session : undefined
  const messages = isRecord(session) ? session.messages : undefined
  if (typeof messages !== "function") return JSON.stringify(input)

  try {
    const result = await messages.call(session, { path: { id: sessionID } })
    return collectTextForMessage(result, messageID) || JSON.stringify(input)
  } catch {
    return JSON.stringify(input)
  }
}

function collectTextForMessage(value: unknown, messageID: string): string {
  const chunks: string[] = []
  const visit = (node: unknown): void => {
    if (Array.isArray(node)) {
      for (const item of node) visit(item)
      return
    }
    if (!isRecord(node)) return

    const id = typeof node.messageID === "string" ? node.messageID : typeof node.id === "string" ? node.id : undefined
    if (id === messageID && typeof node.text === "string") chunks.push(node.text)
    for (const value of Object.values(node)) visit(value)
  }
  visit(value)
  return chunks.join("\n")
}

function extractTokens(input: unknown): number | undefined {
  const candidates = [
    extractNumber(input, ["info.tokens.total", "properties.info.tokens.total", "event.properties.info.tokens.total"]),
    sumNumbers(input, [
      "info.tokens.input",
      "info.tokens.output",
      "info.tokens.reasoning",
      "info.tokens.cache.read",
      "info.tokens.cache.write",
      "properties.info.tokens.input",
      "properties.info.tokens.output",
      "properties.info.tokens.reasoning",
      "properties.info.tokens.cache.read",
      "properties.info.tokens.cache.write",
    ]),
  ]
  return candidates.find((value): value is number => typeof value === "number" && Number.isFinite(value))
}

function estimateTokens(text: string): number | undefined {
  const trimmed = text.trim()
  if (!trimmed) return undefined
  return Math.ceil(trimmed.length / 4)
}

function extractSessionID(input: unknown): string | undefined {
  return extractString(input, [
    "sessionID",
    "properties.sessionID",
    "event.properties.sessionID",
    "payload.properties.sessionID",
  ])
}

function extractString(input: unknown, paths: string[]): string | undefined {
  for (const path of paths) {
    const value = get(input, path)
    if (typeof value === "string") return value
  }
  return undefined
}

function extractNumber(input: unknown, paths: string[]): number | undefined {
  for (const path of paths) {
    const value = get(input, path)
    if (typeof value === "number") return value
  }
  return undefined
}

function sumNumbers(input: unknown, paths: string[]): number | undefined {
  let sum = 0
  let found = false
  for (const path of paths) {
    const value = get(input, path)
    if (typeof value === "number") {
      sum += value
      found = true
    }
  }
  return found ? sum : undefined
}

function appendPrompt(output: unknown, text: string): void {
  if (!isRecord(output)) return
  output.text = text
  output.prompt = text
  output.parts = [{ type: "text", text }]
}

function setToast(
  output: unknown,
  title: string,
  message: string,
  variant: "info" | "success" | "warning" | "error",
): void {
  if (!isRecord(output)) return
  output.toast = { title, message, variant, duration: 5_000 }
}

function get(value: unknown, path: string): unknown {
  return path.split(".").reduce<unknown>((current, key) => {
    if (!isRecord(current)) return undefined
    return current[key]
  }, value)
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null
}
