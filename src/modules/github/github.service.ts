import { Inject, Injectable, Logger } from '@nestjs/common'
import { ConfigService } from '@nestjs/config'
import { Octokit, RestEndpointMethodTypes } from '@octokit/rest'
import { GithubWorkflowParams } from 'src/types'

@Injectable()
export class GithubService {
  private logger = new Logger(GithubService.name)
  private apiToken: string
  private octokit: Octokit

  constructor(
    @Inject(ConfigService)
    private configService: ConfigService,
  ) {
    this.apiToken = this.configService.get<string>('GITHUB_PERSONAL_ACCESS_TOKEN')

    this.octokit = new Octokit({
      auth: this.apiToken,
    })
  }

  async getRepo(repoName: string, owner: string): Promise<RestEndpointMethodTypes['repos']['get']['response']> {
    const response = await this.octokit.rest.repos.get({
      owner,
      repo: repoName,
    })

    return response
  }

  async getWorkflows(
    repoName: string,
    owner: string,
  ): Promise<RestEndpointMethodTypes['actions']['listRepoWorkflows']['response']> {
    try {
      const response = await this.octokit.rest.actions.listRepoWorkflows({
        owner,
        repo: repoName,
      })

      return response
    } catch (error) {
      this.logger.error('getWorkflows', error)
      throw error
    }
  }

  async runWorkflow(params: GithubWorkflowParams) {
    try {
      const payload = {
        owner: params.owner,
        repo: params.repoName,
        workflow_id: params.workflowId,
        ref: params.branch,
        inputs: {
          appType: params.appType,
          environment: params.environment,
        },
      }

      await this.octokit.rest.actions.createWorkflowDispatch(payload)

      const {
        data: { workflow_runs: runnedWorkflows },
      } = await this.octokit.rest.actions.listWorkflowRuns({
        owner: params.owner,
        repo: params.repoName,
        workflow_id: params.workflowId,
        branch: params.branch,
        per_page: 1,
      })

      runnedWorkflows

      return runnedWorkflows
    } catch (error) {
      this.logger.error('Error triggering workflow:', error)
      throw error
    }
  }
}
