import type { SVGProps } from "react";

/**
 * Custom 1.5px Precision Geometric Vector Iconography (21st.dev / Cult UI / Skiper UI / Watermelon UI Standard)
 * Multi-layered vector glyphs with inner specular highlights and crisp geometric proportions.
 */

export function VaultLockEmblem(props: SVGProps<SVGSVGElement>) {
  return (
    <svg
      viewBox="0 0 24 24"
      fill="none"
      xmlns="http://www.w3.org/2000/svg"
      {...props}
    >
      <rect
        x="3.75"
        y="10.25"
        width="16.5"
        height="10.5"
        rx="3.25"
        stroke="currentColor"
        strokeWidth="1.5"
      />
      <path
        d="M7.75 10.25V7.5C7.75 5.15279 9.65279 3.25 12 3.25C14.3472 3.25 16.25 5.15279 16.25 7.5V10.25"
        stroke="currentColor"
        strokeWidth="1.5"
        strokeLinecap="round"
      />
      <circle cx="12" cy="14.75" r="1.5" fill="currentColor" />
      <path
        d="M12 16.25V17.75"
        stroke="currentColor"
        strokeWidth="1.5"
        strokeLinecap="round"
      />
    </svg>
  );
}

export function MarginShieldEmblem(props: SVGProps<SVGSVGElement>) {
  return (
    <svg
      viewBox="0 0 24 24"
      fill="none"
      xmlns="http://www.w3.org/2000/svg"
      {...props}
    >
      <path
        d="M12 2.75L4.75 6V11.5C4.75 16.35 7.84 20.74 12 22.25C16.16 20.74 19.25 16.35 19.25 11.5V6L12 2.75Z"
        stroke="currentColor"
        strokeWidth="1.5"
        strokeLinejoin="round"
      />
      <path
        d="M9.25 12.25L11.25 14.25L15.25 9.75"
        stroke="currentColor"
        strokeWidth="1.6"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  );
}

export function ChronoPulseEmblem(props: SVGProps<SVGSVGElement>) {
  return (
    <svg
      viewBox="0 0 24 24"
      fill="none"
      xmlns="http://www.w3.org/2000/svg"
      {...props}
    >
      <circle
        cx="12"
        cy="13"
        r="8.25"
        stroke="currentColor"
        strokeWidth="1.5"
      />
      <path
        d="M9.5 2.75H14.5"
        stroke="currentColor"
        strokeWidth="1.5"
        strokeLinecap="round"
      />
      <path
        d="M12 9.25V13L14.75 14.75"
        stroke="currentColor"
        strokeWidth="1.5"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
      <circle
        cx="18.5"
        cy="6.5"
        r="2"
        fill="currentColor"
        fillOpacity="0.25"
        stroke="currentColor"
        strokeWidth="1.2"
      />
    </svg>
  );
}

export function HmacSignatureGlyph(props: SVGProps<SVGSVGElement>) {
  return (
    <svg
      viewBox="0 0 24 24"
      fill="none"
      xmlns="http://www.w3.org/2000/svg"
      {...props}
    >
      <circle
        cx="8.5"
        cy="12"
        r="4.75"
        stroke="currentColor"
        strokeWidth="1.5"
      />
      <circle cx="8.5" cy="12" r="1.5" fill="currentColor" />
      <path
        d="M13.25 12H20.25M17.25 12V15.25M19.75 12V14.25"
        stroke="currentColor"
        strokeWidth="1.5"
        strokeLinecap="round"
      />
    </svg>
  );
}

export function FunnelTelemetryGlyph(props: SVGProps<SVGSVGElement>) {
  return (
    <svg
      viewBox="0 0 24 24"
      fill="none"
      xmlns="http://www.w3.org/2000/svg"
      {...props}
    >
      <path
        d="M3.75 5.5H20.25L14.25 12.75V18.5L9.75 20.25V12.75L3.75 5.5Z"
        stroke="currentColor"
        strokeWidth="1.5"
        strokeLinejoin="round"
      />
      <path
        d="M7.5 9H16.5"
        stroke="currentColor"
        strokeWidth="1.2"
        strokeLinecap="round"
        strokeOpacity="0.6"
      />
    </svg>
  );
}

export function LiveRadarDot({
  tone = "emerald",
}: {
  tone?: "emerald" | "amber" | "rose";
}) {
  const palette = {
    emerald: {
      core: "bg-emerald-500",
      ring: "bg-emerald-400/40",
      glow: "shadow-[0_0_10px_#10b981]",
    },
    amber: {
      core: "bg-amber-500",
      ring: "bg-amber-400/40",
      glow: "shadow-[0_0_10px_#f59e0b]",
    },
    rose: {
      core: "bg-rose-500",
      ring: "bg-rose-400/40",
      glow: "shadow-[0_0_10px_#f43f5e]",
    },
  }[tone];

  return (
    <span className="relative inline-flex h-2.5 w-2.5 items-center justify-center">
      <span
        className={`absolute inline-flex h-full w-full animate-ping rounded-full ${palette.ring}`}
      />
      <span
        className={`relative inline-flex h-2 w-2 rounded-full ${palette.core} ${palette.glow}`}
      />
    </span>
  );
}
