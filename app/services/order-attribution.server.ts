import prisma from "../db.server";
import {
  CARTLOCK_CHECKOUT_BADGE,
  verifyCartLockSignature,
} from "./cartlock-crypto";
import { ensureShopSettings } from "./seed.server";

export interface ShopifyOrderWebhookPayload {
  id: number | string;
  admin_graphql_api_id?: string;
  name?: string;
  order_number?: number;
  email?: string;
  contact_email?: string;
  customer?: {
    email?: string;
  };
  subtotal_price?: string | number;
  current_subtotal_price?: string | number;
  total_discounts?: string | number;
  current_total_discounts?: string | number;
  total_price?: string | number;
  current_total_price?: string | number;
  created_at?: string;
  processed_at?: string;
  note_attributes?: Array<{
    name?: string;
    key?: string;
    value?: string;
  }>;
  discount_applications?: Array<{
    type?: string;
    title?: string;
    description?: string;
    value?: string;
    value_type?: string;
  }>;
}

/**
 * Core attribution processor for `orders/create` webhook payloads.
 * Detects orders completed with a valid `_cartlock_expires_at` + `_cartlock_signature`
 * or the `"CartLock Price Reservation Active"` automatic discount, calculates
 * `secondsRemainingAtCheckout`, and logs verified revenue in `RecoveredCartOrder`.
 */
export async function processOrdersCreateAttribution(
  shop: string,
  order: ShopifyOrderWebhookPayload,
) {
  const settings = await ensureShopSettings(shop);
  const noteAttributes = order.note_attributes ?? [];

  const findAttr = (attrName: string): string | undefined => {
    const found = noteAttributes.find((a) => (a.name || a.key) === attrName);
    return found?.value;
  };

  const expiresAtRaw = findAttr("_cartlock_expires_at");
  const signatureRaw = findAttr("_cartlock_signature");

  const hasValidSignature = verifyCartLockSignature(
    expiresAtRaw,
    signatureRaw,
    settings.secretSalt,
  );

  const hasCartLockDiscountBadge = (order.discount_applications ?? []).some(
    (d) =>
      (d.title || d.description || "")
        .toLowerCase()
        .includes(CARTLOCK_CHECKOUT_BADGE.toLowerCase()) ||
      (d.title || "").toLowerCase().includes("cartlock"),
  );

  if (!hasValidSignature && !hasCartLockDiscountBadge) {
    return {
      attributed: false,
      reason: "Order did not contain a CartLock attribute or automatic discount",
    };
  }

  const orderCreatedMs = order.created_at
    ? Date.parse(order.created_at)
    : order.processed_at
      ? Date.parse(order.processed_at)
      : Date.now();

  let secondsRemainingAtCheckout = settings.lockDurationMinutes * 60;
  if (expiresAtRaw) {
    const expiresMs = /^\d+$/.test(expiresAtRaw.trim())
      ? Number(expiresAtRaw.trim()) *
        (Number(expiresAtRaw.trim()) < 1e12 ? 1000 : 1)
      : Date.parse(expiresAtRaw);
    if (Number.isFinite(expiresMs) && Number.isFinite(orderCreatedMs)) {
      secondsRemainingAtCheckout = Math.max(
        0,
        Math.floor((expiresMs - orderCreatedMs) / 1000),
      );
    }
  }

  const discountAmount = Number(
    parseFloat(
      String(order.current_total_discounts ?? order.total_discounts ?? "0"),
    ).toFixed(2),
  );
  const netOrderRevenue = Number(
    parseFloat(
      String(order.current_total_price ?? order.total_price ?? "0"),
    ).toFixed(2),
  );
  const rawSubtotal = parseFloat(
    String(order.current_subtotal_price ?? order.subtotal_price ?? "0"),
  );
  const cartSubtotal = Number(
    (rawSubtotal > 0 ? rawSubtotal : netOrderRevenue + discountAmount).toFixed(
      2,
    ),
  );

  const orderId = String(
    order.admin_graphql_api_id || `gid://shopify/Order/${order.id}`,
  );
  const orderName = String(
    order.name || (order.order_number ? `#${order.order_number}` : "#1099"),
  );
  const customerEmail =
    order.email || order.contact_email || order.customer?.email || null;

  const record = await prisma.recoveredCartOrder.upsert({
    where: { orderId },
    update: {
      orderName,
      customerEmail,
      cartSubtotal,
      discountAmount,
      netOrderRevenue,
      secondsRemainingAtCheckout,
    },
    create: {
      shop,
      orderId,
      orderName,
      customerEmail,
      cartSubtotal,
      discountAmount,
      netOrderRevenue,
      secondsRemainingAtCheckout,
    },
  });

  return {
    attributed: true,
    record,
  };
}
