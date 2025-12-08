import type { UnifiedMessage } from '../../../domain/message';
import type { IQQClient } from '../../../infrastructure/clients/qq';
import type Telegram from '../../../infrastructure/clients/telegram/client';
import type Instance from '../../../domain/models/Instance';
import { getLogger } from '../../../shared/logger';
import env from '../../../domain/models/env';

const logger = getLogger('PermissionChecker');

/**
 * 权限检查服务
 */
export class PermissionChecker {
    constructor(private readonly instance: Instance) { }

    /**
     * 检查是否是管理员
     */
    isAdmin(userId: string): boolean {
        const envAdminQQ = env.ADMIN_QQ ? String(env.ADMIN_QQ) : null;
        const envAdminTG = env.ADMIN_TG ? String(env.ADMIN_TG) : null;
        return userId === String(this.instance.owner)
            || (envAdminQQ && userId === envAdminQQ)
            || (envAdminTG && userId === envAdminTG);
    }
}
