import { readFileSync, readdirSync } from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import { pool, testConnection } from '../connection.js';

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
    // Pick up all .sql files in order
    const migrationFiles = readdirSync(__dirname)
      .filter((f) => f.endsWith('.sql'))
      .sort(); // lexicographic sort keeps 001_ < 002_ < ... order

    console.log(`Found ${migrationFiles.length} migration file(s): ${migrationFiles.join(', ')}`);

    for (const file of migrationFiles) {
      const filePath = path.join(__dirname, file);
      const sql = readFileSync(filePath, 'utf-8');

      console.log(`\n▶ Running ${file}`);

      const statements = sql
        .split(';')
        .map((s) => s.trim())
        .filter((s) => s.length > 0);

      for (const statement of statements) {
        try {
          await pool.query(statement);
          console.log('  ✓', statement.substring(0, 60).replace(/\n/g, ' ') + '...');
        } catch (err: any) {
          if (err.message?.includes('already exists')) {
            console.log('  ~ already exists:', statement.substring(0, 60).replace(/\n/g, ' '));
          } else {
            console.error('  ✗ Error:', err.message);
            console.error('    Statement:', statement.substring(0, 120));
            throw err;
          }
        }
      }

      console.log(`✅ ${file} done`);
    }

    console.log('\n🎉 All migrations completed successfully!');
  } catch (err) {
    console.error('Migration failed:', err);
    process.exit(1);
  } finally {
    await pool.end();
    process.exit(0);
  }
}

runMigrations();
