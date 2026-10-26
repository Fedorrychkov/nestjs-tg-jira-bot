import { Injectable, Logger } from '@nestjs/common'
import { Context, MiddlewareFn } from 'telegraf'
import { InlineKeyboardButton } from 'telegraf/types'

import { MAIN_CALLBACK_DATA } from '../../constants/callbacks'
import { CustomConfigService } from '../config'
import { configId } from '../config/team-config.migration'
import { Employee, normalizeIdentity, TeamConfig, TeamWorkflow } from '../config/team-config.types'

type PendingEdit = {
  kind: 'employee' | 'project' | 'workflow' | 'telegram' | 'jira' | 'salary'
  id?: string
  project?: string
  expires: number
}
const button = (text: string, action: string): InlineKeyboardButton => ({ text, callback_data: `admin:${action}` })
const back = () => [button('← Администрирование', 'home')]
const pageSize = 8

@Injectable()
export class AdminService {
  private readonly logger = new Logger(AdminService.name)
  private pending?: PendingEdit

  constructor(private readonly config: CustomConfigService) {}

  readonly middleware: MiddlewareFn<Context> = async (ctx, next) => {
    const text = ctx.message && 'text' in ctx.message ? ctx.message.text : ''
    const data = ctx.callbackQuery && 'data' in ctx.callbackQuery ? ctx.callbackQuery.data : ''
    const command = /^\/admin(?:@\w+)?(?:\s|$)/i.test(text)
    const cancel = /^\/cancel(?:@\w+)?$/i.test(text)
    const callback = data.startsWith('admin:')
    const owner =
      ctx.chat?.type === 'private' &&
      this.config.isOwner(ctx.from) &&
      String(ctx.chat.id) === this.config.adminTelegramId

    if (!owner) {
      if (callback) await ctx.answerCbQuery('Нет доступа')
      else if (command) await ctx.reply('Нет доступа')
      else return next()

      return
    }

    if (ctx.callbackQuery && !callback) {
      this.pending = undefined

      return next()
    }

    if (!command && !callback && !cancel && !this.pending) return next()

    try {
      if (command || cancel) {
        this.pending = undefined
        await this.home(ctx)
      } else if (callback) {
        this.pending = undefined
        await ctx.answerCbQuery()
        await this.action(ctx, data.split(':').slice(1))
      } else if (text.startsWith('/')) {
        this.pending = undefined

        return next()
      } else if (this.pending) {
        if (Date.now() > this.pending.expires) {
          this.pending = undefined
          await ctx.reply('Время редактирования истекло. Откройте /admin заново.')

          return
        }

        if (!text) {
          await ctx.reply('Отправьте значение текстовым сообщением. /cancel — отмена.')

          return
        }
        await this.saveText(ctx, text)
      }
    } catch (error) {
      this.logger.error('Admin operation failed', error instanceof Error ? error.message : 'Unknown error')
      await ctx.reply(
        `Не удалось применить изменение: ${error instanceof Error ? error.message : 'ошибка'}. /cancel — отмена.`,
      )
    }
  }

  private async show(ctx: Context, text: string, rows: InlineKeyboardButton[][]) {
    await ctx.reply(text.slice(0, 4000), { reply_markup: { inline_keyboard: rows } })
  }

  private async home(ctx: Context) {
    const team = this.config.team
    await this.show(
      ctx,
      `Управление ботом\nАктивных сотрудников: ${team.employees.filter((item) => item.active).length}/${team.employees.length}\nПроектов: ${team.projects.length}\nWorkflows: ${team.workflows.length}\n\nИзменения применяются сразу. После первого импорта включите работающих сотрудников и проверьте их проекты.`,
      [
        [{ text: 'Jira: проекты и отчёты', callback_data: MAIN_CALLBACK_DATA.GET_PROJECTS }],
        [{ text: 'GitHub: запуск workflows', callback_data: MAIN_CALLBACK_DATA.GET_GITHUB_PROJECTS }],
        [button('Сотрудники', 'employees:0')],
        [button('Настройки Jira-проектов', 'projects:0')],
        [button('Настройки workflows', 'workflows:0')],
        [button('Скачать конфиг', 'export')],
      ],
    )
  }

