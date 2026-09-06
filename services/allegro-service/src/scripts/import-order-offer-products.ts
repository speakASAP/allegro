import * as crypto from 'crypto';
import * as path from 'path';
import { buildScriptSafety, redactedError, requireBooleanConfirmation, requireExactConfirmation } from './lib/script-safety';

// eslint-disable-next-line @typescript-eslint/no-var-requires
const { PrismaClient } = require(path.resolve(process.cwd(), '../../shared/node_modules/.prisma/client'));

type Args = {
  accountId?: string;
  accountName?: string;
  userId?: string;
  apply: boolean;
  applyLocalProjection: boolean;
  confirmLocalOnly: boolean;
  confirmCatalogApply?: string;
  limit?: number;
  language: string;
  help: boolean;
  searchCatalog: boolean;
};

type SourceAttempt = {
  source: string;
  url?: string;
  status?: number;
  ok: boolean;
  message?: string;
  keys?: string[];
  summary?: Record<string, unknown>;
};

type ImportMode = 'dry-run' | 'local-projection' | 'catalog-apply';

type OfferEvidence = {
  offerId: string;
  title: string;
  externalId?: string | null;
  lineItems: any[];
  checkoutFormIds: string[];
  fullOffer?: any;
  catalogCandidates: any[];
  attempts: SourceAttempt[];
};

type NormalizedProduct = {
  offerId: string;
  sku: string;
  title: string;
  description: string | null;
  categoryId: string | null;
  price: number | null;
  currency: string;
  stockQuantity: number | null;
  images: string[];
  brand: string | null;
  manufacturer: string | null;
  ean: string | null;
  parameters: any[];
  sourceQuality: 'full-offer' | 'catalog-candidate' | 'order-line-item-only';
  rawSource: any;
};

const prisma = new PrismaClient();
const ALLEGRO_API_URL = process.env.ALLEGRO_API_URL || 'https://api.allegro.pl';
const CATALOG_SERVICE_URL = process.env.CATALOG_SERVICE_URL || 'http://catalog-microservice:3200';
// Per-pair RS256 principal for allegro-service -> catalog-microservice, role
// internal:catalog-microservice:write. There is deliberately no fallback to the
// former CATALOG_INTERNAL_SERVICE_TOKEN / INTERNAL_SERVICE_TOKEN: that was a
// shared static secret paired with a self-asserted x-service-name header, the
// shape SERVICE_IDENTITY_CONSUMER_STANDARD.md prohibits. Keeping it as a
// fallback would silently restore the prohibited path whenever the bearer is
// missing or rejected -- and a credential that fails over to a working legacy
// path fails invisibly.
const CATALOG_TOKEN = process.env.CATALOG_SERVICE_TOKEN;
const CATALOG_APPLY_CONFIRMATION = 'ALLEGRO_ORDER_OFFER_CATALOG_IMPORT';

function printHelp(): void {
  console.log(`Import products from Allegro order checkout forms.

Usage:
  npm run import:order-offers:catalog -- --account-name statexcz --dry-run
  npm run import:order-offers:catalog -- --account-name statexcz --apply-local-projection --confirm-local-only
  npm run import:order-offers:catalog -- --account-id <uuid> --apply --confirm-catalog-apply ${CATALOG_APPLY_CONFIRMATION}

Options:
  --account-name <name>   Allegro account name. Use --account-id when ambiguous.
  --account-id <uuid>     Allegro account id.
  --user-id <uuid>        Restrict account-name lookup to this user.
  --apply-local-projection
                          Persist only local AllegroOffer rows from recovered order-offer evidence.
  --confirm-local-only    Required with --apply-local-projection.
  --apply                 Persist Catalog products, media, pricing, marketplace profile, and local AllegroOffer rows.
  --confirm-catalog-apply <${CATALOG_APPLY_CONFIRMATION}>
                          Required with --apply. Catalog writes remain owner-approved and guarded.
  --dry-run               Only fetch and print a report. Default.
  --limit <n>             Limit unique offers for investigation.
  --language <tag>        Allegro product search language. Default: cs-CZ.
  --no-catalog-search     Skip /sale/products phrase search candidates.
`);
}

