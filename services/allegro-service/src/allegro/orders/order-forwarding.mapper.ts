export interface AllegroForwardingOffer {
  id?: string;
  allegroOfferId: string;
  catalogProductId?: string | null;
  accountId?: string | null;
  title?: string | null;
}

export interface ForwardedOrderItem {
  productId: string;
  sku: string | null;
  title: string;
  quantity: number;
  unitPrice: number;
  totalPrice: number;
  warehouseId: string;
}

export interface ForwardedOrderPayload {
  externalOrderId: string;
  channel: "allegro";
  channelAccountId?: string;
  customer: {
    email?: string;
    login?: string;
  };
  shippingAddress: {
    name?: string;
    street: string;
    city: string;
    postalCode: string;
    country: string;
  };
  shippingMethod: string;
  items: ForwardedOrderItem[];
  subtotal: number;
  shippingCost: number;
  taxAmount: number;
  total: number;
  currency: string;
  paymentStatus?: string;
  orderedAt: Date;
}

export interface OrderForwardingBuildResult {
  orderData: ForwardedOrderPayload | null;
  blockedReasons: string[];
  missingOfferIds: string[];
  missingCatalogOfferIds: string[];
  lineOfferIds: string[];
}

export interface OrderForwardingBuildOptions {
  warehouseId?: string | null;
}

function parseMoney(value: any, fallback = 0): number {
  const amount = typeof value === "object" && value !== null ? value.amount : value;
  const parsed = parseFloat(String(amount ?? fallback));
  return Number.isFinite(parsed) ? parsed : fallback;
}

function getOrderTotal(allegroOrder: any): { amount: number; currency: string } {
  const total = allegroOrder?.totalPrice || allegroOrder?.summary?.totalToPay || {};
  return {
    amount: parseMoney(total),
    currency: total.currency || "PLN",
  };
}

export function getAllegroLineOfferIds(lineItems: any[] = []): string[] {
  return Array.from(new Set(
    lineItems
      .map((item) => String(item?.offer?.id || "").trim())
      .filter((offerId) => offerId.length > 0),
  ));
}

function normalizeWarehouseId(warehouseId?: string | null): string | null {
  const normalized = warehouseId?.trim();
  return normalized || null;
}

function normalizeOptionalString(value: unknown): string | null {
  if (value === undefined || value === null) return null;
  const normalized = String(value).trim();
  return normalized || null;
}

function resolveShippingMethod(allegroOrder: any): string | null {
  const method = allegroOrder?.delivery?.method || {};
  return (
    normalizeOptionalString(method.name) ||
    normalizeOptionalString(method.id) ||
    normalizeOptionalString(method.carrierId) ||
    normalizeOptionalString(allegroOrder?.deliveryMethod)
  );
}

function resolveDeliveryAddress(allegroOrder: any): ForwardedOrderPayload["shippingAddress"] | null {
  const address = allegroOrder?.delivery?.address || allegroOrder?.buyer?.address || allegroOrder?.deliveryAddress || {};
  const street = (
    normalizeOptionalString(address.street) ||
    normalizeOptionalString(address.addressLine1) ||
    normalizeOptionalString(address.line1) ||
    [normalizeOptionalString(address.streetName), normalizeOptionalString(address.streetNumber)].filter(Boolean).join(" ") ||
    null
  );
  const city = normalizeOptionalString(address.city);
  const postalCode = normalizeOptionalString(address.postalCode) || normalizeOptionalString(address.zipCode) || normalizeOptionalString(address.postCode);
  const country = normalizeOptionalString(address.countryCode) || normalizeOptionalString(address.country);

  if (!street || !city || !postalCode || !country) {
    return null;
  }

  return {
    name: normalizeOptionalString(address.name) || normalizeOptionalString(allegroOrder?.buyer?.login) || undefined,
    street,
    city,
    postalCode,
    country,
  };
}

