import { SetMetadata } from '@nestjs/common'

export const AvailableChatTypes = (...roles: string[]) => SetMetadata('chatTypes', roles)
