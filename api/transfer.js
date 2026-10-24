/* Кому перевести: человек Mintly по нику.
 *
 *   GET /api/transfer?nick=<ник>
 *
 * Отдаёт только то, что и так видно в профиле, — ник и аватар, — и id,
 * по которому вывод (api/wallet-*.js, toUser) найдёт кошелёк получателя
 * сам. Адрес кошелька наружу не уходит. Только для вошедших и с
 * пределом частоты (api/_transfer.js).
 *
 * Переменные окружения: SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY.
 */

import { createClient } from "@supabase/supabase-js";
import { человекПоНику, поискРазрешён } from "./_transfer.js";

function admin() {
  if (!process.env.SUPABASE_URL || !process.env.SUPABASE_SERVICE_ROLE_KEY) return null;
  return createClient(process.env.SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY, { auth: { persistSession: false } });
}

export default async function handler(req, res) {
  res.setHeader("Cache-Control", "no-store");
  const db = admin();
  if (!db) return res.status(503).json({ error: "not_configured" });
  const заголовок = req.headers.authorization || "";
  const токен = заголовок.startsWith("Bearer ") ? заголовок.slice(7) : "";
  if (!токен) return res.status(401).json({ error: "unauthorized" });
  const { data, error } = await db.auth.getUser(токен);
  const user = !error && data && data.user;
  if (!user) return res.status(401).json({ error: "unauthorized" });
  if (!поискРазрешён(user.id)) return res.status(429).json({ error: "too_often" });

  const найден = await человекПоНику(db, req.query && req.query.nick);
  if (!найден) return res.status(404).json({ error: "not_found" });
  if (найден.id === user.id) return res.status(400).json({ error: "self" });
  return res.status(200).json({ user: { id: найден.id, nickname: найден.nickname, avatar: найден.avatar_url || null } });
}