function parseArgs(argv: string[]): Args {
  const args: Args = { apply: false, applyLocalProjection: false, confirmLocalOnly: false, help: false, language: 'cs-CZ', searchCatalog: true };
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
    else if (arg === '--user-id') args.userId = next();
    else if (arg === '--apply') args.apply = true;
    else if (arg === '--apply-local-projection') args.applyLocalProjection = true;
    else if (arg === '--confirm-local-only') args.confirmLocalOnly = true;
    else if (arg === '--confirm-catalog-apply') args.confirmCatalogApply = next();
    else if (arg === '--dry-run') args.apply = false;
    else if (arg === '--limit') args.limit = Number(next());
    else if (arg === '--language') args.language = next();
    else if (arg === '--no-catalog-search') args.searchCatalog = false;
    else throw new Error(`Unknown argument: ${arg}`);
  }
  return args;
}

function resolveImportMode(args: Args): ImportMode {
  if (args.apply && args.applyLocalProjection) {
    throw new Error('Choose only one apply mode: --apply-local-projection or --apply.');
  }
  if (args.applyLocalProjection) {
    return 'local-projection';
  }
  if (args.apply) {
    return 'catalog-apply';
  }
  return 'dry-run';
}

function buildImportSafety(mode: ImportMode): Record<string, unknown> {
  const catalogApply = mode === 'catalog-apply';
  const localApply = mode === 'local-projection';
  return buildScriptSafety({
    mode: mode === 'dry-run' ? 'dry-run' : 'apply',
    mutates: mode !== 'dry-run',
    mutatesLocalAllegroProjection: localApply || catalogApply,
    mutatesCatalog: catalogApply,
    mutatesWarehouse: false,
    mutatesOrders: false,
    mutatesAllegro: false,
    forwardsOrders: false,
    writesAllowed: localApply
      ? ['allegro_offers']
      : catalogApply
        ? ['catalog-microservice', 'allegro_offers']
        : [],
    writesForbidden: catalogApply
      ? ['orders-microservice', 'warehouse-microservice', 'allegro-write-api', 'bizbox-import']
      : ['orders-microservice', 'catalog-microservice', 'warehouse-microservice', 'allegro-write-api', 'bizbox-import'],
    ...(localApply
      ? { confirmation: { flag: '--confirm-local-only', satisfied: true } }
      : catalogApply
        ? { confirmation: { flag: '--confirm-catalog-apply', expected: CATALOG_APPLY_CONFIRMATION, satisfied: true } }
        : {}),
  });
}

function decrypt(value: string): string {
  const key = process.env.ENCRYPTION_KEY;
  if (!key || key.length < 32) throw new Error('ENCRYPTION_KEY must be configured and at least 32 characters.');
  const parts = String(value || '').split(':');
  if (parts.length !== 2) throw new Error('Invalid encrypted token format.');
  const decipher = crypto.createDecipheriv('aes-256-cbc', Buffer.from(key.slice(0, 32), 'utf8'), Buffer.from(parts[0], 'hex'));
  return decipher.update(parts[1], 'hex', 'utf8') + decipher.final('utf8');
}

function catalogHeaders(): Record<string, string> {
  if (!CATALOG_TOKEN) {
    // Fail loudly rather than sending an unauthenticated request. Without this
    // the missing credential surfaced as a 401 from catalog on every call,
    // which reads like a broken principal rather than an unset variable.
    throw new Error(
      'CATALOG_SERVICE_TOKEN is not set. It is the per-pair principal for ' +
        'allegro-service -> catalog-microservice, delivered Vault -> ExternalSecret -> ' +
        'Secret -> secretKeyRef. There is no legacy fallback.',
    );
  }
  return {
    'content-type': 'application/json',
    authorization: `Bearer ${CATALOG_TOKEN}`,
  };
}

function allegroHeaders(token: string, language = 'cs-CZ'): Record<string, string> {
  return {
    Authorization: `Bearer ${token}`,
    Accept: 'application/vnd.allegro.public.v1+json',
    'Accept-Language': language,
  };
}

