import * as crypto from 'crypto';
import * as path from 'path';

// eslint-disable-next-line @typescript-eslint/no-var-requires
const { PrismaClient } = require(path.resolve(process.cwd(), '../../shared/node_modules/.prisma/client'));

type Args = {
  accountId?: string;
  accountName?: string;
  allAccounts: boolean;
  apply: boolean;
  confirmApply?: string;
  verifyWarehouse: boolean;
  refreshToken: boolean;
  detailLimit: number;
  listLimit: number;
  publicationStatuses: string[];
  warehouseId?: string;
  help: boolean;
};

type AccountSource = {
  accountId: string;
  accountName: string;
  userId: string;
  isActive: boolean;
  tokenState: string;
};

type ImportCandidate = {
  offerId: string;
  account: AccountSource;
  title: string | null;
  publicationStatus: string | null;
  stockAvailable: number;
  localOffer: {
    id: string;
    accountId: string | null;
    catalogProductId: string | null;
    stockQuantity: number;
    quantity: number;
    status: string;
    publicationStatus: string | null;
  } | null;
};

type CandidateResult = {
  offerId: string;
  accountId: string;
  accountName: string;
  title: string | null;
  publicationStatus: string | null;
  catalogProductId: string | null;
  allegroStockAvailable: number;
  previousLocalStock: number | null;
  warehouseId: string | null;
  action: 'would_set_warehouse_stock' | 'set_warehouse_stock' | 'skipped';
  skippedReason?: string;
  warehouseStatus?: number;
  warehouseResponse?: any;
  warehouseTotalAvailable?: number | null;
  warehouseMatchesAllegro?: boolean | null;
  error?: string;
};

const prisma = new PrismaClient();
const ALLEGRO_API_URL = (process.env.ALLEGRO_API_URL || 'https://api.allegro.pl').replace(/\/$/, '');
const WAREHOUSE_SERVICE_URL = (process.env.WAREHOUSE_SERVICE_URL || 'http://warehouse-microservice:3201').replace(/\/$/, '');
const DEFAULT_PUBLICATION_STATUSES = ['ACTIVE', 'INACTIVE', 'ENDED', 'ACTIVATING'];
const REASON_CODE = 'ALLEGRO_CURRENT_STOCK_IMPORT';
const APPLY_CONFIRMATION = 'ALLEGRO_CURRENT_STOCK_IMPORT';

function printHelp(): void {
  console.log(`Import current stock-authoritative Allegro offer quantities to Warehouse.

Usage:
  npm run import:current-stock:warehouse -- --all-accounts --dry-run
  npm run import:current-stock:warehouse -- --all-accounts --dry-run --verify-warehouse --refresh-token
  npm run import:current-stock:warehouse -- --account-name FlipFlop --dry-run
  npm run import:current-stock:warehouse -- --all-accounts --warehouse-id <uuid> --apply --confirm-apply ${APPLY_CONFIRMATION}

This script reads Allegro /sale/offers and /sale/product-offers/{offerId}.
Only product-offers stock.available is treated as current stock-authoritative.
Dry-run is the default and does not call Warehouse, mutate local offer rows, or refresh OAuth tokens.
Use --refresh-token to update only encrypted OAuth token fields before reading Allegro.
Use --verify-warehouse to read Warehouse totals and compare them to Allegro stock.available.
Apply mode calls Warehouse POST /api/stock/set for locally mapped offers. Local AllegroOffer rows remain read-only.
Apply mode requires both --apply and --confirm-apply ${APPLY_CONFIRMATION}.
`);
}

function ensureDatabaseUrl(): void {
  if (process.env.DATABASE_URL) return;
  const user = encodeURIComponent(process.env.DB_USER || '');
  const password = encodeURIComponent(process.env.DB_PASSWORD || '');
  const host = process.env.DB_HOST || '';
  const port = process.env.DB_PORT || '5432';
  const db = process.env.DB_NAME || '';
  if (user && host && db) {
    process.env.DATABASE_URL = `postgresql://${user}:${password}@${host}:${port}/${db}`;
  }
}

