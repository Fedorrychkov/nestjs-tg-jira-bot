import { Sprint } from 'jira.js/out/agile/models'

import { MAIN_CALLBACK_DATA } from './callbacks'

export const getJiraKeyboards = (type: 'private' | 'supergroup') => {
  const btns = []

  if (type === 'private') {
    btns.push([{ text: 'Projects', callback_data: MAIN_CALLBACK_DATA.GET_PROJECTS }])
  }

  return btns
}

export const getJiraProjectKeyboards = (type: 'private' | 'supergroup', keys: string[]) => {
  const btns = []

  if (type === 'private') {
    for (const key of keys) {
      btns.push([
        {
          text: `Спринты по #${key}`,
          callback_data: `${MAIN_CALLBACK_DATA.GET_SPRINTS_KEY_BY_PROJECT} ${key}`,
        },
      ])
    }
  }

  return btns
}

export const getJiraProjectSprintsKeyboards = (type: 'private' | 'supergroup', sprints: Sprint[]) => {
  const btns = []

  if (type === 'private') {
    for (const sprint of sprints) {
      btns.push([
        {
          text: `Таймтрекинг: ${sprint.name}`,
          callback_data: `${MAIN_CALLBACK_DATA.GET_SPRINT_SPENT_TIME} ${sprint.id}`,
        },
      ])
    }
  }

  return btns
}
