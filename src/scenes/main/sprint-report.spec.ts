import { Issue, Sprint } from 'jira.js/out/agile/models'

import { teamFixture } from '../../../test/team-fixture'
import { JiraConfigType } from '../../types'
import { buildSprintReports } from './sprint-report'

const sprint = {
  id: 1,
  name: 'Example sprint',
  startDate: '2026-10-01T00:00:00Z',
  endDate: '2026-10-15T00:00:00Z',
} as Sprint
const owner: JiraConfigType = { isSuperAdmin: true }
const log = (name: string, seconds = 3600) => ({
  author: { displayName: name },
  started: '2026-10-02T00:00:00Z',
  created: '2026-10-20T00:00:00Z',
  timeSpentSeconds: seconds,
  comment: 'Work',
})
const issue = (project = 'EG', logs = [log('Worker')]): Issue =>
  ({
    id: project + '-1',
    key: project + '-1',
    fields: {
      project: { key: project },
      summary: 'Example task',
      status: { name: 'Done' },
      worklog: { total: logs.length, worklogs: logs },
    },
  }) as Issue

test('even owner reports exclude former and unknown authors and employees outside their projects', () => {
  const team = teamFixture()
  const result = buildSprintReports(
    [issue('EG', [log('Worker'), log('Former'), log('Unknown')])],
    sprint,
    team,
    owner,
    'https://example.test',
  )
  expect(result.tasks.toString()).toContain('Worker')
  expect(result.tasks.toString()).not.toMatch(/Former|Unknown/)
  expect(result.salaries.toString()).toContain('25 USD')
  team.employees[0].projects = ['NEW']
  expect(buildSprintReports([issue()], sprint, team, owner, '').issueCount).toBe(0)
})

test('employee reports only their own work in allowed projects and filter work date rather than entry creation', () => {
  const team = teamFixture()
  team.employees[1].active = true
  const access = { isSuperAdmin: false, availabilityListKeys: ['EG'], relationNames: ['Worker'] }
  const result = buildSprintReports(
    [issue('EG', [log('Worker'), log('Former')]), issue('NEW')],
    sprint,
    team,
    access,
    '',
  )
  expect(result.issueCount).toBe(1)
  expect(result.tasks.toString()).not.toContain('Former')
  expect(result.tasks.toString()).not.toContain('NEW-1')
  expect(result.salaries.toString()).toContain('25 USD')
})

test('global fixed pay is paid once per sprint across projects, with proportional expected hours', () => {
  const team = teamFixture()
  team.employees[0].salaries = [{ amount: '1000', currency: 'USD', type: 'fixed', hours: 80 }]
  const result = buildSprintReports([issue(), issue('NEW')], sprint, team, owner, '')
  const output = result.salaries.toString()
  expect(output.match(/1000 USD \/ спринт/g) || []).toHaveLength(1)
  expect(output).toContain('EG, NEW')
  expect(output).toContain('25 USD')
  expect(output).toContain('2 / 80 h')
})

test('project-specific rates override the default; other project rates never become a fallback', () => {
  const team = teamFixture()
  team.employees[0].salaries = [
    { amount: '10', currency: 'USD', type: 'hourly' },
    { key: 'EG', amount: '30', currency: 'EUR', type: 'hourly' },
  ]
  const result = buildSprintReports([issue(), issue('NEW')], sprint, team, owner, '').salaries.toString()
  expect(result).toContain('30 EUR')
  expect(result).toContain('10 USD')
  team.employees[0].salaries = [{ key: 'EG', amount: '30', currency: 'EUR', type: 'hourly' }]
  expect(buildSprintReports([issue('NEW')], sprint, team, owner, '').salaries.toString()).toContain('Ставка не задана')
})

test('CSV safely quotes Jira text and prevents formula injection', () => {
  const task = issue()
  task.fields.summary = '=HYPERLINK("https://example.test","hello")\nnext line'
  const result = buildSprintReports([task], sprint, teamFixture(), owner, '').tasks.toString()
  expect(result).toContain('"\'=HYPERLINK(""https://example.test"",""hello"")\nnext line"')
})

test('rejects a sprint without dates instead of silently calculating a misleading salary', () => {
  expect(() => buildSprintReports([issue()], {} as Sprint, teamFixture(), owner, '')).toThrow()
})
