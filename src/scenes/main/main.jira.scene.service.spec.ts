import { SceneContext } from 'telegraf/typings/scenes'

import { configFixture } from '../../../test/team-fixture'
import { JiraService } from '../../modules/jira'
import { MainJiraSceneService } from './main.jira.scene.service'

let fixture: ReturnType<typeof configFixture>
beforeEach(() => {
  fixture = configFixture()
})
afterEach(() => fixture.cleanup())

test('deactivated users cannot create text tasks or download photo attachments', async () => {
  const jira = { createTask: jest.fn(), getJiraUsers: jest.fn() }
  const scene = new MainJiraSceneService(jira as unknown as JiraService, fixture.service)
  fixture.service.update((team) => {
    team.employees[0].active = false
  })
  const access = fixture.service.jiraConfigFor({ id: 9, username: 'workeruser' })
  const ctx = { reply: jest.fn(), telegram: { getFileLink: jest.fn() } } as unknown as SceneContext
  const chat = {
    isEditableAvailable: false,
    type: 'supergroup' as const,
    topic: { name: '[jira&bot]:key=EG&type=Task' },
  }
  await scene.taskCreation(ctx, {} as any, chat, access)
  await scene.taskCreationWithPhoto(ctx, {} as any, chat, access)
  expect(jira.createTask).not.toHaveBeenCalled()
  expect(ctx.telegram.getFileLink).not.toHaveBeenCalled()
})

test('fetches all sprint issue pages at increasing offsets and still generates both reports', async () => {
  const item = {
    id: '1',
    key: 'EG-1',
    fields: {
      project: { key: 'EG' },
      summary: 'Task',
      status: { name: 'Done' },
      worklog: {
        total: 1,
        worklogs: [{ author: { displayName: 'Worker' }, started: '2026-10-02', timeSpentSeconds: 3600 }],
      },
    },
  }
  const jira = {
    baseURL: 'https://example.test',
    getSprint: jest.fn().mockResolvedValue({ id: 1, name: 'Sprint', startDate: '2026-10-01', endDate: '2026-10-15' }),
    getIssuesBySprint: jest
      .fn()
      .mockResolvedValueOnce({ total: 2, issues: [item] })
      .mockResolvedValueOnce({ total: 2, issues: [{ ...item, id: '2' }] }),
  }
  const scene = new MainJiraSceneService(jira as unknown as JiraService, fixture.service)
  const ctx = {
    from: { id: 9, username: 'workeruser' },
    update: { callback_query: { data: 'get_sprint_spent 1' } },
    reply: jest.fn(),
    replyWithDocument: jest.fn(),
  } as unknown as SceneContext
  await scene.getSprintsSpentTime(ctx)
  expect(jira.getIssuesBySprint).toHaveBeenNthCalledWith(2, '1', 1)
  expect(ctx.replyWithDocument).toHaveBeenCalledTimes(2)
})

test('revoking access while Jira users load blocks task creation', async () => {
  const jira = {
    createTask: jest.fn(),
    getJiraUsers: jest.fn().mockImplementation(async () => {
      fixture.service.update((team) => {
        team.employees[0].active = false
      })

      return []
    }),
  }
  const scene = new MainJiraSceneService(jira as unknown as JiraService, fixture.service)
  const ctx = { from: { id: 9, username: 'workeruser' }, text: 'New task', reply: jest.fn() } as unknown as SceneContext
  await scene.taskCreation(
    ctx,
    {} as any,
    { type: 'supergroup', isEditableAvailable: false, topic: { name: '[jira&bot]:key=EG' } },
    fixture.service.jiraConfigFor(ctx.from),
  )
  expect(jira.createTask).not.toHaveBeenCalled()
})
