import { Module } from '@nestjs/common'

import { AiService } from './ai.service'
import { OpenaiModule } from './openai'

@Module({
  imports: [OpenaiModule],
  providers: [AiService],
  exports: [AiService],
})
export class AiModule {}
