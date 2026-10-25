import { Injectable, Logger } from '@nestjs/common'
import * as fs from 'fs'
import { Action, Command, Ctx, Hears, On, Update } from 'nestjs-telegraf'
import { MAIN_CALLBACK_DATA } from 'src/constants'
import { getJiraProjectKeyboards, getJiraProjectSprintsKeyboards } from 'src/constants/keyboard'
import { AvailableChatTypes, ChatTelegrafContext, JiraConfig } from 'src/decorator'
import {
  ChatTelegrafGuard,
  JiraTelegrafGuard,
  UserSupergroupTelegrafGuard,
  UserTelegrafGuard,
  UseSafeGuards,
} from 'src/guards'
import { getImageFile, time } from 'src/helpers'
import { CustomConfigService } from 'src/modules'
import { JiraService } from 'src/modules/jira'
import { ChatTelegrafContextType, JiraConfigType, TgInitUser } from 'src/types'
import { SceneContext } from 'telegraf/typings/scenes'

import { UserContext } from '../../decorator/user.request.decorator'
import { matchesJiraUser } from '../../modules/config/team-config.types'
import { buildSprintReports } from './sprint-report'
import { createNonCommandRegex, parseTopicSettings } from './utils'

@Update()
@Injectable()
export class MainJiraSceneService {
  private logger = new Logger(MainJiraSceneService.name)

  constructor(
    private readonly jiraService: JiraService,
    private readonly customConfigService: CustomConfigService,
  ) {}

  @On('photo')
  @AvailableChatTypes('supergroup')
  @UseSafeGuards(ChatTelegrafGuard, UserTelegrafGuard, UserSupergroupTelegrafGuard, JiraTelegrafGuard)
  async taskCreationWithPhoto(
    @Ctx() ctx: SceneContext,
    @UserContext() userContext: TgInitUser,
    @ChatTelegrafContext() chatContext: ChatTelegrafContextType,
    @JiraConfig() jiraConfig: JiraConfigType,
  ) {
    const { key: projectKey, type: issueType } = parseTopicSettings(chatContext?.topic?.name)

    if (!projectKey || !['Bug', 'Task', 'Story'].includes(issueType)) return

    if (!this.canCreateTask(projectKey, jiraConfig)) {
      await ctx.reply('Нет доступа к созданию задач в этом проекте.')

      return
    }
    const imageId = (ctx.message as any).photo?.pop?.()?.file_id

    const imageUrl = await ctx.telegram.getFileLink(imageId)

    const { filePath } = await getImageFile(imageUrl)

    try {
      // В качестве тайтла вытаскиваем первый абзац и первые 100 символов
      const description = ctx.message && 'caption' in ctx.message ? ctx.message.caption || '' : ''
      const summary = description.split('\n')[0].slice(0, 100) || 'Изображение'

      if (!this.canCreateTask(projectKey, this.customConfigService.jiraConfigFor(ctx.from))) {
        await ctx.reply('Доступ к проекту изменился. Повторите запрос.')

        return
      }

      const { createdLink, key } = await this.jiraService.createTask({
        key: projectKey,
        summary: `[JiraBot] ${summary}`,
        issueType,
        description: `${description}\nCreated by bot from: https://t.me/c/${chatContext?.chat?.id?.toString()?.replace('-100', '')}/${chatContext?.threadMessageId}/${ctx?.message?.message_id}\nCaller user: @${userContext.username} (${userContext.firstName} ${userContext.lastName})`,
      })

      await this.jiraService.attachFile(key, filePath)

      await ctx.reply(`Успешно добавлена в Jira: ${createdLink}`, {
        reply_parameters: {
          message_id: ctx?.message?.message_id,
        },
      })
    } catch (error) {
      this.logger.error(error)

      await ctx.reply('Не удалось создать задачу с вложением.')
    } finally {
      await fs.promises.rm(filePath, { force: true })
    }
  }

