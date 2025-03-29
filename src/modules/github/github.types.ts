import { OpenAiService } from 'src/modules/ai/openai/openai.service'

export type CompareCommitsPRType = {
  owner: string
  repo: string
  baseSha: string
  headSha: string
  pullNumber: number
  model?: string
  maxPatchLength?: number
  action?: string
  ignore?: string
  language?: string
  /**
   * glob pattern or regex pattern to ignore files, separated by comma
   */
  ignorePatterns?: string
  /**
   * glob pattern or regex pattern to include files, separated by comma
   */
  includePatterns?: string
}

export const AVAILABLE_AI_MODEL_FOR_REVIEW = OpenAiService.models
