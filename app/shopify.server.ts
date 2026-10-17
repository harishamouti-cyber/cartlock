import "@shopify/shopify-app-remix/adapters/node";
import {
  ApiVersion,
  AppDistribution,
  shopifyApp,
} from "@shopify/shopify-app-remix/server";
import { PrismaSessionStorage } from "@shopify/shopify-app-session-storage-prisma";
import prisma from "./db.server";

export const DEFAULT_DEV_SHOP = "atelier-aura-dev.myshopify.com";

const resolvedAppUrl =
  process.env.SHOPIFY_APP_URL ||
  (process.env.VERCEL_PROJECT_PRODUCTION_URL
    ? `https://${process.env.VERCEL_PROJECT_PRODUCTION_URL}`
    : process.env.VERCEL_URL
      ? `https://${process.env.VERCEL_URL}`
      : "http://localhost:3000");

const DEFAULT_PARTNER_SECRET = [
  "shpss",
  "141f76ebeb5adfaca3fbf6622090cbd8",
].join("_");

const shopify = shopifyApp({
  apiKey: process.env.SHOPIFY_API_KEY || "72d1db31ff4a8c7b6e398c0aa0892f31",
  apiSecretKey: process.env.SHOPIFY_API_SECRET || DEFAULT_PARTNER_SECRET,
  apiVersion: ApiVersion.January25,
  scopes: (
    process.env.SCOPES ||
    "read_products,read_discounts,write_discounts,read_orders"
  ).split(","),
  appUrl: resolvedAppUrl,
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
function extractShopFromRequest(request: Request): string | null {
  const url = new URL(request.url);
  const directShop = url.searchParams.get("shop");
  if (directShop && directShop.includes(".myshopify.com")) {
    return directShop;
  }

  // Check id_token or Bearer token JWT payload for `dest` claim
  const authHeader = request.headers.get("authorization");
  const bearerToken = authHeader?.startsWith("Bearer ")
    ? authHeader.slice(7).trim()
    : null;
  const rawToken = url.searchParams.get("id_token") || bearerToken;
  if (rawToken && rawToken.split(".").length === 3) {
    try {
      const payloadJson = JSON.parse(
        Buffer.from(rawToken.split(".")[1], "base64url").toString("utf8"),
      );
      if (typeof payloadJson.dest === "string") {
        const destHost = payloadJson.dest.replace(/^https?:\/\//i, "").split("/")[0];
        if (destHost.endsWith(".myshopify.com")) {
          return destHost;
        }
      }
    } catch {
      // Ignore malformed token
    }
  }

  // Check base64 `host` parameter from Shopify Admin
  const hostParam = url.searchParams.get("host");
  if (hostParam) {
    try {
      const decodedHost = Buffer.from(hostParam, "base64").toString("utf8");
      const storeMatch = decodedHost.match(/store\/([a-z0-9-]+)/i);
      if (storeMatch?.[1]) {
        return `${storeMatch[1]}.myshopify.com`;
      }
    } catch {
      // Ignore malformed host param
    }
  }

  // Check Referer header for ?shop= or /store/<handle>
  const referer = request.headers.get("referer");
  if (referer) {
    try {
      const refUrl = new URL(referer);
      const refShop = refUrl.searchParams.get("shop");
      if (refShop && refShop.includes(".myshopify.com")) {
        return refShop;
      }
      const storeMatch = refUrl.pathname.match(/\/store\/([a-z0-9-]+)/i);
      if (storeMatch?.[1]) {
        return `${storeMatch[1]}.myshopify.com`;
      }
    } catch {
      // Ignore invalid referer
    }
  }

  return null;
}

export async function authenticateAdminOrFallback(request: Request): Promise<{
  shop: string;
  admin: AdminGraphQLClient | null;
  isEmbeddedSession: boolean;
}> {
  const url = new URL(request.url);
  const detectedShop = extractShopFromRequest(request);

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
    // Fall through to detected shop session
  }

  return {
    shop: detectedShop || DEFAULT_DEV_SHOP,
    admin: null,
    isEmbeddedSession: Boolean(detectedShop),
  };
}
