/**
 * Remove trailing dots from all offer titles and prepare for publishing
 * This script:
 * 1. Finds all offers with titles ending in "."
 * 2. Removes the trailing dot from each title
 * 3. Updates the database
 * 4. Shows summary of changes
 *
 * After running this script, use "Publish All" button in the UI to publish to Allegro
 */

// Try to load Prisma from shared module (production) or root (local)
let PrismaClient;
try {
  // Production path: inside Docker container (from /app/shared)
  PrismaClient = require('/app/shared/node_modules/.prisma/client').PrismaClient;
} catch (e) {
  try {
    // Alternative production path: relative from /app/shared
    PrismaClient = require('./node_modules/.prisma/client').PrismaClient;
  } catch (e2) {
    try {
      // Local development path
      PrismaClient = require('@prisma/client').PrismaClient;
    } catch (e3) {
      // Fallback: try relative path from script location
      PrismaClient = require('../shared/node_modules/.prisma/client').PrismaClient;
    }
  }
}

const path = require('path');

// Load .env if available
try {
  require('dotenv').config({ path: path.join(__dirname, '../.env') });
} catch (e) {
  // dotenv not available, use environment variables
}

const prisma = new PrismaClient();

async function removeTrailingDots() {
  try {
    console.log('🔍 Finding offers with titles ending in "."...\n');

    // Find all offers with titles ending in "."
    const offersWithDots = await prisma.allegroOffer.findMany({
      where: {
        title: {
          endsWith: '.',
        },
      },
      select: {
        id: true,
        title: true,
        allegroOfferId: true,
      },
    });

    if (offersWithDots.length === 0) {
      console.log('✅ No offers found with trailing dots in titles.');
      return;
    }

    console.log(`📋 Found ${offersWithDots.length} offer(s) with trailing dots:\n`);

    let updated = 0;
    let failed = 0;
    const errors = [];

    // Update each offer
    for (const offer of offersWithDots) {
      try {
        const newTitle = offer.title.slice(0, -1).trim(); // Remove last dot and trim

        await prisma.allegroOffer.update({
          where: { id: offer.id },
          data: {
            title: newTitle,
            syncStatus: 'PENDING',
            syncSource: 'MANUAL',
          },
        });

        updated++;
        console.log(`✅ Updated: "${offer.title}" → "${newTitle}"`);
      } catch (error) {
        failed++;
        const errorMsg = `Failed to update offer ${offer.id}: ${error.message}`;
        errors.push(errorMsg);
        console.error(`❌ ${errorMsg}`);
      }
    }

    console.log('\n' + '='.repeat(60));
    console.log('📊 Summary:');
    console.log(`   Total found: ${offersWithDots.length}`);
    console.log(`   ✅ Updated: ${updated}`);
    console.log(`   ❌ Failed: ${failed}`);
    console.log('='.repeat(60));

    if (errors.length > 0) {
      console.log('\n⚠️  Errors:');
      errors.forEach((err) => console.log(`   - ${err}`));
    }

    if (updated > 0) {
      console.log(`\n✅ Successfully updated ${updated} offer(s) in the database.`);
      console.log('📤 Next step: Go to https://allegro.statex.cz/dashboard/offers and click "Publish All" to publish changes to Allegro.');
    }
  } catch (error) {
    console.error('❌ Error:', error.message);
    console.error(error.stack);
  } finally {
    await prisma.$disconnect();
  }
}

removeTrailingDots();