async function requestJson(url: string, options: any = {}, allow404 = false): Promise<{ status: number; data: any }> {
  const response = await fetch(url, options);
  const text = await response.text();
  let data: any = null;
  try { data = text ? JSON.parse(text) : null; } catch { data = { raw: text.slice(0, 1000) }; }
  if (!response.ok && !(allow404 && response.status === 404)) {
    const message = data?.errors?.[0]?.userMessage || data?.errors?.[0]?.message || data?.error?.message || data?.message || response.statusText;
    throw Object.assign(new Error(`${response.status} ${message}`), { status: response.status, data });
  }
  return { status: response.status, data };
}

async function resolveAccount(args: Args): Promise<any> {
  const select = { id: true, userId: true, name: true, accessToken: true, tokenExpiresAt: true, isActive: true } as const;
  if (args.accountId) {
    const account = await prisma.allegroAccount.findUnique({ where: { id: args.accountId }, select });
    if (!account) throw new Error(`Account not found: ${args.accountId}`);
    return account;
  }
  if (!args.accountName) throw new Error('Provide --account-id or --account-name.');
  const accounts = await prisma.allegroAccount.findMany({
    where: { name: { equals: args.accountName, mode: 'insensitive' }, ...(args.userId ? { userId: args.userId } : {}) },
    select,
    orderBy: [{ isActive: 'desc' }, { updatedAt: 'desc' }],
  });
  if (accounts.length === 0) throw new Error(`Account not found by name: ${args.accountName}`);
  if (accounts.length > 1 && !accounts[0].isActive) {
    throw new Error(`Account name is ambiguous. Use --account-id. Matches: ${accounts.map((a: any) => `${a.name}:${a.id}:${a.userId}:active=${a.isActive}`).join(', ')}`);
  }
  return accounts[0];
}

function compactCheckoutForm(form: any): any {
  return {
    id: form.id,
    status: form.status,
    fulfillment: form.fulfillment,
    marketplace: form.marketplace,
    summary: form.summary,
    updatedAt: form.updatedAt,
    revision: form.revision,
  };
}

async function collectCheckoutEvidence(token: string, args: Args): Promise<Map<string, OfferEvidence>> {
  const offers = new Map<string, OfferEvidence>();
  let offset = 0;
  const pageSize = 100;
  while (true) {
    const listUrl = `${ALLEGRO_API_URL}/order/checkout-forms?limit=${pageSize}&offset=${offset}`;
    const { data } = await requestJson(listUrl, { headers: allegroHeaders(token, args.language) });
    const forms = Array.isArray(data.checkoutForms) ? data.checkoutForms : [];
    for (const listedForm of forms) {
      const formUrl = `${ALLEGRO_API_URL}/order/checkout-forms/${listedForm.id}`;
      let form = listedForm;
      try {
        form = (await requestJson(formUrl, { headers: allegroHeaders(token, args.language) })).data;
      } catch (error: any) {
        form = listedForm;
      }
      const compactForm = compactCheckoutForm(form);
      for (const line of form.lineItems || []) {
        const offer = line.offer || {};
        const offerId = String(offer.id || '').trim();
        if (!offerId) continue;
        if (!offers.has(offerId)) {
          offers.set(offerId, {
            offerId,
            title: String(offer.name || `Allegro offer ${offerId}`),
            externalId: offer.external?.id || null,
            lineItems: [],
            checkoutFormIds: [],
            catalogCandidates: [],
            attempts: [{ source: 'order.checkout-form.detail', url: formUrl, status: 200, ok: true, keys: Object.keys(form) }],
          });
        }
        const evidence = offers.get(offerId)!;
        evidence.checkoutFormIds.push(form.id);
        evidence.lineItems.push({
          checkoutForm: compactForm,
          lineItem: {
            id: line.id,
            offer,
            quantity: line.quantity,
            originalPrice: line.originalPrice,
            price: line.price,
            tax: line.tax,
            discounts: line.discounts,
            boughtAt: line.boughtAt,
            selectedAdditionalServices: line.selectedAdditionalServices,
            vouchers: line.vouchers,
            deposit: line.deposit,
          },
        });
      }
    }
    if (args.limit && offers.size >= args.limit) break;
    if (forms.length < pageSize) break;
    offset += pageSize;
  }
  if (args.limit) {
    return new Map(Array.from(offers.entries()).slice(0, args.limit));
  }
  return offers;
}

