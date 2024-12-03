import { Injectable, Logger } from '@nestjs/common'
import * as dayjs from 'dayjs'
import * as isBetween from 'dayjs/plugin/isBetween'
import * as fs from 'fs'
import { Action, Command, Ctx, Hears, On, Update } from 'nestjs-telegraf'
import { MAIN_CALLBACK_DATA } from 'src/constants'
import { getJiraProjectKeyboards, getJiraProjectSprintsKeyboards } from 'src/constants/keyboard'
import { AvailableChatTypes, ChatTelegrafContext } from 'src/decorator'
import { ChatTelegrafGuard, UserSupergroupTelegrafGuard, UserTelegrafGuard, UseSafeGuards } from 'src/guards'
import { getImageFile } from 'src/helpers'
import { JiraService } from 'src/modules/jira'
import { ChatTelegrafContextType, TgInitUser } from 'src/types'
import { SceneContext } from 'telegraf/typings/scenes'

import { UserContext } from '../../decorator/user.request.decorator'

dayjs.extend(isBetween)

@Update()
@Injectable()
export class MainJiraSceneService {
  private logger = new Logger(MainJiraSceneService.name)

  constructor(private readonly jiraService: JiraService) {}

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
  @UseSafeGuards(ChatTelegrafGuard, UserTelegrafGuard)
  async getProjects(@Ctx() ctx: SceneContext) {
    const response = await this.jiraService.getActiveProjects()

    await ctx.reply('Активные проекты:', {
      reply_markup: {
        inline_keyboard: getJiraProjectKeyboards(
          'private',
          response.map((project) => project.key),
        ),
      },
    })
  }
  @Action(new RegExp(MAIN_CALLBACK_DATA.GET_SPRINTS_KEY_BY_PROJECT))
  @AvailableChatTypes('private')
  @UseSafeGuards(ChatTelegrafGuard, UserTelegrafGuard)
  async getSprintsByProject(@Ctx() ctx: SceneContext) {
    const [, key] = (ctx as any)?.update?.callback_query?.data?.split(' ')

    const boards = await this.jiraService.getProjectBoards(key)
    const boardIds = boards.values.map((board) => board.id)
    const sprints = await Promise.all(boardIds.map((boardId) => this.jiraService.getBoardSprints(boardId)))

    const activeSprints = sprints.flatMap((sprint) =>
      sprint.values.filter((sprint, index, values) => {
        if (sprint.state === 'active') return true

        if (index === values.length - 2) return true

        return false
      }),
    )
    this.logger.log(activeSprints)

    await ctx.reply(`Project: ${key}\nSprints:`, {
      reply_markup: {
        inline_keyboard: getJiraProjectSprintsKeyboards('private', activeSprints),
      },
    })
  }

