/**
 * Simple script to update Client Secret using raw SQL
 */
const crypto = require('crypto');
const { execSync } = require('child_process');
const fs = require('fs');

// Try to load dotenv if available, otherwise use process.env directly
try {
  require('dotenv').config();
} catch (e) {
  // dotenv not available, use environment variables directly
}

const userId = '6';

// Read from .env file or environment variables
let envContent = '';
let fullKey = '';
let clientSecret = '';
let dbUrl = '';

try {
  envContent = fs.readFileSync('.env', 'utf8');
  const keyMatch = envContent.match(/^ENCRYPTION_KEY=(.+)$/m);
  const secretMatch = envContent.match(/^ALLEGRO_CLIENT_SECRET=(.+)$/m);
  const dbUrlMatch = envContent.match(/^DATABASE_URL=(.+)$/m);
  
  fullKey = keyMatch ? keyMatch[1].trim() : process.env.ENCRYPTION_KEY || '';
  clientSecret = secretMatch ? secretMatch[1].trim() : process.env.ALLEGRO_CLIENT_SECRET || '';
  dbUrl = dbUrlMatch ? dbUrlMatch[1].trim() : process.env.DATABASE_URL || '';
} catch (e) {
  // .env file not available, use environment variables
  fullKey = process.env.ENCRYPTION_KEY || '';
  clientSecret = process.env.ALLEGRO_CLIENT_SECRET || '';
  dbUrl = process.env.DATABASE_URL || '';
}

if (!fullKey) {
  throw new Error('ENCRYPTION_KEY must be set in .env or environment');
}

if (!clientSecret) {
  throw new Error('ALLEGRO_CLIENT_SECRET must be set in .env or environment');
}

if (!dbUrl) {
  throw new Error('DATABASE_URL must be set in .env or environment');
}

console.log('Encryption key length:', fullKey.length);
console.log('Client Secret length:', clientSecret.length);

if (fullKey.length < 32) {
  throw new Error(`ENCRYPTION_KEY must be at least 32 characters long (current: ${fullKey.length})`);
}

function encrypt(text) {
  const algorithm = 'aes-256-cbc';
  const iv = crypto.randomBytes(16);
  const keyBuffer = Buffer.from(fullKey.slice(0, 32), 'utf8');
  const cipher = crypto.createCipheriv(algorithm, keyBuffer, iv);
  let encrypted = cipher.update(text, 'utf8', 'hex');
  encrypted += cipher.final('hex');
  return iv.toString('hex') + ':' + encrypted;
}

try {
  console.log('Encrypting Client Secret...');
  const encryptedSecret = encrypt(clientSecret);
  console.log('Encrypted secret length:', encryptedSecret.length);

  // Escape single quotes and backslashes for SQL
  const escapedSecret = encryptedSecret.replace(/\\/g, '\\\\').replace(/'/g, "''");

  console.log('Updating database...');
  // Write SQL to temp file to avoid shell escaping issues
  const sqlFile = '/tmp/update_secret.sql';
  const sql = `UPDATE user_settings SET "allegroClientSecret" = '${escapedSecret}' WHERE "userId" = '${userId}';`;
  fs.writeFileSync(sqlFile, sql);
  
  // Use psql to execute the update - remove schema query parameter
  const dbUrlForPsql = dbUrl.split('?')[0]; // Remove query parameters
  const psqlCmd = `psql "${dbUrlForPsql}" -f ${sqlFile}`;
  console.log('Executing SQL update...');
  const result = execSync(psqlCmd, { encoding: 'utf8' });
  fs.unlinkSync(sqlFile); // Clean up
  console.log(result);
  console.log('✅ Client Secret updated successfully!');
} catch (error) {
  console.error('❌ Error updating Client Secret:', error.message);
  process.exit(1);
}

