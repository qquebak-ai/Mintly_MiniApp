/* Свежие чужие запуски для ленты «Новые» (см. api/_launchStream.js).
 *
 *   GET /api/new-launches?after=<мс>
 *
 * Открытая: в ответе только публичные данные сети. Кеш — секунда, этого
 * хватает, чтобы тысяча телефонов не будили обработчик тысячу раз. */
import { свежиеЗапуски, лентаЖива } from "./_launchStream.js";

export default async function handler(req, res) {
  const после = Math.max(0, Number((req.query && req.query.after) || 0) || 0);
  res.setHeader("Cache-Control", "public, max-age=1");
  return res.status(200).json({ now: Date.now(), live: лентаЖива(), items: свежиеЗапуски(после) });
}
