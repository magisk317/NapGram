import type { NapGramPlugin, PluginContext, InstanceStatusEvent } from '@napgram/sdk';
import { CommandsFeature, Instance } from '@napgram/feature-kit';

const createdInstances = new Set<number>();

const plugin: NapGramPlugin = {
    id: 'commands',
    name: 'Commands Feature',
    version: '1.0.0',
    author: 'NapGram Team',
    description: 'Command processing feature for NapGram',

    permissions: {
        instances: [],
    },

    install: async (ctx: PluginContext) => {
        ctx.logger.info('Commands feature plugin installed');

        const attach = (instance: any) => {
            if (!instance || !instance.qqClient || !instance.tgBot) return;
            if (instance.commandsFeature) return;
            instance.commandsFeature = new CommandsFeature(instance, instance.tgBot, instance.qqClient);
            createdInstances.add(instance.id);
        };

        const handleStatus = async (event: InstanceStatusEvent) => {
            if (event.status !== 'starting' && event.status !== 'running') return;
            const instance = Instance.instances.find((i: any) => i.id === event.instanceId);
            if (!instance) return;
            attach(instance);
        };

        Instance.instances.forEach(attach);
        ctx.on('instance-status', handleStatus);
    },

    uninstall: async () => {
        for (const instance of Instance.instances as any[]) {
            if (!createdInstances.has(instance.id)) continue;
            if (instance.commandsFeature) {
                instance.commandsFeature.destroy?.();
                instance.commandsFeature = undefined;
            }
        }
        createdInstances.clear();
    },
};

export default plugin;
