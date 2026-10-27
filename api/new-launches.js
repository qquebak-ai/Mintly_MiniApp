/* Свежие чужие запуски для ленты «Новые» (см. api/_launchStream.js).
 *
 *   GET /api/new-launches?after=<мс>
 *
 * Открытая: в ответе только публичные данные сети. Кеш — секунда, этого
 * хватает, чтобы тысяча телефонов не будили обработчик тысячу раз. */
import { свежиеЗапуски, лентаЖива, картинкаЗапуска, сделкиЗапуска } from "./_launchStream.js";

export default async function handler(req, res) {
  // ?trades=<mint> — сделки свежего токена для графика его страницы.
  const поТокену = String((req.query && req.query.trades) || "");
  if (поТокену) {
    if (!/^[1-9A-HJ-NP-Za-km-z]{32,44}$/.test(поТокену)) return res.status(400).json({ error: "bad_request" });
    res.setHeader("Cache-Control", "public, max-age=1");
    const д = сделкиЗапуска(поТокену);
    return д ? res.status(200).json(д) : res.status(404).json({ error: "unknown" });
  }
  // ?logo=<mint> — картинка токена из памяти сервера.
  const mint = String((req.query && req.query.logo) || "");
  if (mint) {
    if (!/^[1-9A-HJ-NP-Za-km-z]{32,44}$/.test(mint)) return res.status(400).json({ error: "bad_request" });
    const к = await картинкаЗапуска(mint);
    if (!к) { res.setHeader("Cache-Control", "no-store"); return res.status(404).json({ error: "no_logo" }); }
    res.setHeader("Content-Type", к.тип);
    // Чужая картинка с нашего адреса: SVG со скриптом не должен исполниться.
    res.setHeader("Content-Security-Policy", "default-src 'none'; style-src 'unsafe-inline'; img-src data:");
    res.setHeader("X-Content-Type-Options", "nosniff");
    res.setHeader("Cache-Control", "public, max-age=86400, immutable");
    return res.status(200).send(к.байты);
  }
  const после = Math.max(0, Number((req.query && req.query.after) || 0) || 0);
  res.setHeader("Cache-Control", "public, max-age=1");
  return res.status(200).json({ now: Date.now(), live: лентаЖива(), items: свежиеЗапуски(после) });
}
