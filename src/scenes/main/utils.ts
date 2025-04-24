export const createNonCommandRegex = (commands: Record<string, string>): RegExp => {
  const excludeCommands = Object.values(commands)
    .map((cmd) => cmd.replace('/', '\\/'))
    .join('|')

  return new RegExp(`^(?!(?:${excludeCommands})$).*$`, 'ms')
}
