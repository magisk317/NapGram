import { drizzle } from 'drizzle-orm/node-postgres';
import pg from 'pg';
import * as schema from './schema/main';
import process from 'node:process';

const { Pool } = pg;

const connectionString = process.env.DATABASE_URL || 'postgresql://postgres:password@localhost:5432/napgram';

export const pool = new Pool({
    connectionString,
});

export const db = drizzle(pool, { schema });
export const drizzleDb = db;

// Export schema for easy access
export { schema };
