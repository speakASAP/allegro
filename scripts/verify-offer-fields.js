/**
 * Script to verify which offers have descriptions, images, delivery, and payment options
 */

// Use Prisma from shared directory
const path = require('path');
const prismaPath = path.join(__dirname, '../shared/node_modules/.prisma/client');
const { PrismaClient } = require(prismaPath);
const prisma = new PrismaClient();

async function verifyOffers() {
  try {
    // Get total count
    const total = await prisma.allegroOffer.count();
    
    // Count offers with each field
    const withDescription = await prisma.allegroOffer.count({
      where: { description: { not: null } }
    });
    
    const withImages = await prisma.allegroOffer.count({
      where: { images: { not: null } }
    });
    
    const withDelivery = await prisma.allegroOffer.count({
      where: { deliveryOptions: { not: null } }
    });
    
    const withPayment = await prisma.allegroOffer.count({
      where: { paymentOptions: { not: null } }
    });
    
    const withRawData = await prisma.allegroOffer.count({
      where: { rawData: { not: null } }
    });
    
    // Get sample offers to check details
    const sampleOffers = await prisma.allegroOffer.findMany({
      select: {
        allegroOfferId: true,
        title: true,
        description: true,
        images: true,
        deliveryOptions: true,
        paymentOptions: true,
        rawData: true,
      },
      take: 10,
      orderBy: { updatedAt: 'desc' }
    });
    
    // Summary
    console.log('\n=== OFFER FIELD VERIFICATION SUMMARY ===\n');
    console.log(`Total offers: ${total}`);
    console.log(`\nFields present:`);
    console.log(`  - Description: ${withDescription} (${((withDescription/total)*100).toFixed(1)}%)`);
    console.log(`  - Images: ${withImages} (${((withImages/total)*100).toFixed(1)}%)`);
    console.log(`  - Delivery Options: ${withDelivery} (${((withDelivery/total)*100).toFixed(1)}%)`);
    console.log(`  - Payment Options: ${withPayment} (${((withPayment/total)*100).toFixed(1)}%)`);
    console.log(`  - Raw Data: ${withRawData} (${((withRawData/total)*100).toFixed(1)}%)`);
    console.log(`\nFields missing:`);
    console.log(`  - Description: ${total - withDescription} (${(((total - withDescription)/total)*100).toFixed(1)}%)`);
    console.log(`  - Images: ${total - withImages} (${(((total - withImages)/total)*100).toFixed(1)}%)`);
    console.log(`  - Delivery Options: ${total - withDelivery} (${(((total - withDelivery)/total)*100).toFixed(1)}%)`);
    console.log(`  - Payment Options: ${total - withPayment} (${(((total - withPayment)/total)*100).toFixed(1)}%)`);
    
    // Check offers missing critical fields
    const missingDescription = await prisma.allegroOffer.findMany({
      where: { description: null },
      select: { allegroOfferId: true, title: true },
      take: 5
    });
    
    // For JSON fields, we need to check differently - get all and filter
    const allOffersForImages = await prisma.allegroOffer.findMany({
      select: { allegroOfferId: true, title: true, images: true },
    });
    const missingImages = allOffersForImages.filter(o => !o.images || (Array.isArray(o.images) && o.images.length === 0)).slice(0, 5);
    
    console.log(`\n=== SAMPLE OFFERS (Latest 10) ===\n`);
    sampleOffers.forEach((offer, idx) => {
      console.log(`\n${idx + 1}. ${offer.title.substring(0, 50)}...`);
      console.log(`   ID: ${offer.allegroOfferId}`);
      console.log(`   Description: ${offer.description ? `YES (${offer.description.length} chars)` : 'NO'}`);
      console.log(`   Images: ${offer.images ? `YES (${Array.isArray(offer.images) ? offer.images.length : 'present'})` : 'NO'}`);
      console.log(`   Delivery: ${offer.deliveryOptions ? 'YES' : 'NO'}`);
      console.log(`   Payment: ${offer.paymentOptions ? 'YES' : 'NO'}`);
      console.log(`   Raw Data: ${offer.rawData ? 'YES' : 'NO'}`);
    });
    
    if (missingDescription.length > 0) {
      console.log(`\n=== OFFERS MISSING DESCRIPTION (Sample) ===\n`);
      missingDescription.forEach(offer => {
        console.log(`  - ${offer.allegroOfferId}: ${offer.title.substring(0, 50)}...`);
      });
    }
    
    if (missingImages.length > 0) {
      console.log(`\n=== OFFERS MISSING IMAGES (Sample) ===\n`);
      missingImages.forEach(offer => {
        console.log(`  - ${offer.allegroOfferId}: ${offer.title ? offer.title.substring(0, 50) : 'N/A'}...`);
      });
    }
    
    // Check if rawData has the fields even if direct fields are null
    console.log(`\n=== CHECKING RAWDATA AS FALLBACK ===\n`);
    const offersWithRawDataButNoDirectFields = await prisma.allegroOffer.findMany({
      where: {
        rawData: { not: null },
        OR: [
          { description: null },
          { images: null },
          { deliveryOptions: null },
          { paymentOptions: null }
        ]
      },
      select: {
        allegroOfferId: true,
        title: true,
        description: true,
        images: true,
        deliveryOptions: true,
        paymentOptions: true,
        rawData: true,
      },
      take: 5
    });
    
    if (offersWithRawDataButNoDirectFields.length > 0) {
      console.log(`Found ${offersWithRawDataButNoDirectFields.length} offers with rawData but missing direct fields:\n`);
      offersWithRawDataButNoDirectFields.forEach((offer, idx) => {
        const rawData = offer.rawData || {};
        console.log(`${idx + 1}. ${offer.title.substring(0, 50)}...`);
        console.log(`   Direct description: ${offer.description ? 'YES' : 'NO'}`);
        console.log(`   RawData description: ${rawData.description ? 'YES' : 'NO'}`);
        console.log(`   Direct images: ${offer.images ? 'YES' : 'NO'}`);
        console.log(`   RawData images: ${rawData.images ? 'YES' : 'NO'}`);
        console.log(`   Direct delivery: ${offer.deliveryOptions ? 'YES' : 'NO'}`);
        console.log(`   RawData delivery: ${rawData.delivery || rawData.deliveryOptions ? 'YES' : 'NO'}`);
        console.log(`   Direct payment: ${offer.paymentOptions ? 'YES' : 'NO'}`);
        console.log(`   RawData payment: ${rawData.payments || rawData.paymentOptions ? 'YES' : 'NO'}`);
      });
    } else {
      console.log('All offers with rawData also have direct fields populated.');
    }
    
  } catch (error) {
    console.error('Error verifying offers:', error);
  } finally {
    await prisma.$disconnect();
  }
}

verifyOffers();

