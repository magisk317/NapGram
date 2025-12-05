import { getLogger } from '../shared/utils/logger';
import Instance from '../domain/models/Instance';
import db from '../domain/models/db';
import api from '../interfaces/api';
import posthog from '../domain/models/posthog';

(async () => {
  const log = getLogger('Main');

  process.on('unhandledRejection', error => {
    log.error(error, 'UnhandledRejection: ');
    posthog.capture('UnhandledRejection', { error });
  });

  process.on('uncaughtException', error => {
    log.error(error, 'UncaughtException: ');
    posthog.capture('UncaughtException', { error });
  });

  api.startListening();

  const instanceEntries = await db.instance.findMany();
  const targets = instanceEntries.length ? instanceEntries.map(it => it.id) : [0];

  for (const id of targets) {
    await Instance.start(id);
  }

  posthog.capture('启动完成', { instanceCount: targets.length });
})();
