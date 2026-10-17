/**
 * CartLock Native Shopify Discount Function
 * Target: purchase.product-discount.run
 *
 * Features:
 * 1. Anti-Inspect-Element Cryptographic Verification:
 *    Validates `_cartlock_signature` against deterministic hash of `_cartlock_expires_at` + `secretSalt`.
 * 2. Real-Time Checkout Expiration:
 *    Compares `_cartlock_expires_at` against `shop.localTime.dateTime`. Reverts to $0 discount the exact second it expires.
 * 3. Margin Shield Clearance Protection:
 *    When `excludeSaleItems` is true, excludes any line item where `compareAtAmountPerQuantity > amountPerQuantity`.
 * 4. Maximum Dollar Cap (`maxDiscountCap`):
 *    Caps percentage discounts at `maxDiscountCap` so high-value carts never erode merchant margins.
 */

export interface RunInput {
  cart: {
    cost: {
      subtotalAmount: {
        amount: string;
      };
    };
    expiresAt?: {
      value: string;
    } | null;
    signature?: {
      value: string;
    } | null;
    lines: Array<{
      id: string;
      quantity: number;
      cost: {
        amountPerQuantity: {
          amount: string;
        };
        compareAtAmountPerQuantity?: {
          amount: string;
        } | null;
      };
      merchandise: {
        __typename: string;
        id?: string;
        title?: string;
      };
    }>;
  };
  shop: {
    localTime: {
      dateTime: string;
    };
  };
  discountNode: {
    metafield?: {
      value: string;
    } | null;
  };
}

export interface FunctionRunResult {
  discountApplicationStrategy: "FIRST" | "MAXIMUM";
  discounts: Array<{
    message: string;
    targets: Array<{
      cartLine: {
        id: string;
      };
    }>;
    value:
      | {
          percentage: {
            value: string;
          };
        }
      | {
          fixedAmount: {
            amount: string;
            appliesToEachItem?: boolean;
          };
        };
  }>;
}

interface PriceLockTier {
  tier: number;
  threshold: number;
  discountValue: number;
  label?: string;
}

interface CartLockMetafieldConfig {
  isActive?: boolean;
  discountType: "PERCENTAGE" | "FIXED_AMOUNT";
  discountValue: number;
  maxDiscountCap?: number | null;
  excludeSaleItems: boolean;
  minCartSubtotal: number;
  enableTieredLadder?: boolean;
  tiers?: PriceLockTier[];
  lockDurationMinutes: number;
  secretSalt: string;
}

const EMPTY_DISCOUNT: FunctionRunResult = {
  discountApplicationStrategy: "FIRST",
  discounts: [],
};

const CHECKOUT_BADGE_MESSAGE = "CartLock Price Reservation Active";

export function computeCartLockSignature(
  expiresAt: string,
  secretSalt: string,
): string {
  const normalizedExpires = String(expiresAt || "").trim();
  const normalizedSalt = String(secretSalt || "").trim();
  const payload = `${normalizedSalt}::cartlock_price_lock_v1::${normalizedExpires}::${normalizedSalt.split("").reverse().join("")}`;

  let h1 = 0x811c9dc5 >>> 0;
  let h2 = 0xcbf29ce4 >>> 0;
  let h3 = 0x84222325 >>> 0;
  let h4 = 0x9e3779b9 >>> 0;

  for (let i = 0; i < payload.length; i++) {
    const code = payload.charCodeAt(i);
    h1 = Math.imul(h1 ^ code, 0x01000193) >>> 0;
    h2 = Math.imul(h2 ^ ((code << 5) | (code >>> 3)), 0x1b873593) >>> 0;
    h3 = Math.imul(h3 ^ (code + i * 31), 0x85ebca6b) >>> 0;
    h4 = Math.imul(h4 ^ (code ^ (h1 & 0xff)), 0xc2b2ae35) >>> 0;
  }

  h1 = Math.imul(h1 ^ (h1 >>> 16), 0x85ebca6b) >>> 0;
  h2 = Math.imul(h2 ^ (h2 >>> 13), 0xc2b2ae35) >>> 0;
  h3 = Math.imul(h3 ^ (h3 >>> 16), 0x27d4eb2d) >>> 0;
  h4 = Math.imul(h4 ^ (h4 >>> 15), 0x165667b1) >>> 0;

  const hex = [h1, h2, h3, h4]
    .map((n) => (n >>> 0).toString(16).padStart(8, "0"))
    .join("");

  return `cl_sig_${hex}`;
}

function constantTimeEquals(a: string, b: string): boolean {
  if (!a || !b || a.length !== b.length) return false;
  let diff = 0;
  for (let i = 0; i < a.length; i++) {
    diff |= a.charCodeAt(i) ^ b.charCodeAt(i);
  }
  return diff === 0;
}

function parseTimestampMs(raw: string | undefined | null): number {
  if (!raw) return NaN;
  const trimmed = raw.trim();
  if (/^\d+$/.test(trimmed)) {
    const num = Number(trimmed);
    return num < 1e12 ? num * 1000 : num;
  }
  return Date.parse(trimmed);
}

