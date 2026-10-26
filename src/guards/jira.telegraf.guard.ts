import { ExecutionContext, Inject, Logger } from '@nestjs/common'
import { TelegrafExecutionContext } from 'nestjs-telegraf'
import { CustomConfigService } from 'src/modules'
import { JiraConfigType, TelegrafUpdateType } from 'src/types'
import { Context } from 'telegraf'

import { SafeGuardInterceptor } from './safe.guard.interceptor'

/**
 * Гвард нужен для:
 * - Вытаскивание пользователя из контекста из базы данных или телеграм
 * - Проверяет роль пользователя
 */
export class JiraTelegrafGuard extends SafeGuardInterceptor {
  private readonly logger = new Logger(JiraTelegrafGuard.name)

  constructor(
    @Inject(CustomConfigService)
    private readonly customConfigService: CustomConfigService,
  ) {
    super()
  }

  async canActivate(context: ExecutionContext): Promise<boolean> {
    try {
      const ctx = TelegrafExecutionContext.create(context)
      const telegrafCtx = ctx.getContext<Context>()
      const update = ((telegrafCtx as any)?.update?.callback_query || telegrafCtx?.update) as TelegrafUpdateType

      const request = context.switchToHttp().getRequest()

      const from = update?.from || update?.message?.from
      const jiraConfig: JiraConfigType = this.customConfigService.jiraConfigFor(from)

      request.jiraConfig = jiraConfig

      return true
    } catch (error) {
      this.logger.error(error)

      return false
    }
  }
}
