import { createContext, useContext, useState, useEffect, type ReactNode } from 'react';
import { API_CONFIG } from '@/config/api';

interface User {
    id?: number;
    username?: string;
    displayName?: string | null;
    email?: string | null;
}

interface AuthContextType {
    user: User | null;
    token: string | null;
    login: (usernameOrToken: string, password?: string) => Promise<boolean>;
    logout: () => Promise<void>;
    isAuthenticated: boolean;
    isLoading: boolean;
}

const AuthContext = createContext<AuthContextType | undefined>(undefined);

export function AuthProvider({ children }: { children: ReactNode }) {
    const [user, setUser] = useState<User | null>(null);
    const [token, setToken] = useState<string | null>(null);
    const [isLoading, setIsLoading] = useState(true);

    useEffect(() => {
        // Check for existing token in localStorage
        const storedToken = localStorage.getItem('admin_token');
        if (storedToken) {
            verifyToken(storedToken);
        } else {
            setIsLoading(false);
        }
    }, []);

    const verifyToken = async (tkn: string) => {
        try {
            const response = await fetch(API_CONFIG.endpoints.auth.me, {
                headers: {
                    'Authorization': `Bearer ${tkn}`
                }
            });

            if (response.ok) {
                const data = await response.json();
                setUser(data.user);
                setToken(tkn);
            } else {
                localStorage.removeItem('admin_token');
            }
        } catch (error) {
            console.error('Token verification failed:', error);
            localStorage.removeItem('admin_token');
        } finally {
            setIsLoading(false);
        }
    };

    const login = async (usernameOrToken: string, password?: string): Promise<boolean> => {
        try {
            let response;

            if (password) {
                // Username + password login
                response = await fetch(API_CONFIG.endpoints.auth.login, {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({ username: usernameOrToken, password })
                });
            } else {
                // Token login
                response = await fetch(API_CONFIG.endpoints.auth.loginWithToken, {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({ token: usernameOrToken })
                });
            }

            if (response.ok) {
                const data = await response.json();
                const authToken = data.token || usernameOrToken;

                setToken(authToken);
                localStorage.setItem('admin_token', authToken);

                // Fetch user info
                await verifyToken(authToken);
                return true;
            }

            return false;
        } catch (error) {
            console.error('Login failed:', error);
            return false;
        }
    };

    const logout = async () => {
        try {
            if (token) {
                await fetch(API_CONFIG.endpoints.auth.logout, {
                    method: 'POST',
                    headers: {
                        'Authorization': `Bearer ${token}`
                    }
                });
            }
        } catch (error) {
            console.error('Logout failed:', error);
        } finally {
            setUser(null);
            setToken(null);
            localStorage.removeItem('admin_token');
        }
    };

    return (
        <AuthContext.Provider
            value={{
                user,
                token,
                login,
                logout,
                isAuthenticated: !!token,
                isLoading
            }}
        >
            {children}
        </AuthContext.Provider>
    );
}

export function useAuth() {
    const context = useContext(AuthContext);
    if (context === undefined) {
        throw new Error('useAuth must be used within an AuthProvider');
    }
    return context;
}
