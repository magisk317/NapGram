import type { MessageContent } from '../../types'

/**
 * 文本类型消息段转换器
 */
export class TextSegmentConverter {
  convertText(data: any): MessageContent {
    return {
      type: 'text',
      data: { text: data.text },
    }
  }

  convertShare(data: any, rawMessage?: string): MessageContent {
    return {
      type: 'text',
      data: {
        text: data.url || data.file || rawMessage || '[分享]',
      },
    }
  }

  convertPoke(data: any): MessageContent {
    return {
      type: 'text',
      data: {
        text: `[戳一戳] ${data.name || ''}`.trim(),
      },
    }
  }

  convertMarkdown(data: any, segment: any): MessageContent {
    return {
      type: 'text',
      data: {
        text: data.text || data.content || JSON.stringify(segment.data),
      },
    }
  }
}
