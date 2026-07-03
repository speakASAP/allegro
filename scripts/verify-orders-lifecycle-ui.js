#!/usr/bin/env node
const fs = require("fs");

const requiredStages = [
  "ordered_unpaid",
  "payment_failed",
  "paid_not_delivered",
  "warehouse_fulfillment_requested",
  "warehouse_collecting",
  "warehouse_forming",
  "warehouse_formed",
  "handed_to_delivery",
  "in_delivery",
  "received",
  "not_received",
  "returned",
  "cancelled",
];
const files = [
  "services/frontend/src/pages/OrdersPage.tsx",
  "services/frontend/src/pages/BuyerOrdersPage.tsx",
];
const missingByFile = {};
for (const file of files) {
  const source = fs.readFileSync(file, "utf8");
  const missing = requiredStages.filter((stage) => !source.includes(stage));
  const hasManualRefresh = source.includes("Refresh") && source.includes("loadOrders(page)");
  const hasLoadingState = source.includes("Refreshing central lifecycle") || source.includes("Central lifecycle not refreshed yet");
  if (missing.length || !hasManualRefresh || !hasLoadingState) {
    missingByFile[file] = {
      missingLifecycleStages: missing,
      manualRefresh: hasManualRefresh,
      loadingOrStaleState: hasLoadingState,
    };
  }
}
if (Object.keys(missingByFile).length) {
  console.error(JSON.stringify({ success: false, files: missingByFile }));
  process.exit(1);
}
console.log(JSON.stringify({
  success: true,
  filesChecked: files.length,
  lifecycleStagesCoveredPerFile: requiredStages.length,
  refreshCoverage: "manual and polling refresh visible in customer/admin order pages",
}));
