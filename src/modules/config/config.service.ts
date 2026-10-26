import { Injectable, Logger } from '@nestjs/common'
import { ConfigService } from '@nestjs/config'
import { existsSync, mkdirSync, readFileSync, renameSync, unlinkSync, writeFileSync } from 'fs'
import { dirname, resolve } from 'path'

import { JiraConfigType } from '../../types'
import { configId, migrateTeamConfig } from './team-config.migration'
import { Employee, normalizeIdentity, TeamConfig, TelegramUser } from './team-config.types'
import { validateTeamConfig } from './team-config.validation'

@Injectable()
export class CustomConfigService {
  private readonly logger = new Logger(CustomConfigService.name)
  private data: TeamConfig
  private readonly filePath: string
  readonly adminTelegramId: string

  constructor(configService: ConfigService) {
    this.adminTelegramId = configService.get<string>('ADMIN_TELEGRAM_ID')?.trim() || ''

    if (this.adminTelegramId && !/^[1-9]\d{0,15}$/.test(this.adminTelegramId))
      throw new Error('ADMIN_TELEGRAM_ID должен быть положительным числовым Telegram ID')

    if (!this.adminTelegramId) this.logger.warn('ADMIN_TELEGRAM_ID не задан: /admin отключён')
    this.filePath = resolve(configService.get<string>('BOT_CONFIG_PATH') || 'data/team-config.json')

    if (existsSync(this.filePath)) {
      const data: unknown = JSON.parse(readFileSync(this.filePath, 'utf8'))
      validateTeamConfig(data)
      this.data = data
    } else {
      const data = migrateTeamConfig(configService)
      validateTeamConfig(data)
      this.persist(data)
      this.data = data
      this.logger.log('Конфигурация команды импортирована из env; дальнейшие изменения — через /admin')
    }
  }

  get team(): TeamConfig {
    return structuredClone(this.data)
  }

  // shortcut: one bot process owns the file; use a database before adding multiple writers.
  update(change: (config: TeamConfig) => void) {
    const next = this.team
    change(next)
    validateTeamConfig(next)
    this.persist(next)
    this.data = next
  }

  private persist(data: TeamConfig) {
    mkdirSync(dirname(this.filePath), { recursive: true, mode: 0o700 })
    const temp = `${this.filePath}.${configId()}.tmp`

    try {
      writeFileSync(temp, JSON.stringify(data, null, 2) + '\n', { mode: 0o600, flag: 'wx' })
      renameSync(temp, this.filePath)
    } finally {
      if (existsSync(temp)) unlinkSync(temp)
    }
  }

  isOwner(user?: TelegramUser) {
    return !!this.adminTelegramId && String(user?.id) === this.adminTelegramId
  }

  employeeFor(user?: TelegramUser): Employee | undefined {
    if (!user) return undefined
    // An explicit numeric identity takes precedence over a username entry.
    const employee =
      this.data.employees.find((item) => item.telegram === String(user.id)) ||
      this.data.employees.find((item) => user.username && item.telegram === normalizeIdentity(user.username))

    return employee && structuredClone(employee)
  }

  jiraConfigFor(user: TelegramUser): JiraConfigType {
    const employee = this.employeeFor(user)
    const active = employee?.active

    return {
      isSuperAdmin: this.isOwner(user),
      availabilityListKeys: active ? employee.projects : [],
      relationNames: active ? employee.jira : [],
    }
  }

  workflowsFor(user: TelegramUser) {
    if (this.isOwner(user)) return this.team.workflows
    const employee = this.employeeFor(user)

    return employee?.active ? this.team.workflows.filter((workflow) => employee.workflows.includes(workflow.id)) : []
  }
}
