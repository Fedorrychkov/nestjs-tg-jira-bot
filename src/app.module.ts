import { Module } from '@nestjs/common'
import { ConfigModule, ConfigService } from '@nestjs/config'
import { TelegrafModule } from 'nestjs-telegraf'
import * as LocalSession from 'telegraf-session-local'

import { AppController } from './app.controller'
import { getEnvFile } from './env'
import { AdminModule } from './modules/admin/admin.module'
import { AdminService } from './modules/admin/admin.service'
import { GithubModule } from './modules/github'
import { JiraModule } from './modules/jira'
import { MainSceneModule } from './scenes'

const session = new LocalSession()

@Module({
  imports: [
    JiraModule,
    GithubModule,
    ConfigModule.forRoot({
      isGlobal: true,
      envFilePath: getEnvFile(),
    }),
    TelegrafModule.forRootAsync({
      imports: [ConfigModule, AdminModule],
      useFactory: (configService: ConfigService, admin: AdminService) => ({
        token: configService.get<string>('TELEGRAM_BOT_KEY'),
        middlewares: [admin.middleware, session.middleware()],
      }),
      inject: [ConfigService, AdminService],
    }),
    MainSceneModule,
  ],
  controllers: [AppController],
  providers: [],
})
export class AppModule {}