  private pagination(page: number, total: number, action: string) {
    const row: InlineKeyboardButton[] = []

    if (page > 0) row.push(button('←', `${action}:${page - 1}`))

    if ((page + 1) * pageSize < total) row.push(button('→', `${action}:${page + 1}`))

    return row.length ? [row] : []
  }

  private employee(id: string) {
    const employee = this.config.team.employees.find((item) => item.id === id)

    if (!employee) throw new Error('Сотрудник не найден. Откройте /admin заново')

    return employee
  }

  private changeEmployee(id: string, change: (employee: Employee) => void) {
    this.config.update((team) => {
      const employee = team.employees.find((item) => item.id === id)

      if (!employee) throw new Error('Сотрудник не найден')
      change(employee)
    })
  }

  private async employeeCard(ctx: Context, id: string) {
    const employee = this.employee(id)
    const salaries =
      employee.salaries
        .map(
          (salary) =>
            `${salary.key || '*'}: ${salary.amount} ${salary.currency}, ${salary.type}${salary.hours ? `, норма ${salary.hours} ч` : ''}`,
        )
        .join('\n') || 'не заданы'
    await this.show(
      ctx,
      `${employee.telegram}\nСтатус: ${employee.active ? 'работает' : 'отключён'}\nJira: ${employee.jira.join('; ') || 'не привязан'}\nПроекты: ${employee.projects.join(', ') || 'нет'}\nСтавки:\n${salaries}\nWorkflows: ${employee.workflows.length}\n\nОтключение исключает сотрудника из доступа и отчётов.`,
      [
        [button(employee.active ? 'Отключить сотрудника' : 'Включить сотрудника', `active:${id}`)],
        [button('Telegram', `edit:${id}:telegram`), button('Связь с Jira', `edit:${id}:jira`)],
        [button('Проекты', `ep:${id}:0`), button('Ставки', `edit:${id}:salaries`)],
        [button('Доступ к workflows', `ew:${id}:0`)],
        [button('← Сотрудники', 'employees:0')],
      ],
    )
  }

  private async permissions(ctx: Context, id: string, kind: 'projects' | 'workflows', page: number) {
    const employee = this.employee(id)
    const team = this.config.team
    const projects = kind === 'projects'
    const options = projects
      ? team.projects.map((key) => ({ id: key, label: key }))
      : team.workflows.map((item) => ({
          id: item.id,
          label: `${item.owner}/${item.repoName} ${item.environment}/${item.appType} ${item.branch}`,
        }))
    const prefix = projects ? 'ep' : 'ew'
    await this.show(
      ctx,
      `${employee.telegram}: ${projects ? 'проекты Jira и включение в отчёты по ним' : 'разрешённые workflows'}\nНажмите для переключения.`,
      [
        ...options
          .slice(page * pageSize, (page + 1) * pageSize)
          .map((item) => [
            button(
              `${employee[kind].includes(item.id) ? '✅' : '▫️'} ${item.label}`.slice(0, 100),
              `${projects ? 'pt' : 'wt'}:${id}:${item.id}:${page}`,
            ),
          ]),
        ...this.pagination(page, options.length, `${prefix}:${id}`),
        [button('← Сотрудник', `e:${id}`)],
      ],
    )
  }

  private salaryLabel(salary?: Employee['salaries'][number]) {
    return salary
      ? `${salary.amount} ${salary.currency} / ${salary.type === 'hourly' ? 'час' : 'спринт'}${salary.hours ? `, норма ${salary.hours} ч` : ''}`
      : 'не задана'
  }

