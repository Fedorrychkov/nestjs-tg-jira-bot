import { Logger } from '@nestjs/common'
import { ConfigService } from '@nestjs/config'
import { mkdtempSync, rmSync } from 'fs'
import { tmpdir } from 'os'
import { join } from 'path'

import { CustomConfigService } from '../src/modules/config/config.service'
import { TeamConfig } from '../src/modules/config/team-config.types'

Logger.overrideLogger(false)

export const teamFixture = (): TeamConfig => ({
  version: 1,
  projects: ['EG', 'NEW'],
  workflows: [
    {
      id: 'aaaaaaaa',
      owner: 'ExampleOrg',
      repoName: 'example-app',
      branch: 'main',
      environment: 'prod',
      workflowId: 'deploy.yml',
      appType: 'api',
    },
  ],
  employees: [
    {
      id: '11111111',
      telegram: 'workeruser',
      active: true,
      jira: ['Worker', 'worker@example.test', 'jira-worker'],
      projects: ['EG', 'NEW'],
      salaries: [{ amount: '25', currency: 'USD', type: 'hourly' }],
      workflows: ['aaaaaaaa'],
    },
    {
      id: '22222222',
      telegram: 'formeruser',
      active: false,
      jira: ['Former'],
      projects: ['EG'],
      salaries: [{ amount: '1000', currency: 'USD', type: 'fixed' }],
      workflows: ['aaaaaaaa'],
    },
  ],
})

export function configFixture(extra: Record<string, string> = {}) {
  const directory = mkdtempSync(join(tmpdir(), 'tg-jira-test-'))
  const path = join(directory, 'team.json')
  const env = new ConfigService({ ADMIN_TELEGRAM_ID: '42', BOT_CONFIG_PATH: path, ...extra })
  const service = new CustomConfigService(env)
  service.update((team) => Object.assign(team, teamFixture()))

  return { service, env, path, directory, cleanup: () => rmSync(directory, { recursive: true, force: true }) }
}
