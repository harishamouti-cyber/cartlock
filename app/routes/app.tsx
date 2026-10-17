import { useState } from "react";
import type { HeadersFunction, LoaderFunctionArgs } from "@remix-run/node";
import { json } from "@remix-run/node";
import {
  Link,
  Outlet,
  useLoaderData,
  useLocation,
  useNavigation,
  useRouteError,
} from "@remix-run/react";
import { boundary } from "@shopify/shopify-app-remix/server";
import { AppProvider } from "@shopify/shopify-app-remix/react";
import { NavMenu, TitleBar } from "@shopify/app-bridge-react";
import polarisStyles from "@shopify/polaris/build/esm/styles.css?url";
import {
  Activity,
  BarChart3,
  Clock,
  Layers,
  ShieldCheck,
  SlidersHorizontal,
  X,
} from "lucide-react";
import { authenticateAdminOrFallback } from "../shopify.server";
import { ensureShopSettings } from "../services/seed.server";
import { sanitizeStoreDisplayName } from "../services/cartlock-crypto";
import {
  ChronoPulseEmblem,
  HmacSignatureGlyph,
  LiveRadarDot,
  MarginShieldEmblem,
  VaultLockEmblem,
} from "../components/StudioIcons";

export const links = () => [{ rel: "stylesheet", href: polarisStyles }];

export const loader = async ({ request }: LoaderFunctionArgs) => {
  const { shop, isEmbeddedSession } =
    await authenticateAdminOrFallback(request);
  const settings = await ensureShopSettings(shop);

  return json({
    apiKey: process.env.SHOPIFY_API_KEY || "cartlock_dev_api_key",
    shop,
    isEmbeddedSession,
    storeDisplayName:
      settings.storeDisplayName || sanitizeStoreDisplayName(shop),
    isActive: settings.isActive,
    discountType: settings.discountType,
    discountValue: settings.discountValue,
    lockDurationMinutes: settings.lockDurationMinutes,
  });
};

