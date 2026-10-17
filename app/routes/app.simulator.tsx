import { useMemo, useState } from "react";
import type { LoaderFunctionArgs } from "@remix-run/node";
import { json } from "@remix-run/node";
import { Link, useLoaderData } from "@remix-run/react";
import {
  AlertTriangle,
  CheckCircle2,
  Clock,
  Code2,
  Cpu,
  DollarSign,
  KeyRound,
  Lock,
  Play,
  RefreshCw,
  ShieldAlert,
  ShieldCheck,
  SlidersHorizontal,
  Sparkles,
  Tag,
  Timer,
  TrendingUp,
  Unlock,
  XCircle,
} from "lucide-react";
import { authenticateAdminOrFallback } from "../shopify.server";
import { ensureShopSettings } from "../services/seed.server";
import { fetchStoreCatalogProducts } from "../services/catalog.server";
import {
  computeCartLockSignature,
  evaluateCartLockFunction,
  parsePriceLockTiers,
  type FunctionRunInput,
} from "../services/cartlock-crypto";
import {
  ChronoPulseEmblem,
  HmacSignatureGlyph,
  MarginShieldEmblem,
} from "../components/StudioIcons";

export const loader = async ({ request }: LoaderFunctionArgs) => {
  const { shop, admin } = await authenticateAdminOrFallback(request);
  const settings = await ensureShopSettings(shop);
  const catalogProducts = await fetchStoreCatalogProducts(admin);

  return json({
    shop,
    settings,
    catalogProducts,
  });
};

function formatClock(totalSeconds: number): string {
  const clamped = Math.max(0, Math.floor(totalSeconds));
  const mins = Math.floor(clamped / 60);
  const secs = clamped % 60;
  return `${String(mins).padStart(2, "0")}:${String(secs).padStart(2, "0")}`;
}

