import type { NapGramPlugin, PluginContext, MessageEvent } from '@napgram/sdk';

const plugin: NapGramPlugin = {
    id: 'refresh',
    name: 'Refresh Plugin',
    version: '1.0.0',
    author: 'NapGram Team',
    description: 'Syncs and refreshes group information between QQ and Telegram',

    permissions: {
        instances: [],
    },

    install: async (ctx: PluginContext, _config?: any) => {
        ctx.logger.info('Refresh plugin installed');

        // Helper: Build QQ Group Avatar URL
        const buildQqGroupAvatarUrl = (groupId: string, size: 40 | 100 | 140 | 640 = 640) => {
            const gid = String(groupId || '').trim();
            return `https://p.qlogo.cn/gh/${gid}/${gid}/${size}/`;
        };

        // Helper: Fetch Buffer
        const fetchBuffer = async (url: string): Promise<Buffer> => {
            const res = await fetch(url);
            if (!res.ok) throw new Error(`Fetch failed: ${res.status} ${res.statusText}`);
            const ab = await res.arrayBuffer();
            return Buffer.from(ab);
        };

        // Helper: Pick Group Description
        const pickGroupDescription = (notice: any): string | null => {
            const data = notice?.data ?? notice;
            if (!data) return null;
            const notices = Array.isArray(data?.notices) ? data.notices : Array.isArray(data?.data) ? data.data : [];
            const first = notices && notices.length ? notices[0] : null;
            const text = first?.text || first?.content || first?.msg || first?.notice || '';
            const s = String(text || '').trim();
            return s ? s.slice(0, 255) : null;
        };

        // Command: /refresh
        ctx.command({
            name: 'refresh',
            description: '刷新当前群组信息 (头像、名称、描述)',
            handler: async (event: MessageEvent, args: string[]) => {
                if (event.platform !== 'tg') {
                    await event.reply('❌ 此命令仅在 Telegram 端使用');
                    return;
                }

                const instance = event.instance as any;
                const pair = instance.forwardPairs.findByTG(event.channelId, event.threadId, true);

                if (!pair) {
                    await event.reply('❌ 当前聊天未绑定任何 QQ 群');
                    return;
                }

                const qqGroupId = pair.qqRoomId.toString();

                try {
                    await event.reply('🔄 正在刷新群组信息...');

                    const groupInfo = await event.qq?.callApi?.('get_group_info', { group_id: Number(qqGroupId) });
                    if (!groupInfo) {
                        await event.reply('❌ 获取 QQ 群信息失败');
                        return;
                    }

                    const tgChat = await event.tg.getChat(Number(event.channelId));

                    // Update Title
                    if (groupInfo.group_name) {
                        try {
                            await tgChat.editTitle(groupInfo.group_name);
                        } catch (e) {
                            ctx.logger.warn('Failed to update title:', e);
                        }
                    }

                    // Update Avatar
                    try {
                        const avatarUrl = buildQqGroupAvatarUrl(qqGroupId, 640);
                        const avatarBuffer = await fetchBuffer(avatarUrl);
                        if (avatarBuffer.length) {
                            await tgChat.setProfilePhoto(avatarBuffer);
                        }
                    } catch (e) {
                        ctx.logger.warn('Failed to update photo:', e);
                    }

                    // Update About (Notice)
                    try {
                        const notice = await event.qq?.callApi?.('get_group_notice', { group_id: Number(qqGroupId) });
                        const description = pickGroupDescription(notice);
                        if (description) {
                            await tgChat.editAbout(description);
                        }
                    } catch (e) {
                        ctx.logger.warn('Failed to update about:', e);
                    }

                    await event.reply(`✅ 已刷新群组信息: ${groupInfo.group_name || qqGroupId}`);
                } catch (error) {
                    ctx.logger.error('Failed to refresh group:', error);
                    await event.reply('❌ 刷新过程出错');
                }
            }
        });

        // Command: /refresh_all
        ctx.command({
            name: 'refresh_all',
            description: '刷新所有已绑定的群组信息',
            adminOnly: true,
            handler: async (event: MessageEvent, _args: string[]) => {
                if (event.platform !== 'tg') {
                    await event.reply('❌ 此命令仅在 Telegram 端使用');
                    return;
                }

                try {
                    await event.reply('🔄 正在异步刷新所有绑定群组信息...');

                    const instance = event.instance as any;
                    const allPairs = instance.forwardPairs.getAll();

                    let success = 0;
                    let fail = 0;

                    for (const pair of allPairs) {
                        try {
                            const qqGroupId = pair.qqRoomId.toString();
                            const tgChatId = pair.tgChatId.toString();

                            const groupInfo = await event.qq?.callApi?.('get_group_info', { group_id: Number(qqGroupId) });
                            if (groupInfo?.group_name) {
                                const tgChat = await event.tg.getChat(Number(tgChatId));
                                await tgChat.editTitle(groupInfo.group_name);
                                success++;
                            } else {
                                fail++;
                            }
                        } catch (e) {
                            fail++;
                        }
                    }

                    await event.reply(`✅ 刷新完成\n成功: ${success}\n失败: ${fail}\n总计: ${allPairs.length}`);
                } catch (error) {
                    ctx.logger.error('Failed to refresh all:', error);
                    await event.reply('❌ 批量刷新失败');
                }
            }
        });
    },

    uninstall: async () => {
    },
};

export default plugin;
