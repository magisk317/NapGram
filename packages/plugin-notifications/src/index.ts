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

        // Backoff configuration
        const BACKOFF_INTERVALS = [
            0,              // 1st: Immediate
            1000 * 60 * 1,  // 2nd: 1 min
            1000 * 60 * 2,  // 3rd: 2 mins
            1000 * 60 * 5,  // 4th: 5 mins
            1000 * 60 * 10, // 5th: 10 mins
            1000 * 60 * 30, // 6th: 30 mins
            1000 * 60 * 60, // 7th: 60 mins
        ];
        const RESET_THRESHOLD = 1000 * 60 * 60 * 2; // Reset after 2 hours of stability

        let backoffLevel = 0;
        let lastNotifyTime = 0;
        let isNotifiedDown = false; // Tracks if the current outage has been notified

        if (!adminQQ && !adminTG) {
            ctx.logger.warn('Notifications disabled: no admin targets configured');
            return;
        }

        ctx.on('notice', async (event: NoticeEvent) => {
            if (event.noticeType !== 'connection-lost' && event.noticeType !== 'connection-restored') {
                return;
            }

            const now = Date.now();

            // Logic for Connection Lost
            if (event.noticeType === 'connection-lost') {
                // Check if we should reset backoff due to long stability
                if (now - lastNotifyTime > RESET_THRESHOLD) {
                    backoffLevel = 0;
                }

                const requiredWait = BACKOFF_INTERVALS[Math.min(backoffLevel, BACKOFF_INTERVALS.length - 1)];

                if (now - lastNotifyTime < requiredWait) {
                    ctx.logger.debug(`Notification suppressed (Backoff: Level ${backoffLevel}, Wait ${requiredWait}ms)`);
                    isNotifiedDown = false; // Suppress this outage
                    return;
                }

                // Allowed to notify
                backoffLevel++;
                lastNotifyTime = now;
                isNotifiedDown = true;
            }

            // Logic for Connection Restored
            if (event.noticeType === 'connection-restored') {
                if (!isNotifiedDown) {
                    ctx.logger.debug('Restored notification suppressed because loss was silent');
                    return;
                }
                // If loss was notified, we notify recovery and clear the "Down" flag
                isNotifiedDown = false;
            }

            const time = new Date(event.timestamp || now).toLocaleString('zh-CN', {
                timeZone: 'Asia/Shanghai',
                hour12: false,
            });

            const message = event.noticeType === 'connection-lost'
                ? `⚠️ NapCat 连接已断开\n时间: ${time}\n\n系统将自动尝试重连...`
                : `✅ NapCat 连接已恢复\n时间: ${time}`;

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
