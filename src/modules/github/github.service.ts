import { Inject, Injectable, Logger } from '@nestjs/common'
import { ConfigService } from '@nestjs/config'
import { Octokit, RestEndpointMethodTypes } from '@octokit/rest'
import { GithubWorkflowParams } from 'src/types'

import { AiService } from '../ai'
import { AVAILABLE_AI_MODEL_FOR_REVIEW, CompareCommitsPRType } from './github.types'
import { matchPatterns } from './github.utils'

@Injectable()
export class GithubService {
  private logger = new Logger(GithubService.name)
  private apiToken: string
  private octokit: Octokit

  constructor(
    @Inject(ConfigService)
    private configService: ConfigService,
    private aiService: AiService,
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

  async tryToReviewPR(params: CompareCommitsPRType) {
    const {
      owner,
      repo,
      baseSha,
      headSha,
      action,
      ignore,
      pullNumber,
      maxPatchLength = 10_000,
      ignorePatterns = '/node_modules,*.md',
      includePatterns = '*.js,*.ts',
      model = 'gpt-4o-mini',
    } = params

    if (!model || !AVAILABLE_AI_MODEL_FOR_REVIEW.includes(model)) {
      return `Invalid model: ${model}`
    }

    const data = await this.octokit.repos.compareCommits({
      owner: owner,
      repo: repo,
      base: baseSha,
      head: headSha,
    })

    const { files, commits } = data.data

    let changedFiles = files

    this.logger.debug('compareCommits, base:', baseSha, 'head:', headSha)
    this.logger.debug('compareCommits.commits:', commits)
    this.logger.debug('compareCommits.files', changedFiles)

    if (action === 'synchronize' && commits.length >= 2) {
      const {
        data: { files },
      } = await this.octokit.repos.compareCommits({
        owner: owner,
        repo: repo,
        base: commits[commits.length - 2].sha,
        head: commits[commits.length - 1].sha,
      })

      changedFiles = files
    }

    const ignoreList = ignore?.split('\n').filter((v) => v !== '')
    const ignoreVariants = ignorePatterns?.split(',').filter((v) => Boolean(v.trim()))
    const includeVariants = includePatterns?.split(',').filter((v) => Boolean(v.trim()))

    changedFiles = changedFiles?.filter((file) => {
      const url = new URL(file.contents_url)
      const pathname = decodeURIComponent(url.pathname)

      // if includePatterns is not empty, only include files that match the pattern
      if (includeVariants.length) {
        return matchPatterns(includeVariants, pathname)
      }

      if (ignoreList.includes(file.filename)) {
        return false
      }

      // if ignorePatterns is not empty, ignore files that match the pattern
      if (ignoreVariants.length) {
        return !matchPatterns(ignoreVariants, pathname)
      }

      return true
    })

    if (!changedFiles?.length) {
      this.logger.log('no change found')

      return 'no change'
    }

    const startTime = Date.now()

    const ress = []
    const errors: string[] = []

    for (let i = 0; i < changedFiles.length; i++) {
      const file = changedFiles[i]
      const patch = file.patch || ''

      if (file.status !== 'modified' && file.status !== 'added') {
        continue
      }

      if (!patch || patch.length > maxPatchLength) {
        this.logger.log(`${file.filename} skipped caused by its diff is too large`)
        continue
      }

      try {
        const res = await this.aiService.codeReview(file.filename, patch, model)

        if (!res.lgtm && !!res.review_comment) {
          ress.push({
            path: file.filename,
            body: res.review_comment,
            position: patch.split('\n').length - 1,
          })
        }
      } catch (e) {
        const errorMessage = e?.message || 'Something went wrong'

        errors?.push(`${errorMessage} in ${file.filename}`)
        this.logger.error(`review ${file.filename} failed`, e)
      }
    }

    const endTime = Date.now()

    const diffTime = endTime - startTime
    this.logger.debug(`gpt cost: ${diffTime}ms`)

    try {
      await this.octokit.pulls.createReview({
        repo: repo,
        owner: owner,
        pull_number: pullNumber,
        body: ress.length
          ? `Code reviewed by Jira Bot AI in ${diffTime}ms, used ${model} model\n Some Analyze Errors: ${errors.length ? `errors: ${errors.join(',\n')}` : ''}`
          : `${errors.length ? `Some Analyze Errors: ${errors.join(',\n')}` : `Nice job by ${model}! 👍`}`,
        event: 'COMMENT',
        commit_id: commits[commits.length - 1].sha,
        comments: ress,
      })
    } catch (e) {
      this.logger.error('Failed to create review', e)

      return 'error'
    }
  }
}
