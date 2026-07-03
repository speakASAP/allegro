import { strict as assert } from 'assert';
        import { CatalogSellActionService } from './catalog-sell-action.service';

        function createHarness(overrides: Record<string, any> = {}) {
          const createdOffers: any[] = [];
          const existingDraft = overrides.existingDraft || null;
          const updatedOffers = new Map<string, any>();
          const attempts = overrides.attempts || [];
          const accounts = overrides.accounts || [
            { id: '22222222-2222-2222-2222-222222222222', name: 'Primary', isActive: true, tokenExpiresAt: null },
          ];
          const warehouseAvailable = overrides.warehouseAvailable === undefined ? 5 : overrides.warehouseAvailable;

          const prisma = {
            allegroAccount: {
              findMany: async () => accounts,
            },
            allegroPublishAttempt: {
              findFirst: async ({ where }: any) => attempts.find((attempt: any) => attempt.catalogProductId === where.catalogProductId && attempt.requestedByUserId === where.requestedByUserId) || null,
            },
            allegroOffer: {
              findFirst: async ({ where }: any) => {
                if (where.id && existingDraft && existingDraft.id === where.id) return existingDraft;
                if (existingDraft && where.catalogProductId === existingDraft.catalogProductId) return updatedOffers.get(existingDraft.id) || existingDraft;
                return null;
              },
              findUnique: async ({ where }: any) => updatedOffers.get(where.id) || (existingDraft && existingDraft.id === where.id ? existingDraft : null),
              update: async ({ where, data }: any) => {
                const base = updatedOffers.get(where.id) || existingDraft || { id: where.id };
                const next = { ...base, ...data };
                updatedOffers.set(where.id, next);
                return next;
              },
            },
          };

          const catalogClient = {
            getProductById: async (catalogProductId: string) => ({
              id: catalogProductId,
              ...(overrides.catalogProduct || {}),
              sku: 'SKU-1',
              title: 'Synthetic catalog title',
              brand: 'Synthetic brand',
              ean: '1234567890123',
              categoryId: overrides.catalogCategoryId || 'cat-123',
              description: overrides.catalogDescription,
              shortDescription: overrides.catalogShortDescription,
              price: { gross: 109, currency: 'PLN' },
              quantity: 5,
              images: ['https://example.invalid/product.jpg'],
            }),
            getProductMarketplaceFields: async () => overrides.marketplaceFields || null,
            getProductPricing: async () => overrides.currentPricing || null,
            getProductContentPreview: async () => overrides.contentPreview || null,
            getProductQualityPreflight: async (catalogProductId: string) => {
              if (overrides.catalogQualityThrows) throw Object.assign(new Error('Synthetic Catalog quality outage'), { status: 503 });
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

          const offersService = {
            updateOffer: async (id: string, dto: any) => {
              const base = updatedOffers.get(id) || existingDraft || { id };
              const next = { ...base, ...dto, updatedAt: '2026-06-19T00:01:00Z' };
              updatedOffers.set(id, next);
              return next;
            },
            createOffer: async (dto: any) => {
              createdOffers.push(dto);
              return {
                id: '11111111-1111-1111-1111-111111111111',
                accountId: dto.accountId || null,
                catalogProductId: dto.catalogProductId,
                title: dto.title,
                categoryId: dto.categoryId,
                price: dto.price,
                currency: dto.currency,
                quantity: dto.quantity,
                stockQuantity: dto.stockQuantity,
                rawData: dto.rawData,
                publicationStatus: dto.publicationStatus,
                status: dto.status,
                updatedAt: '2026-06-19T00:00:00Z',
              };
            },
          };

          const publishLifecycleService = {
            prepare: async (dto: any) => ({
              id: 'attempt-1',
              status: overrides.prepareStatus || 'PREPARED',
              offerId: dto.offerId,
              accountId: dto.accountId,
              catalogProductId: dto.catalogProductId,
              blockedReasons: overrides.blockedReasons || [],
            }),
            confirm: async (attemptId: string) => ({
              id: attemptId,
              status: 'QUEUED',
              offerId: '11111111-1111-1111-1111-111111111111',
            }),
            getAttempt: async (attemptId: string) => ({
              id: attemptId,
              status: overrides.statusLookup || 'PREPARED',
              offerId: '11111111-1111-1111-1111-111111111111',
            }),
          };

          const warehouseClient = {
            getTotalAvailable: async () => warehouseAvailable,
          };

          return {
            service: new CatalogSellActionService(
              prisma as any,
              { setContext() {}, log() {}, warn() {}, error() {} } as any,
              offersService as any,
              publishLifecycleService as any,
              catalogClient as any,
              warehouseClient as any,
            ),
            createdOffers,
            updatedOffers,
          };
        }

        async function testPrepareCreatesNewDraftAndReturnsConfirmAction() {
          const { service, createdOffers } = createHarness();
          const result = await service.prepare(
            { catalogProductId: '33333333-3333-3333-3333-333333333333' },
            'user-1',
          );

          assert.equal(createdOffers.length, 1);
          assert.equal(createdOffers[0].syncToAllegro, false);
          assert.equal(result.draftCreated, true);
          assert.equal(result.nextAction, 'confirm_publish');
          assert.equal(result.draft.accountId, '22222222-2222-2222-2222-222222222222');
        }

        async function testPrepareRejectsCatalogQualityBlockersBeforeDraft() {
          const catalogQualityPreflight = {
            policyId: 'catalog.product_quality.v1',
            productId: '33333333-3333-3333-3333-333333333333',
            canActivate: false,
            canPublish: false,
            blockingIssues: [{ code: 'missing_title', field: 'title', severity: 'blocking', message: 'Title is required.' }],
            blockingMissingFields: ['title'],
            optionalOpportunities: [],
            nextAction: 'resolve_catalog_quality_blockers:title',
          };
          const { service, createdOffers } = createHarness({ catalogQualityPreflight });

          await assert.rejects(
            () => service.prepare({ catalogProductId: '33333333-3333-3333-3333-333333333333' }, 'user-1'),
            (error: any) => error.getStatus?.() === 409 && error.getResponse?.().code === 'CATALOG_QUALITY_BLOCKED',
          );
          assert.equal(createdOffers.length, 0);
        }

        async function testPrepareFailsClosedWhenCatalogQualityUnavailableBeforeDraft() {
          const { service, createdOffers } = createHarness({ catalogQualityThrows: true });

          await assert.rejects(
            () => service.prepare({ catalogProductId: '33333333-3333-3333-3333-333333333333' }, 'user-1'),
            (error: any) => error.getStatus?.() === 503 && error.getResponse?.().code === 'CATALOG_QUALITY_PREFLIGHT_UNAVAILABLE',
          );
          assert.equal(createdOffers.length, 0);
        }


        async function testPrepareRejectsCatalogBundleBeforeDraftCreation() {
          const catalogQualityPreflight = {
            policyId: 'catalog.bundle_publication_source.v1',
            productId: 'bundle-3333',
            canActivate: true,
            canPublish: true,
            blockingIssues: [],
            blockingMissingFields: [],
            optionalOpportunities: [],
            nextAction: 'resolve_allegro_bundle_publication_policy',
            target: { type: 'bundle', contract: 'catalog.bundle.v1' },
          };
          const { service, createdOffers } = createHarness({ catalogQualityPreflight });

          await assert.rejects(
            () => service.prepare({ catalogProductId: 'bundle-3333' }, 'user-1'),
            (error: any) => error.getStatus?.() === 409 && error.getResponse?.().code === 'CATALOG_BUNDLE_PUBLICATION_BLOCKED',
          );
          assert.equal(createdOffers.length, 0);
        }

        async function testProductStatusSurfacesCatalogBundlePublicationBlocker() {
          const existingDraft = {
            id: 'existing-offer',
            accountId: '22222222-2222-2222-2222-222222222222',
            catalogProductId: 'bundle-3333',
            title: 'Existing bundle draft',
            categoryId: 'cat-123',
            price: 109,
            currency: 'PLN',
            quantity: 5,
            publicationStatus: 'INACTIVE',
            status: 'DRAFT',
            updatedAt: '2026-06-19T00:00:00Z',
          };
          const catalogQualityPreflight = {
            policyId: 'catalog.bundle_publication_source.v1',
            productId: 'bundle-3333',
            canActivate: true,
            canPublish: true,
            blockingIssues: [],
            blockingMissingFields: [],
            optionalOpportunities: [],
            nextAction: 'resolve_allegro_bundle_publication_policy',
            target: { type: 'bundle', contract: 'catalog.bundle.v1' },
          };
          const { service } = createHarness({
            existingDraft,
            catalogQualityPreflight,
            attempts: [{
              id: 'attempt-1',
              status: 'PREPARED',
              catalogProductId: existingDraft.catalogProductId,
              requestedByUserId: 'user-1',
            }],
          });

          const result = await service.getProductStatus(existingDraft.catalogProductId, 'user-1');

          assert.equal(result.nextAction, 'resolve_allegro_bundle_publication_policy');
          assert.equal(result.canConfirmPublish, false);
          assert.equal(result.canEditDraft, false);
          assert.equal(result.catalogBundlePublicationPolicy.contract, 'catalog.bundle.v1');
        }

        async function testPrepareUsesCatalogContentPreviewDescriptionWhenMissing() {
          const contentPreview = {
            marketplace: 'allegro',
            label: 'Allegro generated content',
            format: 'plain-text',
            content: { title: 'Generated title', plainText: 'Generated Allegro description' },
            source: {
              canonicalDocumentVersion: 'doc-v1',
              legacyDescriptionFallback: false,
              sourceHash: 'sha256:synthetic',
              generatedAt: '2026-06-30T00:00:00.000Z',
            },
            overridesApplied: true,
            warnings: ['Synthetic warning'],
          };
          const marketplaceFields = {
            profile: {
              manualOverrides: { description: { updatedAt: '2026-07-01T00:00:00.000Z' } },
              sourceState: { productUpdatedAt: '2026-07-02T00:00:00.000Z' },
            },
            propagation: { status: 'manual_review_required', staleManualFields: ['description'] },
            fields: [
              { key: 'description', manualOverride: true, stale: true, requiresManualReview: true },
            ],
          };
          const { service, createdOffers } = createHarness({ contentPreview, marketplaceFields });
          const result = await service.prepare(
            { catalogProductId: '33333333-3333-3333-3333-333333333333' },
            'user-1',
          );

          assert.equal(createdOffers[0].description, 'Generated Allegro description');
          assert.equal(createdOffers[0].rawData.catalogSnapshot.descriptionSource, 'catalog-content-preview');
          assert.equal(createdOffers[0].rawData.catalogSnapshot.contentPreview.descriptionApplied, true);
          assert.equal(result.catalogContentPreview.source.sourceHash, 'sha256:synthetic');
          assert.equal(result.catalogContentPreview.warnings[0], 'Synthetic warning');
          assert.equal(result.catalogContentPreview.requiresManualReview, true);
          assert.equal(result.catalogContentPreview.propagation.status, 'manual_review_required');
          assert.equal(result.catalogContentPreview.propagation.staleManualFields[0], 'description');
          assert.equal(createdOffers[0].rawData.catalogSnapshot.contentPreview.requiresManualReview, true);
          assert.equal(createdOffers[0].rawData.catalogSnapshot.contentPreview.propagation.staleManualFields[0], 'description');
        }

        async function testPrepareKeepsExplicitDescriptionOverCatalogContentPreview() {
          const contentPreview = {
            marketplace: 'allegro',
            content: { plainText: 'Generated Allegro description' },
            source: { sourceHash: 'sha256:synthetic' },
          };
          const { service, createdOffers } = createHarness({ contentPreview });
          await service.prepare(
            { catalogProductId: '33333333-3333-3333-3333-333333333333', description: 'Operator provided description' },
            'user-1',
          );

          assert.equal(createdOffers[0].description, 'Operator provided description');
          assert.equal(createdOffers[0].rawData.catalogSnapshot.descriptionSource, 'request');
          assert.equal(createdOffers[0].rawData.catalogSnapshot.contentPreview.descriptionApplied, false);
        }

        async function testPrepareCapsRequestedQuantityToWarehouseAvailability() {
          const { service, createdOffers } = createHarness({ warehouseAvailable: 3 });
          const result = await service.prepare(
            { catalogProductId: '33333333-3333-3333-3333-333333333333', quantity: 99 },
            'user-1',
          );

          assert.equal(createdOffers.length, 1);
          assert.equal(createdOffers[0].quantity, 3);
          assert.equal(createdOffers[0].stockQuantity, 3);
          assert.equal(createdOffers[0].rawData.catalogSnapshot.warehouseStock.totalAvailable, 3);
          assert.equal(createdOffers[0].rawData.catalogSnapshot.warehouseStock.requestedQuantity, 99);
          assert.equal(createdOffers[0].rawData.catalogSnapshot.warehouseStock.capped, true);
          assert.equal(result.draft.stockQuantity, 3);
        }

        async function testPrepareCapsReusableDraftToWarehouseAvailability() {
          const existingDraft = {
            id: 'existing-offer',
            accountId: '22222222-2222-2222-2222-222222222222',
            catalogProductId: '33333333-3333-3333-3333-333333333333',
            title: 'Existing draft',
            categoryId: 'cat-123',
            price: 109,
            currency: 'PLN',
            quantity: 10,
            stockQuantity: 10,
            publicationStatus: 'INACTIVE',
            status: 'DRAFT',
            updatedAt: '2026-06-19T00:00:00Z',
          };
          const { service, updatedOffers } = createHarness({ existingDraft, warehouseAvailable: 4 });
          const result = await service.prepare(
            { catalogProductId: existingDraft.catalogProductId },
            'user-1',
          );

          assert.equal(result.draftCreated, false);
          assert.equal(result.draft.quantity, 4);
          assert.equal(result.draft.stockQuantity, 4);
          assert.equal(updatedOffers.get('existing-offer').rawData.warehouseStock.totalAvailable, 4);
          assert.equal(updatedOffers.get('existing-offer').rawData.warehouseStock.capped, true);
        }

        async function testPrepareReusesExistingDraft() {
          const existingDraft = {
            id: 'existing-offer',
            accountId: '22222222-2222-2222-2222-222222222222',
            catalogProductId: '33333333-3333-3333-3333-333333333333',
            title: 'Existing draft',
            categoryId: 'cat-123',
            price: 109,
            currency: 'PLN',
            quantity: 5,
            publicationStatus: 'INACTIVE',
            status: 'DRAFT',
            updatedAt: '2026-06-19T00:00:00Z',
          };
          const { service, createdOffers } = createHarness({ existingDraft });
          const result = await service.prepare(
            { catalogProductId: '33333333-3333-3333-3333-333333333333' },
            'user-1',
          );

          assert.equal(createdOffers.length, 0);
          assert.equal(result.draftCreated, false);
          assert.equal(result.draft.id, 'existing-offer');
        }

        async function testBulkPrepareAssignsSequentialRateLimitSlots() {
          const { service } = createHarness();
          const result = await service.bulkPrepare(
            {
              items: [
                { catalogProductId: '33333333-3333-3333-3333-333333333333' },
                { catalogProductId: '44444444-4444-4444-4444-444444444444' },
              ],
            },
            'user-1',
          );

          assert.equal(result.results.length, 2);
          assert.equal(result.results[0].rateLimitSlot.slotOffsetSeconds, 0);
          assert.equal(result.results[1].rateLimitSlot.slotOffsetSeconds, 1);
        }

        async function testConfirmQueuesWithoutExecuting() {
          const { service } = createHarness();
          const result = await service.confirm('attempt-1', 'user-1', 'synthetic-preview-token');

          assert.equal(result.status, 'QUEUED');
          assert.equal(result.nextAction, 'monitor_publish_queue');
        }

        async function testProductStatusFindsLatestDraftAndAttempt() {
          const existingDraft = {
            id: 'existing-offer',
            accountId: '22222222-2222-2222-2222-222222222222',
            catalogProductId: '33333333-3333-3333-3333-333333333333',
            allegroOfferId: 'offer-123',
            title: 'Existing draft',
            categoryId: 'cat-123',
            price: 109,
            currency: 'PLN',
            quantity: 5,
            publicationStatus: 'INACTIVE',
            status: 'DRAFT',
            updatedAt: '2026-06-19T00:00:00Z',
          };
          const { service } = createHarness({
            existingDraft,
            attempts: [{
              id: 'attempt-1',
              status: 'PREPARED',
              catalogProductId: existingDraft.catalogProductId,
              requestedByUserId: 'user-1',
            }],
          });

          const result = await service.getProductStatus(existingDraft.catalogProductId, 'user-1');

          assert.equal(result.draft.id, 'existing-offer');
          assert.equal(result.attempt.id, 'attempt-1');
          assert.equal(result.canConfirmPublish, true);
          assert.equal(result.listingUrl, 'https://allegro.cz/nabidka/offer-123');
        }

        async function testProductStatusSurfacesCatalogQualityBlockers() {
          const existingDraft = {
            id: 'existing-offer',
            accountId: '22222222-2222-2222-2222-222222222222',
            catalogProductId: '33333333-3333-3333-3333-333333333333',
            title: 'Existing draft',
            categoryId: 'cat-123',
            price: 109,
            currency: 'PLN',
            quantity: 5,
            publicationStatus: 'INACTIVE',
            status: 'DRAFT',
            updatedAt: '2026-06-19T00:00:00Z',
          };
          const catalogQualityPreflight = {
            policyId: 'catalog.product_quality.v1',
            productId: existingDraft.catalogProductId,
            canActivate: false,
            canPublish: false,
            blockingIssues: [{ code: 'missing_description', field: 'description', severity: 'blocking', message: 'Description is required.' }],
            blockingMissingFields: ['description'],
            optionalOpportunities: [],
            nextAction: 'resolve_catalog_quality_blockers:description',
          };
          const { service } = createHarness({
            existingDraft,
            catalogQualityPreflight,
            attempts: [{
              id: 'attempt-1',
              status: 'PREPARED',
              catalogProductId: existingDraft.catalogProductId,
              requestedByUserId: 'user-1',
            }],
          });

          const result = await service.getProductStatus(existingDraft.catalogProductId, 'user-1');

          assert.equal(result.nextAction, 'resolve_catalog_quality_blockers');
          assert.equal(result.canConfirmPublish, false);
          assert.equal(result.canEditDraft, false);
          assert.equal(result.catalogQualityPreflight.blockingIssues[0].code, 'missing_description');
        }

        async function testProductDraftEditStaysLocal() {
          const existingDraft = {
            id: 'existing-offer',
            accountId: '22222222-2222-2222-2222-222222222222',
            catalogProductId: '33333333-3333-3333-3333-333333333333',
            title: 'Existing draft',
            categoryId: 'cat-123',
            price: 109,
            currency: 'PLN',
            quantity: 5,
            publicationStatus: 'INACTIVE',
            status: 'DRAFT',
            updatedAt: '2026-06-19T00:00:00Z',
          };
          const { service } = createHarness({ existingDraft });

          const result = await service.updateProductDraft(existingDraft.catalogProductId, { catalogProductId: existingDraft.catalogProductId, title: 'Edited title', price: 199 }, 'user-1');

          assert.equal(result.draft.title, 'Edited title');
          assert.equal(Number(result.draft.price), 199);
        }

        async function testConfirmProductPublishUsesLatestAttempt() {
          const existingDraft = {
            id: 'existing-offer',
            accountId: '22222222-2222-2222-2222-222222222222',
            catalogProductId: '33333333-3333-3333-3333-333333333333',
            title: 'Existing draft',
            categoryId: 'cat-123',
            price: 109,
            currency: 'PLN',
            quantity: 5,
            publicationStatus: 'INACTIVE',
            status: 'DRAFT',
            updatedAt: '2026-06-19T00:00:00Z',
          };
          const { service } = createHarness({
            existingDraft,
            attempts: [{
              id: 'attempt-1',
              status: 'PREPARED',
              catalogProductId: existingDraft.catalogProductId,
              requestedByUserId: 'user-1',
            }],
          });

          const result = await service.confirmProductPublish(existingDraft.catalogProductId, 'user-1', 'synthetic-preview-token');

          assert.equal(result.status, 'QUEUED');
          assert.equal(result.nextAction, 'monitor_publish_queue');
        }

        async function testConfirmProductPublishFailsClosedWhenCatalogQualityUnavailable() {
          const existingDraft = {
            id: 'existing-offer',
            accountId: '22222222-2222-2222-2222-222222222222',
            catalogProductId: '33333333-3333-3333-3333-333333333333',
            title: 'Existing draft',
            categoryId: 'cat-123',
            price: 109,
            currency: 'PLN',
            quantity: 5,
            publicationStatus: 'INACTIVE',
            status: 'DRAFT',
            updatedAt: '2026-06-19T00:00:00Z',
          };
          const { service } = createHarness({
            existingDraft,
            catalogQualityThrows: true,
            attempts: [{
              id: 'attempt-1',
              status: 'PREPARED',
              catalogProductId: existingDraft.catalogProductId,
              requestedByUserId: 'user-1',
            }],
          });

          await assert.rejects(
            () => service.confirmProductPublish(existingDraft.catalogProductId, 'user-1', 'synthetic-preview-token'),
            (error: any) => error.getStatus?.() === 409 && error.getResponse?.().code === 'CATALOG_QUALITY_BLOCKED',
          );
        }

        export async function runCatalogSellActionSpec(): Promise<void> {
          await testPrepareCreatesNewDraftAndReturnsConfirmAction();
          await testPrepareRejectsCatalogQualityBlockersBeforeDraft();
          await testPrepareFailsClosedWhenCatalogQualityUnavailableBeforeDraft();
          await testPrepareRejectsCatalogBundleBeforeDraftCreation();
          await testProductStatusSurfacesCatalogBundlePublicationBlocker();
          await testPrepareUsesCatalogContentPreviewDescriptionWhenMissing();
          await testPrepareKeepsExplicitDescriptionOverCatalogContentPreview();
          await testPrepareCapsRequestedQuantityToWarehouseAvailability();
          await testPrepareCapsReusableDraftToWarehouseAvailability();
          await testPrepareReusesExistingDraft();
          await testBulkPrepareAssignsSequentialRateLimitSlots();
          await testConfirmQueuesWithoutExecuting();
          await testProductStatusFindsLatestDraftAndAttempt();
          await testProductStatusSurfacesCatalogQualityBlockers();
          await testProductDraftEditStaysLocal();
          await testConfirmProductPublishUsesLatestAttempt();
          await testConfirmProductPublishFailsClosedWhenCatalogQualityUnavailable();
        }

        if (require.main === module) {
          runCatalogSellActionSpec()
            .then(() => process.stdout.write('catalog-sell-action.spec: PASS\n'))
            .catch((error) => {
              process.stderr.write(`catalog-sell-action.spec: FAIL\n${error.stack || error.message}\n`);
              process.exitCode = 1;
            });
        }