export default function AppLayout() {
  const {
    apiKey,
    shop,
    storeDisplayName,
    isActive,
    discountType,
    discountValue,
    lockDurationMinutes,
  } = useLoaderData<typeof loader>();
  const location = useLocation();
  const navigation = useNavigation();
  const isNavigating = navigation.state !== "idle";
  const [showArchitectureModal, setShowArchitectureModal] = useState(false);

  const navItems = [
    {
      to: "/app",
      label: "Conversion Overview",
      icon: BarChart3,
      match: (pathname: string) =>
        pathname === "/app" || pathname === "/app/",
    },
    {
      to: "/app/settings",
      label: "Offer Studio & Customizer",
      icon: SlidersHorizontal,
      match: (pathname: string) => pathname.startsWith("/app/settings"),
    },
    {
      to: "/app/simulator",
      label: "Expiration & Pacing Simulator",
      icon: Clock,
      match: (pathname: string) => pathname.startsWith("/app/simulator"),
    },
  ];

  const activeNav =
    navItems.find((item) => item.match(location.pathname)) ?? navItems[0];

  const discountLabel =
    discountType === "PERCENTAGE"
      ? `${discountValue}% Off`
      : `$${discountValue.toFixed(2)} Off`;

  return (
    <AppProvider isEmbeddedApp apiKey={apiKey}>
      <NavMenu>
        <Link to={`/app${location.search}`} rel="home">
          Conversion Overview
        </Link>
        <Link to={`/app/settings${location.search}`}>
          Offer Studio & Customizer
        </Link>
        <Link to={`/app/simulator${location.search}`}>
          Expiration & Pacing Simulator
        </Link>
      </NavMenu>

      <TitleBar title={activeNav.label} />

      <div className="min-h-screen bg-[#F4F5F7] text-slate-900">
        {/* Top Studio Header Bar (Single-Row Built-for-Shopify Header) */}
        <header className="sticky top-0 z-30 border-b border-slate-900/[0.08] bg-white/95 backdrop-blur-md">
          <div className="mx-auto flex max-w-[1380px] items-center justify-between gap-3 px-4 py-2.5 sm:px-6">
            <div className="flex min-w-0 items-center gap-3">
              <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl border border-emerald-500/35 bg-[#090D16] text-emerald-400 shadow-[0_4px_12px_rgba(9,13,22,0.22),inset_0_1px_0_rgba(255,255,255,0.18)]">
                <VaultLockEmblem className="h-4.5 w-4.5" />
              </div>
              <div className="min-w-0">
                <div className="flex items-center gap-2">
                  <span className="text-sm font-extrabold tracking-tight text-slate-900 sm:text-base">
                    CartLock
                  </span>
                  <span className="inline-flex items-center gap-1.5 truncate rounded-full border border-emerald-500/25 bg-emerald-50/80 px-2.5 py-0.5 text-[11px] font-semibold text-emerald-900 shadow-2xs">
                    <MarginShieldEmblem className="h-3 w-3 shrink-0 text-emerald-600" />
                    <span className="truncate">{storeDisplayName}</span>
                  </span>
                </div>
                <p className="hidden truncate text-[11px] text-slate-500 md:block">
                  Exit-Intent Price Reservations & Margin Protection
                </p>
              </div>
            </div>

            {/* Navigation Segmented Studio Bar */}
            <nav
              aria-label="CartLock primary navigation"
              className="cl-segmented-track flex shrink-0 items-center gap-1"
            >
              {navItems.map((item) => {
                const Icon = item.icon;
                const active = item.match(location.pathname);
                return (
                  <Link
                    key={item.to}
                    to={`${item.to}${location.search}`}
                    className={`cl-segmented-pill inline-flex min-h-[34px] items-center gap-1.5 rounded-lg px-3 py-1.5 text-xs font-semibold whitespace-nowrap ${
                      active
                        ? "cl-segmented-pill-active text-slate-900"
                        : "text-slate-600 hover:text-slate-900"
                    }`}
                  >
                    <Icon
                      className={`h-3.5 w-3.5 shrink-0 ${
                        active ? "text-emerald-600" : "text-slate-500"
                      }`}
                      strokeWidth={1.75}
                    />
                    <span>{item.label}</span>
                  </Link>
                );
              })}
            </nav>

            {/* Live Campaign Status Pill & Protection Guide */}
            <div className="hidden shrink-0 items-center gap-2 lg:flex">
              {isNavigating && (
                <span
                  role="status"
                  className="inline-flex items-center gap-1.5 rounded-full border border-amber-300/60 bg-amber-50 px-2.5 py-1 text-xs font-medium text-amber-800"
                >
                  <Activity
                    className="h-3.5 w-3.5 animate-spin text-amber-600"
                    strokeWidth={1.75}
                  />
                  Syncing
                </span>
              )}
              <div className="inline-flex items-center gap-2 rounded-full border border-slate-200/90 bg-white px-3 py-1 text-xs font-semibold text-slate-700 shadow-2xs">
                <LiveRadarDot tone={isActive ? "emerald" : "amber"} />
                <span className="whitespace-nowrap">
                  {isActive ? "Live" : "Paused"}
                </span>
                <span className="tabular-numerals rounded-md bg-slate-100 px-1.5 py-0.5 font-mono text-[11px] font-bold text-slate-800">
                  {discountLabel} / {lockDurationMinutes}m
                </span>
              </div>
              <button
                type="button"
                onClick={() => setShowArchitectureModal(true)}
                className="inline-flex min-h-[32px] items-center gap-1.5 rounded-xl border border-slate-200 bg-white px-2.5 py-1 text-xs font-semibold text-slate-700 shadow-2xs transition hover:border-slate-300 hover:bg-slate-50"
              >
                <Layers className="h-3.5 w-3.5 text-emerald-600" strokeWidth={1.75} />
                <span className="whitespace-nowrap">How It Works</span>
              </button>
            </div>
          </div>
        </header>

        {/* Merchant Protection & Setup Guide Modal */}
        {showArchitectureModal && (
          <div
            role="dialog"
            aria-modal="true"
            aria-label="How CartLock Protects Your Margins"
            onKeyDown={(e) => {
              if (e.key === "Escape") setShowArchitectureModal(false);
            }}
            className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/60 p-4 backdrop-blur-sm"
          >
            <div className="cl-bento-card w-full max-w-2xl overflow-hidden bg-white p-6 shadow-2xl">
              <div className="flex items-start justify-between gap-4 border-b border-slate-100 pb-4">
                <div className="flex items-center gap-3">
                  <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-[#090D16] text-emerald-400">
                    <VaultLockEmblem className="h-5 w-5" />
                  </div>
                  <div>
                    <h2 className="text-base font-extrabold text-slate-900">
                      How CartLock Protects Your Store & Profit Margins
                    </h2>
                    <p className="text-xs text-slate-500">
                      Connected Store: <span className="font-semibold text-slate-700">{storeDisplayName}</span> ({shop})
                    </p>
                  </div>
                </div>
                <button
                  type="button"
                  onClick={() => setShowArchitectureModal(false)}
                  aria-label="Close guide modal"
                  className="inline-flex h-8 w-8 items-center justify-center rounded-lg border border-slate-200 text-slate-500 hover:bg-slate-100 hover:text-slate-900"
                >
                  <X className="h-4 w-4" strokeWidth={1.75} />
                </button>
              </div>

              <div className="mt-4 grid grid-cols-1 gap-3.5 sm:grid-cols-2">
                <div className="rounded-xl border border-slate-200/90 bg-slate-50/70 p-4">
                  <div className="flex items-center gap-2 text-xs font-bold text-slate-900">
                    <HmacSignatureGlyph className="h-4 w-4 text-emerald-600" />
                    <span>1. Tamper-Proof Countdown Timers</span>
                  </div>
                  <p className="mt-1.5 text-xs leading-relaxed text-slate-600">
                    Every price reservation is securely locked to your store. If
                    a shopper tries to reset their timer or extend the deadline,
                    Shopify Checkout automatically removes the discount.
                  </p>
                </div>

                <div className="rounded-xl border border-slate-200/90 bg-slate-50/70 p-4">
                  <div className="flex items-center gap-2 text-xs font-bold text-slate-900">
                    <MarginShieldEmblem className="h-4 w-4 text-emerald-600" />
                    <span>2. Margin Shield & Zero Coupon Stacking</span>
                  </div>
                  <p className="mt-1.5 text-xs leading-relaxed text-slate-600">
                    Blocks promo code stacking, enforces your maximum dollar
                    discount cap on large carts, and automatically protects
                    clearance items already on sale.
                  </p>
                </div>

                <div className="rounded-xl border border-slate-200/90 bg-slate-50/70 p-4">
                  <div className="flex items-center gap-2 text-xs font-bold text-slate-900">
                    <ChronoPulseEmblem className="h-4 w-4 text-emerald-600" />
                    <span>3. Zero-Coupon Extension Leaks</span>
                  </div>
                  <p className="mt-1.5 text-xs leading-relaxed text-slate-600">
                    Because CartLock applies discounts directly through Shopify
                    Functions without static coupon codes, browser extensions
                    like Honey or Capital One Shopping have nothing to scrape.
                  </p>
                </div>

                <div className="rounded-xl border border-slate-200/90 bg-slate-50/70 p-4">
                  <div className="flex items-center gap-2 text-xs font-bold text-slate-900">
                    <ShieldCheck className="h-4 w-4 text-emerald-600" />
                    <span>4. Synchronized Checkout Timer</span>
                  </div>
                  <p className="mt-1.5 text-xs leading-relaxed text-slate-600">
                    Shoppers see their live countdown timer and locked savings
                    badge right inside the storefront and Shopify Checkout order
                    summary until purchase.
                  </p>
                </div>
              </div>

              <div className="mt-5 flex justify-end border-t border-slate-100 pt-4">
                <button
                  type="button"
                  onClick={() => setShowArchitectureModal(false)}
                  className="rounded-xl bg-slate-900 px-4 py-2 text-xs font-bold text-white hover:bg-slate-800"
                >
                  Got It
                </button>
              </div>
            </div>
          </div>
        )}

        {/* Main Workspace Container */}
        <main className="mx-auto max-w-[1380px] px-4 py-6 sm:px-6">
          <Outlet />
        </main>
      </div>
    </AppProvider>
  );
}

export function ErrorBoundary() {
  return boundary.error(useRouteError());
}

export const headers: HeadersFunction = (headersArgs) => {
  return boundary.headers(headersArgs);
};
