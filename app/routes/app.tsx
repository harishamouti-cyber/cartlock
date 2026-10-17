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
  Lock,
  ShieldCheck,
  SlidersHorizontal,
} from "lucide-react";
import { authenticateAdminOrFallback } from "../shopify.server";
import { ensureShopSettings } from "../services/seed.server";
import { sanitizeStoreDisplayName } from "../services/cartlock-crypto";

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
              <div className="flex h-10 w-10 items-center justify-center rounded-xl border border-emerald-500/30 bg-[#090D16] text-emerald-400 shadow-sm">
                <Lock className="h-5 w-5" strokeWidth={1.75} />
              </div>
              <div>
                <div className="flex items-center gap-2.5">
                  <span className="text-base font-bold tracking-tight text-slate-900">
                    CartLock
                  </span>
                  <span className="inline-flex items-center gap-1.5 rounded-full border border-slate-200 bg-slate-50 px-2.5 py-0.5 text-xs font-medium text-slate-700">
                    <ShieldCheck
                      className="h-3.5 w-3.5 text-emerald-600"
                      strokeWidth={1.75}
                    />
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

            {/* Live Campaign Telemetry Pill */}
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
              <div className="inline-flex items-center gap-2 rounded-full border border-slate-200/90 bg-white px-3 py-1.5 text-xs font-medium text-slate-700 shadow-2xs">
                <span
                  className={`h-2 w-2 rounded-full ${
                    isActive
                      ? "bg-emerald-500 shadow-[0_0_8px_#10b981]"
                      : "bg-slate-400"
                  }`}
                />
                <span>
                  {isActive ? "Reservation Engine Live" : "Reservation Paused"}
                </span>
                <span className="tabular-numerals rounded-md bg-slate-100 px-1.5 py-0.5 font-mono text-[11px] font-semibold text-slate-800">
                  {discountLabel} / {lockDurationMinutes}m
                </span>
              </div>
              <span className="hidden rounded-lg border border-slate-200 bg-slate-100/80 px-2.5 py-1 font-mono text-[11px] text-slate-600 2xl:inline-block">
                {shop}
              </span>
            </div>
          </div>
        </header>

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
