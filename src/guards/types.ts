import { TgInitUser } from 'src/types'

export type TgInitData = {
  authDate: string
  hash: string
  queryId: string
  user: TgInitUser
}
