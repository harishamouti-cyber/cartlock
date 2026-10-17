(() => {
  const el = document.getElementById("cartlock-app-embed-root");
  if (!el || el.dataset.active === "false") return;
  const d = el.dataset,
    pct = d.discountType !== "FIXED_AMOUNT",
    val = +d.discountValue || 10,
    cap = +d.maxCap || 25,
    min = +d.minSubtotal || 50,
    mins = +d.lockMinutes || 15,
    proxy = d.proxyUrl || "/apps/cartlock",
    CK = "_cartlock_cooldown_until";
  el.style.setProperty("--cl-accent", d.accent || "#10b981");
  let open = 0;
  const fmt = (s) => `${String((s / 60) | 0).padStart(2, "0")}:${String(s % 60 | 0).padStart(2, "0")}`,
    lbl = pct ? `${val}%` : `$${val}`,
    tpl = (s, tot, t) => (s || "").replace(/\{discount\}/g, lbl).replace(/\{timer\}/g, t).replace(/\{cart_total\}/g, tot),
    post = (u, b) => fetch(u, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(b) });

  async function run() {
    if (open || Date.now() < +localStorage.getItem(CK)) return;
    const cart = await fetch("/cart.js").then((r) => r.json()).catch(() => 0);
    if (!cart || !cart.item_count) return;
    open = 1;
    localStorage.setItem(CK, Date.now() + (+d.cooldownHours || 72) * 36e5);
    const sub = cart.total_price / 100,
      it = cart.items[0],
      up = d.enableUpsell !== "false" && sub < min,
      gap = (min - sub).toFixed(2),
      sav = Math.min(cap || 999, pct ? (sub * val) / 100 : val),
      tot = `$${sub.toFixed(2)}`;
    let rem = mins * 60;
    el.innerHTML = `<div class="cl-backdrop cl-open"><div class="cl-modal" role="dialog"><div class="cl-top-row"><span class="cl-pill-badge"><span class="cl-pulse-dot"></span><span id="cl-t">${fmt(rem)}</span></span><button class="cl-close-btn" id="cl-x">&times;</button></div><h2 class="cl-headline">${up ? `Add $${gap} more to unlock an instant ${lbl} Price Lock!` : tpl(d.headline, tot, fmt(rem))}</h2><p class="cl-body">${tpl(d.body, tot, mins + "m")}</p>${up ? `<div class="cl-progress-box"><p class="cl-progress-label">${tot} / $${min}</p><div class="cl-progress-track"><div class="cl-progress-fill" style="width:${(sub / min) * 100}%"></div></div></div>` : ""}<div class="cl-showcase-card"><div class="cl-thumb-wrap"><img src="${it.image}" alt=""></div><div class="cl-item-meta"><p class="cl-item-title">${it.product_title}</p><p class="cl-item-variant">${it.variant_title || ""}</p><div class="cl-price-row"><span class="cl-locked-price">$${Math.max(0, sub - sav).toFixed(2)}</span><span class="cl-orig-price">${tot}</span></div></div></div><button class="cl-primary-btn" id="cl-cta">${up ? "Add Recommended Item & Lock Discount" : tpl(d.button, tot, fmt(rem))}</button><button class="cl-secondary-link" id="cl-em">Not ready? Email me this locked cart link</button><div class="cl-email-drawer" id="cl-eb" style="display:none"><input class="cl-email-input" id="cl-ei" placeholder="you@email.com"><button class="cl-email-send" id="cl-es">Send</button></div></div></div><div class="cl-sticky-bar" id="cl-sb"></div>`;
    const q = (s) => el.querySelector(s);
    q("#cl-x").onclick = () => q(".cl-backdrop").classList.remove("cl-open");
    q("#cl-em").onclick = () => (q("#cl-eb").style.display = "flex");
    q("#cl-es").onclick = () => post(`${proxy}/lock`, { action: "email_permalink", shop: d.shop, email: q("#cl-ei").value });
    q("#cl-cta").onclick = async () => {
      if (up && d.upsellVariantId) await post("/cart/add.js", { id: +d.upsellVariantId.replace(/\D/g, ""), quantity: 1 });
      const exp = new Date(Date.now() + mins * 6e4).toISOString();
      const res = await post(`${proxy}/lock`, { shop: d.shop, expiresAt: exp }).then((r) => r.json()).catch(() => ({}));
      await post("/cart/update.js", { attributes: { _cartlock_expires_at: exp, _cartlock_signature: res.signature || "" } });
      if (d.directCheckout === "true") location.href = "/checkout";
      q(".cl-backdrop").classList.remove("cl-open");
      q("#cl-sb").classList.add("cl-visible");
    };
    setInterval(() => {
      if (--rem >= 0) {
        q("#cl-t").textContent = fmt(rem);
        q("#cl-sb").innerHTML = `<span class="cl-pulse-dot"></span><span>Locked: <b>${fmt(rem)}</b></span><a href="/checkout" class="cl-sticky-cta">Checkout</a>`;
      }
    }, 1e3);
  }
  if (d.desktopExit !== "false") addEventListener("mouseout", (e) => !e.relatedTarget && e.clientY < 12 && run());
  if (d.mobileIdle !== "false") addEventListener("visibilitychange", () => document.hidden && run());
})();
