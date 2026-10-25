import { Context } from 'telegraf'

import { configFixture } from '../../../test/team-fixture'
import { AdminService } from './admin.service'

let fixture: ReturnType<typeof configFixture>
let admin: AdminService
beforeEach(() => {
  fixture = configFixture()
  admin = new AdminService(fixture.service)
})
afterEach(() => fixture.cleanup())
const context = (text = '', data = '', id = 42, type = 'private') => ({
  from: { id, username: id === 42 ? 'owneruser' : 'workeruser' },
  chat: { id, type },
  message: text ? { text } : undefined,
  callbackQuery: data ? { data } : undefined,
  reply: jest.fn().mockResolvedValue({ message_id: 1 }),
  answerCbQuery: jest.fn().mockResolvedValue(true),
  replyWithDocument: jest.fn(),
})
async function send(text = '', data = '', id = 42, type = 'private') {
  const ctx = context(text, data, id, type)
  const next = jest.fn()
  await admin.middleware(ctx as unknown as Context, next)

  return { ctx, next }
}

test('denies /admin, crafted callbacks and exports to anyone except owner in private chat', async () => {
  const before = fixture.service.team
  for (const [id, type] of [
    [9, 'private'],
    [42, 'supergroup'],
  ] as const) {
    const command = await send('/admin', '', id, type)
    expect(command.ctx.reply).toHaveBeenCalledWith('Нет доступа')
    const callback = await send('', 'admin:active:11111111', id, type)
    expect(callback.ctx.answerCbQuery).toHaveBeenCalledWith('Нет доступа')
    const exported = await send('', 'admin:export', id, type)
    expect(exported.ctx.replyWithDocument).not.toHaveBeenCalled()
  }
  expect(fixture.service.team).toEqual(before)
})

test('handles owner input before other handlers and lets normal commands through', async () => {
  expect((await send('/admin')).next).not.toHaveBeenCalled()
  expect((await send('/get_projects')).next).toHaveBeenCalled()
  expect((await send('ordinary message', '', 9)).next).toHaveBeenCalled()
})

test('creates and configures staff, rates and workflow access without env changes', async () => {
  await send('', 'admin:addEmployee')
  await send('@newworker')
  const employee = fixture.service.team.employees.find((item) => item.telegram === 'newworker')
  expect(employee.active).toBe(false)
  await send('', `admin:edit:${employee.id}:jira`)
  await send('New Worker\nnew@example.test')
  await send('', `admin:pt:${employee.id}:EG:0`)
  await send('', `admin:edit:${employee.id}:salaries`)
  await send('', `admin:salary:${employee.id}:*`)
  await send('1000 USD fixed 80')
  await send('', `admin:salary:${employee.id}:EG`)
  await send('27,5 USD hourly')
  await send('', `admin:wt:${employee.id}:aaaaaaaa:0`)
  expect(fixture.service.workflowsFor({ id: 99, username: 'newworker' })).toHaveLength(0)
  await send('', `admin:active:${employee.id}`)
  expect(fixture.service.workflowsFor({ id: 99, username: 'newworker' })).toHaveLength(1)
  expect(fixture.service.jiraConfigFor({ id: 99, username: 'newworker' }).availabilityListKeys).toEqual(['EG'])
  expect(fixture.service.employeeFor({ id: 99, username: 'newworker' }).salaries[1].amount).toBe('27.5')
  await send('', `admin:active:${employee.id}`)
  expect(fixture.service.workflowsFor({ id: 99, username: 'newworker' })).toHaveLength(0)
})

test('invalid input can be corrected and is not consumed from another user', async () => {
  await send('', 'admin:salary:11111111:*')
  const before = fixture.service.team
  await send('-2 USD hourly')
  expect(fixture.service.team).toEqual(before)
  expect((await send('999 USD hourly', '', 9)).next).toHaveBeenCalled()
  expect(fixture.service.team).toEqual(before)
  await send('30 USD hourly')
  expect(fixture.service.team.employees[0].salaries[0].amount).toBe('30')
})

test('cancel and expired prompts do not save pending changes', async () => {
  await send('', 'admin:edit:11111111:telegram')
  await send('/cancel')
  expect((await send('renamedworker')).next).toHaveBeenCalled()
  await send('', 'admin:edit:11111111:telegram')
  const time = jest.spyOn(Date, 'now').mockReturnValue(Date.now() + 11 * 60_000)
  await send('renamedworker')
  time.mockRestore()
  expect(fixture.service.team.employees[0].telegram).toBe('workeruser')
})

