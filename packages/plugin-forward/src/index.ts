import type { NapGramPlugin, PluginContext, InstanceStatusEvent } from '@napgram/sdk';
import { ForwardFeature, Instance } from '@napgram/feature-kit';

const plugin: NapGramPlugin = {
    id: 'forward',
    name: 'Forward Feature',
    version: '1.0.0',
    author: 'NapGram Team',
    description: 'Message forwarding feature for NapGram',

    permissions: {
        instances: [],
    },

    install: async (ctx: PluginContext) => {
        ctx.logger.info('Forward feature plugin installed');

        const attach = (instance: any) => {
            if (!instance || !instance.qqClient || !instance.tgBot || !instance.forwardPairs) return;
            if (instance.forwardFeature) return;
            const media = instance.mediaFeature;
            const commands = instance.commandsFeature;
            instance.forwardFeature = new ForwardFeature(instance, instance.tgBot, instance.qqClient, media, commands);
            instance.featureManager?.registerFeature?.('forward', instance.forwardFeature);
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

    uninstall: async () => {
        for (const instance of Instance.instances) {
            if (instance.forwardFeature) {
                instance.forwardFeature.destroy?.();
                instance.forwardFeature = undefined;
            }
        }
    },
};

export default plugin;
