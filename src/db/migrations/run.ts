import { readFileSync } from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import { pool, testConnection } from '../connection.js';
import type { QueryResult } from 'pg';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

async function runMigrations() {
  console.log('Starting database migrations...');

  const connected = await testConnection();
  if (!connected) {
    console.error('Cannot run migrations - database connection failed');
    process.exit(1);
  }

  try {
    const migrationPath = path.join(path.dirname(__filename), '001_initial_schema.sql');
    const migrationSQL = readFileSync(migrationPath, 'utf-8');

    const statements = migrationSQL
      .split(';')
      .map((s) => s.trim())
      .filter((s) => s.length > 0);

    console.log(`Found ${statements.length} SQL statements to execute`);

    for (const statement of statements) {
      try {
        await pool.query(statement);
        console.log('Executed:', statement.substring(0, 50) + '...');
      } catch (err: any) {
        if (err.message && err.message.includes('already exists')) {
          console.log('Already exists:', statement.substring(0, 50) + '...');
        } else {
          console.error('Error executing statement:', err.message);
          throw err;
        }
      }
    }

    console.log('All migrations completed successfully!');
  } catch (err) {
    console.error('Migration failed:', err);
    process.exit(1);
  } finally {
    await pool.end();
    process.exit(0);
  }
}

runMigrations();
