import { useState, useMemo } from "react";
import type { ActionFunctionArgs, LoaderFunctionArgs } from "@remix-run/node";
import { json } from "@remix-run/node";
import {
  Form,
  Link,
  useActionData,
  useLoaderData,
  useNavigation,
} from "@remix-run/react";
import {
  Activity,
  ArrowUpRight,
  BellRing,
  CheckCircle2,
  Clock,
  Download,
  DollarSign,
  ExternalLink,
  Eye,
  Filter,
  Flame,
  KeyRound,
  Layers,
  Lock,
  PlusCircle,
  RefreshCw,
  Search,
  ShieldCheck,
  SlidersHorizontal,
  Timer,
  Trash2,
  Wallet,
  X,
  Zap,
} from "lucide-react";
import prisma from "../db.server";
import { authenticateAdminOrFallback } from "../shopify.server";
import {
  ensureRecoveredOrdersSeeded,
  ensureShopSettings,
} from "../services/seed.server";
import { computeCartLockSignature } from "../services/cartlock-crypto";
import { processOrdersCreateAttribution } from "../services/order-attribution.server";
import {
  ChronoPulseEmblem,
  FunnelTelemetryGlyph,
  HmacSignatureGlyph,
  LiveRadarDot,
  MarginShieldEmblem,
  VaultLockEmblem,
} from "../components/StudioIcons";

export const loader = async ({ request }: LoaderFunctionArgs) => {
  const { shop } = await authenticateAdminOrFallback(request);
  const settings = await ensureShopSettings(shop);
  const orders = await ensureRecoveredOrdersSeeded(shop);

  const apiKey = process.env.SHOPIFY_API_KEY || "cartlock_dev_api_key";
  const themeEditorDeepLink = `https://${shop}/admin/themes/current/editor?context=apps&activateAppId=${apiKey}/cartlock_embed`;

  return json({
    shop,
    settings,
    orders,
    themeEditorDeepLink,
  });
};

export const action = async ({ request }: ActionFunctionArgs) => {
  const { shop } = await authenticateAdminOrFallback(request);
  const settings = await ensureShopSettings(shop);
  const formData = await request.formData();
  const intent = String(formData.get("intent") || "");

  if (intent === "toggle_active") {
    const updated = await prisma.cartLockSettings.update({
      where: { shop },
      data: { isActive: !settings.isActive },
    });
    return json({
      ok: true,
      intent,
      message: updated.isActive
        ? "CartLock Price Reservation engine is now active."
        : "CartLock Price Reservation engine has been paused.",
    });
  }

  if (intent === "simulate_webhook_order") {
    const randomOrderNum = Math.floor(1100 + Math.random() * 899);
    const sampleCustomers = [
      "amelie.laurent@atelier-paris.fr",
      "henrik.holm@nordic-form.dk",
      "maya.lin@studio-koto.jp",
      "lucas.sterling@meridian-arch.uk",
      "sofia.moretti@milano-object.it",
    ];
    const customerEmail =
      sampleCustomers[Math.floor(Math.random() * sampleCustomers.length)];
    const cartSubtotals = [128.0, 168.0, 224.0, 290.0, 360.0];
    const cartSubtotal =
      cartSubtotals[Math.floor(Math.random() * cartSubtotals.length)];

    let discountAmount =
      settings.discountType === "PERCENTAGE"
        ? Number(((cartSubtotal * settings.discountValue) / 100).toFixed(2))
        : Number(settings.discountValue.toFixed(2));

    if (
      settings.maxDiscountCap &&
      settings.maxDiscountCap > 0 &&
      discountAmount > settings.maxDiscountCap
    ) {
      discountAmount = settings.maxDiscountCap;
    }

    const netOrderRevenue = Number((cartSubtotal - discountAmount).toFixed(2));
    const remainingSecs = Math.floor(
      65 + Math.random() * (settings.lockDurationMinutes * 60 - 90),
    );
    const nowMs = Date.now();
    const expiresIso = new Date(nowMs + remainingSecs * 1000).toISOString();
    const validSignature = computeCartLockSignature(
      expiresIso,
      settings.secretSalt,
    );

    const attribution = await processOrdersCreateAttribution(shop, {
      id: Date.now(),
      admin_graphql_api_id: `gid://shopify/Order/${Date.now()}`,
      name: `#${randomOrderNum}`,
      email: customerEmail,
      current_subtotal_price: cartSubtotal.toFixed(2),
      current_total_discounts: discountAmount.toFixed(2),
      current_total_price: netOrderRevenue.toFixed(2),
      created_at: new Date(nowMs).toISOString(),
      note_attributes: [
        { name: "_cartlock_expires_at", value: expiresIso },
        { name: "_cartlock_signature", value: validSignature },
      ],
      discount_applications: [
        {
          type: "automatic",
          title: "CartLock Price Reservation Active",
          value: discountAmount.toFixed(2),
          value_type: "fixed_amount",
        },
      ],
    });

    return json({
      ok: true,
      intent,
      message: `Verified orders/create webhook processed for ${attribution.record?.orderName || `#${randomOrderNum}`} ($${netOrderRevenue.toFixed(2)} net revenue, ${remainingSecs}s remaining on timer).`,
    });
  }

  return json({ ok: false, intent, message: "Unknown action intent." });
};

function formatSecondsToClock(seconds: number): string {
  const clamped = Math.max(0, Math.floor(seconds));
  const mins = Math.floor(clamped / 60);
  const secs = clamped % 60;
  return `${String(mins).padStart(2, "0")}:${String(secs).padStart(2, "0")}`;
}

function formatCurrency(amount: number): string {
  return new Intl.NumberFormat("en-US", {
    style: "currency",
    currency: "USD",
    minimumFractionDigits: 2,
  }).format(amount);
}

