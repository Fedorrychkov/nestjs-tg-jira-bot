import { Inject, Injectable } from '@nestjs/common'
import { ConfigService } from '@nestjs/config'
import { exec } from 'child_process'
import { AgileClient } from 'jira.js'
import NodeJsVersion3Client, { Version3Client } from 'jira-rest-sdk'

@Injectable()
export class JiraService {
  private jira: NodeJsVersion3Client
  public baseURL: string
  private apiToken: string
  private email: string
  private agileClient: AgileClient

  constructor(
    @Inject(ConfigService)
    private configService: ConfigService,
  ) {
    this.email = this.configService.get<string>('LOGIN')
    this.apiToken = this.configService.get<string>('API_KEY')
    this.baseURL = this.configService.get<string>('JIRA_HOST')

    this.jira = new Version3Client({
      baseURL: this.baseURL,
      authentication: {
        basic: {
          email: this.email,
          apiToken: this.apiToken,
        },
      },
    })

    this.agileClient = new AgileClient({
      host: this.baseURL,
      authentication: {
        basic: {
          email: this.email,
          apiToken: this.apiToken,
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
      id: createdIssue.id,
    }
  }

  public async getActiveProjects() {
    const projects = await this.jira.getAllProjects()

    return projects
  }

  public async getProjectBoards(key: string) {
    const boards = await this.agileClient.board.getAllBoards({
      projectKeyOrId: key,
    })

    return boards
  }

  public async getBoardSprints(boardId: number) {
    const boards = await this.agileClient.board.getAllSprints({
      boardId,
    })

    return boards
  }

  public async getIssuesBySprint(sprintId: number) {
    const issues = await this.agileClient.sprint.getIssuesForSprint({
      sprintId,
    })

    return issues
  }

  public async getSprint(sprintId: number) {
    const issues = await this.agileClient.sprint.getSprint({
      sprintId,
    })

    return issues
  }

  public async attachFile(key: string, filePath: string) {
    return new Promise((resolve) => {
      // Solution by community: https://community.atlassian.com/t5/Jira-questions/Getting-415-403-500-when-attaching-file-to-the-issue/qaq-p/2453618
      const curlCommand = `curl --location --request POST "${this.baseURL}/rest/api/3/issue/${key}/attachments" -u "${this.email}:${this.apiToken}" -H "X-Atlassian-Token: no-check" --form "file=@${filePath}"`

      exec(curlCommand, (error, _, stderr) => {
        if (error) {
          console.error(`Error: ${stderr}`)
          throw new Error(`Failed to add attachment to JIRA issue. ${stderr}`)
        }

        resolve(resolve)
      })
    })
  }

  public async getProjects() {
    return await this.jira.getAllProjects()
  }
}
