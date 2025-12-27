import type { NapGramPlugin, NoticeEvent, PluginContext } from '@napgram/sdk';

type NotificationsConfig = {
    enabled?: boolean;
    adminQQ?: number | string;
    adminTG?: number | string;
    cooldownMs?: number;
};

const plugin: NapGramPlugin = {
    id: 'notifications',
    name: 'Notifications',
    version: '1.0.0',
    author: 'NapGram Team',
    description: 'Send admin notifications for connection events',

    install: async (ctx: PluginContext, config?: NotificationsConfig) => {
        const enabled = config?.enabled !== false;
        if (!enabled) {
            ctx.logger.info('Notifications plugin disabled');
            return;
        }

        const adminQQ = normalizeId(config?.adminQQ);
        const adminTG = normalizeId(config?.adminTG);
        const cooldownMs = typeof config?.cooldownMs === 'number' ? config.cooldownMs : 3600000;

        if (!adminQQ && !adminTG) {
            ctx.logger.warn('Notifications disabled: no admin targets configured');
            return;
        }

        let lastLostAt = 0;

        ctx.on('notice', async (event: NoticeEvent) => {
            if (event.noticeType !== 'connection-lost' && event.noticeType !== 'connection-restored') {
                return;
            }

            const now = Date.now();
            if (event.noticeType === 'connection-lost' && now - lastLostAt < cooldownMs) {
                ctx.logger.debug('Notification suppressed due to cooldown');
                return;
            }

            const time = new Date(event.timestamp || now).toLocaleString('zh-CN', {
                timeZone: 'Asia/Shanghai',
                hour12: false,
            });

            const message = event.noticeType === 'connection-lost'
                ? `⚠️ NapCat 连接已断开\n时间: ${time}\n\n系统将自动尝试重连...`
                : `✅ NapCat 连接已恢复\n时间: ${time}`;

            if (event.noticeType === 'connection-lost') {
                lastLostAt = now;
            }

            await sendAdminNotifications(ctx, event.instanceId, adminQQ, adminTG, message);
        });

        ctx.logger.info('Notifications plugin installed');
    },
};

function normalizeId(input?: number | string): string | undefined {
    if (input === undefined || input === null) {
        return undefined;
    }
    const value = String(input).trim();
    return value ? value : undefined;
}

async function sendAdminNotifications(
    ctx: PluginContext,
    instanceId: number,
    adminQQ: string | undefined,
    adminTG: string | undefined,
    message: string,
) {
    if (adminQQ) {
        try {
            await ctx.message.send({
                instanceId,
                channelId: `qq:private:${adminQQ}`,
                content: message,
            });
            ctx.logger.info(`Notification sent to QQ admin: ${adminQQ}`);
        }
        catch (error) {
            ctx.logger.warn(`Failed to send QQ notification to ${adminQQ}`, error);
        }
    }

    if (adminTG) {
        try {
            await ctx.message.send({
                instanceId,
                channelId: `tg:${adminTG}`,
                content: message,
            });
            ctx.logger.info(`Notification sent to TG admin: ${adminTG}`);
        }
        catch (error) {
            ctx.logger.warn(`Failed to send TG notification to ${adminTG}`, error);
        }
    }
}

export default plugin;
