import { Injectable } from '@nestjs/common';
import { AllegroChannelReadbackBusinessHealthEnvelope } from './business-health.types';

const CONTRACT_ID = 'allegro.channel_readback_business_health.v1' as const;
const BUSINESS_HEALTH_CONTRACT = 'stock-order-marketplace-business-health.v1' as const;
const ENDPOINT = '/allegro/business-health/channel-readback' as const;

@Injectable()
export class BusinessHealthService {
  getChannelReadbackEnvelope(): AllegroChannelReadbackBusinessHealthEnvelope {
    return {
      service: 'allegro',
      contractId: CONTRACT_ID,
      businessHealthContract: BUSINESS_HEALTH_CONTRACT,
      endpoint: ENDPOINT,
      status: 'warn',
      generatedAt: new Date().toISOString(),
      summary: 'Allegro source-owned channel readback and availability convergence contract exists; live Allegro/provider readback remains runtime-packet gated.',
      channel: 'allegro',
      evidenceMode: 'source-only',
      invariant: {
        listingQuantityMustNotExceedWarehouseAvailability: true,
        listingMustNotRemainSellableWhenCatalogUnavailable: true,
        orderImportMustNotBypassReservationProof: true,
        externalReadbackRequiredBeforeRuntimePass: true,
        providerPolicyRequiredForExternalMutation: true,
      },
      runtimeBoundary: {
        runtimeDataQueried: false,
        productionDbQueried: false,
        liveSyntheticMutationAuthorized: false,
        externalMarketplaceReadQueried: false,
        externalMarketplaceMutationAuthorized: false,
        offerImportAuthorized: false,
        stockSyncAuthorized: false,
        orderImportAuthorized: false,
        warehouseQueried: false,
        catalogQueried: false,
        ordersQueried: false,
      },
      mutationFlags: {
        mutatesAllegro: false,
        mutatesMarketplaceOffer: false,
        mutatesLocalOffer: false,
        mutatesWarehouse: false,
        mutatesCatalog: false,
        mutatesOrders: false,
        mutatesPayments: false,
        changesSecretsOrEnv: false,
      },
      sourceRefs: [
        {
          path: 'services/allegro-service/src/allegro/offers/offers.controller.ts',
          reason: 'Defines Allegro offer read, preview, import, lifecycle, and mutation-adjacent HTTP routes that future channel readback evidence must not bypass.',
        },
        {
          path: 'services/allegro-service/src/allegro/offers/offers.service.ts',
          reason: 'Owns local offer projection, Allegro API interaction, import, publish, and guarded offer mutation behavior used by future runtime proof.',
        },
        {
          path: 'services/allegro-service/src/allegro/quantity-commands/quantity-commands.controller.ts',
          reason: 'Exposes quantity command prepare/confirm/execute gates; source-only business health must not execute these live mutation paths.',
        },
        {
          path: 'services/allegro-service/src/allegro/quantity-commands/quantity-commands.service.ts',
          reason: 'Owns stock quantity command idempotency, confirmation, polling, and provider-side convergence behavior for future approved packets.',
        },
        {
          path: 'services/allegro-service/src/allegro/availability-reconciliation/availability-reconciliation.service.ts',
          reason: 'Documents Catalog/Warehouse authority resolution and local fail-closed availability convergence rules before any Allegro external mutation.',
        },
        {
          path: 'services/allegro-service/src/scripts/import-current-allegro-stock-to-warehouse.ts',
          reason: 'Existing stock import path is live/runtime-sensitive and must remain blocked unless an approved readback packet authorizes it.',
        },
        {
          path: 'services/allegro-service/src/scripts/reconcile-catalog-availability.ts',
          reason: 'Existing availability reconciliation runner is the source for future runtime packet validation but is not invoked by this endpoint.',
        },
        {
          path: 'docs/orchestrator/2026-07-05-runtime-gate-packet-handoff.md',
          reason: 'Runtime gate handoff records owner-approved packet requirements before live Allegro readback, imports, stock sync, or reconciliation.',
        },
      ],
      checkedSourceContracts: [
        'allegro.offer_readback.source.v1',
        'allegro.quantity_command.boundary.v1',
        'allegro.availability_reconciliation.source.v1',
        'allegro.runtime_gate_packet.v1',
        'stock-order-marketplace-business-health.v1',
      ],
      blockers: [
        '[MISSING: approved live Allegro readback packet]',
        '[MISSING: target product/offer/account for Allegro channel readback proof]',
        '[MISSING: Allegro provider/rate-limit/reconciliation policy for live readback cadence and account scope]',
        '[MISSING: approved reconciliation rule that maps Warehouse/Catalog availability to Allegro sellable quantity without provider mutation side effects]',
      ],
      intentChain: {
        vision: 'docs/01_vision/[MISSING: Allegro business health vision artifact]',
        goalImpact: 'docs/22_goal_impact/[MISSING: business-health Allegro channel readback goal impact]',
        system: 'docs/04_systems/[MISSING: Allegro service system artifact]',
        feature: 'docs/10_features/[MISSING: Allegro business-health channel readback feature artifact]',
        task: 'docs/11_tasks/[MISSING: Allegro business-health channel readback task]',
        executionPlan: 'docs/orchestrator/2026-07-06-allegro-business-health-handoff.md',
        codingPrompt: 'Codex prompt 2026-07-06 Allegro service-owned business-health evidence envelope',
        code: [
          'services/allegro-service/src/business-health/business-health.controller.ts',
          'services/allegro-service/src/business-health/business-health.service.ts',
          'services/allegro-service/src/business-health/business-health.types.ts',
        ],
        validation: [
          'scripts/verify-business-health-allegro-channel-contract.js',
          'npm --prefix services/allegro-service run build',
          'git diff --check',
        ],
      },
    };
  }
}
