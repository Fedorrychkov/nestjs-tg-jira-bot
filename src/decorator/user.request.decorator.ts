import { createParamDecorator, ExecutionContext } from '@nestjs/common'
import { TgInitUser } from 'src/types'

/**
 * Use inside controller arguments like: @UserContext() user: UserContext
 */
export const UserContext = createParamDecorator((_: unknown, ctx: ExecutionContext): TgInitUser => {
  const request = ctx.switchToHttp().getRequest()

  return request.userContext
})
