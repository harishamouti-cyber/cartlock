# CartLock: Exit-Intent Price Lock

> Built-for-Shopify conversion recovery application powered by Shopify Discount Functions, cryptographic cart attribute verification, and an ultra-lightweight theme app embed.

![CartLock Architecture](https://raw.githubusercontent.com/harishamouti-cyber/cartlock/main/extensions/cartlock-theme-embed/assets/cartlock.css)

---

## Overview

**CartLock** eliminates fake countdown timers and coupon leakage to browser extensions by issuing live, cryptographically signed price reservation contracts directly within Shopify.

When abandoning shoppers trigger an exit-intent or mobile abandonment signal:
1. **Dynamic Stretch Goal State**: If the cart subtotal is below the minimum threshold (e.g. $38 vs $50), an interactive progress bar displays the exact shortfall and offers a 1-click recommended item upsell.
2. **Active Lock State**: When eligible, CartLock displays an Apple Pay/fintech-styled reservation modal with the primary cart item thumbnail, live ticking countdown, and locked price.
3. **Cryptographic Signing**: Signs `_cartlock_expires_at` and `_cartlock_signature` using deterministic HMAC/key hashing, writing attributes to `/cart/update.js`.
4. **Native Shopify Discount Function**: Runs server-side during checkout (`purchase.product-discount.run`). Verifies attribute signatures, checks expiration against shop local time, shields clearance/sale items (`excludeSaleItems`), and enforces maximum dollar caps (`maxDiscountCap`).
5. **Synchronized Checkout Banner**: Checkout UI Extension (`purchase.checkout.block.render`) renders an unmissable countdown banner and savings badge directly above the order summary.
6. **Webhook Attribution**: Captures `orders/create` events, verifying remaining time on the lock and logging verified recovered revenue.

---

## Key Features

- **Anti-Inspect-Element Verification**: Tampering with `_cartlock_expires_at` in browser DevTools automatically invalidates `_cartlock_signature`, revoking the discount to $0.00 at checkout.
- **Margin Shield**: Protects catalog margins by skipping line items already on sale (`compareAtAmountPerQuantity > amountPerQuantity`) and enforcing strict zero-stacking (`combinesWith: { orderDiscounts: false, productDiscounts: false }`).
- **Ultra-Lightweight Theme Embed**: `<2KB` gzipped vanilla JavaScript with scoped CSS, zero external dependencies, and local storage cooldown enforcement.
- **Interactive Admin Studio**:
  - **Conversion Overview (`/app`)**: Live health bar, Theme Editor deep link, 3 elevated Bento KPI cards, and filterable recovered orders table.
  - **Offer Studio & Live Customizer (`/app/settings`)**: Two-column split layout with clickable dynamic variable chips (`+ Discount Value`, `+ Timer Duration`, `+ Cart Total`) and sticky live preview (Desktop and Mobile bezels).
  - **Expiration & Pacing Simulator (`/app/simulator`)**: Interactive sandbox testing real-time Function execution, DevTools tampering rejection, and time-elapsed timelines.

---

## Tech Stack

- **Framework**: Shopify App Remix / React 18 / Vite
- **Database**: Prisma ORM with SQLite
- **Extensions**:
  - Shopify Discount Function (`purchase.product-discount.run`)
  - Shopify Checkout UI Extension (`purchase.checkout.block.render`)
  - Shopify Theme App Embed Block (`cartlock_embed.liquid`)
- **Styling**: Tailwind CSS, Cult UI / 21st.dev design principles, Lucide Icons

---

## Getting Started

### Prerequisites

- Node.js 20+
- Shopify CLI 3.x+
- Shopify Partner account with a development store

### Installation

1. Clone the repository:
   ```bash
   git clone https://github.com/harishamouti-cyber/cartlock.git
   cd cartlock
   ```

2. Install dependencies:
   ```bash
   npm install
   ```

3. Setup environment and database:
   ```bash
   cp .env.example .env
   npm run setup
   ```

4. Run development server:
   ```bash
   npm run dev
   ```

---

## License

MIT License. Designed and engineered for high-growth Shopify merchants.
