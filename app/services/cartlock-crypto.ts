export interface CartLockFunctionConfig {
  isActive?: boolean;
  discountType: "PERCENTAGE" | "FIXED_AMOUNT";
  discountValue: number;
  maxDiscountCap: number | null;
  excludeSaleItems: boolean;
  minCartSubtotal: number;
  lockDurationMinutes: number;
  secretSalt: string;
}

export interface CartLineInput {
  id: string;
  title?: string;
  quantity: number;
  cost: {
    amountPerQuantity: {
      amount: string | number;
    };
    compareAtAmountPerQuantity?: {
      amount: string | number;
    } | null;
  };
  merchandise?: {
    __typename?: string;
    id: string;
    title?: string;
  };
}

export interface FunctionRunInput {
  cart: {
    cost: {
      subtotalAmount: {
        amount: string | number;
      };
    };
    expiresAt?: {
      value: string;
    } | null;
    signature?: {
      value: string;
    } | null;
    lines: CartLineInput[];
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

export interface ShopifyDiscountTarget {
  cartLine: {
    id: string;
  };
}

export interface ShopifyDiscountOutput {
  discounts: Array<{
    message: string;
    targets: ShopifyDiscountTarget[];
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
  discountApplicationStrategy: "FIRST" | "MAXIMUM";
}

export interface FunctionEvaluationDiagnostics {
  status:
    | "GRANTED"
    | "GRANTED_CAPPED"
    | "REVOKED_EXPIRED"
    | "REVOKED_SIGNATURE_INVALID"
    | "REVOKED_BELOW_MIN_SUBTOTAL"
    | "REVOKED_ALL_ITEMS_ON_SALE"
    | "REVOKED_INACTIVE";
  statusReason: string;
  signatureValid: boolean;
  expectedSignature: string;
  providedSignature: string;
  secondsRemaining: number;
  cartSubtotal: number;
  eligibleSubtotal: number;
  excludedSaleSubtotal: number;
  eligibleLineIds: string[];
  excludedLineIds: string[];
  uncappedDiscountDollars: number;
  finalDiscountDollars: number;
  finalPayableSubtotal: number;
  wasCappedByMaxCap: boolean;
  stretchGoalShortfall: number;
  output: ShopifyDiscountOutput;
}

export const CARTLOCK_CHECKOUT_BADGE = "CartLock Price Reservation Active";

const EMPTY_DISCOUNT: ShopifyDiscountOutput = {
  discountApplicationStrategy: "FIRST",
  discounts: [],
};

/**
 * Deterministic 128-bit cryptographic-style keyed signature compatible with
 * both Node.js and Shopify Functions' QuickJS/Javy WebAssembly runtime.
 * Prevents shoppers from tampering with `_cartlock_expires_at` via Inspect Element.
 */
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

  // Final avalanche mixing rounds
  h1 = Math.imul(h1 ^ (h1 >>> 16), 0x85ebca6b) >>> 0;
  h2 = Math.imul(h2 ^ (h2 >>> 13), 0xc2b2ae35) >>> 0;
  h3 = Math.imul(h3 ^ (h3 >>> 16), 0x27d4eb2d) >>> 0;
  h4 = Math.imul(h4 ^ (h4 >>> 15), 0x165667b1) >>> 0;

  const hex = [h1, h2, h3, h4]
    .map((n) => (n >>> 0).toString(16).padStart(8, "0"))
    .join("");

  return `cl_sig_${hex}`;
}

/**
 * Constant-time string comparison to verify `_cartlock_signature`
 */
export function verifyCartLockSignature(
  expiresAt: string | null | undefined,
  signature: string | null | undefined,
  secretSalt: string,
): boolean {
  if (!expiresAt || !signature || !secretSalt) {
    return false;
  }
  const expected = computeCartLockSignature(expiresAt, secretSalt);
  const actual = String(signature).trim();
  if (expected.length !== actual.length) {
    return false;
  }
  let diff = 0;
  for (let i = 0; i < expected.length; i++) {
    diff |= expected.charCodeAt(i) ^ actual.charCodeAt(i);
  }
  return diff === 0;
}

/**
 * Sanitizes raw development store handles or domains into clean title-case brand names.
 * Example: "sub-cartlock-dev-892.myshopify.com" -> "Cartlock"
 * Example: "atelier-aura-staging-store.myshopify.com" -> "Atelier Aura"
 */
export function sanitizeStoreDisplayName(rawInput: string): string {
  if (!rawInput) return "Atelier Aura";
  const withoutDomain = rawInput
    .trim()
    .replace(/^https?:\/\//i, "")
    .replace(/\.myshopify\.com.*$/i, "")
    .replace(/\/.*$/, "");

  const noiseTokens = new Set([
    "sub",
    "dev",
    "development",
    "staging",
    "test",
    "testing",
    "sandbox",
    "demo",
    "store",
    "shop",
    "myshopify",
    "app",
    "preview",
  ]);

  const rawTokens = withoutDomain
    .split(/[-_.\s]+/)
    .map((t) => t.trim())
    .filter((t) => t.length > 0 && !/^\d+$/.test(t));

  const cleanedTokens = rawTokens.filter(
    (t) => !noiseTokens.has(t.toLowerCase()),
  );

  const tokensToFormat =
    cleanedTokens.length > 0 ? cleanedTokens : rawTokens.slice(0, 2);

  if (tokensToFormat.length === 0) {
    return "Atelier Aura";
  }

  return tokensToFormat
    .map((word) => {
      if (word.toLowerCase() === "cartlock") return "CartLock";
      return word.charAt(0).toUpperCase() + word.slice(1).toLowerCase();
    })
    .join(" ");
}

/**
 * Pure evaluation engine for the CartLock Native Shopify Discount Function.
 * Executes identical logic in the Function runtime and the Admin Simulator.
 */
export function evaluateCartLockFunction(
  input: FunctionRunInput,
  overrideConfig?: Partial<CartLockFunctionConfig>,
): FunctionEvaluationDiagnostics {
  let parsedMetafield: Partial<CartLockFunctionConfig> = {};
  if (input.discountNode?.metafield?.value) {
    try {
      parsedMetafield = JSON.parse(input.discountNode.metafield.value);
    } catch {
      parsedMetafield = {};
    }
  }

  const config: CartLockFunctionConfig = {
    isActive: parsedMetafield.isActive ?? true,
    discountType: parsedMetafield.discountType ?? "PERCENTAGE",
    discountValue: Number(parsedMetafield.discountValue ?? 10),
    maxDiscountCap:
      parsedMetafield.maxDiscountCap !== undefined
        ? parsedMetafield.maxDiscountCap
        : 25,
    excludeSaleItems: parsedMetafield.excludeSaleItems ?? true,
    minCartSubtotal: Number(parsedMetafield.minCartSubtotal ?? 50),
    lockDurationMinutes: Number(parsedMetafield.lockDurationMinutes ?? 15),
    secretSalt: String(parsedMetafield.secretSalt ?? ""),
    ...overrideConfig,
  };

  const cartSubtotal = Number(input.cart?.cost?.subtotalAmount?.amount ?? 0);
  const expiresAtRaw = input.cart?.expiresAt?.value ?? "";
  const providedSignature = input.cart?.signature?.value ?? "";
  const expectedSignature = expiresAtRaw
    ? computeCartLockSignature(expiresAtRaw, config.secretSalt)
    : "";

  const signatureValid = verifyCartLockSignature(
    expiresAtRaw,
    providedSignature,
    config.secretSalt,
  );

  // Parse timestamps (supports ISO-8601 or epoch ms/seconds)
  const parseTimestampMs = (val: string): number => {
    if (!val) return NaN;
    if (/^\d+$/.test(val.trim())) {
      const num = Number(val.trim());
      return num < 1e12 ? num * 1000 : num;
    }
    return Date.parse(val);
  };

  const expiresAtMs = parseTimestampMs(expiresAtRaw);
  const shopNowMs = parseTimestampMs(input.shop?.localTime?.dateTime);
  const secondsRemaining =
    Number.isFinite(expiresAtMs) && Number.isFinite(shopNowMs)
      ? Math.floor((expiresAtMs - shopNowMs) / 1000)
      : -1;

  // Partition line items by Margin Shield (`excludeSaleItems`)
  const eligibleLineIds: string[] = [];
  const excludedLineIds: string[] = [];
  let eligibleSubtotal = 0;
  let excludedSaleSubtotal = 0;

  for (const line of input.cart?.lines ?? []) {
    const unitPrice = Number(line.cost?.amountPerQuantity?.amount ?? 0);
    const compareAtPrice = Number(
      line.cost?.compareAtAmountPerQuantity?.amount ?? 0,
    );
    const lineTotal = unitPrice * (line.quantity || 1);
    const isOnSale = compareAtPrice > unitPrice && compareAtPrice > 0;

    if (config.excludeSaleItems && isOnSale) {
      excludedLineIds.push(line.id);
      excludedSaleSubtotal += lineTotal;
    } else {
      eligibleLineIds.push(line.id);
      eligibleSubtotal += lineTotal;
    }
  }

  const stretchGoalShortfall = Math.max(
    0,
    Number((config.minCartSubtotal - cartSubtotal).toFixed(2)),
  );

  // 1. Check active flag
  if (config.isActive === false) {
    return {
      status: "REVOKED_INACTIVE",
      statusReason: "CartLock Price Reservation campaign is currently paused.",
      signatureValid,
      expectedSignature,
      providedSignature,
      secondsRemaining: Math.max(0, secondsRemaining),
      cartSubtotal,
      eligibleSubtotal,
      excludedSaleSubtotal,
      eligibleLineIds,
      excludedLineIds,
      uncappedDiscountDollars: 0,
      finalDiscountDollars: 0,
      finalPayableSubtotal: cartSubtotal,
      wasCappedByMaxCap: false,
      stretchGoalShortfall,
      output: EMPTY_DISCOUNT,
    };
  }

  // 2. Anti-Inspect-Element cryptographic check
  if (!signatureValid) {
    return {
      status: "REVOKED_SIGNATURE_INVALID",
      statusReason:
        "Anti-Inspect-Element Shield triggered: _cartlock_signature is missing or does not match the cryptographic hash of _cartlock_expires_at and secretSalt.",
      signatureValid: false,
      expectedSignature,
      providedSignature,
      secondsRemaining: Math.max(0, secondsRemaining),
      cartSubtotal,
      eligibleSubtotal,
      excludedSaleSubtotal,
      eligibleLineIds,
      excludedLineIds,
      uncappedDiscountDollars: 0,
      finalDiscountDollars: 0,
      finalPayableSubtotal: cartSubtotal,
      wasCappedByMaxCap: false,
      stretchGoalShortfall,
      output: EMPTY_DISCOUNT,
    };
  }

  // 3. Expiration check against shop local time
  if (secondsRemaining <= 0) {
    return {
      status: "REVOKED_EXPIRED",
      statusReason:
        "Reservation timer has expired against shop.localTime. Discount Function automatically revoked the price lock to $0.00.",
      signatureValid: true,
      expectedSignature,
      providedSignature,
      secondsRemaining: 0,
      cartSubtotal,
      eligibleSubtotal,
      excludedSaleSubtotal,
      eligibleLineIds,
      excludedLineIds,
      uncappedDiscountDollars: 0,
      finalDiscountDollars: 0,
      finalPayableSubtotal: cartSubtotal,
      wasCappedByMaxCap: false,
      stretchGoalShortfall,
      output: EMPTY_DISCOUNT,
    };
  }

  // 4. Minimum Cart Subtotal check
  if (cartSubtotal < config.minCartSubtotal) {
    return {
      status: "REVOKED_BELOW_MIN_SUBTOTAL",
      statusReason: `Cart subtotal ($${cartSubtotal.toFixed(2)}) is below minimum threshold ($${config.minCartSubtotal.toFixed(2)}). Add $${stretchGoalShortfall.toFixed(2)} more to unlock.`,
      signatureValid: true,
      expectedSignature,
      providedSignature,
      secondsRemaining,
      cartSubtotal,
      eligibleSubtotal,
      excludedSaleSubtotal,
      eligibleLineIds,
      excludedLineIds,
      uncappedDiscountDollars: 0,
      finalDiscountDollars: 0,
      finalPayableSubtotal: cartSubtotal,
      wasCappedByMaxCap: false,
      stretchGoalShortfall,
      output: EMPTY_DISCOUNT,
    };
  }

  // 5. Margin Shield: Check if any eligible non-sale items remain
  if (eligibleLineIds.length === 0 || eligibleSubtotal <= 0) {
    return {
      status: "REVOKED_ALL_ITEMS_ON_SALE",
      statusReason:
        "Margin Shield protected clearance items: all items in cart have a compare-at price higher than active price.",
      signatureValid: true,
      expectedSignature,
      providedSignature,
      secondsRemaining,
      cartSubtotal,
      eligibleSubtotal: 0,
      excludedSaleSubtotal,
      eligibleLineIds: [],
      excludedLineIds,
      uncappedDiscountDollars: 0,
      finalDiscountDollars: 0,
      finalPayableSubtotal: cartSubtotal,
      wasCappedByMaxCap: false,
      stretchGoalShortfall: 0,
      output: EMPTY_DISCOUNT,
    };
  }

  const targets: ShopifyDiscountTarget[] = eligibleLineIds.map((id) => ({
    cartLine: { id },
  }));

  // 6. Compute discount & apply maxDiscountCap
  let uncappedDiscountDollars = 0;
  let finalDiscountDollars = 0;
  let wasCappedByMaxCap = false;

  if (config.discountType === "PERCENTAGE") {
    const pct = Math.max(0, Math.min(100, config.discountValue));
    uncappedDiscountDollars = Number(
      ((eligibleSubtotal * pct) / 100).toFixed(2),
    );
    if (
      config.maxDiscountCap &&
      config.maxDiscountCap > 0 &&
      uncappedDiscountDollars > config.maxDiscountCap
    ) {
      finalDiscountDollars = Number(
        Math.min(eligibleSubtotal, config.maxDiscountCap).toFixed(2),
      );
      wasCappedByMaxCap = true;
    } else {
      finalDiscountDollars = uncappedDiscountDollars;
    }
  } else {
    uncappedDiscountDollars = Number(
      Math.min(eligibleSubtotal, Math.max(0, config.discountValue)).toFixed(2),
    );
    if (
      config.maxDiscountCap &&
      config.maxDiscountCap > 0 &&
      uncappedDiscountDollars > config.maxDiscountCap
    ) {
      finalDiscountDollars = Number(
        Math.min(eligibleSubtotal, config.maxDiscountCap).toFixed(2),
      );
      wasCappedByMaxCap = true;
    } else {
      finalDiscountDollars = uncappedDiscountDollars;
    }
  }

  const discountValuePayload =
    config.discountType === "PERCENTAGE" && !wasCappedByMaxCap
      ? {
          percentage: {
            value: config.discountValue.toFixed(1),
          },
        }
      : {
          fixedAmount: {
            amount: finalDiscountDollars.toFixed(2),
            appliesToEachItem: false,
          },
        };

  const output: ShopifyDiscountOutput = {
    discountApplicationStrategy: "FIRST",
    discounts: [
      {
        message: CARTLOCK_CHECKOUT_BADGE,
        targets,
        value: discountValuePayload,
      },
    ],
  };

  return {
    status: wasCappedByMaxCap ? "GRANTED_CAPPED" : "GRANTED",
    statusReason: wasCappedByMaxCap
      ? `Price reservation verified (${secondsRemaining}s remaining). Margin Shield capped ${config.discountValue}% discount from $${uncappedDiscountDollars.toFixed(2)} to $${finalDiscountDollars.toFixed(2)} maximum cap.`
      : `Price reservation verified (${secondsRemaining}s remaining). Applied ${config.discountType === "PERCENTAGE" ? `${config.discountValue}%` : `$${config.discountValue.toFixed(2)}`} automatic discount ($${finalDiscountDollars.toFixed(2)} saved).`,
    signatureValid: true,
    expectedSignature,
    providedSignature,
    secondsRemaining,
    cartSubtotal,
    eligibleSubtotal,
    excludedSaleSubtotal,
    eligibleLineIds,
    excludedLineIds,
    uncappedDiscountDollars,
    finalDiscountDollars,
    finalPayableSubtotal: Number(
      Math.max(0, cartSubtotal - finalDiscountDollars).toFixed(2),
    ),
    wasCappedByMaxCap,
    stretchGoalShortfall: 0,
    output,
  };
}
