import { strict as assert } from 'assert';
import { MarketplacePolicyEngineService } from './policy-engine.service';

function createPolicyHarness(overrides: Record<string, any> = {}) {
  const offer = {
    id: '11111111-1111-1111-1111-111111111111',
    accountId: '22222222-2222-2222-2222-222222222222',
    catalogProductId: '33333333-3333-3333-3333-333333333333',
    allegroOfferId: 'allegro-123',
    title: 'Synthetic title',
    categoryId: 'cat-1',
    price: 99,
    currency: 'PLN',
    stockQuantity: 4,
    images: ['https://example.invalid/image.jpg'],
    rawData: { delivery: true, payments: true },
    ...overrides.offer,
  };

  const prisma = {
    allegroAccount: {
      findFirst: async ({ where }: any) => {
        if (where.id !== offer.accountId || where.userId !== 'user-1') return null;
        return { id: offer.accountId, isActive: true, tokenExpiresAt: new Date(Date.now() + 60_000).toISOString() };
      },
      count: async ({ where }: any) => (where.id === offer.accountId ? 1 : 0),
    },
    allegroOffer: {
      count: async () => overrides.duplicateCount || 0,
    },
  };

  const catalogClient = {
    getProductById: async (catalogProductId: string) => {
      if (overrides.catalogThrows) throw Object.assign(new Error('Synthetic catalog outage'), { status: 503 });
      if (overrides.catalogMissing) return null;
      return { id: catalogProductId, name: 'Synthetic catalog product' };
    },
    getProductQualityPreflight: async (catalogProductId: string) => {
      if (overrides.catalogQualityThrows) throw Object.assign(new Error('Synthetic quality outage'), { status: 503 });
      return overrides.catalogQualityPreflight || {
        policyId: 'catalog.product_quality.v1',
        productId: catalogProductId,
        canActivate: true,
        canPublish: true,
        blockingIssues: [],
        blockingMissingFields: [],
        optionalOpportunities: [],
        nextAction: 'ready_for_allegro_publish',
        sourceEndpoint: 'GET /api/products/:id/readiness',
        reviewContractEndpoint: 'GET /api/products/review/quality',
      };
    },
  };

  return { service: new MarketplacePolicyEngineService(prisma as any, catalogClient as any), offer };
}

async function testPassingPolicyIsDeterministicAndReusable() {
  const { service, offer } = createPolicyHarness();
  const result = await service.evaluate({ action: 'UPDATE', offer, accountId: offer.accountId, catalogProductId: offer.catalogProductId, requestedByUserId: 'user-1' });

  assert.equal(result.version, 'TASK-003.v1');
  assert.equal(result.summary.blockers, 0);
  assert.equal(result.results.some((entry) => entry.status === 'WARN'), true);
  assert.equal(result.results.some((entry) => entry.status === 'RECOMMEND'), false);

  const updateGate = result.results.find((entry) => entry.gate === 'update-terminal-contract');
  assert.equal(updateGate?.status, 'PASS');
  assert.equal(updateGate?.ownerService, 'allegro-service');

  const catalogGate = result.results.find((entry) => entry.gate === 'catalog-validation');
  assert.equal(catalogGate?.status, 'PASS');
  assert.equal(catalogGate?.ownerService, 'catalog-microservice');

  const qualityGate = result.results.find((entry) => entry.gate === 'catalog-product-quality');
  assert.equal(qualityGate?.status, 'PASS');
  assert.equal(qualityGate?.evidence?.policyId, 'catalog.product_quality.v1');
}

async function testBlockedPolicyIncludesOwnersAndRemediation() {
  const { service, offer } = createPolicyHarness({
    offer: { title: '', categoryId: '', price: 0, stockQuantity: -1, images: [] },
    duplicateCount: 1,
  });
  const result = await service.evaluate({ action: 'PUBLISH', offer, accountId: offer.accountId, catalogProductId: offer.catalogProductId, requestedByUserId: 'user-1' });

  assert.equal(result.summary.blockers >= 4, true);
  for (const blocker of result.results.filter((entry) => entry.status === 'BLOCK')) {
    assert.equal(typeof blocker.ownerService, 'string');
    assert.equal(blocker.ownerService.length > 0, true);
    assert.equal(typeof blocker.remediation, 'string');
    assert.equal(blocker.remediation.length > 0, true);
  }

  assert.equal(result.results.find((entry) => entry.gate === 'duplicate-offer-check')?.status, 'BLOCK');
  assert.equal(result.results.find((entry) => entry.gate === 'stock-readiness')?.ownerService, 'warehouse-microservice');
}

