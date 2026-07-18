// ============================================================
// KROFF — Supabase Edge Function: send-order
// Buyurtmani xodimlar Telegram guruhiga yuboradi.
// Bot tokeni faqat shu yerda (maxfiy), saytda EMAS.
//
// MUHIM: Funksiyada "Verify JWT" ni O'CHIRING (off),
// chunki sayt yangi publishable kalit (sb_publishable_...) bilan chaqiradi.
//
// Kerakli maxfiy o'zgaruvchilar (Secrets):
//   TELEGRAM_BOT_TOKEN  — botingiz tokeni (@BotFather bergan)
//   TELEGRAM_CHAT_ID    — guruh id si (masalan -1001234567890)
//   KROFF_ORDER_KEY     — (ixtiyoriy) spam himoyasi. O'rnatsangiz "kroff-shop" qiling.
// ============================================================

const CORS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "POST, GET, OPTIONS",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type, x-kroff-key",
};

function grp(n: number): string {
  return (Math.round(n) || 0).toLocaleString("ru-RU").replace(/,/g, " ");
}
function esc(s: unknown): string {
  return String(s ?? "").replace(/[<>&]/g, (c) =>
    ({ "<": "&lt;", ">": "&gt;", "&": "&amp;" }[c] as string)
  );
}
function json(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...CORS, "Content-Type": "application/json" },
  });
}

Deno.serve(async (req: Request) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: CORS });
  if (req.method === "GET") return json({ ok: true, service: "send-order" });
  if (req.method !== "POST") return json({ ok: false, error: "method" }, 405);

  const TOKEN = Deno.env.get("TELEGRAM_BOT_TOKEN");
  const CHAT = Deno.env.get("TELEGRAM_CHAT_ID");
  const GUARD = Deno.env.get("KROFF_ORDER_KEY");

  if (!TOKEN || !CHAT) {
    return json(
      { ok: false, error: "TELEGRAM_BOT_TOKEN yoki TELEGRAM_CHAT_ID sozlanmagan" },
      500,
    );
  }
  if (GUARD && req.headers.get("x-kroff-key") !== GUARD) {
    return json({ ok: false, error: "forbidden" }, 403);
  }

  let body: any = {};
  try {
    body = await req.json();
  } catch {
    /* ignore */
  }
  const items: any[] = Array.isArray(body.items) ? body.items : [];
  if (!items.length) return json({ ok: false, error: "savat bo'sh" }, 400);

  const lines = items.map(
    (it, i) =>
      `${i + 1}) ${esc(it.nom)} — ${it.qty} dona × ${grp(+it.price)} = ${
        grp(+it.sum || +it.price * +it.qty)
      } so'm`,
  );

  const isDelivery = body.mode !== "pickup";
  const sub = +body.subtotal || +body.total || 0;
  const fee = +body.fee || 0;
  const total = +body.total || sub + fee;
  const lat = Number(body.lat), lng = Number(body.lng);
  const hasLoc = isDelivery && isFinite(lat) && isFinite(lng) &&
    (lat !== 0 || lng !== 0);

  let msg = `🛒 <b>KROFF — yangi buyurtma</b>\n\n${lines.join("\n")}\n\n` +
    `Mahsulotlar: ${grp(sub)} so'm\n` +
    (isDelivery ? "🚚 <b>Yetkazib berish</b>" : "🏪 <b>Olib ketish</b>");
  if (isDelivery && body.address) msg += `\n📍 ${esc(body.address)}`;
  if (hasLoc) msg += `\n🗺 https://maps.google.com/?q=${lat},${lng}`;
  if (body.distance) msg += `\nMasofa: ~${esc(body.distance)} km`;
  const disc = +body.disc || 0;
  if (isDelivery) {
    msg += fee > 0
      ? `\nYetkazish${disc > 0 ? ` (\u2212${disc}%)` : ""}: ${grp(fee)} so'm`
      : `\nYetkazish: bepul`;
  }
  msg += `\n💰 <b>Jami: ${grp(total)} so'm</b>`;
  if (body.name) msg += `\n\n👤 ${esc(body.name)}`;
  if (body.phone) msg += `\n📞 ${esc(body.phone)}`;
  msg += `\n\n🕒 ${
    new Date().toLocaleString("ru-RU", { timeZone: "Asia/Tashkent" })
  }`;

  const tgResp = await fetch(
    `https://api.telegram.org/bot${TOKEN}/sendMessage`,
    {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        chat_id: CHAT,
        text: msg,
        parse_mode: "HTML",
        disable_web_page_preview: true,
      }),
    },
  );
  const tgJson = await tgResp.json().catch(() => ({}));
  if (!tgResp.ok || !tgJson.ok) {
    return json(
      { ok: false, error: "Telegram: " + (tgJson.description || tgResp.status) },
      502,
    );
  }

  // Yetkazib berish bo'lsa — guruhga xarita nuqtasini ham tashlaymiz
  if (hasLoc) {
    await fetch(`https://api.telegram.org/bot${TOKEN}/sendLocation`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ chat_id: CHAT, latitude: lat, longitude: lng }),
    }).catch(() => {});
  }

  return json({ ok: true });
});
