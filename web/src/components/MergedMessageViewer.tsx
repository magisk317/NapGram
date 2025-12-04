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
        <div className="container mx-auto p-4 max-w-2xl">
            <Card>
                <CardHeader>
                    <CardTitle>Chat History</CardTitle>
                </CardHeader>
                <CardContent>
                    <ScrollArea className="h-[80vh] pr-4">
                        <div className="space-y-4">
                            {messages.map((msg, idx) => (
                                <div key={idx} className="flex gap-3">
                                    {buildSenderInfo(msg, idx)}
                                </div>
                            ))}
                        </div>
                    </ScrollArea>
                </CardContent>
            </Card>
        </div>
    );
}

function buildSenderInfo(msg: Message, idx: number) {
    const senderId = msg.user_id ?? msg.sender_id ?? msg.sender?.id ?? `#${idx}`;
    const name = msg.nickname || msg.card || msg.sender?.name || `Unknown`;
    const avatar = msg.avatar || (senderId ? `/api/avatar/qq/${senderId}` : undefined);

    return (
        <>
            <Avatar>
                <AvatarImage src={avatar} />
                <AvatarFallback>{name[0] || '?'}</AvatarFallback>
            </Avatar>
            <div className="flex-1">
                <div className="flex items-baseline justify-between">
                    <span className="font-semibold text-sm">
                        {name}
                    </span>
                    <span className="text-xs text-muted-foreground">
                        {msg.time ? new Date(msg.time * 1000).toLocaleString() : ''}
                    </span>
                </div>
                <div className="mt-1 text-sm bg-muted/50 p-2 rounded-md">
                    {renderMessageContent(msg.message || [])}
                </div>
            </div>
        </>
    );
}

function renderMessageContent(segments: any[]) {
    if (!Array.isArray(segments)) return null;
    return segments.map((seg, i) => {
        const type = seg?.type || seg?.data?.type;
        const data = seg?.data || seg || {};
        if (type === 'text') {
            const text = data.text ?? seg?.text ?? '';
            return <span key={i}>{text}</span>;
        }
        if (type === 'image' || type === 'flash' || type === 'bface') {
            const url = data.url || data.file || seg?.url || seg?.file;
            if (url) {
                return <img key={i} src={url} alt="Image" className="max-w-full rounded-md my-2" />;
            }
            return <span key={i}>[image]</span>;
        }
        if (type === 'video' || type === 'video-loop') {
            const url = data.url || data.file || seg?.url || seg?.file;
            return <span key={i}>[video]{url ? ` ${url}` : ''}</span>;
        }
        if (type === 'record') {
            return <span key={i}>[语音]</span>;
        }
        if (type === 'face' || type === 'sface' || type === 'at') {
            const id = data.id || data.text || '';
            return <span key={i}>[{type}: {id}]</span>;
        }
        // Fallback
        return <span key={i}>[{type || 'unknown'}]</span>;
    });
}
