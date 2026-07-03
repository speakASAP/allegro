import { strict as assert } from "assert";
import { of } from "rxjs";
import {
  ShipmentStatusSourceClient,
  buildReadBundleFromLiveShipmentReads,
} from "./shipment-status-source.client";

async function testClientReadsShipmentsAndTrackingWithBearerToken() {
  const requests: Array<{ url: string; headers: Record<string, string> }> = [];
  const httpService = {
    get(url: string, options: any) {
      requests.push({ url, headers: options.headers });
      if (url.includes("/shipments")) {
        return of({
          status: 200,
          data: { shipments: [{ id: "raw-shipment-1", carrierId: "DPD", waybill: "raw-waybill-1", packageCount: 1 }] },
        });
      }
      return of({
        status: 200,
        data: { updatedAt: "2026-07-03T13:00:00Z", statuses: [{ status: "DELIVERED", occurredAt: "2026-07-03T12:55:00Z" }] },
      });
    },
  };
  const client = new ShipmentStatusSourceClient(httpService as any);

  const bundle = await client.readShipmentStatusBundle({
    orders: [{ accountId: "account-1", externalOrderId: "checkout-form-1", centralOrderId: "central-1" }],
  }, {
    token: "synthetic-token",
    baseUrl: "https://api.example.test/",
    language: "pl-PL",
    readAt: "2026-07-03T13:05:00.000Z",
  });

  assert.equal(bundle.contract, "allegro.shipment_status_read_bundle.v1");
  assert.equal(bundle.orders.length, 1);
  assert.equal(bundle.orders[0].sourceReadStatus, "AVAILABLE");
  assert.deepEqual(requests.map((request) => request.url), [
    "https://api.example.test/order/checkout-forms/checkout-form-1/shipments",
    "https://api.example.test/order/carriers/DPD/tracking?waybill=raw-waybill-1",
  ]);
  assert.equal(requests[0].headers.Authorization, "Bearer synthetic-token");
  assert.equal(requests[0].headers["Accept-Language"], "pl-PL");
}

async function testInjectedReadBuildsPartialBundleOnTrackingFailure() {
  const bundle = await buildReadBundleFromLiveShipmentReads({
    orders: [{ accountId: "account-1", externalOrderId: "checkout-form-2" }],
  }, {
    token: "synthetic-token",
    readAt: "2026-07-03T13:06:00.000Z",
    read: async (endpoint) => {
      if (endpoint.includes("/shipments")) {
        return { shipments: [{ id: "raw-shipment-2", carrierId: "DPD", waybill: "raw-waybill-2", packageCount: 1 }] };
      }
      throw new Error("synthetic tracking failure");
    },
  });

  assert.equal(bundle.orders[0].sourceReadStatus, "PARTIAL");
  assert.equal(bundle.orders[0].sourceReadReason, "[UNKNOWN: carrier tracking read failed for one or more shipments]");
}

async function testScopeFailureDoesNotAttachProviderPayload() {
  const httpService = {
    get() {
      return of({ status: 403, data: { trackingNumber: "must-not-surface", receiver: { email: "hidden@example.test" } } });
    },
  };
  const client = new ShipmentStatusSourceClient(httpService as any);

  await assert.rejects(
    () => client.readShipmentStatusBundle({ orders: [{ accountId: "account-1", externalOrderId: "checkout-form-3" }] }, { token: "synthetic-token" }),
    (error: any) => {
      assert.equal(error.message, "[MISSING: OAuth scope or account permission for shipment tracking read]");
      assert.equal(error.data, undefined);
      return true;
    },
  );
}

async function runShipmentStatusSourceClientSpec(): Promise<void> {
  await testClientReadsShipmentsAndTrackingWithBearerToken();
  await testInjectedReadBuildsPartialBundleOnTrackingFailure();
  await testScopeFailureDoesNotAttachProviderPayload();
}

if (require.main === module) {
  runShipmentStatusSourceClientSpec()
    .then(() => process.stdout.write("shipment-status-source.client.spec: PASS\n"))
    .catch((error) => {
      process.stderr.write(`shipment-status-source.client.spec: FAIL\n${error.stack || error.message}\n`);
      process.exitCode = 1;
    });
}
