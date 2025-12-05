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

// 根据用户ID生成一致的颜色
function getUserColor(userId: string | number): string {
    const colors = [
        'bg-blue-500',
        'bg-purple-500',
        'bg-pink-500',
        'bg-rose-500',
        'bg-orange-500',
        'bg-amber-500',
        'bg-lime-500',
        'bg-emerald-500',
        'bg-teal-500',
        'bg-cyan-500',
        'bg-indigo-500',
        'bg-violet-500',
    ];
    const hash = String(userId).split('').reduce((acc, char) => acc + char.charCodeAt(0), 0);
    return colors[hash % colors.length];
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
        <div className="w-full min-h-screen bg-gradient-to-br from-slate-50 to-slate-100 flex justify-center py-6 px-3">
            <div className="w-full max-w-4xl">
                <Card className="shadow-lg border-slate-200/60 bg-white/90 backdrop-blur-sm">
                    <CardHeader className="pb-3 border-b border-slate-100">
                        <CardTitle className="text-xl font-bold text-slate-800">聊天记录</CardTitle>
                    </CardHeader>
                    <CardContent className="pt-4">
                        <ScrollArea className="h-[82vh] pr-3">
                            <div className="space-y-4">
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
    const timeStr = msg.time ? new Date(msg.time * 1000).toLocaleString('zh-CN', {
        year: 'numeric',
        month: '2-digit',
        day: '2-digit',
        hour: '2-digit',
        minute: '2-digit',
        second: '2-digit',
        hour12: false
    }) : '';
    const userColor = getUserColor(senderId);

    return (
        <div className="flex items-start gap-3 group">
            {/* 头像 */}
            <Avatar className="h-11 w-11 shadow-md border-2 border-white ring-1 ring-slate-200 flex-shrink-0">
                <AvatarImage
                    src={avatar}
                    alt={name}
                    referrerPolicy="no-referrer"
                    onError={(e) => {
                        // 头像加载失败时使用 fallback
                        e.currentTarget.style.display = 'none';
                    }}
                />
                <AvatarFallback className={`${userColor} text-white font-semibold text-sm`}>
                    {name[0] || '?'}
                </AvatarFallback>
            </Avatar>

            {/* 消息内容区域 */}
            <div className="flex-1 min-w-0">
                {/* 用户信息栏 */}
                <div className="flex items-baseline gap-2 mb-1.5 flex-wrap">
                    <span className={`inline-block px-2 py-0.5 rounded text-xs font-semibold text-white ${userColor} shadow-sm`}>
                        {name}
                    </span>
                    {timeStr && (
                        <span className="text-xs text-slate-400 font-medium">
                            {timeStr}
                        </span>
                    )}
                </div>

                {/* 消息气泡 */}
                <div className="relative">
                    <div className="bg-white border border-slate-200/80 shadow-sm rounded-2xl rounded-tl-sm px-4 py-2.5 text-sm leading-relaxed whitespace-pre-wrap break-words transition-all duration-200 hover:shadow-md hover:border-slate-300/80">
                        {renderMessageContent(msg.message || [])}
                    </div>
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
