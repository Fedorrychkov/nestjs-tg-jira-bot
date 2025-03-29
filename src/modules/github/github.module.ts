import { Module } from '@nestjs/common'

import { AiModule } from '../ai'
import { GithubService } from './github.service'

@Module({
  imports: [AiModule],
  controllers: [],
  providers: [GithubService],
  exports: [GithubService],
})
export class GithubModule {}
