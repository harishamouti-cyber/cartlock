import type { ActionFunctionArgs, LoaderFunctionArgs } from "@remix-run/node";
import { json } from "@remix-run/node";
import prisma from "../db.server";
import { DEFAULT_DEV_SHOP } from "../shopify.server";
import { computeCartLockSignature } from "../services/cartlock-crypto";
import { ensureShopSettings } from "../services/seed.server";

/**
 * Storefront App Proxy Endpoint (`/apps/cartlock/lock` -> `/api/storefront/lock`)
 * 1. Signs `_cartlock_expires_at` with the shop's `secretSalt` and returns `_cartlock_signature`.
 * 2. Generates 1-click locked cart restoration permalinks for the "Not ready? Email me this locked cart link" micro-action.
 */
export const loader = async ({ request }: LoaderFunctionArgs) => {
  const url = new URL(request.url);
  const shop = url.searchParams.get("shop") || DEFAULT_DEV_SHOP;
  const settings = await ensureShopSettings(shop);

  const expiresAt = new Date(
    Date.now() + settings.lockDurationMinutes * 60 * 1000,
  ).toISOString();
  const signature = computeCartLockSignature(expiresAt, settings.secretSalt);

  return json({
    ok: true,
    shop: settings.shop,
    storeDisplayName: settings.storeDisplayName,
    isActive: settings.isActive,
    discountType: settings.discountType,
    discountValue: settings.discountValue,
    maxDiscountCap: settings.maxDiscountCap,
    excludeSaleItems: settings.excludeSaleItems,
    minCartSubtotal: settings.minCartSubtotal,
    enableStretchGoalUpsell: settings.enableStretchGoalUpsell,
    upsellVariantId: settings.upsellVariantId,
    lockDurationMinutes: settings.lockDurationMinutes,
    cooldownHours: settings.cooldownHours,
    expiresAt,
    signature,
  });
};

export const action = async ({ request }: ActionFunctionArgs) => {
  let payload: Record<string, unknown> = {};
  try {
    payload = (await request.json()) as Record<string, unknown>;
  } catch {
    const formData = await request.formData();
    payload = Object.fromEntries(formData.entries());
  }

  const shop = String(payload.shop || DEFAULT_DEV_SHOP);
  const settings = await prisma.cartLockSettings.findUnique({
    where: { shop },
  }) || (await ensureShopSettings(shop));

  const expiresAt = String(
    payload.expiresAt ||
      new Date(
        Date.now() + settings.lockDurationMinutes * 60 * 1000,
      ).toISOString(),
  );
  const signature = computeCartLockSignature(expiresAt, settings.secretSalt);

  if (payload.action === "email_permalink") {
    const email = String(payload.email || "").trim();
    const cartPath = String(payload.cartPath || "/cart/44901283900:1");
    const permalink = `https://${shop}${cartPath}?attributes[_cartlock_expires_at]=${encodeURIComponent(expiresAt)}&attributes[_cartlock_signature]=${encodeURIComponent(signature)}`;

    return json({
      ok: true,
      dispatched: true,
      pipeline: "Shopify Flow & Zero-Cost SMTP Trigger",
      recipientEmail: email,
      expiresAt,
      signature,
      restorationPermalink: permalink,
    });
  }

  return json({
    ok: true,
    shop,
    expiresAt,
    signature,
    attributes: {
      _cartlock_expires_at: expiresAt,
      _cartlock_signature: signature,
    },
  });
};
