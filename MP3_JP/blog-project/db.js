const fs = require('fs');
const path = require('path');
const bcrypt = require('bcryptjs');

const usePostgres = Boolean(process.env.DATABASE_URL);
let sqliteDb, pgPool;
const dataDir = path.join(__dirname, 'data');
const sqliteFile = path.join(dataDir, 'blog.sqlite');

async function init() {
  if (usePostgres) {
    const { Pool } = require('pg');
    pgPool = new Pool({ connectionString: process.env.DATABASE_URL, ssl: process.env.PGSSL === 'true' ? { rejectUnauthorized: false } : undefined });
    await pgPool.query(`CREATE TABLE IF NOT EXISTS users (
      user_id VARCHAR(255) PRIMARY KEY, password VARCHAR(255) NOT NULL, name VARCHAR(255) NOT NULL
    )`);
    await pgPool.query(`CREATE TABLE IF NOT EXISTS blogs (
      blog_id SERIAL PRIMARY KEY, creator_name VARCHAR(255) NOT NULL,
      creator_user_id VARCHAR(255) NOT NULL REFERENCES users(user_id) ON DELETE CASCADE,
      title VARCHAR(255) NOT NULL, body TEXT NOT NULL, date_created TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP
    )`);
    console.log('Database: PostgreSQL');
  } else {
    const initSqlJs = require('sql.js');
    const SQL = await initSqlJs();
    fs.mkdirSync(dataDir, { recursive: true });
    sqliteDb = fs.existsSync(sqliteFile) ? new SQL.Database(fs.readFileSync(sqliteFile)) : new SQL.Database();
    sqliteDb.run(`CREATE TABLE IF NOT EXISTS users (user_id TEXT PRIMARY KEY, password TEXT NOT NULL, name TEXT NOT NULL)`);
    sqliteDb.run(`CREATE TABLE IF NOT EXISTS blogs (blog_id INTEGER PRIMARY KEY AUTOINCREMENT, creator_name TEXT NOT NULL, creator_user_id TEXT NOT NULL REFERENCES users(user_id) ON DELETE CASCADE, title TEXT NOT NULL, body TEXT NOT NULL, date_created TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP)`);
    persist();
    console.log('Database: local SQLite (no separate database installation required)');
  }
}
function persist() { if (!usePostgres && sqliteDb) fs.writeFileSync(sqliteFile, Buffer.from(sqliteDb.export())); }
function sqliteRun(sql, params=[]) { const st = sqliteDb.prepare(sql); try { st.bind(params); st.step(); return { changes: sqliteDb.getRowsModified(), lastID: one('SELECT last_insert_rowid() AS id').id }; } finally { st.free(); persist(); } }
function all(sql, params=[]) {
  if (usePostgres) return pgPool.query(sql.replace(/\?/g, () => `$${++all._i}`), params).then(r => r.rows).finally(() => { all._i=0; });
  const st=sqliteDb.prepare(sql); try { st.bind(params); const rows=[]; while(st.step()) rows.push(st.getAsObject()); return rows; } finally { st.free(); }
}
all._i=0;
function one(sql, params=[]) { if (usePostgres) { let i=0; return pgPool.query(sql.replace(/\?/g, () => `$${++i}`), params).then(r=>r.rows[0]); } const rows=all(sql,params); return rows[0]; }
async function run(sql, params=[]) {
  if (usePostgres) { let i=0; const result=await pgPool.query(sql.replace(/\?/g,()=>`$${++i}`),params); return { changes: result.rowCount, lastID: result.rows[0]?.blog_id }; }
  return sqliteRun(sql,params);
}
module.exports={init,all,one,run,get usePostgres(){return usePostgres}};
