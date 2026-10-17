import {
  PrismaClient,
  type CartLockSettings,
  type RecoveredCartOrder,
} from "@prisma/client";

if (!process.env.DATABASE_URL) {
  process.env.DATABASE_URL = process.env.VERCEL
    ? "file:/tmp/cartlock.sqlite"
    : "file:./dev.sqlite";
}

interface ServerlessFallbackStore {
  settingsByShop: Map<string, CartLockSettings>;
  ordersById: Map<string, RecoveredCartOrder>;
}

declare global {
  // eslint-disable-next-line no-var
  var prismaGlobal: PrismaClient | undefined;
  // eslint-disable-next-line no-var
  var cartlockFallbackStore: ServerlessFallbackStore | undefined;
}

const fallbackStore: ServerlessFallbackStore = global.cartlockFallbackStore ?? {
  settingsByShop: new Map<string, CartLockSettings>(),
  ordersById: new Map<string, RecoveredCartOrder>(),
};
global.cartlockFallbackStore = fallbackStore;

const rawPrisma =
  global.prismaGlobal ??
  new PrismaClient({
    log: process.env.NODE_ENV === "development" ? ["error", "warn"] : ["error"],
  });

if (process.env.NODE_ENV !== "production") {
  global.prismaGlobal = rawPrisma;
}

function buildDefaultSettings(
  shop: string,
  overrides: Partial<CartLockSettings> = {},
): CartLockSettings {
  const now = new Date();
  return {
    id: overrides.id || `cl_cfg_${Buffer.from(shop).toString("hex").slice(0, 12)}`,
    shop,
    storeDisplayName: overrides.storeDisplayName ?? "Atelier Aura",
    isActive: overrides.isActive ?? true,
    discountType: overrides.discountType ?? "PERCENTAGE",
    discountValue: overrides.discountValue ?? 10,
    maxDiscountCap:
      overrides.maxDiscountCap !== undefined ? overrides.maxDiscountCap : 25.0,
    excludeSaleItems: overrides.excludeSaleItems ?? true,
    minCartSubtotal: overrides.minCartSubtotal ?? 50.0,
    enableTieredLadder: overrides.enableTieredLadder ?? true,
    tieredLadderConfig:
      overrides.tieredLadderConfig ??
      JSON.stringify([
        { tier: 1, threshold: 50, discountValue: 10, label: "Tier 1 Lock" },
        { tier: 2, threshold: 100, discountValue: 15, label: "Tier 2 Boost" },
        { tier: 3, threshold: 150, discountValue: 20, label: "Tier 3 Max" },
      ]),
    enableStretchGoalUpsell: overrides.enableStretchGoalUpsell ?? true,
    upsellVariantId:
      overrides.upsellVariantId !== undefined
        ? overrides.upsellVariantId
        : "gid://shopify/ProductVariant/44901283901",
    lockDurationMinutes: overrides.lockDurationMinutes ?? 15,
    cooldownHours: overrides.cooldownHours ?? 72,
    enableDesktopExitIntent: overrides.enableDesktopExitIntent ?? true,
    enableMobileIdleTrigger: overrides.enableMobileIdleTrigger ?? true,
    modalHeadline:
      overrides.modalHeadline ?? "Reserve Your Cart at {discount} Off",
    modalBodyText:
      overrides.modalBodyText ??
      "Your cart of {cart_total} is reserved with a live price lock for {timer}. Complete checkout before your reservation expires.",
    buttonText: overrides.buttonText ?? "Claim {discount} Price Lock",
    accentColor: overrides.accentColor ?? "#10b981",
    secretSalt:
      overrides.secretSalt ??
      `cl_salt_${Buffer.from(shop).toString("hex").slice(0, 16)}_9f82a4e1`,
    automaticDiscountId:
      overrides.automaticDiscountId ??
      "gid://shopify/DiscountAutomaticApp/994810293847",
    createdAt: overrides.createdAt ?? now,
    updatedAt: now,
  };
}

/**
 * Serverless-resilient Prisma proxy: uses SQLite/Postgres via Prisma when available,
 * and seamlessly falls back to in-memory persistence on read-only Vercel serverless cold starts
 * when `DATABASE_URL` is not yet provisioned.
 */
