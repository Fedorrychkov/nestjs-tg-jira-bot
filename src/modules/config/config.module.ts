import { Module } from '@nestjs/common'
import { ConfigModule } from '@nestjs/config'

import { CustomConfigService } from './config.service'

@Module({
  imports: [ConfigModule],
  controllers: [],
  providers: [CustomConfigService],
  exports: [CustomConfigService],
})
export class CustomConfigModule {}
