import { useEffect, useState } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar';
import { ScrollArea } from '@/components/ui/scroll-area';

interface Message {
    message: any[]; // NapCat message segments
    time?: number;
    // legacy fields from QQ forward history
    user_id?: number | string;
    sender_id?: number | string;
    nickname?: string;
    card?: string;
    avatar?: string;
    sender?: {
        id?: number | string;
        name?: string;
    };
}

interface MergedMessageViewerProps {
    uuid: string;
}

// 根据用户ID生成颜色（7种颜色）
function getUserColor(userId: string | number): string {
    const colors = [
        '#FF516A',  // 红
        '#FFA85C',  // 橙
        '#D669ED',  // 紫
        '#54CB68',  // 绿
        '#28C9B7',  // 青
        '#2A9EF1',  // 蓝
        '#FF719A',  // 粉
    ];
    const hash = String(userId).split('').reduce((acc, char) => acc + char.charCodeAt(0), 0);
    return colors[hash % 7];
}

export function MergedMessageViewer({ uuid }: MergedMessageViewerProps) {
    const [messages, setMessages] = useState<Message[]>([]);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState<string | null>(null);

    useEffect(() => {
        fetch(`/api/messages/merged/${uuid}`)
            .then(res => {
                if (!res.ok) throw new Error('Failed to fetch messages');
                return res.json();
            })
            .then(data => {
                setMessages(data);
                setLoading(false);
            })
            .catch(err => {
                setError(err.message);
                setLoading(false);
            });
    }, [uuid]);

    if (loading) return <div className="p-4 text-center text-slate-600">加载中...</div>;
    if (error) return <div className="p-4 text-center text-red-500">错误: {error}</div>;

    return (
        <div className="w-full min-h-screen bg-gradient-to-br from-slate-100 via-blue-50/30 to-slate-50 flex justify-center py-6 px-3">
            <div className="w-full max-w-4xl">
                <Card className="shadow-xl border-slate-200/60 bg-white/95 backdrop-blur-sm">
                    <CardHeader className="pb-3 border-b border-slate-100">
                        <CardTitle className="text-xl font-bold text-slate-800">聊天记录</CardTitle>
                    </CardHeader>
                    <CardContent className="pt-4">
                        <ScrollArea className="h-[82vh] pr-3">
                            <div className="space-y-3">
                                {messages.map((msg, idx) => (
                                    <MessageBubble key={idx} msg={msg} idx={idx} />
                                ))}
                            </div>
                        </ScrollArea>
                    </CardContent>
                </Card>
            </div>
        </div>
    );
}

function MessageBubble({ msg, idx }: { msg: Message; idx: number }) {
    const senderId = msg.user_id ?? msg.sender_id ?? msg.sender?.id ?? `user${idx}`;
    const name = msg.nickname || msg.card || msg.sender?.name || `未知用户`;
    const avatar = msg.avatar || (senderId && senderId !== `user${idx}` ? `/api/avatar/qq/${senderId}` : undefined);

    // 简洁的HH:mm时间格式
    const timeStr = msg.time ? new Date(msg.time * 1000).toLocaleString('zh-CN', {
        hour: '2-digit',
        minute: '2-digit',
        hour12: false
    }) : '';

    const userColor = getUserColor(senderId);

    return (
        <div className="flex my-2.5">
            {/* 头像容器：50px固定宽度 */}
            <div className="w-[50px] min-w-[50px] max-w-[50px] flex justify-center items-end">
                {/* 36px头像，底部sticky定位 */}
                <Avatar className="h-9 w-9 sticky bottom-2.5 z-[2]">
                    <AvatarImage
                        src={avatar}
                        alt={name}
                        referrerPolicy="no-referrer"
                        onError={(e) => {
                            e.currentTarget.style.display = 'none';
                        }}
                    />
                    <AvatarFallback className="bg-gray-300 text-white font-bold text-sm">
                        {name[0] || '?'}
                    </AvatarFallback>
                </Avatar>
            </div>

            {/* 内容区域 */}
            <div className="flex-grow">
                {/* 昵称：sticky悬浮，彩色文字，毛玻璃背景 */}
                <div
                    className="sticky top-0 z-[1] w-max min-w-0 rounded-[10px] px-2.5 py-1 m-1 text-sm font-bold backdrop-blur-md"
                    style={{
                        color: userColor,
                        backgroundColor: 'rgba(var(--background-rgb, 255, 255, 255), 0.8)'
                    }}
                >
                    {name}
                </div>

                {/* 消息气泡：半透明灰色背景 */}
                <div
                    className="w-max min-w-[100px] max-w-[calc(100vw-100px)] m-1 px-2.5 py-1 text-base rounded-r-[10px] rounded-bl-[10px] rounded-tl-none"
                    style={{ backgroundColor: 'rgba(136, 136, 136, 0.09)' }}
                >
                    {/* 消息内容 */}
                    <div className="whitespace-pre-line">
                        {renderMessageContent(msg.message || [])}
                    </div>

                    {/* 时间：右对齐小字 */}
                    {timeStr && (
                        <div className="mt-0.5 text-right text-xs text-gray-500">
                            {timeStr}
                        </div>
                    )}
                </div>
            </div>
        </div>
    );
}

function renderMessageContent(segments: any[]) {
    if (!Array.isArray(segments)) return null;
    return segments.map((seg, i) => {
        const type = seg?.type || seg?.data?.type;
        const data = seg?.data || seg || {};
        if (type === 'text') {
            const text = data.text ?? seg?.text ?? '';
            return (
                <div key={i} className="space-y-0.5">
                    {String(text)
                        .split(/\n/)
                        .map((line: string, idx2: number) => (
                            <p key={idx2} className="m-0">{line || '\u00A0'}</p>
                        ))}
                </div>
            );
        }
        if (type === 'image' || type === 'flash' || type === 'bface') {
            const url = data.url || data.file || seg?.url || seg?.file;
            if (url) {
                return (
                    <div key={i} className="my-2">
                        <img src={url} alt="Image" className="max-w-full rounded-md shadow border border-slate-200" />
                    </div>
                );
            }
            return <span key={i}>[image]</span>;
        }
        if (type === 'video' || type === 'video-loop') {
            const url = data.url || data.file || seg?.url || seg?.file;
            return (
                <div key={i} className="my-1 text-sky-700 underline break-all">
                    [video] {url && <a href={url} target="_blank" rel="noreferrer">{url}</a>}
                </div>
            );
        }
        if (type === 'record') {
            const url = data.url || data.file || seg?.url || seg?.file;
            return (
                <div key={i} className="my-1 text-sky-700 underline break-all">
                    [语音] {url && <a href={url} target="_blank" rel="noreferrer">{url}</a>}
                </div>
            );
        }
        if (type === 'face' || type === 'sface' || type === 'at') {
            const id = data.id || data.text || '';
            return <span key={i}>[{type}: {id}]</span>;
        }
        // Fallback
        return <span key={i}>[{type || 'unknown'}]</span>;
    });
}
