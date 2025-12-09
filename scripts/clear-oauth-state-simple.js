const { PrismaClient } = require('../shared/node_modules/.prisma/client');
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

