import { Injectable, Logger } from '@nestjs/common'
import * as dayjs from 'dayjs'
import * as isBetween from 'dayjs/plugin/isBetween'
import { Action, Command, Ctx, Update } from 'nestjs-telegraf'
import { MAIN_CALLBACK_DATA } from 'src/constants'
import { getGithubProjectWorkflowsItemsKeyboards, getGithubProjectWorkflowsKeyboards } from 'src/constants/keyboard'
import { AvailableChatTypes } from 'src/decorator'
import { ChatTelegrafGuard, UserTelegrafGuard, UseSafeGuards } from 'src/guards'
import { CustomConfigService } from 'src/modules'
import { GithubService } from 'src/modules/github'
import { SceneContext } from 'telegraf/typings/scenes'

dayjs.extend(isBetween)

@Update()
@Injectable()
export class MainGithubSceneService {
  private logger = new Logger(MainGithubSceneService.name)

  constructor(
    private readonly customConfigService: CustomConfigService,
    private readonly githubService: GithubService,
  ) {}

  @Command(MAIN_CALLBACK_DATA.GET_GITHUB_PROJECTS)
  @Action(MAIN_CALLBACK_DATA.GET_GITHUB_PROJECTS)
  @AvailableChatTypes('private')
  @UseSafeGuards(ChatTelegrafGuard, UserTelegrafGuard)
  async getGithubProjects(@Ctx() ctx: SceneContext) {
    const githubWorkflowParams = this.customConfigService.githubWorkflowSettings

    const repoNamesWithOwner = Object.keys(githubWorkflowParams).map((repoName) => {
      const params = githubWorkflowParams[repoName]
      const owner = Object.values(params).map((param) => param.owner)

      return { repoName, owner, params }
    })

    try {
      const response = await Promise.allSettled(
        repoNamesWithOwner.map(async ({ repoName, owner, params }) => {
          const repo = await this.githubService.getRepo(repoName, owner?.[0])

          return { repo, params, repoName }
        }),
      ).then((results) => results.map((result) => (result.status === 'fulfilled' ? result.value : null)))

      if (!response?.length) {
        await ctx.reply('Нет ни одного доступного проекта, пожалуйста, обратитесь к администратору')
      }

      const repos = response.map((repo) => ({
        repo: repo.repo.data,
        params: repo.params,
        repoName: repo.repoName,
      }))

      await ctx.reply('Выберите проект', {
        reply_markup: {
          inline_keyboard: getGithubProjectWorkflowsKeyboards(
            'private',
            repos.map((repo) => ({ key: repo.repoName, name: repo.repo.full_name })),
          ),
        },
      })
    } catch (error) {
      this.logger.error(error)

      await ctx.reply('Произошла ошибка, попробуйте позже')
    }
  }

  @Action(new RegExp(MAIN_CALLBACK_DATA.GET_GITHUB_PROJECTS_WORKFLOWS))
  @AvailableChatTypes('private')
  @UseSafeGuards(ChatTelegrafGuard, UserTelegrafGuard)
  async getGithubProjectsWorkflows(@Ctx() ctx: SceneContext) {
    const [, repoName] = (ctx as any)?.update?.callback_query?.data?.split(' ')
    const githubWorkflowParams = this.customConfigService.githubWorkflowSettings

    const project = githubWorkflowParams[repoName]

    if (!project) {
      await ctx.reply('Workflow/проект не найден', {
        reply_markup: {
          inline_keyboard: [[{ text: 'Github проекты', callback_data: MAIN_CALLBACK_DATA.GET_GITHUB_PROJECTS }]],
        },
      })
    }

    const owner = Object.values(project).map((param) => param.owner)

    try {
      const response = await this.githubService.getRepo(repoName, owner?.[0])

      if (!response) {
        await ctx.reply('Нет ни одного доступного проекта, пожалуйста, обратитесь к администратору', {
          reply_markup: {
            inline_keyboard: [[{ text: 'Github проекты', callback_data: MAIN_CALLBACK_DATA.GET_GITHUB_PROJECTS }]],
          },
        })
      }

      const params = Object.entries(project).map((param) => param)

      await ctx.reply(
        `Выберите workflow в ${repoName}\n\nПосле выбора, workflow запустится автоматически на Github, следите за обновлением на плафторме Github.\nДействие можно отменить лишь на Github.`,
        {
          reply_markup: {
            inline_keyboard: getGithubProjectWorkflowsItemsKeyboards(
              'private',
              params.map(([envKey, params]) => ({
                key: `${envKey} ${repoName}`,
                name: `${envKey} / ${params.workflowId}`,
              })),
            ),
          },
        },
      )
    } catch (error) {
      this.logger.error(error)

      await ctx.reply('Произошла ошибка, попробуйте позже', {
        reply_markup: {
          inline_keyboard: [[{ text: 'Github проекты', callback_data: MAIN_CALLBACK_DATA.GET_GITHUB_PROJECTS }]],
        },
      })
    }
  }

