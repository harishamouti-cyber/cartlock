import type { AdminGraphQLClient } from "../shopify.server";

export interface CatalogProductVariant {
  id: string;
  title: string;
  sku: string;
  price: number;
  compareAtPrice: number | null;
  imageUrl: string;
}

export interface CatalogProductItem {
  id: string;
  title: string;
  handle: string;
  vendor: string;
  category: string;
  imageUrl: string;
  imageSource: "featuredImage" | "MediaImage" | "variant.image";
  primaryVariant: CatalogProductVariant;
  variants: CatalogProductVariant[];
  isOnSale: boolean;
}

/**
 * Resilient multi-tiered GraphQL query fetching `featuredImage`, `media(first: 5) { ... on MediaImage }`,
 * and `variants(first: 10) { image }` with `maxWidth: 300` (`width=300`) CDN optimization.
 */
export const CATALOG_PRODUCTS_MEDIA_QUERY = `#graphql
  query FetchCatalogProductsWithMultiTieredMedia($first: Int!) {
    products(first: $first, sortKey: UPDATED_AT, reverse: true) {
      nodes {
        id
        title
        handle
        vendor
        productType
        featuredImage {
          url(transform: { maxWidth: 300 })
          altText
        }
        media(first: 5) {
          nodes {
            ... on MediaImage {
              image {
                url(transform: { maxWidth: 300 })
                altText
              }
            }
          }
        }
        variants(first: 10) {
          nodes {
            id
            title
            sku
            price
            compareAtPrice
            image {
              url(transform: { maxWidth: 300 })
              altText
            }
          }
        }
      }
    }
  }
`;

export function appendWidth300Param(url: string): string {
  if (!url || url.startsWith("data:")) return url;
  try {
    const parsed = new URL(url);
    if (!parsed.searchParams.has("width")) {
      parsed.searchParams.set("width", "300");
    }
    return parsed.toString();
  } catch {
    return url.includes("?") ? `${url}&width=300` : `${url}?width=300`;
  }
}

/**
 * High-craft SVG studio product photography data URIs for crisp, zero-broken-image
 * rendering in both online and sandboxed offline environments.
 */
