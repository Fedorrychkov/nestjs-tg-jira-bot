import { ExecutionContext, Logger } from '@nestjs/common'
import { TelegrafExecutionContext } from 'nestjs-telegraf'
import { TelegrafUpdateType } from 'src/types'
import { Context } from 'telegraf'

import { SafeGuardInterceptor } from './safe.guard.interceptor'

export class RemoveSupergroupMessagesTelegrafGuard extends SafeGuardInterceptor {
  private readonly logger = new Logger(RemoveSupergroupMessagesTelegrafGuard.name)

  constructor() {
    super()
  }

  async canActivate(context: ExecutionContext): Promise<boolean> {
    try {
      const ctx = TelegrafExecutionContext.create(context)
      const telegrafCtx = ctx.getContext<Context>()
      const update = ((telegrafCtx as any)?.update?.callback_query || telegrafCtx?.update) as TelegrafUpdateType

      const chatType = update?.message?.chat?.type || ''

      if (chatType === 'private') {
        return true
      }

      if (chatType === 'supergroup') {
        const admins = await telegrafCtx?.getChatAdministrators()
        const currentBot = admins?.find(
          (user) =>
            user?.user?.is_bot &&
            user?.user?.username?.toLowerCase().includes('jira_push') &&
            user?.user?.username?.toLowerCase().includes('_bot'),
        )
        const isCanDeleteMessages = (currentBot as any)?.can_delete_messages || false

        if (isCanDeleteMessages) {
          telegrafCtx?.deleteMessage(telegrafCtx?.msgId).catch()
        }

        return true
      }

      return true
    } catch (error) {
      this.logger.error(error)

      return false
    }
  }
}
