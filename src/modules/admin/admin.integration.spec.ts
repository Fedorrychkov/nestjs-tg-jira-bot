import { ConfigModule, ConfigService } from '@nestjs/config'
import { Test, TestingModule } from '@nestjs/testing'
import { existsSync, writeFileSync } from 'fs'
import { getBotToken, TelegrafModule } from 'nestjs-telegraf'
import { join } from 'path'
import { Telegraf, Telegram } from 'telegraf'

import { configFixture } from '../../../test/team-fixture'
import { getImageFile } from '../../helpers/getImageData'
import { MainSceneModule } from '../../scenes/main/main.scene.module'
import { OpenAiService } from '../ai/openai/openai.service'
import { CustomConfigService } from '../config'
import { GithubService } from '../github'
import { JiraService } from '../jira'
import { AdminModule } from './admin.module'
import { AdminService } from './admin.service'

jest.mock('../../helpers/getImageData', () => ({ getImageFile: jest.fn() }))

let fixture: ReturnType<typeof configFixture>
let testModule: TestingModule
let bot: Telegraf
let api: jest.SpyInstance
let updateId = 1

beforeEach(async () => {
  fixture = configFixture({ CHAT_ID: '-1001234567890' })
  jest.mocked(getImageFile).mockReset()
  api = jest.spyOn(Telegram.prototype, 'callApi').mockImplementation(async (method, payload) => {
    if (method === 'getFile')
      return { file_id: 'photo', file_unique_id: 'photo', file_path: 'photos/example.jpg' } as any

    if (method === 'getChatAdministrators') return [] as any

    if (method === 'sendMessage')
      return {
        message_id: 1,
        chat: { id: (payload as any).chat_id, type: 'private' },
        text: (payload as any).text,
      } as any

    return true as any
  })
  testModule = await Test.createTestingModule({
    imports: [
      ConfigModule.forRoot({ isGlobal: true, ignoreEnvFile: true, ignoreEnvVars: true }),
      AdminModule,
      TelegrafModule.forRootAsync({
        imports: [AdminModule],
        inject: [AdminService],
        useFactory: (admin: AdminService) => ({
          token: '123:fake-token',
          launchOptions: false,
          middlewares: [admin.middleware],
        }),
      }),
      MainSceneModule,
    ],
  })
    .overrideProvider(ConfigService)
    .useValue(fixture.env)
    .overrideProvider(OpenAiService)
    .useValue({})
    .overrideProvider(JiraService)
    .useValue({
      getActiveProjects: jest.fn().mockResolvedValue([]),
      getProjects: jest.fn().mockResolvedValue([{ key: 'EG', name: 'Example project' }]),
      getJiraUsers: jest.fn().mockResolvedValue([
        { active: true, accountId: 'jira-worker', displayName: 'Worker', emailAddress: 'worker@example.test' },
        { active: true, accountId: 'jira-former', displayName: 'Former' },
      ]),
      createTask: jest.fn().mockResolvedValue({ key: 'EG-99', createdLink: 'https://example.test/browse/EG-99' }),
      attachFile: jest.fn().mockResolvedValue(undefined),
    })
    .overrideProvider(GithubService)
    .useValue({})
    .compile()
  bot = testModule.get(getBotToken())
  bot.botInfo = {
    id: 123,
    is_bot: true,
    first_name: 'Example',
    username: 'example_bot',
    can_join_groups: true,
    can_read_all_group_messages: false,
    supports_inline_queries: false,
  }
  jest.spyOn(bot, 'stop').mockImplementation(() => undefined)
  await testModule.init()
})
afterEach(async () => {
  await testModule?.close()
  api?.mockRestore()
  fixture?.cleanup()
})

async function message(text: string, id = 42) {
  await bot.handleUpdate({
    update_id: updateId++,
    message: {
      message_id: updateId,
      date: 1,
      chat: { id, type: 'private', first_name: 'Example' },
      from: { id, is_bot: false, first_name: 'Example' },
      text,
    },
  })
}
async function callback(data: string, id = 42) {
  await bot.handleUpdate({
    update_id: updateId++,
    callback_query: {
      id: String(updateId),
      chat_instance: 'test',
      from: { id, is_bot: false, first_name: 'Example' },
      data,
      message: { message_id: 1, date: 1, chat: { id, type: 'private', first_name: 'Example' }, text: 'Menu' },
    },
  })
}

test('Nest and Telegraf route admin commands and pending input before broad Jira handlers', async () => {
  await message('/admin')
  expect(api).toHaveBeenCalledWith(
    'sendMessage',
    expect.objectContaining({ text: expect.stringContaining('Управление ботом') }),
  )
  await callback('admin:addEmployee')
  await message('newworker')
  const config = testModule.get(CustomConfigService)
  expect(config.team.employees).toContainEqual(expect.objectContaining({ telegram: 'newworker', active: false }))
  await callback('admin:active:11111111', 9)
  expect(config.team.employees[0].active).toBe(true)
})

test('admin command buttons reach the existing Jira and workflow handlers even while editing a salary', async () => {
  await message('/admin')
  await callback('admin:salary:11111111:EG')
  await callback('get_projects')
  expect(testModule.get(JiraService).getActiveProjects).toHaveBeenCalledTimes(1)
  await callback('get_github_projects')
  expect(api).toHaveBeenCalledWith(
    'sendMessage',
    expect.objectContaining({ text: expect.stringContaining('Разрешённые workflows') }),
  )
})

