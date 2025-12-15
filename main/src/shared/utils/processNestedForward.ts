import { ForwardMessage } from '../../infrastructure/clients/qq';
import db from '../../domain/models/db';

export default async (messages: ForwardMessage[], fromPairId: number) => {
  for (const message of messages) {
    // Skip if message or message.message is invalid
    if (!message || !Array.isArray(message.message)) continue;

    for (const elem of message.message) {
      // Skip if elem is null/undefined or doesn't have expected structure
      if (!elem || typeof elem !== 'object' || elem.type !== 'json') continue;

      // Inline JSON processing (forwardHelper was removed)
      let parsed: any;
      try {
        parsed = JSON.parse(elem.data);
      } catch {
        continue;
      }
      if (parsed.type !== 'forward' || !parsed.resId) continue;
      let entity = await db.forwardMultiple.findFirst({ where: { resId: parsed.resId } });
      if (!entity) {
        entity = await db.forwardMultiple.create({
          data: {
            resId: parsed.resId,
            fileName: parsed.fileName || '',
            fromPairId,
          },
        });
      }
      elem.data = JSON.stringify({ type: 'forward', uuid: entity.id });
    }
  }
}
