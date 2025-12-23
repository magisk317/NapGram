import type { MessageContent } from '../../types'

/**
 * 媒体类型消息段转换器（图片、视频、音频）
 */
export class MediaSegmentConverter {
  convertImage(data: any): MessageContent {
    const httpUrl = (data.url && /^https?:/.test(data.url)) ? data.url : undefined
    const httpFile = (data.file && /^https?:/.test(data.file)) ? data.file : undefined
    const url = httpUrl || httpFile || data.url || data.file
    return {
      type: 'image',
      data: {
        url,
        file: httpUrl || data.file,
        isSpoiler: data.sub_type && Number.parseInt(data.sub_type) > 0,
      },
    }
  }

  convertVideo(data: any, rawMessage?: string): MessageContent {
    let url = data.url || data.file
    // 优先从 raw_message 提取真实视频 URL（data.url/file 可能是缩略图）
    if (rawMessage) {
      const m = rawMessage.match(/url=([^,\]]+)/)
      if (m && m[1]) {
        url = m[1].replace(/&amp;/g, '&') // 解码 HTML 实体
      }
    }
    // 如果仍然不是 HTTP URL，使用原始值
    if (!/^https?:/.test(url || '')) {
      url = data.url || data.file
    }
    return {
      type: 'video',
      data: {
        url,
        file: url,
      },
    }
  }

  convertAudio(data: any): MessageContent {
    return {
      type: 'audio',
      data: {
        url: data.url || data.file,
        file: data.file,
      },
    }
  }

  convertFlash(data: any): MessageContent {
    return {
      type: 'image',
      data: {
        url: data.url || data.file,
        file: data.file,
        isSpoiler: true,
      },
    }
  }

  convertFile(data: any, rawMessage?: string): MessageContent {
    // 从 raw_message 提取直链，避免 data.url 被本地路径覆盖
    let rawUrl: string | undefined
    if (rawMessage) {
      const m = rawMessage.match(/url=([^,\]]+)/)
      if (m && m[1]) {
        rawUrl = m[1].replace(/&amp;/g, '&')
      }
    }

    // http 直链优先，其次原始字段
    const httpUrl = [rawUrl, data.url, data.file].find((u: string) => /^https?:/.test(u || ''))
    const url = httpUrl || data.url || data.file

    // 尝试从 url 解析文件名
    let filename = data.name || data.file
    if (!filename && url) {
      try {
        const decoded = decodeURIComponent(url.split('?')[0])
        const parts = decoded.split('/')
        filename = parts[parts.length - 1] || undefined
      }
      catch {
        // ignore parse error
      }
    }

    const fileId = (data.file_id || data.fid || data.id || '').replace(/^\//, '') || undefined

    return {
      type: 'file',
      data: {
        url,
        filename,
        file: data.file, // 保留原始本地路径作为兜底
        fileId,
        size: data.file_size ? Number(data.file_size) : undefined,
      },
    }
  }

  convertSticker(data: any): MessageContent {
    return {
      type: 'sticker',
      data: {
        url: data.url,
        isAnimated: true,
      },
    }
  }
}
