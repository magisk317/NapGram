import type { IQQClient, IQQClientFactory, QQClientCreateParams } from './interface';
import { NapCatAdapter } from './NapCatAdapter';
import { getLogger } from '../../../shared/logger';

const logger = getLogger('QQClientFactory');

/**
 * QQ 客户端工厂
 * Phase 1: 根据参数创建对应的客户端实现
 */
export class QQClientFactory implements IQQClientFactory {
    async create(params: QQClientCreateParams): Promise<IQQClient> {
        logger.info(`Creating QQ client of type: ${params.type}`);

        switch (params.type) {
            case 'napcat':
                return new NapCatAdapter(params);


            default:
                throw new Error(`Unknown client type: ${(params as any).type}`);
        }
    }
}

// 导出单例工厂
export const qqClientFactory = new QQClientFactory();