function summarizePayload(data: any): Record<string, unknown> {
  return {
    keys: data && typeof data === 'object' ? Object.keys(data).slice(0, 40) : [],
    id: data?.id,
    name: data?.name,
    images: Array.isArray(data?.images) ? data.images.length : undefined,
    productSet: Array.isArray(data?.productSet) ? data.productSet.length : undefined,
    products: Array.isArray(data?.products) ? data.products.length : undefined,
  };
}

async function tryGet(url: string, source: string, token: string, evidence: OfferEvidence, language: string): Promise<any | null> {
  try {
    const { status, data } = await requestJson(url, { headers: allegroHeaders(token, language) }, true);
    const ok = status >= 200 && status < 300;
    evidence.attempts.push({ source, url, status, ok, keys: data && typeof data === 'object' ? Object.keys(data).slice(0, 30) : [], summary: summarizePayload(data), message: ok ? undefined : data?.errors?.[0]?.userMessage || data?.errors?.[0]?.message || data?.message });
    return ok ? data : null;
  } catch (error: any) {
    evidence.attempts.push({ source, url, status: error.status, ok: false, message: error.message });
    return null;
  }
}

async function enrichEvidence(token: string, evidence: OfferEvidence, args: Args): Promise<void> {
  evidence.fullOffer = await tryGet(`${ALLEGRO_API_URL}/sale/product-offers/${evidence.offerId}`, 'sale.product-offer', token, evidence, args.language);
  await tryGet(`${ALLEGRO_API_URL}/sale/product-offers/${evidence.offerId}/parts`, 'sale.product-offer.parts', token, evidence, args.language);
  await tryGet(`${ALLEGRO_API_URL}/sale/offers/${evidence.offerId}`, 'sale.offers.legacy', token, evidence, args.language);
  if (args.searchCatalog) {
    const byOfferId = await tryGet(`${ALLEGRO_API_URL}/sale/products?phrase=${encodeURIComponent(evidence.offerId)}&language=${encodeURIComponent(args.language)}`, 'sale.products.by-offer-id', token, evidence, args.language);
    const byTitle = await tryGet(`${ALLEGRO_API_URL}/sale/products?phrase=${encodeURIComponent(evidence.title)}&language=${encodeURIComponent(args.language)}`, 'sale.products.by-title', token, evidence, args.language);
    evidence.catalogCandidates = [
      ...(Array.isArray(byOfferId?.products) ? byOfferId.products : []),
      ...(Array.isArray(byTitle?.products) ? byTitle.products : []),
    ];
  }
}

function firstText(...values: any[]): string | null {
  for (const value of values) {
    if (typeof value === 'string' && value.trim()) return value.trim();
  }
  return null;
}

function descriptionToText(description: any): string | null {
  if (!description) return null;
  if (typeof description === 'string') return description.trim() || null;
  const chunks: string[] = [];
  for (const section of description.sections || []) {
    for (const item of section.items || []) {
      if (item.type === 'TEXT' && item.content) {
        chunks.push(String(item.content).replace(/<[^>]*>/g, ' ').replace(/\s+/g, ' ').trim());
      }
    }
  }
  return chunks.filter(Boolean).join('\n\n') || null;
}

function collectImages(...sources: any[]): string[] {
  const urls: string[] = [];
  const visit = (value: any) => {
    if (!value) return;
    if (typeof value === 'string') urls.push(value);
    else if (Array.isArray(value)) value.forEach(visit);
    else if (typeof value === 'object') {
      if (typeof value.url === 'string') urls.push(value.url);
      if (typeof value.path === 'string') urls.push(value.path);
      if (value.productSet) visit(value.productSet);
      if (value.product?.images) visit(value.product.images);
      if (value.images) visit(value.images);
    }
  };
  sources.forEach(visit);
  return Array.from(new Set(urls.map((url) => String(url).trim()).filter(Boolean))).slice(0, 16);
}

