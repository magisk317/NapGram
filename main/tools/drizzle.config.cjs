const path = require('node:path')
const process = require('node:process')

/** @type {import('drizzle-kit').Config} */
module.exports = {
  schema: [
    '../node_modules/@napgram/database/dist/schema/index.js',
    '../node_modules/@napgram/plugin-permission-management/dist/database/schema.js',
  ],
  out: path.resolve(__dirname, './drizzle'),
  dialect: 'postgresql',
  dbCredentials: {
    url: process.env.DATABASE_URL,
  },
}
