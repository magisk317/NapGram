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

    if (loading) return <div className="p-4 text-center">Loading...</div>;
    if (error) return <div className="p-4 text-center text-red-500">Error: {error}</div>;

    return (
        <div className="w-full min-h-screen bg-gradient-to-br from-slate-50 to-slate-100 flex justify-center py-2 px-2">
            <div className="w-full max-w-4xl">
                <Card className="shadow-lg border-slate-200/50 bg-white/90 backdrop-blur-md">
                    <CardHeader className="pb-3 border-b border-slate-100">
                        <CardTitle className="text-xl font-bold text-slate-700">聊天记录</CardTitle>
                    </CardHeader>
                    <CardContent className="pt-2 px-3">
                        <ScrollArea className="h-[88vh] pr-1">
                            <div className="space-y-1">
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

// 根据用户ID生成一致的颜色
function getUserColor(id: string | number): string {
    const colors = [
        '#FF516A',
        '#FFA85C',
        '#D669ED',
        '#54CB68',
        '#28C9B7',
        '#2A9EF1',
        '#FF719A'
    ];

    // 简单的哈希函数
    const hash = typeof id === 'string'
        ? id.split('').reduce((acc, char) => acc + char.charCodeAt(0), 0)
        : id;

    return colors[Math.abs(Number(hash)) % 7];
}

function MessageBubble({ msg, idx }: { msg: Message; idx: number }) {
    const senderId = msg.user_id ?? msg.sender_id ?? msg.sender?.id ?? `#${idx}`;
    const name = msg.nickname || msg.card || msg.sender?.name || `Unknown`;
    const avatar = msg.avatar || (senderId ? `/api/avatar/qq/${senderId}` : undefined);
    const timeStr = msg.time ? new Date(msg.time * 1000).toLocaleTimeString('zh-CN', { hour: '2-digit', minute: '2-digit' }) : '';
    const userColor = getUserColor(senderId);

    return (
        <div className="flex gap-2 my-2">
            {/* 头像列 */}
            <div className="flex flex-col items-center w-12 min-w-[48px]">
                <Avatar className="h-9 w-9 shadow-md border-2 border-white sticky bottom-2">
                    <AvatarImage src={avatar} alt={name} />
                    <AvatarFallback className="text-xs font-semibold bg-gradient-to-br from-blue-400 to-purple-500 text-white">
                        {name[0] || '?'}
                    </AvatarFallback>
                </Avatar>
            </div>

            {/* 消息内容列 */}
            <div className="flex-1 min-w-0">
                {/* 昵称 - 使用彩色显示 */}
                <div
                    className="inline-block px-3 py-1 mb-1 rounded-lg text-xs font-bold backdrop-blur-sm sticky top-0 z-10"
                    style={{
                        color: userColor,
                        backgroundColor: 'rgba(255, 255, 255, 0.8)'
                    }}
                >
                    {name}
                </div>

                {/* 消息气泡 */}
                <div className="relative bg-white/40 backdrop-blur-sm border border-slate-200/60 shadow-sm rounded-tr-2xl rounded-b-2xl px-4 py-2.5 text-sm leading-relaxed whitespace-pre-wrap break-words max-w-[calc(100vw-120px)]">
                    {renderMessageContent(msg.message || [])}

                    {/* 时间显示在气泡右下角 */}
                    {timeStr && (
                        <div className="mt-1 text-right text-xs text-slate-400">
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
