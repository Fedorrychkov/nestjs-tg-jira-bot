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

      const superAdminAvailabilityList = this.customConfigService.superAdminList
        .map((nickname) => nickname.toLowerCase().trim())
        .filter((usernameOrId) => {
          if (usernameOrId.toLowerCase().trim() === from?.username?.toLowerCase().trim()) {
            return true
          }

          if (usernameOrId.toLowerCase().trim() === `${from?.id}`.toLowerCase().trim()) {
            return true
          }

          return false
        })

      const jiraAvailabilityListKeys = this.customConfigService.availabilityUsersByKeys.filter((values) => {
        if (values.nicknamesOrIds.includes(from?.username?.toLowerCase().trim())) {
          return true
        }

        if (values.nicknamesOrIds.includes(`${from?.id}`.toLowerCase().trim())) {
          return true
        }

        return false
      })

      const isSuperAdmin = superAdminAvailabilityList.length > 0

      const relationUserNameOrIdWithJira = this.customConfigService.relationUserNameOrIdWithJira
        .filter((values) => {
          if (values.nickNameOrId.toLowerCase().trim() === from?.username?.toLowerCase().trim()) {
            return true
          }

          if (values.nickNameOrId.toLowerCase().trim() === `${from?.id}`.toLowerCase().trim()) {
            return true
          }

          return false
        })
        .map((value) => value.relationValues)
        .flatMap((value) => value)

      const salaryRelationByTgAndProjectByUsername =
        this.customConfigService.salaryRelationByTgAndProject?.[from?.username?.toLowerCase().trim()]
      const salaryRelationByTgAndProjectById =
        this.customConfigService.salaryRelationByTgAndProject?.[`${from?.id}`?.toLowerCase().trim()]

      const jiraConfig: JiraConfigType = {
        isSuperAdmin,
        availabilityListKeys: jiraAvailabilityListKeys.map((value) => value.key),
        relationNames: relationUserNameOrIdWithJira || [],
        selfSalaryRelationByTgAndProject: salaryRelationByTgAndProjectByUsername || salaryRelationByTgAndProjectById,
        allSalaryRelationByTgAndProject: this.customConfigService.salaryRelationByTgAndProject,
      }

      request.jiraConfig = jiraConfig

      return true
    } catch (error) {
      this.logger.error(error)

      return false
    }
  }
}