function parameterValue(parameters: any[], ids: string[], names: string[]): string | null {
  const normalizedNames = names.map((name) => name.toLowerCase());
  const param = (parameters || []).find((item) => ids.includes(String(item?.id || item?.parameterId || '')) || normalizedNames.includes(String(item?.name || '').toLowerCase()));
  if (!param) return null;
  const value = Array.isArray(param.values) ? param.values[0] : Array.isArray(param.valuesLabels) ? param.valuesLabels[0] : param.value;
  if (typeof value === 'string') return value.trim() || null;
  if (value && typeof value.name === 'string') return value.name.trim() || null;
  return null;
}

function scoreCandidate(candidate: any, title: string): number {
  const name = String(candidate?.name || '').toLowerCase();
  const target = title.toLowerCase();
  let score = 0;
  if (name === target) score += 100;
  if (target && name.includes(target.slice(0, Math.min(target.length, 32)))) score += 40;
  if (candidate?.images?.length) score += Math.min(candidate.images.length, 10);
  if (candidate?.parameters?.length) score += 5;
  return score;
}

function normalizeProduct(evidence: OfferEvidence): NormalizedProduct {
  const full = evidence.fullOffer;
  const bestCandidate = evidence.catalogCandidates.slice().sort((a, b) => scoreCandidate(b, evidence.title) - scoreCandidate(a, evidence.title))[0] || null;
  const source = full || bestCandidate || null;
  const productSet = Array.isArray(full?.productSet) ? full.productSet[0] : null;
  const product = productSet?.product || bestCandidate || {};
  const parameters = [
    ...(Array.isArray(full?.parameters) ? full.parameters : []),
    ...(Array.isArray(product?.parameters) ? product.parameters : []),
    ...(Array.isArray(bestCandidate?.parameters) ? bestCandidate.parameters : []),
  ];
  const firstLine = evidence.lineItems[0]?.lineItem || {};
  const price = Number(full?.sellingMode?.price?.amount || firstLine.price?.amount || firstLine.originalPrice?.amount || 0);
  const currency = String(full?.sellingMode?.price?.currency || firstLine.price?.currency || firstLine.originalPrice?.currency || 'CZK').toUpperCase();
  const stock = full?.stock?.available;
  const sourceQuality: NormalizedProduct['sourceQuality'] = full ? 'full-offer' : bestCandidate ? 'catalog-candidate' : 'order-line-item-only';
  const title = firstText(full?.name, evidence.title, product?.name, bestCandidate?.name) || `Allegro offer ${evidence.offerId}`;
  return {
    offerId: evidence.offerId,
    sku: `ALLEGRO-OFFER-${evidence.offerId}`,
    title,
    description: descriptionToText(full?.description),
    categoryId: firstText(full?.category?.id, product?.category?.id, bestCandidate?.category?.id),
    price: Number.isFinite(price) && price > 0 ? price : null,
    currency,
    stockQuantity: Number.isFinite(Number(stock)) ? Number(stock) : null,
    images: collectImages(full, product, bestCandidate),
    brand: parameterValue(parameters, ['248811'], ['Značka', 'Brand', 'Výrobce']) || product?.brand || null,
    manufacturer: parameterValue(parameters, ['224017'], ['Kód výrobce', 'Manufacturer code', 'Model']) || product?.manufacturerCode || null,
    ean: parameterValue(parameters, ['225693'], ['EAN (GTIN)', 'EAN', 'GTIN']),
    parameters,
    sourceQuality,
    rawSource: { fullOffer: full || null, bestCatalogCandidate: bestCandidate || null, orderEvidence: evidence.lineItems, attempts: evidence.attempts },
  };
}

async function catalogGetBySku(sku: string): Promise<any | null> {
  const { status, data } = await requestJson(`${CATALOG_SERVICE_URL}/api/products/sku/${encodeURIComponent(sku)}`, { headers: catalogHeaders() }, true);
  if (status === 404 || !data?.success) return null;
  return data.data || null;
}

async function catalogSearchByEan(ean: string | null): Promise<any | null> {
  if (!ean) return null;
  try {
    const { data } = await requestJson(`${CATALOG_SERVICE_URL}/api/products?search=${encodeURIComponent(ean)}&page=1&limit=25`, { headers: catalogHeaders() });
    return (data.data || []).find((item: any) => String(item?.ean || '').trim() === ean) || null;
  } catch { return null; }
}

