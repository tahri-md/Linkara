import pkg from 'pg';
const { Pool } = pkg;
import dotenv from 'dotenv';

dotenv.config();

export const pool = new Pool({
  host: process.env.DATABASE_HOST || 'localhost',
  port: parseInt(process.env.DATABASE_PORT || '5432'),
  database: process.env.DATABASE_NAME || 'linkara_dev',
  user: process.env.DATABASE_USER || 'postgres',
  password: process.env.DATABASE_PASSWORD || 'postgres',
});


pool.on('error', (err) => {
  console.error('Unexpected error on idle client', err);
});

export async function testConnection() {
  try {
    const result = await pool.query('SELECT NOW()');
    console.log('Database connected successfully at:', result.rows[0].now);
    return true;
  } catch (err) {
    console.error('Failed to connect to database:', err);
    return false;
  }
}

export async function query(text: string, params?: any[]) {
  try {
    const result = await pool.query(text, params);
    return result;
  } catch (err) {
    console.error('Query error:', err);
    throw err;
  }
}

export async function getClient() {
  const client = await pool.connect();
  return client;
}

export default pool;
