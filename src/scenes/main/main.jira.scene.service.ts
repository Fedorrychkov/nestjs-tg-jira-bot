import { Injectable, Logger } from '@nestjs/common'
import * as dayjs from 'dayjs'
import * as isBetween from 'dayjs/plugin/isBetween'
import * as fs from 'fs'
import { Fields } from 'jira.js/out/version2/models'
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
import { getImageFile, jsonParse, time } from 'src/helpers'
import { CustomConfigService } from 'src/modules'
import { JiraService } from 'src/modules/jira'
import { ChatTelegrafContextType, JiraConfigType, TgInitUser } from 'src/types'
import { SceneContext } from 'telegraf/typings/scenes'

import { UserContext } from '../../decorator/user.request.decorator'
import { createNonCommandRegex } from './utils'

dayjs.extend(isBetween)

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
  @UseSafeGuards(ChatTelegrafGuard, UserTelegrafGuard, UserSupergroupTelegrafGuard)
  async taskCreationWithPhoto(
    @Ctx() ctx: SceneContext,
    @UserContext() userContext: TgInitUser,
    @ChatTelegrafContext() chatContext: ChatTelegrafContextType,
  ) {
    const imageId = (ctx.message as any).photo?.pop?.()?.file_id

    const imageUrl = await ctx.telegram.getFileLink(imageId)

    const { filePath } = await getImageFile(imageUrl)

    try {
      const projectKey = chatContext?.topic?.name?.split('=')?.[1]

      // В качестве тайтла вытаскиваем первый абзац и первые 100 символов
      const summary = ctx?.text?.split('\n')?.[0]?.slice(0, 100)

      const description = ctx?.text

      const { createdLink, key } = await this.jiraService.createTask({
        key: projectKey,
        summary: `[JiraBot] ${summary}`,
        issueType: 'Bug',
        description: `${description}\nCreated by bot from: https://t.me/c/${chatContext?.chat?.id?.toString()?.replace('-100', '')}/${chatContext?.threadMessageId}/${ctx?.message?.message_id}\nCaller user: @${userContext.username} (${userContext.firstName} ${userContext.lastName})`,
      })

      try {
        await this.jiraService.attachFile(key, filePath)
      } catch (error) {
        this.logger.error(error)

        await fs.unlinkSync(filePath)
      }

      await fs.unlinkSync(filePath)

      await ctx.reply(`Успешно добавлена в Jira: ${createdLink}`, {
        reply_parameters: {
          message_id: ctx?.message?.message_id,
        },
      })
    } catch (error) {
      this.logger.error(error)

      await fs.unlinkSync(filePath)
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

    if (!jiraConfig.availabilityListKeys?.includes(key) && !jiraConfig.isSuperAdmin) {
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
  async getSprintsSpentTime(@Ctx() ctx: SceneContext, @JiraConfig() jiraConfig: JiraConfigType) {
    const [, key] = (ctx as any)?.update?.callback_query?.data?.split(' ')

    const sprint = await this.jiraService.getSprint(key)
    const definedIssues = await this.jiraService.getIssuesBySprint(key)

    const currentIssueLenght = definedIssues.issues.length

    if (definedIssues.total > currentIssueLenght) {
      /**
       * Генерим длину массива startAt свойств
       */
      const size = Math.floor(definedIssues.total / currentIssueLenght)

      const startAtArray = Array.from({ length: size }, (_, index) => definedIssues.total * (index + 1))

      for await (const startAt of startAtArray) {
        const response = await this.jiraService.getIssuesBySprint(key, startAt)
        definedIssues.issues.push(...response.issues)
      }

      return
    }

    const srtartDate = sprint.startDate
    const endDate = sprint.completeDate || sprint.endDate

    const parsedIssues = definedIssues.issues.filter((issue) => {
      if (jiraConfig.isSuperAdmin) {
        return true
      }

      if (jiraConfig.availabilityListKeys?.includes(issue.fields.project.key) || jiraConfig.isSuperAdmin) {
        return true
      }

      return false
    })

    if (!parsedIssues.length) {
      await ctx.reply(`У вас нет доступа к задачам спринта ${sprint.name}`)

      return
    }

    const preparedIssuesWithFullWorklogs = await Promise.all(
      parsedIssues.map(async (issue) => {
        if (issue.fields.worklog.total > issue.fields.worklog.worklogs.length) {
          const response = await this.jiraService.getIssueWorklogs(issue.id)
          const parsed = jsonParse<Fields['worklog']>(response)

          if (parsed && typeof parsed === 'object' && 'worklogs' in parsed) {
            return {
              ...issue,
              fields: {
                ...issue.fields,
                worklog: {
                  ...issue.fields.worklog,
                  ...parsed,
                },
              },
            }
          }
        }

        return issue
      }),
    )

    const issues = preparedIssuesWithFullWorklogs
      .filter(async (issue) => {
        if (jiraConfig.isSuperAdmin) {
          return true
        }

        if (!jiraConfig.availabilityListKeys?.includes(issue.fields.project.key) && !jiraConfig.isSuperAdmin) {
          return false
        }

        const worklogs = issue.fields.worklog.worklogs

        const parsedWorkLogs = worklogs.filter((log) => {
          if (jiraConfig.isSuperAdmin) {
            return true
          }

          const availableByEmail = jiraConfig.relationNames.includes(log.author.emailAddress)
          const availableByNickname = jiraConfig.relationNames.includes(log.author.displayName)

          return availableByEmail || availableByNickname
        })

        return parsedWorkLogs.some((log) => {
          const isAvailableLogDate = dayjs(log.created).isBetween(srtartDate, endDate)

          return isAvailableLogDate
        })
      })
      .map((issue) => {
        return {
          ...issue,
          fields: {
            ...issue.fields,
            worklog: {
              ...issue.fields.worklog,
              worklogs: issue.fields.worklog.worklogs.filter((log) =>
                dayjs(log.created).isBetween(srtartDate, endDate),
              ),
            },
          },
        }
      })

    const handleGetTimetrackingPerUser = () => {
      const usersSumOfTracking = issues.reduce(
        (
          all: Record<
            string,
            {
              displayName: string
              timeSpent: number
              projectKey: string
              email?: string
            }
          >,
          issue: (typeof issues)[0],
        ) => {
          const worklogs = issue.fields.worklog.worklogs?.filter((log) => {
            if (jiraConfig.isSuperAdmin) {
              return true
            }

            const availableByEmail = jiraConfig.relationNames.includes(log.author.emailAddress)
            const availableByName = jiraConfig.relationNames.includes(log.author.displayName)

            return availableByEmail || availableByName
          })

          const projectKey = issue.fields.project.key

          worklogs.forEach((log) => {
            const displayName = log.author.displayName
            const email = log.author.emailAddress
            const accountId = log.author.accountId
            const timeSpent = log.timeSpentSeconds

            all[accountId] = {
              ...all[accountId],
              displayName,
              email,
              timeSpent: (all[accountId]?.timeSpent || 0) + timeSpent,
              projectKey,
            }
          })

          return all
        },
        {},
      )

      const data = Object.entries(usersSumOfTracking).map(([, { displayName, email, timeSpent, projectKey }]) => {
        const spendedTime = timeSpent ? timeSpent / 3600 : 0
        const timeSpentHours = timeSpent ? `"${`${spendedTime}`.replace('.', ',')}"` : 0

        const relationTgNickname = this.customConfigService.relationUserNameOrIdWithJira.find(
          (value) => value.relationValues.includes(email) || value.relationValues.includes(displayName),
        )

        const salaryRelation = jiraConfig.allSalaryRelationByTgAndProject?.[relationTgNickname?.nickNameOrId]

        const currentProjectSalary = salaryRelation?.find((value) => value.key === projectKey)

        const finalSalary = currentProjectSalary || salaryRelation?.[0]

        return {
          displayName,
          timeSpentHours,
          email,
          telegram: relationTgNickname?.nickNameOrId,
          salary: finalSalary?.amount,
          currency: finalSalary?.currency,
          type: finalSalary?.type === 'hourly' ? 'За час' : 'Фиксированная за спринт',
          sumOfSalary:
            finalSalary?.type === 'hourly'
              ? Number(finalSalary?.amount) * Number(spendedTime || 0)
              : finalSalary?.amount,
        }
      })

      const keys = ['displayName', 'timeSpentHours', 'email', 'telegram', 'salary', 'currency', 'type', 'sumOfSalary']

      let csvContent = ''
      const head = keys.join(',')
      csvContent += `${head}\r\n`

      data?.forEach((item: Record<string, string | number>) => {
        const rowArray = keys?.map((key) => item?.[key])
        const row = rowArray.join(',')
        csvContent += `${row}\r\n`
      })

      const buffer = Buffer.from(csvContent, 'utf-8')

      return buffer
    }

    const handleGetIssuesTimeTrackingData = () => {
      const timeTrackingData = issues
        .reduce((parsedIssues, issue) => {
          const link = `${this.jiraService.baseURL}/browse/${issue.key}`

          const worklogs = issue.fields.worklog.worklogs?.filter((log) => {
            if (jiraConfig.isSuperAdmin) {
              return true
            }

            const availableByEmail = jiraConfig.relationNames.includes(log.author.emailAddress)
            const availableByName = jiraConfig.relationNames.includes(log.author.displayName)

            return availableByEmail || availableByName
          })

          const issuesByWorklogAuthor = worklogs.reduce((acc, log) => {
            const author = log.author.displayName

            const definedRecord = acc[author]

            if (definedRecord) {
              return {
                ...acc,
                [author]: {
                  ...definedRecord,
                  timeSpent: (definedRecord?.timeSpent || 0) + log.timeSpentSeconds,
                  timetracking: `${definedRecord?.timetracking || ''} => "\r\n${author} ${`${log.timeSpentSeconds / 3600}`.replace('.', ',')} ${log.comment || ''}"`,
                },
              }
            }

            const estimationTime =
              (issue.fields.aggregatetimeoriginalestimate && issue.fields.aggregatetimeoriginalestimate / 3600) || 0
            const fullFactSpentTime = (issue.fields.timespent && issue.fields.timespent / 3600) || 0
            const overtimeSpent = fullFactSpentTime - estimationTime || 0

            const payload = {
              link,
              key: issue.key,
              title: `"${issue.fields.summary}"`,
              status: issue.fields.status.name,
              assigneeName: log.author.displayName,
              assigneeEmail: log.author?.emailAddress,
              timeSpent: log.timeSpentSeconds,
              sprintsHistory: (issue.fields as any).closedSprints
                ? `${(issue.fields as any).closedSprints?.map((sprint) => sprint.name).join(' => ')}`
                : '',
              overtimeSpent:
                estimationTime && fullFactSpentTime
                  ? `"Estimation: ${estimationTime}h, Fact: ${fullFactSpentTime}h" => "Overtimed: ${overtimeSpent > 0 ? `${overtimeSpent}h` : '0h'}"`
                  : '',
              timetracking: `"${author} ${`${log.timeSpentSeconds / 3600}`.replace('.', ',')} ${log.comment || ''}"`,
              id: issue.id,
            }

            return { ...acc, [author]: payload }
          }, {})

          return [...parsedIssues, ...Object.values(issuesByWorklogAuthor)]
        }, [])
        .map((issue) => ({
          ...issue,
          timeSpentHours: issue.timeSpent ? `"${`${issue.timeSpent / 3600}`.replace('.', ',')}"` : 0,
        }))

      const groupedByAuthor = timeTrackingData?.reduce((acc, item) => {
        const key = `${item.assigneeName}-${item.assigneeEmail}`
        const containerByNameIssues = acc?.[key] || []

        return {
          ...acc,
          [key]: [...containerByNameIssues, item],
        }
      }, {})

      const groupedTimeTrackingData = Object.values(groupedByAuthor)
        .map((items) => items)
        .flat?.()

      const keys = [
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
      ]

      let csvContent = ''
      const head = keys.join(',')
      csvContent += `${head}\r\n`

      groupedTimeTrackingData?.forEach((item: Record<string, string | number>) => {
        const rowArray = keys?.map((key) => item?.[key])
        const row = rowArray.join(',')
        csvContent += `${row}\r\n`
      })

      const buffer = Buffer.from(csvContent, 'utf-8')

      return buffer
    }

    const filename = `${sprint.name}_${time(srtartDate).format('DD-MM-YYYY_HH:mm')}_${time(endDate).format('DD-MM-YYYY_HH:mm')}_sprint_issues.csv`

    await ctx.replyWithDocument(
      { source: handleGetIssuesTimeTrackingData(), filename: `${filename}_${sprint.name}_sprint_issues.csv` },
      {
        caption: `Задачи за спринт: ${sprint.name}, ID=${sprint.id}\nВсего задач: (${issues.length})`,
      },
    )

    await ctx.replyWithDocument(
      {
        source: handleGetTimetrackingPerUser(),
        filename: `${filename}_user_time_spent.csv`,
      },
      {
        caption: `Потраченное время исполнителями за спринт: ${sprint.name}, ID=${sprint.id}`,
      },
    )
  }

  @Hears(createNonCommandRegex(MAIN_CALLBACK_DATA))
  @AvailableChatTypes('supergroup')
  @UseSafeGuards(ChatTelegrafGuard, UserTelegrafGuard, UserSupergroupTelegrafGuard)
  async taskCreation(
    @Ctx() ctx: SceneContext,
    @UserContext() userContext: TgInitUser,
    @ChatTelegrafContext() chatContext: ChatTelegrafContextType,
  ) {
    const paramsString = chatContext?.topic?.name?.split(':')[1]
    const params = paramsString?.split('&')

    const paramsObject = params?.reduce((acc: Record<string, string>, param) => {
      const [key, value] = param.split('=')
      acc[key] = value

      return acc
    }, {})

    const { key: projectKey, type: issueType = 'Bug' } = paramsObject

    if (!projectKey) {
      return
    }

    if (!['Bug', 'Task', 'Story'].includes(issueType)) {
      return
    }

    // В качестве тайтла вытаскиваем первый абзац и первые 100 символов
    const summary = ctx?.text?.split('\n')?.[0]?.slice(0, 100)

    const description = ctx?.text

    const { createdLink } = await this.jiraService.createTask({
      key: projectKey,
      summary: `[JiraBot] ${summary}`,
      issueType,
      description: `${description}\nCreated by bot from: https://t.me/c/${chatContext?.chat?.id?.toString()?.replace('-100', '')}/${chatContext?.threadMessageId}/${ctx?.message?.message_id}\nCaller user: @${userContext.username} (${userContext.firstName} ${userContext.lastName})`,
    })

    await ctx.reply(`Успешно добавлена в Jira: ${createdLink}`, {
      reply_parameters: {
        message_id: ctx?.message?.message_id,
      },
    })
  }
}