async function upsertCatalog(product: NormalizedProduct): Promise<any> {
  const existing = await catalogGetBySku(product.sku) || await catalogSearchByEan(product.ean);
  const tags = Array.from(new Set([
    ...(Array.isArray(existing?.tags) ? existing.tags : []),
    'source:allegro',
    'source:allegro-orders',
    `source-quality:${product.sourceQuality}`,
    `allegro-offer:${product.offerId}`,
  ]));
  const payload = {
    sku: existing?.sku || product.sku,
    title: existing?.title || product.title,
    description: existing?.description || product.description || undefined,
    brand: existing?.brand || product.brand || undefined,
    manufacturer: existing?.manufacturer || product.manufacturer || undefined,
    ean: product.ean || undefined,
    isActive: true,
    lifecycle: 'active',
    tags,
  };
  const method = existing ? 'PUT' : 'POST';
  const url = existing ? `${CATALOG_SERVICE_URL}/api/products/${existing.id}` : `${CATALOG_SERVICE_URL}/api/products`;
  const { data } = await requestJson(url, { method, headers: catalogHeaders(), body: JSON.stringify(payload) });
  return data.data;
}

async function syncMedia(catalogProductId: string, product: NormalizedProduct): Promise<number> {
  if (!product.images.length) return 0;
  let existing: any[] = [];
  try { existing = (await requestJson(`${CATALOG_SERVICE_URL}/api/media/product/${catalogProductId}`, { headers: catalogHeaders() })).data.data || []; } catch { existing = []; }
  const seen = new Set(existing.map((item) => item.url).filter(Boolean));
  let created = 0;
  for (const [index, url] of product.images.entries()) {
    if (seen.has(url)) continue;
    await requestJson(`${CATALOG_SERVICE_URL}/api/media`, {
      method: 'POST',
      headers: catalogHeaders(),
      body: JSON.stringify({ productId: catalogProductId, type: 'image', url, thumbnailUrl: null, altText: product.title, title: 'Allegro image', position: index, isPrimary: index === 0 && !existing.some((item) => item.isPrimary), metadata: { source: 'allegro-orders', sourceQuality: product.sourceQuality, sku: product.sku } }),
    });
    seen.add(url);
    created += 1;
  }
  return created;
}

async function syncPricing(catalogProductId: string, product: NormalizedProduct): Promise<boolean> {
  if (!product.price) return false;
  await requestJson(`${CATALOG_SERVICE_URL}/api/pricing`, {
    method: 'POST',
    headers: catalogHeaders(),
    body: JSON.stringify({ productId: catalogProductId, basePrice: product.price, currency: product.currency, priceType: 'regular', isActive: true, validFrom: new Date().toISOString() }),
  });
  return true;
}

async function syncMarketplace(catalogProductId: string, product: NormalizedProduct): Promise<void> {
  await requestJson(`${CATALOG_SERVICE_URL}/api/products/${catalogProductId}/marketplace-fields/allegro`, {
    method: 'PUT',
    headers: catalogHeaders(),
    body: JSON.stringify({
      canonical: { title: product.title, description: product.description, brand: product.brand, manufacturer: product.manufacturer, ean: product.ean },
      overrides: { categoryId: product.categoryId, parameters: product.parameters, price: product.price, currency: product.currency, quantity: product.stockQuantity, images: product.images },
      externalRefs: { allegroOfferIds: [product.offerId], sku: product.sku, categoryIds: [product.categoryId].filter(Boolean) },
      sourceData: { importedAt: new Date().toISOString(), source: 'allegro-orders-extractor', sourceQuality: product.sourceQuality, ...product.rawSource },
      status: product.sourceQuality === 'full-offer' ? 'imported' : 'imported-partial',
    }),
  });
}