async function groupMessage(
  text: string,
  options: { photo?: boolean; chatId?: number; topic?: string; username?: string } = {},
) {
  const chat = {
    id: options.chatId ?? -1001234567890,
    type: 'supergroup' as const,
    title: 'Example group',
    is_forum: true as const,
  }
  await bot.handleUpdate({
    update_id: updateId++,
    message: {
      message_id: updateId,
      date: 1,
      chat,
      from: { id: 9, is_bot: false, first_name: 'Worker', username: options.username || 'workeruser' },
      message_thread_id: 10,
      is_topic_message: true,
      reply_to_message: {
        message_id: 10,
        date: 0,
        chat,
        message_thread_id: 10,
        is_topic_message: true,
        forum_topic_created: { name: options.topic || '[jira&bot]:key=EG&type=Task', icon_color: 0 },
      },
      ...(options.photo
        ? { photo: [{ file_id: 'photo', file_unique_id: 'photo', width: 100, height: 100 }], caption: text }
        : { text }),
      ...(text.startsWith('/')
        ? { entities: [{ type: 'bot_command' as const, offset: 0, length: text.split(' ')[0].length }] }
        : {}),
    },
  })
}

test('supergroup text creates the selected issue type and assigns the mentioned active employee', async () => {
  testModule.get(CustomConfigService).update((team) => {
    team.employees[1].active = true
  })
  await groupMessage('Fix payment @formeruser\nReproduction steps')
  const jira = testModule.get(JiraService)
  expect(jira.createTask).toHaveBeenCalledWith(
    expect.objectContaining({
      key: 'EG',
      issueType: 'Task',
      summary: '[JiraBot] Fix payment @formeruser',
      fields: expect.objectContaining({
        assignee: expect.objectContaining({ accountId: 'jira-former' }),
        reporter: expect.objectContaining({ accountId: 'jira-worker' }),
      }),
      description: expect.stringContaining('https://t.me/c/1234567890/10/'),
    }),
  )
  expect(api).toHaveBeenCalledWith(
    'sendMessage',
    expect.objectContaining({ text: expect.stringContaining('https://example.test/browse/EG-99') }),
  )
})

test('supergroup default issue type is Bug and inactive mentioned staff are not assigned', async () => {
  await groupMessage('Bug @formeruser', { topic: '[jira&bot]:key=EG' })
  expect(testModule.get(JiraService).createTask).toHaveBeenCalledWith(
    expect.objectContaining({
      issueType: 'Bug',
      fields: expect.objectContaining({ assignee: expect.objectContaining({ accountId: 'jira-worker' }) }),
    }),
  )
})

test.each([false, true])(
  'supergroup photo uploads caption and removes temporary file (attachment failure: %s)',
  async (failed) => {
    const filePath = join(fixture.directory, 'photo.jpg')
    writeFileSync(filePath, Buffer.from([0xff, 0xd8, 0xff, 0xd9]))
    jest.mocked(getImageFile).mockResolvedValue({
      filePath,
      buffer: Buffer.alloc(0),
      fileName: 'photo.jpg',
      contentType: 'image/jpeg',
      file: {} as File,
    })
    const jira = testModule.get(JiraService)

    if (failed) jest.mocked(jira.attachFile).mockRejectedValueOnce(new Error('Attachment test failure'))
    await groupMessage('Screenshot description', { photo: true })
    expect(jira.createTask).toHaveBeenCalledWith(
      expect.objectContaining({
        key: 'EG',
        issueType: 'Task',
        summary: '[JiraBot] Screenshot description',
        description: expect.stringContaining('Screenshot description'),
      }),
    )
    expect(jira.attachFile).toHaveBeenCalledWith('EG-99', filePath)
    expect(existsSync(filePath)).toBe(false)
    expect(api).toHaveBeenCalledWith(
      'sendMessage',
      expect.objectContaining({ text: expect.stringContaining(failed ? 'Не удалось' : 'Успешно добавлена') }),
    )
  },
)

test.each(['inactive', 'project-denied', 'wrong-chat', 'unrelated-topic'])(
  'supergroup denies unauthorized task creation: %s',
  async (reason) => {
    jest.useFakeTimers()

    try {
      const config = testModule.get(CustomConfigService)

      if (reason === 'inactive')
        config.update((team) => {
          team.employees[0].active = false
        })

      if (reason === 'project-denied')
        config.update((team) => {
          team.employees[0].projects = []
        })
      await groupMessage('Do not create', {
        ...(reason === 'wrong-chat' ? { chatId: -1009999999999 } : {}),
        ...(reason === 'unrelated-topic' ? { topic: 'Other discussion' } : {}),
      })
      expect(testModule.get(JiraService).createTask).not.toHaveBeenCalled()
      jest.runOnlyPendingTimers()
    } finally {
      jest.useRealTimers()
    }
  },
)

test('supergroup start and help work with project and type parameters in the topic', async () => {
  await groupMessage('/start')
  expect(api).toHaveBeenCalledWith(
    'sendMessage',
    expect.objectContaining({ text: expect.stringContaining('Бот имеет доступ к проекту Example project') }),
  )
  await groupMessage('/help')
  expect(api).toHaveBeenCalledWith(
    'sendMessage',
    expect.objectContaining({ text: expect.stringContaining('Бот умеет:') }),
  )
  expect(testModule.get(JiraService).createTask).not.toHaveBeenCalled()
})
