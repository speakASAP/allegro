/**
 * Script to update Client Secret in database with proper encryption
 */
import * as crypto from 'crypto';
import { PrismaClient } from '../shared/node_modules/.prisma/client';
import * as dotenv from 'dotenv';

dotenv.config();

const prisma = new PrismaClient({
  datasources: {
    db: {
      url: process.env.DATABASE_URL,
    },
  },
});

const encryptionKey = process.env.ENCRYPTION_KEY;
const clientSecret = process.env.ALLEGRO_CLIENT_SECRET;
const userId = '6'; // User ID from database

if (!encryptionKey) {
  throw new Error('ENCRYPTION_KEY must be set in .env');
}

if (!clientSecret) {
  throw new Error('ALLEGRO_CLIENT_SECRET must be set in .env');
}

if (encryptionKey.length < 32) {
  throw new Error(`ENCRYPTION_KEY must be at least 32 characters long (current length: ${encryptionKey.length})`);
}

// TypeScript now knows these are defined after validation
const validatedEncryptionKey: string = encryptionKey;
const validatedClientSecret: string = clientSecret;

function encrypt(text: string): string {
  const algorithm = 'aes-256-cbc';
  const iv = crypto.randomBytes(16);
  const cipher = crypto.createCipheriv(
    algorithm,
    Buffer.from(validatedEncryptionKey.slice(0, 32), 'utf8'),
    iv
  );
  let encrypted = cipher.update(text, 'utf8', 'hex');
  encrypted += cipher.final('hex');
  return iv.toString('hex') + ':' + encrypted;
}

async function updateClientSecret() {
  try {
    console.log('Encrypting Client Secret...');
    const encryptedSecret = encrypt(validatedClientSecret);

    console.log('Updating database...');
    const result = await prisma.userSettings.upsert({
      where: { userId },
      update: {
        allegroClientSecret: encryptedSecret,
      },
      create: {
        userId,
        allegroClientSecret: encryptedSecret,
      },
    });

    console.log('✅ Client Secret updated successfully!');
    console.log(`User ID: ${result.userId}`);
    console.log(`Client Secret encrypted and stored (length: ${encryptedSecret.length})`);
  } catch (error) {
    console.error('❌ Error updating Client Secret:', error);
    throw error;
  } finally {
    await prisma.$disconnect();
  }
}

updateClientSecret();