  @Command(MAIN_CALLBACK_DATA.GET_PROJECTS)
  @Action(MAIN_CALLBACK_DATA.GET_PROJECTS)
  @AvailableChatTypes('private')
  @UseSafeGuards(ChatTelegrafGuard, UserTelegrafGuard, JiraTelegrafGuard)
  async getProjects(@Ctx() ctx: SceneContext, @JiraConfig() jiraConfig: JiraConfigType) {
    const response = await this.jiraService.getActiveProjects()

    const projects = response
      .filter((project) => {
        if (!this.customConfigService.team.projects.includes(project.key)) return false

        if (jiraConfig.isSuperAdmin) {
          return true
        }

        if (jiraConfig.availabilityListKeys.includes(project.key)) {
          return true
        }

        return false
      })
      .map((project) => ({ key: project.key, name: project.name }))

    if (!projects.length) {
      await ctx.reply('Вам не доступен ни один проект, пожалуйста, обратитесь к администратору')

      return
    }

    await ctx.reply(jiraConfig.isSuperAdmin ? 'Все активные проекты:' : 'Доступные Вам проекты:', {
      reply_markup: {
        inline_keyboard: getJiraProjectKeyboards('private', projects),
      },
    })
  }

  @Action(new RegExp(MAIN_CALLBACK_DATA.GET_SPRINTS_KEY_BY_PROJECT))
  @AvailableChatTypes('private')
  @UseSafeGuards(ChatTelegrafGuard, UserTelegrafGuard, JiraTelegrafGuard)
  async getSprintsByProject(@Ctx() ctx: SceneContext, @JiraConfig() jiraConfig: JiraConfigType) {
    const [, key] = (ctx as any)?.update?.callback_query?.data?.split(' ')

    if (
      !this.customConfigService.team.projects.includes(key) ||
      (!jiraConfig.availabilityListKeys?.includes(key) && !jiraConfig.isSuperAdmin)
    ) {
      await ctx.reply('Вам не доступен этот проект, пожалуйста, обратитесь к администратору')

      return
    }

    const boards = await this.jiraService.getProjectBoards(key)
    const boardIds = boards.values.map((board) => board.id)
    const sprints = await Promise.all(
      boardIds.map(async (boardId) => {
        const defaultResponse = await this.jiraService.getBoardSprints(boardId)

        if (defaultResponse.isLast) {
          return defaultResponse
        }

        return this.jiraService.getBoardSprints(boardId, defaultResponse.total - 4)
      }),
    )

    const filteredSprints = sprints.flatMap((sprint) =>
      sprint.values.filter((sprint, index, values) => {
        if (sprint.state === 'active') return true

        if (index >= values.length - 4) return true

        return false
      }),
    )

    const commonMessage = jiraConfig?.isSuperAdmin
      ? 'Так как вы администратор, вам доступны все детали по задачам'
      : 'Вам доступны только те задачи, в которых вы проводили работы'
    await ctx.reply(
      `Проект: #${key}\nПоследние 4 спринта (с учетом активных, закрытых и будущих):\n<b>${commonMessage}</b>`,
      {
        reply_markup: {
          inline_keyboard: getJiraProjectSprintsKeyboards('private', filteredSprints),
        },
        parse_mode: 'HTML',
      },
    )
  }

  @Action(new RegExp(MAIN_CALLBACK_DATA.GET_SPRINT_SPENT_TIME))
  @AvailableChatTypes('private')
  @UseSafeGuards(ChatTelegrafGuard, UserTelegrafGuard, JiraTelegrafGuard)
  async getSprintsSpentTime(@Ctx() ctx: SceneContext) {
    const [, key] = (ctx as any)?.update?.callback_query?.data?.split(' ')

    const sprint = await this.jiraService.getSprint(key)
    const definedIssues = await this.jiraService.getIssuesBySprint(key)

    while (definedIssues.issues.length < definedIssues.total) {
      const response = await this.jiraService.getIssuesBySprint(key, definedIssues.issues.length)

      if (!response.issues.length) {
        await ctx.reply('Не удалось загрузить все задачи спринта. Повторите запрос позже.')

        return
      }
      definedIssues.issues.push(...response.issues)
    }

    const access = this.customConfigService.jiraConfigFor(ctx.from)
    const projects = this.customConfigService.team.projects
    const issues = definedIssues.issues.filter(
      (issue) =>
        projects.includes(issue.fields.project?.key) &&
        (access.isSuperAdmin || access.availabilityListKeys.includes(issue.fields.project.key)),
    )

    if (!issues.length) {
      await ctx.reply(`Нет доступных задач спринта ${sprint.name}`)

      return
    }

    const withWorklogs = await Promise.all(
      issues.map(async (issue) => {
        const worklog = issue.fields.worklog

        if (worklog && worklog.total > worklog.worklogs.length) {
          return { ...issue, fields: { ...issue.fields, worklog: await this.jiraService.getIssueWorklogs(issue.id) } }
        }

        return issue
      }),
    )

    const report = buildSprintReports(
      withWorklogs,
      sprint,
      this.customConfigService.team,
      this.customConfigService.jiraConfigFor(ctx.from),
      this.jiraService.baseURL,
    )

    if (!report.issueCount) {
      await ctx.reply(
        'Нет работ активных сотрудников за этот спринт. Проверьте список сотрудников, проекты и связь с Jira в /admin.',
      )

      return
    }
    const filename = `${sprint.name}_${time(sprint.startDate).format('DD-MM-YYYY')}_${time(sprint.completeDate || sprint.endDate).format('DD-MM-YYYY')}`
    await ctx.replyWithDocument(
      { source: report.tasks, filename: `${filename}_sprint_issues.csv` },
      {
        caption: `Задачи активных сотрудников за спринт: ${sprint.name}, ID=${sprint.id}\nВсего задач: ${report.issueCount}`,
      },
    )
    await ctx.replyWithDocument(
      { source: report.salaries, filename: `${filename}_user_time_spent.csv` },
      {
        caption: `Время и зарплата активных сотрудников за спринт: ${sprint.name}, ID=${sprint.id}`,
      },
    )
  }

