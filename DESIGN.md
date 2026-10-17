# CartLock: Exit-Intent Price Lock — Design System & Architectural Direction

Reading this as: **Built-for-Shopify Conversion Recovery & Margin-Shield Admin Studio + Luxury Fintech Storefront Widget** for **Shopify Plus & growth merchants**, in a **Tactile Precision Studio (21st.dev / Cult UI / Skiper UI / Watermelon UI)** style, dial **ENERGY 2 / RHYTHM 2 / MOTION 2**.

---

## 1. Aesthetic Direction & Core Thesis
- **Aesthetic Name**: Tactile Fintech Commerce Studio
- **DFII Score**: **14 / 15** (Impact 4 + Fit 5 + Feasibility 5 + Performance 4 - Consistency Risk 4 = 14)
- **Differentiation Anchor**: Rather than looking like a generic spin-to-win popup app, CartLock pairs an engineered slate-and-emerald studio workspace (1px specular inner borders, recessed segmented controls, live device bezel framing) with a storefront reservation widget styled like an Apple Pay / luxury fintech price lock contract.
- **Anti-Generic Commitment**: This avoids generic UI by replacing static coupon codes and fake urgency banners with a live cryptographic reservation contract, a real-time Function execution timeline simulator, and spring-physics device bezel previews.

---

## 2. Design System Tokens & Rationale (R-31 Decision Log)

### Color Palette (2 Core Neutrals + 1 Primary Accent)
- **Canvas Surface (`--cl-bg-canvas: #F4F5F7`)**: Cool architectural alabaster that provides contrast against elevated white bento cards without eye strain in long merchant sessions.
- **Elevated Card Surface (`--cl-bg-surface: #FFFFFF`)**: Pure crisp surface paired with a 1px outer border (`rgba(15, 23, 42, 0.08)`), 1px top-edge inner specular highlight (`inset 0 1px 0 0 rgba(255, 255, 255, 0.9)`), and multi-stage ambient shadow (`0 1px 2px rgba(15, 23, 42, 0.04), 0 8px 24px -4px rgba(15, 23, 42, 0.05)`).
- **Obsidian Vault Surface (`--cl-bg-vault: #090D16`)**: High-contrast dark slate reserved specifically for the Storefront Reservation Widget frame, Cryptographic Verification badge, and Function JSON Inspector to separate live execution surfaces from configuration forms.
- **Primary Brand & Verification Accent (`--cl-accent-emerald: #10B981` / `#059669`)**: Signals verified cryptographic authenticity, active price locks, and recovered net revenue.
- **Warning / Margin Shield Accent (`--cl-accent-amber: #F59E0B` / `#D97706`)**: Reserved strictly for Stretch Goal AOV thresholds, Margin Shield sale-item exclusions, and expiring timer warnings (< 120 seconds).

### Typography & Numerals
- **UI & Studio Headings (`Plus Jakarta Sans`, `-apple-system`, sans-serif)**: Clean geometric sans-serif with sentence-case headers (`letter-spacing: -0.02em`) for scannable hierarchy inside Shopify Admin.
- **Numeric & Countdown Display (`JetBrains Mono` / round unslashed tabular numerals)**: `font-variant-numeric: tabular-nums; font-feature-settings: "tnum" 1, "zero" 0;` so live ticking countdown clocks (`14:59`), dollar caps, and simulated elapsed timers never jitter horizontally as digits change.

### Motion & Spring Physics (Skiper UI & Watermelon UI Standard)
- **Primary Spring Curve (`--cl-spring-fluid: cubic-bezier(0.22, 1, 0.36, 1)`)**: Used for device bezel switching (Desktop <-> Mobile), preview mode transitions (Exit Modal <-> Stretch Goal <-> Sticky Bar), and drawer expansions.
- **Tactile Bounce Curve (`--cl-spring-snappy: cubic-bezier(0.34, 1.56, 0.64, 1)`)**: Used for variable chip insertion feedback, Stretch Goal progress bar completion, and active lock badge pulses.
- **Glassmorphism Dose Cap (R-10)**: Frosted glass (`backdrop-filter: blur(16px)`) is restricted strictly to the Storefront Exit Modal overlay and the Floating Bottom Reservation Pill Bar—never applied across the admin navigation, cards, and tables simultaneously.
- **Shadow & Glow Dose Cap (R-12, R-13)**: Multi-stage elevation shadows define card hierarchy; subtle emerald pulse glow is restricted strictly to the live status indicator dot and active countdown badge.
