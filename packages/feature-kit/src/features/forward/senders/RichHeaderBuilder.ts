import type { InputText } from '@mtcute/core'
import { html } from '@mtcute/node'
import { env } from '@napgram/infra-kit'
import { md5Hex } from '../../../shared-types'

/**
 * Rich Header URL generation and formatting
 * Handles link preview formatting for message headers
 */
export class RichHeaderBuilder {
  /**
   * Generate Rich Header URL with hash
   */
  generateRichHeaderUrl(apiKey: string, userId: string, messageHeader: string): string {
    const url = new URL(`${env.WEB_ENDPOINT}/richHeader/${apiKey}/${userId}`)
    if (messageHeader) {
      url.searchParams.set('hash', md5Hex(messageHeader).substring(0, 10))
    }
    url.searchParams.set('v', env.RICH_HEADER_VERSION || '2')
    return url.toString()
  }

  /**
   * Apply Rich Header formatting to text
   * Returns formatted text with link preview or plain text
   */
  applyRichHeader(text: string, richHeaderUrl?: string): { text: string | InputText, params: any } {
    const params: any = {}

    if (richHeaderUrl) {
      // HTML Mode with Rich Header
      // Use mtcute html tag to avoid manual character escaping and ensure TextWithEntities is returned
      // text arg originates from contentRenderer() which returns raw text

      // \u200b is zero-width space
      // NOTE: html tag automatic escaping handles & in url and text content

      // We use the `html` tag from @mtcute/core
      const messageText = html`<a href="${richHeaderUrl}">\u200B</a>${text.replace(/\\n/g, '\n')}`

      params.invertMedia = true
      params.disableWebPreview = false

      return { text: messageText, params }
    }
    else {
      // Plain text mode
      const messageText = text.replace(/\\n/g, '\n')
      params.disableWebPreview = true
      return { text: messageText, params }
    }
  }

  /**
   * Build reply parameters for message
   */
  buildReplyTo(pair?: any, replyToMsgId?: number): number | undefined {
    const topId = pair?.tgThreadId
    const replyId = replyToMsgId || topId
    if (!replyId)
      return undefined
    return replyId
  }

  /**
   * Escape HTML special characters
   */
  escapeHtml(text: string): string {
    return text
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;')
      .replace(/'/g, '&#039;')
  }
}
