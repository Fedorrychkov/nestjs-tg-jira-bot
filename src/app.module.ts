import { Module } from '@nestjs/common'
import { ConfigModule, ConfigService } from '@nestjs/config'
import { TelegrafModule } from 'nestjs-telegraf'
import * as LocalSession from 'telegraf-session-local'

import { getEnvFile } from './env'
import { MainSceneModule } from './scenes'

const session = new LocalSession()

@Module({
  imports: [
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
  controllers: [],
  providers: [],
})
export class AppModule {}