const prisma = new Proxy(rawPrisma, {
  get(target, prop, receiver) {
    if (prop === "cartLockSettings") {
      return {
        findUnique: async (args: { where: { shop: string } }) => {
          try {
            const res = await target.cartLockSettings.findUnique(args);
            if (res) {
              fallbackStore.settingsByShop.set(args.where.shop, res);
              return res;
            }
          } catch {
            // Serverless SQLite fallback
          }
          return fallbackStore.settingsByShop.get(args.where.shop) ?? null;
        },
        upsert: async (args: {
          where: { shop: string };
          update: Partial<CartLockSettings>;
          create: Partial<CartLockSettings> & { shop: string };
        }) => {
          try {
            const res = await target.cartLockSettings.upsert(
              args as Parameters<typeof target.cartLockSettings.upsert>[0],
            );
            fallbackStore.settingsByShop.set(args.where.shop, res);
            return res;
          } catch {
            const existing = fallbackStore.settingsByShop.get(args.where.shop);
            const next = existing
              ? buildDefaultSettings(args.where.shop, {
                  ...existing,
                  ...args.update,
                })
              : buildDefaultSettings(args.where.shop, args.create);
            fallbackStore.settingsByShop.set(args.where.shop, next);
            return next;
          }
        },
        update: async (args: {
          where: { shop: string };
          data: Partial<CartLockSettings>;
        }) => {
          try {
            const res = await target.cartLockSettings.update(
              args as Parameters<typeof target.cartLockSettings.update>[0],
            );
            fallbackStore.settingsByShop.set(args.where.shop, res);
            return res;
          } catch {
            const existing =
              fallbackStore.settingsByShop.get(args.where.shop) ??
              buildDefaultSettings(args.where.shop);
            const next = buildDefaultSettings(args.where.shop, {
              ...existing,
              ...args.data,
            });
            fallbackStore.settingsByShop.set(args.where.shop, next);
            return next;
          }
        },
      };
    }

    if (prop === "recoveredCartOrder") {
      return {
        count: async (args?: { where?: { shop?: string } }) => {
          try {
            return await target.recoveredCartOrder.count(args);
          } catch {
            const shopFilter = args?.where?.shop;
            const all = Array.from(fallbackStore.ordersById.values());
            return shopFilter
              ? all.filter((o) => o.shop === shopFilter).length
              : all.length;
          }
        },
        upsert: async (args: {
          where: { orderId: string };
          update: Partial<RecoveredCartOrder>;
          create: Omit<RecoveredCartOrder, "id" | "createdAt"> & {
            createdAt?: Date;
          };
        }) => {
          try {
            const res = await target.recoveredCartOrder.upsert(
              args as Parameters<typeof target.recoveredCartOrder.upsert>[0],
            );
            fallbackStore.ordersById.set(res.orderId, res);
            return res;
          } catch {
            const existing = fallbackStore.ordersById.get(args.where.orderId);
            const record: RecoveredCartOrder = existing
              ? { ...existing, ...args.update }
              : {
                  id: `cl_ord_${Math.random().toString(36).slice(2, 10)}`,
                  shop: args.create.shop,
                  orderId: args.create.orderId,
                  orderName: args.create.orderName,
                  customerEmail: args.create.customerEmail ?? null,
                  cartSubtotal: args.create.cartSubtotal,
                  discountAmount: args.create.discountAmount,
                  netOrderRevenue: args.create.netOrderRevenue,
                  secondsRemainingAtCheckout:
                    args.create.secondsRemainingAtCheckout,
                  createdAt: args.create.createdAt ?? new Date(),
                };
            fallbackStore.ordersById.set(record.orderId, record);
            return record;
          }
        },
        create: async (args: {
          data: Omit<RecoveredCartOrder, "id" | "createdAt"> & {
            createdAt?: Date;
          };
        }) => {
          try {
            const res = await target.recoveredCartOrder.create(args);
            fallbackStore.ordersById.set(res.orderId, res);
            return res;
          } catch {
            const record: RecoveredCartOrder = {
              id: `cl_ord_${Math.random().toString(36).slice(2, 10)}`,
              shop: args.data.shop,
              orderId: args.data.orderId,
              orderName: args.data.orderName,
              customerEmail: args.data.customerEmail ?? null,
              cartSubtotal: args.data.cartSubtotal,
              discountAmount: args.data.discountAmount,
              netOrderRevenue: args.data.netOrderRevenue,
              secondsRemainingAtCheckout: args.data.secondsRemainingAtCheckout,
              createdAt: args.data.createdAt ?? new Date(),
            };
            fallbackStore.ordersById.set(record.orderId, record);
            return record;
          }
        },
        findMany: async (args?: {
          where?: { shop?: string };
          orderBy?: { createdAt?: "asc" | "desc" };
        }) => {
          try {
            const res = await target.recoveredCartOrder.findMany(args);
            for (const row of res) {
              fallbackStore.ordersById.set(row.orderId, row);
            }
            return res;
          } catch {
            const shopFilter = args?.where?.shop;
            const list = Array.from(fallbackStore.ordersById.values()).filter(
              (o) => !shopFilter || o.shop === shopFilter,
            );
            return list.sort(
              (a, b) => b.createdAt.getTime() - a.createdAt.getTime(),
            );
          }
        },
      };
    }

    return Reflect.get(target, prop, receiver);
  },
});

export default prisma;