function createProductStudioSvg(
  bgTop: string,
  bgBottom: string,
  accent: string,
  label: string,
  sublabel: string,
  silhouette: "bottle" | "chronograph" | "diffuser" | "atomizer" | "tote",
): string {
  let illustration = "";
  if (silhouette === "bottle") {
    illustration = `
      <rect x="118" y="42" width="64" height="28" rx="6" fill="#1E293B" stroke="${accent}" stroke-width="2"/>
      <rect x="134" y="70" width="32" height="16" fill="#475569"/>
      <rect x="86" y="86" width="128" height="164" rx="22" fill="#0F172A" stroke="${accent}" stroke-width="2.5"/>
      <rect x="104" y="118" width="92" height="92" rx="10" fill="#F8FAFC"/>
      <text x="150" y="156" text-anchor="middle" font-family="sans-serif" font-weight="700" font-size="13" fill="#0F172A">${label}</text>
      <text x="150" y="176" text-anchor="middle" font-family="monospace" font-size="10" fill="#475569">${sublabel}</text>
    `;
  } else if (silhouette === "chronograph") {
    illustration = `
      <rect x="126" y="28" width="48" height="244" rx="10" fill="#334155"/>
      <circle cx="150" cy="150" r="68" fill="#0F172A" stroke="${accent}" stroke-width="4"/>
      <circle cx="150" cy="150" r="56" fill="#1E293B" stroke="#94A3B8" stroke-width="1.5"/>
      <line x1="150" y1="150" x2="150" y2="112" stroke="${accent}" stroke-width="3" stroke-linecap="round"/>
      <line x1="150" y1="150" x2="180" y2="150" stroke="#F8FAFC" stroke-width="2.5" stroke-linecap="round"/>
      <circle cx="150" cy="150" r="5" fill="${accent}"/>
      <text x="150" y="182" text-anchor="middle" font-family="monospace" font-weight="700" font-size="10" fill="#E2E8F0">${label}</text>
    `;
  } else if (silhouette === "diffuser") {
    illustration = `
      <path d="M105 242 L195 242 L176 92 L124 92 Z" fill="#0F172A" stroke="${accent}" stroke-width="2.5" stroke-linejoin="round"/>
      <line x1="138" y1="92" x2="112" y2="34" stroke="#94A3B8" stroke-width="2.5" stroke-linecap="round"/>
      <line x1="150" y1="92" x2="150" y2="28" stroke="${accent}" stroke-width="2.5" stroke-linecap="round"/>
      <line x1="162" y1="92" x2="188" y2="34" stroke="#94A3B8" stroke-width="2.5" stroke-linecap="round"/>
      <rect x="118" y="138" width="64" height="68" rx="8" fill="#F8FAFC"/>
      <text x="150" y="170" text-anchor="middle" font-family="sans-serif" font-weight="700" font-size="11" fill="#0F172A">${label}</text>
      <text x="150" y="188" text-anchor="middle" font-family="monospace" font-size="9" fill="#64748B">${sublabel}</text>
    `;
  } else if (silhouette === "atomizer") {
    illustration = `
      <rect x="122" y="48" width="56" height="36" rx="8" fill="${accent}"/>
      <rect x="116" y="84" width="68" height="168" rx="16" fill="#0F172A" stroke="#CBD5E1" stroke-width="2"/>
      <rect x="128" y="116" width="44" height="100" rx="6" fill="#1E293B"/>
      <text x="150" y="164" text-anchor="middle" font-family="sans-serif" font-weight="700" font-size="10" fill="#F8FAFC">${label}</text>
      <text x="150" y="180" text-anchor="middle" font-family="monospace" font-size="9" fill="${accent}">${sublabel}</text>
    `;
  } else {
    illustration = `
      <path d="M116 96 C116 58, 184 58, 184 96" fill="none" stroke="#334155" stroke-width="6" stroke-linecap="round"/>
      <rect x="78" y="92" width="144" height="154" rx="18" fill="#0F172A" stroke="${accent}" stroke-width="2.5"/>
      <rect x="102" y="124" width="96" height="84" rx="10" fill="#1E293B" stroke="#475569" stroke-width="1"/>
      <text x="150" y="164" text-anchor="middle" font-family="sans-serif" font-weight="700" font-size="12" fill="#F8FAFC">${label}</text>
      <text x="150" y="184" text-anchor="middle" font-family="monospace" font-size="10" fill="${accent}">${sublabel}</text>
    `;
  }

  const svg = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 300 300" width="300" height="300">
    <defs>
      <linearGradient id="bg" x1="0" y1="0" x2="0" y2="1">
        <stop offset="0%" stop-color="${bgTop}"/>
        <stop offset="100%" stop-color="${bgBottom}"/>
      </linearGradient>
    </defs>
    <rect width="300" height="300" rx="24" fill="url(#bg)"/>
    <ellipse cx="150" cy="256" rx="76" ry="12" fill="rgba(15,23,42,0.12)"/>
    ${illustration}
  </svg>`;

  return `data:image/svg+xml;utf8,${encodeURIComponent(svg)}`;
}

export const CURATED_CATALOG_PRODUCTS: CatalogProductItem[] = [
  {
    id: "gid://shopify/Product/8841001",
    title: "Santal 33 Botanical Extrait",
    handle: "santal-33-botanical-extrait",
    vendor: "Atelier Aura",
    category: "Fine Fragrance",
    imageUrl: createProductStudioSvg(
      "#F8FAFC",
      "#E2E8F0",
      "#10B981",
      "SANTAL 33",
      "100ML EXTRAIT",
      "bottle",
    ),
    imageSource: "featuredImage",
    isOnSale: false,
    primaryVariant: {
      id: "gid://shopify/ProductVariant/44901283900",
      title: "100ml / Eau de Parfum",
      sku: "AA-SAN-100",
      price: 168.0,
      compareAtPrice: null,
      imageUrl: createProductStudioSvg(
        "#F8FAFC",
        "#E2E8F0",
        "#10B981",
        "SANTAL 33",
        "100ML EXTRAIT",
        "bottle",
      ),
    },
    variants: [
      {
        id: "gid://shopify/ProductVariant/44901283900",
        title: "100ml / Eau de Parfum",
        sku: "AA-SAN-100",
        price: 168.0,
        compareAtPrice: null,
        imageUrl: createProductStudioSvg(
          "#F8FAFC",
          "#E2E8F0",
          "#10B981",
          "SANTAL 33",
          "100ML EXTRAIT",
          "bottle",
        ),
      },
      {
        id: "gid://shopify/ProductVariant/44901283905",
        title: "50ml / Travel Flacon",
        sku: "AA-SAN-050",
        price: 98.0,
        compareAtPrice: null,
        imageUrl: createProductStudioSvg(
          "#F8FAFC",
          "#E2E8F0",
          "#10B981",
          "SANTAL 33",
          "50ML FLACON",
          "bottle",
        ),
      },
    ],
  },
  {
    id: "gid://shopify/Product/8841002",
    title: "Obsidian Ceramic Chamber Diffuser",
    handle: "obsidian-ceramic-chamber-diffuser",
    vendor: "Atelier Aura",
    category: "Home Objects",
    imageUrl: createProductStudioSvg(
      "#F1F5F9",
      "#E2E8F0",
      "#0EA5E9",
      "OBSIDIAN",
      "DIFFUSER SET",
      "diffuser",
    ),
    imageSource: "MediaImage",
    isOnSale: false,
    primaryVariant: {
      id: "gid://shopify/ProductVariant/44901283902",
      title: "Matte Slate / 250ml Reed Oil",
      sku: "AA-OBS-250",
      price: 84.0,
      compareAtPrice: null,
      imageUrl: createProductStudioSvg(
        "#F1F5F9",
        "#E2E8F0",
        "#0EA5E9",
        "OBSIDIAN",
        "DIFFUSER SET",
        "diffuser",
      ),
    },
    variants: [
      {
        id: "gid://shopify/ProductVariant/44901283902",
        title: "Matte Slate / 250ml Reed Oil",
        sku: "AA-OBS-250",
        price: 84.0,
        compareAtPrice: null,
        imageUrl: createProductStudioSvg(
          "#F1F5F9",
          "#E2E8F0",
          "#0EA5E9",
          "OBSIDIAN",
          "DIFFUSER SET",
          "diffuser",
        ),
      },
    ],
  },
  {
    id: "gid://shopify/Product/8841003",
    title: "Archive Meridian Field Chronograph (Clearance Sale)",
    handle: "archive-meridian-field-chronograph",
    vendor: "Atelier Aura",
    category: "Archive Clearance",
    imageUrl: createProductStudioSvg(
      "#FFFBEB",
      "#FEF3C7",
      "#F59E0B",
      "MERIDIAN",
      "ARCHIVE SALE",
      "chronograph",
    ),
    imageSource: "variant.image",
    isOnSale: true,
    primaryVariant: {
      id: "gid://shopify/ProductVariant/44901283903",
      title: "Brushed Titanium / 38mm (Sale Item)",
      sku: "AA-MER-38S",
      price: 195.0,
      compareAtPrice: 260.0,
      imageUrl: createProductStudioSvg(
        "#FFFBEB",
        "#FEF3C7",
        "#F59E0B",
        "MERIDIAN",
        "ARCHIVE SALE",
        "chronograph",
      ),
    },
    variants: [
      {
        id: "gid://shopify/ProductVariant/44901283903",
        title: "Brushed Titanium / 38mm (Sale Item)",
        sku: "AA-MER-38S",
        price: 195.0,
        compareAtPrice: 260.0,
        imageUrl: createProductStudioSvg(
          "#FFFBEB",
          "#FEF3C7",
          "#F59E0B",
          "MERIDIAN",
          "ARCHIVE SALE",
          "chronograph",
        ),
      },
    ],
  },
  {
    id: "gid://shopify/Product/8841004",
    title: "Signature Anodized Travel Atomizer",
    handle: "signature-anodized-travel-atomizer",
    vendor: "Atelier Aura",
    category: "Stretch Goal Booster",
    imageUrl: createProductStudioSvg(
      "#ECFDF5",
      "#D1FAE5",
      "#10B981",
      "ATOMIZER",
      "12ML POCKET",
      "atomizer",
    ),
    imageSource: "featuredImage",
    isOnSale: false,
    primaryVariant: {
      id: "gid://shopify/ProductVariant/44901283901",
      title: "Emerald Anodized / 12ml",
      sku: "AA-ATM-012",
      price: 18.0,
      compareAtPrice: null,
      imageUrl: createProductStudioSvg(
        "#ECFDF5",
        "#D1FAE5",
        "#10B981",
        "ATOMIZER",
        "12ML POCKET",
        "atomizer",
      ),
    },
    variants: [
      {
        id: "gid://shopify/ProductVariant/44901283901",
        title: "Emerald Anodized / 12ml",
        sku: "AA-ATM-012",
        price: 18.0,
        compareAtPrice: null,
        imageUrl: createProductStudioSvg(
          "#ECFDF5",
          "#D1FAE5",
          "#10B981",
          "ATOMIZER",
          "12ML POCKET",
          "atomizer",
        ),
      },
    ],
  },
  {
    id: "gid://shopify/Product/8841005",
    title: "Heavyweight Weekender Architecture Tote",
    handle: "heavyweight-weekender-architecture-tote",
    vendor: "Atelier Aura",
    category: "Carry Goods",
    imageUrl: createProductStudioSvg(
      "#F8FAFC",
      "#E2E8F0",
      "#6366F1",
      "ATELIER",
      "24OZ CANVAS",
      "tote",
    ),
    imageSource: "MediaImage",
    isOnSale: false,
    primaryVariant: {
      id: "gid://shopify/ProductVariant/44901283904",
      title: "Raw Indigo / Bridle Leather",
      sku: "AA-TOT-001",
      price: 128.0,
      compareAtPrice: null,
      imageUrl: createProductStudioSvg(
        "#F8FAFC",
        "#E2E8F0",
        "#6366F1",
        "ATELIER",
        "24OZ CANVAS",
        "tote",
      ),
    },
    variants: [
      {
        id: "gid://shopify/ProductVariant/44901283904",
        title: "Raw Indigo / Bridle Leather",
        sku: "AA-TOT-001",
        price: 128.0,
        compareAtPrice: null,
        imageUrl: createProductStudioSvg(
          "#F8FAFC",
          "#E2E8F0",
          "#6366F1",
          "ATELIER",
          "24OZ CANVAS",
          "tote",
        ),
      },
    ],
  },
];

/**
 * Fetches real store catalog products using the resilient 3-tier media hierarchy:
 * Tier 1: `featuredImage.url(transform: { maxWidth: 300 })`
 * Tier 2: `media.nodes[0]...MediaImage.image.url(transform: { maxWidth: 300 })`
 * Tier 3: `variants.nodes[0].image.url(transform: { maxWidth: 300 })`
 * Falls back to curated studio catalog products when running offline or in an empty dev store.
 */
export async function fetchStoreCatalogProducts(
  admin: AdminGraphQLClient | null,
): Promise<CatalogProductItem[]> {
  if (admin) {
    try {
      const response = await admin.graphql(CATALOG_PRODUCTS_MEDIA_QUERY, {
        variables: { first: 12 },
      });
      const json = (await response.json()) as {
        data?: {
          products?: {
            nodes?: Array<{
              id: string;
              title: string;
              handle: string;
              vendor: string;
              productType: string;
              featuredImage?: { url: string } | null;
              media?: {
                nodes?: Array<{ image?: { url: string } | null }>;
              };
              variants?: {
                nodes?: Array<{
                  id: string;
                  title: string;
                  sku?: string | null;
                  price: string;
                  compareAtPrice?: string | null;
                  image?: { url: string } | null;
                }>;
              };
            }>;
          };
        };
      };

      const rawProducts = json.data?.products?.nodes ?? [];
      if (rawProducts.length > 0) {
        return rawProducts.map((product, idx) => {
          const fallbackItem =
            CURATED_CATALOG_PRODUCTS[idx % CURATED_CATALOG_PRODUCTS.length];
          const featuredUrl = product.featuredImage?.url;
          const mediaUrl = product.media?.nodes?.find((m) => m.image?.url)?.image
            ?.url;
          const variantImgUrl = product.variants?.nodes?.find(
            (v) => v.image?.url,
          )?.image?.url;

          let imageSource: "featuredImage" | "MediaImage" | "variant.image" =
            "featuredImage";
          let resolvedUrl = fallbackItem.imageUrl;

          if (featuredUrl) {
            resolvedUrl = appendWidth300Param(featuredUrl);
            imageSource = "featuredImage";
          } else if (mediaUrl) {
            resolvedUrl = appendWidth300Param(mediaUrl);
            imageSource = "MediaImage";
          } else if (variantImgUrl) {
            resolvedUrl = appendWidth300Param(variantImgUrl);
            imageSource = "variant.image";
          }

          const mappedVariants: CatalogProductVariant[] = (
            product.variants?.nodes ?? []
          ).map((v) => ({
            id: v.id,
            title: v.title === "Default Title" ? product.title : v.title,
            sku: v.sku || "SKU-LIVE",
            price: parseFloat(v.price || "0"),
            compareAtPrice: v.compareAtPrice
              ? parseFloat(v.compareAtPrice)
              : null,
            imageUrl: v.image?.url
              ? appendWidth300Param(v.image.url)
              : resolvedUrl,
          }));

          const primaryVariant =
            mappedVariants[0] || fallbackItem.primaryVariant;
          const isOnSale =
            primaryVariant.compareAtPrice !== null &&
            primaryVariant.compareAtPrice > primaryVariant.price;

          return {
            id: product.id,
            title: product.title,
            handle: product.handle,
            vendor: product.vendor || "Atelier Aura",
            category: product.productType || "Catalog",
            imageUrl: resolvedUrl,
            imageSource,
            primaryVariant,
            variants:
              mappedVariants.length > 0
                ? mappedVariants
                : [primaryVariant],
            isOnSale,
          };
        });
      }
    } catch (err) {
      console.warn("Catalog query fell back to curated studio products:", err);
    }
  }

  return CURATED_CATALOG_PRODUCTS;
}
