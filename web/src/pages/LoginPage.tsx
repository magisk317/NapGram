import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { useAuth } from '@/lib/auth';
import { Loader2, KeyRound, HelpCircle } from 'lucide-react';

export function LoginPage() {
    const navigate = useNavigate();
    const { login } = useAuth();

    const [isLoading, setIsLoading] = useState(false);
    const [error, setError] = useState<string | null>(null);
    const [token, setToken] = useState('');

    const handleTokenLogin = async (e: React.FormEvent) => {
        e.preventDefault();
        setError(null);
        setIsLoading(true);

        try {
            const success = await login(token);
            if (success) {
                navigate('/ui/admin');
            } else {
                setError('Token 无效或已过期');
            }
        } catch (err) {
            setError('登录失败，请稍后重试');
        } finally {
            setIsLoading(false);
        }
    };

    return (
        <div className="min-h-screen flex items-center justify-center bg-gradient-to-br from-slate-900 via-blue-950 to-slate-900 px-4 relative overflow-hidden">
            {/* Animated background effects */}
            <div className="absolute inset-0 overflow-hidden">
                <div className="absolute top-0 -left-4 w-96 h-96 bg-blue-500 rounded-full mix-blend-multiply filter blur-3xl opacity-10 animate-blob"></div>
                <div className="absolute top-0 -right-4 w-96 h-96 bg-purple-500 rounded-full mix-blend-multiply filter blur-3xl opacity-10 animate-blob animation-delay-2000"></div>
                <div className="absolute -bottom-8 left-20 w-96 h-96 bg-indigo-500 rounded-full mix-blend-multiply filter blur-3xl opacity-10 animate-blob animation-delay-4000"></div>
            </div>

            {/* Login card */}
            <Card className="w-full max-w-md relative z-10 bg-slate-800/50 backdrop-blur-xl border-slate-700/50 shadow-2xl">
                <CardHeader className="space-y-3 pb-6">
                    <div className="flex justify-center mb-2">
                        <div className="p-3 bg-blue-500/10 rounded-2xl border border-blue-500/20">
                            <KeyRound className="w-8 h-8 text-blue-400" />
                        </div>
                    </div>
                    <CardTitle className="text-2xl font-bold text-center bg-gradient-to-r from-blue-400 to-purple-400 bg-clip-text text-transparent">
                        欢迎使用 NapGram
                    </CardTitle>
                    <CardDescription className="text-center text-slate-400">
                        请输入您的 Access Token 以继续访问管理系统
                    </CardDescription>
                </CardHeader>
                <CardContent>
                    <form onSubmit={handleTokenLogin} className="space-y-5">
                        <div className="space-y-2">
                            <Label htmlFor="token" className="text-slate-300">Access Token</Label>
                            <div className="relative">
                                <Input
                                    id="token"
                                    type="password"
                                    placeholder="请输入您的 Access Token"
                                    value={token}
                                    onChange={(e) => setToken(e.target.value)}
                                    disabled={isLoading}
                                    required
                                    className="bg-slate-900/50 border-slate-700 text-slate-100 placeholder:text-slate-500 focus:border-blue-500 focus:ring-blue-500/20 pr-10"
                                />
                                <KeyRound className="absolute right-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-500" />
                            </div>
                            <p className="text-xs text-slate-500 flex items-center gap-1">
                                <HelpCircle className="w-3 h-3" />
                                从环境变量 ADMIN_TOKEN 或管理员处获取
                            </p>
                        </div>

                        {error && (
                            <Alert variant="destructive" className="bg-red-500/10 border-red-500/50">
                                <AlertDescription className="text-red-400">{error}</AlertDescription>
                            </Alert>
                        )}

                        <Button
                            type="submit"
                            className="w-full bg-gradient-to-r from-blue-600 to-purple-600 hover:from-blue-700 hover:to-purple-700 text-white font-medium shadow-lg shadow-blue-500/20 transition-all duration-200"
                            disabled={isLoading}
                        >
                            {isLoading && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
                            登录并进入
                        </Button>
                    </form>

                    {/* Help links */}
                    <div className="mt-6 pt-4 border-t border-slate-700/50 flex flex-col items-center gap-2 text-sm">
                        <a href="#" className="text-slate-400 hover:text-blue-400 transition-colors flex items-center gap-1">
                            <HelpCircle className="w-4 h-4" />
                            没有 Token，该如何获取账号？
                        </a>
                        <p className="text-slate-500 text-xs">
                            我为啥收不到你的邮件？
                        </p>
                    </div>
                </CardContent>
            </Card>

            {/* Footer */}
            <div className="absolute bottom-4 left-0 right-0 text-center text-slate-500 text-xs">
                NapGram Admin Panel • Version 0.1.0
            </div>

            <style>{`
                @keyframes blob {
                    0%, 100% { transform: translate(0, 0) scale(1); }
                    25% { transform: translate(20px, -20px) scale(1.1); }
                    50% { transform: translate(0, 20px) scale(1); }
                    75% { transform: translate(-20px, -10px) scale(0.9); }
                }
                .animate-blob {
                    animation: blob 7s infinite;
                }
                .animation-delay-2000 {
                    animation-delay: 2s;
                }
                .animation-delay-4000 {
                    animation-delay: 4s;
                }
            `}</style>
        </div>
    );
}
