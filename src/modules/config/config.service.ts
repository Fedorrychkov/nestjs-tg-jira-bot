import { Inject, Injectable, Logger } from '@nestjs/common'
import { ConfigService } from '@nestjs/config'
import { GithubWorkflowParams, GithubWorkflowSettings, SalaryRelationByTgAndProject } from 'src/types'

@Injectable()
export class CustomConfigService {
  private logger = new Logger(CustomConfigService.name)
  public miniAppUrl: string
  public apiUrl: string
  public tgToken: string
  public superAdminList: string[]
  public availabilityUsersByKeys: { key: string; nicknamesOrIds: string[] }[]
  public relationUserNameOrIdWithJira: { nickNameOrId: string; relationValues: string[] }[]
  public salaryRelationByTgAndProject: SalaryRelationByTgAndProject
  public githubWorkflowSettings: GithubWorkflowSettings

  constructor(
    @Inject(ConfigService)
    private configService: ConfigService,
  ) {
    this.miniAppUrl = this.configService.get<string>('MINI_APP_URL')
    this.apiUrl = this.configService.get<string>('API_URL')
    this.tgToken = this.configService.get<string>('TELEGRAM_BOT_KEY')
    const superAdminList = this.configService.get<string>('SUPERADMIN_LIST')?.split(',') || []
    this.superAdminList = superAdminList.map((nickname) => nickname.trim())
    const availabilityUsersByKeys = this.configService.get<string>('AVAILABILITY_BY_KEYS')?.split(',') || []
    this.availabilityUsersByKeys = availabilityUsersByKeys.map((values) => {
      const [key, ...nicknamesOrIds] = values.split(':')

      return { key, nicknamesOrIds: nicknamesOrIds.map((nickname) => nickname.trim()) }
    })
    const relationUserNameOrIdWithJira = this.configService.get<string>('RELATION_BY_NAME_OR_EMAIL')?.split(',') || []
    this.relationUserNameOrIdWithJira = relationUserNameOrIdWithJira.map((values) => {
      const [nickNameOrId, ...relationValues] = values.split(':')

      return { nickNameOrId, relationValues: relationValues.map((value) => value.trim()) }
    })

    const salaryRelationByTgAndProject =
      this.configService.get<string>('SALARY_RELATION_BY_TG_AND_PROJECT')?.split('|') || []

    this.salaryRelationByTgAndProject = salaryRelationByTgAndProject
      .map((values) => {
        const [nickNameOrId, relationValues] = values.split(':')
        const salaryParams = relationValues
          .replace(/{|}/g, '')
          .split(',')
          .map((values) => {
            const [key, value] = values.split('=')

            return { key, value }
          })

        return {
          nickNameOrId,
          // Собираем параметры по ключу и значению
          salaryParams: salaryParams.reduce((acc, curr) => {
            acc[curr.key] = curr.value

            return acc
          }, {}),
        }
      })
      .reduce((acc, curr) => {
        const values = acc[curr.nickNameOrId] || []
        acc[curr.nickNameOrId] = [...values, curr.salaryParams]

        return acc
      }, {})

    const githubWorkflowSettings = this.configService.get<string>('GITHUB_WORKFLOW_SETTINGS')?.split('|') || []

    this.githubWorkflowSettings = githubWorkflowSettings
      .map((workflowValues) => {
        const [repoName, values] = workflowValues.split(':')

        const params = values
          .replace(/{|}/g, '')
          .split(',')
          .map((values) => {
            const [key, value] = values.split('=')

            return { key, value }
          })

        const options = params.reduce((acc, curr) => {
          acc[curr.key] = curr.value

          return acc
        }, {} as GithubWorkflowParams)

        const { branch, environment, workflowId, appType, owner } = options

        return { repoName, branch, environment, workflowId, appType, owner }
      })
      .reduce((acc, curr) => {
        const { repoName, environment, appType } = curr
        const valueByRepoName = acc[repoName] || {}
        const envKey = `${environment}-${appType}`
        const optionsByEnvironment = valueByRepoName[envKey] || {}

        const payload = {
          [envKey]: {
            ...optionsByEnvironment,
            ...curr,
          },
        }

        const newAcc = {
          ...acc,
          [repoName]: {
            ...valueByRepoName,
            ...payload,
          },
        }

        return newAcc
      }, {} as GithubWorkflowSettings)
  }
}
