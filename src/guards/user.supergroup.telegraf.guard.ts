import { ExecutionContext, Logger } from '@nestjs/common'
import { TelegrafExecutionContext } from 'nestjs-telegraf'
import { TelegrafUpdateType } from 'src/types'
import { Context } from 'telegraf'

import { SafeGuardInterceptor } from './safe.guard.interceptor'

/**
 * Гвард нужен для:
 * - Вытаскивание пользователя из контекста из базы данных или телеграм
 * - Проверяет роль пользователя
 */
export class UserSupergroupTelegrafGuard extends SafeGuardInterceptor {
  private readonly logger = new Logger(UserSupergroupTelegrafGuard.name)

  constructor() {
    super()
  }

  async canActivate(context: ExecutionContext): Promise<boolean> {
    try {
      const ctx = TelegrafExecutionContext.create(context)
      const telegrafCtx = ctx.getContext<Context>()
      const update = ((telegrafCtx as any)?.update?.callback_query || telegrafCtx?.update) as TelegrafUpdateType

      const chatType = update?.message?.chat?.type || ''

      if (chatType !== 'supergroup') {
        telegrafCtx.reply('Бот доступен только в супергруппах').then((response) => {
          setTimeout(() => {
            telegrafCtx?.deleteMessage(response?.message_id)
          }, 5000)
        })

        return false
      }

      return true
    } catch (error) {
      this.logger.error(error)

      return false
    }
  }
}
