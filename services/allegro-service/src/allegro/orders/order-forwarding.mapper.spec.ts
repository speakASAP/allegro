import { strict as assert } from "assert";
import {
  AllegroForwardingOffer,
  buildOrderForwardingPayload,
} from "./order-forwarding.mapper";

function offerMap(offers: AllegroForwardingOffer[]): Map<string, AllegroForwardingOffer> {
  return new Map(offers.map((offer) => [offer.allegroOfferId, offer]));
}

function syntheticOrder(lineItems: any[]) {
  return {
    id: "allegro-order-1",
    createdAt: "2026-06-26T10:00:00Z",
    buyer: {
      email: "synthetic@example.invalid",
      login: "synthetic-buyer",
    },
    lineItems,
    summary: {
      totalToPay: {
        amount: "42.00",
        currency: "PLN",
      },
    },
    payment: {
      finishedAt: "2026-06-26T10:01:00Z",
    },
    delivery: {
      method: { name: "Allegro Kurier" },
      address: {
        name: "Synthetic Buyer",
        street: "Main 1",
        city: "Warsaw",
        postalCode: "00-001",
        countryCode: "PL",
      },
    },
  };
}

async function testMultiLineOrderUsesEachLineOfferCatalogProductId() {
  const result = buildOrderForwardingPayload(
    syntheticOrder([
      { offer: { id: "allegro-offer-1", name: "First product" }, quantity: 1, price: { amount: "10.00" } },
      { offer: { id: "allegro-offer-2", name: "Second product" }, quantity: 2, price: { amount: "16.00" } },
    ]),
    offerMap([
      { allegroOfferId: "allegro-offer-1", catalogProductId: "11111111-1111-1111-1111-111111111111", accountId: "account-1", title: "Stored first" },
      { allegroOfferId: "allegro-offer-2", catalogProductId: "22222222-2222-2222-2222-222222222222", accountId: "account-1", title: "Stored second" },
    ]),
    { warehouseId: "warehouse-main" },
  );

  assert.deepEqual(result.blockedReasons, []);
  assert.equal(result.orderData?.items.length, 2);
  assert.equal(result.orderData?.items[0].productId, "11111111-1111-1111-1111-111111111111");
  assert.equal(result.orderData?.items[1].productId, "22222222-2222-2222-2222-222222222222");
  assert.equal(result.orderData?.items[1].totalPrice, 32);
  assert.equal(result.orderData?.total, 42);
  assert.equal(result.orderData?.items[0].warehouseId, "warehouse-main");
  assert.equal(result.orderData?.paymentStatus, "PAID");
  assert.equal(result.orderData?.shippingMethod, "Allegro Kurier");
  assert.equal(result.orderData?.shippingAddress.city, "Warsaw");
}

async function testMissingLineOfferMappingBlocksForwarding() {
  const result = buildOrderForwardingPayload(
    syntheticOrder([
      { offer: { id: "allegro-offer-1", name: "First product" }, quantity: 1, price: { amount: "10.00" } },
      { offer: { id: "allegro-offer-2", name: "Second product" }, quantity: 1, price: { amount: "12.00" } },
    ]),
    offerMap([
      { allegroOfferId: "allegro-offer-1", catalogProductId: "11111111-1111-1111-1111-111111111111", accountId: "account-1" },
    ]),
    { warehouseId: "warehouse-main" },
  );

  assert.equal(result.orderData, null);
  assert.ok(result.blockedReasons.includes("missing_offer:line_1_missing_offer_mapping"));
  assert.deepEqual(result.missingOfferIds, ["allegro-offer-2"]);
}

async function testMissingCatalogProductIdBlocksForwarding() {
  const result = buildOrderForwardingPayload(
    syntheticOrder([
      { offer: { id: "allegro-offer-1", name: "First product" }, quantity: 1, price: { amount: "10.00" } },
    ]),
    offerMap([
      { allegroOfferId: "allegro-offer-1", catalogProductId: null, accountId: "account-1" },
    ]),
    { warehouseId: "warehouse-main" },
  );

  assert.equal(result.orderData, null);
  assert.ok(result.blockedReasons.includes("missing_catalog_product:line_0_missing_catalog_product_id"));
  assert.deepEqual(result.missingCatalogOfferIds, ["allegro-offer-1"]);
}

async function testMissingWarehouseIdBlocksForwarding() {
  const result = buildOrderForwardingPayload(
    syntheticOrder([
      { offer: { id: "allegro-offer-1", name: "First product" }, quantity: 1, price: { amount: "10.00" } },
    ]),
    offerMap([
      { allegroOfferId: "allegro-offer-1", catalogProductId: "11111111-1111-1111-1111-111111111111", accountId: "account-1" },
    ]),
  );

  assert.equal(result.orderData, null);
  assert.ok(result.blockedReasons.includes("[MISSING: warehouseId]:line_0_missing_warehouse_id"));
}

async function testMissingShippingMethodBlocksForwarding() {
  const order = syntheticOrder([
    { offer: { id: "allegro-offer-1", name: "First product" }, quantity: 1, price: { amount: "10.00" } },
  ]);
  delete order.delivery.method;

  const result = buildOrderForwardingPayload(
    order,
    offerMap([
      { allegroOfferId: "allegro-offer-1", catalogProductId: "11111111-1111-1111-1111-111111111111", accountId: "account-1" },
    ]),
    { warehouseId: "warehouse-main" },
  );

  assert.equal(result.orderData, null);
  assert.deepEqual(result.blockedReasons, ["missing_shipping_method"]);
}

async function testMissingDeliveryAddressBlocksForwarding() {
  const order = syntheticOrder([
    { offer: { id: "allegro-offer-1", name: "First product" }, quantity: 1, price: { amount: "10.00" } },
  ]);
  delete order.delivery.address.street;

  const result = buildOrderForwardingPayload(
    order,
    offerMap([
      { allegroOfferId: "allegro-offer-1", catalogProductId: "11111111-1111-1111-1111-111111111111", accountId: "account-1" },
    ]),
    { warehouseId: "warehouse-main" },
  );

  assert.equal(result.orderData, null);
  assert.deepEqual(result.blockedReasons, ["missing_delivery_address"]);
}

export async function runOrderForwardingMapperSpec(): Promise<void> {
  await testMultiLineOrderUsesEachLineOfferCatalogProductId();
  await testMissingLineOfferMappingBlocksForwarding();
  await testMissingCatalogProductIdBlocksForwarding();
  await testMissingWarehouseIdBlocksForwarding();
  await testMissingShippingMethodBlocksForwarding();
  await testMissingDeliveryAddressBlocksForwarding();
}

if (require.main === module) {
  runOrderForwardingMapperSpec()
    .then(() => process.stdout.write("order-forwarding.mapper.spec: PASS\n"))
    .catch((error) => {
      process.stderr.write(`order-forwarding.mapper.spec: FAIL\n${error.stack || error.message}\n`);
      process.exitCode = 1;
    });
}
