import { Injectable, Logger } from '@nestjs/common'
import { Action, Command, Ctx, Update } from 'nestjs-telegraf'
import { MAIN_CALLBACK_DATA } from 'src/constants'
import { AvailableChatTypes } from 'src/decorator'
import { ChatTelegrafGuard, UserTelegrafGuard, UseSafeGuards } from 'src/guards'
import { CustomConfigService } from 'src/modules'
import { GithubService } from 'src/modules/github'
import { SceneContext } from 'telegraf/typings/scenes'

@Update()
@Injectable()
export class MainGithubSceneService {
  private readonly logger = new Logger(MainGithubSceneService.name)

  constructor(
    private readonly customConfigService: CustomConfigService,
    private readonly githubService: GithubService,
  ) {}

  @Command(MAIN_CALLBACK_DATA.GET_GITHUB_PROJECTS)
  @Action(/^get_github_projects(?: (\d+))?$/)
  @AvailableChatTypes('private')
  @UseSafeGuards(ChatTelegrafGuard, UserTelegrafGuard)
  async getGithubProjects(@Ctx() ctx: SceneContext) {
    if (ctx.callbackQuery) await ctx.answerCbQuery()
    const workflows = this.customConfigService.workflowsFor(ctx.from)

    if (!workflows.length) {
      await ctx.reply('Нет доступных workflows. Обратитесь к администратору.')

      return
    }
    const data = ctx.callbackQuery && 'data' in ctx.callbackQuery ? ctx.callbackQuery.data : ''
    const page = Number(data.split(' ')[1]) || 0
    const size = 8
    const navigation = []

    if (page > 0) navigation.push({ text: '←', callback_data: `get_github_projects ${page - 1}` })

    if ((page + 1) * size < workflows.length)
      navigation.push({ text: '→', callback_data: `get_github_projects ${page + 1}` })
    await ctx.reply('Разрешённые workflows. Нажатие запускает выбранный workflow:', {
      reply_markup: {
        inline_keyboard: [
          ...workflows.slice(page * size, (page + 1) * size).map((workflow) => [
            {
              text: `${workflow.owner}/${workflow.repoName} · ${workflow.environment}/${workflow.appType} · ${workflow.branch}`.slice(
                0,
                100,
              ),
              callback_data: `${MAIN_CALLBACK_DATA.GET_GITHUB_PROJECTS_WORKFLOWS_ITEM} ${workflow.id}`,
            },
          ]),
          ...(navigation.length ? [navigation] : []),
        ],
      },
    })
  }

  @Action(/^gh_workflow_item ([a-f0-9]{8})$/)
  @AvailableChatTypes('private')
  @UseSafeGuards(ChatTelegrafGuard, UserTelegrafGuard)
  async runGithubWorkflow(@Ctx() ctx: SceneContext) {
    await ctx.answerCbQuery()
    const data = ctx.callbackQuery && 'data' in ctx.callbackQuery ? ctx.callbackQuery.data : ''
    const id = data.split(' ')[1]
    const config = this.customConfigService.workflowsFor(ctx.from).find((workflow) => workflow.id === id)

    if (!config) {
      await ctx.reply('Нет доступа к этому workflow. Откройте /get_github_projects заново.')

      return
    }

    try {
      const workflows = await this.githubService.getWorkflows(config.repoName, config.owner)

      if (!workflows.data.workflows?.some((workflow) => workflow.path === `.github/workflows/${config.workflowId}`)) {
        await ctx.reply(`Workflow ${config.workflowId} не найден`)

        return
      }
      // Recheck after the API call: an admin may have revoked access or changed the target.
      const current = this.customConfigService.workflowsFor(ctx.from).find((workflow) => workflow.id === id)

      if (!current || JSON.stringify(current) !== JSON.stringify(config)) {
        await ctx.reply('Доступ или настройки изменились. Откройте /get_github_projects заново.')

        return
      }
      await this.githubService.runWorkflow(current)
      await ctx.reply(
        `Запуск отправлен: ${config.owner}/${config.repoName}\n${config.environment}/${config.appType}, ветка ${config.branch}`,
        {
          reply_markup: {
            inline_keyboard: [
              [
                {
                  text: 'Открыть GitHub Actions',
                  url: `https://github.com/${encodeURIComponent(config.owner)}/${encodeURIComponent(config.repoName)}/actions/workflows/${encodeURIComponent(config.workflowId)}`,
                },
              ],
            ],
          },
        },
      )
    } catch (error) {
      this.logger.error('Workflow dispatch failed', error)
      await ctx.reply('Не удалось запустить workflow. Попробуйте позже.')
    }
  }
}
