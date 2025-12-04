import { useEffect, useState } from 'react';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';

interface ChatLog {
    id: number;
    time: number;
    brief: string;
    tgMessageText: string;
    qqRoomId: string;
    qqSenderId: string;
    tgChatId: string;
}

export function ChatRecordViewer() {
    const [logs, setLogs] = useState<ChatLog[]>([]);
    const [loading, setLoading] = useState(false);
    const [keyword, setKeyword] = useState('');
    const [page, setPage] = useState(1);
    const [total, setTotal] = useState(0);

    const fetchLogs = () => {
        setLoading(true);
        const params = new URLSearchParams({
            page: page.toString(),
            pageSize: '20',
            keyword,
        });
        fetch(`/api/records/forwarded?${params}`)
            .then(res => res.json())
            .then(data => {
                setLogs(data.items);
                setTotal(data.total);
                setLoading(false);
            })
            .catch(err => {
                console.error(err);
                setLoading(false);
            });
    };

    useEffect(() => {
        fetchLogs();
    }, [page]);

    const handleSearch = () => {
        setPage(1);
        fetchLogs();
    };

    const handleExport = () => {
        const csvContent = "data:text/csv;charset=utf-8,"
            + "Time,Brief,Content,QQ Room,QQ Sender,TG Chat\n"
            + logs.map(e => `${new Date(e.time * 1000).toLocaleString()},"${e.brief}","${e.tgMessageText || ''}",${e.qqRoomId},${e.qqSenderId},${e.tgChatId}`).join("\n");
        const encodedUri = encodeURI(csvContent);
        const link = document.createElement("a");
        link.setAttribute("href", encodedUri);
        link.setAttribute("download", "chat_logs.csv");
        document.body.appendChild(link);
        link.click();
    };

    return (
        <div className="p-4 space-y-4">
            <div className="flex gap-2">
                <Input
                    placeholder="Search keyword..."
                    value={keyword}
                    onChange={e => setKeyword(e.target.value)}
                    className="max-w-sm"
                />
                <Button onClick={handleSearch}>Search</Button>
                <Button variant="outline" onClick={handleExport}>Export CSV</Button>
            </div>

            <div className="border rounded-md">
                <Table>
                    <TableHeader>
                        <TableRow>
                            <TableHead>Time</TableHead>
                            <TableHead>Brief</TableHead>
                            <TableHead>Content</TableHead>
                            <TableHead>QQ Room</TableHead>
                            <TableHead>TG Chat</TableHead>
                        </TableRow>
                    </TableHeader>
                    <TableBody>
                        {loading ? (
                            <TableRow>
                                <TableCell colSpan={5} className="text-center">Loading...</TableCell>
                            </TableRow>
                        ) : logs.map(log => (
                            <TableRow key={log.id}>
                                <TableCell>{new Date(log.time * 1000).toLocaleString()}</TableCell>
                                <TableCell>{log.brief}</TableCell>
                                <TableCell className="max-w-md truncate" title={log.tgMessageText}>{log.tgMessageText}</TableCell>
                                <TableCell>{log.qqRoomId}</TableCell>
                                <TableCell>{log.tgChatId}</TableCell>
                            </TableRow>
                        ))}
                    </TableBody>
                </Table>
            </div>

            <div className="flex justify-between items-center">
                <div>Total: {total}</div>
                <div className="flex gap-2">
                    <Button disabled={page <= 1} onClick={() => setPage(p => p - 1)}>Prev</Button>
                    <Button disabled={page * 20 >= total} onClick={() => setPage(p => p + 1)}>Next</Button>
                </div>
            </div>
        </div>
    );
}
