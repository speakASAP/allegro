// Try to find Prisma client in common locations
let PrismaClient;
try {
  PrismaClient = require('@prisma/client').PrismaClient;
} catch (e) {
  try {
    PrismaClient = require('../../shared/node_modules/.prisma/client').PrismaClient;
  } catch (e2) {
    try {
      PrismaClient = require('../../shared/node_modules/@prisma/client').PrismaClient;
    } catch (e3) {
      try {
        PrismaClient = require('../shared/node_modules/.prisma/client').PrismaClient;
      } catch (e4) {
        console.error('Could not find Prisma client', e.message);
        process.exit(1);
      }
    }
  }
}

require('dotenv').config();

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
  } catch (error) {
    console.error('Error clearing OAuth state:', error.message);
    process.exit(1);
  } finally {
    await prisma.$disconnect();
  }
}

clearOAuthState();

