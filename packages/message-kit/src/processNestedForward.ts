import type { ForwardMessage } from '@napgram/qq-client'
import { db, schema, eq } from '@napgram/infra-kit'

export default async (messages: ForwardMessage[], fromPairId: number) => {
  for (const message of messages) {
    // Skip if message or message.message is invalid
    if (!message || !Array.isArray(message.message))
      continue

    for (const elem of message.message) {
      // Skip if elem is null/undefined or doesn't have expected structure
      if (!elem || typeof elem !== 'object' || elem.type !== 'json')
        continue

      // Inline JSON processing (forwardHelper was removed)
      let parsed: any
      try {
        parsed = JSON.parse(elem.data)
      }
      catch {
        continue
      }
      if (parsed.type !== 'forward' || !parsed.resId)
        continue
      let entity = await db.query.forwardMultiple.findFirst({ where: eq(schema.forwardMultiple.resId, parsed.resId) })
      if (!entity) {
        const entityArr = await db.insert(schema.forwardMultiple).values({
          resId: parsed.resId,
          fileName: parsed.fileName || '',
          fromPairId,
        }).returning()
        entity = entityArr[0]
      }
      elem.data = JSON.stringify({ type: 'forward', uuid: entity.id })
    }
  }
}
