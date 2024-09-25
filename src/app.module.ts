import { Module } from '@nestjs/common'
import { ConfigModule } from '@nestjs/config'

import { getEnvFile } from './env'

@Module({
  imports: [
    ConfigModule.forRoot({
      isGlobal: true,
      envFilePath: getEnvFile(),
    }),
  ],
  controllers: [],
  providers: [],
})
export class AppModule {}