  private async salaryMenu(ctx: Context, id: string, page = 0) {
    const employee = this.employee(id)
    const fallback = employee.salaries.find((salary) => !salary.key)
    const projects = [
      ...new Set([...employee.projects, ...employee.salaries.flatMap((salary) => (salary.key ? [salary.key] : []))]),
    ]
    const options = ['*', ...projects]
    await this.show(
      ctx,
      `${employee.telegram}: ставки\nПо умолчанию: ${this.salaryLabel(fallback)}\n\nВыберите проект, чтобы задать отдельную ставку. Остальные ставки сохранятся. Если проект не указан — назначьте его сотруднику.`,
      [
        ...options.slice(page * pageSize, (page + 1) * pageSize).map((key) => {
          const salary = employee.salaries.find((item) => (item.key || '*') === key)

          return [
            button(
              `${key === '*' ? 'По умолчанию' : key}: ${this.salaryLabel(salary || fallback)}${key !== '*' && !salary ? ' (по умолчанию)' : ''}`.slice(
                0,
                100,
              ),
              `salary:${id}:${key}`,
            ),
          ]
        }),
        ...this.pagination(page, options.length, `salaries:${id}`),
        [button('← Сотрудник', `e:${id}`)],
      ],
    )
  }

  private async salaryPrompt(ctx: Context, id: string, project: string) {
    const employee = this.employee(id)

    if (
      project !== '*' &&
      !employee.projects.includes(project) &&
      !employee.salaries.some((salary) => salary.key === project)
    ) {
      throw new Error('Сначала назначьте этот проект сотруднику')
    }
    const salary = employee.salaries.find((item) => (item.key || '*') === project)
    const fallback = employee.salaries.find((item) => !item.key)
    const current = salary || (project !== '*' ? fallback : undefined)
    await this.prompt(
      ctx,
      { kind: 'salary', id, project },
      `${employee.telegram}: ${project === '*' ? 'ставка по умолчанию' : `ставка для ${project}`}\nСейчас: ${this.salaryLabel(current)}${project !== '*' && !salary ? ' (по умолчанию)' : ''}\n\nФормат: сумма валюта fixed|hourly [норма_часов]\nПримеры:\n25 USDT hourly\n100000 RUB fixed 80\n\n«-» ${project === '*' ? 'удаляет общую ставку, сохраняя проектные' : 'удаляет только ставку этого проекта и возвращает ставку по умолчанию'}.`,
    )
  }

  private async prompt(ctx: Context, edit: Omit<PendingEdit, 'expires'>, message: string) {
    this.pending = { ...edit, expires: Date.now() + 10 * 60_000 }
    await ctx.reply(`${message}\n\nОтправьте значение одним сообщением. /cancel — отмена.`)
  }

