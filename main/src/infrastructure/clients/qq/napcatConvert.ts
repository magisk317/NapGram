import type { WSSendReturn } from 'node-napcat-ts';
import type { ForwardMessage } from '../types';

/**
 * 将 NapCat 的合并转发消息转换为统一格式
 */
export const napCatForwardMultiple = (messages: WSSendReturn['get_forward_msg']['messages']): ForwardMessage[] => messages.map(it => ({
    group_id: it.message_type === 'group' ? it.group_id : undefined,
    nickname: it.sender.card || it.sender.nickname,
    time: it.time,
    user_id: it.sender.user_id,
    seq: it.message_id,
    raw_message: it.raw_message,
    message: ((it as any).content || (it as any).message).map(napCatReceiveToMessageElem),
}));

/**
 * 将 NapCat 接收的消息元素转换为统一格式
 */
function napCatReceiveToMessageElem(data: any): any {
    const type = data.type as string;
    switch (type) {
        case 'text':
        case 'face':
        case 'sface':
        case 'image':
        case 'record':
        case 'json':
        case 'markdown':
            return {
                ...data.data,
                type,
                asface: 'sub_type' in data.data && parseInt(String(data.data.sub_type)) > 0,
            };
        case 'mface':
            return {
                type: 'image',
                url: data.data.url,
                file: data.data.url,
            };
        case 'at':
            const qqNum = Number(data.data.qq);
            return {
                type,
                qq: isNaN(qqNum) ? data.data.qq : qqNum,
                text: data.data.text,
                userName: data.data.text?.replace(/^@/, '') || undefined,
            };
        case 'bface':
            return {
                type: 'image',
                url: data.data?.url || data.data?.file,
                file: data.data?.file || data.data?.url,
                brief: data.data?.text,
                asface: true,
            };
        case 'file':
            return {
                ...data.data,
                type: 'file',
                duration: 0,
                name: data.data.file,
                fid: data.data.file_id || data.data.file,
                size: Number(data.data.file_size),
                md5: '',
            };
        case 'video':
            return {
                type,
                fid: data.data?.file || data.data?.url,
                file: data.data?.url || data.data?.file,
            };
        case 'dice':
        case 'rps':
            return {
                id: Number(data.data.result),
                type: type,
            };
        case 'forward':
            return {
                type: 'forward',
                id: data.data.id,
                content: 'content' in data.data ? napCatForwardMultiple(data.data.content) : undefined,
            };
        case 'reply':
            return {
                type: 'reply',
                id: data.data.id,
            };
        default:
            throw new Error('不支持此元素');
    }
}
