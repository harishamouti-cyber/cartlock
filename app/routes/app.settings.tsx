import { useEffect, useRef, useState } from "react";
import type { ActionFunctionArgs, LoaderFunctionArgs } from "@remix-run/node";
import { json } from "@remix-run/node";
import { Form, useActionData, useLoaderData, useNavigation } from "@remix-run/react";
import {
  Check,
  CheckCircle2,
  Clock,
  KeyRound,
  Laptop,
  Lock,
  Mail,
  Percent,
  RefreshCw,
  Save,
  ShieldCheck,
  Smartphone,
  Sparkles,
  Tag,
  TrendingUp,
  Wand2,
  Zap,
} from "lucide-react";
import prisma from "../db.server";
import { authenticateAdminOrFallback } from "../shopify.server";
import { ensureShopSettings } from "../services/seed.server";
import {
  computeCartLockSignature,
  sanitizeStoreDisplayName,
} from "../services/cartlock-crypto";
import { syncAutomaticAppDiscount } from "../services/cartlock-discount.server";
import { fetchStoreCatalogProducts } from "../services/catalog.server";

export const loader = async ({ request }: LoaderFunctionArgs) => {
  const { shop, admin } = await authenticateAdminOrFallback(request);
  const settings = await ensureShopSettings(shop);
  const catalogProducts = await fetchStoreCatalogProducts(admin);

  const sanitizedBrandSuggestion = sanitizeStoreDisplayName(
    settings.storeDisplayName || shop,
  );

  return json({
    shop,
    settings: {
      ...settings,
      storeDisplayName: sanitizedBrandSuggestion,
    },
    catalogProducts,
  });
};

export const action = async ({ request }: ActionFunctionArgs) => {
  const { shop, admin } = await authenticateAdminOrFallback(request);
  const existing = await ensureShopSettings(shop);
  const formData = await request.formData();
  const intent = String(formData.get("intent") || "save_settings");

  if (intent === "rotate_salt") {
    const newSalt = `cl_salt_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 10)}`;
    const updated = await prisma.cartLockSettings.update({
      where: { shop },
      data: { secretSalt: newSalt },
    });
    const syncResult = await syncAutomaticAppDiscount(updated, admin);
    return json({
      ok: true,
      intent,
      message:
        "Rotated cryptographic secretSalt and synced new verification key to Shopify Discount Function metafield.",
      syncResult,
    });
  }

  const rawBrandName = String(
    formData.get("storeDisplayName") || existing.storeDisplayName || shop,
  );
  const storeDisplayName = sanitizeStoreDisplayName(rawBrandName);
  const isActive = formData.get("isActive") === "true";
  const discountType =
    formData.get("discountType") === "FIXED_AMOUNT"
      ? "FIXED_AMOUNT"
      : "PERCENTAGE";
  const discountValue = Math.max(
    1,
    parseFloat(String(formData.get("discountValue") || "10")),
  );
  const rawMaxCap = String(formData.get("maxDiscountCap") || "").trim();
  const maxDiscountCap =
    rawMaxCap && parseFloat(rawMaxCap) > 0 ? parseFloat(rawMaxCap) : null;
  const excludeSaleItems = formData.get("excludeSaleItems") === "true";
  const minCartSubtotal = Math.max(
    0,
    parseFloat(String(formData.get("minCartSubtotal") || "50")),
  );
  const enableStretchGoalUpsell =
    formData.get("enableStretchGoalUpsell") === "true";
  const upsellVariantId =
    String(formData.get("upsellVariantId") || "").trim() || null;
  const lockDurationMinutes = Math.max(
    1,
    Math.min(120, parseInt(String(formData.get("lockDurationMinutes") || "15"), 10)),
  );
  const cooldownHours = Math.max(
    1,
    parseInt(String(formData.get("cooldownHours") || "72"), 10),
  );
  const enableDesktopExitIntent =
    formData.get("enableDesktopExitIntent") === "true";
  const enableMobileIdleTrigger =
    formData.get("enableMobileIdleTrigger") === "true";
  const modalHeadline = String(
    formData.get("modalHeadline") || "Reserve Your Cart at {discount} Off",
  );
  const modalBodyText = String(
    formData.get("modalBodyText") ||
      "Your cart of {cart_total} is reserved with a live price lock for {timer}. Complete checkout before your reservation expires.",
  );
  const buttonText = String(
    formData.get("buttonText") || "Claim {discount} Price Lock",
  );
  const accentColor = String(formData.get("accentColor") || "#10b981");

  const updatedSettings = await prisma.cartLockSettings.update({
    where: { shop },
    data: {
      storeDisplayName,
      isActive,
      discountType,
      discountValue,
      maxDiscountCap,
      excludeSaleItems,
      minCartSubtotal,
      enableStretchGoalUpsell,
      upsellVariantId,
      lockDurationMinutes,
      cooldownHours,
      enableDesktopExitIntent,
      enableMobileIdleTrigger,
      modalHeadline,
      modalBodyText,
      buttonText,
      accentColor,
    },
  });

  const syncResult = await syncAutomaticAppDiscount(updatedSettings, admin);

  return json({
    ok: true,
    intent,
    message: `Saved Offer Studio rules and synced native Discount Function (${syncResult.mode}: ${syncResult.automaticDiscountId}).`,
    syncResult,
  });
};

type CopyFieldKey = "modalHeadline" | "modalBodyText" | "buttonText";
type PreviewViewMode = "EXIT_MODAL" | "STRETCH_GOAL" | "STICKY_BAR";
type DeviceBezelMode = "DESKTOP" | "MOBILE";

const ACCENT_PRESETS = [
  { name: "Emerald Vault", hex: "#10b981" },
  { name: "Cyan FinTech", hex: "#06b6d4" },
  { name: "Amber Reserve", hex: "#f59e0b" },
  { name: "Indigo Atelier", hex: "#6366f1" },
  { name: "Rose Sovereign", hex: "#f43f5e" },
];

function formatClock(seconds: number): string {
  const clamped = Math.max(0, Math.floor(seconds));
  const m = Math.floor(clamped / 60);
  const s = clamped % 60;
  return `${String(m).padStart(2, "0")}:${String(s).padStart(2, "0")}`;
}

