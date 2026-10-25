import { Module } from '@nestjs/common'

import { CustomConfigModule } from '../config'
import { AdminService } from './admin.service'

@Module({ imports: [CustomConfigModule], providers: [AdminService], exports: [AdminService] })
export class AdminModule {}
