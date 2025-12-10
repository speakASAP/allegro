// Read environment variables (already set in container, or use dotenv if available)
try {
  require('dotenv').config();
} catch (e) {
  // dotenv not available, use process.env directly
}

// Parse DATABASE_URL or use individual env vars
let connectionConfig;
if (process.env.DATABASE_URL) {
  const url = new URL(process.env.DATABASE_URL);
  connectionConfig = {
    host: url.hostname,
    port: parseInt(url.port) || 5432,
    user: url.username,
    password: url.password,
    database: url.pathname.slice(1), // Remove leading /
  };
} else {
  connectionConfig = {
    host: process.env.DB_HOST,
    port: parseInt(process.env.DB_PORT) || 5432,
    user: process.env.DB_USER,
    password: process.env.DB_PASSWORD,
    database: process.env.DB_NAME,
  };
}

// Try to require pg from different locations
let Client;
try {
  Client = require('pg').Client;
} catch (e) {
  try {
    Client = require('../../node_modules/pg').Client;
  } catch (e2) {
    try {
      Client = require('../node_modules/pg').Client;
    } catch (e3) {
      console.error('Could not find pg module. Please install it: npm install pg');
      process.exit(1);
    }
  }
}

const client = new Client(connectionConfig);

async function clearOAuthState() {
  try {
    await client.connect();
    const result = await client.query(
      'UPDATE user_settings SET allegro_oauth_state = NULL, allegro_oauth_code_verifier = NULL'
    );
    console.log(`Cleared OAuth state for ${result.rowCount} user(s)`);
  } catch (error) {
    console.error('Error clearing OAuth state:', error.message);
    process.exit(1);
  } finally {
    await client.end();
  }
}

clearOAuthState();