  @Action(new RegExp(MAIN_CALLBACK_DATA.GET_GITHUB_PROJECTS_WORKFLOWS_ITEM))
  @AvailableChatTypes('private')
  @UseSafeGuards(ChatTelegrafGuard, UserTelegrafGuard)
  async runGithubWorkflow(@Ctx() ctx: SceneContext) {
    const [, envKey, repoName] = (ctx as any)?.update?.callback_query?.data?.split(' ')
    const githubWorkflowParams = this.customConfigService.githubWorkflowSettings

    const project = githubWorkflowParams[repoName]

    if (!project || !project?.[envKey]) {
      await ctx.reply('Workflow/проект не найден', {
        reply_markup: {
          inline_keyboard: [[{ text: 'Github проекты', callback_data: MAIN_CALLBACK_DATA.GET_GITHUB_PROJECTS }]],
        },
      })
    }

    const config = project?.[envKey]

    const workflows = await this.githubService.getWorkflows(config.repoName, config.owner)

    if (!workflows.data.workflows?.some((workflow) => workflow.path.includes(config.workflowId))) {
      await ctx.reply(`Workflow ${config.workflowId} не найден`, {
        reply_markup: {
          inline_keyboard: [[{ text: 'Github проекты', callback_data: MAIN_CALLBACK_DATA.GET_GITHUB_PROJECTS }]],
        },
      })

      return
    }

    try {
      const response = await this.githubService.runWorkflow(config)

      if (!response) {
        await ctx.reply('Нет ни одного доступного проекта, пожалуйста, обратитесь к администратору', {
          reply_markup: {
            inline_keyboard: [[{ text: 'Github проекты', callback_data: MAIN_CALLBACK_DATA.GET_GITHUB_PROJECTS }]],
          },
        })
      }

      const runnedWorkflows = response
        ?.filter((workflow) => workflow.path.includes(config.workflowId))
        .map((workflow) => ({
          url: workflow.html_url,
          name: workflow.name,
          path: workflow.path,
          status: workflow.status,
        }))

      const labels = runnedWorkflows.map((workflow) => ({
        ...workflow,
        label: `
Workflow запущен:
Название: ${workflow.name}
Файл: ${workflow.path}
Статус: ${workflow.status}
Ссылка: ${workflow.url}`,
      }))

      await ctx.reply(`${labels?.map((label) => label.label).join('\n\n')}`, {
        reply_markup: {
          inline_keyboard: [
            ...labels?.map((item) => [{ text: `${item.name} / ${item.path}`, url: item.url }]),
            [{ text: 'Github проекты', callback_data: MAIN_CALLBACK_DATA.GET_GITHUB_PROJECTS }],
          ],
        },
      })
    } catch (error) {
      this.logger.error(error)

      await ctx.reply('Произошла ошибка, попробуйте позже', {
        reply_markup: {
          inline_keyboard: [[{ text: 'Github проекты', callback_data: MAIN_CALLBACK_DATA.GET_GITHUB_PROJECTS }]],
        },
      })
    }
  }
}
