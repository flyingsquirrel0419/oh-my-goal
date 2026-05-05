import { mkdir, readFile, rm, writeFile } from "node:fs/promises"
import path from "node:path"
import { z } from "zod"

export const goalStatuses = ["pursuing", "paused", "achieved", "budget-limited", "blocked"] as const

export type GoalStatus = (typeof goalStatuses)[number]

export const goalHistoryEntrySchema = z.object({
  iteration: z.number().int().nonnegative(),
  summary: z.string(),
  status: z.string(),
  created_at: z.string().optional(),
})

export const goalSchema = z.object({
  objective: z.string().min(1),
  status: z.enum(goalStatuses),
  created_at: z.string(),
  updated_at: z.string().optional(),
  token_budget: z.number().int().positive().default(50_000),
  tokens_used: z.number().int().nonnegative().default(0),
  iteration: z.number().int().nonnegative().default(0),
  max_iterations: z.number().int().positive().default(100),
  budget_warning_sent: z.boolean().default(false),
  last_message_id: z.string().optional(),
  last_response_text: z.string().optional(),
  history: z.array(goalHistoryEntrySchema).default([]),
})

export type Goal = z.infer<typeof goalSchema>
export type GoalHistoryEntry = z.infer<typeof goalHistoryEntrySchema>

export type CreateGoalInput = {
  objective: string
  tokenBudget?: number
  maxIterations?: number
}

export type GoalStore = ReturnType<typeof createGoalStore>

export function createGoalStore(root: string) {
  const opencodeDir = path.join(root, ".opencode")
  const filePath = path.join(opencodeDir, "goal.json")

  async function read(): Promise<Goal | null> {
    try {
      const raw = await readFile(filePath, "utf8")
      return goalSchema.parse(JSON.parse(raw))
    } catch (error) {
      if (isNotFound(error)) return null
      throw error
    }
  }

  async function write(goal: Goal): Promise<Goal> {
    const parsed = goalSchema.parse({
      ...goal,
      updated_at: new Date().toISOString(),
    })
    await mkdir(opencodeDir, { recursive: true })
    await writeFile(filePath, `${JSON.stringify(parsed, null, 2)}\n`, "utf8")
    return parsed
  }

  async function create(input: CreateGoalInput): Promise<Goal> {
    const now = new Date().toISOString()
    return write({
      objective: input.objective.trim(),
      status: "pursuing",
      created_at: now,
      updated_at: now,
      token_budget: input.tokenBudget ?? 50_000,
      tokens_used: 0,
      iteration: 0,
      max_iterations: input.maxIterations ?? 100,
      budget_warning_sent: false,
      history: [],
    })
  }

  async function update(mutator: (goal: Goal) => Goal | Promise<Goal>): Promise<Goal | null> {
    const current = await read()
    if (!current) return null
    return write(await mutator(current))
  }

  async function setStatus(status: GoalStatus, summary?: string): Promise<Goal | null> {
    return update((goal) => ({
      ...goal,
      status,
      history: summary
        ? [
            ...goal.history,
            {
              iteration: goal.iteration,
              summary,
              status,
              created_at: new Date().toISOString(),
            },
          ]
        : goal.history,
    }))
  }

  async function clear(): Promise<void> {
    await rm(filePath, { force: true })
  }

  return {
    path: filePath,
    read,
    write,
    create,
    update,
    setStatus,
    clear,
  }
}

function isNotFound(error: unknown): boolean {
  return typeof error === "object" && error !== null && "code" in error && error.code === "ENOENT"
}
