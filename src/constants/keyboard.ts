import { Sprint } from 'jira.js/out/agile/models'
import { time } from 'src/helpers'

import { MAIN_CALLBACK_DATA } from './callbacks'

export const getJiraKeyboards = (type: 'private' | 'supergroup') => {
  const btns = []

  if (type === 'private') {
    btns.push([{ text: 'Projects', callback_data: MAIN_CALLBACK_DATA.GET_PROJECTS }])
  }

  return btns
}

export const getJiraProjectKeyboards = (type: 'private' | 'supergroup', projects: { key: string; name: string }[]) => {
  const btns = []

  if (type === 'private') {
    for (const project of projects) {
      btns.push([
        {
          text: `Спринты по #${project.key} (${project.name})`,
          callback_data: `${MAIN_CALLBACK_DATA.GET_SPRINTS_KEY_BY_PROJECT} ${project.key}`,
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
      const isCurrentYearStart = time().isSame(time(sprint.startDate), 'year')
      const isCurrentYearEnd = time().isSame(time(sprint.completeDate || sprint.endDate), 'year')

      const rangeDate =
        sprint.state !== 'future'
          ? `${time(sprint.startDate).format(isCurrentYearStart ? 'DD.MM HH:mm' : 'DD.MM.YYYY HH:mm')} - ${time(sprint.completeDate || sprint.endDate).format(isCurrentYearEnd ? 'DD.MM HH:mm' : 'DD.MM.YYYY HH:mm')}`
          : ''

      btns.push([
        {
          text: `${sprint.name} (${sprint.state}) ${rangeDate}`,
          callback_data: `${MAIN_CALLBACK_DATA.GET_SPRINT_SPENT_TIME} ${sprint.id}`,
        },
      ])
    }

    btns.push([
      {
        text: 'Вернуться к проектам',
        callback_data: MAIN_CALLBACK_DATA.GET_PROJECTS,
      },
    ])
  }

  return btns
}

export const getGithubProjectWorkflowsKeyboards = (
  type: 'private' | 'supergroup',
  projects: { key: string; name: string }[],
) => {
  const btns = []

  if (type === 'private') {
    for (const project of projects) {
      btns.push([
        {
          text: `${project.name}`,
          callback_data: `${MAIN_CALLBACK_DATA.GET_GITHUB_PROJECTS_WORKFLOWS} ${project.key}`,
        },
      ])
    }
  }

  return btns
}

export const getGithubProjectWorkflowsItemsKeyboards = (
  type: 'private' | 'supergroup',
  projects: { key: string; name: string }[],
) => {
  const btns = []

  if (type === 'private') {
    for (const project of projects) {
      btns.push([
        {
          text: `${project.name}`,
          callback_data: `${MAIN_CALLBACK_DATA.GET_GITHUB_PROJECTS_WORKFLOWS_ITEM} ${project.key}`,
        },
      ])
    }
  }

  return btns
}
