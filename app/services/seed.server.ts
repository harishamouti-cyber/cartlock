import type { CartLockSettings, RecoveredCartOrder } from "@prisma/client";
import prisma from "../db.server";
import { sanitizeStoreDisplayName } from "./cartlock-crypto";

const INITIAL_DEMO_ORDERS = [
  {
    orderId: "gid://shopify/Order/59201849201",
    orderName: "#1094",
    customerEmail: "claire.dubois@maison-nord.fr",
    cartSubtotal: 210.0,
    discountAmount: 21.0,
    netOrderRevenue: 189.0,
    secondsRemainingAtCheckout: 614,
    minutesAgo: 18,
  },
  {
    orderId: "gid://shopify/Order/59201849202",
    orderName: "#1093",
    customerEmail: "marcus.vance@kinetix.io",
    cartSubtotal: 340.0,
    discountAmount: 25.0, // Capped by $25 maxDiscountCap
    netOrderRevenue: 315.0,
    secondsRemainingAtCheckout: 142,
    minutesAgo: 64,
  },
  {
    orderId: "gid://shopify/Order/59201849203",
    orderName: "#1091",
    customerEmail: "elena.rostova@studio-ost.de",
    cartSubtotal: 168.0,
    discountAmount: 16.8,
    netOrderRevenue: 151.2,
    secondsRemainingAtCheckout: 488,
    minutesAgo: 195,
  },
  {
    orderId: "gid://shopify/Order/59201849204",
    orderName: "#1088",
    customerEmail: "julian.mercer@veld-arch.co",
    cartSubtotal: 96.0,
    discountAmount: 9.6,
    netOrderRevenue: 86.4,
    secondsRemainingAtCheckout: 79,
    minutesAgo: 410,
  },
  {
    orderId: "gid://shopify/Order/59201849205",
    orderName: "#1084",
    customerEmail: "soren.lindqvist@krono.se",
    cartSubtotal: 252.0,
    discountAmount: 25.0,
    netOrderRevenue: 227.0,
    secondsRemainingAtCheckout: 530,
    minutesAgo: 820,
  },
];

export async function ensureShopSettings(
  shop: string,
): Promise<CartLockSettings> {
  const existing = await prisma.cartLockSettings.findUnique({
    where: { shop },
  });

  if (existing) {
    return existing;
  }

  const sanitizedName = sanitizeStoreDisplayName(shop);
  const generatedSalt = `cl_salt_${Buffer.from(shop).toString("hex").slice(0, 16)}_9f82a4e1`;

  try {
    return await prisma.cartLockSettings.upsert({
      where: { shop },
      update: {},
      create: {
        shop,
        storeDisplayName: sanitizedName,
        isActive: true,
        discountType: "PERCENTAGE",
        discountValue: 10,
        maxDiscountCap: 25.0,
        excludeSaleItems: true,
        minCartSubtotal: 50.0,
        enableStretchGoalUpsell: true,
        upsellVariantId: "gid://shopify/ProductVariant/44901283901",
        lockDurationMinutes: 15,
        cooldownHours: 72,
        enableDesktopExitIntent: true,
        enableMobileIdleTrigger: true,
        modalHeadline: "Reserve Your Cart at {discount} Off",
        modalBodyText:
          "Your cart of {cart_total} is reserved with a live price lock for {timer}. Complete checkout before your reservation expires.",
        buttonText: "Claim {discount} Price Lock",
        accentColor: "#10b981",
        secretSalt: generatedSalt,
        automaticDiscountId: "gid://shopify/DiscountAutomaticApp/994810293847",
      },
    });
  } catch {
    const retry = await prisma.cartLockSettings.findUnique({
      where: { shop },
    });
    if (retry) return retry;
    throw new Error(`Failed to initialize CartLockSettings for ${shop}`);
  }
}

export async function ensureRecoveredOrdersSeeded(
  shop: string,
): Promise<RecoveredCartOrder[]> {
  const count = await prisma.recoveredCartOrder.count({
    where: { shop },
  });

  if (count === 0) {
    const now = Date.now();
    for (const demo of INITIAL_DEMO_ORDERS) {
      await prisma.recoveredCartOrder.upsert({
        where: { orderId: demo.orderId },
        update: {},
        create: {
          shop,
          orderId: demo.orderId,
          orderName: demo.orderName,
          customerEmail: demo.customerEmail,
          cartSubtotal: demo.cartSubtotal,
          discountAmount: demo.discountAmount,
          netOrderRevenue: demo.netOrderRevenue,
          secondsRemainingAtCheckout: demo.secondsRemainingAtCheckout,
          createdAt: new Date(now - demo.minutesAgo * 60_000),
        },
      });
    }
  }

  return prisma.recoveredCartOrder.findMany({
    where: { shop },
    orderBy: { createdAt: "desc" },
  });
}
