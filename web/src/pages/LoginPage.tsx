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
        <div className="login-page relative overflow-hidden">
            {/* Animated background effects */}
            <div className="absolute inset-0 overflow-hidden">
                <div className="absolute top-0 -left-4 w-96 h-96 bg-blue-500 rounded-full mix-blend-multiply filter blur-3xl opacity-10 animate-blob"></div>
                <div className="absolute top-0 -right-4 w-96 h-96 bg-purple-500 rounded-full mix-blend-multiply filter blur-3xl opacity-10 animate-blob animation-delay-2000"></div>
                <div className="absolute -bottom-8 left-20 w-96 h-96 bg-indigo-500 rounded-full mix-blend-multiply filter blur-3xl opacity-10 animate-blob animation-delay-4000"></div>
            </div>

            {/* Login card */}
            <Card className="login-card relative z-10 w-full max-w-md mx-auto shadow-2xl border-slate-700/50 bg-slate-900/50 backdrop-blur-xl">
                <CardHeader className="space-y-6 pb-6 pt-8">
                    <div className="flex justify-center mb-4">
                        <div className="p-3 bg-blue-500/10 rounded-full ring-1 ring-blue-500/20 shadow-lg shadow-blue-500/10">
                            <KeyRound className="w-8 h-8 text-blue-400" />
                        </div>
                    </div>
                    <CardTitle className="text-3xl font-bold text-center bg-gradient-to-r from-blue-400 via-indigo-400 to-purple-400 bg-clip-text text-transparent">
                        欢迎使用 NapGram
                    </CardTitle>
                    <CardDescription className="text-center text-slate-400 text-lg">
                        请输入您的 Access Token
                    </CardDescription>
                </CardHeader>
                <CardContent className="space-y-8 pb-8">
                    <form onSubmit={handleTokenLogin} className="space-y-8">
                        <div className="space-y-4">
                            <Label htmlFor="token" className="text-slate-300 text-base ml-1">Access Token</Label>
                            <div className="relative group">
                                <Input
                                    id="token"
                                    type="password"
                                    placeholder="sk-..."
                                    value={token}
                                    onChange={(e) => setToken(e.target.value)}
                                    disabled={isLoading}
                                    required
                                    className="login-input pl-4 pr-10 py-6 text-lg bg-slate-800/50 border-slate-700 focus:border-blue-500 focus:ring-blue-500/20 transition-all duration-300 group-hover:border-slate-600"
                                />
                                <KeyRound className="absolute right-4 top-1/2 -translate-y-1/2 w-5 h-5 text-slate-500 group-hover:text-slate-400 transition-colors" />
                            </div>
                            <p className="text-sm text-slate-500 flex items-center gap-1.5 ml-1">
                                <HelpCircle className="w-4 h-4" />
                                从环境变量 ADMIN_TOKEN 获取
                            </p>
                        </div>

                        {error && (
                            <Alert variant="destructive" className="bg-red-500/10 border-red-500/50 text-red-200">
                                <AlertDescription className="flex items-center gap-2">
                                    <span className="w-1.5 h-1.5 rounded-full bg-red-500 animate-pulse" />
                                    {error}
                                </AlertDescription>
                            </Alert>
                        )}

                        <div className="flex justify-center pt-2">
                            <Button
                                type="submit"
                                className="w-48 bg-gradient-to-r from-blue-600 to-indigo-600 hover:from-blue-500 hover:to-indigo-500 text-white font-semibold text-lg shadow-lg shadow-blue-500/25 transition-all duration-300 h-12 rounded-full hover:scale-105 active:scale-95"
                                disabled={isLoading}
                            >
                                {isLoading ? (
                                    <Loader2 className="mr-2 h-5 w-5 animate-spin" />
                                ) : (
                                    '进入系统'
                                )}
                            </Button>
                        </div>
                    </form>

                    {/* Help links */}
                    <div className="mt-8 pt-6 border-t border-slate-700/30 flex flex-col items-center gap-3">
                        <a href="https://t.me/napgram" target="_blank" rel="noopener noreferrer" className="text-slate-400 hover:text-blue-400 transition-colors flex items-center gap-2 group text-sm">
                            <HelpCircle className="w-4 h-4 group-hover:rotate-12 transition-transform" />
                            <span>没有 Token？加入 Telegram 群组咨询</span>
                        </a>
                    </div>
                </CardContent>
            </Card>

            {/* Footer */}
            <div className="absolute bottom-6 left-0 right-0 text-center">
                <p className="text-slate-600 text-sm font-medium">NapGram Admin Panel</p>
                <p className="text-slate-700 text-xs mt-1">Version 0.1.0</p>
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
