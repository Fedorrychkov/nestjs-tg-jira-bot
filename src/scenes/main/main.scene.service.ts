import { Injectable, Logger } from '@nestjs/common'
import { Ctx, Help, Start, Update } from 'nestjs-telegraf'
import { AvailableChatTypes, ChatTelegrafContext } from 'src/decorator'
import {
  ChatTelegrafGuard,
  RemoveSupergroupMessagesTelegrafGuard,
  UserSupergroupTelegrafGuard,
  UserTelegrafGuard,
  UseSafeGuards,
} from 'src/guards'
import { JiraService } from 'src/modules/jira'
import { ChatTelegrafContextType, TgInitUser } from 'src/types'
import { Context } from 'telegraf'
import { SceneContext } from 'telegraf/typings/scenes'

import { UserContext } from './../../decorator/user.request.decorator'
import { botWelcomeCommandsText } from './constants'

@Update()
@Injectable()
export class MainSceneService {
  private logger = new Logger(MainSceneService.name)

  constructor(private readonly jiraService: JiraService) {}

  @Start()
  @AvailableChatTypes('supergroup')
  @UseSafeGuards(
    ChatTelegrafGuard,
    UserTelegrafGuard,
    UserSupergroupTelegrafGuard,
    RemoveSupergroupMessagesTelegrafGuard,
  )
  async startCommand(
    @Ctx() ctx: SceneContext,
    @UserContext() userContext: TgInitUser,
    @ChatTelegrafContext() chatContext: ChatTelegrafContextType,
  ) {
    const projects = await this.jiraService.getProjects()
    const projectKey = chatContext.topic?.name?.split('=')?.[1]
    const project = projects?.find((project) => project.key === projectKey)

    if (project) {
      await ctx.reply(
        `Бот имеет доступ к проекту ${project?.name}. Теперь, достаточно отправлять сообщение в этот топик, для отправки их в Jira.`,
      )

      return
    }

    if (chatContext?.chat?.id && chatContext?.chat?.type === 'supergroup') {
      await ctx.reply(`Проект по ключу в топике не найден\n${botWelcomeCommandsText}`)

      return
    }
  }

  @Help()
  @AvailableChatTypes('supergroup')
  @UseSafeGuards(
    ChatTelegrafGuard,
    UserTelegrafGuard,
    UserSupergroupTelegrafGuard,
    RemoveSupergroupMessagesTelegrafGuard,
  )
  async helpCommand(ctx: Context) {
    await ctx.reply(botWelcomeCommandsText)
  }
}
