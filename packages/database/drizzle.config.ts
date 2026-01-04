import type { Config } from 'drizzle-kit';

export default {
    schema: ['./src/schema/main.ts', './src/schema/plugins/**/*.ts'],
    out: './drizzle',
    dialect: 'postgresql',
    dbCredentials: {
        url: process.env.DATABASE_URL!,
    },
} satisfies Config;
