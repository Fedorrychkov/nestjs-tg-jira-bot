import { ConfigService } from '@nestjs/config'
import { existsSync, readFileSync, rmSync, statSync, writeFileSync } from 'fs'

import { configFixture } from '../../../test/team-fixture'
import { CustomConfigService } from './config.service'
import { migrateTeamConfig } from './team-config.migration'
import { validateTeamConfig } from './team-config.validation'

let fixture: ReturnType<typeof configFixture>
beforeEach(() => {
  fixture = configFixture()
})
afterEach(() => fixture.cleanup())

test('only the numeric env owner is an administrator; username and old superadmins grant nothing', () => {
  expect(fixture.service.isOwner({ id: 42, username: 'anything' })).toBe(true)
  expect(fixture.service.isOwner({ id: 7, username: 'owneruser' })).toBe(false)
  expect(fixture.service.isOwner()).toBe(false)
  const disabled = new CustomConfigService(new ConfigService({ BOT_CONFIG_PATH: fixture.path }))
  expect(disabled.isOwner({ id: 42 })).toBe(false)
})

test('persists permissions immediately, survives restart, and never reimports stale env', () => {
  fixture.service.update((team) => {
    team.employees[0].active = false
  })
  const restarted = new CustomConfigService(
    new ConfigService({
      ADMIN_TELEGRAM_ID: '42',
      BOT_CONFIG_PATH: fixture.path,
      AVAILABILITY_BY_KEYS: 'OTHER:workeruser',
    }),
  )
  expect(restarted.team.employees[0].active).toBe(false)
  expect(restarted.team.projects).toEqual(['EG', 'NEW'])
  expect(restarted.workflowsFor({ id: 9, username: 'workeruser' })).toEqual([])
  expect(restarted.jiraConfigFor({ id: 9, username: 'workeruser' }).availabilityListKeys).toEqual([])
  expect(statSync(fixture.path).mode & 0o777).toBe(0o600)
})

test('invalid updates leave both memory and disk intact', () => {
  const before = readFileSync(fixture.path, 'utf8')
  expect(() =>
    fixture.service.update((team) => {
      team.employees[0].workflows.push('missing')
    }),
  ).toThrow()
  expect(readFileSync(fixture.path, 'utf8')).toBe(before)
  expect(fixture.service.team.employees[0].workflows).toEqual(['aaaaaaaa'])
})

test('write failures do not activate a configuration which was not saved', () => {
  rmSync(fixture.path)
  rmSync(fixture.directory, { recursive: true })
  writeFileSync(fixture.directory, 'not a directory')
  expect(() =>
    fixture.service.update((team) => {
      team.employees[0].active = false
    }),
  ).toThrow()
  expect(fixture.service.team.employees[0].active).toBe(true)
})

test('corrupt configuration fails closed instead of restoring old env access', () => {
  writeFileSync(fixture.path, '{broken')
  expect(() => new CustomConfigService(fixture.env)).toThrow()
  expect(readFileSync(fixture.path, 'utf8')).toBe('{broken')
})

test('snapshots cannot modify live state; numeric employee identity takes precedence', () => {
  fixture.service.team.employees[0].active = false
  expect(fixture.service.employeeFor({ id: 9, username: 'workeruser' }).active).toBe(true)
  fixture.service.update((team) => {
    team.employees[1].telegram = '9'
  })
  expect(fixture.service.employeeFor({ id: 9, username: 'workeruser' }).active).toBe(false)
})

test('migrates all legacy settings once with no implicit active staff or action permissions', () => {
  const team = migrateTeamConfig(
    new ConfigService({
      SUPERADMIN_LIST: 'owneruser',
      AVAILABILITY_BY_KEYS: 'EG:workeruser',
      RELATION_BY_NAME_OR_EMAIL: 'workeruser:Worker:worker@example.test,formeruser:Former',
      SALARY_RELATION_BY_TG_AND_PROJECT:
        'workeruser:{amount=1000,currency=USD,type=fixed,hours=80}|formeruser:{amount=25,currency=USD,type=hourly}',
      GITHUB_WORKFLOW_SETTINGS:
        'example-app:{owner=ExampleOrg,branch=main,environment=prod,workflowId=deploy.yml,appType=api',
    }),
  )
  validateTeamConfig(team)
  expect(team.employees.every((employee) => !employee.active && !employee.workflows.length)).toBe(true)
  expect(team.employees.find((employee) => employee.telegram === 'workeruser').salaries[0].hours).toBe(80)
  expect(team.employees.find((employee) => employee.telegram === 'workeruser').projects).toEqual(['EG'])
  expect(team.employees.find((employee) => employee.telegram === 'owneruser').projects).toEqual(['EG'])
  expect(team.workflows).toHaveLength(1)
})

test.each(['NaN', '-1', 'Infinity', '1e999'])('rejects invalid salary %s', (amount) => {
  expect(() =>
    fixture.service.update((team) => {
      team.employees[0].salaries[0].amount = amount
    }),
  ).toThrow()
})

test('rejects unknown projects, duplicate normalized Jira identities and invalid hours', () => {
  expect(() => fixture.service.update((team) => team.projects.push('bad key'))).toThrow()
  expect(() => fixture.service.update((team) => team.employees[1].jira.push('worker'))).toThrow()
  expect(() =>
    fixture.service.update((team) => {
      team.employees[0].salaries[0].hours = 0
    }),
  ).toThrow()
  expect(existsSync(fixture.path)).toBe(true)
})
