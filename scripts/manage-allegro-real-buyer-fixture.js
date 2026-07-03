#!/usr/bin/env node
"use strict";

const crypto = require("crypto");
const fs = require("fs");

const REQUIRED_CREATE_CONFIRM = "CREATE_SYNTHETIC_BUYER_FIXTURE";
const REQUIRED_CLEANUP_CONFIRM = "CLEANUP_SYNTHETIC_BUYER_FIXTURE";
const fixturePrefix = process.env.ALLEGRO_BUYER_FIXTURE_PREFIX || "codex-real-buyer-smoke";

function shortHash(value) {
  return crypto.createHash("sha256").update(String(value || "")).digest("hex").slice(0, 12);
}

function readRequiredSecret(name, fileName) {
  if (process.env[name]) {
    return process.env[name].trim();
  }

  const filePath = process.env[fileName];
  if (filePath) {
    return fs.readFileSync(filePath, "utf8").trim();
  }

  return "";
}

function assertSafeFixtureKey(value) {
  if (!new RegExp(`^${fixturePrefix.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}-[a-zA-Z0-9._:-]+$`).test(value)) {
    throw new Error("unsafe_fixture_key_prefix");
  }
}

async function createFixture(client, subject) {
  const orderId = crypto.randomUUID();
  const lineItemId = crypto.randomUUID();
  const suffix = crypto.randomUUID();
  const externalOrderId = `${fixturePrefix}-${suffix}`;
  const externalLineId = `${externalOrderId}-line-1`;
  const now = new Date();

  await client.query("begin");
  try {
    await client.query(
      `insert into allegro_orders (
        id,
        "allegroOrderId",
        "buyerId",
        "buyerEmail",
        "buyerLogin",
        "buyerAuthSubject",
        quantity,
        price,
        "totalPrice",
        currency,
        "lineItemsCount",
        status,
        "paymentStatus",
        "fulfillmentStatus",
        "deliveryMethod",
        "deliveryAddress",
        "paymentMethod",
        "paidAt",
        "marketplaceId",
        revision,
        "invoiceRequired",
        "rawData",
        "orderDate",
        "createdAt",
        "updatedAt"
      ) values (
        $1::uuid,
        $2,
        $3,
        $4,
        $5,
        $6,
        1,
        1.00,
        1.00,
        'PLN',
        1,
        'READY_FOR_PROCESSING',
        'PAID',
        'NEW',
        'Synthetic pickup',
        $7::jsonb,
        'SYNTHETIC',
        $8,
        'allegro-cz',
        'synthetic-fixture-v1',
        false,
        $9::jsonb,
        $8,
        $8,
        $8
      )`,
      [
        orderId,
        externalOrderId,
        "synthetic-buyer",
        "synthetic-buyer@example.invalid",
        "synthetic-buyer",
        subject,
        JSON.stringify({ city: "Synthetic", countryCode: "CZ", redaction: "fixture" }),
        now,
        JSON.stringify({
          classification: "synthetic",
          fixturePrefix,
          externalOrderHash: shortHash(externalOrderId),
        }),
      ],
    );

    await client.query(
      `insert into allegro_order_line_items (
        id,
        "orderId",
        "allegroLineItemId",
        "allegroOfferExternalId",
        title,
        quantity,
        price,
        "totalPrice",
        currency,
        "rawData",
        "boughtAt",
        "createdAt",
        "updatedAt"
      ) values (
        $1::uuid,
        $2::uuid,
        $3,
        $4,
        'Synthetic buyer smoke item',
        1,
        1.00,
        1.00,
        'PLN',
        $5::jsonb,
        $6,
        $6,
        $6
      )`,
      [
        lineItemId,
        orderId,
        externalLineId,
        "synthetic-offer",
        JSON.stringify({ classification: "synthetic", lineHash: shortHash(externalLineId) }),
        now,
      ],
    );

    await client.query("commit");
  } catch (error) {
    await client.query("rollback");
    throw error;
  }

  console.log("fixture_created=true");
  console.log(`fixture_order_hash=${shortHash(orderId)}`);
  console.log(`fixture_external_hash=${shortHash(externalOrderId)}`);
  console.log(`fixture_subject_hash=${shortHash(subject)}`);
}

async function cleanupFixtures(client) {
  const result = await client.query(
    `delete from allegro_orders
      where "allegroOrderId" like $1
      returning id, "allegroOrderId"`,
    [`${fixturePrefix}-%`],
  );

  console.log(`fixture_cleanup_deleted=${result.rowCount}`);
  for (const row of result.rows) {
    console.log(`deleted_order_hash=${shortHash(row.id)}`);
    console.log(`deleted_external_hash=${shortHash(row.allegroOrderId)}`);
  }
}

async function main() {
  const mode = process.env.ALLEGRO_BUYER_FIXTURE_MODE || "check";
  if (mode === "check") {
    console.log("status=approval_required_no_db_mutation");
    console.log("create_confirm=ALLEGRO_BUYER_FIXTURE_MODE=create");
    console.log(`create_required_confirm=${REQUIRED_CREATE_CONFIRM}`);
    console.log("cleanup_confirm=ALLEGRO_BUYER_FIXTURE_MODE=cleanup");
    console.log(`cleanup_required_confirm=${REQUIRED_CLEANUP_CONFIRM}`);
    process.exit(0);
  }

  const { Client } = require("pg");
  const databaseUrl = readRequiredSecret("ALLEGRO_BUYER_FIXTURE_DATABASE_URL", "ALLEGRO_BUYER_FIXTURE_DATABASE_URL_FILE");
  if (!databaseUrl) {
    throw new Error("missing_fixture_database_url");
  }

  const client = new Client({ connectionString: databaseUrl });
  await client.connect();

  try {
    if (mode === "create") {
      if (process.env.ALLEGRO_BUYER_FIXTURE_CONFIRM !== REQUIRED_CREATE_CONFIRM) {
        throw new Error(`missing_confirm:${REQUIRED_CREATE_CONFIRM}`);
      }

      const subject = readRequiredSecret("ALLEGRO_BUYER_FIXTURE_AUTH_SUBJECT", "ALLEGRO_BUYER_FIXTURE_AUTH_SUBJECT_FILE");
      if (!subject) {
        throw new Error("missing_fixture_auth_subject");
      }

      await createFixture(client, subject);
      return;
    }

    if (mode === "cleanup") {
      if (process.env.ALLEGRO_BUYER_FIXTURE_CONFIRM !== REQUIRED_CLEANUP_CONFIRM) {
        throw new Error(`missing_confirm:${REQUIRED_CLEANUP_CONFIRM}`);
      }

      assertSafeFixtureKey(`${fixturePrefix}-cleanup`);
      await cleanupFixtures(client);
      return;
    }

    throw new Error(`unsupported_fixture_mode:${mode}`);
  } finally {
    await client.end();
  }
}

main().catch((error) => {
  console.error(`fixture_failed=${error.message}`);
  process.exit(1);
});
