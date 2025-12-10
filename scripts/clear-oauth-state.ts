/**
 * Clear OAuth state from database
 * This script clears old OAuth state that might have been encrypted with a different key
 */

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

async function clearOAuthState() {
  try {
    const result = await prisma.userSettings.updateMany({
      data: {
        allegroOAuthState: null,
        allegroOAuthCodeVerifier: null,
      },
    });

    console.log(`Cleared OAuth state for ${result.count} user(s)`);
  } catch (error: any) {
    console.error('Error clearing OAuth state:', error.message);
    process.exit(1);
  } finally {
    await prisma.$disconnect();
  }
}

clearOAuthState();

