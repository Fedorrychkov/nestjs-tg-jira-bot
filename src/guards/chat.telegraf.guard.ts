import { ExecutionContext, Inject, Logger } from '@nestjs/common'
import { ConfigService } from '@nestjs/config'
import { Reflector } from '@nestjs/core'
import { TelegrafExecutionContext } from 'nestjs-telegraf'
import { botWelcomeCommandsText } from 'src/scenes/main/constants'
import { ChatTelegrafContextType, TelegrafUpdateType } from 'src/types'
import { Context } from 'telegraf'

import { SafeGuardInterceptor } from './safe.guard.interceptor'

export class ChatTelegrafGuard extends SafeGuardInterceptor {
  private readonly logger = new Logger(ChatTelegrafGuard.name)
  private chatId: string

  constructor(
    @Inject(Reflector) private reflector: Reflector,
    @Inject(ConfigService)
    private configService: ConfigService,
  ) {
    super()
    this.chatId = this.configService.get<string>('CHAT_ID')
  }

  canActivate(context: ExecutionContext): boolean {
    const ctx = TelegrafExecutionContext.create(context)
    const telegrafCtx = ctx.getContext<Context>()
    const update = ((telegrafCtx as any)?.update?.callback_query || telegrafCtx?.update) as TelegrafUpdateType

    const isEditableAvailable = !!(telegrafCtx as any)?.update?.callback_query

    const chatType = update?.message?.chat?.type || ''

    const chatTypes = this.reflector?.get<string[]>('chatTypes', context.getHandler())

    const isAvailable = chatTypes && chatTypes.includes(chatType)

    if (!isAvailable) {
      telegrafCtx
        .reply(`Эта команда не работает в данном типе чата, разрешено использование в ${chatTypes?.join(', ')}`)
        .then((response) => {
          setTimeout(() => {
            telegrafCtx?.deleteMessage(response?.message_id)
          }, 5000)
        })

      this.logger.error(`Chat type is forbidden, available ${chatTypes?.join(', ')}`)

      return false
    }

    if (!isAvailable && !['supergroup'].includes(chatType)) {
      telegrafCtx
        .reply(
          `
Извините, но бот умеет работать только в режиме супергруппы
${botWelcomeCommandsText}`,
        )
        .then((response) => {
          setTimeout(() => {
            telegrafCtx?.deleteMessage(response?.message_id)
          }, 5000)
        })

      this.logger.error('Chat type is forbidden')

      return false
    }

    const request = context.switchToHttp().getRequest()

    const chat = update?.message?.chat
    const replyMessage = update?.message?.reply_to_message

    if (['supergroup'].includes(chatType) && chat.id !== Number(this.chatId)) {
      telegrafCtx.reply('Извините, но этот бот не поддерживает ваш чат').then((response) => {
        setTimeout(() => {
          telegrafCtx?.deleteMessage(response?.message_id)
        }, 5000)
      })

      return
    }

    const from = update?.from || update?.message?.from
    const topic = update?.message?.forum_topic_created || update?.message?.reply_to_message?.forum_topic_created

    const isTopic = !!topic

    if (chat.id === Number(this.chatId)) {
      /**
       * Если сообщение пришло не в топике, то игнорируем его и сбрасываем
       */
      if (!isTopic) {
        return false
      }

      /**
       * Если сообщение отправлено из топика в верном формате
       */
      if (!topic?.name?.toLowerCase().includes('[jira&bot]:key=')) {
        return false
      }
    }

    request.chatContext = {
      type: chat?.type,
      isChatWithTopics: chat?.is_forum || replyMessage?.is_topic_message,
      threadMessageId: replyMessage?.message_thread_id,
      currentMessageId: replyMessage?.message_id,
      topic,
      from: from,
      chat: update?.message?.chat,
      isEditableAvailable,
    } as ChatTelegrafContextType

    return true
  }
}
