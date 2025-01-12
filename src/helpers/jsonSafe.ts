export function jsonParse<T>(value?: string | null): T | null | undefined {
  if (!value) {
    return undefined
  }

  try {
    return JSON.parse(value)
  } catch {
    return undefined
  }
}

export function jsonStringify<T>(value: T): string {
  if (!value) {
    return null
  }

  return JSON.stringify(value)
}
