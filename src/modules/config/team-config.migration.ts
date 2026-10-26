import { ConfigService } from '@nestjs/config'
import { randomBytes } from 'crypto'

import { Employee, normalizeIdentity, TeamConfig } from './team-config.types'

export const configId = () => randomBytes(4).toString('hex')

export function migrateTeamConfig(env: ConfigService): TeamConfig {
  const config: TeamConfig = { version: 1, projects: [], employees: [], workflows: [] }
  const getEmployee = (identity: string) => {
    const telegram = normalizeIdentity(identity)
    let employee = config.employees.find((item) => item.telegram === telegram)

    if (!employee) {
      employee = { id: configId(), telegram, active: false, jira: [], projects: [], salaries: [], workflows: [] }
      config.employees.push(employee)
    }

    return employee
  }
  const project = (key: string) => {
    const normalized = key.trim().toUpperCase()

    if (!config.projects.includes(normalized)) config.projects.push(normalized)

    return normalized
  }
  const parameters = (value: string) =>
    Object.fromEntries(
      value
        .replace(/[{}]/g, '')
        .split(',')
        .map((item) => {
          const index = item.indexOf('=')

          if (index < 1) throw new Error('Некорректные параметры старого env-конфига')

          return [item.slice(0, index).trim(), item.slice(index + 1).trim()]
        }),
    )
  const entries = (name: string, separator: string) =>
    (env.get<string>(name) || '')
      .split(separator)
      .map((item) => item.trim())
      .filter(Boolean)

  for (const entry of entries('RELATION_BY_NAME_OR_EMAIL', ',')) {
    const [identity, ...relations] = entry.split(':')
    getEmployee(identity).jira = [...new Set(relations.map((item) => item.trim()).filter(Boolean))]
  }
  for (const entry of entries('AVAILABILITY_BY_KEYS', ',')) {
    const [key, ...identities] = entry.split(':')
    const projectKey = project(key)
    for (const identity of identities) {
      const employee = getEmployee(identity)

      if (!employee.projects.includes(projectKey)) employee.projects.push(projectKey)
    }
  }
  for (const identity of entries('SUPERADMIN_LIST', ',')) getEmployee(identity)
  for (const entry of entries('SALARY_RELATION_BY_TG_AND_PROJECT', '|')) {
    const index = entry.indexOf(':')
    const params = parameters(entry.slice(index + 1))
    const salary: Employee['salaries'][number] = {
      amount: params.amount,
      currency: params.currency,
      type: params.type as 'fixed' | 'hourly',
    }

    if (params.key) salary.key = project(params.key)

    if (params.hours) salary.hours = Number(params.hours)
    getEmployee(entry.slice(0, index)).salaries.push(salary)
  }
  for (const entry of entries('GITHUB_WORKFLOW_SETTINGS', '|')) {
    const index = entry.indexOf(':')
    const params = parameters(entry.slice(index + 1))
    config.workflows.push({
      id: configId(),
      repoName: entry.slice(0, index).trim(),
      owner: params.owner,
      branch: params.branch,
      workflowId: params.workflowId,
      environment: params.environment,
      appType: params.appType,
    })
  }
  for (const identity of entries('SUPERADMIN_LIST', ',')) getEmployee(identity).projects = [...config.projects]

  return config
}
