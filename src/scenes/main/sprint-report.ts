import { Issue, Sprint } from 'jira.js/out/agile/models'

import { matchesJiraUser, TeamConfig } from '../../modules/config/team-config.types'
import { JiraConfigType } from '../../types'

const csv = (rows: unknown[][]) =>
  Buffer.from(
    '\uFEFF' +
      rows
        .map((row) =>
          row
            .map((value) => {
              let text = String(value ?? '')

              if (/^[=+@\-\t\r]/.test(text)) text = `'${text}`

              return `"${text.replace(/"/g, '""')}"`
            })
            .join(','),
        )
        .join('\r\n'),
    'utf8',
  )
const decimal = (value: number) => String(Math.round(value * 100) / 100).replace('.', ',')

export function buildSprintReports(
  issues: Issue[],
  sprint: Sprint,
  team: TeamConfig,
  access: JiraConfigType,
  baseURL: string,
) {
  const taskRows: unknown[][] = [
    [
      'link',
      'assigneeName',
      'assigneeEmail',
      'title',
      'status',
      'timeSpentHours',
      'timetracking',
      'overtimeSpent',
      'sprintsHistory',
      'id',
    ],
  ]
  const salaryRows: unknown[][] = [
    [
      'Имя',
      'Проект',
      'Затрекано (h)',
      'Контакты',
      'Условия',
      'Сумма зарплаты',
      'Ожидания (h)',
      'Заработано с учетом условий',
    ],
  ]
  const totals = new Map<
    string,
    {
      salary: TeamConfig['employees'][number]['salaries'][number]
      employee: TeamConfig['employees'][number]
      projects: Set<string>
      seconds: number
      name: string
      email?: string
    }
  >()
  const start = Date.parse(sprint.startDate)
  const end = Date.parse(sprint.completeDate || sprint.endDate)
  const includedIssues = new Set<string>()

  if (!Number.isFinite(start) || !Number.isFinite(end) || end < start)
    throw new Error('У спринта нет корректного периода для отчёта')

  for (const issue of issues) {
    const project = issue.fields.project?.key

    if (!team.projects.includes(project) || (!access.isSuperAdmin && !access.availabilityListKeys?.includes(project)))
      continue
    const perEmployee = new Map<string, { seconds: number; comments: string[]; name: string; email?: string }>()
    for (const log of issue.fields.worklog?.worklogs || []) {
      if (!log.author) continue
      const employee = team.employees.find(
        (item) => item.active && item.projects.includes(project) && matchesJiraUser(item.jira, log.author),
      )

      if (!employee || (!access.isSuperAdmin && !matchesJiraUser(access.relationNames || [], log.author))) continue
      const date = Date.parse(log.started || log.created)

      if (
        !Number.isFinite(date) ||
        date < start ||
        date > end ||
        !Number.isFinite(log.timeSpentSeconds) ||
        log.timeSpentSeconds < 0
      )
        continue
      includedIssues.add(issue.id)
      const name = log.author.displayName || employee.telegram
      const email = log.author.emailAddress
      const entry = perEmployee.get(employee.id) || { seconds: 0, comments: [], name, email }
      entry.seconds += log.timeSpentSeconds
      entry.comments.push(`${decimal(log.timeSpentSeconds / 3600)} h ${log.comment || ''}`)
      perEmployee.set(employee.id, entry)
      const salary =
        employee.salaries.find((item) => item.key === project) || employee.salaries.find((item) => !item.key)
      const key = `${employee.id}:${salary?.key || '*'}`
      const total = totals.get(key) || { salary, employee, projects: new Set<string>(), seconds: 0, name, email }
      total.projects.add(project)
      total.seconds += log.timeSpentSeconds
      totals.set(key, total)
    }
    for (const entry of perEmployee.values()) {
      const estimate = (issue.fields.aggregatetimeoriginalestimate || 0) / 3600
      const fact = (issue.fields.timespent || 0) / 3600
      taskRows.push([
        `${baseURL}/browse/${issue.key}`,
        entry.name,
        entry.email,
        issue.fields.summary,
        issue.fields.status?.name,
        decimal(entry.seconds / 3600),
        entry.comments.join('\n'),
        estimate
          ? `Estimation: ${decimal(estimate)}h, Fact: ${decimal(fact)}h, Overtimed: ${decimal(Math.max(0, fact - estimate))}h`
          : '',
        ((issue.fields as any).closedSprints || []).map((item) => item.name).join(' => '),
        issue.id,
      ])
    }
  }

  for (const { salary, employee, projects, seconds, name, email } of totals.values()) {
    const hours = seconds / 3600
    const expected = salary && (salary.type === 'hourly' ? Number(salary.amount) * hours : Number(salary.amount))
    const earned =
      salary && (salary.type === 'fixed' && salary.hours ? (Number(salary.amount) * hours) / salary.hours : expected)
    salaryRows.push([
      name,
      [...projects].join(', '),
      decimal(hours),
      [email, employee.telegram].filter(Boolean).join('\n'),
      salary
        ? `${salary.amount} ${salary.currency} / ${salary.type === 'hourly' ? 'час' : 'спринт'}`
        : 'Ставка не задана',
      salary ? `${decimal(expected)} ${salary.currency}` : '',
      salary?.hours ? `${hours < salary.hours ? '⚠️ ' : ''}${decimal(hours)} / ${salary.hours} h` : '',
      salary ? `${decimal(earned)} ${salary.currency}` : '',
    ])
  }

  return { tasks: csv(taskRows), salaries: csv(salaryRows), issueCount: includedIssues.size }
}
