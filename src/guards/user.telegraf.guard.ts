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
export class UserTelegrafGuard extends SafeGuardInterceptor {
  private readonly logger = new Logger(UserTelegrafGuard.name)

  constructor() {
    super()
  }

  async canActivate(context: ExecutionContext): Promise<boolean> {
    try {
      const ctx = TelegrafExecutionContext.create(context)
      const telegrafCtx = ctx.getContext<Context>()
      const update = ((telegrafCtx as any)?.update?.callback_query || telegrafCtx?.update) as TelegrafUpdateType

      const request = context.switchToHttp().getRequest()

      const from = update?.from || update?.message?.from

      const validContextUser = {
        id: from?.id?.toString(),
        firstName: from?.first_name,
        lastName: from?.last_name,
        username: from?.username?.toLowerCase(),
        isPremium: from?.is_premium,
        chatId: from?.id?.toString(),
        isRegistered: false,
      }

      request.userContext = validContextUser

      return true
    } catch (error) {
      this.logger.error(error)

      return false
    }
  }
}
