import { Module } from '@nestjs/common'

import { JiraService } from './jira.service'

@Module({
  imports: [],
  controllers: [],
  providers: [JiraService],
  exports: [JiraService],
})
export class JiraModule {}
