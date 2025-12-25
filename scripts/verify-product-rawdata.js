/**
 * Script to verify that AllegroProduct records have complete rawData with all fields
 * This verifies the fix for product import that ensures all product data is saved
 */

const { PrismaClient } = require('../shared/node_modules/.prisma/client');
const prisma = new PrismaClient();

async function verifyProductRawData() {
  try {
    console.log('=== VERIFYING ALLEGRO PRODUCT RAWDATA ===\n');

    // Get total count
    const total = await prisma.allegroProduct.count();
    console.log(`Total AllegroProducts: ${total}\n`);

    if (total === 0) {
      console.log('No products found in database.');
      await prisma.$disconnect();
      return;
    }

    // Get products with rawData
    const productsWithRawData = await prisma.allegroProduct.findMany({
      where: { rawData: { not: null } },
      include: { parameters: true },
      take: 10,
      orderBy: { updatedAt: 'desc' }
    });

    console.log(`Products with rawData: ${productsWithRawData.length}\n`);

    // Check structure of rawData
    let completeProducts = 0;
    let incompleteProducts = 0;

    productsWithRawData.forEach((product, idx) => {
      console.log(`\n--- Product ${idx + 1}: ${product.allegroProductId} ---`);
      console.log(`Name: ${product.name || 'MISSING'}`);
      console.log(`Brand: ${product.brand || 'MISSING'}`);
      console.log(`EAN: ${product.ean || 'MISSING'}`);
      console.log(`Parameters count: ${product.parameters?.length || 0}`);

      if (product.rawData) {
        const raw = product.rawData;
        
        // Check if rawData has product structure
        const hasProduct = !!(raw.product || raw.id);
        const hasParameters = !!(raw.product?.parameters || raw.parameters);
        const hasMarketedBeforeGPSR = raw.marketedBeforeGPSRObligation !== undefined;
        
        console.log(`\nRawData structure:`);
        console.log(`  - Has product: ${hasProduct ? 'YES' : 'NO'}`);
        console.log(`  - Has parameters in rawData: ${hasParameters ? 'YES' : 'NO'}`);
        console.log(`  - Has marketedBeforeGPSRObligation: ${hasMarketedBeforeGPSR ? 'YES' : 'NO'}`);
        
        if (raw.product) {
          console.log(`  - Product name in rawData: ${raw.product.name || 'MISSING'}`);
          console.log(`  - Product parameters count: ${Array.isArray(raw.product.parameters) ? raw.product.parameters.length : 'NOT ARRAY'}`);
        }
        
        // Check if rawData is complete
        const isComplete = hasProduct && (hasParameters || product.parameters.length > 0);
        
        if (isComplete) {
          completeProducts++;
          console.log(`  Status: ✅ COMPLETE`);
        } else {
          incompleteProducts++;
          console.log(`  Status: ❌ INCOMPLETE`);
          console.log(`  Missing: ${!hasProduct ? 'product structure, ' : ''}${!hasParameters && product.parameters.length === 0 ? 'parameters' : ''}`);
        }
      } else {
        incompleteProducts++;
        console.log(`RawData: ❌ MISSING`);
      }
    });

    // Summary
    console.log(`\n\n=== SUMMARY ===`);
    console.log(`Total products checked: ${productsWithRawData.length}`);
    console.log(`✅ Complete (with all fields): ${completeProducts}`);
    console.log(`❌ Incomplete (missing fields): ${incompleteProducts}`);
    
    // Check products updated after the fix (assuming fix was deployed recently)
    const recentProducts = await prisma.allegroProduct.findMany({
      where: {
        updatedAt: {
          gte: new Date(Date.now() - 24 * 60 * 60 * 1000) // Last 24 hours
        }
      },
      include: { parameters: true },
      take: 5
    });

    if (recentProducts.length > 0) {
      console.log(`\n=== RECENTLY UPDATED PRODUCTS (Last 24h) ===`);
      recentProducts.forEach((product) => {
        const hasCompleteRawData = product.rawData && 
          (product.rawData.product || product.rawData.id) &&
          (product.rawData.product?.parameters || product.parameters.length > 0);
        console.log(`  ${product.allegroProductId}: ${hasCompleteRawData ? '✅' : '❌'} (Updated: ${product.updatedAt})`);
      });
    }

  } catch (error) {
    console.error('Error verifying product rawData:', error);
  } finally {
    await prisma.$disconnect();
  }
}

verifyProductRawData().catch(console.error);

