export const createNonCommandRegex = (commands: Record<string, string>): RegExp => {
  const excludeCommands = Object.values(commands)
    .map((cmd) => cmd.replace('/', '\\/'))
    .join('|')

  return new RegExp(`^(?!(?:${excludeCommands})$).*$`, 'ms')
}

export const parseTopicSettings = (name = '') => {
  const params = new URLSearchParams(name.split(':')[1] || '')

  return { key: params.get('key'), type: params.get('type') || 'Bug' }
}
