const fs = require('fs');
const path = require('path');

const root = path.resolve(__dirname, '..');

const requiredFiles = [
  'services/allegro-service/src/business-health/business-health.controller.ts',
  'services/allegro-service/src/business-health/business-health.module.ts',
  'services/allegro-service/src/business-health/business-health.service.ts',
  'services/allegro-service/src/business-health/business-health.types.ts',
  'services/allegro-service/src/app.module.ts',
  'docs/orchestrator/2026-07-06-allegro-business-health-handoff.md',
];

const requiredSnippets = {
  'services/allegro-service/src/business-health/business-health.controller.ts': [
    "@Controller('allegro/business-health')",
    "@Get('channel-readback')",
    'getChannelReadback',
  ],
  'services/allegro-service/src/business-health/business-health.service.ts': [
    "const CONTRACT_ID = 'allegro.channel_readback_business_health.v1' as const;",
    "const BUSINESS_HEALTH_CONTRACT = 'stock-order-marketplace-business-health.v1' as const;",
    "const ENDPOINT = '/allegro/business-health/channel-readback' as const;",
    "status: 'warn'",
    "evidenceMode: 'source-only'",
    'listingQuantityMustNotExceedWarehouseAvailability: true',
    'listingMustNotRemainSellableWhenCatalogUnavailable: true',
    'orderImportMustNotBypassReservationProof: true',
    'externalReadbackRequiredBeforeRuntimePass: true',
    'runtimeDataQueried: false',
    'productionDbQueried: false',
    'liveSyntheticMutationAuthorized: false',
    'externalMarketplaceReadQueried: false',
    'externalMarketplaceMutationAuthorized: false',
    'offerImportAuthorized: false',
    'stockSyncAuthorized: false',
    'orderImportAuthorized: false',
    'warehouseQueried: false',
    'catalogQueried: false',
    'ordersQueried: false',
    'mutatesAllegro: false',
    'mutatesMarketplaceOffer: false',
    'mutatesLocalOffer: false',
    'mutatesWarehouse: false',
    'mutatesCatalog: false',
    'mutatesOrders: false',
    'mutatesPayments: false',
    'changesSecretsOrEnv: false',
    '[MISSING: approved live Allegro readback packet]',
    '[MISSING: target product/offer/account for Allegro channel readback proof]',
    '[MISSING: Allegro provider/rate-limit/reconciliation policy for live readback cadence and account scope]',
    'services/allegro-service/src/allegro/offers/offers.controller.ts',
    'services/allegro-service/src/allegro/offers/offers.service.ts',
    'services/allegro-service/src/allegro/quantity-commands/quantity-commands.controller.ts',
    'services/allegro-service/src/allegro/quantity-commands/quantity-commands.service.ts',
    'services/allegro-service/src/allegro/availability-reconciliation/availability-reconciliation.service.ts',
    'services/allegro-service/src/scripts/import-current-allegro-stock-to-warehouse.ts',
    'services/allegro-service/src/scripts/reconcile-catalog-availability.ts',
    'docs/orchestrator/2026-07-05-runtime-gate-packet-handoff.md',
  ],
  'services/allegro-service/src/business-health/business-health.types.ts': [
    'AllegroChannelReadbackBusinessHealthEnvelope',
    "contractId: 'allegro.channel_readback_business_health.v1'",
    "businessHealthContract: 'stock-order-marketplace-business-health.v1'",
    "endpoint: '/allegro/business-health/channel-readback'",
    'runtimeDataQueried: false',
    'productionDbQueried: false',
    'liveSyntheticMutationAuthorized: false',
    'stockSyncAuthorized: false',
    'orderImportAuthorized: false',
  ],
  'services/allegro-service/src/app.module.ts': [
    "import { BusinessHealthModule } from './business-health/business-health.module';",
    'BusinessHealthModule',
  ],
  'docs/orchestrator/2026-07-06-allegro-business-health-handoff.md': [
    'Vision -> Goal Impact -> System -> Feature -> Task -> Execution Plan -> Coding Prompt -> Code -> Validation',
    'GET /allegro/business-health/channel-readback',
    'allegro.channel_readback_business_health.v1',
    '[MISSING: approved live Allegro readback packet]',
    'No live Allegro/provider calls',
  ],
};

const forbiddenSnippets = [
  'createOffer(',
  'updateOffer(',
  'publishOffersToAllegro(',
  'importAllOffers(',
  'importCurrentAllegroStockToWarehouse(',
  'reconcile(',
  'prisma.',
  'warehouseClient.',
  'catalogClient.',
  'ordersClient.',
  'axios.',
  'fetch(',
  'process.env.ALLEGRO_CLIENT_SECRET',
  'process.env.ALLEGRO_ACCESS_TOKEN',
  'process.env.DATABASE_URL',
];

function read(relativePath) {
  const absolutePath = path.join(root, relativePath);
  if (!fs.existsSync(absolutePath)) {
    throw new Error(`Missing required file: ${relativePath}`);
  }
  return fs.readFileSync(absolutePath, 'utf8');
}

for (const file of requiredFiles) {
  read(file);
}

for (const [file, snippets] of Object.entries(requiredSnippets)) {
  const content = read(file);
  for (const snippet of snippets) {
    if (!content.includes(snippet)) {
      throw new Error(`Missing snippet in ${file}: ${snippet}`);
    }
  }
}

const serviceContent = read('services/allegro-service/src/business-health/business-health.service.ts');
for (const snippet of forbiddenSnippets) {
  if (serviceContent.includes(snippet)) {
    throw new Error(`Forbidden live/runtime pattern in business health service: ${snippet}`);
  }
}

console.log(JSON.stringify({
  status: 'pass',
  contractId: 'allegro.channel_readback_business_health.v1',
  endpoint: '/allegro/business-health/channel-readback',
  checkedFiles: requiredFiles.length,
  checkedSourceRefs: 8,
  forbiddenPatternsChecked: forbiddenSnippets.length,
}, null, 2));
