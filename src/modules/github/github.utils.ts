import { minimatch } from 'minimatch'

export const matchPatterns = (patterns: string[], path: string) => {
  return patterns.some((pattern) => {
    try {
      return minimatch(
        path,
        pattern.startsWith('/') ? '**' + pattern : pattern.startsWith('**') ? pattern : '**/' + pattern,
      )
    } catch {
      // if the pattern is not a valid glob pattern, try to match it as a regular expression
      try {
        return new RegExp(pattern).test(path)
      } catch (e) {
        return false
      }
    }
  })
}