  @Action(new RegExp(MAIN_CALLBACK_DATA.GET_SPRINT_SPENT_TIME))
  @AvailableChatTypes('private')
  @UseSafeGuards(ChatTelegrafGuard, UserTelegrafGuard)
  async getSprintsSpentTime(@Ctx() ctx: SceneContext) {
    const [, key] = (ctx as any)?.update?.callback_query?.data?.split(' ')

    const sprint = await this.jiraService.getSprint(key)
    const definedIssues = await this.jiraService.getIssuesBySprint(key)

    this.logger.log(sprint, 'issues')

    const srtartDate = sprint.startDate
    const endDate = sprint.completeDate || sprint.endDate

    const issues = definedIssues.issues
      .filter((issue) => {
        const worklogs = issue.fields.worklog.worklogs

        return worklogs.some((log) => {
          const logDate = dayjs(log.created).isBetween(srtartDate, endDate)

          return logDate
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
            }
          >,
          issue: (typeof issues)[0],
        ) => {
          const worklogs = issue.fields.worklog.worklogs

          worklogs.forEach((log) => {
            const displayName = log.author.displayName
            const accountId = log.author.accountId
            const timeSpent = log.timeSpentSeconds

            all[accountId] = {
              ...all[accountId],
              displayName,
              timeSpent: (all[accountId]?.timeSpent || 0) + timeSpent,
            }
          })

          return all
        },
        {},
      )

      const data = Object.entries(usersSumOfTracking).map(([, { displayName, timeSpent }]) => ({
        displayName,
        timeSpentHours: timeSpent ? `"${`${timeSpent / 3600}`.replace('.', ',')}"` : 0,
      }))

      const keys = ['displayName', 'timeSpentHours']

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
        .reduce((parsedIssues: any[], issue) => {
          const link = `${this.jiraService.baseURL}/browse/${issue.key}`

          const issuesByWorklogAuthor: Record<string, any> = issue.fields.worklog.worklogs.reduce(
            (acc: Record<string, any>, log) => {
              const author = log.author.displayName

              const definedRecord = acc[author]

              if (definedRecord) {
                return {
                  ...acc,
                  [author]: {
                    ...definedRecord,
                    timeSpent: (definedRecord?.timeSpent || 0) + log.timeSpentSeconds,
                    timetracking: `${definedRecord?.timetracking || ''} => "${author} ${`${log.timeSpentSeconds / 3600}`.replace('.', ',')} ${log.comment || ''}"`,
                  },
                }
              }

              const payload = {
                link,
                key: issue.key,
                title: `"${issue.fields.summary}"`,
                status: issue.fields.status.name,
                assigneeName: log.author.displayName,
                assigneeEmail: log.author?.emailAddress,
                timeSpent: log.timeSpentSeconds,
                timetracking: `"${author} ${`${log.timeSpentSeconds / 3600}`.replace('.', ',')} ${log.comment || ''}"`,
                id: issue.id,
              }

              return { ...acc, [author]: payload }
            },
            {} as Record<string, any>,
          )

          return [...parsedIssues, ...Object.values(issuesByWorklogAuthor)]
        }, [])
        .map((issue) => ({
          ...issue,
          timeSpentHours: issue.timeSpent ? `"${`${issue.timeSpent / 3600}`.replace('.', ',')}"` : 0,
        }))

      const keys = ['link', 'assigneeName', 'assigneeEmail', 'title', 'status', 'timeSpentHours', 'timetracking', 'id']

      let csvContent = ''
      const head = keys.join(',')
      csvContent += `${head}\r\n`

      timeTrackingData?.forEach((item: Record<string, string | number>) => {
        const rowArray = keys?.map((key) => item?.[key])
        const row = rowArray.join(',')
        csvContent += `${row}\r\n`
      })

      const buffer = Buffer.from(csvContent, 'utf-8')

      return buffer
    }

    await ctx.replyWithDocument(
      { source: handleGetIssuesTimeTrackingData(), filename: `${sprint.name}_sprint_issues.csv` },
      {
        caption: `Задачи за спринт: ${sprint.name}\nВсего задач: (${issues.length})`,
      },
    )

    await ctx.replyWithDocument(
      { source: handleGetTimetrackingPerUser(), filename: `${sprint.name}_user_time_spent.csv` },
      {
        caption: `Потраченное время исполнителями за спринт: ${sprint.name}`,
      },
    )
  }

  @Hears(/.*/)
  @AvailableChatTypes('supergroup')
  @UseSafeGuards(ChatTelegrafGuard, UserTelegrafGuard, UserSupergroupTelegrafGuard)
  async taskCreation(
    @Ctx() ctx: SceneContext,
    @UserContext() userContext: TgInitUser,
    @ChatTelegrafContext() chatContext: ChatTelegrafContextType,
  ) {
    const projectKey = chatContext?.topic?.name?.split('=')?.[1]

    // В качестве тайтла вытаскиваем первый абзац и первые 100 символов
    const summary = ctx?.text?.split('\n')?.[0]?.slice(0, 100)

    const description = ctx?.text

    const { createdLink } = await this.jiraService.createTask({
      key: projectKey,
      summary: `[JiraBot] ${summary}`,
      issueType: 'Bug',
      description: `${description}\nCreated by bot from: https://t.me/c/${chatContext?.chat?.id?.toString()?.replace('-100', '')}/${chatContext?.threadMessageId}/${ctx?.message?.message_id}\nCaller user: @${userContext.username} (${userContext.firstName} ${userContext.lastName})`,
    })

    await ctx.reply(`Успешно добавлена в Jira: ${createdLink}`, {
      reply_parameters: {
        message_id: ctx?.message?.message_id,
      },
    })
  }
}
