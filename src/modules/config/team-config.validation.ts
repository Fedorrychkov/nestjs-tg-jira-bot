import { normalizeIdentity, TeamConfig } from './team-config.types'

export function validateTeamConfig(value: unknown): asserts value is TeamConfig {
  const fail = (message: string): never => {
    throw new Error(message)
  }
  const text = (item: unknown, max = 256): item is string =>
    typeof item === 'string' &&
    item.length > 0 &&
    item.length <= max &&
    item === item.trim() &&
    !/[\r\n\x00-\x1f]/.test(item)
  const list = (items: unknown, max: number): items is string[] =>
    Array.isArray(items) &&
    items.length <= max &&
    items.every((item) => text(item)) &&
    new Set(items).size === items.length
  const config = value as TeamConfig

  if (!config || config.version !== 1 || !list(config.projects, 100)) fail('Некорректный список проектов')

  if (!config.projects.every((key) => /^[A-Z][A-Z0-9_]{0,29}$/.test(key)))
    fail('Ключ проекта: A–Z, 0–9, _, до 30 символов')

  if (!Array.isArray(config.workflows) || config.workflows.length > 100) fail('Не более 100 workflows')

  const workflowIds = new Set<string>()
  for (const workflow of config.workflows) {
    if (!workflow || !/^[a-f0-9]{8}$/.test(workflow.id) || workflowIds.has(workflow.id))
      fail('Некорректный ID workflow')
    workflowIds.add(workflow.id)

    if (![workflow.owner, workflow.repoName].every((item) => text(item, 100) && /^[\w.-]+$/.test(item)))
      fail('Некорректные owner/repository')

    if (
      ![workflow.branch, workflow.workflowId, workflow.environment, workflow.appType].every(
        (item) => text(item, 200) && !/\s/.test(item),
      )
    )
      fail('Заполните branch, workflowId, environment и appType без пробелов')

    if (!/^[\w.-]+\.ya?ml$/.test(workflow.workflowId)) fail('workflowId должен быть именем .yml или .yaml файла')
  }

  if (!Array.isArray(config.employees) || config.employees.length > 200) fail('Не более 200 сотрудников')
  const employeeIds = new Set<string>()
  const telegrams = new Set<string>()
  const jiraRelations = new Set<string>()
  for (const employee of config.employees) {
    if (!employee || !/^[a-f0-9]{8}$/.test(employee.id) || employeeIds.has(employee.id))
      fail('Некорректный ID сотрудника')
    employeeIds.add(employee.id)

    if (
      !text(employee.telegram, 32) ||
      !/^(?:[a-z][a-z0-9_]{3,31}|[1-9]\d{0,15})$/.test(employee.telegram) ||
      telegrams.has(employee.telegram)
    )
      fail('Telegram: уникальный username без @ или положительный числовой ID')
    telegrams.add(employee.telegram)

    if (
      typeof employee.active !== 'boolean' ||
      !list(employee.jira, 10) ||
      !list(employee.projects, 100) ||
      !list(employee.workflows, 100)
    )
      fail('Некорректные параметры сотрудника')
    for (const relation of employee.jira) {
      const identity = normalizeIdentity(relation)

      if (jiraRelations.has(identity)) fail('Связь с Jira должна быть уникальной для каждого сотрудника')
      jiraRelations.add(identity)
    }

    if (
      employee.projects.some((key) => !config.projects.includes(key)) ||
      employee.workflows.some((id) => !workflowIds.has(id))
    )
      fail('У сотрудника указан неизвестный проект или workflow')

    if (!Array.isArray(employee.salaries) || employee.salaries.length > 100) fail('Некорректные ставки')
    const salaryKeys = new Set<string>()
    for (const salary of employee.salaries) {
      if (
        !salary ||
        !text(salary.amount, 30) ||
        !/^\d+(?:\.\d+)?$/.test(salary.amount) ||
        !Number.isFinite(Number(salary.amount))
      )
        fail('Ставка должна быть конечным неотрицательным числом')

      if (
        !text(salary.currency, 12) ||
        !/^[A-Za-z0-9]+$/.test(salary.currency) ||
        !['fixed', 'hourly'].includes(salary.type)
      )
        fail('Укажите валюту и тип fixed/hourly')

      if (salary.hours !== undefined && (!Number.isFinite(salary.hours) || salary.hours <= 0))
        fail('Норма часов должна быть положительным числом')

      if (salary.key !== undefined && !config.projects.includes(salary.key)) fail('Неизвестный проект в ставке')
      const key = salary.key || '*'

      if (salaryKeys.has(key)) fail('Для проекта допустима только одна ставка')
      salaryKeys.add(key)
    }
  }
}