async function testCatalogQualityBlockersBlockPolicy() {
  const { service, offer } = createPolicyHarness({
    catalogQualityPreflight: {
      policyId: 'catalog.product_quality.v1',
      productId: '33333333-3333-3333-3333-333333333333',
      canActivate: false,
      canPublish: false,
      blockingIssues: [{ code: 'missing_image', field: 'media', severity: 'blocking', message: 'Image is required.' }],
      blockingMissingFields: ['image'],
      optionalOpportunities: [],
      nextAction: 'resolve_catalog_quality_blockers:image',
      sourceEndpoint: 'GET /api/products/:id/readiness',
      reviewContractEndpoint: 'GET /api/products/review/quality',
    },
  });
  const result = await service.evaluate({ action: 'PUBLISH', offer, accountId: offer.accountId, catalogProductId: offer.catalogProductId, requestedByUserId: 'user-1' });
  const qualityGate = result.results.find((entry) => entry.gate === 'catalog-product-quality');

  assert.equal(qualityGate?.status, 'BLOCK');
  assert.equal(qualityGate?.ownerService, 'catalog-microservice');
  assert.deepEqual(qualityGate?.evidence?.blockingIssueCodes, ['missing_image']);
}

async function testUnknownCatalogQualityPublishabilityBlocksPolicy() {
  const { service, offer } = createPolicyHarness({
    catalogQualityPreflight: {
      policyId: 'catalog.product_quality.v1',
      productId: '33333333-3333-3333-3333-333333333333',
      blockingIssues: [],
      blockingMissingFields: [],
      optionalOpportunities: [],
      nextAction: 'retry_catalog_quality_preflight',
      sourceEndpoint: 'GET /api/products/:id/readiness',
      reviewContractEndpoint: 'GET /api/products/review/quality',
    },
  });
  const result = await service.evaluate({ action: 'PUBLISH', offer, accountId: offer.accountId, catalogProductId: offer.catalogProductId, requestedByUserId: 'user-1' });
  const qualityGate = result.results.find((entry) => entry.gate === 'catalog-product-quality');

  assert.equal(qualityGate?.status, 'BLOCK');
  assert.equal(qualityGate?.reason?.includes('catalog_quality_preflight_not_publishable'), true);
}


async function testCatalogBundleContractBlocksExternalPublication() {
  const { service, offer } = createPolicyHarness({
    catalogQualityPreflight: {
      policyId: 'catalog.bundle_publication_source.v1',
      productId: 'bundle-3333',
      canActivate: true,
      canPublish: true,
      blockingIssues: [],
      blockingMissingFields: [],
      nextAction: 'resolve_allegro_bundle_publication_policy',
      sourceEndpoint: 'GET /api/products/:id/readiness',
      target: { type: 'bundle', contract: 'catalog.bundle.v1' },
    },
  });
  const result = await service.evaluate({ action: 'PUBLISH', offer, accountId: offer.accountId, catalogProductId: offer.catalogProductId, requestedByUserId: 'user-1' });
  const bundleGate = result.results.find((entry) => entry.gate === 'catalog-bundle-publication-policy');

  assert.equal(bundleGate?.status, 'BLOCK');
  assert.equal(bundleGate?.ownerService, 'allegro-service');
  assert.equal(bundleGate?.evidence?.contract, 'catalog.bundle.v1');
  assert.equal(Array.isArray(bundleGate?.evidence?.missingContracts), true);
}

async function testCatalogOutageBlocksWithoutSecrets() {
  const { service, offer } = createPolicyHarness({ catalogThrows: true });
  const result = await service.evaluate({ action: 'UPDATE', offer, accountId: offer.accountId, catalogProductId: offer.catalogProductId, requestedByUserId: 'user-1' });
  const catalogGate = result.results.find((entry) => entry.gate === 'catalog-validation');

  assert.equal(catalogGate?.status, 'BLOCK');
  assert.equal(catalogGate?.ownerService, 'catalog-microservice');
  assert.equal(JSON.stringify(catalogGate).includes('accessToken'), false);
}

export async function runPolicyEngineSpec(): Promise<void> {
  await testPassingPolicyIsDeterministicAndReusable();
  await testBlockedPolicyIncludesOwnersAndRemediation();
  await testCatalogQualityBlockersBlockPolicy();
  await testUnknownCatalogQualityPublishabilityBlocksPolicy();
  await testCatalogBundleContractBlocksExternalPublication();
  await testCatalogOutageBlocksWithoutSecrets();
}

if (require.main === module) {
  runPolicyEngineSpec()
    .then(() => process.stdout.write('policy-engine.spec: PASS\n'))
    .catch((error) => {
      process.stderr.write(`policy-engine.spec: FAIL\n${error.stack || error.message}\n`);
      process.exitCode = 1;
    });
}
