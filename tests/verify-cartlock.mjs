import assert from "node:assert/strict";
import fs from "node:fs";
import zlib from "node:zlib";
import { createRequestHandler } from "@remix-run/node";
import * as build from "../build/server/index.js";

const BASE_URL = "http://localhost:3000";
const handler = createRequestHandler(build, "production");

async function requestApp(path, options = {}) {
  const req = new Request(`${BASE_URL}${path}`, options);
  return handler(req);
}

async function runVerification() {
  console.log("1. Checking Theme App Embed asset size (<2KB gzipped)...");
  const embedJs = fs.readFileSync(
    "extensions/cartlock-theme-embed/assets/cartlock.js",
  );
  const gzipSize = zlib.gzipSync(embedJs, { level: 9 }).length;
  console.log(
    `   -> cartlock.js gzipped size: ${gzipSize} bytes (< 2048 bytes)`,
  );
  assert(gzipSize < 2048, "cartlock.js must be under 2KB gzipped");

  // 2. Verify GET /app (Conversion Overview)
  console.log("2. Verifying Conversion Overview (/app)...");
  const overviewRes = await requestApp("/app");
  assert.equal(overviewRes.status, 200);
  const overviewHtml = await overviewRes.text();
  assert(overviewHtml.includes("Recovered Cart Revenue"));
  assert(overviewHtml.includes("Price Locks Claimed"));
  assert(overviewHtml.includes("Average Checkout Speed"));
  assert(overviewHtml.includes("RestockPing"));
  assert(overviewHtml.includes("DropClock"));
  assert(overviewHtml.includes("PromoLint"));
  assert(overviewHtml.includes("PrepaidFlip"));
  assert(
    !overviewHtml.includes("—"),
    "R-02 Gate: No em-dash characters allowed in rendered /app HTML",
  );
  console.log(
    "   -> /app passed all KPI, table, cross-sell, and R-02 checks.",
  );

  // 3. Verify POST /app (Simulate Live Order Webhook action)
  console.log("3. Verifying POST /app (simulate_webhook_order)...");
  const simForm = new URLSearchParams({ intent: "simulate_webhook_order" });
  const postOverviewRes = await requestApp(
    "/app?_data=routes%2Fapp._index",
    {
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
      body: simForm.toString(),
    },
  );
  assert.equal(postOverviewRes.status, 200);
  const postOverviewJson = await postOverviewRes.json();
  assert.equal(postOverviewJson.ok, true);
  console.log("   -> Simulated order webhook response:", postOverviewJson.message);

  // 4. Verify GET /app/settings (Offer Studio & Live Customizer)
  console.log("4. Verifying Offer Studio & Customizer (/app/settings)...");
  const settingsRes = await requestApp("/app/settings");
  assert.equal(settingsRes.status, 200);
  const settingsHtml = await settingsRes.text();
  assert(
    settingsHtml.includes("Discount &amp; Margin Shield Rules") ||
      settingsHtml.includes("Discount & Margin Shield Rules"),
  );
  assert(
    settingsHtml.includes("Trigger &amp; Cooldown Behavior") ||
      settingsHtml.includes("Trigger & Cooldown Behavior"),
  );
  assert(settingsHtml.includes("+ Discount Value"));
  assert(settingsHtml.includes("+ Timer Duration"));
  assert(settingsHtml.includes("+ Cart Total"));
  assert(settingsHtml.includes("Exit Modal View"));
  assert(settingsHtml.includes("Stretch Goal Upsell View"));
  assert(settingsHtml.includes("Sticky Bar View"));
  assert(
    !settingsHtml.includes("—"),
    "R-02 Gate: No em-dash characters allowed in rendered /app/settings HTML",
  );
  console.log(
    "   -> /app/settings passed all studio, variable chip, and preview bezel checks.",
  );

  // 5. Verify POST /app/settings (Save & Sync Discount Function)
  console.log("5. Verifying POST /app/settings (Save & Sync Discount Function)...");
  const saveForm = new URLSearchParams({
    intent: "save_settings",
    storeDisplayName: "sub-atelier-aura-dev-992.myshopify.com",
    isActive: "true",
    discountType: "PERCENTAGE",
    discountValue: "10",
    maxDiscountCap: "25",
    excludeSaleItems: "true",
    minCartSubtotal: "50",
    enableStretchGoalUpsell: "true",
    upsellVariantId: "gid://shopify/ProductVariant/44901283901",
    lockDurationMinutes: "15",
    cooldownHours: "72",
    enableDesktopExitIntent: "true",
    enableMobileIdleTrigger: "true",
    modalHeadline: "Reserve Your Cart at {discount} Off",
    modalBodyText:
      "Your cart of {cart_total} is reserved with a live price lock for {timer}. Complete checkout before your reservation expires.",
    buttonText: "Claim {discount} Price Lock",
    accentColor: "#10b981",
  });
  const saveRes = await requestApp("/app/settings?_data=routes%2Fapp.settings", {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: saveForm.toString(),
  });
  assert.equal(saveRes.status, 200);
  const saveJson = await saveRes.json();
  assert.equal(saveJson.ok, true);
  assert.equal(saveJson.syncResult.synced, true);
  assert.equal(saveJson.syncResult.combinesWith.orderDiscounts, false);
  assert.equal(saveJson.syncResult.combinesWith.productDiscounts, false);
  console.log("   -> Synced Automatic App Discount:", saveJson.message);

  // 6. Verify GET /app/simulator (Expiration & Pacing Simulator)
  console.log("6. Verifying Expiration & Pacing Simulator (/app/simulator)...");
  const simPageRes = await requestApp("/app/simulator");
  assert.equal(simPageRes.status, 200);
  const simHtml = await simPageRes.text();
  assert(
    simHtml.includes("Expiration &amp; Pacing Simulator") ||
      simHtml.includes("Expiration & Pacing Simulator"),
  );
  assert(simHtml.includes("Simulated Time Elapsed (0 to 30 Minutes)"));
  assert(simHtml.includes("CartLock Price Reservation Active"));
  assert(
    !simHtml.includes("—"),
    "R-02 Gate: No em-dash characters allowed in rendered /app/simulator HTML",
  );
  console.log("   -> /app/simulator passed all sandbox & R-02 checks.");

  // 7. Verify Storefront App Proxy signing & Email Permalink (/api/storefront/lock)
  console.log("7. Verifying Storefront App Proxy (/api/storefront/lock)...");
  const lockExpiresIso = new Date(Date.now() + 12 * 60 * 1000).toISOString();
  const lockRes = await requestApp("/api/storefront/lock", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      shop: "atelier-aura-dev.myshopify.com",
      expiresAt: lockExpiresIso,
    }),
  });
  assert.equal(lockRes.status, 200);
  const lockJson = await lockRes.json();
  assert.equal(lockJson.ok, true);
  assert(lockJson.signature.startsWith("cl_sig_"));
  console.log(
    "   -> Issued cryptographic _cartlock_signature:",
    lockJson.signature,
  );

  // 8. Verify Email Permalink generation
  const emailRes = await requestApp("/api/storefront/lock", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      action: "email_permalink",
      shop: "atelier-aura-dev.myshopify.com",
      email: "shopper@atelier-aura.com",
      cartPath: "/cart/44901283900:1",
      expiresAt: lockExpiresIso,
    }),
  });
  assert.equal(emailRes.status, 200);
  const emailJson = await emailRes.json();
  assert.equal(emailJson.dispatched, true);
  assert(
    emailJson.restorationPermalink.includes("attributes[_cartlock_signature]="),
  );
  console.log(
    "   -> Generated 1-click restoration permalink:",
    emailJson.restorationPermalink,
  );

  // 9. Verify orders/create Webhook Attribution (/webhooks/orders/create)
  console.log(
    "8. Verifying orders/create Webhook Attribution (/webhooks/orders/create)...",
  );
  const webhookRes = await requestApp("/webhooks/orders/create", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      shop: "atelier-aura-dev.myshopify.com",
      id: 9988776655,
      name: "#1098",
      email: "verified.buyer@atelier-aura.com",
      current_subtotal_price: "200.00",
      current_total_discounts: "20.00",
      current_total_price: "180.00",
      created_at: new Date().toISOString(),
      note_attributes: [
        { name: "_cartlock_expires_at", value: lockExpiresIso },
        { name: "_cartlock_signature", value: lockJson.signature },
      ],
      discount_applications: [
        {
          type: "automatic",
          title: "CartLock Price Reservation Active",
          value: "20.00",
        },
      ],
    }),
  });
  assert.equal(webhookRes.status, 200);
  const webhookJson = await webhookRes.json();
  assert.equal(webhookJson.ok, true);
  assert.equal(webhookJson.attributed, true);
  assert.equal(webhookJson.record.orderName, "#1098");
  assert(webhookJson.record.secondsRemainingAtCheckout > 600);
  console.log(
    `   -> Webhook attributed order ${webhookJson.record.orderName} with ${webhookJson.record.secondsRemainingAtCheckout}s remaining at checkout!`,
  );

  console.log("\nALL IN-PROCESS END-TO-END VERIFICATION CHECKS PASSED!");
}

runVerification().catch((err) => {
  console.error("Verification failed:", err);
  process.exit(1);
});
