
import { pool } from './src/config/db';

async function runtrace() {
  console.log('--- DIAGNOSTIC START ---');
  try {
    const client = await pool.connect();
    console.log('✅ Connection Sucessful!');
    const res = await client.query('SELECT NOW()');
    console.log('Time:', res.rows[0]);
    client.release();
  } catch (err: any) {
    console.error('❌ Connection Failed');
    console.error('Error Name:', err.name);
    console.error('Error Message:', err.message);
    if (err.code) console.error('Error Code:', err.code);
    if (err.address) console.error('Address:', err.address);
    if (err.port) console.error('Port:', err.port);
    console.error('Full Error:', JSON.stringify(err, null, 2));
  }
  console.log('--- DIAGNOSTIC END ---');
  process.exit(0);
}

runtrace();