function parseArgs(argv: string[]): Args {
  const args: Args = {
    allAccounts: false,
    apply: false,
    verifyWarehouse: false,
    refreshToken: false,
    detailLimit: 500,
    listLimit: 100,
    publicationStatuses: [...DEFAULT_PUBLICATION_STATUSES],
    help: false,
  };

  for (let index = 0; index < argv.length; index += 1) {
    const arg = argv[index];
    const next = () => {
      const value = argv[index + 1];
      if (!value || value.startsWith('--')) throw new Error(`Missing value for ${arg}`);
      index += 1;
      return value;
    };

    if (arg === '--help' || arg === '-h') args.help = true;
    else if (arg === '--account-id') args.accountId = next();
    else if (arg === '--account-name') args.accountName = next();
    else if (arg === '--all-accounts') args.allAccounts = true;
    else if (arg === '--apply') args.apply = true;
    else if (arg === '--dry-run') args.apply = false;
    else if (arg === '--confirm-apply') args.confirmApply = next();
    else if (arg === '--verify-warehouse') args.verifyWarehouse = true;
    else if (arg === '--refresh-token') args.refreshToken = true;
    else if (arg === '--detail-limit') args.detailLimit = Math.max(0, Number(next()));
    else if (arg === '--list-limit') args.listLimit = Math.max(1, Math.min(1000, Number(next())));
    else if (arg === '--warehouse-id') args.warehouseId = next();
    else if (arg === '--publication-status') args.publicationStatuses = next().split(',').map((item) => item.trim().toUpperCase()).filter(Boolean);
    else throw new Error(`Unknown argument: ${arg}`);
  }

  if (!args.help && !args.allAccounts && !args.accountId && !args.accountName) {
    throw new Error('Provide --all-accounts, --account-id, or --account-name.');
  }
  if (!args.publicationStatuses.length) {
    throw new Error('At least one --publication-status value is required.');
  }
  if (args.apply && args.confirmApply !== APPLY_CONFIRMATION) {
    throw new Error(`Refusing to apply without --confirm-apply ${APPLY_CONFIRMATION}. Run --dry-run first and record owner approval before applying.`);
  }
  return args;
}

function decrypt(value: string): string {
  const key = process.env.ENCRYPTION_KEY;
  if (!key || key.length < 32) throw new Error('ENCRYPTION_KEY must be configured and at least 32 characters.');
  const parts = String(value || '').split(':');
  if (parts.length !== 2) throw new Error('Invalid encrypted token format.');
  const decipher = crypto.createDecipheriv('aes-256-cbc', Buffer.from(key.slice(0, 32), 'utf8'), Buffer.from(parts[0], 'hex'));
  return decipher.update(parts[1], 'hex', 'utf8') + decipher.final('utf8');
}



