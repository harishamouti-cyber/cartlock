import type { ActionFunctionArgs } from "@remix-run/node";
import { json } from "@remix-run/node";
import { authenticate, DEFAULT_DEV_SHOP } from "../shopify.server";
import {
  processOrdersCreateAttribution,
  type ShopifyOrderWebhookPayload,
} from "../services/order-attribution.server";

export const action = async ({ request }: ActionFunctionArgs) => {
  try {
    if (request.headers.get("X-Shopify-Hmac-Sha256")) {
      const { shop, payload } = await authenticate.webhook(request);
      const result = await processOrdersCreateAttribution(
        shop,
        payload as ShopifyOrderWebhookPayload,
      );
      return json({ ok: true, ...result });
    }
  } catch (err) {
    console.error("Webhook HMAC verification failed:", err);
    return new Response("Unauthorized webhook", { status: 401 });
  }

  // Allow local JSON webhook testing in development
  const body = (await request.json()) as ShopifyOrderWebhookPayload & {
    shop?: string;
  };
  const shop = body.shop || DEFAULT_DEV_SHOP;
  const result = await processOrdersCreateAttribution(shop, body);
  return json({ ok: true, ...result });
};
