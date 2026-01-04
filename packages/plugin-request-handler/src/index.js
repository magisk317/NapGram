import { db, schema, eq, Instance, RequestAutomationService } from '@napgram/request-kit';
const automationServices = new Map();
const plugin = {
    id: 'request-handler',
    name: 'Request Handler',
    version: '1.0.0',
    author: 'NapGram Team',
    description: 'Handle incoming QQ friend/group requests with optional automation',
    permissions: {
        instances: [],
    },
    install: async (ctx) => {
        ctx.logger.info('Request handler plugin installed');
        const resolveInstance = (instanceId) => {
            return Instance.instances.find(i => i.id === instanceId);
        };
        const ensureAutomationService = (instance) => {
            if (!instance || !instance.qqClient)
                return;
            if (automationServices.has(instance.id))
                return automationServices.get(instance.id);
            const service = new RequestAutomationService(instance, instance.qqClient);
            automationServices.set(instance.id, service);
            return service;
        };
        const parseBigInt = (value) => {
            const raw = String(value ?? '').trim();
            if (!raw)
                return BigInt(0);
            try {
                return BigInt(raw);
            }
            catch {
                return BigInt(0);
            }
        };
        const formatFriendRequestNotification = (request) => {
            const time = new Date(request.createdAt).toLocaleString('zh-CN', {
                timeZone: 'Asia/Shanghai',
            });
            return `📬 好友申请\n━━━━━━━━━━━━━━━━\n👤 用户：${request.userId}\n💬 验证消息：${request.comment || '(无)'}\n⏰ 时间：${time}\n\n使用以下命令操作：\n/approve ${request.flag} - 同意\n/reject ${request.flag} - 拒绝`;
        };
        const formatGroupRequestNotification = (request) => {
            const time = new Date(request.createdAt).toLocaleString('zh-CN', {
                timeZone: 'Asia/Shanghai',
            });
            const typeText = request.subType === 'invite' ? '邀请入群' : '主动加群';
            return `📬 加群申请\n━━━━━━━━━━━━━━━━\n👤 用户：${request.userId}\n🏠 群号：${request.groupId}\n📋 类型：${typeText}\n💬 验证消息：${request.comment || '(无)'}\n⏰ 时间：${time}\n\n使用以下命令操作：\n/approve ${request.flag} - 同意\n/reject ${request.flag} - 拒绝`;
        };
        const formatAutomationNotification = (request) => {
            const time = new Date(request.createdAt).toLocaleString('zh-CN', {
                timeZone: 'Asia/Shanghai',
            });
            const typeText = request.type === 'friend' ? '好友' : '加群';
            const actionText = request.status === 'approved' ? '自动同意' : '自动拒绝';
            const reasonText = request.rejectReason ? `\n📝 理由：${request.rejectReason}` : '';
            const groupLine = request.type === 'group' ? `\n🏠 群号：${request.groupId}` : '';
            return `🤖 ${typeText}申请已${actionText}\n━━━━━━━━━━━━━━━━\n👤 用户：${request.userId}${groupLine}\n💬 验证消息：${request.comment || '(无)'}${reasonText}\n⏰ 时间：${time}`;
        };
        const sendTelegramNotification = async (instance, message) => {
            if (!instance) {
                ctx.logger.warn('Instance not found for request notification');
                return;
            }
            const ownerTgId = instance.owner;
            if (!ownerTgId) {
                ctx.logger.warn({ instanceId: instance.id }, 'Instance owner not set, cannot send request notification');
                return;
            }
            if (!instance.tgBot) {
                ctx.logger.warn({ instanceId: instance.id }, 'Telegram bot not available for request notification');
                return;
            }
            const chat = await instance.tgBot.getChat(Number(ownerTgId));
            await chat.sendMessage(message, { disableWebPreview: true });
            ctx.logger.info({ instanceId: instance.id }, 'Request notification sent');
        };
        const handleRequest = async (event, type) => {
            if (event.platform !== 'qq')
                return;
            const instance = resolveInstance(event.instanceId);
            try {
                const requestArr = await db.insert(schema.qqRequest).values({
                    instanceId: event.instanceId,
                    flag: event.requestId,
                    type,
                    subType: type === 'group' ? event.subType : undefined,
                    userId: parseBigInt(event.userId),
                    groupId: type === 'group' ? parseBigInt(event.groupId) : undefined,
                    comment: event.comment,
                    status: 'pending',
                }).returning();
                const request = requestArr[0];
                const automation = ensureAutomationService(instance);
                if (automation) {
                    const autoHandled = await automation.applyAutomationRules(request);
                    if (autoHandled) {
                        const updated = await db.query.qqRequest.findFirst({ where: eq(schema.qqRequest.id, request.id) });
                        if (updated) {
                            await sendTelegramNotification(instance, formatAutomationNotification(updated));
                        }
                        return;
                    }
                }
                const message = type === 'friend'
                    ? formatFriendRequestNotification(request)
                    : formatGroupRequestNotification(request);
                await sendTelegramNotification(instance, message);
            }
            catch (error) {
                ctx.logger.error('Failed to handle request:', error);
            }
        };
        const attachAutomation = (event) => {
            if (event.status !== 'starting' && event.status !== 'running')
                return;
            const instance = resolveInstance(event.instanceId);
            ensureAutomationService(instance);
        };
        Instance.instances.forEach(instance => {
            ensureAutomationService(instance);
        });
        ctx.on('friend-request', async (event) => {
            await handleRequest(event, 'friend');
        });
        ctx.on('group-request', async (event) => {
            await handleRequest(event, 'group');
        });
        ctx.on('instance-status', attachAutomation);
    },
    uninstall: async () => {
        for (const service of automationServices.values()) {
            service.destroy();
        }
        automationServices.clear();
    },
};
export default plugin;
