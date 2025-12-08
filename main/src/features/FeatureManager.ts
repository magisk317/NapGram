import { getLogger } from '../shared/logger';
import type { IQQClient } from '../infrastructure/clients/qq';
import type Telegram from '../infrastructure/clients/telegram/client';
import type Instance from '../domain/models/Instance';
import { RecallFeature } from './RecallFeature';
import { MediaFeature } from './MediaFeature';
import { CommandsFeature } from './commands/CommandsFeature';
import { ForwardFeature } from './forward/ForwardFeature';

const logger = getLogger('FeatureManager');

export class FeatureManager {
    private features: Map<string, any> = new Map();

    public forward?: ForwardFeature;
    public recall?: RecallFeature;
    public media?: MediaFeature;
    public commands?: CommandsFeature;

    constructor(
        private readonly instance: Instance,
        private readonly tgBot: Telegram,
        private readonly qqClient: IQQClient,
    ) {
        logger.info('FeatureManager initializing...');
    }

    async initialize() {
        try {
            this.media = new MediaFeature(this.instance, this.tgBot, this.qqClient);
            this.features.set('media', this.media);
            logger.info('✓ Media feature initialized');

            this.commands = new CommandsFeature(this.instance, this.tgBot, this.qqClient);
            this.features.set('commands', this.commands);
            logger.info('✓ Commands feature initialized');

            this.forward = new ForwardFeature(this.instance, this.tgBot, this.qqClient, this.media, this.commands);
            this.features.set('forward', this.forward);
            logger.info('✓ Forward feature initialized');

            this.recall = new RecallFeature(this.instance, this.tgBot, this.qqClient);
            this.features.set('recall', this.recall);
            logger.info('✓ Recall feature initialized');

            logger.info(`FeatureManager initialized with ${this.features.size} features`);
        } catch (error) {
            logger.error('Failed to initialize features:', error);
            throw error;
        }
    }

    enableFeature(name: string) {
        const feature = this.features.get(name);
        if (!feature) {
            logger.warn(`Feature not found: ${name}`);
            return false;
        }
        logger.info(`Feature enabled: ${name}`);
        return true;
    }

    disableFeature(name: string) {
        const feature = this.features.get(name);
        if (!feature) {
            logger.warn(`Feature not found: ${name}`);
            return false;
        }
        logger.info(`Feature disabled: ${name}`);
        return true;
    }

    getFeatureStatus(): Record<string, boolean> {
        const status: Record<string, boolean> = {};
        for (const [name] of this.features) {
            status[name] = true;
        }
        return status;
    }

    async destroy() {
        logger.info('Destroying all features...');
        for (const [name, feature] of this.features) {
            try {
                if (feature.destroy && typeof feature.destroy === 'function') {
                    feature.destroy();
                    logger.debug(`✓ ${name} destroyed`);
                }
            } catch (error) {
                logger.error(`Failed to destroy ${name}:`, error);
            }
        }
        this.features.clear();
        logger.info('All features destroyed');
    }
}

export default FeatureManager;
