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
        <Link to="/app" rel="home">
          Conversion Overview
        </Link>
        <Link to="/app/settings">Offer Studio & Customizer</Link>
        <Link to="/app/simulator">Expiration & Pacing Simulator</Link>
      </NavMenu>

      <TitleBar title={activeNav.label} />

      <div className="min-h-screen bg-[#F4F5F7] text-slate-900">
        {/* Top Studio Header Bar (Zero Hardcoded Breadcrumb Characters) */}
        <header className="sticky top-0 z-30 border-b border-slate-900/[0.08] bg-white/90 backdrop-blur-md">
          <div className="mx-auto flex max-w-[1380px] flex-wrap items-center justify-between gap-4 px-4 py-3 sm:px-6">
            <div className="flex items-center gap-3.5">
              <div className="flex h-10 w-10 items-center justify-center rounded-xl border border-emerald-500/35 bg-[#090D16] text-emerald-400 shadow-[0_4px_12px_rgba(9,13,22,0.22),inset_0_1px_0_rgba(255,255,255,0.18)]">
                <VaultLockEmblem className="h-5 w-5" />
              </div>
              <div>
                <div className="flex items-center gap-2.5">
                  <span className="text-base font-extrabold tracking-tight text-slate-900">
                    CartLock
                  </span>
                  <span className="inline-flex items-center gap-1.5 rounded-full border border-slate-200/90 bg-slate-50 px-2.5 py-0.5 text-xs font-semibold text-slate-700 shadow-2xs">
                    <MarginShieldEmblem className="h-3.5 w-3.5 text-emerald-600" />
                    {storeDisplayName}
                  </span>
                </div>
                <p className="text-xs text-slate-500">
                  Cryptographic Exit-Intent Price Reservation & Margin Shield
                  Functions
                </p>
              </div>
            </div>

            {/* Navigation Segmented Studio Bar */}
            <nav
              aria-label="CartLock primary navigation"
              className="cl-segmented-track flex items-center gap-1"
            >
              {navItems.map((item) => {
                const Icon = item.icon;
                const active = item.match(location.pathname);
                return (
                  <Link
                    key={item.to}
                    to={item.to}
                    className={`cl-segmented-pill inline-flex min-h-[36px] items-center gap-2 rounded-lg px-3.5 py-1.5 text-xs font-semibold ${
                      active
                        ? "cl-segmented-pill-active text-slate-900"
                        : "text-slate-600 hover:text-slate-900"
                    }`}
                  >
                    <Icon
                      className={`h-3.5 w-3.5 ${
                        active ? "text-emerald-600" : "text-slate-500"
                      }`}
                      strokeWidth={1.75}
                    />
                    <span>{item.label}</span>
                  </Link>
                );
              })}
            </nav>

            {/* Live Campaign Telemetry Pill & Architecture Spec Inspector */}
            <div className="hidden items-center gap-2.5 xl:flex">
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
              <div className="inline-flex items-center gap-2 rounded-full border border-slate-200/90 bg-white px-3 py-1.5 text-xs font-semibold text-slate-700 shadow-2xs">
                <LiveRadarDot tone={isActive ? "emerald" : "amber"} />
                <span>
                  {isActive ? "Reservation Engine Live" : "Reservation Paused"}
                </span>
                <span className="tabular-numerals rounded-md bg-slate-100 px-1.5 py-0.5 font-mono text-[11px] font-bold text-slate-800">
                  {discountLabel} / {lockDurationMinutes}m
                </span>
              </div>
              <button
                type="button"
                onClick={() => setShowArchitectureModal(true)}
                className="inline-flex min-h-[34px] items-center gap-1.5 rounded-xl border border-slate-200 bg-white px-3 py-1.5 text-xs font-semibold text-slate-700 shadow-2xs transition hover:border-slate-300 hover:bg-slate-50"
              >
                <Layers className="h-3.5 w-3.5 text-emerald-600" strokeWidth={1.75} />
                <span>System Architecture</span>
              </button>
            </div>
          </div>
        </header>

        {/* System Architecture & Design Craft Modal (Closable with Escape or Button) */}
        {showArchitectureModal && (
          <div
            role="dialog"
            aria-modal="true"
            aria-label="CartLock System Architecture and Security Spec"
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
                      CartLock Cryptographic & Extension Architecture
                    </h2>
                    <p className="text-xs text-slate-500">
                      Active Store: <span className="font-mono">{shop}</span>
                    </p>
                  </div>
                </div>
                <button
                  type="button"
                  onClick={() => setShowArchitectureModal(false)}
                  aria-label="Close System Architecture modal"
                  className="inline-flex h-8 w-8 items-center justify-center rounded-lg border border-slate-200 text-slate-500 hover:bg-slate-100 hover:text-slate-900"
                >
                  <X className="h-4 w-4" strokeWidth={1.75} />
                </button>
              </div>

              <div className="mt-4 grid grid-cols-1 gap-3.5 sm:grid-cols-2">
                <div className="rounded-xl border border-slate-200/90 bg-slate-50/70 p-4">
                  <div className="flex items-center gap-2 text-xs font-bold text-slate-900">
                    <HmacSignatureGlyph className="h-4 w-4 text-emerald-600" />
                    <span>1. Anti-Inspect-Element Signing</span>
                  </div>
                  <p className="mt-1.5 text-xs leading-relaxed text-slate-600">
                    Every reservation writes{" "}
                    <code className="rounded bg-white px-1 font-mono text-[11px]">
                      _cartlock_expires_at
                    </code>{" "}
                    and{" "}
                    <code className="rounded bg-white px-1 font-mono text-[11px]">
                      _cartlock_signature
                    </code>{" "}
                    signed with your shop&apos;s secret salt. Editing the timer
                    in DevTools breaks signature verification at checkout.
                  </p>
                </div>

                <div className="rounded-xl border border-slate-200/90 bg-slate-50/70 p-4">
                  <div className="flex items-center gap-2 text-xs font-bold text-slate-900">
                    <MarginShieldEmblem className="h-4 w-4 text-emerald-600" />
                    <span>2. Margin Shield & Zero Stacking</span>
                  </div>
                  <p className="mt-1.5 text-xs leading-relaxed text-slate-600">
                    Enforces{" "}
                    <code className="rounded bg-white px-1 font-mono text-[11px]">
                      combinesWith: false
                    </code>{" "}
                    on order and product discounts, caps percentage drops at{" "}
                    <code className="rounded bg-white px-1 font-mono text-[11px]">
                      maxDiscountCap
                    </code>
                    , and excludes clearance items on sale.
                  </p>
                </div>

                <div className="rounded-xl border border-slate-200/90 bg-slate-50/70 p-4">
                  <div className="flex items-center gap-2 text-xs font-bold text-slate-900">
                    <ChronoPulseEmblem className="h-4 w-4 text-emerald-600" />
                    <span>3. Ultra-Light Storefront Embed</span>
                  </div>
                  <p className="mt-1.5 text-xs leading-relaxed text-slate-600">
                    Ships as a{" "}
                    <span className="tabular-numerals font-semibold">
                      1.97KB
                    </span>{" "}
                    gzipped vanilla JS App Embed with Dynamic Stretch Goal AOV
                    upsells and floating bottom pill bar.
                  </p>
                </div>

                <div className="rounded-xl border border-slate-200/90 bg-slate-50/70 p-4">
                  <div className="flex items-center gap-2 text-xs font-bold text-slate-900">
                    <ShieldCheck className="h-4 w-4 text-emerald-600" />
                    <span>4. Synchronized Checkout UI Banner</span>
                  </div>
                  <p className="mt-1.5 text-xs leading-relaxed text-slate-600">
                    Targets{" "}
                    <code className="rounded bg-white px-1 font-mono text-[11px]">
                      purchase.checkout.block.render
                    </code>{" "}
                    to render a synchronized countdown timer and locked savings
                    badge above the checkout order summary.
                  </p>
                </div>
              </div>

              <div className="mt-5 flex justify-end border-t border-slate-100 pt-4">
                <button
                  type="button"
                  onClick={() => setShowArchitectureModal(false)}
                  className="rounded-xl bg-slate-900 px-4 py-2 text-xs font-bold text-white hover:bg-slate-800"
                >
                  Done
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
