import type { GoalStore } from "../goal-store.js"

type CommandAction =
  | { type: "set"; objective: string; tokenBudget?: number }
  | { type: "status" }
  | { type: "pause" }
  | { type: "resume" }
  | { type: "clear" }
  | { type: "ignore" }

export function createGoalCommandHandler(store: GoalStore) {
  async function handle(input: unknown, output: unknown): Promise<void> {
    const raw = extractCommand(input)
    const action = parseGoalCommand(raw)
    if (action.type === "ignore") return

    markHandled(output)

    if (action.type === "set") {
      const goal = await store.create({
        objective: action.objective,
        tokenBudget: action.tokenBudget,
      })
      setToast(output, "Goal started", formatGoalStatus(goal), "success")
      appendPrompt(output, `Goal started: ${goal.objective}`)
      return
    }

    if (action.type === "status") {
      const goal = await store.read()
      setToast(output, "Goal status", goal ? formatGoalStatus(goal) : "No active goal.", "info")
      return
    }

    if (action.type === "pause") {
      const goal = await store.setStatus("paused", "Paused by /goal pause.")
      setToast(output, "Goal paused", goal ? formatGoalStatus(goal) : "No active goal.", "warning")
      return
    }

    if (action.type === "resume") {
      const goal = await store.setStatus("pursuing", "Resumed by /goal resume.")
      setToast(output, "Goal resumed", goal ? formatGoalStatus(goal) : "No active goal.", "success")
      return
    }

    if (action.type === "clear") {
      await store.clear()
      setToast(output, "Goal cleared", "The active goal was removed.", "info")
    }
  }

  return { handle }
}

export function parseGoalCommand(raw: string): CommandAction {
  const normalized = raw.trim()
  if (!normalized.startsWith("/goal") && !normalized.startsWith("goal")) return { type: "ignore" }

  const withoutSlash = normalized.startsWith("/") ? normalized.slice(1) : normalized
  const [, ...parts] = withoutSlash.split(/\s+/)
  const rest = withoutSlash.replace(/^goal\s*/, "").trim()

  if (!rest) {
    return { type: "status" }
  }

  const subcommand = parts[0]?.toLowerCase()
  if (subcommand === "status") return { type: "status" }
  if (subcommand === "pause") return { type: "pause" }
  if (subcommand === "resume") return { type: "resume" }
  if (subcommand === "clear") return { type: "clear" }

  const budgetMatch = rest.match(/(?:^|\s)--token-budget(?:=|\s+)(\d+)(?:\s|$)/)
  const tokenBudget = budgetMatch ? Number(budgetMatch[1]) : undefined
  const objective = rest.replace(/\s*--token-budget(?:=|\s+)\d+\s*/g, " ").trim()

  if (!objective) return { type: "status" }
  return { type: "set", objective, tokenBudget }
}

function extractCommand(input: unknown): string {
  const name = [
    get(input, "name"),
    get(input, "properties.name"),
    get(input, "event.properties.name"),
    get(input, "payload.properties.name"),
  ].find((value): value is string => typeof value === "string")
  const args = [
    get(input, "arguments"),
    get(input, "properties.arguments"),
    get(input, "event.properties.arguments"),
    get(input, "payload.properties.arguments"),
  ].find((value): value is string => typeof value === "string")

  if (name === "goal") return `goal ${args ?? ""}`

  const candidates = [
    get(input, "command"),
    get(input, "properties.command"),
    get(input, "event.properties.command"),
    get(input, "payload.properties.command"),
    get(input, "arguments"),
    get(input, "text"),
  ]
  return candidates.find((value): value is string => typeof value === "string") ?? ""
}

function formatGoalStatus(goal: {
  objective: string
  status: string
  iteration: number
  tokens_used: number
  token_budget: number
}): string {
  return `${goal.status}: ${goal.objective} (iteration ${goal.iteration}, ${goal.tokens_used}/${goal.token_budget} tokens)`
}

function markHandled(output: unknown): void {
  if (!isRecord(output)) return
  output.preventDefault = true
  output.handled = true
  output.cancel = true
}

function setToast(
  output: unknown,
  title: string,
  message: string,
  variant: "info" | "success" | "warning" | "error",
): void {
  if (!isRecord(output)) return
  output.toast = { title, message, variant, duration: 5_000 }
  output.title = title
  output.message = message
  output.variant = variant
}

function appendPrompt(output: unknown, text: string): void {
  if (!isRecord(output)) return
  output.prompt = text
  output.text = text
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
