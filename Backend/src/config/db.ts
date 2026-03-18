import { Pool, PoolConfig } from 'pg';
import dotenv from 'dotenv';

dotenv.config();

console.log('🧪 ENV DEBUG:', {
  DB_HOST: process.env.DB_HOST,
  DB_PORT: process.env.DB_PORT,
  DB_NAME: process.env.DB_NAME,
  DB_USER: process.env.DB_USER,
  HAS_PASSWORD: Boolean(process.env.DB_PASSWORD),
});

const dbConfig: PoolConfig = {
  host: process.env.DB_HOST,
  port: parseInt(process.env.DB_PORT || '5432', 10),
  database: process.env.DB_NAME,
  user: process.env.DB_USER,
  password: process.env.DB_PASSWORD,
  max: 20,
  idleTimeoutMillis: 30000,
  connectionTimeoutMillis: 10000, // Increased to 10 seconds
};

export const pool = new Pool(dbConfig);

// Test connection on startup
pool.on('connect', () => {
  console.log('✅ Database connected successfully');
});

pool.on('error', (err) => {
  console.error('❌ Unexpected database error:', err);
  console.error('   Database config:', {
    host: dbConfig.host,
    port: dbConfig.port,
    database: dbConfig.database,
    user: dbConfig.user,
  });
});

// Test database connection on startup
export const testConnection = async (): Promise<boolean> => {
  try {
    const result = await pool.query('SELECT NOW()');
    console.log('✅ Database connection test successful');
    return true;
  } catch (error: any) {
    console.error('❌ Database connection test failed:', error.message);
    console.error('   Please verify:');
    console.error('   - PostgreSQL is running');
    console.error('   - Database name is correct:', dbConfig.database);
    console.error('   - Username and password are correct');
    console.error('   - Host and port are correct:', `${dbConfig.host}:${dbConfig.port}`);
    return false;
  }
};

// Helper function to execute queries with error handling
export const query = async (text: string, params?: any[]) => {
  const start = Date.now();
  try {
    const res = await pool.query(text, params);
    const duration = Date.now() - start;
    console.log(`📊 Query executed in ${duration}ms: ${text.substring(0, 50)}...`);
    return res;
  } catch (error: any) {
    console.error('❌ Database query error:', error.message);
    console.error('   Query:', text.substring(0, 100));
    throw error;
  }
};

// Helper function for transactions
export const transaction = async <T>(
  callback: (client: any) => Promise<T>
): Promise<T> => {
  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    const result = await callback(client);
    await client.query('COMMIT');
    return result;
  } catch (error) {
    await client.query('ROLLBACK');
    throw error;
  } finally {
    client.release();
  }
};

