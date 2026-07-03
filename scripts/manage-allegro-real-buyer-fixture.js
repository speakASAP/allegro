#!/usr/bin/env node
"use strict";

const crypto = require("crypto");
const { execFileSync } = require("child_process");
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

function sqlLiteral(value) {
  return `'${String(value).replace(/'/g, "''")}'`;
}

function jsonLiteral(value) {
  return `${sqlLiteral(JSON.stringify(value))}::jsonb`;
}

function runPsql(databaseUrl, sql) {
  try {
    return execFileSync("psql", ["-v", "ON_ERROR_STOP=1", "-At"], {
      input: sql,
      encoding: "utf8",
      env: {
        ...process.env,
        PGDATABASE: databaseUrl,
      },
      stdio: ["pipe", "pipe", "pipe"],
    }).trim();
  } catch {
    throw new Error("psql_execution_failed");
  }
}

function assertSafeSubject(subject) {
  if (!/^[a-zA-Z0-9._:@-]{1,255}$/.test(subject)) {
    throw new Error("unsafe_fixture_auth_subject");
  }
}

function createFixture(databaseUrl, subject) {
  const orderId = crypto.randomUUID();
  const lineItemId = crypto.randomUUID();
  const suffix = crypto.randomUUID();
  const externalOrderId = `${fixturePrefix}-${suffix}`;
  const externalLineId = `${externalOrderId}-line-1`;
  const now = new Date().toISOString();
  assertSafeFixtureKey(externalOrderId);
  assertSafeFixtureKey(externalLineId.replace(/-line-1$/, ""));
  assertSafeSubject(subject);

  runPsql(
    databaseUrl,
    `
      begin;
      insert into allegro_orders (
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
        ${sqlLiteral(orderId)}::uuid,
        ${sqlLiteral(externalOrderId)},
        'synthetic-buyer',
        'synthetic-buyer@example.invalid',
        'synthetic-buyer',
        ${sqlLiteral(subject)},
        1,
        1.00,
        1.00,
        'PLN',
        1,
        'READY_FOR_PROCESSING',
        'PAID',
        'NEW',
        'Synthetic pickup',
        ${jsonLiteral({ city: "Synthetic", countryCode: "CZ", redaction: "fixture" })},
        'SYNTHETIC',
        ${sqlLiteral(now)}::timestamp,
        'allegro-cz',
        'synthetic-fixture-v1',
        false,
        ${jsonLiteral({
          classification: "synthetic",
          fixturePrefix,
          externalOrderHash: shortHash(externalOrderId),
        })},
        ${sqlLiteral(now)}::timestamp,
        ${sqlLiteral(now)}::timestamp,
        ${sqlLiteral(now)}::timestamp
      );
      insert into allegro_order_line_items (
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
        ${sqlLiteral(lineItemId)}::uuid,
        ${sqlLiteral(orderId)}::uuid,
        ${sqlLiteral(externalLineId)},
        'synthetic-offer',
        'Synthetic buyer smoke item',
        1,
        1.00,
        1.00,
        'PLN',
        ${jsonLiteral({ classification: "synthetic", lineHash: shortHash(externalLineId) })},
        ${sqlLiteral(now)}::timestamp,
        ${sqlLiteral(now)}::timestamp,
        ${sqlLiteral(now)}::timestamp
      );
      commit;
    `,
  );

  console.log("fixture_created=true");
  console.log(`fixture_order_hash=${shortHash(orderId)}`);
  console.log(`fixture_external_hash=${shortHash(externalOrderId)}`);
  console.log(`fixture_subject_hash=${shortHash(subject)}`);
}

function cleanupFixtures(databaseUrl) {
  const output = runPsql(
    databaseUrl,
    `
      delete from allegro_orders
      where "allegroOrderId" like $1
      returning id::text || '|' || "allegroOrderId";
    `.replace("$1", sqlLiteral(`${fixturePrefix}-%`)),
  );

  const rows = output ? output.split("\n").filter(Boolean) : [];
  console.log(`fixture_cleanup_deleted=${rows.length}`);
  for (const row of rows) {
    const [id, externalId] = row.split("|");
    console.log(`deleted_order_hash=${shortHash(id)}`);
    console.log(`deleted_external_hash=${shortHash(externalId)}`);
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

  const databaseUrl = readRequiredSecret("ALLEGRO_BUYER_FIXTURE_DATABASE_URL", "ALLEGRO_BUYER_FIXTURE_DATABASE_URL_FILE");
  if (!databaseUrl) {
    throw new Error("missing_fixture_database_url");
  }

  if (mode === "create") {
    if (process.env.ALLEGRO_BUYER_FIXTURE_CONFIRM !== REQUIRED_CREATE_CONFIRM) {
      throw new Error(`missing_confirm:${REQUIRED_CREATE_CONFIRM}`);
    }

    const subject = readRequiredSecret("ALLEGRO_BUYER_FIXTURE_AUTH_SUBJECT", "ALLEGRO_BUYER_FIXTURE_AUTH_SUBJECT_FILE");
    if (!subject) {
      throw new Error("missing_fixture_auth_subject");
    }

    createFixture(databaseUrl, subject);
    return;
  }

  if (mode === "cleanup") {
    if (process.env.ALLEGRO_BUYER_FIXTURE_CONFIRM !== REQUIRED_CLEANUP_CONFIRM) {
      throw new Error(`missing_confirm:${REQUIRED_CLEANUP_CONFIRM}`);
    }

    assertSafeFixtureKey(`${fixturePrefix}-cleanup`);
    cleanupFixtures(databaseUrl);
    return;
  }

  throw new Error(`unsupported_fixture_mode:${mode}`);
}

main().catch((error) => {
  console.error(`fixture_failed=${error.message}`);
  process.exit(1);
});
