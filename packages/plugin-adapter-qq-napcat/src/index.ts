import type { NapGramPlugin, PluginContext } from '@napgram/sdk';
import type { IQQClient, QQClientCreateParams } from '@napgram/qq-client';
import { NapCatAdapter, qqClientFactory } from '@napgram/qq-client';

const plugin: NapGramPlugin = {
    id: 'adapter-qq-napcat',
    name: 'QQ Adapter (NapCat)',
    version: '1.0.0',
    author: 'NapGram Team',
    description: 'Provide NapCat-based QQ adapter',

    install: async (ctx: PluginContext) => {
        qqClientFactory.register('napcat', async (params: QQClientCreateParams) => {
            return new NapCatAdapter(params as any) as unknown as IQQClient;
        });
        ctx.logger.info('NapCat QQ adapter registered');
    },
};

export default plugin;
