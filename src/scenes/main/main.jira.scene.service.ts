import { Injectable, Logger } from '@nestjs/common'
import * as fs from 'fs'
import { Ctx, Hears, On, Update } from 'nestjs-telegraf'
import { AvailableChatTypes, ChatTelegrafContext } from 'src/decorator'
import { ChatTelegrafGuard, UserSupergroupTelegrafGuard, UserTelegrafGuard, UseSafeGuards } from 'src/guards'
import { getImageFile } from 'src/helpers'
import { JiraService } from 'src/modules/jira'
import { ChatTelegrafContextType, TgInitUser } from 'src/types'
import { SceneContext } from 'telegraf/typings/scenes'

import { UserContext } from '../../decorator/user.request.decorator'

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
