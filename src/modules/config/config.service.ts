import { Inject, Injectable } from '@nestjs/common'
import { ConfigService } from '@nestjs/config'

@Injectable()
export class CustomConfigService {
  public miniAppUrl: string
  public apiUrl: string
  public tgToken: string

  constructor(
    @Inject(ConfigService)
    private configService: ConfigService,
  ) {
    this.miniAppUrl = this.configService.get<string>('MINI_APP_URL')
    this.apiUrl = this.configService.get<string>('API_URL')
    this.tgToken = this.configService.get<string>('TELEGRAM_BOT_KEY')
  }
}
