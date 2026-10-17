import "@shopify/shopify-app-remix/adapters/node";
import {
  ApiVersion,
  AppDistribution,
  shopifyApp,
} from "@shopify/shopify-app-remix/server";
import { PrismaSessionStorage } from "@shopify/shopify-app-session-storage-prisma";
import prisma from "./db.server";

export const DEFAULT_DEV_SHOP = "atelier-aura-dev.myshopify.com";

const shopify = shopifyApp({
  apiKey: process.env.SHOPIFY_API_KEY || "72d1db31ff4a8c7b6e398c0aa0892f31",
  apiSecretKey:
    process.env.SHOPIFY_API_SECRET ||
    "cartlock_dev_api_secret_9f8e7d6c5b4a3f2e1d0c",
  apiVersion: ApiVersion.January25,
  scopes: (
    process.env.SCOPES ||
    "read_products,read_discounts,write_discounts,read_orders"
  ).split(","),
  appUrl: process.env.SHOPIFY_APP_URL || "http://localhost:3000",
  authPathPrefix: "/auth",
  sessionStorage: new PrismaSessionStorage(prisma),
  distribution: AppDistribution.AppStore,
  future: {
    unstable_newEmbeddedAuthStrategy: true,
  },
});

export default shopify;
export const apiVersion = ApiVersion.January25;
export const addDocumentResponseHeaders = shopify.addDocumentResponseHeaders;
export const authenticate = shopify.authenticate;
export const unauthenticated = shopify.unauthenticated;
export const login = shopify.login;
export const registerWebhooks = shopify.registerWebhooks;
export const sessionStorage = shopify.sessionStorage;

export interface AdminGraphQLClient {
  graphql: (
    query: string,
    options?: { variables?: Record<string, unknown> },
  ) => Promise<Response>;
}

/**
 * Authenticates a Shopify Admin request when running embedded inside Shopify Admin,
 * and falls back gracefully in standalone local development / preview mode so all routes
 * remain 100% interactive without requiring a live OAuth tunnel.
 */
export async function authenticateAdminOrFallback(request: Request): Promise<{
  shop: string;
  admin: AdminGraphQLClient | null;
  isEmbeddedSession: boolean;
}> {
  const url = new URL(request.url);
  const queryShop = url.searchParams.get("shop");

  try {
    if (
      url.searchParams.has("id_token") ||
      url.searchParams.has("hmac") ||
      request.headers.get("authorization")?.startsWith("Bearer ")
    ) {
      const authResult = await shopify.authenticate.admin(request);
      return {
        shop: authResult.session.shop,
        admin: authResult.admin,
        isEmbeddedSession: true,
      };
    }
  } catch {
    // Fall through to local preview session
  }

  return {
    shop: queryShop || DEFAULT_DEV_SHOP,
    admin: null,
    isEmbeddedSession: false,
  };
}
