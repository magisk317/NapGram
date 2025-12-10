/**
 * API Configuration
 * 
 * In production (Cloudflare Pages), use VITE_API_ORIGIN environment variable
 * In development, use relative paths (proxied by vite dev server)
 */

const API_ORIGIN = import.meta.env.VITE_API_ORIGIN || '';

export const API_CONFIG = {
    baseURL: API_ORIGIN,
    endpoints: {
        auth: {
            login: `${API_ORIGIN}/api/auth/login`,
            loginWithToken: `${API_ORIGIN}/api/auth/login/token`,
            logout: `${API_ORIGIN}/api/auth/logout`,
            me: `${API_ORIGIN}/api/auth/me`,
            createUser: `${API_ORIGIN}/api/auth/users`,
            changePassword: `${API_ORIGIN}/api/auth/change-password`,
        },
        instances: `${API_ORIGIN}/api/instances`,
        statistics: `${API_ORIGIN}/api/statistics`,
    }
};

console.log('[API Config] Using API origin:', API_ORIGIN || 'relative paths (dev mode)');
