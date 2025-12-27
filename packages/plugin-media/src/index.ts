import type { NapGramPlugin, PluginContext, InstanceStatusEvent } from '@napgram/sdk';
import { Instance, MediaFeature } from '@napgram/feature-kit';

const plugin: NapGramPlugin = {
    id: 'media',
    name: 'Media Feature',
    version: '1.0.0',
    author: 'NapGram Team',
    description: 'Media processing feature for NapGram',

    permissions: {
        instances: [],
    },

    install: async (ctx: PluginContext) => {
        ctx.logger.info('Media feature plugin installed');

        const attach = (instance: any) => {
            if (!instance || !instance.qqClient || !instance.tgBot) return;
            if (instance.mediaFeature) return;
            instance.mediaFeature = new MediaFeature(instance, instance.tgBot, instance.qqClient);
        };

        const handleStatus = async (event: InstanceStatusEvent) => {
            if (event.status !== 'starting' && event.status !== 'running') return;
            const instance = Instance.instances.find(i => i.id === event.instanceId);
            if (!instance) return;
            attach(instance);
        };

        Instance.instances.forEach(attach);
        ctx.on('instance-status', handleStatus);
    },
};

export default plugin;
