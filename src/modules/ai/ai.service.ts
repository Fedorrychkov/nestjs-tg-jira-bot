import { Injectable, Logger } from '@nestjs/common'

import { OpenAiService } from './openai/openai.service'

@Injectable()
export class AiService {
  private readonly logger = new Logger(AiService.name)

  private readonly models = OpenAiService?.models

  constructor(private readonly openaiService: OpenAiService) {}

  private getAiByModel(model: string) {
    if (!this.models.includes(model)) {
      throw new Error(`Model ${model} is not supported`)
    }

    if (OpenAiService?.models.includes(model)) {
      return this.openaiService
    }

    throw new Error(`Model ${model} is not supported`)
  }

  async codeReview(filename: string, patch: string, model: string, language?: string) {
    if (!patch || !filename) {
      return {
        lgtm: true,
        review_comment: '',
      }
    }

    const ai = this.getAiByModel(model)

    return ai.codeReview(filename, patch, model, language)
  }
}