async function upsertLocalOffer(account: any, catalogProductId: string | null, product: NormalizedProduct): Promise<'created' | 'updated'> {
  const existing = await prisma.allegroOffer.findUnique({ where: { allegroOfferId: product.offerId }, select: { id: true } });
  const data = {
    ...(catalogProductId ? { catalogProductId } : {}),
    accountId: account.id,
    title: product.title,
    description: product.description,
    categoryId: product.categoryId || 'UNKNOWN',
    price: product.price || 0,
    currency: product.currency,
    quantity: 0,
    stockQuantity: product.stockQuantity || 0,
    status: product.sourceQuality === 'full-offer' ? (product.rawSource.fullOffer?.publication?.status || 'UNKNOWN') : 'ORDER_ITEM',
    publicationStatus: product.rawSource.fullOffer?.publication?.status || 'UNKNOWN',
    images: product.images,
    rawData: product.rawSource,
    syncStatus: 'SYNCED',
    syncSource: product.sourceQuality === 'full-offer' ? 'ALLEGRO_ORDERS' : product.sourceQuality === 'catalog-candidate' ? 'ALLEGRO_ORDERS_CATALOG_CANDIDATE' : 'ALLEGRO_ORDERS_MINIMAL',
    lastSyncedAt: new Date(),
  } as any;
  await prisma.allegroOffer.upsert({ where: { allegroOfferId: product.offerId }, update: data, create: { allegroOfferId: product.offerId, ...data } });
  return existing ? 'updated' : 'created';
}

async function main(): Promise<void> {
  const args = parseArgs(process.argv.slice(2));
  if (args.help) { printHelp(); return; }
  const mode = resolveImportMode(args);
  if (mode === 'local-projection') {
    requireBooleanConfirmation(args.confirmLocalOnly, '--apply-local-projection requires --confirm-local-only to prevent accidental Catalog/Warehouse/orders/Allegro writes.');
  }
  if (mode === 'catalog-apply') {
    requireExactConfirmation(args.confirmCatalogApply, CATALOG_APPLY_CONFIRMATION, '--confirm-catalog-apply');
  }
  const account = await resolveAccount(args);
  if (!account.accessToken) throw new Error(`Account ${account.id} has no OAuth access token.`);
  const token = decrypt(account.accessToken);
  const evidenceMap = await collectCheckoutEvidence(token, args);
  const stats: any = { mode, safety: buildImportSafety(mode), accountId: account.id, accountName: account.name, checkoutUniqueOffers: evidenceMap.size, sourceQuality: {}, created: 0, updated: 0, catalogSynced: 0, mediaCreated: 0, pricingSynced: 0, marketplaceSynced: 0, errors: [] };
  const report: any[] = [];
  for (const evidence of evidenceMap.values()) {
    await enrichEvidence(token, evidence, args);
    const product = normalizeProduct(evidence);
    stats.sourceQuality[product.sourceQuality] = (stats.sourceQuality[product.sourceQuality] || 0) + 1;
    const itemReport: any = { offerId: product.offerId, title: product.title, sourceQuality: product.sourceQuality, images: product.images.length, hasDescription: Boolean(product.description), ean: product.ean, categoryId: product.categoryId, attempts: evidence.attempts };
    try {
      if (mode === 'local-projection') {
        const result = await upsertLocalOffer(account, null, product);
        stats[result] += 1;
        itemReport.localProjection = result;
      } else if (mode === 'catalog-apply') {
        const catalogProduct = await upsertCatalog(product);
        stats.catalogSynced += 1;
        const mediaCreated = await syncMedia(catalogProduct.id, product);
        stats.mediaCreated += mediaCreated;
        if (await syncPricing(catalogProduct.id, product)) stats.pricingSynced += 1;
        await syncMarketplace(catalogProduct.id, product);
        stats.marketplaceSynced += 1;
        const result = await upsertLocalOffer(account, catalogProduct.id, product);
        stats[result] += 1;
        itemReport.catalogProductId = catalogProduct.id;
        itemReport.mediaCreated = mediaCreated;
      }
    } catch (error: any) {
      stats.errors.push({ offerId: product.offerId, message: error.message });
      itemReport.error = error.message;
    }
    report.push(itemReport);
    console.log(JSON.stringify(itemReport));
  }
  console.log(JSON.stringify({ done: true, stats, report }, null, 2));
}

main().catch((error) => {
  console.error(JSON.stringify({ done: false, ...redactedError(error) }, null, 2));
  process.exit(1);
}).finally(async () => {
  await prisma.$disconnect();
});
