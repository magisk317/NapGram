import type { Message } from '@mtcute/core'
import type Telegram from '../../infrastructure/clients/telegram/client'

export default class WaitForMessageHelper {
  private map = new Map<number, (event: Message) => any>()

  constructor(private tg: Telegram) {
    tg.addNewMessageEventHandler(async (e: Message) => {
      if (!e.chat || !e.chat.id)
        return
      const handler = this.map.get(e.chat.id)
      if (handler) {
        this.map.delete(e.chat.id)
        handler(e)
      }
    })
  }

  public waitForMessage(chatId: number) {
    return new Promise<Message>((resolve) => {
      this.map.set(chatId, resolve)
    })
  }

  public cancel(chatId: number) {
    this.map.delete(chatId)
  }
}