  private async action(ctx: Context, [action, id, field, pageText]: string[]) {
    const team = this.config.team
    const page = (value: string) => (/^\d{1,3}$/.test(value || '') ? Number(value) : 0)
    switch (action) {
      case 'home':
        return this.home(ctx)
      case 'export':
        return ctx.replyWithDocument(
          { source: Buffer.from(JSON.stringify(team, null, 2)), filename: 'team-config.json' },
          { caption: 'Конфиг содержит ставки и контакты. Храните приватно; API-токенов в нём нет.' },
        )
      case 'employees': {
        const offset = page(id)

        return this.show(ctx, 'Сотрудники (✅ работают, ⏸ отключены)', [
          ...team.employees
            .slice(offset * pageSize, (offset + 1) * pageSize)
            .map((item) => [button(`${item.active ? '✅' : '⏸'} ${item.telegram}`, `e:${item.id}`)]),
          ...this.pagination(offset, team.employees.length, 'employees'),
          [button('Добавить сотрудника', 'addEmployee')],
          back(),
        ])
      }
      case 'addEmployee':
        return this.prompt(
          ctx,
          { kind: 'employee' },
          'Введите Telegram username или числовой ID. Новый сотрудник будет отключён, пока вы не настроите и не включите его.',
        )
      case 'e':
        return this.employeeCard(ctx, id)
      case 'active':
        this.changeEmployee(id, (item) => {
          item.active = !item.active
        })

        return this.employeeCard(ctx, id)
      case 'edit': {
        const employee = this.employee(id)

        if (field === 'telegram')
          return this.prompt(
            ctx,
            { kind: 'telegram', id },
            `Введите username или числовой ID. Сейчас: ${employee.telegram}. Числовой ID надёжнее username.`,
          )

        if (field === 'jira')
          return this.prompt(
            ctx,
            { kind: 'jira', id },
            `Jira email, displayName или accountId — каждое значение с новой строки. «-» очищает список.\nСейчас:\n${employee.jira.join('\n') || 'нет'}`,
          )

        if (field === 'salaries') return this.salaryMenu(ctx, id)
        break
      }
      case 'salaries':
        return this.salaryMenu(ctx, id, page(field))
      case 'salary':
        return this.salaryPrompt(ctx, id, field)
      case 'ep':
        return this.permissions(ctx, id, 'projects', page(field))
      case 'ew':
        return this.permissions(ctx, id, 'workflows', page(field))
      case 'pt':
      case 'wt': {
        const kind = action === 'pt' ? 'projects' : 'workflows'
        this.changeEmployee(id, (item) => {
          item[kind] = item[kind].includes(field)
            ? item[kind].filter((value) => value !== field)
            : [...item[kind], field]
        })

        return this.permissions(ctx, id, kind, page(pageText))
      }
      case 'projects': {
        const offset = page(id)

        return this.show(ctx, 'Проекты Jira', [
          ...team.projects.slice(offset * pageSize, (offset + 1) * pageSize).map((key) => [button(key, `p:${key}`)]),
          ...this.pagination(offset, team.projects.length, 'projects'),
          [button('Добавить проект', 'addProject')],
          back(),
        ])
      }
      case 'addProject':
        return this.prompt(
          ctx,
          { kind: 'project' },
          'Введите Jira-ключ проекта, например EG. После добавления назначьте его сотрудникам.',
        )
      case 'p':
        if (!team.projects.includes(id)) throw new Error('Проект не найден')

        return this.show(ctx, `Проект ${id}. Перед удалением уберите его из проектов и ставок сотрудников.`, [
          [button('Удалить проект', `deleteProject:${id}`)],
          [button('← Проекты', 'projects:0')],
        ])
      case 'deleteProject':
        this.config.update((next) => {
          if (
            next.employees.some(
              (item) => item.projects.includes(id) || item.salaries.some((salary) => salary.key === id),
            )
          )
            throw new Error('Проект используется сотрудниками или их ставками')
          next.projects = next.projects.filter((key) => key !== id)
        })

        return this.action(ctx, ['projects', '0'])
      case 'workflows': {
        const offset = page(id)

        return this.show(
          ctx,
          'GitHub workflows. Владелец имеет доступ ко всем; сотрудникам доступ выдаётся отдельно.',
          [
            ...team.workflows
              .slice(offset * pageSize, (offset + 1) * pageSize)
              .map((item) => [
                button(
                  `${item.owner}/${item.repoName} ${item.environment}/${item.appType}`.slice(0, 100),
                  `w:${item.id}`,
                ),
              ]),
            ...this.pagination(offset, team.workflows.length, 'workflows'),
            [button('Добавить workflow', 'addWorkflow')],
            back(),
          ],
        )
      }
      case 'addWorkflow':
        return this.workflowPrompt(ctx)
      case 'editWorkflow':
        return this.workflowPrompt(ctx, id)
      case 'w': {
        const workflow = team.workflows.find((item) => item.id === id)

        if (!workflow) throw new Error('Workflow не найден')

        return this.show(
          ctx,
          `${workflow.owner}/${workflow.repoName}\nВетка: ${workflow.branch}\nФайл: ${workflow.workflowId}\nОкружение: ${workflow.environment}\nПриложение: ${workflow.appType}`,
          [
            [button('Изменить', `editWorkflow:${id}`)],
            [button('Удалить и отозвать доступ', `deleteWorkflow:${id}`)],
            [button('← Workflows', 'workflows:0')],
          ],
        )
      }
      case 'deleteWorkflow':
        this.config.update((next) => {
          next.workflows = next.workflows.filter((item) => item.id !== id)
          for (const employee of next.employees) employee.workflows = employee.workflows.filter((value) => value !== id)
        })

        return this.action(ctx, ['workflows', '0'])
    }
  }

