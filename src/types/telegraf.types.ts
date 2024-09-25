type TelegrafChatType = {
  id: number
  title?: string
  /**
   * is supergroup with topic or not
   */
  is_forum?: boolean
  type: 'private' | 'supergroup'

  /**
   * Private chat values
   */
  first_name?: string
  last_name?: string
  username?: string
}

type TelegrafFromType = {
  id: number
  is_bot: boolean
  first_name?: string
  last_name?: string
  username?: string
  language_code: string
  is_premium: boolean
}

export type TelegrafUpdateType = {
  from?: TelegrafFromType
  message: {
    forum_topic_created: {
      name: string
      icon_color: number
    }
    /**
     * Current Message Id
     */
    message_id?: number
    from: TelegrafFromType
    chat: TelegrafChatType
    /**
     * Topic chat ID (Thread ID)
     */
    message_thread_id?: number
    reply_to_message?: {
      /**
       * Current message id
       */
      message_id: number
      from: TelegrafFromType
      chat: TelegrafChatType
      date: number
      message_thread_id: number
      forum_topic_created: {
        name: string
        icon_color: number
      }
      /**
       * Is topic or not
       */
      is_topic_message: boolean
    }
  }
}

export type ChatTelegrafContextType = {
  type: TelegrafChatType['type']
  isChatWithTopics?: boolean
  threadMessageId?: number
  currentMessageId?: number
  from?: TelegrafFromType
  chat?: TelegrafChatType
  topic?: { name: string }
  isEditableAvailable: boolean
}
