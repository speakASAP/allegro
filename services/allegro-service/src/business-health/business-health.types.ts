export type AllegroBusinessHealthStatus = 'pass' | 'warn' | 'blocked';

export interface AllegroBusinessHealthSourceRef {
  path: string;
  reason: string;
}

export interface AllegroBusinessHealthRuntimeBoundary {
  runtimeDataQueried: false;
  productionDbQueried: false;
  liveSyntheticMutationAuthorized: false;
  externalMarketplaceReadQueried: false;
  externalMarketplaceMutationAuthorized: false;
  offerImportAuthorized: false;
  stockSyncAuthorized: false;
  orderImportAuthorized: false;
  warehouseQueried: false;
  catalogQueried: false;
  ordersQueried: false;
}

export interface AllegroChannelReadbackBusinessHealthEnvelope {
  service: 'allegro';
  contractId: 'allegro.channel_readback_business_health.v1';
  businessHealthContract: 'stock-order-marketplace-business-health.v1';
  endpoint: '/allegro/business-health/channel-readback';
  status: AllegroBusinessHealthStatus;
  generatedAt: string;
  summary: string;
  channel: 'allegro';
  evidenceMode: 'source-only';
  invariant: {
    listingQuantityMustNotExceedWarehouseAvailability: true;
    listingMustNotRemainSellableWhenCatalogUnavailable: true;
    orderImportMustNotBypassReservationProof: true;
    externalReadbackRequiredBeforeRuntimePass: true;
    providerPolicyRequiredForExternalMutation: true;
  };
  runtimeBoundary: AllegroBusinessHealthRuntimeBoundary;
  mutationFlags: {
    mutatesAllegro: false;
    mutatesMarketplaceOffer: false;
    mutatesLocalOffer: false;
    mutatesWarehouse: false;
    mutatesCatalog: false;
    mutatesOrders: false;
    mutatesPayments: false;
    changesSecretsOrEnv: false;
  };
  sourceRefs: AllegroBusinessHealthSourceRef[];
  checkedSourceContracts: string[];
  blockers: string[];
  intentChain: {
    vision: string;
    goalImpact: string;
    system: string;
    feature: string;
    task: string;
    executionPlan: string;
    codingPrompt: string;
    code: string[];
    validation: string[];
  };
}