function redactSecretMessage(message: string): string {
  return String(message || '')
    .replace(/eyJ[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+/g, '[REDACTED_JWT]')
    .replace(/(access_token|refresh_token)=([^\s&]+)/gi, '$1=[REDACTED]');
}

function encrypt(value: string): string {
  const key = process.env.ENCRYPTION_KEY;
  if (!key || key.length < 32) throw new Error('ENCRYPTION_KEY must be configured and at least 32 characters.');
  const iv = crypto.randomBytes(16);
  const cipher = crypto.createCipheriv('aes-256-cbc', Buffer.from(key.slice(0, 32), 'utf8'), iv);
  return `${iv.toString('hex')}:${cipher.update(value, 'utf8', 'hex') + cipher.final('hex')}`;
}

async function refreshAccessToken(account: any): Promise<string> {
  if (!account.refreshToken) throw new Error(`Account ${account.id} has no refresh token.`);
  if (!account.clientId || !account.clientSecret) throw new Error(`Account ${account.id} has no Allegro client credentials.`);
  const tokenUrl = process.env.ALLEGRO_OAUTH_TOKEN_URL || process.env.ALLEGRO_TOKEN_URL;
  if (!tokenUrl) throw new Error('ALLEGRO_OAUTH_TOKEN_URL must be configured.');
  const refreshToken = decrypt(account.refreshToken);
  const clientSecret = decrypt(account.clientSecret);
  const response = await fetch(tokenUrl, {
    method: 'POST',
    headers: {
      'content-type': 'application/x-www-form-urlencoded',
      authorization: `Basic ${Buffer.from(`${account.clientId}:${clientSecret}`).toString('base64')}`,
    },
    body: new URLSearchParams({
      grant_type: 'refresh_token',
      refresh_token: refreshToken,
    }),
  });
  const text = await response.text();
  let data: any = null;
  try { data = text ? JSON.parse(text) : null; } catch { data = { raw: text.slice(0, 500) }; }
  if (!response.ok || !data?.access_token) {
    const message = data?.error_description || data?.error || data?.message || response.statusText;
    throw Object.assign(new Error(`${response.status} ${redactSecretMessage(message)}`), { status: response.status, data: '[REDACTED]' });
  }
  const expiresAt = new Date(Date.now() + Number(data.expires_in || 0) * 1000);
  await prisma.allegroAccount.update({
    where: { id: account.id },
    data: {
      accessToken: encrypt(data.access_token),
      refreshToken: data.refresh_token ? encrypt(data.refresh_token) : account.refreshToken,
      tokenExpiresAt: expiresAt,
    },
  });
  account.accessToken = '[refreshed]';
  account.refreshToken = data.refresh_token ? '[refreshed]' : account.refreshToken;
  account.tokenExpiresAt = expiresAt;
  return data.access_token;
}

async function accessTokenForAccount(account: any, refreshTokenBeforeRead: boolean): Promise<{ token: string | null; tokenState: string; refreshed: boolean; error?: string }> {
  if (refreshTokenBeforeRead) {
    try {
      const token = await refreshAccessToken(account);
      return { token, tokenState: 'refreshed', refreshed: true };
    } catch (error: any) {
      const latest = await prisma.allegroAccount.findUnique({
        where: { id: account.id },
        select: { accessToken: true, tokenExpiresAt: true },
      });
      const latestState = latest ? tokenState(latest) : 'missing_access_token';
      if (latest?.accessToken && (latestState === 'present' || latestState === 'present_without_expiry')) {
        try {
          return { token: decrypt(latest.accessToken), tokenState: 'refresh_failed_using_current_token', refreshed: false, error: redactSecretMessage(error?.message || String(error)) };
        } catch {}
      }
      return { token: null, tokenState: 'refresh_failed', refreshed: false, error: redactSecretMessage(error?.message || String(error)) };
    }
  }
  const state = tokenState(account);
  if (state !== 'present' && state !== 'present_without_expiry') return { token: null, tokenState: state, refreshed: false };
  try {
    return { token: decrypt(account.accessToken), tokenState: state, refreshed: false };
  } catch (error: any) {
    return { token: null, tokenState: 'decrypt_failed', refreshed: false, error: error?.message || String(error) };
  }
}

function tokenState(account: any): string {
  if (!account.accessToken) return 'missing_access_token';
  if (!account.tokenExpiresAt) return 'present_without_expiry';
  return new Date(account.tokenExpiresAt).getTime() <= Date.now() ? 'expired_not_refreshed' : 'present';
}

function allegroHeaders(token: string): Record<string, string> {
  return {
    Authorization: `Bearer ${token}`,
    Accept: 'application/vnd.allegro.public.v1+json',
    'Accept-Language': 'cs-CZ',
  };
}

function warehouseHeaders(): Record<string, string> {
  // JWT_TOKEN is deliberately NOT in this chain: it holds the shared legacy
  // HS256 credential that warehouse-microservice rejects (RS256 required), so
  // falling through to it would produce a confusing 401 instead of the loud
  // misconfiguration error below.
  const token =
    process.env.WAREHOUSE_SERVICE_TOKEN ||
    process.env.WAREHOUSE_INTERNAL_SERVICE_TOKEN ||
    process.env.INTERNAL_SERVICE_TOKEN;

  if (!token) {
    // Previously this returned headers with no Authorization, so the import ran
    // unauthenticated and failed as a 401 far from the actual cause.
    throw new Error(
      '[MISSING: warehouse runtime credential] Set WAREHOUSE_SERVICE_TOKEN (or WAREHOUSE_INTERNAL_SERVICE_TOKEN / INTERNAL_SERVICE_TOKEN); refusing to call warehouse-microservice unauthenticated',
    );
  }

  return {
    'content-type': 'application/json',
    Authorization: token.startsWith('Bearer ') ? token : `Bearer ${token}`,
  };
}

async function requestJson(url: string, options: any = {}, allow404 = false): Promise<{ status: number; data: any }> {
  const response = await fetch(url, options);
  const text = await response.text();
  let data: any = null;
  try { data = text ? JSON.parse(text) : null; } catch { data = { raw: text.slice(0, 500) }; }
  if (!response.ok && !(allow404 && response.status === 404)) {
    const message = data?.errors?.[0]?.userMessage || data?.errors?.[0]?.message || data?.message || response.statusText;
    throw Object.assign(new Error(`${response.status} ${redactSecretMessage(message)}`), { status: response.status, data: '[REDACTED]' });
  }
  return { status: response.status, data };
}

async function resolveAccounts(args: Args): Promise<any[]> {
  const select = {
    id: true,
    userId: true,
    name: true,
    isActive: true,
    accessToken: true,
    refreshToken: true,
    clientId: true,
    clientSecret: true,
    tokenExpiresAt: true,
    updatedAt: true,
  };

  if (args.allAccounts) {
    return prisma.allegroAccount.findMany({ select, orderBy: [{ isActive: 'desc' }, { updatedAt: 'desc' }] });
  }
  if (args.accountId) {
    const account = await prisma.allegroAccount.findUnique({ where: { id: args.accountId }, select });
    return account ? [account] : [];
  }

  return prisma.allegroAccount.findMany({
    where: { name: { equals: args.accountName, mode: 'insensitive' } },
    select,
    orderBy: [{ isActive: 'desc' }, { updatedAt: 'desc' }],
  });
}

function toNonNegativeInteger(value: unknown): number | null {
  const number = Number(value);
  if (!Number.isFinite(number) || number < 0) return null;
  return Math.floor(number);
}

function accountSource(account: any): AccountSource {
  return {
    accountId: account.id,
    accountName: account.name,
    userId: account.userId,
    isActive: Boolean(account.isActive),
    tokenState: tokenState(account),
  };
}

async function listOfferIds(token: string, args: Args): Promise<Map<string, any>> {
  const offersById = new Map<string, any>();

  for (const status of args.publicationStatuses) {
    let offset = 0;
    while (true) {
      const url = `${ALLEGRO_API_URL}/sale/offers?${new URLSearchParams({
        limit: String(args.listLimit),
        offset: String(offset),
        'publication.status': status,
      }).toString()}`;

      const { data } = await requestJson(url, { headers: allegroHeaders(token) });
      const offers = Array.isArray(data?.offers) ? data.offers : [];
      for (const offer of offers) {
        const offerId = String(offer?.id || '').trim();
        if (offerId && !offersById.has(offerId)) {
          offersById.set(offerId, offer);
        }
      }

      if (offers.length < args.listLimit) break;
      offset += args.listLimit;
    }
  }

  return offersById;
}

async function collectCandidates(account: any, args: Args): Promise<{ account: AccountSource; candidates: ImportCandidate[]; errors: any[] }> {
  const source = accountSource(account);
  const errors: any[] = [];
  const tokenResult = await accessTokenForAccount(account, args.refreshToken);
  source.tokenState = tokenResult.tokenState;
  if (tokenResult.error) {
    errors.push({ source: 'local-token-refresh', accountId: account.id, tokenState: tokenResult.tokenState, message: tokenResult.error });
  }
  if (!tokenResult.token) {
    return { account: source, candidates: [], errors: [{ source: 'local-token', accountId: account.id, message: tokenResult.error || tokenResult.tokenState }] };
  }
  const token = tokenResult.token;

  let listed: Map<string, any>;
  try {
    listed = await listOfferIds(token, args);
  } catch (error: any) {
    return { account: source, candidates: [], errors: [...errors, { source: 'sale.offers', accountId: account.id, httpStatus: error.status || null, message: error.message }] };
  }

  const candidates: ImportCandidate[] = [];
  const offerIds = Array.from(listed.keys()).slice(0, args.detailLimit);
  for (const offerId of offerIds) {
    try {
      const { status, data } = await requestJson(`${ALLEGRO_API_URL}/sale/product-offers/${encodeURIComponent(offerId)}`, { headers: allegroHeaders(token) }, true);
      if (status === 404) continue;
      const stockAvailable = toNonNegativeInteger(data?.stock?.available);
      if (stockAvailable === null) continue;

      const localOffer = await prisma.allegroOffer.findUnique({
        where: { allegroOfferId: offerId },
        select: {
          id: true,
          accountId: true,
          catalogProductId: true,
          stockQuantity: true,
          quantity: true,
          status: true,
          publicationStatus: true,
        },
      });

      candidates.push({
        offerId,
        account: source,
        title: data?.name || listed.get(offerId)?.name || null,
        publicationStatus: data?.publication?.status || listed.get(offerId)?.publication?.status || null,
        stockAvailable,
        localOffer,
      });
    } catch (error: any) {
      errors.push({ source: 'sale.product-offers', accountId: account.id, offerId, httpStatus: error.status || null, message: error.message });
    }
  }

  return { account: source, candidates, errors };
}

function chooseUniqueCandidates(candidates: ImportCandidate[]): ImportCandidate[] {
  const byOfferId = new Map<string, ImportCandidate>();
  for (const candidate of candidates) {
    const existing = byOfferId.get(candidate.offerId);
    if (!existing) {
      byOfferId.set(candidate.offerId, candidate);
      continue;
    }

    const existingMapped = Boolean(existing.localOffer?.catalogProductId);
    const candidateMapped = Boolean(candidate.localOffer?.catalogProductId);
    if (!existingMapped && candidateMapped) {
      byOfferId.set(candidate.offerId, candidate);
    }
  }
  return Array.from(byOfferId.values()).sort((a, b) => a.offerId.localeCompare(b.offerId));
}

async function resolveWarehouseId(args: Args): Promise<string> {
  if (args.warehouseId) return args.warehouseId;
  if (process.env.DEFAULT_WAREHOUSE_ID) return process.env.DEFAULT_WAREHOUSE_ID;

  const { data } = await requestJson(`${WAREHOUSE_SERVICE_URL}/api/warehouses`, { headers: warehouseHeaders() });
  const warehouses = Array.isArray(data?.data) ? data.data : [];
  const firstActive = warehouses.find((warehouse: any) => warehouse?.isActive !== false) || warehouses[0];
  if (!firstActive?.id) throw new Error('Unable to resolve Warehouse id. Provide --warehouse-id or DEFAULT_WAREHOUSE_ID.');
  return firstActive.id;
}

async function setWarehouseStock(productId: string, warehouseId: string, quantity: number, offerId: string): Promise<{ status: number; data: any }> {
  return requestJson(`${WAREHOUSE_SERVICE_URL}/api/stock/set`, {
    method: 'POST',
    headers: warehouseHeaders(),
    body: JSON.stringify({
      productId,
      warehouseId,
      quantity,
      reasonCode: REASON_CODE,
      reference: `allegro-offer:${offerId}`,
    }),
  });
}

async function getWarehouseTotalAvailable(productId: string): Promise<number | null> {
  const { data } = await requestJson(`${WAREHOUSE_SERVICE_URL}/api/stock/${encodeURIComponent(productId)}/total`, {
    headers: warehouseHeaders(),
  });
  const value = data?.data?.totalAvailable;
  const parsed = Number(value);
  return Number.isFinite(parsed) ? Math.floor(parsed) : null;
}

async function processCandidate(candidate: ImportCandidate, args: Args, warehouseId: string | null): Promise<CandidateResult> {
  const catalogProductId = candidate.localOffer?.catalogProductId || null;
  const base: CandidateResult = {
    offerId: candidate.offerId,
    accountId: candidate.account.accountId,
    accountName: candidate.account.accountName,
    title: candidate.title,
    publicationStatus: candidate.publicationStatus,
    catalogProductId,
    allegroStockAvailable: candidate.stockAvailable,
    previousLocalStock: candidate.localOffer ? Number(candidate.localOffer.stockQuantity || 0) : null,
    warehouseId,
    action: 'skipped',
  };

  if (!candidate.localOffer) {
    return { ...base, skippedReason: 'missing_local_allegro_offer_mapping' };
  }
  if (!catalogProductId) {
    return { ...base, skippedReason: 'missing_catalog_product_mapping' };
  }

  let warehouseTotalAvailable: number | null | undefined;
  let warehouseMatchesAllegro: boolean | null | undefined;
  if (args.verifyWarehouse) {
    try {
      warehouseTotalAvailable = await getWarehouseTotalAvailable(catalogProductId);
      warehouseMatchesAllegro = warehouseTotalAvailable === candidate.stockAvailable;
    } catch (error: any) {
      return {
        ...base,
        action: 'skipped',
        skippedReason: 'warehouse_verify_failed',
        error: error?.message || String(error),
      };
    }
  }

  if (!args.apply) {
    return { ...base, action: 'would_set_warehouse_stock', warehouseTotalAvailable, warehouseMatchesAllegro };
  }
  if (!warehouseId) {
    return { ...base, skippedReason: 'missing_warehouse_id' };
  }

  try {
    const warehouseResponse = await setWarehouseStock(catalogProductId, warehouseId, candidate.stockAvailable, candidate.offerId);
    return {
      ...base,
      action: 'set_warehouse_stock',
      warehouseStatus: warehouseResponse.status,
      warehouseResponse: warehouseResponse.data?.data ? {
        productId: warehouseResponse.data.data.productId,
        warehouseId: warehouseResponse.data.data.warehouseId,
        quantity: warehouseResponse.data.data.quantity,
        reserved: warehouseResponse.data.data.reserved,
        available: warehouseResponse.data.data.available,
      } : null,
      warehouseTotalAvailable,
      warehouseMatchesAllegro,
    };
  } catch (error: any) {
    return {
      ...base,
      action: 'skipped',
      skippedReason: 'apply_failed',
      error: error?.message || String(error),
    };
  }
}

async function main(): Promise<void> {
  ensureDatabaseUrl();
  const args = parseArgs(process.argv.slice(2));
  if (args.help) {
    printHelp();
    return;
  }

  const accounts = await resolveAccounts(args);
  if (!accounts.length) throw new Error('No matching Allegro accounts found.');

  const accountReports: any[] = [];
  const allCandidates: ImportCandidate[] = [];
  const errors: any[] = [];
  for (const account of accounts) {
    const collected = await collectCandidates(account, args);
    allCandidates.push(...collected.candidates);
    errors.push(...collected.errors);
    accountReports.push({
      ...collected.account,
      stockAuthoritativeCandidates: collected.candidates.length,
      errors: collected.errors.length,
    });
  }

  const uniqueCandidates = chooseUniqueCandidates(allCandidates);
  const duplicateAuthoritativeAppearances = Math.max(0, allCandidates.length - uniqueCandidates.length);
  const warehouseId = args.apply ? await resolveWarehouseId(args) : (args.warehouseId || process.env.DEFAULT_WAREHOUSE_ID || null);

  const results: CandidateResult[] = [];
  for (const candidate of uniqueCandidates) {
    results.push(await processCandidate(candidate, args, warehouseId));
  }

  const summary = results.reduce((acc, result) => {
    acc.stockAuthoritativeTotal += result.allegroStockAvailable;
    if (result.action === 'would_set_warehouse_stock') acc.wouldSet += 1;
    if (result.action === 'set_warehouse_stock') acc.applied += 1;
    if (result.skippedReason === 'missing_local_allegro_offer_mapping') acc.missingLocalOffer += 1;
    if (result.skippedReason === 'missing_catalog_product_mapping') acc.missingCatalogMapping += 1;
    if (result.skippedReason === 'apply_failed') acc.applyFailed += 1;
    if (result.skippedReason === 'warehouse_verify_failed') acc.warehouseVerifyFailed += 1;
    if (result.warehouseMatchesAllegro === true) acc.warehouseMatches += 1;
    if (result.warehouseMatchesAllegro === false) acc.warehouseMismatches += 1;
    return acc;
  }, {
    stockAuthoritativeTotal: 0,
    wouldSet: 0,
    applied: 0,
    missingLocalOffer: 0,
    missingCatalogMapping: 0,
    applyFailed: 0,
    warehouseMatches: 0,
    warehouseMismatches: 0,
    warehouseVerifyFailed: 0,
  });

  console.log(JSON.stringify({
    status: summary.applyFailed > 0 ? 'completed_with_errors' : 'ok',
    generatedAt: new Date().toISOString(),
    source: 'allegro-current-stock-warehouse-import.v1',
    mode: args.apply ? 'apply' : 'dry-run',
    mutatesWarehouse: args.apply,
    mutatesLocalAllegroOffer: args.refreshToken,
    verifiesWarehouse: args.verifyWarehouse,
    refreshesOauthTokens: args.refreshToken,
    apiBaseUrl: ALLEGRO_API_URL,
    warehouseServiceUrl: WAREHOUSE_SERVICE_URL,
    publicationStatuses: args.publicationStatuses,
    detailLimit: args.detailLimit,
    warehouseId,
    reasonCode: REASON_CODE,
    applyConfirmationRequired: args.apply ? APPLY_CONFIRMATION : null,
    accountCount: accounts.length,
    listedStockSource: '/sale/offers is used only to discover offer ids.',
    stockAuthority: '/sale/product-offers/{offerId}.stock.available',
    totals: {
      stockAuthoritativeAppearances: allCandidates.length,
      uniqueStockAuthoritativeOffers: uniqueCandidates.length,
      duplicateStockAuthoritativeAppearances: duplicateAuthoritativeAppearances,
      ...summary,
    },
    accounts: accountReports,
    results,
    errors,
  }, null, 2));
}

main()
  .catch((error) => {
    console.error(JSON.stringify({ status: 'error', message: error?.message || String(error) }, null, 2));
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
