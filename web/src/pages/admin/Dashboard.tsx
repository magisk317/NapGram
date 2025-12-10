import { useEffect, useState } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Link2, Server, MessageSquare, Activity, TrendingUp } from 'lucide-react';
import { useAuth } from '@/lib/auth';
import { LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer } from 'recharts';

interface Stats {
    pairCount: number;
    instanceCount: number;
    messageCount: number;
    todayMessageCount: number;
    avgMessagesPerDay: number;
    status: 'healthy' | 'degraded' | 'unhealthy';
}

interface TrendData {
    date: string;
    count: number;
}

export function Dashboard() {
    const { token } = useAuth();
    const [stats, setStats] = useState<Stats | null>(null);
    const [trend, setTrend] = useState<TrendData[]>([]);
    const [loading, setLoading] = useState(true);

    useEffect(() => {
        fetchStats();
        fetchTrend();

        // 每30秒刷新一次
        const interval = setInterval(() => {
            fetchStats();
        }, 30000);

        return () => clearInterval(interval);
    }, [token]);

    const fetchStats = async () => {
        try {
            const response = await fetch('/api/admin/statistics/overview', {
                headers: {
                    'Authorization': `Bearer ${token}`
                }
            });

            if (response.ok) {
                const data = await response.json();
                setStats(data.data);
            }
        } catch (error) {
            console.error('Failed to fetch stats:', error);
        } finally {
            setLoading(false);
        }
    };

    const fetchTrend = async () => {
        try {
            const response = await fetch('/api/admin/statistics/messages/trend?days=7', {
                headers: {
                    'Authorization': `Bearer ${token}`
                }
            });

            if (response.ok) {
                const data = await response.json();
                setTrend(data.data);
            }
        } catch (error) {
            console.error('Failed to fetch trend:', error);
        }
    };

    if (loading) {
        return <div className="p-6">加载中...</div>;
    }

    return (
        <div className="space-y-6">
            <div>
                <h1 className="text-3xl font-bold text-gray-900 dark:text-white">仪表板</h1>
                <p className="text-gray-600 dark:text-gray-400 mt-2">
                    系统概览和关键指标
                </p>
            </div>

            <div className="grid gap-6 md:grid-cols-2 lg:grid-cols-4">
                <Card>
                    <CardHeader className="flex flex-row items-center justify-between pb-2">
                        <CardTitle className="text-sm font-medium text-gray-600 dark:text-gray-400">
                            转发配对
                        </CardTitle>
                        <Link2 className="h-4 w-4 text-gray-600 dark:text-gray-400" />
                    </CardHeader>
                    <CardContent>
                        <div className="text-2xl font-bold">{stats?.pairCount || 0}</div>
                        <p className="text-xs text-gray-600 dark:text-gray-400 mt-1">
                            活跃的 QQ-TG 配对
                        </p>
                    </CardContent>
                </Card>

                <Card>
                    <CardHeader className="flex flex-row items-center justify-between pb-2">
                        <CardTitle className="text-sm font-medium text-gray-600 dark:text-gray-400">
                            实例数

                            量
                        </CardTitle>
                        <Server className="h-4 w-4 text-gray-600 dark:text-gray-400" />
                    </CardHeader>
                    <CardContent>
                        <div className="text-2xl font-bold">{stats?.instanceCount || 0}</div>
                        <p className="text-xs text-gray-600 dark:text-gray-400 mt-1">
                            运行中的实例
                        </p>
                    </CardContent>
                </Card>

                <Card>
                    <CardHeader className="flex flex-row items-center justify-between pb-2">
                        <CardTitle className="text-sm font-medium text-gray-600 dark:text-gray-400">
                            消息总数
                        </CardTitle>
                        <MessageSquare className="h-4 w-4 text-gray-600 dark:text-gray-400" />
                    </CardHeader>
                    <CardContent>
                        <div className="text-2xl font-bold">
                            {stats?.messageCount?.toLocaleString() || 0}
                        </div>
                        <p className="text-xs text-gray-600 dark:text-gray-400 mt-1">
                            今日: {stats?.todayMessageCount || 0}
                        </p>
                    </CardContent>
                </Card>

                <Card>
                    <CardHeader className="flex flex-row items-center justify-between pb-2">
                        <CardTitle className="text-sm font-medium text-gray-600 dark:text-gray-400">
                            系统状态
                        </CardTitle>
                        <Activity className="h-4 w-4 text-gray-600 dark:text-gray-400" />
                    </CardHeader>
                    <CardContent>
                        <div className="flex items-center space-x-2">
                            <div className={`h-3 w-3 rounded-full ${stats?.status === 'healthy' ? 'bg-green-500' :
                                    stats?.status === 'degraded' ? 'bg-yellow-500' :
                                        'bg-red-500'
                                }`} />
                            <span className="text-sm font-medium capitalize">
                                {stats?.status === 'healthy' ? '正常' :
                                    stats?.status === 'degraded' ? '降级' : '异常'}
                            </span>
                        </div>
                        <p className="text-xs text-gray-600 dark:text-gray-400 mt-1">
                            日均: {stats?.avgMessagesPerDay || 0} 条
                        </p>
                    </CardContent>
                </Card>
            </div>

            {/* 消息趋势图表 */}
            <Card>
                <CardHeader>
                    <CardTitle className="flex items-center">
                        <TrendingUp className="h-5 w-5 mr-2" />
                        消息趋势（近7天）
                    </CardTitle>
                </CardHeader>
                <CardContent>
                    <ResponsiveContainer width="100%" height={300}>
                        <LineChart data={trend}>
                            <CartesianGrid strokeDasharray="3 3" className="stroke-gray-200 dark:stroke-gray-700" />
                            <XAxis
                                dataKey="date"
                                className="text-xs"
                                tickFormatter={(value) => new Date(value).toLocaleDateString('zh-CN', { month: 'short', day: 'numeric' })}
                            />
                            <YAxis className="text-xs" />
                            <Tooltip
                                labelFormatter={(value) => new Date(value).toLocaleDateString('zh-CN')}
                                formatter={(value: number) => [`${value} 条消息`, '数量']}
                            />
                            <Line
                                type="monotone"
                                dataKey="count"
                                stroke="#3b82f6"
                                strokeWidth={2}
                                dot={{ fill: '#3b82f6', r: 4 }}
                                activeDot={{ r: 6 }}
                            />
                        </LineChart>
                    </ResponsiveContainer>
                </CardContent>
            </Card>

            <Card>
                <CardHeader>
                    <CardTitle>快速操作</CardTitle>
                </CardHeader>
                <CardContent className="grid gap-4 md:grid-cols-2">
                    <a
                        href="/ui/admin/pairs"
                        className="flex items-center p-4 border rounded-lg hover:bg-gray-50 dark:hover:bg-gray-800 transition-colors"
                    >
                        <Link2 className="h-5 w-5 mr-3 text-blue-600" />
                        <div>
                            <h3 className="font-medium">管理配对</h3>
                            <p className="text-sm text-gray-600 dark:text-gray-400">
                                添加或编辑 QQ-TG 转发配对
                            </p>
                        </div>
                    </a>
                    <a
                        href="/ui/admin/instances"
                        className="flex items-center p-4 border rounded-lg hover:bg-gray-50 dark:hover:bg-gray-800 transition-colors"
                    >
                        <Server className="h-5 w-5 mr-3 text-blue-600" />
                        <div>
                            <h3 className="font-medium">管理实例</h3>
                            <p className="text-sm text-gray-600 dark:text-gray-400">
                                配置 Bot 实例和连接
                            </p>
                        </div>
                    </a>
                </CardContent>
            </Card>
        </div>
    );
}