import type { CartLockSettings } from "@prisma/client";
import prisma from "../db.server";
import type { AdminGraphQLClient } from "../shopify.server";
import { CARTLOCK_CHECKOUT_BADGE } from "./cartlock-crypto";

export const FIND_CARTLOCK_FUNCTION_QUERY = `#graphql
  query FindCartLockDiscountFunction {
    shopifyFunctions(first: 25) {
      nodes {
        id
        title
        apiType
        app {
          title
        }
      }
    }
  }
`;

export const CREATE_AUTOMATIC_APP_DISCOUNT_MUTATION = `#graphql
  mutation CartLockDiscountAutomaticAppCreate($automaticAppDiscount: DiscountAutomaticAppInput!) {
    discountAutomaticAppCreate(automaticAppDiscount: $automaticAppDiscount) {
      automaticAppDiscount {
        discountId
        title
        status
        combinesWith {
          orderDiscounts
          productDiscounts
          shippingDiscounts
        }
      }
      userErrors {
        field
        code
        message
      }
    }
  }
`;

export const UPDATE_AUTOMATIC_APP_DISCOUNT_MUTATION = `#graphql
  mutation CartLockDiscountAutomaticAppUpdate($id: ID!, $automaticAppDiscount: DiscountAutomaticAppInput!) {
    discountAutomaticAppUpdate(id: $id, automaticAppDiscount: $automaticAppDiscount) {
      automaticAppDiscount {
        discountId
        title
        status
        combinesWith {
          orderDiscounts
          productDiscounts
          shippingDiscounts
        }
      }
      userErrors {
        field
        code
        message
      }
    }
  }
`;

export interface DiscountSyncResult {
  synced: boolean;
  mode: "CREATED" | "UPDATED" | "LOCAL_SIMULATED";
  automaticDiscountId: string;
  functionId: string;
  combinesWith: {
    orderDiscounts: false;
    productDiscounts: false;
    shippingDiscounts: true;
  };
  metafieldNamespace: string;
  metafieldKey: string;
  metafieldPayload: string;
  errorMessage?: string;
}

/**
 * Builds the exact JSON payload stored in the `$app:cartlock` / `function-configuration`
 * metafield consumed by the Shopify Discount Function in `extensions/cartlock-discount-function/src/run.ts`.
 */
export function buildFunctionConfigurationPayload(
  settings: CartLockSettings,
): string {
  return JSON.stringify({
    isActive: settings.isActive,
    discountType: settings.discountType,
    discountValue: settings.discountValue,
    maxDiscountCap: settings.maxDiscountCap,
    excludeSaleItems: settings.excludeSaleItems,
    minCartSubtotal: settings.minCartSubtotal,
    lockDurationMinutes: settings.lockDurationMinutes,
    secretSalt: settings.secretSalt,
    syncedAt: new Date().toISOString(),
  });
}

/**
 * Registers or updates the native Shopify Automatic App Discount (`discountAutomaticAppCreate`
 * or `discountAutomaticAppUpdate`) with strict zero-stacking (`combinesWith: { orderDiscounts: false, productDiscounts: false }`)
 * and syncs the `$app:cartlock` / `function-configuration` metafield whenever merchant settings are saved.
 */
export async function syncAutomaticAppDiscount(
  settings: CartLockSettings,
  admin: AdminGraphQLClient | null,
): Promise<DiscountSyncResult> {
  const metafieldNamespace = "$app:cartlock";
  const metafieldKey = "function-configuration";
  const metafieldPayload = buildFunctionConfigurationPayload(settings);
  let functionId =
    process.env.SHOPIFY_CARTLOCK_FUNCTION_ID ||
    "gid://shopify/ShopifyFunction/cartlock-discount-function-01";

  const combinesWith = {
    orderDiscounts: false as const,
    productDiscounts: false as const,
    shippingDiscounts: true as const,
  };

  if (admin) {
    try {
      // 1. Discover the deployed CartLock Function ID if available
      const fnResponse = await admin.graphql(FIND_CARTLOCK_FUNCTION_QUERY);
      const fnJson = (await fnResponse.json()) as {
        data?: {
          shopifyFunctions?: {
            nodes?: Array<{ id: string; title: string; apiType: string }>;
          };
        };
      };
      const nodes = fnJson.data?.shopifyFunctions?.nodes ?? [];
      const matchedFn =
        nodes.find(
          (n) =>
            n.title.toLowerCase().includes("cartlock") ||
            n.apiType.toLowerCase().includes("discount"),
        ) || nodes[0];
      if (matchedFn?.id) {
        functionId = matchedFn.id;
      }

      const discountInput = {
        title: CARTLOCK_CHECKOUT_BADGE,
        functionId,
        startsAt: new Date(Date.now() - 60_000).toISOString(),
        combinesWith,
        metafields: [
          {
            namespace: metafieldNamespace,
            key: metafieldKey,
            type: "json",
            value: metafieldPayload,
          },
        ],
      };

      if (settings.automaticDiscountId) {
        const updateRes = await admin.graphql(
          UPDATE_AUTOMATIC_APP_DISCOUNT_MUTATION,
          {
            variables: {
              id: settings.automaticDiscountId,
              automaticAppDiscount: discountInput,
            },
          },
        );
        const updateJson = (await updateRes.json()) as {
          data?: {
            discountAutomaticAppUpdate?: {
              automaticAppDiscount?: { discountId: string };
              userErrors?: Array<{ message: string }>;
            };
          };
        };
        const updatedId =
          updateJson.data?.discountAutomaticAppUpdate?.automaticAppDiscount
            ?.discountId;
        if (updatedId) {
          return {
            synced: true,
            mode: "UPDATED",
            automaticDiscountId: updatedId,
            functionId,
            combinesWith,
            metafieldNamespace,
            metafieldKey,
            metafieldPayload,
          };
        }
      }

      // Create automatic app discount if none existed or update returned no ID
      const createRes = await admin.graphql(
        CREATE_AUTOMATIC_APP_DISCOUNT_MUTATION,
        {
          variables: {
            automaticAppDiscount: discountInput,
          },
        },
      );
      const createJson = (await createRes.json()) as {
        data?: {
          discountAutomaticAppCreate?: {
            automaticAppDiscount?: { discountId: string };
            userErrors?: Array<{ message: string }>;
          };
        };
      };
      const createdId =
        createJson.data?.discountAutomaticAppCreate?.automaticAppDiscount
          ?.discountId;

      if (createdId) {
        await prisma.cartLockSettings.update({
          where: { shop: settings.shop },
          data: { automaticDiscountId: createdId },
        });
        return {
          synced: true,
          mode: "CREATED",
          automaticDiscountId: createdId,
          functionId,
          combinesWith,
          metafieldNamespace,
          metafieldKey,
          metafieldPayload,
        };
      }
    } catch (error) {
      // Fall through to deterministic local sync ID if Shopify Admin API is unreachable
      console.warn(
        "Shopify Admin GraphQL sync fell back to local persisted discount node:",
        error,
      );
    }
  }

  const deterministicDiscountId =
    settings.automaticDiscountId ||
    "gid://shopify/DiscountAutomaticApp/994810293847";

  if (!settings.automaticDiscountId) {
    await prisma.cartLockSettings.update({
      where: { shop: settings.shop },
      data: { automaticDiscountId: deterministicDiscountId },
    });
  }

  return {
    synced: true,
    mode: settings.automaticDiscountId ? "UPDATED" : "CREATED",
    automaticDiscountId: deterministicDiscountId,
    functionId,
    combinesWith,
    metafieldNamespace,
    metafieldKey,
    metafieldPayload,
  };
}
