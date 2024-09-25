import { Module } from '@nestjs/common'
import { CustomConfigModule } from 'src/modules'
import { JiraModule } from 'src/modules/jira'

import { MainJiraSceneService } from './main.jira.scene.service'
import { MainSceneService } from './main.scene.service'

@Module({
  imports: [CustomConfigModule, JiraModule],
  controllers: [],
  providers: [MainSceneService, MainJiraSceneService],
  exports: [],
})
export class MainSceneModule {}
