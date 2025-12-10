const { PrismaClient } = require('../shared/node_modules/.prisma/client');

const prisma = new PrismaClient();

async function checkValidationErrors() {
  const offer = await prisma.allegroOffer.findFirst({
    where: { title: { contains: 'Černá mini kamera' } },
  });

  if (!offer) {
    console.log('Offer not found');
    await prisma.$disconnect();
    return;
  }

  console.log('Offer:', offer.title);
  console.log('Has description:', !!offer.description);
  console.log('Description length:', offer.description?.length || 0);
  console.log('Has rawData:', !!offer.rawData);
  console.log('RawData has description:', !!offer.rawData?.description);
  console.log('Validation errors:', JSON.stringify(offer.validationErrors, null, 2));
  
  if (offer.rawData) {
    console.log('RawData keys:', Object.keys(offer.rawData));
    console.log('RawData description type:', typeof offer.rawData.description);
    if (offer.rawData.description) {
      console.log('RawData description preview:', String(offer.rawData.description).substring(0, 100));
    }
  }

  await prisma.$disconnect();
}

checkValidationErrors().catch(console.error);