export function buildOrderForwardingPayload(
  allegroOrder: any,
  offersByAllegroOfferId: Map<string, AllegroForwardingOffer>,
  options: OrderForwardingBuildOptions = {},
): OrderForwardingBuildResult {
  const warehouseId = normalizeWarehouseId(options.warehouseId);
  const lineItems = allegroOrder?.lineItems || [];
  const blockedReasons: string[] = [];
  const missingOfferIds: string[] = [];
  const missingCatalogOfferIds: string[] = [];
  const lineOfferIds = getAllegroLineOfferIds(lineItems);

  if (lineItems.length === 0) {
    blockedReasons.push("missing_line_items");
  }

  const items: ForwardedOrderItem[] = [];

  for (const [index, item] of lineItems.entries()) {
    const allegroOfferId = String(item?.offer?.id || "").trim();

    if (!allegroOfferId) {
      blockedReasons.push(`missing_offer:line_${index}_missing_offer_id`);
      continue;
    }

    const offer = offersByAllegroOfferId.get(allegroOfferId);
    if (!offer) {
      blockedReasons.push(`missing_offer:line_${index}_missing_offer_mapping`);
      missingOfferIds.push(allegroOfferId);
      continue;
    }

    if (!offer.catalogProductId) {
      blockedReasons.push(`missing_catalog_product:line_${index}_missing_catalog_product_id`);
      missingCatalogOfferIds.push(allegroOfferId);
      continue;
    }

    if (!warehouseId) {
      blockedReasons.push(`[MISSING: warehouseId]:line_${index}_missing_warehouse_id`);
      continue;
    }

    const quantity = item?.quantity || 1;
    const unitPrice = parseMoney(item?.price);

    items.push({
      productId: offer.catalogProductId,
      sku: null,
      title: item?.offer?.name || offer.title || "Product",
      quantity,
      unitPrice,
      totalPrice: unitPrice * quantity,
      warehouseId,
    });
  }

  if (blockedReasons.length > 0) {
    return {
      orderData: null,
      blockedReasons,
      missingOfferIds: Array.from(new Set(missingOfferIds)),
      missingCatalogOfferIds: Array.from(new Set(missingCatalogOfferIds)),
      lineOfferIds,
    };
  }

  const shippingMethod = resolveShippingMethod(allegroOrder);
  if (!shippingMethod) {
    return {
      orderData: null,
      blockedReasons: ["missing_shipping_method"],
      missingOfferIds: [],
      missingCatalogOfferIds: [],
      lineOfferIds,
    };
  }

  const shippingAddress = resolveDeliveryAddress(allegroOrder);
  if (!shippingAddress) {
    return {
      orderData: null,
      blockedReasons: ["missing_delivery_address"],
      missingOfferIds: [],
      missingCatalogOfferIds: [],
      lineOfferIds,
    };
  }

  const firstMappedOffer = lineItems
    .map((item: any) => offersByAllegroOfferId.get(String(item?.offer?.id || "").trim()))
    .find((offer: AllegroForwardingOffer | undefined) => !!offer);
  const orderTotal = getOrderTotal(allegroOrder);

  return {
    orderData: {
      externalOrderId: allegroOrder.id,
      channel: "allegro",
      channelAccountId: firstMappedOffer?.accountId || undefined,
      customer: {
        email: allegroOrder?.buyer?.email,
        login: allegroOrder?.buyer?.login,
      },
      shippingAddress,
      shippingMethod,
      items,
      subtotal: orderTotal.amount,
      shippingCost: 0,
      taxAmount: 0,
      total: orderTotal.amount,
      currency: orderTotal.currency,
      paymentStatus: allegroOrder?.payment?.status || (allegroOrder?.payment?.finishedAt ? "PAID" : undefined),
      orderedAt: new Date(allegroOrder?.createdAt || lineItems[0]?.boughtAt || Date.now()),
    },
    blockedReasons: [],
    missingOfferIds: [],
    missingCatalogOfferIds: [],
    lineOfferIds,
  };
}
