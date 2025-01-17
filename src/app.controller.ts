import { Body, Controller, Headers, Logger, NotFoundException, Post, UnauthorizedException } from '@nestjs/common'
import { ConfigService } from '@nestjs/config'

import { GithubWebhookPayload } from './app.types'
import { JiraService } from './modules/jira'

@Controller('api/github')
export class AppController {
  private webhookSecret: string
  private logger = new Logger(AppController.name)

  constructor(
    private readonly jiraService: JiraService,
    private readonly configService: ConfigService,
  ) {
    this.webhookSecret = this.configService.get('GITHUB_WEBHOOK_SECRET')
  }

  @Post('/webhook')
  async webhook(@Body() payload: GithubWebhookPayload, @Headers('x-api-key') apiKey: string) {
    if (apiKey !== this.webhookSecret) {
      throw new UnauthorizedException('Invalid API key')
    }

    const projects = await this.jiraService.getProjects()

    const equalityProjectKey = projects?.filter(
      (project) =>
        payload.branch_name?.toLowerCase().includes(project.key.toLowerCase()) ||
        payload.pr_title?.toLowerCase().includes(project.key.toLowerCase()),
    )

    if (!equalityProjectKey) {
      throw new NotFoundException('Project not found')
    }

    const keys = equalityProjectKey?.map((project) => project.key)

    const issueMarkers = [payload.branch_name, payload.pr_title]

    const issueKeys = keys.filter((key) => issueMarkers.some((marker) => marker?.includes(key)))

    this.logger.log(`Equality project keys: ${equalityProjectKey?.map((project) => project.key).join(', ')}`, {
      issueKeys,
    })

    const parseJiraKey = (branchName: string, projectKey: string): string | null => {
      // Паттерн ищет projectKey, за которым следует дефис или нижнее подчеркивание и числа
      const pattern = new RegExp(`${projectKey}[-_](\\d+)`, 'i')
      const match = branchName.match(pattern)

      return match ? match[1] : null
    }

    const issueKeysWithTaskNumber = issueKeys.map((key) => {
      const taskNumber = parseJiraKey(payload.branch_name, key)
      const taskNumberPr = parseJiraKey(payload.pr_title, key)

      return [`${key}-${taskNumber}`, `${key}-${taskNumberPr}`]
    })

    const uniqueIssueKeys = [...new Set(issueKeysWithTaskNumber.flat())]

    this.logger.log(`Unique issue keys: ${uniqueIssueKeys.join(', ')}`, {
      uniqueIssueKeys,
    })

    await Promise.all(
      uniqueIssueKeys.map(async (key) => {
        const issue = await this.jiraService.getIssueByKey(key)

        this.logger.log(`Issue: ${issue.key}`, {
          issue,
        })

        const hasCommentWithUrl = issue?.fields?.comment?.comments?.some((comment) =>
          (comment as any).body.includes(payload.pr_url),
        )

        if (hasCommentWithUrl) {
          return
        } else {
          await this.jiraService.sendIssueComment(key, `Pull request created: ${payload.pr_url}`)
        }

        this.logger.log(`Issue: ${issue.key}`, {
          issue,
        })

        return issue
      }),
    )

    return {
      uniqueIssueKeys,
      issueLinks: uniqueIssueKeys.map((key) => `${this.jiraService.baseURL}/browse/${key}`),
    }
  }
}
