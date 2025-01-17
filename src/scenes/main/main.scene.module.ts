import { Module } from '@nestjs/common'
import { CustomConfigModule } from 'src/modules'
import { GithubModule } from 'src/modules/github'
import { JiraModule } from 'src/modules/jira'

import { MainGithubSceneService } from './main.github.scene.service'
import { MainJiraSceneService } from './main.jira.scene.service'
import { MainSceneService } from './main.scene.service'

@Module({
  imports: [CustomConfigModule, JiraModule, GithubModule],
  controllers: [],
  providers: [MainGithubSceneService, MainSceneService, MainJiraSceneService],
  exports: [],
})
export class MainSceneModule {}
