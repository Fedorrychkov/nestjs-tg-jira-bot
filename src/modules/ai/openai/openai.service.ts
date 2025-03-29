// https://api.openai.com/v1/chat/completions

import { Injectable, Logger } from '@nestjs/common'
import { ConfigService } from '@nestjs/config'
import axios, { AxiosInstance } from 'axios'

@Injectable()
export class OpenAiService {
  private readonly logger = new Logger(OpenAiService.name)
  private readonly client: AxiosInstance
  private readonly openaiApiKey: string

  static readonly models = ['gpt-4o-mini']

  constructor(private readonly configService: ConfigService) {
    this.openaiApiKey = this.configService.get('OPENAI_API_KEY')

    if (!this.openaiApiKey) {
      this.logger.error('OPENAI_API_KEY is not set')
    }

    this.client = axios.create({
      baseURL: 'https://api.openai.com/v1',
      headers: {
        Authorization: `Bearer ${this.openaiApiKey}`,
      },
    })
  }

  private generatePrompt = (filename: string, patch: string, model: string, language?: string) => {
    if (!model) {
      throw new Error('Model is not set')
    }

    if (!OpenAiService.models.includes(model)) {
      throw new Error(`Model ${model} is not supported`)
    }

    const answerLanguage = language ? `Answer me in ${language}` : ''

    const userPrompt = `Please review the following code patch for file ${filename}. Focus on potential bugs, risks, and improvement suggestions.`

    const jsonFormatRequirement =
      '\nProvide your feedback in a strict JSON format with the following structure:\n' +
      '{\n' +
      '  "lgtm": boolean, // true if the code looks good to merge, false if there are concerns\n' +
      '  "review_comment": string // Your detailed review comments. You can use markdown syntax in this string, but the overall response must be a valid JSON\n' +
      '}\n' +
      'Ensure your response is a valid JSON object.\n'

    return `${userPrompt}${jsonFormatRequirement} ${answerLanguage}:
    ${patch}
    `
  }

  async codeReview(filename: string, patch: string, model: string, language?: string) {
    if (!patch || !filename) {
      return {
        lgtm: true,
        review_comment: '',
      }
    }

    const prompt = this.generatePrompt(filename, patch, model, language)

    const response = await this.client.post('/chat/completions', {
      messages: [
        {
          role: 'user',
          content: prompt,
        },
      ],
      model,
      temperature: 1,
      top_p: 1,
      max_completion_tokens: undefined,
      response_format: {
        type: 'json_object',
      },
    })

    if (Array.isArray(response?.data?.choices) && response?.data?.choices?.length) {
      try {
        const json = JSON.parse(response.data.choices[0].message.content || '')

        return json
      } catch (e) {
        return {
          lgtm: false,
          review_comment: response.data.choices[0].message.content || '',
        }
      }
    }

    return {
      lgtm: true,
      review_comment: '',
    }
  }
}
