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

// 根据用户ID生成一致的颜色方案（使用CSS原生值）
function getUserColor(userId: string | number): {
    avatarGradient: string;
    badgeGradient: string;
    bubbleGradient: string;
    borderColor: string;
    ringColor: string;
} {
    const colorSchemes = [
        {
            avatarGradient: 'linear-gradient(to bottom right, rgb(96 165 250), rgb(37 99 235))',
            badgeGradient: 'linear-gradient(to right, rgb(59 130 246), rgb(37 99 235))',
            bubbleGradient: 'linear-gradient(to bottom right, rgb(239 246 255), rgb(219 234 254) 50%, rgb(255 255 255))',
            borderColor: 'rgb(191 219 254)',
            ringColor: 'rgb(147 197 253)'
        },
        {
            avatarGradient: 'linear-gradient(to bottom right, rgb(192 132 252), rgb(147 51 234))',
            badgeGradient: 'linear-gradient(to right, rgb(168 85 247), rgb(147 51 234))',
            bubbleGradient: 'linear-gradient(to bottom right, rgb(250 245 255), rgb(243 232 255) 50%, rgb(255 255 255))',
            borderColor: 'rgb(233 213 255)',
            ringColor: 'rgb(216 180 254)'
        },
        {
            avatarGradient: 'linear-gradient(to bottom right, rgb(244 114 182), rgb(219 39 119))',
            badgeGradient: 'linear-gradient(to right, rgb(236 72 153), rgb(219 39 119))',
            bubbleGradient: 'linear-gradient(to bottom right, rgb(253 242 248), rgb(252 231 243) 50%, rgb(255 255 255))',
            borderColor: 'rgb(251 207 232)',
            ringColor: 'rgb(249 168 212)'
        },
        {
            avatarGradient: 'linear-gradient(to bottom right, rgb(251 113 133), rgb(225 29 72))',
            badgeGradient: 'linear-gradient(to right, rgb(244 63 94), rgb(225 29 72))',
            bubbleGradient: 'linear-gradient(to bottom right, rgb(255 241 242), rgb(255 228 230) 50%, rgb(255 255 255))',
            borderColor: 'rgb(254 205 211)',
            ringColor: 'rgb(253 164 175)'
        },
        {
            avatarGradient: 'linear-gradient(to bottom right, rgb(251 146 60), rgb(234 88 12))',
            badgeGradient: 'linear-gradient(to right, rgb(249 115 22), rgb(234 88 12))',
            bubbleGradient: 'linear-gradient(to bottom right, rgb(255 247 237), rgb(254 237 213) 50%, rgb(255 255 255))',
            borderColor: 'rgb(254 215 170)',
            ringColor: 'rgb(253 186 116)'
        },
        {
            avatarGradient: 'linear-gradient(to bottom right, rgb(251 191 36), rgb(245 158 11))',
            badgeGradient: 'linear-gradient(to right, rgb(245 158 11), rgb(217 119 6))',
            bubbleGradient: 'linear-gradient(to bottom right, rgb(255 251 235), rgb(254 243 199) 50%, rgb(255 255 255))',
            borderColor: 'rgb(253 230 138)',
            ringColor: 'rgb(252 211 77)'
        },
        {
            avatarGradient: 'linear-gradient(to bottom right, rgb(163 230 53), rgb(101 163 13))',
            badgeGradient: 'linear-gradient(to right, rgb(132 204 22), rgb(101 163 13))',
            bubbleGradient: 'linear-gradient(to bottom right, rgb(247 254 231), rgb(236 252 203) 50%, rgb(255 255 255))',
            borderColor: 'rgb(217 249 157)',
            ringColor: 'rgb(190 242 100)'
        },
        {
            avatarGradient: 'linear-gradient(to bottom right, rgb(52 211 153), rgb(16 185 129))',
            badgeGradient: 'linear-gradient(to right, rgb(16 185 129), rgb(5 150 105))',
            bubbleGradient: 'linear-gradient(to bottom right, rgb(236 253 245), rgb(209 250 229) 50%, rgb(255 255 255))',
            borderColor: 'rgb(167 243 208)',
            ringColor: 'rgb(110 231 183)'
        },
        {
            avatarGradient: 'linear-gradient(to bottom right, rgb(45 212 191), rgb(20 184 166))',
            badgeGradient: 'linear-gradient(to right, rgb(20 184 166), rgb(13 148 136))',
            bubbleGradient: 'linear-gradient(to bottom right, rgb(240 253 250), rgb(204 251 241) 50%, rgb(255 255 255))',
            borderColor: 'rgb(153 246 228)',
            ringColor: 'rgb(94 234 212)'
        },
        {
            avatarGradient: 'linear-gradient(to bottom right, rgb(34 211 238), rgb(6 182 212))',
            badgeGradient: 'linear-gradient(to right, rgb(6 182 212), rgb(8 145 178))',
            bubbleGradient: 'linear-gradient(to bottom right, rgb(236 254 255), rgb(207 250 254) 50%, rgb(255 255 255))',
            borderColor: 'rgb(165 243 252)',
            ringColor: 'rgb(103 232 249)'
        },
        {
            avatarGradient: 'linear-gradient(to bottom right, rgb(129 140 248), rgb(79 70 229))',
            badgeGradient: 'linear-gradient(to right, rgb(99 102 241), rgb(79 70 229))',
            bubbleGradient: 'linear-gradient(to bottom right, rgb(238 242 255), rgb(224 231 255) 50%, rgb(255 255 255))',
            borderColor: 'rgb(199 210 254)',
            ringColor: 'rgb(165 180 252)'
        },
        {
            avatarGradient: 'linear-gradient(to bottom right, rgb(167 139 250), rgb(124 58 237))',
            badgeGradient: 'linear-gradient(to right, rgb(139 92 246), rgb(124 58 237))',
            bubbleGradient: 'linear-gradient(to bottom right, rgb(245 243 255), rgb(237 233 254) 50%, rgb(255 255 255))',
            borderColor: 'rgb(221 214 254)',
            ringColor: 'rgb(196 181 253)'
        },
    ];
    const hash = String(userId).split('').reduce((acc, char) => acc + char.charCodeAt(0), 0);
    return colorSchemes[hash % colorSchemes.length];
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

    // 完整日期时间格式：YYYY/MM/DD HH:mm:ss
    const timeStr = msg.time ? new Date(msg.time * 1000).toLocaleString('zh-CN', {
        year: 'numeric',
        month: '2-digit',
        day: '2-digit',
        hour: '2-digit',
        minute: '2-digit',
        second: '2-digit',
        hour12: false
    }).replace(/\//g, '/') : '';

    const userColors = getUserColor(senderId);

    return (
        <div className="flex items-start gap-2.5 group">
            {/* 头像 - 增大尺寸，彩色边框 */}
            <div className="relative flex-shrink-0">
                <Avatar className="h-12 w-12 shadow-lg border-[3px] border-white ring-[3px] transition-all hover:scale-110 hover:shadow-xl" style={{ '--tw-ring-color': userColors.ringColor } as React.CSSProperties}>
                    <AvatarImage
                        src={avatar}
                        alt={name}
                        referrerPolicy="no-referrer"
                        onError={(e) => {
                            e.currentTarget.style.display = 'none';
                        }}
                    />
                    <AvatarFallback className="text-white font-bold text-base" style={{ background: userColors.avatarGradient }}>
                        {name[0] || '?'}
                    </AvatarFallback>
                </Avatar>
                {/* 彩色光环效果 */}
                <div className="absolute inset-0 rounded-full opacity-30 blur-sm -z-10" style={{ background: userColors.avatarGradient }}></div>
            </div>

            {/* 消息内容区域 */}
            <div className="flex-1 min-w-0">
                {/* 用户信息栏 - 彩色昵称徽章 + 时间戳 */}
                <div className="flex items-center gap-2.5 mb-1.5 flex-wrap">
                    <span className="inline-flex items-center px-3 py-1 rounded-full text-xs font-bold text-white shadow-md" style={{ background: userColors.badgeGradient }}>
                        {name}
                    </span>
                    {timeStr && (
                        <span className="text-[11px] text-slate-400 font-medium bg-slate-50 px-2 py-0.5 rounded-full">
                            {timeStr}
                        </span>
                    )}
                </div>

                {/* 消息气泡 - 明显的渐变背景 */}
                <div className="relative max-w-[90%]">
                    <div className="border-2 shadow-md rounded-[16px] rounded-tl-[4px] px-4 py-3 text-[14px] leading-relaxed whitespace-pre-wrap break-words transition-all duration-200 hover:shadow-lg hover:scale-[1.01]" style={{ background: userColors.bubbleGradient, borderColor: userColors.borderColor }}>
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