  private async workflowPrompt(ctx: Context, id?: string) {
    const workflow = id && this.config.team.workflows.find((item) => item.id === id)

    if (id && !workflow) throw new Error('Workflow не найден')
    await this.prompt(
      ctx,
      { kind: 'workflow', id },
      `Введите 5 значений через пробел:\nowner/repository branch workflow.yml environment appType\n\nПример:\nMyOrg/my-repo develop deploy.yml stage api${workflow ? `\n\nСейчас:\n${workflow.owner}/${workflow.repoName} ${workflow.branch} ${workflow.workflowId} ${workflow.environment} ${workflow.appType}` : ''}\n\nИзменение workflow отзывает выданные сотрудникам разрешения: выдайте их заново после проверки.`,
    )
  }

  private async saveText(ctx: Context, text: string) {
    const pending = this.pending

    if (text.length > 12_000) throw new Error('Слишком длинное сообщение')
    const value = text.trim()
    let employeeId = pending.id
    this.config.update((team: TeamConfig) => {
      if (pending.kind === 'employee') {
        employeeId = configId()
        team.employees.push({
          id: employeeId,
          telegram: normalizeIdentity(value),
          active: false,
          jira: [],
          projects: [],
          salaries: [],
          workflows: [],
        })
      } else if (pending.kind === 'project') {
        team.projects.push(value.toUpperCase())
      } else if (pending.kind === 'workflow') {
        const parts = value.split(/\s+/)
        const [repository, branch, workflowId, environment, appType] = parts
        const [owner, repoName, extra] = repository.split('/')

        if (parts.length !== 5 || !owner || !repoName || extra)
          throw new Error('Формат: owner/repository branch workflow.yml environment appType')
        const workflow: TeamWorkflow = {
          id: configId(),
          owner,
          repoName,
          branch,
          workflowId,
          environment,
          appType,
        }

        if (pending.id) {
          const index = team.workflows.findIndex((item) => item.id === pending.id)

          if (index < 0) throw new Error('Workflow не найден')
          team.workflows[index] = workflow
          for (const employee of team.employees)
            employee.workflows = employee.workflows.filter((id) => id !== pending.id)
        } else team.workflows.push(workflow)
      } else {
        const employee = team.employees.find((item) => item.id === pending.id)

        if (!employee) throw new Error('Сотрудник не найден')

        if (pending.kind === 'telegram') employee.telegram = normalizeIdentity(value)

        if (pending.kind === 'jira')
          employee.jira =
            value === '-'
              ? []
              : value
                  .split('\n')
                  .map((line) => line.trim())
                  .filter(Boolean)

        if (pending.kind === 'salary') {
          const project = pending.project
          employee.salaries = employee.salaries.filter((salary) => (salary.key || '*') !== project)

          if (value !== '-') {
            const parts = value.split(/\s+/)

            if (parts.length < 3 || parts.length > 4) throw new Error('Формат: сумма валюта fixed|hourly [норма_часов]')
            const [amount, currency, type, hours] = parts
            employee.salaries.push({
              ...(project === '*' ? {} : { key: project }),
              amount: amount.replace(',', '.'),
              currency: currency.toUpperCase(),
              type: type as 'fixed' | 'hourly',
              ...(hours === undefined ? {} : { hours: Number(hours.replace(',', '.')) }),
            })
          }
        }
      }
    })
    this.pending = undefined
    await ctx.reply('Сохранено. Изменения уже действуют.')

    if (pending.kind === 'salary') await this.salaryMenu(ctx, employeeId)
    else if (['employee', 'telegram', 'jira'].includes(pending.kind)) await this.employeeCard(ctx, employeeId)
    else await this.home(ctx)
  }
}
