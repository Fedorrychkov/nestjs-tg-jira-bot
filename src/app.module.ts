import { Module } from '@nestjs/common'
import { ConfigModule, ConfigService } from '@nestjs/config'
import { TelegrafModule } from 'nestjs-telegraf'
import * as LocalSession from 'telegraf-session-local'

import { AppController } from './app.controller'
import { getEnvFile } from './env'
import { JiraModule } from './modules/jira'
import { MainSceneModule } from './scenes'

const session = new LocalSession()

@Module({
  imports: [
    JiraModule,
    ConfigModule.forRoot({
      isGlobal: true,
      envFilePath: getEnvFile(),
    }),
    TelegrafModule.forRootAsync({
      imports: [ConfigModule],
      useFactory: (configService: ConfigService) => ({
        token: configService.get<string>('TELEGRAM_BOT_KEY'),
        middlewares: [session.middleware()],
      }),
      inject: [ConfigService],
    }),
    MainSceneModule,
  ],
  controllers: [AppController],
  providers: [],
})
export class AppModule {}