  @Hears(createNonCommandRegex(MAIN_CALLBACK_DATA))
  @AvailableChatTypes('supergroup')
  @UseSafeGuards(ChatTelegrafGuard, UserTelegrafGuard, UserSupergroupTelegrafGuard, JiraTelegrafGuard)
  async taskCreation(
    @Ctx() ctx: SceneContext,
    @UserContext() userContext: TgInitUser,
    @ChatTelegrafContext() chatContext: ChatTelegrafContextType,
    @JiraConfig() jiraConfig: JiraConfigType,
  ) {
    const { key: projectKey, type: issueType } = parseTopicSettings(chatContext?.topic?.name)

    if (!projectKey || !['Bug', 'Task', 'Story'].includes(issueType)) return

    if (!this.canCreateTask(projectKey, jiraConfig)) {
      await ctx.reply('Нет доступа к созданию задач в этом проекте.')

      return
    }

    // В качестве тайтла вытаскиваем первый абзац и первые 100 символов
    const summary = ctx?.text?.split('\n')?.[0]?.slice(0, 100)

    const description = ctx?.text

    const usernames = description?.match(/@[a-zA-Z0-9_]+/g)
    const uniqUserNames = new Set(usernames)
    const userNames = Array.from(uniqUserNames).map((name) => name.replace('@', ''))
    const userData = jiraConfig?.relationNames?.map((name) => name.toLowerCase().trim())
    const usersData = await this.jiraService.getJiraUsers()
    const users = usersData?.filter((user) => user.active)

    const ownerUserData = users?.find((user) => matchesJiraUser(userData || [], user))

    const mentionedEmployee = this.customConfigService.team.employees.find(
      (employee) =>
        employee.active && employee.projects.includes(projectKey) && employee.telegram === userNames[0]?.toLowerCase(),
    )
    const assigneeUser = users.find((user) => matchesJiraUser(mentionedEmployee?.jira || [], user)) || ownerUserData

    if (!this.canCreateTask(projectKey, this.customConfigService.jiraConfigFor(ctx.from))) {
      await ctx.reply('Доступ к проекту изменился. Повторите запрос.')

      return
    }

    await this.jiraService
      .createTask({
        key: projectKey,
        summary: `[JiraBot] ${summary}`,
        issueType,
        fields: {
          assignee: assigneeUser,
          reporter: ownerUserData,
        },
        description: `${description}\nCreated by bot from: https://t.me/c/${chatContext?.chat?.id?.toString()?.replace('-100', '')}/${chatContext?.threadMessageId}/${ctx?.message?.message_id}\nCaller user: @${userContext.username} (${userContext.firstName} ${userContext.lastName})`,
      })
      .then(async ({ createdLink }) => {
        await ctx.reply(`Успешно добавлена в Jira: ${createdLink}`, {
          reply_parameters: {
            message_id: ctx?.message?.message_id,
          },
        })
      })
      .catch(async (err) => {
        await ctx.reply(`Ошибка при создании задачи: ${err?.message}`, {
          reply_parameters: {
            message_id: ctx?.message?.message_id,
          },
        })
      })
  }
  private canCreateTask(project: string, access: JiraConfigType) {
    return (
      this.customConfigService.team.projects.includes(project) &&
      (access.isSuperAdmin || access.availabilityListKeys.includes(project))
    )
  }
}