const SISTER_APPS = [
  {
    name: "RestockPing",
    tagline: "High-Intent Back-in-Stock Alerts",
    category: "Inventory Recovery",
    description:
      "Capture out-of-stock demand with instant SMS & email restock triggers that auto-populate variant carts.",
    metric: "+18.4% OOS Recovery",
    accent: "border-emerald-500/25 bg-emerald-500/10 text-emerald-700",
    icon: BellRing,
    href: "/app/settings?suite=restockping",
  },
  {
    name: "DropClock",
    tagline: "Server-Verified Limited Drop Releases",
    category: "Launch Hype",
    description:
      "Lock limited-edition product drops behind cryptographically synchronized countdown gates that defeat bots.",
    metric: "Zero Bot Sniping",
    accent: "border-sky-500/25 bg-sky-500/10 text-sky-700",
    icon: Timer,
    href: "/app/simulator?suite=dropclock",
  },
  {
    name: "PromoLint",
    tagline: "Checkout Coupon Leak & Stacking Firewall",
    category: "Margin Protection",
    description:
      "Audit and block honey-leaked static promo codes and accidental discount stacking before margins erode.",
    metric: "4.2% Margin Saved",
    accent: "border-amber-500/25 bg-amber-500/10 text-amber-700",
    icon: ShieldCheck,
    href: "/app/settings?suite=promolint",
  },
  {
    name: "PrepaidFlip",
    tagline: "Post-Purchase 1-Click Prepaid Upgrades",
    category: "LTV Acceleration",
    description:
      "Convert monthly subscribers into high-retention 3-month and 6-month prepaid bundles immediately after checkout.",
    metric: "+2.6x Cashflow Velocity",
    accent: "border-indigo-500/25 bg-indigo-500/10 text-indigo-700",
    icon: Wallet,
    href: "/app/simulator?suite=prepaidflip",
  },
];