export default function OfferStudioAndCustomizerRoute() {
  const { shop, settings, catalogProducts } = useLoaderData<typeof loader>();
  const actionData = useActionData<typeof action>();
  const navigation = useNavigation();
  const isSaving = navigation.state !== "idle";

  // Controlled Studio State for Instant Live Customizer Feedback
  const [storeDisplayName, setStoreDisplayName] = useState(
    settings.storeDisplayName,
  );
  const [isActive, setIsActive] = useState(settings.isActive);
  const [discountType, setDiscountType] = useState<"PERCENTAGE" | "FIXED_AMOUNT">(
    settings.discountType === "FIXED_AMOUNT" ? "FIXED_AMOUNT" : "PERCENTAGE",
  );
  const [discountValue, setDiscountValue] = useState(settings.discountValue);
  const [maxDiscountCap, setMaxDiscountCap] = useState<string>(
    settings.maxDiscountCap !== null && settings.maxDiscountCap !== undefined
      ? String(settings.maxDiscountCap)
      : "25",
  );
  const [excludeSaleItems, setExcludeSaleItems] = useState(
    settings.excludeSaleItems,
  );
  const [minCartSubtotal, setMinCartSubtotal] = useState(
    settings.minCartSubtotal,
  );
  const [enableStretchGoalUpsell, setEnableStretchGoalUpsell] = useState(
    settings.enableStretchGoalUpsell,
  );
  const [upsellVariantId, setUpsellVariantId] = useState(
    settings.upsellVariantId ||
      catalogProducts[3]?.primaryVariant.id ||
      catalogProducts[0]?.primaryVariant.id ||
      "",
  );
  const [lockDurationMinutes, setLockDurationMinutes] = useState(
    settings.lockDurationMinutes,
  );
  const [cooldownHours, setCooldownHours] = useState(settings.cooldownHours);
  const [enableDesktopExitIntent, setEnableDesktopExitIntent] = useState(
    settings.enableDesktopExitIntent,
  );
  const [enableMobileIdleTrigger, setEnableMobileIdleTrigger] = useState(
    settings.enableMobileIdleTrigger,
  );
  const [modalHeadline, setModalHeadline] = useState(settings.modalHeadline);
  const [modalBodyText, setModalBodyText] = useState(settings.modalBodyText);
  const [buttonText, setButtonText] = useState(settings.buttonText);
  const [accentColor, setAccentColor] = useState(settings.accentColor);

  // Track which copywriting input was most recently focused for dynamic chip insertion
  const [focusedCopyField, setFocusedCopyField] =
    useState<CopyFieldKey>("modalHeadline");
  const [insertedChipFlash, setInsertedChipFlash] = useState<string | null>(
    null,
  );

  const headlineInputRef = useRef<HTMLInputElement | null>(null);
  const bodyInputRef = useRef<HTMLTextAreaElement | null>(null);
  const buttonInputRef = useRef<HTMLInputElement | null>(null);

  // Sticky Right-Column Live Preview State
  const [previewView, setPreviewView] =
    useState<PreviewViewMode>("EXIT_MODAL");
  const [deviceBezel, setDeviceBezel] = useState<DeviceBezelMode>("DESKTOP");
  const [selectedProductIdx, setSelectedProductIdx] = useState(0);
  const [previewRemainingSecs, setPreviewRemainingSecs] = useState(
    settings.lockDurationMinutes * 60,
  );
  const [showEmailDrawer, setShowEmailDrawer] = useState(false);
  const [previewEmailInput, setPreviewEmailInput] = useState(
    "claire.dubois@maison-nord.fr",
  );
  const [generatedPermalink, setGeneratedPermalink] = useState<string | null>(
    null,
  );
  const [stretchUpsellAdded, setStretchUpsellAdded] = useState(false);

  // Sync countdown timer when lockDurationMinutes changes
  useEffect(() => {
    setPreviewRemainingSecs(lockDurationMinutes * 60);
  }, [lockDurationMinutes]);

  // Live ticking countdown inside the Studio Preview
  useEffect(() => {
    const timer = setInterval(() => {
      setPreviewRemainingSecs((prev) =>
        prev > 1 ? prev - 1 : lockDurationMinutes * 60,
      );
    }, 1000);
    return () => clearInterval(timer);
  }, [lockDurationMinutes]);

  const activeCatalogItem =
    catalogProducts[selectedProductIdx] || catalogProducts[0];
  const upsellCatalogItem =
    catalogProducts.find((p) =>
      p.variants.some((v) => v.id === upsellVariantId),
    ) ||
    catalogProducts[3] ||
    catalogProducts[0];

  // Dynamic Variable Chip Insertion Handler (`+ Discount Value`, `+ Timer Duration`, `+ Cart Total`)
  const handleInsertVariableChip = (token: "{discount}" | "{timer}" | "{cart_total}") => {
    setInsertedChipFlash(token);
    setTimeout(() => setInsertedChipFlash(null), 700);

    if (focusedCopyField === "modalHeadline") {
      const el = headlineInputRef.current;
      const start = el?.selectionStart ?? modalHeadline.length;
      const end = el?.selectionEnd ?? modalHeadline.length;
      const next =
        modalHeadline.slice(0, start) + token + modalHeadline.slice(end);
      setModalHeadline(next);
      requestAnimationFrame(() => {
        el?.focus();
        el?.setSelectionRange(start + token.length, start + token.length);
      });
    } else if (focusedCopyField === "modalBodyText") {
      const el = bodyInputRef.current;
      const start = el?.selectionStart ?? modalBodyText.length;
      const end = el?.selectionEnd ?? modalBodyText.length;
      const next =
        modalBodyText.slice(0, start) + token + modalBodyText.slice(end);
      setModalBodyText(next);
      requestAnimationFrame(() => {
        el?.focus();
        el?.setSelectionRange(start + token.length, start + token.length);
      });
    } else {
      const el = buttonInputRef.current;
      const start = el?.selectionStart ?? buttonText.length;
      const end = el?.selectionEnd ?? buttonText.length;
      const next = buttonText.slice(0, start) + token + buttonText.slice(end);
      setButtonText(next);
      requestAnimationFrame(() => {
        el?.focus();
        el?.setSelectionRange(start + token.length, start + token.length);
      });
    }
  };

  // Compute live preview numbers
  const basePreviewCartSubtotal =
    previewView === "STRETCH_GOAL" && !stretchUpsellAdded
      ? Math.max(12, Number((minCartSubtotal - 12).toFixed(2)))
      : activeCatalogItem.primaryVariant.price;

  const stretchShortfall = Math.max(
    0,
    Number((minCartSubtotal - basePreviewCartSubtotal).toFixed(2)),
  );
  const stretchProgressPct =
    minCartSubtotal > 0
      ? Math.min(100, Math.round((basePreviewCartSubtotal / minCartSubtotal) * 100))
      : 100;

  const isPreviewItemExcludedByMarginShield =
    excludeSaleItems && activeCatalogItem.isOnSale;

  const rawSavings = isPreviewItemExcludedByMarginShield
    ? 0
    : discountType === "PERCENTAGE"
      ? Number(((basePreviewCartSubtotal * discountValue) / 100).toFixed(2))
      : Number(discountValue.toFixed(2));

  const parsedCap = parseFloat(maxDiscountCap || "0");
  const isPreviewCapped =
    !isPreviewItemExcludedByMarginShield &&
    parsedCap > 0 &&
    rawSavings > parsedCap;
  const effectiveSavings = isPreviewCapped ? parsedCap : rawSavings;
  const finalLockedPrice = Math.max(
    0,
    Number((basePreviewCartSubtotal - effectiveSavings).toFixed(2)),
  );

  const discountBadgeText =
    discountType === "PERCENTAGE"
      ? `${discountValue}%`
      : `$${discountValue.toFixed(2)}`;

  const interpolateCopy = (template: string) => {
    return template
      .replace(/\{discount\}/g, discountBadgeText)
      .replace(/\{timer\}/g, formatClock(previewRemainingSecs))
      .replace(/\{cart_total\}/g, `$${basePreviewCartSubtotal.toFixed(2)}`);
  };

  const handleGeneratePermalinkPreview = () => {
    const expiresIso = new Date(
      Date.now() + lockDurationMinutes * 60 * 1000,
    ).toISOString();
    const sig = computeCartLockSignature(expiresIso, settings.secretSalt);
    const variantNumeric =
      activeCatalogItem.primaryVariant.id.replace(/\D/g, "") || "44901283900";
    setGeneratedPermalink(
      `https://${shop}/cart/${variantNumeric}:1?attributes[_cartlock_expires_at]=${encodeURIComponent(expiresIso)}&attributes[_cartlock_signature]=${encodeURIComponent(sig)}`,
    );
  };

  return (
    <div className="space-y-6 pb-14">
      {/* Studio Page Header */}
      <div className="flex flex-col justify-between gap-4 sm:flex-row sm:items-center">
        <div>
          <h1 className="text-xl font-bold tracking-tight text-slate-900">
            Offer Studio & Live Customizer
          </h1>
          <p className="mt-0.5 text-xs text-slate-500">
            Configure automatic Discount Function rules, Margin Shield clearance
            protection, and live storefront micro-interactions.
          </p>
        </div>

        <div className="flex items-center gap-2">
          <span className="inline-flex items-center gap-1.5 rounded-xl border border-slate-200 bg-white px-3 py-1.5 text-xs font-medium text-slate-700 shadow-2xs">
            <ShieldCheck
              className="h-3.5 w-3.5 text-emerald-600"
              strokeWidth={1.75}
            />
            Function ID:{" "}
            <code className="font-mono text-[11px] font-semibold text-slate-900">
              {settings.automaticDiscountId?.split("/").pop() || "994810293847"}
            </code>
          </span>
        </div>
      </div>

      {/* Action Confirmation Toast */}
      {actionData?.message && (
        <div
          role="status"
          className="flex items-center justify-between gap-3 rounded-xl border border-emerald-500/30 bg-emerald-50 px-4 py-3 text-xs font-medium text-emerald-950 shadow-2xs"
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

      {/* Two-Column Split Layout: Left Configuration Cards + Right Sticky Live Customizer */}
      <div className="grid grid-cols-1 items-start gap-6 lg:grid-cols-12">
        {/* LEFT COLUMN: Structured Offer Rules, Margin Shield, Trigger & Copywriting Cards */}
        <Form method="post" className="space-y-6 lg:col-span-7">
          <input type="hidden" name="intent" value="save_settings" />
          <input type="hidden" name="isActive" value={String(isActive)} />
          <input type="hidden" name="discountType" value={discountType} />
          <input
            type="hidden"
            name="excludeSaleItems"
            value={String(excludeSaleItems)}
          />
          <input
            type="hidden"
            name="enableStretchGoalUpsell"
            value={String(enableStretchGoalUpsell)}
          />
          <input
            type="hidden"
            name="enableDesktopExitIntent"
            value={String(enableDesktopExitIntent)}
          />
          <input
            type="hidden"
            name="enableMobileIdleTrigger"
            value={String(enableMobileIdleTrigger)}
          />

          {/* CARD 1: Discount & Margin Shield Rules */}
          <section className="cl-bento-card p-5 sm:p-6">
            <div className="flex items-start justify-between gap-4 border-b border-slate-100 pb-4">
              <div className="flex items-center gap-2.5">
                <div className="flex h-9 w-9 items-center justify-center rounded-xl border border-emerald-500/25 bg-emerald-50 text-emerald-700">
                  <Percent className="h-4 w-4" strokeWidth={1.75} />
                </div>
                <div>
                  <h2 className="text-sm font-bold text-slate-900">
                    Discount & Margin Shield Rules
                  </h2>
                  <p className="text-xs text-slate-500">
                    Synced directly to the{" "}
                    <code className="font-mono text-[11px] text-slate-700">
                      $app:cartlock
                    </code>{" "}
                    Function metafield with zero promo code stacking.
                  </p>
                </div>
              </div>

              {/* Campaign Active Switch */}
              <button
                type="button"
                role="switch"
                aria-checked={isActive}
                onClick={() => setIsActive((v) => !v)}
                className={`inline-flex min-h-[32px] items-center gap-2 rounded-full border px-3 py-1 text-xs font-semibold transition ${
                  isActive
                    ? "border-emerald-500/30 bg-emerald-50 text-emerald-800"
                    : "border-slate-200 bg-slate-100 text-slate-600"
                }`}
              >
                <span
                  className={`h-2 w-2 rounded-full ${
                    isActive ? "bg-emerald-500" : "bg-slate-400"
                  }`}
                />
                {isActive ? "Engine Active" : "Paused"}
              </button>
            </div>

            <div className="mt-5 space-y-5">
              {/* Discount Type Segmented Control */}
              <div>
                <label className="block text-xs font-semibold text-slate-700">
                  Reservation Discount Structure
                </label>
                <div className="cl-segmented-track mt-1.5 grid grid-cols-2 gap-1">
                  <button
                    type="button"
                    onClick={() => setDiscountType("PERCENTAGE")}
                    className={`cl-segmented-pill min-h-[38px] rounded-lg px-3 py-1.5 text-xs font-semibold ${
                      discountType === "PERCENTAGE"
                        ? "cl-segmented-pill-active text-slate-900"
                        : "text-slate-600 hover:text-slate-900"
                    }`}
                  >
                    Percentage Drop (%)
                  </button>
                  <button
                    type="button"
                    onClick={() => setDiscountType("FIXED_AMOUNT")}
                    className={`cl-segmented-pill min-h-[38px] rounded-lg px-3 py-1.5 text-xs font-semibold ${
                      discountType === "FIXED_AMOUNT"
                        ? "cl-segmented-pill-active text-slate-900"
                        : "text-slate-600 hover:text-slate-900"
                    }`}
                  >
                    Fixed Dollar Drop ($)
                  </button>
                </div>
              </div>

              {/* Discount Value + Max Dollar Cap + Minimum Cart Subtotal */}
              <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
                <div>
                  <label
                    htmlFor="discountValue"
                    className="block text-xs font-semibold text-slate-700"
                  >
                    Discount Value ({discountType === "PERCENTAGE" ? "%" : "$"})
                  </label>
                  <input
                    id="discountValue"
                    name="discountValue"
                    type="number"
                    step="0.5"
                    min="1"
                    max={discountType === "PERCENTAGE" ? "90" : "500"}
                    value={discountValue}
                    onChange={(e) =>
                      setDiscountValue(parseFloat(e.target.value || "0"))
                    }
                    className="tabular-numerals mt-1.5 min-h-[40px] w-full rounded-xl border border-slate-200 bg-white px-3 text-sm font-semibold text-slate-900 focus:border-emerald-600"
                  />
                </div>

                <div>
                  <label
                    htmlFor="maxDiscountCap"
                    className="block text-xs font-semibold text-slate-700"
                  >
                    Max Discount Cap ($)
                  </label>
                  <input
                    id="maxDiscountCap"
                    name="maxDiscountCap"
                    type="number"
                    step="1"
                    min="0"
                    value={maxDiscountCap}
                    onChange={(e) => setMaxDiscountCap(e.target.value)}
                    placeholder="25.00"
                    className="tabular-numerals mt-1.5 min-h-[40px] w-full rounded-xl border border-slate-200 bg-white px-3 text-sm font-semibold text-slate-900 focus:border-emerald-600"
                  />
                  <p className="mt-1 text-[11px] text-slate-500">
                    Caps percentage drops on high-value carts
                  </p>
                </div>

                <div>
                  <label
                    htmlFor="minCartSubtotal"
                    className="block text-xs font-semibold text-slate-700"
                  >
                    Min Cart Subtotal ($)
                  </label>
                  <input
                    id="minCartSubtotal"
                    name="minCartSubtotal"
                    type="number"
                    step="1"
                    min="0"
                    value={minCartSubtotal}
                    onChange={(e) =>
                      setMinCartSubtotal(parseFloat(e.target.value || "0"))
                    }
                    className="tabular-numerals mt-1.5 min-h-[40px] w-full rounded-xl border border-slate-200 bg-white px-3 text-sm font-semibold text-slate-900 focus:border-emerald-600"
                  />
                  <p className="mt-1 text-[11px] text-slate-500">
                    Triggers Stretch Goal below threshold
                  </p>
                </div>
              </div>

              {/* Margin Shield: Exclude Sale / Clearance Items */}
              <div className="flex items-start justify-between gap-4 rounded-xl border border-slate-200/90 bg-slate-50/70 p-4">
                <div className="space-y-0.5">
                  <div className="flex items-center gap-2">
                    <span className="text-xs font-bold text-slate-900">
                      Margin Shield: Exclude Clearance & Sale Line Items
                    </span>
                    <span className="rounded-md border border-emerald-500/30 bg-emerald-50 px-1.5 py-0.5 text-[10px] font-bold text-emerald-800">
                      Recommended
                    </span>
                  </div>
                  <p className="text-xs text-slate-500">
                    Automatically skips any cart line item where{" "}
                    <code className="font-mono text-[11px] text-slate-700">
                      compareAtAmountPerQuantity &gt; amountPerQuantity
                    </code>{" "}
                    and enforces{" "}
                    <code className="font-mono text-[11px] text-slate-700">
                      combinesWith: false
                    </code>
                    .
                  </p>
                </div>
                <button
                  type="button"
                  role="switch"
                  aria-checked={excludeSaleItems}
                  aria-label="Toggle Margin Shield clearance item exclusion"
                  onClick={() => setExcludeSaleItems((v) => !v)}
                  className={`relative inline-flex h-6 w-11 shrink-0 cursor-pointer rounded-full border-2 border-transparent transition-colors ${
                    excludeSaleItems ? "bg-emerald-600" : "bg-slate-300"
                  }`}
                >
                  <span
                    className={`inline-block h-5 w-5 transform rounded-full bg-white shadow transition ${
                      excludeSaleItems ? "translate-x-5" : "translate-x-0"
                    }`}
                  />
                </button>
              </div>

              {/* Stretch Goal AOV Booster Configuration */}
              <div className="space-y-3 rounded-xl border border-slate-200/90 bg-slate-50/70 p-4">
                <div className="flex items-start justify-between gap-4">
                  <div>
                    <div className="flex items-center gap-2">
                      <TrendingUp
                        className="h-3.5 w-3.5 text-amber-600"
                        strokeWidth={2}
                      />
                      <span className="text-xs font-bold text-slate-900">
                        Dynamic &ldquo;Stretch Goal&rdquo; 1-Click AOV Booster
                      </span>
                    </div>
                    <p className="mt-0.5 text-xs text-slate-500">
                      When a shopper&apos;s cart is above $0 but below $
                      {minCartSubtotal.toFixed(2)}, render an interactive
                      progress bar and 1-click recommended item upsell.
                    </p>
                  </div>
                  <button
                    type="button"
                    role="switch"
                    aria-checked={enableStretchGoalUpsell}
                    aria-label="Toggle Stretch Goal AOV upsell"
                    onClick={() => setEnableStretchGoalUpsell((v) => !v)}
                    className={`relative inline-flex h-6 w-11 shrink-0 cursor-pointer rounded-full border-2 border-transparent transition-colors ${
                      enableStretchGoalUpsell ? "bg-emerald-600" : "bg-slate-300"
                    }`}
                  >
                    <span
                      className={`inline-block h-5 w-5 transform rounded-full bg-white shadow transition ${
                        enableStretchGoalUpsell
                          ? "translate-x-5"
                          : "translate-x-0"
                      }`}
                    />
                  </button>
                </div>

                {enableStretchGoalUpsell && (
                  <div className="pt-2">
                    <label
                      htmlFor="upsellVariantId"
                      className="block text-xs font-semibold text-slate-700"
                    >
                      Recommended 1-Click Upsell Variant
                    </label>
                    <select
                      id="upsellVariantId"
                      name="upsellVariantId"
                      value={upsellVariantId}
                      onChange={(e) => setUpsellVariantId(e.target.value)}
                      className="mt-1.5 min-h-[40px] w-full rounded-xl border border-slate-200 bg-white px-3 text-xs font-semibold text-slate-900"
                    >
                      {catalogProducts.map((prod) =>
                        prod.variants.map((variant) => (
                          <option key={variant.id} value={variant.id}>
                            {prod.title} ({variant.title}) - $
                            {variant.price.toFixed(2)}
                          </option>
                        )),
                      )}
                    </select>
                  </div>
                )}
              </div>
            </div>
          </section>

          {/* CARD 2: Trigger & Cooldown Behavior */}
          <section className="cl-bento-card p-5 sm:p-6">
            <div className="flex items-center gap-2.5 border-b border-slate-100 pb-4">
              <div className="flex h-9 w-9 items-center justify-center rounded-xl border border-slate-200 bg-slate-50 text-slate-800">
                <Clock className="h-4 w-4" strokeWidth={1.75} />
              </div>
              <div>
                <h2 className="text-sm font-bold text-slate-900">
                  Trigger & Cooldown Behavior
                </h2>
                <p className="text-xs text-slate-500">
                  Control reservation duration, browser cooldown persistence,
                  and abandonment signal listeners.
                </p>
              </div>
            </div>

            <div className="mt-5 space-y-5">
              <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
                <div>
                  <label
                    htmlFor="lockDurationMinutes"
                    className="block text-xs font-semibold text-slate-700"
                  >
                    Reservation Lock Duration (Minutes)
                  </label>
                  <input
                    id="lockDurationMinutes"
                    name="lockDurationMinutes"
                    type="number"
                    min="1"
                    max="120"
                    value={lockDurationMinutes}
                    onChange={(e) =>
                      setLockDurationMinutes(
                        Math.max(1, parseInt(e.target.value || "15", 10)),
                      )
                    }
                    className="tabular-numerals mt-1.5 min-h-[40px] w-full rounded-xl border border-slate-200 bg-white px-3 text-sm font-semibold text-slate-900"
                  />
                  <p className="mt-1 text-[11px] text-slate-500">
                    Price reverts automatically at checkout when 00:00 is reached
                  </p>
                </div>

                <div>
                  <label
                    htmlFor="cooldownHours"
                    className="block text-xs font-semibold text-slate-700"
                  >
                    Shopper Cooldown Window (Hours)
                  </label>
                  <input
                    id="cooldownHours"
                    name="cooldownHours"
                    type="number"
                    min="1"
                    max="720"
                    value={cooldownHours}
                    onChange={(e) =>
                      setCooldownHours(
                        Math.max(1, parseInt(e.target.value || "72", 10)),
                      )
                    }
                    className="tabular-numerals mt-1.5 min-h-[40px] w-full rounded-xl border border-slate-200 bg-white px-3 text-sm font-semibold text-slate-900"
                  />
                  <p className="mt-1 text-[11px] text-slate-500">
                    Enforced in localStorage so shoppers are never spammed
                  </p>
                </div>
              </div>

              <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
                <div className="flex items-center justify-between gap-3 rounded-xl border border-slate-200/90 bg-slate-50/70 p-3.5">
                  <div>
                    <span className="block text-xs font-bold text-slate-900">
                      Desktop Exit-Intent Trigger
                    </span>
                    <span className="text-[11px] text-slate-500">
                      Cursor velocity toward top browser tab bar
                    </span>
                  </div>
                  <button
                    type="button"
                    role="switch"
                    aria-checked={enableDesktopExitIntent}
                    aria-label="Toggle Desktop Exit-Intent Trigger"
                    onClick={() => setEnableDesktopExitIntent((v) => !v)}
                    className={`relative inline-flex h-6 w-11 shrink-0 cursor-pointer rounded-full border-2 border-transparent transition-colors ${
                      enableDesktopExitIntent
                        ? "bg-emerald-600"
                        : "bg-slate-300"
                    }`}
                  >
                    <span
                      className={`inline-block h-5 w-5 transform rounded-full bg-white shadow transition ${
                        enableDesktopExitIntent
                          ? "translate-x-5"
                          : "translate-x-0"
                      }`}
                    />
                  </button>
                </div>

                <div className="flex items-center justify-between gap-3 rounded-xl border border-slate-200/90 bg-slate-50/70 p-3.5">
                  <div>
                    <span className="block text-xs font-bold text-slate-900">
                      Mobile Abandonment Signal
                    </span>
                    <span className="text-[11px] text-slate-500">
                      Rapid upward scroll & tab visibility switch
                    </span>
                  </div>
                  <button
                    type="button"
                    role="switch"
                    aria-checked={enableMobileIdleTrigger}
                    aria-label="Toggle Mobile Abandonment Signal"
                    onClick={() => setEnableMobileIdleTrigger((v) => !v)}
                    className={`relative inline-flex h-6 w-11 shrink-0 cursor-pointer rounded-full border-2 border-transparent transition-colors ${
                      enableMobileIdleTrigger
                        ? "bg-emerald-600"
                        : "bg-slate-300"
                    }`}
                  >
                    <span
                      className={`inline-block h-5 w-5 transform rounded-full bg-white shadow transition ${
                        enableMobileIdleTrigger
                          ? "translate-x-5"
                          : "translate-x-0"
                      }`}
                    />
                  </button>
                </div>
              </div>

              {/* Cryptographic Secret Salt Status */}
              <div className="flex flex-wrap items-center justify-between gap-3 rounded-xl border border-slate-200 bg-white p-3.5">
                <div className="flex items-center gap-2.5">
                  <KeyRound
                    className="h-4 w-4 text-emerald-600"
                    strokeWidth={1.75}
                  />
                  <div>
                    <span className="block text-xs font-bold text-slate-900">
                      Cryptographic Cart Signing Key (secretSalt)
                    </span>
                    <code className="font-mono text-[11px] text-slate-500">
                      {settings.secretSalt}
                    </code>
                  </div>
                </div>
                <span className="rounded-lg bg-emerald-50 px-2.5 py-1 text-[11px] font-semibold text-emerald-800">
                  Anti-Inspect-Element Active
                </span>
              </div>
            </div>
          </section>

          {/* CARD 3: Modal Copywriting & Dynamic Variable Chips */}
          <section className="cl-bento-card p-5 sm:p-6">
            <div className="flex items-center justify-between gap-4 border-b border-slate-100 pb-4">
              <div className="flex items-center gap-2.5">
                <div className="flex h-9 w-9 items-center justify-center rounded-xl border border-slate-200 bg-slate-50 text-slate-800">
                  <Wand2 className="h-4 w-4" strokeWidth={1.75} />
                </div>
                <div>
                  <h2 className="text-sm font-bold text-slate-900">
                    Modal Copywriting & Brand Identity
                  </h2>
                  <p className="text-xs text-slate-500">
                    Click any dynamic variable chip below to insert into the
                    focused copy field (
                    <span className="font-semibold text-slate-800">
                      {focusedCopyField}
                    </span>
                    ).
                  </p>
                </div>
              </div>
            </div>

            <div className="mt-5 space-y-4">
              {/* Brand Name with Auto-Sanitization */}
              <div>
                <div className="flex items-center justify-between">
                  <label
                    htmlFor="storeDisplayName"
                    className="block text-xs font-semibold text-slate-700"
                  >
                    Store Brand Display Name (Auto-Sanitized)
                  </label>
                  <button
                    type="button"
                    onClick={() =>
                      setStoreDisplayName(sanitizeStoreDisplayName(shop))
                    }
                    className="text-[11px] font-semibold text-emerald-700 hover:underline"
                  >
                    Sanitize from {shop}
                  </button>
                </div>
                <input
                  id="storeDisplayName"
                  name="storeDisplayName"
                  type="text"
                  value={storeDisplayName}
                  onChange={(e) => setStoreDisplayName(e.target.value)}
                  className="mt-1.5 min-h-[40px] w-full rounded-xl border border-slate-200 bg-white px-3 text-sm font-semibold text-slate-900"
                />
              </div>

              {/* Clickable Dynamic Variable Chips */}
              <div className="rounded-xl border border-slate-200/90 bg-slate-50/90 p-3">
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <span className="text-[11px] font-semibold text-slate-600">
                    Insert Dynamic Variable into{" "}
                    <span className="rounded bg-white px-1.5 py-0.5 font-mono text-slate-900 shadow-2xs">
                      {focusedCopyField}
                    </span>
                    :
                  </span>
                  <div className="flex flex-wrap items-center gap-1.5">
                    {(
                      [
                        {
                          label: "+ Discount Value",
                          token: "{discount}" as const,
                        },
                        {
                          label: "+ Timer Duration",
                          token: "{timer}" as const,
                        },
                        {
                          label: "+ Cart Total",
                          token: "{cart_total}" as const,
                        },
                      ]
                    ).map((chip) => (
                      <button
                        key={chip.token}
                        type="button"
                        onClick={() => handleInsertVariableChip(chip.token)}
                        className={`inline-flex min-h-[30px] items-center gap-1 rounded-lg border px-2.5 py-1 text-xs font-semibold transition ${
                          insertedChipFlash === chip.token
                            ? "border-emerald-600 bg-emerald-600 text-white scale-95"
                            : "border-slate-200/90 bg-white text-slate-800 shadow-2xs hover:border-emerald-500/40 hover:bg-emerald-50/50"
                        }`}
                      >
                        <span>{chip.label}</span>
                        <code className="font-mono text-[10px] opacity-75">
                          {chip.token}
                        </code>
                      </button>
                    ))}
                  </div>
                </div>
              </div>

              {/* Headline Input */}
              <div>
                <label
                  htmlFor="modalHeadline"
                  className="block text-xs font-semibold text-slate-700"
                >
                  Modal Headline
                </label>
                <input
                  ref={headlineInputRef}
                  id="modalHeadline"
                  name="modalHeadline"
                  type="text"
                  value={modalHeadline}
                  onFocus={() => setFocusedCopyField("modalHeadline")}
                  onChange={(e) => setModalHeadline(e.target.value)}
                  className="mt-1.5 min-h-[40px] w-full rounded-xl border border-slate-200 bg-white px-3 text-sm font-semibold text-slate-900"
                />
              </div>

              {/* Body Text Input */}
              <div>
                <label
                  htmlFor="modalBodyText"
                  className="block text-xs font-semibold text-slate-700"
                >
                  Reservation Body Copy
                </label>
                <textarea
                  ref={bodyInputRef}
                  id="modalBodyText"
                  name="modalBodyText"
                  rows={3}
                  value={modalBodyText}
                  onFocus={() => setFocusedCopyField("modalBodyText")}
                  onChange={(e) => setModalBodyText(e.target.value)}
                  className="mt-1.5 w-full rounded-xl border border-slate-200 bg-white p-3 text-xs leading-relaxed text-slate-900"
                />
              </div>

              {/* Primary CTA Button Copy + Brand Accent Color */}
              <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
                <div>
                  <label
                    htmlFor="buttonText"
                    className="block text-xs font-semibold text-slate-700"
                  >
                    Primary Action Button Text
                  </label>
                  <input
                    ref={buttonInputRef}
                    id="buttonText"
                    name="buttonText"
                    type="text"
                    value={buttonText}
                    onFocus={() => setFocusedCopyField("buttonText")}
                    onChange={(e) => setButtonText(e.target.value)}
                    className="mt-1.5 min-h-[40px] w-full rounded-xl border border-slate-200 bg-white px-3 text-sm font-semibold text-slate-900"
                  />
                </div>

                <div>
                  <label
                    htmlFor="accentColor"
                    className="block text-xs font-semibold text-slate-700"
                  >
                    Widget Primary Accent Color
                  </label>
                  <div className="mt-1.5 flex items-center gap-2">
                    <input
                      id="accentColor"
                      name="accentColor"
                      type="color"
                      value={accentColor}
                      onChange={(e) => setAccentColor(e.target.value)}
                      className="h-10 w-12 cursor-pointer rounded-xl border border-slate-200 bg-white p-1"
                    />
                    <div className="flex flex-wrap items-center gap-1.5">
                      {ACCENT_PRESETS.map((swatch) => (
                        <button
                          key={swatch.hex}
                          type="button"
                          onClick={() => setAccentColor(swatch.hex)}
                          title={swatch.name}
                          aria-label={`Select ${swatch.name} accent color`}
                          className={`h-7 w-7 rounded-lg border transition ${
                            accentColor.toLowerCase() ===
                            swatch.hex.toLowerCase()
                              ? "scale-110 border-slate-900 ring-2 ring-slate-900/20"
                              : "border-slate-200 opacity-80 hover:opacity-100"
                          }`}
                          style={{ backgroundColor: swatch.hex }}
                        />
                      ))}
                    </div>
                  </div>
                </div>
              </div>
            </div>
          </section>

          {/* Sticky Save & Sync Action Bar */}
          <div className="cl-bento-card flex flex-wrap items-center justify-between gap-4 px-5 py-4">
            <div className="flex items-center gap-2 text-xs text-slate-600">
              <Zap className="h-4 w-4 text-emerald-600" strokeWidth={1.75} />
              <span>
                Saving runs{" "}
                <code className="font-mono text-[11px] font-semibold text-slate-800">
                  discountAutomaticAppUpdate
                </code>{" "}
                and updates the Function metafield automatically.
              </span>
            </div>

            <button
              type="submit"
              disabled={isSaving}
              className="cl-btn-shimmer inline-flex min-h-[42px] items-center gap-2 rounded-xl bg-slate-900 px-5 py-2.5 text-xs font-bold text-white shadow-sm hover:bg-slate-800"
            >
              <Save className="h-4 w-4 text-emerald-400" strokeWidth={2} />
              <span>
                {isSaving
                  ? "Syncing Discount Function..."
                  : "Save & Sync Discount Function"}
              </span>
            </button>
          </div>
        </Form>

        {/* RIGHT COLUMN: Sticky Live Preview Container (sticky top-4) */}
        <aside
          aria-label="Live Storefront Reservation Preview"
          className="sticky top-4 space-y-4 lg:col-span-5"
        >
          <div className="cl-bento-card overflow-hidden p-4 sm:p-5">
            {/* Preview Studio Header & Device Switcher */}
            <div className="flex flex-wrap items-center justify-between gap-3 border-b border-slate-100 pb-3.5">
              <div>
                <div className="flex items-center gap-2">
                  <span className="h-2 w-2 rounded-full bg-emerald-500 shadow-[0_0_8px_#10b981]" />
                  <h2 className="text-xs font-bold tracking-tight text-slate-900">
                    Live Storefront Studio Preview
                  </h2>
                </div>
                <p className="text-[11px] text-slate-500">
                  Real catalog media ({activeCatalogItem.imageSource},{" "}
                  <code className="font-mono">width=300</code>)
                </p>
              </div>

              {/* Desktop / Mobile Device Bezel Segmented Toggle */}
              <div
                role="group"
                aria-label="Device bezel preview mode"
                className="cl-segmented-track flex items-center gap-1"
              >
                <button
                  type="button"
                  onClick={() => setDeviceBezel("DESKTOP")}
                  className={`cl-segmented-pill inline-flex min-h-[30px] items-center gap-1.5 rounded-lg px-2.5 py-1 text-[11px] font-semibold ${
                    deviceBezel === "DESKTOP"
                      ? "cl-segmented-pill-active text-slate-900"
                      : "text-slate-600"
                  }`}
                >
                  <Laptop className="h-3.5 w-3.5" strokeWidth={1.75} />
                  Desktop
                </button>
                <button
                  type="button"
                  onClick={() => setDeviceBezel("MOBILE")}
                  className={`cl-segmented-pill inline-flex min-h-[30px] items-center gap-1.5 rounded-lg px-2.5 py-1 text-[11px] font-semibold ${
                    deviceBezel === "MOBILE"
                      ? "cl-segmented-pill-active text-slate-900"
                      : "text-slate-600"
                  }`}
                >
                  <Smartphone className="h-3.5 w-3.5" strokeWidth={1.75} />
                  Mobile
                </button>
              </div>
            </div>

            {/* Segmented Toggles for View States: Exit Modal View, Stretch Goal Upsell View, Sticky Bar View */}
            <div
              role="group"
              aria-label="Storefront widget state switcher"
              className="cl-segmented-track mt-3 grid grid-cols-3 gap-1"
            >
              {(
                [
                  { id: "EXIT_MODAL", label: "Exit Modal View" },
                  { id: "STRETCH_GOAL", label: "Stretch Goal Upsell View" },
                  { id: "STICKY_BAR", label: "Sticky Bar View" },
                ] as const
              ).map((mode) => (
                <button
                  key={mode.id}
                  type="button"
                  onClick={() => {
                    setPreviewView(mode.id);
                    if (mode.id !== "STRETCH_GOAL") {
                      setStretchUpsellAdded(false);
                    }
                  }}
                  className={`cl-segmented-pill min-h-[32px] rounded-lg px-2 py-1 text-center text-[11px] font-semibold ${
                    previewView === mode.id
                      ? "cl-segmented-pill-active text-slate-900"
                      : "text-slate-600 hover:text-slate-900"
                  }`}
                >
                  {mode.label}
                </button>
              ))}
            </div>

            {/* Catalog Product Switcher Pill Bar */}
            <div className="mt-3 flex items-center justify-between gap-2 rounded-xl border border-slate-200/80 bg-slate-50/80 px-3 py-2">
              <span className="text-[11px] font-semibold text-slate-600">
                Catalog Item:
              </span>
              <select
                aria-label="Select catalog product to preview"
                value={selectedProductIdx}
                onChange={(e) => {
                  setSelectedProductIdx(Number(e.target.value));
                  setGeneratedPermalink(null);
                }}
                className="min-h-[28px] max-w-[240px] truncate rounded-lg border border-slate-200 bg-white px-2 py-1 text-[11px] font-semibold text-slate-900"
              >
                {catalogProducts.map((item, idx) => (
                  <option key={item.id} value={idx}>
                    {item.title} (${item.primaryVariant.price.toFixed(2)}
                    {item.isOnSale ? " - Clearance Sale" : ""})
                  </option>
                ))}
              </select>
            </div>

            {/* Spring-Animated Device Bezel Viewport */}
            <div className="mt-4 flex justify-center bg-slate-900/[0.03] p-3 rounded-2xl border border-slate-200/70">
              <div
                style={{
                  transition:
                    "max-width 420ms cubic-bezier(0.22, 1, 0.36, 1), padding 420ms cubic-bezier(0.22, 1, 0.36, 1)",
                }}
                className={`relative w-full overflow-hidden rounded-[24px] border-4 border-slate-900 bg-gradient-to-b from-slate-900 via-[#0B111E] to-[#090D16] shadow-vault ${
                  deviceBezel === "MOBILE" ? "max-w-[332px]" : "max-w-full"
                }`}
              >
                {/* Simulated Storefront Browser Bar */}
                <div className="flex items-center justify-between border-b border-white/10 bg-slate-950/80 px-3.5 py-2 text-[11px] text-slate-400">
                  <div className="flex items-center gap-1.5">
                    <span className="h-2 w-2 rounded-full bg-rose-500/70" />
                    <span className="h-2 w-2 rounded-full bg-amber-400/70" />
                    <span className="h-2 w-2 rounded-full bg-emerald-500/70" />
                  </div>
                  <span className="font-mono text-[10px] text-slate-300">
                    {storeDisplayName} Storefront
                  </span>
                  <span className="font-mono text-[10px] text-emerald-400">
                    /cart.js (1)
                  </span>
                </div>

                {/* Viewport Content */}
                <div className="relative p-4 sm:p-5">
                  {previewView === "STICKY_BAR" ? (
                    <div className="space-y-5 py-6">
                      {/* Simulated Storefront Page Behind Sticky Bar */}
                      <div className="rounded-xl border border-white/10 bg-white/[0.03] p-4 text-center">
                        <p className="text-xs font-semibold text-slate-300">
                          Shopper Continues Browsing{" "}
                          <span className="text-white">{storeDisplayName}</span>
                        </p>
                        <p className="mt-1 text-[11px] text-slate-400">
                          Cart attributes{" "}
                          <code className="font-mono text-emerald-300">
                            _cartlock_expires_at
                          </code>{" "}
                          and{" "}
                          <code className="font-mono text-emerald-300">
                            _cartlock_signature
                          </code>{" "}
                          are signed in{" "}
                          <code className="font-mono text-emerald-300">
                            /cart/update.js
                          </code>
                          .
                        </p>
                      </div>

                      {/* Floating Bottom Glassmorphic Reservation Pill Bar */}
                      <div className="flex flex-wrap items-center justify-between gap-2.5 rounded-full border border-white/15 bg-slate-950/90 px-4 py-2.5 shadow-2xl backdrop-blur-xl">
                        <div className="flex items-center gap-2">
                          <span
                            className="h-2.5 w-2.5 rounded-full animate-pulse"
                            style={{
                              backgroundColor: accentColor,
                              boxShadow: `0 0 10px ${accentColor}`,
                            }}
                          />
                          <div className="text-xs text-white">
                            <span className="font-semibold">
                              Price Lock Active:
                            </span>{" "}
                            <span className="tabular-numerals font-mono font-bold text-emerald-300">
                              {formatClock(previewRemainingSecs)}
                            </span>
                          </div>
                        </div>

                        <button
                          type="button"
                          onClick={() => setPreviewView("EXIT_MODAL")}
                          style={{ backgroundColor: accentColor }}
                          className="rounded-full px-3.5 py-1.5 text-[11px] font-bold text-slate-950 transition hover:brightness-110"
                        >
                          Checkout (${finalLockedPrice.toFixed(2)})
                        </button>
                      </div>
                    </div>
                  ) : (
                    /* EXIT MODAL VIEW or STRETCH GOAL UPSELL VIEW */
                    <div className="rounded-2xl border border-white/15 bg-gradient-to-b from-[#131C31]/95 to-[#090D16]/95 p-4 text-white shadow-2xl backdrop-blur-xl">
                      {/* Top Status Pill & Countdown Clock */}
                      <div className="flex items-center justify-between gap-2">
                        <span
                          className="tabular-numerals inline-flex items-center gap-2 rounded-full border px-3 py-1 font-mono text-xs font-bold"
                          style={{
                            borderColor: `${accentColor}55`,
                            backgroundColor: `${accentColor}22`,
                            color: "#a7f3d0",
                          }}
                        >
                          <span
                            className="h-2 w-2 rounded-full animate-pulse"
                            style={{
                              backgroundColor: accentColor,
                              boxShadow: `0 0 8px ${accentColor}`,
                            }}
                          />
                          <span>{formatClock(previewRemainingSecs)}</span>
                        </span>

                        <span className="rounded-md border border-white/10 bg-white/5 px-2 py-0.5 text-[10px] font-semibold text-slate-300">
                          {storeDisplayName} Price Lock
                        </span>
                      </div>

                      {/* Headline & Body Copy */}
                      <h3 className="mt-3.5 text-lg font-extrabold leading-snug tracking-tight text-white">
                        {previewView === "STRETCH_GOAL" && !stretchUpsellAdded
                          ? `Add $${stretchShortfall.toFixed(2)} more to unlock an instant ${discountBadgeText} Price Lock!`
                          : interpolateCopy(modalHeadline)}
                      </h3>
                      <p className="mt-1.5 text-xs leading-relaxed text-slate-300">
                        {interpolateCopy(modalBodyText)}
                      </p>

                      {/* Stretch Goal Progress Bar */}
                      {previewView === "STRETCH_GOAL" && (
                        <div className="mt-3.5 rounded-xl border border-amber-400/30 bg-amber-500/10 p-3">
                          <div className="flex items-center justify-between text-[11px] font-semibold">
                            <span className="text-amber-200">
                              {stretchUpsellAdded
                                ? "Stretch Goal Unlocked! Price Lock Applied"
                                : `Cart Threshold Progress ($${basePreviewCartSubtotal.toFixed(2)} / $${minCartSubtotal.toFixed(2)})`}
                            </span>
                            <span className="tabular-numerals font-mono text-emerald-300">
                              {stretchUpsellAdded ? "100%" : `${stretchProgressPct}%`}
                            </span>
                          </div>
                          <div className="mt-2 h-2 w-full overflow-hidden rounded-full bg-white/10">
                            <div
                              style={{
                                width: stretchUpsellAdded
                                  ? "100%"
                                  : `${stretchProgressPct}%`,
                                transition:
                                  "width 500ms cubic-bezier(0.34, 1.56, 0.64, 1)",
                              }}
                              className="h-full rounded-full bg-gradient-to-r from-amber-400 to-emerald-400"
                            />
                          </div>
                        </div>
                      )}

                      {/* Elevated Product Showcase Card with object-fit: contain */}
                      <div className="mt-4 flex items-center gap-3 rounded-xl border border-white/10 bg-white/[0.04] p-2.5 shadow-inner">
                        <div className="flex h-16 w-16 shrink-0 items-center justify-center overflow-hidden rounded-xl bg-white p-1">
                          <img
                            src={
                              previewView === "STRETCH_GOAL" && !stretchUpsellAdded
                                ? upsellCatalogItem.imageUrl
                                : activeCatalogItem.imageUrl
                            }
                            alt={activeCatalogItem.title}
                            className="h-full w-full object-contain"
                          />
                        </div>

                        <div className="min-w-0 flex-1">
                          <p className="truncate text-xs font-bold text-white">
                            {previewView === "STRETCH_GOAL" && !stretchUpsellAdded
                              ? `Recommended: ${upsellCatalogItem.title}`
                              : activeCatalogItem.title}
                          </p>
                          <p className="truncate text-[11px] text-slate-400">
                            {previewView === "STRETCH_GOAL" && !stretchUpsellAdded
                              ? upsellCatalogItem.primaryVariant.title
                              : activeCatalogItem.primaryVariant.title}
                          </p>

                          <div className="mt-1 flex flex-wrap items-baseline gap-2">
                            {isPreviewItemExcludedByMarginShield ? (
                              <span className="rounded bg-amber-500/20 px-1.5 py-0.5 text-[10px] font-bold text-amber-300">
                                Sale Item Shielded ($
                                {basePreviewCartSubtotal.toFixed(2)})
                              </span>
                            ) : (
                              <>
                                <span className="tabular-numerals font-mono text-sm font-extrabold text-emerald-300">
                                  ${finalLockedPrice.toFixed(2)}
                                </span>
                                <span className="tabular-numerals font-mono text-xs text-slate-400 line-through">
                                  ${basePreviewCartSubtotal.toFixed(2)}
                                </span>
                                <span className="tabular-numerals rounded bg-emerald-500/20 px-1.5 py-0.5 font-mono text-[10px] font-bold text-emerald-300">
                                  Save ${effectiveSavings.toFixed(2)}
                                  {isPreviewCapped ? " (Max Cap)" : ""}
                                </span>
                              </>
                            )}
                          </div>
                        </div>
                      </div>

                      {/* Primary High-Contrast Action Button */}
                      <button
                        type="button"
                        onClick={() => {
                          if (
                            previewView === "STRETCH_GOAL" &&
                            !stretchUpsellAdded
                          ) {
                            setStretchUpsellAdded(true);
                          } else {
                            setPreviewView("STICKY_BAR");
                          }
                        }}
                        style={{ backgroundColor: accentColor }}
                        className="cl-btn-shimmer mt-4 flex min-h-[44px] w-full items-center justify-center gap-2 rounded-xl px-4 py-2.5 text-xs font-extrabold text-slate-950 shadow-lg"
                      >
                        <Lock className="h-3.5 w-3.5" strokeWidth={2.2} />
                        <span>
                          {previewView === "STRETCH_GOAL" && !stretchUpsellAdded
                            ? `Add Recommended Item ($${upsellCatalogItem.primaryVariant.price.toFixed(2)}) & Lock Discount`
                            : interpolateCopy(buttonText)}
                        </span>
                      </button>

                      {/* Secondary Micro-Action: Email Locked Cart Link */}
                      <button
                        type="button"
                        onClick={() => setShowEmailDrawer((prev) => !prev)}
                        className="mt-2.5 flex w-full items-center justify-center gap-1.5 py-1 text-[11px] font-medium text-slate-300 underline underline-offset-4 hover:text-white"
                      >
                        <Mail className="h-3 w-3" strokeWidth={1.75} />
                        <span>Not ready? Email me this locked cart link</span>
                      </button>

                      {showEmailDrawer && (
                        <div className="mt-2.5 space-y-2 rounded-xl border border-white/15 bg-slate-950/70 p-2.5">
                          <div className="flex gap-1.5">
                            <input
                              type="email"
                              value={previewEmailInput}
                              onChange={(e) =>
                                setPreviewEmailInput(e.target.value)
                              }
                              aria-label="Shopper email for locked cart link"
                              className="min-h-[34px] flex-1 rounded-lg border border-white/15 bg-white/5 px-2.5 text-xs text-white"
                            />
                            <button
                              type="button"
                              onClick={handleGeneratePermalinkPreview}
                              className="rounded-lg bg-white/15 px-3 py-1.5 text-[11px] font-bold text-white hover:bg-white/25"
                            >
                              Send Link
                            </button>
                          </div>
                          {generatedPermalink && (
                            <div className="rounded-lg border border-emerald-500/30 bg-emerald-950/60 p-2 text-[10px] text-emerald-200">
                              <div className="flex items-center gap-1 font-bold text-emerald-300">
                                <Check className="h-3 w-3" strokeWidth={2} />
                                <span>
                                  1-Click Restoration Permalink Dispatched:
                                </span>
                              </div>
                              <code className="mt-1 block break-all font-mono text-[9.5px] text-slate-300">
                                {generatedPermalink}
                              </code>
                            </div>
                          )}
                        </div>
                      )}
                    </div>
                  )}
                </div>
              </div>
            </div>
          </div>
        </aside>
      </div>
    </div>
  );
}
