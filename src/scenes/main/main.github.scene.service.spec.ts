import { SceneContext } from 'telegraf/typings/scenes'

import { configFixture } from '../../../test/team-fixture'
import { GithubService } from '../../modules/github'
import { MainGithubSceneService } from './main.github.scene.service'

let fixture: ReturnType<typeof configFixture>
let scene: MainGithubSceneService
let github: { getWorkflows: jest.Mock; runWorkflow: jest.Mock }
beforeEach(() => {
  fixture = configFixture()
  github = {
    getWorkflows: jest.fn().mockResolvedValue({ data: { workflows: [{ path: '.github/workflows/deploy.yml' }] } }),
    runWorkflow: jest.fn().mockResolvedValue(undefined),
  }
  scene = new MainGithubSceneService(fixture.service, github as unknown as GithubService)
})
afterEach(() => fixture.cleanup())
const context = (username = 'workeruser') => ({
  from: { id: 9, username },
  callbackQuery: { data: 'gh_workflow_item aaaaaaaa' },
  answerCbQuery: jest.fn(),
  reply: jest.fn(),
})

test('dispatches the configured target for an allowed employee', async () => {
  await scene.runGithubWorkflow(context() as unknown as SceneContext)
  expect(github.runWorkflow).toHaveBeenCalledWith(expect.objectContaining({ branch: 'main', environment: 'prod' }))
})

test('rejects forged buttons and buttons from before employee deactivation', async () => {
  await scene.runGithubWorkflow(context('outsider') as unknown as SceneContext)
  fixture.service.update((team) => {
    team.employees[0].active = false
  })
  await scene.runGithubWorkflow(context() as unknown as SceneContext)
  expect(github.getWorkflows).not.toHaveBeenCalled()
  expect(github.runWorkflow).not.toHaveBeenCalled()
})

test('rechecks revocation after an in-flight GitHub request', async () => {
  github.getWorkflows.mockImplementation(async () => {
    fixture.service.update((team) => {
      team.employees[0].workflows = []
    })

    return { data: { workflows: [{ path: '.github/workflows/deploy.yml' }] } }
  })
  await scene.runGithubWorkflow(context() as unknown as SceneContext)
  expect(github.runWorkflow).not.toHaveBeenCalled()
})

test('does not dispatch when the workflow target changed while the menu was being checked', async () => {
  github.getWorkflows.mockImplementation(async () => {
    fixture.service.update((team) => {
      team.workflows[0].branch = 'develop'
    })

    return { data: { workflows: [{ path: '.github/workflows/deploy.yml' }] } }
  })
  await scene.runGithubWorkflow(context() as unknown as SceneContext)
  expect(github.runWorkflow).not.toHaveBeenCalled()
})

test('old buttons cannot launch an edited target, including for the owner', async () => {
  fixture.service.update((team) => {
    team.workflows[0].id = 'bbbbbbbb'
    team.workflows[0].branch = 'develop'
    for (const employee of team.employees) employee.workflows = []
  })
  const ctx = context()
  ctx.from.id = 42
  await scene.runGithubWorkflow(ctx as unknown as SceneContext)
  expect(github.getWorkflows).not.toHaveBeenCalled()
  expect(github.runWorkflow).not.toHaveBeenCalled()
})