test('project and workflow management validates references and revokes grants on target edits', async () => {
  await send('', 'admin:addProject')
  await send('CRYPTO')
  expect(fixture.service.team.projects).toContain('CRYPTO')
  await send('', 'admin:deleteProject:EG')
  expect(fixture.service.team.projects).toContain('EG')
  await send('', 'admin:deleteProject:CRYPTO')
  expect(fixture.service.team.projects).not.toContain('CRYPTO')
  await send('', 'admin:editWorkflow:aaaaaaaa')
  await send('ExampleOrg/example-app develop deploy.yml stage web')
  expect(fixture.service.team.workflows[0].branch).toBe('develop')
  expect(fixture.service.team.employees[0].workflows).toEqual([])
  expect(fixture.service.team.workflows[0].id).not.toBe('aaaaaaaa')
  await send('', `admin:deleteWorkflow:${fixture.service.team.workflows[0].id}`)
  expect(fixture.service.team.workflows).toHaveLength(0)
})

test('salary edits update only the selected project and deleting its override restores the default', async () => {
  const fallback = fixture.service.team.employees[0].salaries[0]
  await send('', 'admin:salary:11111111:EG')
  await send('30 EUR hourly')
  await send('', 'admin:salary:11111111:NEW')
  await send('1000 USD fixed 80')
  await send('', 'admin:salary:11111111:EG')
  await send('32 EUR hourly')
  let salaries = fixture.service.team.employees[0].salaries
  expect(salaries.find((item) => !item.key)).toEqual(fallback)
  expect(salaries.find((item) => item.key === 'NEW')).toEqual({
    key: 'NEW',
    amount: '1000',
    currency: 'USD',
    type: 'fixed',
    hours: 80,
  })
  expect(salaries.filter((item) => item.key === 'EG')).toEqual([
    { key: 'EG', amount: '32', currency: 'EUR', type: 'hourly' },
  ])
  await send('', 'admin:salary:11111111:EG')
  await send('-')
  salaries = fixture.service.team.employees[0].salaries
  expect(salaries.find((item) => !item.key)).toEqual(fallback)
  expect(salaries.some((item) => item.key === 'EG')).toBe(false)
  expect(salaries.some((item) => item.key === 'NEW')).toBe(true)
  const menu = await send('', 'admin:edit:11111111:salaries')
  const rows = menu.ctx.reply.mock.calls[0][1].reply_markup.inline_keyboard.flat()
  expect(rows).toContainEqual(
    expect.objectContaining({ text: expect.stringContaining('EG: 25 USD / час (по умолчанию)') }),
  )
})

test('default salary can be changed or removed without changing project overrides', async () => {
  await send('', 'admin:salary:11111111:EG')
  await send('30 EUR hourly')
  await send('', 'admin:salary:11111111:*')
  await send('28 USD hourly')
  expect(fixture.service.team.employees[0].salaries.find((item) => item.key === 'EG')?.amount).toBe('30')
  await send('', 'admin:salary:11111111:*')
  await send('-')
  expect(fixture.service.team.employees[0].salaries).toEqual([
    { key: 'EG', amount: '30', currency: 'EUR', type: 'hourly' },
  ])
})

test('rejects invalid project salary input without erasing the current default or override', async () => {
  await send('', 'admin:salary:11111111:EG')
  await send('30 EUR hourly')
  const before = fixture.service.team
  await send('', 'admin:salary:11111111:EG')
  await send('40 USD hourly 0')
  expect(fixture.service.team).toEqual(before)
  await send('40 USD hourly')
  expect(fixture.service.team.employees[0].salaries.find((item) => !item.key)?.amount).toBe('25')
  expect(fixture.service.team.employees[0].salaries.find((item) => item.key === 'EG')?.amount).toBe('40')
})

test('owner menu has command buttons; command callbacks cancel pending salary input and continue routing', async () => {
  const menu = await send('/admin')
  const buttons = menu.ctx.reply.mock.calls[0][1].reply_markup.inline_keyboard.flat()
  expect(buttons).toContainEqual(expect.objectContaining({ callback_data: 'get_projects' }))
  expect(buttons).toContainEqual(expect.objectContaining({ callback_data: 'get_github_projects' }))
  await send('', 'admin:salary:11111111:EG')
  const callback = await send('', 'get_projects')
  expect(callback.next).toHaveBeenCalled()
  expect((await send('40 USD hourly')).next).toHaveBeenCalled()
  expect(fixture.service.team.employees[0].salaries).toHaveLength(1)
})

test('salary menus show only assigned projects and existing overrides; unknown projects do not enter edit mode', async () => {
  fixture.service.update((team) => {
    team.employees[0].projects = ['EG']
  })
  const menu = await send('', 'admin:edit:11111111:salaries')
  const buttons = menu.ctx.reply.mock.calls[0][1].reply_markup.inline_keyboard.flat()
  expect(buttons.some((item) => item.callback_data === 'admin:salary:11111111:NEW')).toBe(false)
  await send('', 'admin:salary:11111111:NEW')
  expect((await send('99 USD hourly')).next).toHaveBeenCalled()
  expect(fixture.service.team.employees[0].salaries).toHaveLength(1)
})