export default function ExpirationAndPacingSimulatorRoute() {
  const { settings, catalogProducts } = useLoaderData<typeof loader>();

  // Sandbox Interactive State
  const [selectedProductId, setSelectedProductId] = useState<string>(
    catalogProducts[0]?.id || "",
  );
  const [simulatedCartSubtotal, setSimulatedCartSubtotal] = useState<number>(
    catalogProducts[0]?.primaryVariant.price || 168,
  );
  const [elapsedMinutes, setElapsedMinutes] = useState<number>(4.5);
  const [tamperSignature, setTamperSignature] = useState<boolean>(false);
  const [includeBonusSaleItem, setIncludeBonusSaleItem] =
    useState<boolean>(false);

  const selectedProduct = useMemo(
    () =>
      catalogProducts.find((p) => p.id === selectedProductId) ||
      catalogProducts[0],
    [catalogProducts, selectedProductId],
  );

  const saleCatalogProduct = useMemo(
    () =>
      catalogProducts.find((p) => p.isOnSale) ||
      catalogProducts[2] ||
      catalogProducts[0],
    [catalogProducts],
  );

  // Build the exact FunctionRunInput that Shopify passes to purchase.product-discount.run
  const simulationResult = useMemo(() => {
    const baseLockTimeMs = Date.parse("2026-10-17T12:00:00.000Z");
    const expiresAtMs =
      baseLockTimeMs + settings.lockDurationMinutes * 60 * 1000;
    const expiresAtIso = new Date(expiresAtMs).toISOString();

    const simulatedShopNowMs =
      baseLockTimeMs + Math.round(elapsedMinutes * 60 * 1000);
    const shopLocalTimeIso = new Date(simulatedShopNowMs).toISOString();

    const validSignature = computeCartLockSignature(
      expiresAtIso,
      settings.secretSalt,
    );

    // If tamperSignature is enabled, simulate a shopper editing _cartlock_expires_at in DevTools
    const effectiveExpiresAtIso = tamperSignature
      ? new Date(expiresAtMs + 3600 * 1000).toISOString()
      : expiresAtIso;

    const lines: FunctionRunInput["cart"]["lines"] = [
      {
        id: "gid://shopify/CartLine/line-primary-01",
        title: selectedProduct.title,
        quantity: 1,
        cost: {
          amountPerQuantity: {
            amount: simulatedCartSubtotal.toFixed(2),
          },
          compareAtAmountPerQuantity: selectedProduct.isOnSale
            ? {
                amount: (
                  selectedProduct.primaryVariant.compareAtPrice ||
                  simulatedCartSubtotal * 1.3
                ).toFixed(2),
              }
            : null,
        },
        merchandise: {
          __typename: "ProductVariant",
          id: selectedProduct.primaryVariant.id,
          title: selectedProduct.primaryVariant.title,
        },
      },
    ];

    let totalSubtotal = simulatedCartSubtotal;

    if (includeBonusSaleItem && !selectedProduct.isOnSale) {
      const salePrice = saleCatalogProduct.primaryVariant.price;
      const saleCompare =
        saleCatalogProduct.primaryVariant.compareAtPrice || salePrice * 1.35;
      lines.push({
        id: "gid://shopify/CartLine/line-clearance-02",
        title: saleCatalogProduct.title,
        quantity: 1,
        cost: {
          amountPerQuantity: {
            amount: salePrice.toFixed(2),
          },
          compareAtAmountPerQuantity: {
            amount: saleCompare.toFixed(2),
          },
        },
        merchandise: {
          __typename: "ProductVariant",
          id: saleCatalogProduct.primaryVariant.id,
          title: saleCatalogProduct.primaryVariant.title,
        },
      });
      totalSubtotal += salePrice;
    }

    const functionInput: FunctionRunInput = {
      cart: {
        cost: {
          subtotalAmount: {
            amount: totalSubtotal.toFixed(2),
          },
        },
        expiresAt: {
          value: effectiveExpiresAtIso,
        },
        signature: {
          value: validSignature,
        },
        lines,
      },
      shop: {
        localTime: {
          dateTime: shopLocalTimeIso,
        },
      },
      discountNode: {
        metafield: {
          value: JSON.stringify({
            isActive: settings.isActive,
            discountType: settings.discountType,
            discountValue: settings.discountValue,
            maxDiscountCap: settings.maxDiscountCap,
            excludeSaleItems: settings.excludeSaleItems,
            minCartSubtotal: settings.minCartSubtotal,
            enableTieredLadder:
              (settings as { enableTieredLadder?: boolean }).enableTieredLadder ??
              true,
            tiers: parsePriceLockTiers(
              (settings as { tieredLadderConfig?: string }).tieredLadderConfig,
            ),
            lockDurationMinutes: settings.lockDurationMinutes,
            secretSalt: settings.secretSalt,
          }),
        },
      },
    };

    const evaluation = evaluateCartLockFunction(functionInput);
    return {
      functionInput,
      evaluation,
    };
  }, [
    selectedProduct,
    saleCatalogProduct,
    simulatedCartSubtotal,
    elapsedMinutes,
    tamperSignature,
    includeBonusSaleItem,
    settings,
  ]);

  const { functionInput, evaluation } = simulationResult;
  const isDiscountGranted =
    evaluation.status === "GRANTED" || evaluation.status === "GRANTED_CAPPED";

  const lockMarkerPercent = Math.min(
    100,
    Math.round((settings.lockDurationMinutes / 30) * 100),
  );
  const currentSliderPercent = Math.min(
    100,
    Math.round((elapsedMinutes / 30) * 100),
  );

  return (
    <div className="space-y-6 pb-14">
      {/* Page Header */}
      <div className="flex flex-col justify-between gap-4 sm:flex-row sm:items-center">
        <div>
          <h1 className="text-xl font-bold tracking-tight text-slate-900">
            Expiration & Pacing Simulator
          </h1>
          <p className="mt-0.5 text-xs text-slate-500">
            Interactive sandbox executing the exact{" "}
            <code className="font-mono text-[11px] text-slate-700">
              purchase.product-discount.run
            </code>{" "}
            Shopify Function engine across cart subtotals, clearance items, and
            time-elapsed boundaries.
          </p>
        </div>

        <div className="flex items-center gap-2">
          <button
            type="button"
            onClick={() => {
              setSelectedProductId(catalogProducts[0]?.id || "");
              setSimulatedCartSubtotal(
                catalogProducts[0]?.primaryVariant.price || 168,
              );
              setElapsedMinutes(4.5);
              setTamperSignature(false);
              setIncludeBonusSaleItem(false);
            }}
            className="inline-flex min-h-[36px] items-center gap-1.5 rounded-xl border border-slate-200 bg-white px-3.5 py-1.5 text-xs font-semibold text-slate-700 shadow-2xs hover:bg-slate-50"
          >
            <RefreshCw className="h-3.5 w-3.5" strokeWidth={1.75} />
            <span>Reset Sandbox</span>
          </button>
          <Link
            to="/app/settings"
            className="inline-flex min-h-[36px] items-center gap-1.5 rounded-xl bg-slate-900 px-3.5 py-1.5 text-xs font-semibold text-white hover:bg-slate-800"
          >
            <SlidersHorizontal className="h-3.5 w-3.5" strokeWidth={1.75} />
            <span>Edit Function Rules</span>
          </Link>
        </div>
      </div>

      {/* Quick Scenario Preset Bar */}
      <section
        aria-label="Quick Simulation Scenarios"
        className="cl-bento-card flex flex-wrap items-center justify-between gap-3 px-5 py-3.5"
      >
        <span className="text-xs font-bold text-slate-700">
          One-Click Test Scenarios:
        </span>
        <div className="flex flex-wrap items-center gap-2">
          <button
            type="button"
            onClick={() => {
              setSelectedProductId(catalogProducts[0].id);
              setSimulatedCartSubtotal(168);
              setElapsedMinutes(4.0);
              setTamperSignature(false);
              setIncludeBonusSaleItem(false);
            }}
            className="rounded-lg border border-emerald-500/30 bg-emerald-50 px-3 py-1.5 text-xs font-semibold text-emerald-900 hover:bg-emerald-100"
          >
            1. Active Lock (04:00 Elapsed)
          </button>
          <button
            type="button"
            onClick={() => {
              setSelectedProductId(catalogProducts[0].id);
              setSimulatedCartSubtotal(360);
              setElapsedMinutes(6.0);
              setTamperSignature(false);
              setIncludeBonusSaleItem(false);
            }}
            className="rounded-lg border border-sky-500/30 bg-sky-50 px-3 py-1.5 text-xs font-semibold text-sky-900 hover:bg-sky-100"
          >
            2. Max Dollar Cap ($360 Cart)
          </button>
          <button
            type="button"
            onClick={() => {
              setSelectedProductId(catalogProducts[0].id);
              setSimulatedCartSubtotal(38);
              setElapsedMinutes(3.0);
              setTamperSignature(false);
              setIncludeBonusSaleItem(false);
            }}
            className="rounded-lg border border-amber-500/30 bg-amber-50 px-3 py-1.5 text-xs font-semibold text-amber-900 hover:bg-amber-100"
          >
            3. Below Min Subtotal ($38 Stretch Goal)
          </button>
          <button
            type="button"
            onClick={() => {
              setSelectedProductId(saleCatalogProduct.id);
              setSimulatedCartSubtotal(195);
              setElapsedMinutes(5.0);
              setTamperSignature(false);
              setIncludeBonusSaleItem(false);
            }}
            className="rounded-lg border border-purple-500/30 bg-purple-50 px-3 py-1.5 text-xs font-semibold text-purple-900 hover:bg-purple-100"
          >
            4. Margin Shield (Clearance Sale Item)
          </button>
          <button
            type="button"
            onClick={() => {
              setSelectedProductId(catalogProducts[0].id);
              setSimulatedCartSubtotal(168);
              setElapsedMinutes(settings.lockDurationMinutes + 3);
              setTamperSignature(false);
            }}
            className="rounded-lg border border-rose-500/30 bg-rose-50 px-3 py-1.5 text-xs font-semibold text-rose-900 hover:bg-rose-100"
          >
            5. Timer Expired ({settings.lockDurationMinutes + 3}m Elapsed)
          </button>
          <button
            type="button"
            onClick={() => {
              setSelectedProductId(catalogProducts[0].id);
              setSimulatedCartSubtotal(168);
              setElapsedMinutes(5.0);
              setTamperSignature(true);
            }}
            className="rounded-lg border border-slate-800 bg-slate-900 px-3 py-1.5 text-xs font-semibold text-white hover:bg-slate-800"
          >
            6. DevTools Tamper Attack
          </button>
        </div>
      </section>

      <div className="grid grid-cols-1 items-start gap-6 lg:grid-cols-12">
        {/* LEFT COLUMN: Interactive Sandbox Controls */}
        <div className="space-y-6 lg:col-span-6">
          {/* Control Card 1: Simulated Time Elapsed Slider (0 to 30 Minutes) */}
          <section className="cl-bento-card p-5 sm:p-6">
            <div className="flex items-center justify-between gap-2">
              <div className="flex items-center gap-2.5">
                <div className="flex h-9 w-9 items-center justify-center rounded-xl border border-slate-200 bg-slate-50 text-slate-900">
                  <Timer className="h-4 w-4" strokeWidth={1.75} />
                </div>
                <div>
                  <h2 className="text-sm font-bold text-slate-900">
                    Simulated Time Elapsed (0 to 30 Minutes)
                  </h2>
                  <p className="text-xs text-slate-500">
                    Drag across the{" "}
                    <span className="tabular-numerals font-semibold text-slate-800">
                      {settings.lockDurationMinutes}:00
                    </span>{" "}
                    expiration cliff to test instant checkout revocation.
                  </p>
                </div>
              </div>

              <div className="text-right">
                <span className="tabular-numerals font-mono text-2xl font-extrabold text-slate-900">
                  {formatClock(elapsedMinutes * 60)}
                </span>
                <span className="block text-[10px] font-semibold text-slate-500">
                  Elapsed Since Lock
                </span>
              </div>
            </div>

            {/* Interactive Range Slider */}
            <div className="mt-5 space-y-2">
              <input
                id="simulatedTimeElapsedSlider"
                type="range"
                min="0"
                max="30"
                step="0.25"
                value={elapsedMinutes}
                onChange={(e) => setElapsedMinutes(parseFloat(e.target.value))}
                aria-label="Simulated Time Elapsed (0 to 30 minutes)"
                className="h-2.5 w-full cursor-pointer appearance-none rounded-full bg-slate-200 accent-emerald-600"
              />

              {/* Visual Expiration Timeline Bar */}
              <div className="relative h-3 w-full overflow-hidden rounded-full bg-slate-100 border border-slate-200">
                <div
                  style={{ width: `${lockMarkerPercent}%` }}
                  className="absolute inset-y-0 left-0 bg-emerald-500/20 border-r-2 border-emerald-600"
                />
                <div
                  style={{ width: `${currentSliderPercent}%` }}
                  className={`h-full transition-all duration-150 ${
                    elapsedMinutes < settings.lockDurationMinutes
                      ? "bg-emerald-500"
                      : "bg-rose-500"
                  }`}
                />
              </div>

              <div className="tabular-numerals flex items-center justify-between font-mono text-[11px] text-slate-500">
                <span>00:00 (Lock Claimed)</span>
                <span className="font-bold text-emerald-700">
                  {settings.lockDurationMinutes}:00 (Expiration Cliff)
                </span>
                <span>30:00 Max</span>
              </div>
            </div>
          </section>

          {/* Control Card 2: Catalog Product & Simulated Cart Subtotal */}
          <section className="cl-bento-card p-5 sm:p-6">
            <h2 className="text-sm font-bold text-slate-900">
              Catalog Product & Simulated Cart Subtotal
            </h2>
            <p className="mt-0.5 text-xs text-slate-500">
              Select any active catalog item and adjust the simulated cart
              subtotal to test Stretch Goal thresholds, Margin Shield sale
              exclusions, and Max Discount Caps.
            </p>

            {/* Product Grid Selection */}
            <div className="mt-4 space-y-2">
              <label className="block text-xs font-semibold text-slate-700">
                Active Catalog Product in Cart
              </label>
              <div className="grid grid-cols-1 gap-2.5 sm:grid-cols-2">
                {catalogProducts.map((item) => {
                  const selected = item.id === selectedProduct.id;
                  return (
                    <button
                      key={item.id}
                      type="button"
                      onClick={() => {
                        setSelectedProductId(item.id);
                        setSimulatedCartSubtotal(item.primaryVariant.price);
                      }}
                      className={`flex items-center gap-3 rounded-xl border p-2.5 text-left transition ${
                        selected
                          ? "border-emerald-600 bg-emerald-50/50 ring-1 ring-emerald-600/30"
                          : "border-slate-200 bg-white hover:border-slate-300"
                      }`}
                    >
                      <div className="h-11 w-11 shrink-0 overflow-hidden rounded-lg border border-slate-200 bg-white p-0.5">
                        <img
                          src={item.imageUrl}
                          alt={item.title}
                          className="h-full w-full object-contain"
                        />
                      </div>
                      <div className="min-w-0 flex-1">
                        <p className="truncate text-xs font-bold text-slate-900">
                          {item.title}
                        </p>
                        <div className="mt-0.5 flex items-center gap-1.5">
                          <span className="tabular-numerals font-mono text-xs font-semibold text-slate-800">
                            ${item.primaryVariant.price.toFixed(2)}
                          </span>
                          {item.isOnSale && (
                            <span className="rounded bg-amber-100 px-1.5 py-0.5 text-[10px] font-bold text-amber-900">
                              Sale (Compare $
                              {item.primaryVariant.compareAtPrice?.toFixed(0)})
                            </span>
                          )}
                        </div>
                      </div>
                    </button>
                  );
                })}
              </div>
            </div>

            {/* Simulated Cart Subtotal Slider & Numeric Input */}
            <div className="mt-5 space-y-2">
              <div className="flex items-center justify-between">
                <label
                  htmlFor="simulatedSubtotalInput"
                  className="text-xs font-semibold text-slate-700"
                >
                  Simulated Primary Line Item Subtotal ($)
                </label>
                <div className="flex items-center gap-1.5">
                  <span className="text-xs font-bold text-slate-500">$</span>
                  <input
                    id="simulatedSubtotalInput"
                    type="number"
                    min="5"
                    max="1000"
                    step="1"
                    value={simulatedCartSubtotal}
                    onChange={(e) =>
                      setSimulatedCartSubtotal(
                        Math.max(0, parseFloat(e.target.value || "0")),
                      )
                    }
                    className="tabular-numerals h-8 w-24 rounded-lg border border-slate-200 bg-white px-2 text-right font-mono text-xs font-bold text-slate-900"
                  />
                </div>
              </div>

              <input
                type="range"
                min="15"
                max="500"
                step="1"
                value={simulatedCartSubtotal}
                onChange={(e) =>
                  setSimulatedCartSubtotal(parseFloat(e.target.value))
                }
                aria-label="Simulated Cart Subtotal Slider"
                className="h-2 w-full cursor-pointer appearance-none rounded-full bg-slate-200 accent-slate-900"
              />

              <div className="tabular-numerals flex justify-between font-mono text-[11px] text-slate-500">
                <span>$15.00</span>
                <span className="font-semibold text-amber-700">
                  Min Entry: ${evaluation.resolvedTiers[0]?.threshold.toFixed(2) || settings.minCartSubtotal.toFixed(2)}
                </span>
                <span>$500.00</span>
              </div>

              {/* Interactive Multi-Tier AOV Escalator Checkpoints */}
              {evaluation.resolvedTiers.length > 1 && (
                <div className="mt-3 rounded-xl border border-emerald-500/25 bg-emerald-50/40 p-3">
                  <div className="flex items-center justify-between text-[11px] font-semibold">
                    <span className="text-slate-800">
                      Multi-Tier AOV Escalator Checkpoints:
                    </span>
                    <span className="tabular-numerals font-mono text-emerald-800">
                      {evaluation.activeTier
                        ? `Active: Tier ${evaluation.activeTier.tier} (${evaluation.effectiveDiscountValue}% Off)`
                        : `Add $${evaluation.stretchGoalShortfall.toFixed(2)} for Tier 1`}
                    </span>
                  </div>

                  <div className="mt-2 grid grid-cols-3 gap-2">
                    {evaluation.resolvedTiers.map((tierStep) => {
                      const unlocked =
                        evaluation.cartSubtotal >= tierStep.threshold;
                      const isCurrent =
                        evaluation.activeTier?.tier === tierStep.tier;
                      return (
                        <button
                          key={tierStep.tier}
                          type="button"
                          onClick={() =>
                            setSimulatedCartSubtotal(tierStep.threshold + 12)
                          }
                          className={`flex flex-col items-center rounded-lg border px-2.5 py-2 text-center transition ${
                            isCurrent
                              ? "border-emerald-600 bg-emerald-600 text-white shadow-xs"
                              : unlocked
                                ? "border-emerald-500/40 bg-emerald-100/70 text-emerald-950"
                                : "border-slate-200 bg-white text-slate-600 hover:border-slate-300"
                          }`}
                        >
                          <span className="font-mono text-[10px] font-bold">
                            Tier {tierStep.tier}: ${tierStep.threshold}+
                          </span>
                          <span className="tabular-numerals text-xs font-extrabold">
                            Lock {tierStep.discountValue}
                            {settings.discountType === "PERCENTAGE" ? "%" : "$"}{" "}
                            Off
                          </span>
                        </button>
                      );
                    })}
                  </div>
                </div>
              )}
            </div>

            {/* Additional Checkboxes: Mixed Cart Clearance Test & Anti-Inspect-Element Tamper */}
            <div className="mt-5 space-y-2.5 border-t border-slate-100 pt-4">
              {!selectedProduct.isOnSale && (
                <label className="flex cursor-pointer items-center justify-between gap-3 rounded-xl border border-slate-200 bg-slate-50/70 p-3">
                  <div>
                    <span className="block text-xs font-bold text-slate-900">
                      Add 2nd Clearance Sale Item to Cart (+$
                      {saleCatalogProduct.primaryVariant.price.toFixed(2)})
                    </span>
                    <span className="text-[11px] text-slate-500">
                      Tests partial-cart Margin Shield (discounts full-price
                      line, shields clearance line)
                    </span>
                  </div>
                  <input
                    type="checkbox"
                    checked={includeBonusSaleItem}
                    onChange={(e) => setIncludeBonusSaleItem(e.target.checked)}
                    className="h-4 w-4 rounded border-slate-300 text-emerald-600"
                  />
                </label>
              )}

              <label className="flex cursor-pointer items-center justify-between gap-3 rounded-xl border border-slate-200 bg-slate-50/70 p-3">
                <div>
                  <span className="block text-xs font-bold text-slate-900">
                    Simulate Shopper DevTools Timestamp Tampering
                  </span>
                  <span className="text-[11px] text-slate-500">
                    Mutates{" "}
                    <code className="font-mono text-slate-700">
                      _cartlock_expires_at
                    </code>{" "}
                    without matching{" "}
                    <code className="font-mono text-slate-700">
                      secretSalt
                    </code>{" "}
                    digest
                  </span>
                </div>
                <input
                  type="checkbox"
                  checked={tamperSignature}
                  onChange={(e) => setTamperSignature(e.target.checked)}
                  className="h-4 w-4 rounded border-slate-300 text-rose-600"
                />
              </label>
            </div>
          </section>
        </div>

        {/* RIGHT COLUMN: Real-Time Discount Function Verdict, Checkout Banner & JSON Payload */}
        <div className="space-y-6 lg:col-span-6">
          {/* Verdict Banner & Checkout UI Extension Preview */}
          <section className="cl-bento-card overflow-hidden p-5 sm:p-6">
            <div className="flex items-start justify-between gap-3">
              <div className="flex items-center gap-2.5">
                {isDiscountGranted ? (
                  <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-emerald-500/15 text-emerald-600 border border-emerald-500/30">
                    <CheckCircle2 className="h-5 w-5" strokeWidth={2} />
                  </div>
                ) : (
                  <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-rose-500/15 text-rose-600 border border-rose-500/30">
                    <ShieldAlert className="h-5 w-5" strokeWidth={2} />
                  </div>
                )}
                <div>
                  <div className="flex items-center gap-2">
                    <h2 className="text-sm font-extrabold text-slate-900">
                      Function Verdict: {evaluation.status}
                    </h2>
                    <span
                      className={`rounded-full px-2.5 py-0.5 text-[10px] font-bold ${
                        isDiscountGranted
                          ? "bg-emerald-100 text-emerald-900"
                          : "bg-rose-100 text-rose-900"
                      }`}
                    >
                      {isDiscountGranted
                        ? `-$${evaluation.finalDiscountDollars.toFixed(2)} Applied`
                        : "$0.00 Revoked"}
                    </span>
                  </div>
                  <p className="mt-0.5 text-xs text-slate-600">
                    {evaluation.statusReason}
                  </p>
                </div>
              </div>
            </div>

            {/* Simulated Native Checkout UI Extension Banner (purchase.checkout.block.render) */}
            <div className="mt-5 rounded-2xl border border-slate-200 bg-slate-50/90 p-4">
              <div className="flex items-center justify-between text-[11px] font-semibold text-slate-500 mb-2">
                <span>
                  Checkout UI Extension Preview (purchase.checkout.block.render)
                </span>
                <span className="tabular-numerals font-mono">
                  {evaluation.secondsRemaining > 0
                    ? `${formatClock(evaluation.secondsRemaining)} left`
                    : "00:00 Expired"}
                </span>
              </div>

              <div
                className={`rounded-xl border p-3.5 ${
                  isDiscountGranted
                    ? "border-emerald-500/35 bg-emerald-50/90 text-emerald-950"
                    : "border-amber-500/35 bg-amber-50/90 text-amber-950"
                }`}
              >
                <div className="flex items-center justify-between gap-2">
                  <span className="text-xs font-bold">
                    {isDiscountGranted
                      ? "CartLock Price Reservation Active"
                      : "Price Reservation Inactive / Reverted"}
                  </span>
                  <span className="tabular-numerals rounded-md bg-white/80 px-2 py-0.5 font-mono text-[11px] font-bold shadow-2xs">
                    {isDiscountGranted
                      ? `Expires in ${formatClock(evaluation.secondsRemaining)}`
                      : "Standard Catalog Price"}
                  </span>
                </div>
                <p className="mt-1 text-xs opacity-85">
                  {isDiscountGranted
                    ? `Your cryptographically verified $${evaluation.finalDiscountDollars.toFixed(2)} automatic discount is locked above your order summary.`
                    : evaluation.statusReason}
                </p>
              </div>

              {/* Simulated Checkout Order Summary Breakdown */}
              <div className="mt-4 space-y-2 border-t border-slate-200/80 pt-3 text-xs">
                <div className="flex justify-between text-slate-600">
                  <span>Gross Cart Subtotal</span>
                  <span className="tabular-numerals font-mono font-semibold text-slate-900">
                    ${evaluation.cartSubtotal.toFixed(2)}
                  </span>
                </div>
                <div className="flex justify-between text-slate-600">
                  <span>Eligible Full-Price Subtotal</span>
                  <span className="tabular-numerals font-mono text-slate-800">
                    ${evaluation.eligibleSubtotal.toFixed(2)}
                  </span>
                </div>
                {evaluation.excludedSaleSubtotal > 0 && (
                  <div className="flex justify-between text-amber-800">
                    <span>Margin Shield Excluded Sale Subtotal</span>
                    <span className="tabular-numerals font-mono font-semibold">
                      ${evaluation.excludedSaleSubtotal.toFixed(2)} (Protected)
                    </span>
                  </div>
                )}
                <div className="flex justify-between text-emerald-700">
                  <span>
                    Automatic Function Discount (
                    {isDiscountGranted
                      ? "CartLock Price Reservation Active"
                      : "None"}
                    )
                  </span>
                  <span className="tabular-numerals font-mono font-bold">
                    -${evaluation.finalDiscountDollars.toFixed(2)}
                  </span>
                </div>
                <div className="flex justify-between border-t border-slate-200 pt-2 text-sm font-extrabold text-slate-900">
                  <span>Checkout Payable Total</span>
                  <span className="tabular-numerals font-mono">
                    ${evaluation.finalPayableSubtotal.toFixed(2)}
                  </span>
                </div>
              </div>
            </div>
          </section>

          {/* Live Function Input & Output JSON Inspector */}
          <section className="rounded-2xl border border-slate-800 bg-[#090D16] p-5 text-slate-200 shadow-vault">
            <div className="flex items-center justify-between border-b border-white/10 pb-3">
              <div className="flex items-center gap-2">
                <Code2
                  className="h-4 w-4 text-emerald-400"
                  strokeWidth={1.75}
                />
                <h3 className="text-xs font-bold text-white">
                  Live Shopify Function Output Payload
                </h3>
              </div>
              <span className="rounded bg-white/10 px-2 py-0.5 font-mono text-[10px] text-emerald-300">
                extensions/cartlock-discount-function/src/run.ts
              </span>
            </div>

            <pre className="mt-3 max-h-[240px] overflow-auto rounded-xl bg-slate-950/90 p-3.5 font-mono text-[11px] leading-relaxed text-emerald-300">
              {JSON.stringify(evaluation.output, null, 2)}
            </pre>

            <div className="mt-3 flex flex-wrap items-center justify-between gap-2 border-t border-white/10 pt-3 text-[11px] text-slate-400">
              <span className="inline-flex items-center gap-1.5">
                <HmacSignatureGlyph className="h-3.5 w-3.5 text-emerald-400" />
                <span>Signature Check:</span>
                <strong
                  className={
                    evaluation.signatureValid
                      ? "text-emerald-400"
                      : "text-rose-400"
                  }
                >
                  {evaluation.signatureValid ? "VALID MATCH" : "TAMPER REJECTED"}
                </strong>
              </span>
              <code className="truncate font-mono text-[10px] text-slate-400">
                {functionInput.cart.signature?.value}
              </code>
            </div>
          </section>

          {/* Margin Shield vs. Static Coupon Leak ROI Comparison Card */}
          <section className="cl-bento-card p-5">
            <div className="flex items-start justify-between gap-3">
              <div className="flex items-center gap-2.5">
                <div className="flex h-9 w-9 items-center justify-center rounded-xl border border-emerald-500/25 bg-emerald-50 text-emerald-700">
                  <MarginShieldEmblem className="h-4 w-4" />
                </div>
                <div>
                  <h3 className="text-xs font-bold text-slate-900">
                    Margin Shield vs. Leaked Static Coupon (100 Checkouts)
                  </h3>
                  <p className="text-[11px] text-slate-500">
                    Compares this exact cart under CartLock Function rules vs. a
                    static <code className="font-mono">WELCOME10</code> promo
                    code scraped by browser extensions.
                  </p>
                </div>
              </div>
            </div>

            {(() => {
              const staticCouponLossPerOrder = Number(
                (
                  (evaluation.cartSubtotal * settings.discountValue) /
                  100
                ).toFixed(2),
              );
              const cartLockGiveawayPerOrder = evaluation.finalDiscountDollars;
              const marginSavedPerOrder = Math.max(
                0,
                Number(
                  (
                    staticCouponLossPerOrder - cartLockGiveawayPerOrder
                  ).toFixed(2),
                ),
              );
              const marginSavedPer100Orders = Number(
                (marginSavedPerOrder * 100).toFixed(2),
              );

              return (
                <div className="mt-4 grid grid-cols-1 gap-2.5 sm:grid-cols-3">
                  <div className="rounded-xl border border-rose-200/80 bg-rose-50/50 p-3">
                    <span className="text-[10px] font-semibold uppercase tracking-wider text-rose-700">
                      Static Coupon Leak
                    </span>
                    <p className="tabular-numerals mt-1 font-mono text-base font-extrabold text-rose-900">
                      -${staticCouponLossPerOrder.toFixed(2)} / order
                    </p>
                    <p className="mt-0.5 text-[10px] text-rose-700">
                      Discounts clearance items, uncapped, never expires
                    </p>
                  </div>

                  <div className="rounded-xl border border-slate-200/90 bg-slate-50/80 p-3">
                    <span className="text-[10px] font-semibold uppercase tracking-wider text-slate-600">
                      CartLock Function
                    </span>
                    <p className="tabular-numerals mt-1 font-mono text-base font-extrabold text-slate-900">
                      -${cartLockGiveawayPerOrder.toFixed(2)} / order
                    </p>
                    <p className="mt-0.5 text-[10px] text-slate-500">
                      Sale-shielded, capped at $
                      {(settings.maxDiscountCap || 25).toFixed(2)}, expires at{" "}
                      {settings.lockDurationMinutes}m
                    </p>
                  </div>

                  <div className="rounded-xl border border-emerald-500/30 bg-emerald-50/70 p-3">
                    <span className="text-[10px] font-semibold uppercase tracking-wider text-emerald-800">
                      Protected Profit (100 Orders)
                    </span>
                    <p className="tabular-numerals mt-1 font-mono text-base font-extrabold text-emerald-800">
                      +${marginSavedPer100Orders.toFixed(2)}
                    </p>
                    <p className="mt-0.5 text-[10px] text-emerald-700">
                      +${marginSavedPerOrder.toFixed(2)} net margin saved per
                      checkout
                    </p>
                  </div>
                </div>
              );
            })()}
          </section>
        </div>
      </div>
    </div>
  );
}