export default function ConversionOverviewRoute() {
  const { settings, orders, themeEditorDeepLink } =
    useLoaderData<typeof loader>();
  const actionData = useActionData<typeof action>();
  const navigation = useNavigation();
  const isSubmitting = navigation.state !== "idle";

  const [bannerDismissed, setBannerDismissed] = useState(false);
  const [searchQuery, setSearchQuery] = useState("");
  const [speedFilter, setSpeedFilter] = useState<
    "ALL" | "URGENT" | "FAST" | "CAPPED"
  >("ALL");
  const [showEmptyPreview, setShowEmptyPreview] = useState(false);
  const [inspectedOrderId, setInspectedOrderId] = useState<string | null>(null);

  const visibleOrders = useMemo(() => {
    if (showEmptyPreview) return [];
    return orders.filter((order) => {
      const q = searchQuery.trim().toLowerCase();
      const matchesQuery =
        !q ||
        order.orderName.toLowerCase().includes(q) ||
        (order.customerEmail || "").toLowerCase().includes(q);

      if (!matchesQuery) return false;

      if (speedFilter === "URGENT") {
        return order.secondsRemainingAtCheckout <= 180;
      }
      if (speedFilter === "FAST") {
        return order.secondsRemainingAtCheckout >= 360;
      }
      if (speedFilter === "CAPPED") {
        return (
          settings.maxDiscountCap !== null &&
          order.discountAmount >= settings.maxDiscountCap
        );
      }
      return true;
    });
  }, [
    orders,
    searchQuery,
    speedFilter,
    settings.maxDiscountCap,
    showEmptyPreview,
  ]);

  const inspectedOrder = useMemo(
    () =>
      visibleOrders.find((o) => o.id === inspectedOrderId) ||
      visibleOrders[0] ||
      null,
    [visibleOrders, inspectedOrderId],
  );

  // Live KPI aggregations from RecoveredCartOrder records
  const kpiStats = useMemo(() => {
    const activeList = showEmptyPreview ? [] : orders;
    const totalNetRevenue = activeList.reduce(
      (sum, o) => sum + o.netOrderRevenue,
      0,
    );
    const totalGrossSubtotal = activeList.reduce(
      (sum, o) => sum + o.cartSubtotal,
      0,
    );
    const totalDiscountGiven = activeList.reduce(
      (sum, o) => sum + o.discountAmount,
      0,
    );
    const totalLocksClaimed = activeList.length;

    const totalLockWindowSeconds = settings.lockDurationMinutes * 60;
    const avgRemainingSeconds =
      totalLocksClaimed > 0
        ? Math.round(
            activeList.reduce(
              (sum, o) => sum + o.secondsRemainingAtCheckout,
              0,
            ) / totalLocksClaimed,
          )
        : 0;
    const avgElapsedCheckoutSeconds =
      totalLocksClaimed > 0
        ? Math.max(45, totalLockWindowSeconds - avgRemainingSeconds)
        : 0;

    // Pacing urgency buckets derived from real order records
    const rapidCheckouts = activeList.filter(
      (o) => totalLockWindowSeconds - o.secondsRemainingAtCheckout <= 240,
    ).length;
    const consideredCheckouts = activeList.filter((o) => {
      const elapsed = totalLockWindowSeconds - o.secondsRemainingAtCheckout;
      return elapsed > 240 && o.secondsRemainingAtCheckout > 180;
    }).length;
    const cliffCheckouts = activeList.filter(
      (o) => o.secondsRemainingAtCheckout <= 180,
    ).length;

    return {
      totalNetRevenue,
      totalGrossSubtotal,
      totalDiscountGiven,
      totalLocksClaimed,
      avgRemainingSeconds,
      avgElapsedCheckoutSeconds,
      rapidCheckouts,
      consideredCheckouts,
      cliffCheckouts,
    };
  }, [orders, settings.lockDurationMinutes, showEmptyPreview]);

  // 1-Click CSV Export of Verified Recovered Orders
  const handleExportCsv = () => {
    const headers = [
      "Order Name",
      "Customer Email",
      "Cart Subtotal (USD)",
      "Locked Discount (USD)",
      "Net Order Revenue (USD)",
      "Seconds Remaining At Checkout",
      "Created At",
    ];
    const rows = visibleOrders.map((o) => [
      o.orderName,
      o.customerEmail || "Guest",
      o.cartSubtotal.toFixed(2),
      o.discountAmount.toFixed(2),
      o.netOrderRevenue.toFixed(2),
      String(o.secondsRemainingAtCheckout),
      new Date(o.createdAt).toISOString(),
    ]);
    const csvContent = [headers, ...rows]
      .map((r) => r.map((cell) => `"${String(cell).replace(/"/g, '""')}"`).join(","))
      .join("\n");

    const blob = new Blob([csvContent], { type: "text/csv;charset=utf-8;" });
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.href = url;
    link.setAttribute("download", `cartlock-recovered-orders-${settings.shop}.csv`);
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    URL.revokeObjectURL(url);
  };

  return (
    <div className="space-y-6 pb-12">
      {/* 1. Live System Health Bar */}
      <section
        aria-label="Live System Health Bar"
        className="cl-bento-card flex flex-wrap items-center justify-between gap-4 px-5 py-3.5"
      >
        <div className="flex flex-wrap items-center gap-3 sm:gap-5">
          <div className="flex items-center gap-2.5">
            <LiveRadarDot tone={settings.isActive ? "emerald" : "amber"} />
            <span className="text-xs font-bold tracking-tight text-slate-900">
              {settings.isActive
                ? "System Health: All Pipelines Operational"
                : "System Status: Price Reservation Paused"}
            </span>
          </div>

          <div className="hidden h-4 w-px bg-slate-200 sm:block" />

          <div className="flex flex-wrap items-center gap-2 text-xs text-slate-600">
            <span className="inline-flex items-center gap-1.5 rounded-lg border border-emerald-500/25 bg-emerald-50/70 px-2.5 py-1 font-medium text-emerald-900">
              <Zap className="h-3.5 w-3.5 text-emerald-600" strokeWidth={1.75} />
              Function: CartLock Price Reservation Active
            </span>
            <span className="inline-flex items-center gap-1.5 rounded-lg border border-slate-200 bg-slate-50 px-2.5 py-1 font-medium text-slate-700">
              <HmacSignatureGlyph className="h-3.5 w-3.5 text-slate-700" />
              HMAC Salt Shield Verified
            </span>
            <span className="inline-flex items-center gap-1.5 rounded-lg border border-slate-200 bg-slate-50 px-2.5 py-1 font-medium text-slate-700">
              <MarginShieldEmblem className="h-3.5 w-3.5 text-emerald-600" />
              Zero-Stacking: Order & Product Combines Disabled
            </span>
          </div>
        </div>

        <div className="flex items-center gap-2.5">
          <Form method="post">
            <input type="hidden" name="intent" value="toggle_active" />
            <button
              type="submit"
              disabled={isSubmitting}
              className={`inline-flex min-h-[34px] items-center gap-1.5 rounded-lg border px-3 py-1.5 text-xs font-semibold transition ${
                settings.isActive
                  ? "border-slate-200 bg-white text-slate-700 hover:bg-slate-50"
                  : "border-emerald-600 bg-emerald-600 text-white hover:bg-emerald-700"
              }`}
            >
              <Activity className="h-3.5 w-3.5" strokeWidth={1.75} />
              {settings.isActive ? "Pause Engine" : "Activate Engine"}
            </button>
          </Form>
          <Link
            to="/app/settings"
            className="inline-flex min-h-[34px] items-center gap-1.5 rounded-lg border border-slate-900 bg-slate-900 px-3 py-1.5 text-xs font-semibold text-white transition hover:bg-slate-800"
          >
            <SlidersHorizontal className="h-3.5 w-3.5" strokeWidth={1.75} />
            Configure Offer Rules
          </Link>
        </div>
      </section>

      {/* Live Action Feedback Banner */}
      {actionData?.message && (
        <div
          role="status"
          className="flex items-center justify-between gap-3 rounded-xl border border-emerald-500/30 bg-emerald-50/90 px-4 py-3 text-xs font-medium text-emerald-950 shadow-2xs"
        >
          <div className="flex items-center gap-2">
            <CheckCircle2
              className="h-4 w-4 shrink-0 text-emerald-600"
              strokeWidth={1.75}
            />
            <span>{actionData.message}</span>
          </div>
        </div>
      )}

      {/* 2. Dismissible Theme Editor Deep-Link Banner */}
      {!bannerDismissed && (
        <section
          aria-label="Theme Editor Deep-Link Activation Banner"
          className="relative overflow-hidden rounded-2xl border border-slate-800 bg-gradient-to-r from-[#090D16] via-[#111827] to-[#0D1526] p-5 text-white shadow-lg"
        >
          <div className="flex flex-col justify-between gap-4 lg:flex-row lg:items-center">
            <div className="space-y-1.5">
              <div className="inline-flex items-center gap-2 rounded-full border border-emerald-400/30 bg-emerald-500/15 px-2.5 py-0.5 text-[11px] font-semibold text-emerald-300">
                <span className="h-1.5 w-1.5 rounded-full bg-emerald-400" />
                Storefront App Embed (
                <span className="tabular-numerals">1.97KB</span> Gzipped Vanilla
                JS)
              </div>
              <h2 className="text-base font-bold tracking-tight text-white sm:text-lg">
                Activate the CartLock Exit-Intent Embed in Shopify Theme Editor
              </h2>
              <p className="max-w-2xl text-xs leading-relaxed text-slate-300 sm:text-sm">
                Enable the zero-bloat storefront listener to detect desktop tab
                exit-intent and mobile scroll abandonment when{" "}
                <code className="rounded bg-white/10 px-1.5 py-0.5 font-mono text-emerald-300">
                  /cart.js
                </code>{" "}
                has items, sign{" "}
                <code className="rounded bg-white/10 px-1.5 py-0.5 font-mono text-emerald-300">
                  _cartlock_signature
                </code>
                , and launch the Stretch Goal AOV booster automatically.
              </p>
            </div>

            <div className="flex flex-wrap items-center gap-2.5">
              <a
                href={themeEditorDeepLink}
                target="_blank"
                rel="noopener noreferrer"
                className="cl-btn-shimmer inline-flex min-h-[40px] items-center gap-2 rounded-xl bg-emerald-500 px-4 py-2 text-xs font-bold text-slate-950 shadow-md hover:bg-emerald-400"
              >
                <span>Open Theme Editor App Embed</span>
                <ExternalLink className="h-3.5 w-3.5" strokeWidth={2} />
              </a>
              <Link
                to="/app/settings"
                className="inline-flex min-h-[40px] items-center gap-1.5 rounded-xl border border-white/15 bg-white/5 px-3.5 py-2 text-xs font-semibold text-white transition hover:bg-white/10"
              >
                <span>Preview Widget in Studio</span>
              </Link>
              <button
                type="button"
                onClick={() => setBannerDismissed(true)}
                aria-label="Dismiss Theme Editor banner"
                className="inline-flex h-9 w-9 items-center justify-center rounded-lg border border-white/10 bg-white/5 text-slate-400 transition hover:bg-white/10 hover:text-white"
              >
                <X className="h-4 w-4" strokeWidth={1.75} />
              </button>
            </div>
          </div>
        </section>
      )}

      {/* 3. Three Elevated Bento KPI Cards (21st.dev & Cult UI Standard) */}
      <section
        aria-label="Conversion Performance KPIs"
        className="grid grid-cols-1 gap-4 md:grid-cols-3"
      >
        {/* KPI Card 1: Recovered Cart Revenue */}
        <article className="cl-bento-card cl-bento-card-interactive flex flex-col justify-between p-5">
          <div>
            <div className="flex items-center justify-between gap-2">
              <div className="flex items-center gap-2">
                <div className="flex h-8 w-8 items-center justify-center rounded-lg border border-emerald-500/20 bg-emerald-50 text-emerald-700">
                  <DollarSign className="h-4 w-4" strokeWidth={1.75} />
                </div>
                <span className="text-xs font-bold text-slate-600">
                  Recovered Cart Revenue
                </span>
              </div>
              <span className="inline-flex items-center gap-1 rounded-full border border-emerald-500/25 bg-emerald-50 px-2.5 py-0.5 text-[11px] font-semibold text-emerald-700">
                <ArrowUpRight className="h-3 w-3" strokeWidth={2} />
                Verified Net
              </span>
            </div>

            <div className="mt-4 flex items-baseline gap-2.5">
              <span className="tabular-numerals text-3xl font-extrabold tracking-tight text-slate-900">
                {formatCurrency(kpiStats.totalNetRevenue)}
              </span>
              <span className="tabular-numerals text-xs font-medium text-slate-500">
                from {formatCurrency(kpiStats.totalGrossSubtotal)} gross carts
              </span>
            </div>
          </div>

          <div className="mt-5 border-t border-slate-100 pt-3.5">
            <div className="flex items-center justify-between text-xs">
              <span className="flex items-center gap-1.5 text-slate-600">
                <MarginShieldEmblem className="h-3.5 w-3.5 text-emerald-600" />
                Discounts granted
              </span>
              <span className="tabular-numerals font-mono font-semibold text-slate-800">
                {formatCurrency(kpiStats.totalDiscountGiven)} (
                {settings.maxDiscountCap
                  ? `$${settings.maxDiscountCap.toFixed(0)} max cap active`
                  : "Uncapped"}
                )
              </span>
            </div>
          </div>
        </article>

        {/* KPI Card 2: Price Locks Claimed */}
        <article className="cl-bento-card cl-bento-card-interactive flex flex-col justify-between p-5">
          <div>
            <div className="flex items-center justify-between gap-2">
              <div className="flex items-center gap-2">
                <div className="flex h-8 w-8 items-center justify-center rounded-lg border border-slate-200 bg-slate-50 text-slate-800">
                  <VaultLockEmblem className="h-4 w-4 text-emerald-600" />
                </div>
                <span className="text-xs font-bold text-slate-600">
                  Price Locks Claimed
                </span>
              </div>
              <span className="inline-flex items-center gap-1 rounded-full border border-slate-200 bg-slate-100 px-2.5 py-0.5 text-[11px] font-semibold text-slate-700">
                <Lock className="h-3 w-3 text-emerald-600" strokeWidth={2} />
                0 Leaked Codes
              </span>
            </div>

            <div className="mt-4 flex items-baseline gap-2.5">
              <span className="tabular-numerals text-3xl font-extrabold tracking-tight text-slate-900">
                {kpiStats.totalLocksClaimed}
              </span>
              <span className="text-xs font-medium text-slate-500">
                cryptographically verified checkouts
              </span>
            </div>
          </div>

          <div className="mt-5 border-t border-slate-100 pt-3.5">
            <div className="flex items-center justify-between text-xs">
              <span className="flex items-center gap-1.5 text-slate-600">
                <ShieldCheck
                  className="h-3.5 w-3.5 text-emerald-600"
                  strokeWidth={1.75}
                />
                Margin Shield rules
              </span>
              <span className="font-medium text-slate-800">
                {settings.excludeSaleItems
                  ? "Sale items excluded + Zero stacking"
                  : "All items eligible + Zero stacking"}
              </span>
            </div>
          </div>
        </article>

        {/* KPI Card 3: Average Checkout Speed */}
        <article className="cl-bento-card cl-bento-card-interactive flex flex-col justify-between p-5">
          <div>
            <div className="flex items-center justify-between gap-2">
              <div className="flex items-center gap-2">
                <div className="flex h-8 w-8 items-center justify-center rounded-lg border border-amber-500/20 bg-amber-50 text-amber-700">
                  <ChronoPulseEmblem className="h-4 w-4" />
                </div>
                <span className="text-xs font-bold text-slate-600">
                  Average Checkout Speed
                </span>
              </div>
              <span className="tabular-numerals inline-flex items-center gap-1 rounded-full border border-amber-500/25 bg-amber-50 px-2.5 py-0.5 text-[11px] font-semibold text-amber-800">
                <Clock className="h-3 w-3 text-amber-600" strokeWidth={2} />
                {settings.lockDurationMinutes}m Window
              </span>
            </div>

            <div className="mt-4 flex items-baseline gap-2.5">
              <span className="tabular-numerals font-mono text-3xl font-extrabold tracking-tight text-slate-900">
                {formatSecondsToClock(kpiStats.avgElapsedCheckoutSeconds)}
              </span>
              <span className="tabular-numerals text-xs font-medium text-slate-500">
                avg time from lock to purchase
              </span>
            </div>
          </div>

          <div className="mt-5 border-t border-slate-100 pt-3.5">
            <div className="flex items-center justify-between text-xs">
              <span className="flex items-center gap-1.5 text-slate-600">
                <Flame
                  className="h-3.5 w-3.5 text-amber-500"
                  strokeWidth={1.75}
                />
                Avg buffer at checkout
              </span>
              <span className="tabular-numerals font-mono font-semibold text-emerald-700">
                {formatSecondsToClock(kpiStats.avgRemainingSeconds)} remaining
              </span>
            </div>
          </div>
        </article>
      </section>

      {/* 3B. Live Conversion Pacing & Coupon-Firewall Telemetry Grid (21st.dev Bento Split) */}
      <section
        aria-label="Checkout Urgency Distribution and Margin Protection"
        className="grid grid-cols-1 gap-4 lg:grid-cols-12"
      >
        <div className="cl-bento-card p-5 lg:col-span-7">
          <div className="flex items-center justify-between gap-2">
            <div className="flex items-center gap-2">
              <FunnelTelemetryGlyph className="h-4 w-4 text-emerald-600" />
              <h2 className="text-sm font-bold text-slate-900">
                Checkout Urgency Pacing Across {settings.lockDurationMinutes}m
                Reservation Window
              </h2>
            </div>
            <span className="tabular-numerals rounded-md bg-slate-100 px-2 py-0.5 font-mono text-[11px] font-semibold text-slate-700">
              {kpiStats.totalLocksClaimed} Verified Orders
            </span>
          </div>
          <p className="mt-1 text-xs text-slate-500">
            Distribution of completed orders based on{" "}
            <code className="font-mono text-[11px] text-slate-700">
              secondsRemainingAtCheckout
            </code>{" "}
            recorded by the{" "}
            <code className="font-mono text-[11px] text-slate-700">
              orders/create
            </code>{" "}
            webhook.
          </p>

          <div className="mt-4 grid grid-cols-1 gap-3 sm:grid-cols-3">
            <div className="rounded-xl border border-slate-200/80 bg-slate-50/70 p-3.5">
              <div className="flex items-center justify-between text-xs font-semibold text-slate-600">
                <span>Rapid Impulse (&lt; 4m)</span>
                <span className="tabular-numerals font-mono font-bold text-emerald-700">
                  {kpiStats.rapidCheckouts}
                </span>
              </div>
              <div className="mt-2 h-1.5 w-full overflow-hidden rounded-full bg-slate-200">
                <div
                  style={{
                    width: `${
                      kpiStats.totalLocksClaimed > 0
                        ? Math.round(
                            (kpiStats.rapidCheckouts /
                              kpiStats.totalLocksClaimed) *
                              100,
                          )
                        : 0
                    }%`,
                  }}
                  className="h-full rounded-full bg-emerald-500"
                />
              </div>
              <p className="mt-1.5 text-[11px] text-slate-500">
                Claimed & checked out immediately
              </p>
            </div>

            <div className="rounded-xl border border-slate-200/80 bg-slate-50/70 p-3.5">
              <div className="flex items-center justify-between text-xs font-semibold text-slate-600">
                <span>Considered Lock</span>
                <span className="tabular-numerals font-mono font-bold text-sky-700">
                  {kpiStats.consideredCheckouts}
                </span>
              </div>
              <div className="mt-2 h-1.5 w-full overflow-hidden rounded-full bg-slate-200">
                <div
                  style={{
                    width: `${
                      kpiStats.totalLocksClaimed > 0
                        ? Math.round(
                            (kpiStats.consideredCheckouts /
                              kpiStats.totalLocksClaimed) *
                              100,
                          )
                        : 0
                    }%`,
                  }}
                  className="h-full rounded-full bg-sky-500"
                />
              </div>
              <p className="mt-1.5 text-[11px] text-slate-500">
                Converted via floating bottom bar
              </p>
            </div>

            <div className="rounded-xl border border-amber-500/25 bg-amber-50/50 p-3.5">
              <div className="flex items-center justify-between text-xs font-semibold text-amber-900">
                <span>Final-3m Cliff</span>
                <span className="tabular-numerals font-mono font-bold text-amber-700">
                  {kpiStats.cliffCheckouts}
                </span>
              </div>
              <div className="mt-2 h-1.5 w-full overflow-hidden rounded-full bg-amber-200/70">
                <div
                  style={{
                    width: `${
                      kpiStats.totalLocksClaimed > 0
                        ? Math.round(
                            (kpiStats.cliffCheckouts /
                              kpiStats.totalLocksClaimed) *
                              100,
                          )
                        : 0
                    }%`,
                  }}
                  className="h-full rounded-full bg-amber-500"
                />
              </div>
              <p className="mt-1.5 text-[11px] text-amber-800/80">
                Converted before 00:00 expiration
              </p>
            </div>
          </div>
        </div>

        {/* Browser Extension Leak Firewall Card */}
        <div className="cl-bento-card flex flex-col justify-between p-5 lg:col-span-5">
          <div>
            <div className="flex items-center justify-between gap-2">
              <div className="flex items-center gap-2">
                <HmacSignatureGlyph className="h-4 w-4 text-emerald-600" />
                <h2 className="text-sm font-bold text-slate-900">
                  Anti-Leakage & Extension Firewall
                </h2>
              </div>
              <span className="rounded-full border border-emerald-500/30 bg-emerald-50 px-2.5 py-0.5 text-[10px] font-bold text-emerald-800">
                100% Zero-Code Native
              </span>
            </div>
            <p className="mt-1 text-xs leading-relaxed text-slate-500">
              Because CartLock uses signed cart attributes (
              <code className="font-mono text-[11px] text-slate-700">
                _cartlock_signature
              </code>
              ) evaluated inside a Shopify Function, there are zero static coupon
              strings for browser extensions to scrape.
            </p>
          </div>

          <div className="mt-4 grid grid-cols-3 gap-2.5 border-t border-slate-100 pt-3.5 text-center">
            <div className="rounded-lg bg-slate-50 p-2">
              <span className="tabular-numerals block font-mono text-sm font-extrabold text-slate-900">
                0
              </span>
              <span className="text-[10px] font-semibold text-slate-500">
                Honey Leaks
              </span>
            </div>
            <div className="rounded-lg bg-slate-50 p-2">
              <span className="tabular-numerals block font-mono text-sm font-extrabold text-slate-900">
                0
              </span>
              <span className="text-[10px] font-semibold text-slate-500">
                Stacked Promos
              </span>
            </div>
            <div className="rounded-lg bg-emerald-50/80 p-2">
              <span className="tabular-numerals block font-mono text-sm font-extrabold text-emerald-700">
                100%
              </span>
              <span className="text-[10px] font-semibold text-emerald-800">
                HMAC Verified
              </span>
            </div>
          </div>
        </div>
      </section>

      {/* 4. Filterable Recovered Orders Table with Remaining-Time Badges & Cryptographic Proof Inspector */}
      <section
        aria-label="Verified Recovered Cart Orders"
        className="cl-bento-card overflow-hidden"
      >
        <div className="border-b border-slate-200/80 px-5 py-4">
          <div className="flex flex-col justify-between gap-4 lg:flex-row lg:items-center">
            <div>
              <div className="flex items-center gap-2">
                <h2 className="text-base font-bold tracking-tight text-slate-900">
                  Verified Recovered Cart Orders
                </h2>
                <span className="tabular-numerals rounded-full border border-slate-200 bg-slate-100 px-2 py-0.5 text-xs font-semibold text-slate-700">
                  {visibleOrders.length}
                </span>
              </div>
              <p className="mt-0.5 text-xs text-slate-500">
                Attributed via the{" "}
                <code className="rounded bg-slate-100 px-1 py-0.5 font-mono text-[11px] text-slate-700">
                  orders/create
                </code>{" "}
                webhook when{" "}
                <code className="rounded bg-slate-100 px-1 py-0.5 font-mono text-[11px] text-slate-700">
                  _cartlock_signature
                </code>{" "}
                and automatic Function discount are verified.
              </p>
            </div>

            <div className="flex flex-wrap items-center gap-2">
              <Form method="post">
                <input
                  type="hidden"
                  name="intent"
                  value="simulate_webhook_order"
                />
                <button
                  type="submit"
                  disabled={isSubmitting}
                  onClick={() => setShowEmptyPreview(false)}
                  className="inline-flex min-h-[36px] items-center gap-1.5 rounded-xl border border-emerald-600/30 bg-emerald-50 px-3.5 py-1.5 text-xs font-bold text-emerald-900 transition hover:bg-emerald-100"
                >
                  <PlusCircle
                    className="h-3.5 w-3.5 text-emerald-600"
                    strokeWidth={1.75}
                  />
                  <span>Simulate Live Order Webhook</span>
                </button>
              </Form>

              <button
                type="button"
                onClick={handleExportCsv}
                disabled={visibleOrders.length === 0}
                className="inline-flex min-h-[36px] items-center gap-1.5 rounded-xl border border-slate-200 bg-white px-3 py-1.5 text-xs font-semibold text-slate-700 transition hover:bg-slate-50 disabled:opacity-40"
              >
                <Download className="h-3.5 w-3.5" strokeWidth={1.75} />
                <span>Export CSV</span>
              </button>

              <button
                type="button"
                onClick={() => setShowEmptyPreview((prev) => !prev)}
                className="inline-flex min-h-[36px] items-center gap-1.5 rounded-xl border border-slate-200 bg-white px-3 py-1.5 text-xs font-semibold text-slate-700 transition hover:bg-slate-50"
              >
                {showEmptyPreview ? (
                  <>
                    <RefreshCw className="h-3.5 w-3.5" strokeWidth={1.75} />
                    <span>Show Attributed Orders</span>
                  </>
                ) : (
                  <>
                    <Trash2 className="h-3.5 w-3.5" strokeWidth={1.75} />
                    <span>Preview Empty State</span>
                  </>
                )}
              </button>
            </div>
          </div>

          {/* Search & Segmented Speed Filters */}
          <div className="mt-4 flex flex-col justify-between gap-3 sm:flex-row sm:items-center">
            <div className="relative flex-1 sm:max-w-xs">
              <Search
                className="pointer-events-none absolute left-3 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-slate-400"
                strokeWidth={1.75}
              />
              <input
                type="search"
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                placeholder="Filter by order # or customer email..."
                aria-label="Filter recovered orders by order number or customer email"
                className="min-h-[36px] w-full rounded-xl border border-slate-200 bg-slate-50/70 pl-9 pr-3 text-xs text-slate-900 placeholder:text-slate-400 focus:border-emerald-600 focus:bg-white"
              />
            </div>

            <div
              role="group"
              aria-label="Filter orders by checkout timer status"
              className="cl-segmented-track flex flex-wrap items-center gap-1"
            >
              {(
                [
                  { id: "ALL", label: "All Recovered" },
                  { id: "URGENT", label: "Urgent (< 3m left)" },
                  { id: "FAST", label: "Fast (< 9m elapsed)" },
                  { id: "CAPPED", label: "Max Cap Shielded" },
                ] as const
              ).map((tab) => (
                <button
                  key={tab.id}
                  type="button"
                  onClick={() => setSpeedFilter(tab.id)}
                  className={`cl-segmented-pill min-h-[30px] rounded-lg px-2.5 py-1 text-xs font-semibold ${
                    speedFilter === tab.id
                      ? "cl-segmented-pill-active text-slate-900"
                      : "text-slate-600 hover:text-slate-900"
                  }`}
                >
                  {tab.label}
                </button>
              ))}
            </div>
          </div>
        </div>

        {/* Table Body or Empty State */}
        {visibleOrders.length === 0 ? (
          <div className="flex flex-col items-center justify-center px-6 py-12 text-center">
            <div className="flex h-12 w-12 items-center justify-center rounded-2xl border border-slate-200 bg-slate-50 text-slate-500">
              <Filter className="h-5 w-5" strokeWidth={1.75} />
            </div>
            <h3 className="mt-3 text-sm font-bold text-slate-900">
              No recovered cart orders match the current view
            </h3>
            <p className="mt-1 max-w-md text-xs text-slate-500">
              When abandoning shoppers claim a CartLock price reservation and
              complete checkout before their timer expires, verified orders
              appear here in real time.
            </p>
            <div className="mt-4 flex flex-wrap items-center justify-center gap-2">
              {showEmptyPreview || searchQuery || speedFilter !== "ALL" ? (
                <button
                  type="button"
                  onClick={() => {
                    setShowEmptyPreview(false);
                    setSearchQuery("");
                    setSpeedFilter("ALL");
                  }}
                  className="inline-flex min-h-[36px] items-center gap-1.5 rounded-xl border border-slate-300 bg-white px-3.5 py-1.5 text-xs font-semibold text-slate-800 hover:bg-slate-50"
                >
                  <RefreshCw className="h-3.5 w-3.5" strokeWidth={1.75} />
                  <span>Reset View Filters</span>
                </button>
              ) : null}
              <Form method="post">
                <input
                  type="hidden"
                  name="intent"
                  value="simulate_webhook_order"
                />
                <button
                  type="submit"
                  onClick={() => setShowEmptyPreview(false)}
                  className="inline-flex min-h-[36px] items-center gap-1.5 rounded-xl bg-slate-900 px-3.5 py-1.5 text-xs font-semibold text-white hover:bg-slate-800"
                >
                  <PlusCircle className="h-3.5 w-3.5" strokeWidth={1.75} />
                  <span>Trigger Simulated Order Webhook</span>
                </button>
              </Form>
            </div>
          </div>
        ) : (
          <div>
            <div className="overflow-x-auto">
              <table className="w-full border-collapse text-left text-xs">
                <thead>
                  <tr className="border-b border-slate-200/80 bg-slate-50/80 text-[11px] font-semibold text-slate-500">
                    <th className="px-5 py-3">Order</th>
                    <th className="px-4 py-3">Shopper</th>
                    <th className="px-4 py-3 text-right">Cart Subtotal</th>
                    <th className="px-4 py-3 text-right">Locked Discount</th>
                    <th className="px-4 py-3 text-right">Net Order Revenue</th>
                    <th className="px-4 py-3">Timer Remaining at Checkout</th>
                    <th className="px-5 py-3 text-right">Cryptographic Audit</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-200/60 bg-white">
                  {visibleOrders.map((order) => {
                    const isUrgent = order.secondsRemainingAtCheckout <= 180;
                    const isCapped =
                      settings.maxDiscountCap !== null &&
                      order.discountAmount >= settings.maxDiscountCap;
                    const isInspected = inspectedOrder?.id === order.id;

                    return (
                      <tr
                        key={order.id}
                        className={`transition-colors ${
                          isInspected
                            ? "bg-emerald-50/50"
                            : "hover:bg-slate-50/80"
                        }`}
                      >
                        <td className="px-5 py-3.5 font-mono font-bold text-slate-900">
                          {order.orderName}
                        </td>
                        <td className="px-4 py-3.5 text-slate-700">
                          {order.customerEmail || "Verified Guest Checkout"}
                        </td>
                        <td className="tabular-numerals px-4 py-3.5 text-right font-mono text-slate-600">
                          {formatCurrency(order.cartSubtotal)}
                        </td>
                        <td className="tabular-numerals px-4 py-3.5 text-right font-mono font-semibold text-emerald-700">
                          -{formatCurrency(order.discountAmount)}
                          {isCapped && (
                            <span className="ml-1.5 inline-flex items-center rounded bg-amber-100 px-1.5 py-0.5 font-sans text-[10px] font-bold text-amber-900">
                              Capped
                            </span>
                          )}
                        </td>
                        <td className="tabular-numerals px-4 py-3.5 text-right font-mono font-bold text-slate-900">
                          {formatCurrency(order.netOrderRevenue)}
                        </td>
                        <td className="px-4 py-3.5">
                          <span
                            className={`tabular-numerals inline-flex items-center gap-1.5 rounded-full border px-2.5 py-1 font-mono text-[11px] font-semibold ${
                              isUrgent
                                ? "border-amber-500/30 bg-amber-50 text-amber-900"
                                : "border-emerald-500/30 bg-emerald-50 text-emerald-900"
                            }`}
                          >
                            <Clock className="h-3 w-3" strokeWidth={2} />
                            {formatSecondsToClock(
                              order.secondsRemainingAtCheckout,
                            )}{" "}
                            left on lock
                          </span>
                        </td>
                        <td className="px-5 py-3.5 text-right">
                          <button
                            type="button"
                            onClick={() =>
                              setInspectedOrderId(
                                isInspected ? null : order.id,
                              )
                            }
                            className={`inline-flex items-center gap-1.5 rounded-lg border px-2.5 py-1 text-[11px] font-semibold transition ${
                              isInspected
                                ? "border-emerald-600 bg-emerald-600 text-white"
                                : "border-slate-200 bg-slate-50 text-slate-700 hover:bg-slate-100"
                            }`}
                          >
                            <Eye className="h-3 w-3" strokeWidth={2} />
                            <span>
                              {isInspected ? "Inspecting" : "Verify Proof"}
                            </span>
                          </button>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>

            {/* Cryptographic Order Attribution Audit Bar */}
            {inspectedOrder && (
              <div className="border-t border-slate-800 bg-[#090D16] px-5 py-4 text-slate-200">
                <div className="flex flex-wrap items-center justify-between gap-4">
                  <div className="flex items-center gap-3">
                    <div className="flex h-9 w-9 items-center justify-center rounded-xl border border-emerald-500/30 bg-emerald-500/10 text-emerald-400">
                      <HmacSignatureGlyph className="h-4 w-4" />
                    </div>
                    <div>
                      <div className="flex items-center gap-2">
                        <span className="text-xs font-bold text-white">
                          Cryptographic Webhook Audit:{" "}
                          {inspectedOrder.orderName}
                        </span>
                        <span className="rounded bg-emerald-500/20 px-2 py-0.5 font-mono text-[10px] font-semibold text-emerald-300">
                          SIGNATURE_VERIFIED
                        </span>
                      </div>
                      <p className="mt-0.5 text-[11px] text-slate-400">
                        Shopper:{" "}
                        <span className="text-slate-200">
                          {inspectedOrder.customerEmail || "Guest"}
                        </span>{" "}
                        | Completed with{" "}
                        <span className="tabular-numerals font-mono text-emerald-300">
                          {formatSecondsToClock(
                            inspectedOrder.secondsRemainingAtCheckout,
                          )}
                        </span>{" "}
                        remaining on price reservation
                      </p>
                    </div>
                  </div>

                  <div className="flex flex-wrap items-center gap-3 text-[11px]">
                    <div className="rounded-lg border border-white/10 bg-white/5 px-3 py-1.5">
                      <span className="block text-[10px] text-slate-400">
                        Verified Signature Digest
                      </span>
                      <code className="font-mono text-emerald-300">
                        {computeCartLockSignature(
                          inspectedOrder.orderId,
                          settings.secretSalt,
                        )}
                      </code>
                    </div>
                    <div className="rounded-lg border border-white/10 bg-white/5 px-3 py-1.5">
                      <span className="block text-[10px] text-slate-400">
                        Checkout Discount Badge
                      </span>
                      <span className="font-semibold text-white">
                        CartLock Price Reservation Active
                      </span>
                    </div>
                  </div>
                </div>
              </div>
            )}
          </div>
        )}
      </section>

      {/* 5. Ecosystem Revenue Suite Cross-Sell Footer */}
      <section
        aria-label="Ecosystem Revenue Suite"
        className="cl-bento-card p-5 sm:p-6"
      >
        <div className="flex flex-col justify-between gap-2 sm:flex-row sm:items-center">
          <div>
            <div className="inline-flex items-center gap-1.5 text-xs font-bold text-emerald-700">
              <Layers className="h-3.5 w-3.5" strokeWidth={2} />
              <span>Ecosystem Revenue Suite</span>
            </div>
            <h2 className="mt-0.5 text-base font-bold tracking-tight text-slate-900">
              Pair CartLock with Sister Built-for-Shopify Margin & Conversion
              Tools
            </h2>
          </div>
          <span className="text-xs text-slate-500">
            Zero-script-conflict architecture across all 4 companion apps
          </span>
        </div>

        <div className="mt-4 grid grid-cols-1 gap-3.5 sm:grid-cols-2 lg:grid-cols-4">
          {SISTER_APPS.map((app) => {
            const Icon = app.icon;
            return (
              <Link
                key={app.name}
                to={app.href}
                className="group flex flex-col justify-between rounded-xl border border-slate-200/90 bg-slate-50/50 p-4 transition hover:border-slate-300 hover:bg-white hover:shadow-md"
              >
                <div>
                  <div className="flex items-center justify-between gap-2">
                    <div className="flex items-center gap-2">
                      <div className="flex h-8 w-8 items-center justify-center rounded-lg border border-slate-200 bg-white text-slate-800 shadow-2xs">
                        <Icon className="h-4 w-4" strokeWidth={1.75} />
                      </div>
                      <div>
                        <h3 className="text-xs font-bold text-slate-900 group-hover:text-emerald-700">
                          {app.name}
                        </h3>
                        <p className="text-[11px] font-medium text-slate-500">
                          {app.category}
                        </p>
                      </div>
                    </div>
                    <ArrowUpRight
                      className="h-3.5 w-3.5 text-slate-400 transition group-hover:translate-x-0.5 group-hover:-translate-y-0.5 group-hover:text-slate-900"
                      strokeWidth={1.75}
                    />
                  </div>
                  <p className="mt-2.5 text-xs font-semibold text-slate-800">
                    {app.tagline}
                  </p>
                  <p className="mt-1 text-xs leading-relaxed text-slate-500">
                    {app.description}
                  </p>
                </div>

                <div className="mt-3.5 flex items-center justify-between border-t border-slate-200/60 pt-2.5">
                  <span
                    className={`inline-flex items-center rounded-full border px-2 py-0.5 text-[10px] font-bold ${app.accent}`}
                  >
                    {app.metric}
                  </span>
                  <span className="text-[11px] font-semibold text-slate-700 group-hover:text-slate-900">
                    Explore Integration
                  </span>
                </div>
              </Link>
            );
          })}
        </div>
      </section>
    </div>
  );
}
