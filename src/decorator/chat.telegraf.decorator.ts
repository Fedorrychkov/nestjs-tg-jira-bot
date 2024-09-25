import { createParamDecorator, ExecutionContext } from '@nestjs/common'
import type { ChatTelegrafContextType } from 'src/types'

/**
 * Use inside arg types
 */
export const ChatTelegrafContext = createParamDecorator(
  async (_: unknown, ctx: ExecutionContext): Promise<ChatTelegrafContextType> => {
    const request = ctx.switchToHttp().getRequest()

    return request.chatContext
  },
)
