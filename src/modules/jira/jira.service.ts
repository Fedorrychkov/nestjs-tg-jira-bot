import { Inject, Injectable } from '@nestjs/common'
import { ConfigService } from '@nestjs/config'
import * as fs from 'fs'
import NodeJsVersion3Client, { Version3Client } from 'jira-rest-sdk'

@Injectable()
export class JiraService {
  private jira: NodeJsVersion3Client
  private baseURL: string

  constructor(
    @Inject(ConfigService)
    private configService: ConfigService,
  ) {
    const email = this.configService.get<string>('LOGIN')
    const apiToken = this.configService.get<string>('API_KEY')
    this.baseURL = this.configService.get<string>('JIRA_HOST')

    this.jira = new Version3Client({
      baseURL: this.baseURL,
      authentication: {
        basic: {
          email,
          apiToken,
        },
      },
    })
  }

  public async createTask(payload: { summary: string; description: string; key: string; issueType: 'Task' | 'Bug' }) {
    const { summary, description, key, issueType } = payload

    const createdIssue = await this.jira.createIssue({
      fields: {
        summary,
        issuetype: {
          name: issueType,
        },
        description,
        project: {
          key: key,
        },
      },
    })

    const createdLink = `${this.baseURL}/browse/${createdIssue.key}`

    return {
      createdLink,
      key: createdIssue.key,
    }
  }

  // TODO: Разобраться в загрузке файлов
  public async attachFile(key: string, file: File, filePath: string) {
    const form = new FormData()

    const fileBuffer = fs.readFileSync(filePath)
    const blob = new Blob([fileBuffer])
    form.append('file', blob)

    const attachment = await this.jira.addAttachment(
      key,
      file,
      // { ...file, type: 'image/jpeg' },
      {
        headers: {
          'X-Atlassian-Token': 'no-check',
        },
      },
    )

    return attachment
  }

  public async getProjects() {
    return await this.jira.getAllProjects()
  }
}