export function run(input: RunInput): FunctionRunResult {
  const rawConfig = input.discountNode?.metafield?.value;
  if (!rawConfig) {
    return EMPTY_DISCOUNT;
  }

  let config: CartLockMetafieldConfig;
  try {
    config = JSON.parse(rawConfig) as CartLockMetafieldConfig;
  } catch {
    return EMPTY_DISCOUNT;
  }

  if (config.isActive === false || !config.secretSalt) {
    return EMPTY_DISCOUNT;
  }

  const expiresAtAttr = input.cart?.expiresAt?.value;
  const signatureAttr = input.cart?.signature?.value;
  if (!expiresAtAttr || !signatureAttr) {
    return EMPTY_DISCOUNT;
  }

  // 1. Anti-Inspect-Element Verification
  const expectedSignature = computeCartLockSignature(
    expiresAtAttr,
    config.secretSalt,
  );
  if (!constantTimeEquals(expectedSignature, signatureAttr.trim())) {
    return EMPTY_DISCOUNT;
  }

  // 2. Expiration Timestamp Verification against shop.localTime
  const expiresAtMs = parseTimestampMs(expiresAtAttr);
  const shopNowMs = parseTimestampMs(input.shop?.localTime?.dateTime);
  if (
    !Number.isFinite(expiresAtMs) ||
    !Number.isFinite(shopNowMs) ||
    shopNowMs >= expiresAtMs
  ) {
    return EMPTY_DISCOUNT;
  }

  // 3. Minimum Cart Subtotal & Dynamic Tiered Price Lock Ladder Resolution
  const cartSubtotal = parseFloat(input.cart?.cost?.subtotalAmount?.amount || "0");
  let activeDiscountValue = Number(config.discountValue || 0);
  let requiredMinSubtotal = Number(config.minCartSubtotal || 0);

  if (
    config.enableTieredLadder &&
    Array.isArray(config.tiers) &&
    config.tiers.length > 0
  ) {
    const sortedTiers = [...config.tiers].sort(
      (a, b) => Number(a.threshold) - Number(b.threshold),
    );
    requiredMinSubtotal = Number(sortedTiers[0].threshold || requiredMinSubtotal);
    let matchedTier: PriceLockTier | null = null;
    for (const tier of sortedTiers) {
      if (cartSubtotal >= Number(tier.threshold)) {
        matchedTier = tier;
      }
    }
    if (!matchedTier) {
      return EMPTY_DISCOUNT;
    }
    activeDiscountValue = Number(matchedTier.discountValue || activeDiscountValue);
  } else if (cartSubtotal < requiredMinSubtotal) {
    return EMPTY_DISCOUNT;
  }

  // 4. Margin Shield: Filter out clearance/sale items if excludeSaleItems is active
  const eligibleTargets: Array<{ cartLine: { id: string } }> = [];
  let eligibleSubtotal = 0;

  for (const line of input.cart?.lines || []) {
    const activePrice = parseFloat(line.cost?.amountPerQuantity?.amount || "0");
    const compareAtPrice = parseFloat(
      line.cost?.compareAtAmountPerQuantity?.amount || "0",
    );
    const isSaleItem = compareAtPrice > activePrice && compareAtPrice > 0;

    if (config.excludeSaleItems && isSaleItem) {
      continue;
    }

    eligibleTargets.push({
      cartLine: { id: line.id },
    });
    eligibleSubtotal += activePrice * (line.quantity || 1);
  }

  if (eligibleTargets.length === 0 || eligibleSubtotal <= 0) {
    return EMPTY_DISCOUNT;
  }

  // 5. Calculate Discount Value & Enforce Max Dollar Cap (`maxDiscountCap`)
  const maxCap =
    config.maxDiscountCap !== undefined && config.maxDiscountCap !== null
      ? Number(config.maxDiscountCap)
      : 0;

  if (config.discountType === "PERCENTAGE") {
    const pct = Math.max(0, Math.min(100, activeDiscountValue));
    const uncappedDollars = (eligibleSubtotal * pct) / 100;

    if (maxCap > 0 && uncappedDollars > maxCap) {
      const cappedAmount = Math.min(eligibleSubtotal, maxCap).toFixed(2);
      return {
        discountApplicationStrategy: "FIRST",
        discounts: [
          {
            message: CHECKOUT_BADGE_MESSAGE,
            targets: eligibleTargets,
            value: {
              fixedAmount: {
                amount: cappedAmount,
                appliesToEachItem: false,
              },
            },
          },
        ],
      };
    }

    return {
      discountApplicationStrategy: "FIRST",
      discounts: [
        {
          message: CHECKOUT_BADGE_MESSAGE,
          targets: eligibleTargets,
          value: {
            percentage: {
              value: pct.toFixed(1),
            },
          },
        },
      ],
    };
  }

  // FIXED_AMOUNT discount
  let fixedDollars = Math.min(
    eligibleSubtotal,
    Math.max(0, activeDiscountValue),
  );
  if (maxCap > 0 && fixedDollars > maxCap) {
    fixedDollars = Math.min(eligibleSubtotal, maxCap);
  }

  if (fixedDollars <= 0) {
    return EMPTY_DISCOUNT;
  }

  return {
    discountApplicationStrategy: "FIRST",
    discounts: [
      {
        message: CHECKOUT_BADGE_MESSAGE,
        targets: eligibleTargets,
        value: {
          fixedAmount: {
            amount: fixedDollars.toFixed(2),
            appliesToEachItem: false,
          },
        },
      },
    ],
  };
}
