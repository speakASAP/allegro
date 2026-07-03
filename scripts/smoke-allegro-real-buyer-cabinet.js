#!/usr/bin/env node
"use strict";

const crypto = require("crypto");
const fs = require("fs");

const REQUIRED_CONFIRM = "READ_ONLY_REAL_BUYER_CABINET";
const baseUrl = (process.env.ALLEGRO_BUYER_SMOKE_BASE_URL || "https://allegro.alfares.cz").replace(/\/$/, "");
const execute = process.env.RUN_ALLEGRO_REAL_BUYER_SMOKE === "1";
const confirm = process.env.ALLEGRO_BUYER_SMOKE_CONFIRM;

function shortHash(value) {
  return crypto.createHash("sha256").update(String(value || "")).digest("hex").slice(0, 12);
}

function readToken() {
  if (process.env.ALLEGRO_BUYER_SMOKE_BEARER_TOKEN) {
    return process.env.ALLEGRO_BUYER_SMOKE_BEARER_TOKEN.trim();
  }

  const tokenFile = process.env.ALLEGRO_BUYER_SMOKE_TOKEN_FILE;
  if (tokenFile) {
    return fs.readFileSync(tokenFile, "utf8").trim();
  }

  return "";
}

function assertNoForbiddenOutput(value, label) {
  const text = JSON.stringify(value);
  const forbidden = [
    /access[_-]?token/i,
    /refresh[_-]?token/i,
    /authorization/i,
    /password/i,
    /secret/i,
    /buyerEmail/i,
    /deliveryAddress/i,
    /trackingNumber/i,
    /trackingUrl/i,
    /waybill/i,
  ];
  const matched = forbidden.find((pattern) => pattern.test(text));
  if (matched) {
    throw new Error(`${label}_contains_forbidden_marker:${matched}`);
  }
}

async function requestJson(path, token, expectedStatus) {
  const response = await fetch(`${baseUrl}${path}`, {
    headers: token ? { Authorization: `Bearer ${token}` } : {},
  });
  const text = await response.text();
  let body = null;

  if (text) {
    try {
      body = JSON.parse(text);
    } catch {
      body = { nonJson: true };
    }
  }

  if (response.status !== expectedStatus) {
    throw new Error(`${path}_status=${response.status}_expected=${expectedStatus}`);
  }

  return { status: response.status, body };
}

async function main() {
  if (!execute) {
    console.log("status=approval_required_no_live_call");
    console.log("required_env=RUN_ALLEGRO_REAL_BUYER_SMOKE=1");
    console.log(`required_confirm=${REQUIRED_CONFIRM}`);
    console.log("token_source=ALLEGRO_BUYER_SMOKE_BEARER_TOKEN_or_ALLEGRO_BUYER_SMOKE_TOKEN_FILE");
    process.exit(0);
  }

  if (confirm !== REQUIRED_CONFIRM) {
    throw new Error(`missing_confirm:${REQUIRED_CONFIRM}`);
  }

  const token = readToken();
  if (!token) {
    throw new Error("missing_buyer_bearer_token");
  }

  const root = await requestJson("/", "", 200);
  const cabinet = await requestJson("/cabinet/orders", "", 200);
  const unauth = await requestJson("/api/allegro/buyer/orders", "", 401);
  const list = await requestJson("/api/allegro/buyer/orders", token, 200);

  assertNoForbiddenOutput(list.body, "buyer_list_response");

  const data = list.body && list.body.data ? list.body.data : {};
  const items = Array.isArray(data.items) ? data.items : [];
  const total = data.pagination && Number.isFinite(Number(data.pagination.total))
    ? Number(data.pagination.total)
    : items.length;

  const minOrders = Number(process.env.ALLEGRO_BUYER_SMOKE_MIN_ORDERS || "1");
  if (items.length < minOrders || total < minOrders) {
    throw new Error(`bound_order_count=${items.length}_total=${total}_min=${minOrders}`);
  }

  const firstId = items[0] && items[0].id;
  if (!firstId) {
    throw new Error("first_bound_order_missing_id");
  }

  const detail = await requestJson(`/api/allegro/buyer/orders/${encodeURIComponent(firstId)}`, token, 200);
  assertNoForbiddenOutput(detail.body, "buyer_detail_response");

  const missingId = process.env.ALLEGRO_BUYER_SMOKE_MISSING_ID || "11111111-1111-4111-8111-111111111111";
  const missing = await requestJson(`/api/allegro/buyer/orders/${encodeURIComponent(missingId)}`, token, 404);

  console.log(`root_status=${root.status}`);
  console.log(`cabinet_status=${cabinet.status}`);
  console.log(`unauth_status=${unauth.status}`);
  console.log(`buyer_list_status=${list.status}`);
  console.log(`buyer_items=${items.length}`);
  console.log(`buyer_total=${total}`);
  console.log(`first_order_hash=${shortHash(firstId)}`);
  console.log(`buyer_detail_status=${detail.status}`);
  console.log(`missing_detail_status=${missing.status}`);
  console.log("raw_token_printed=false");
  console.log("raw_order_id_printed=false");
  console.log("raw_customer_payload_printed=false");
}

main().catch((error) => {
  console.error(`smoke_failed=${error.message}`);
  process.exit(1);
});
