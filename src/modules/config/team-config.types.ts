import { GithubWorkflowParams, SelfSalaryRelationByTgAndProject } from '../../types'

export type Employee = {
  id: string
  telegram: string
  active: boolean
  jira: string[]
  projects: string[]
  salaries: SelfSalaryRelationByTgAndProject[]
  workflows: string[]
}

export type TeamWorkflow = GithubWorkflowParams & { id: string }

export type TeamConfig = {
  version: 1
  projects: string[]
  employees: Employee[]
  workflows: TeamWorkflow[]
}

export type TelegramUser = { id: number; username?: string }

export const normalizeIdentity = (value: string) => value.trim().replace(/^@/, '').toLowerCase()

export const matchesJiraUser = (
  relations: string[],
  user: { emailAddress?: string; displayName?: string; accountId?: string },
) =>
  [user.emailAddress, user.displayName, user.accountId].some(
    (value) => value && relations.some((relation) => normalizeIdentity(relation) === normalizeIdentity(value)),
  )
