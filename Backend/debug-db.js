const { Client } = require('pg');
const fs = require('fs');
const path = require('path');

console.log('Starting debug script...');

// Manually parse .env
let envVars = {};
try {
    const envPath = path.join(__dirname, '.env');
    if (fs.existsSync(envPath)) {
        const envContent = fs.readFileSync(envPath, 'utf8');
        envContent.split('\n').forEach(line => {
            const parts = line.split('=');
            if (parts.length >= 2) {
                const key = parts[0].trim();
                let val = parts.slice(1).join('=').trim().replace(/\r$/, '');
                if ((val.startsWith('"') && val.endsWith('"')) || (val.startsWith("'") && val.endsWith("'"))) {
                    val = val.slice(1, -1);
                }
                if (key && !key.startsWith('#')) {
                    envVars[key] = val;
                }
            }
        });
        console.log('Loaded .env file');
    } else {
        console.log('No .env file found!');
    }
} catch (e) {
    console.error('Error reading .env:', e);
}

const config = {
    host: envVars.DB_HOST || 'localhost',
    port: parseInt(envVars.DB_PORT || '5432'),
    database: envVars.DB_NAME || 'bms_vehicle_db',
    user: envVars.DB_USER || 'postgres',
    password: envVars.DB_PASSWORD || 'postgres',
};

console.log('Attempting connection with:', {
    host: config.host,
    port: config.port,
    database: config.database,
    user: config.user,
    hasPassword: !!config.password
});

const client = new Client({
    ...config,
    host: '127.0.0.1'
});

async function test() {
    try {
        await client.connect();
        console.log('✅ Connected successfully!');
        const res = await client.query('SELECT NOW()');
        console.log('Time:', res.rows[0]);
        await client.end();
    } catch (err) {
        console.error('❌ Connection Failed');
        console.error('Message:', err.message);
        console.error('Code:', err.code);
        if (err.code === '28P01') console.log('-> Password authentication failed');
        if (err.code === '3D000') console.log('-> Database does not exist');
        if (err.code === 'ECONNREFUSED') console.log('-> Connection refused (Is Postgres running?)');
    }
}

test();
