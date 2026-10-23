/* Проверка кода с почты — второй ключ к выводу.
 *
 * Код приходит письмом от Supabase (приложение просит его само,
 * signInWithOtp). Раньше его и проверяло приложение, а сервер потом
 * судил о проверке по токену — и путал её с любым входом одноразовой
 * ссылкой (см. api/_second.js). Теперь код присылают сюда: сервер сам
 * сверяет его с Supabase и выдаёт билет на пятнадцать минут.
 *
 *   POST /api/second-key   { code }   Authorization: Bearer <токен входа>
 *   → { ticket, expiresAt }
 */

import { createClient } from "@supabase/supabase-js";
import { выдатьБилет, настоящаяПочта } from "./_second.js";

const SUPABASE_URL = process.env.SUPABASE_URL;
const SERVICE_ROLE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;

// Перебор кода: шесть попыток за десять минут на человека.
const ОКНО_МС = 10 * 60 * 1000;
const ПОПЫТОК = 6;
const попытки = new Map(); // user_id -> метки времени

function можноЕщё(id) {
  const сейчас = Date.now();
  const свои = (попытки.get(id) || []).filter((т) => сейчас - т < ОКНО_МС);
  свои.push(сейчас);
  попытки.set(id, свои);
  if (попытки.size > 5000) {
    for (const [к, v] of попытки) if (!v.length || сейчас - v[v.length - 1] > ОКНО_МС) попытки.delete(к);
  }
  return свои.length <= ПОПЫТОК;
}

export default async function handler(req, res) {
  res.setHeader("Cache-Control", "no-store");
  if (req.method !== "POST") return res.status(405).json({ error: "method_not_allowed" });
  if (!SUPABASE_URL || !SERVICE_ROLE_KEY) return res.status(503).json({ error: "not_configured" });

  const db = createClient(SUPABASE_URL, SERVICE_ROLE_KEY, { auth: { persistSession: false, autoRefreshToken: false } });
  const заголовок = String(req.headers.authorization || "");
  const токен = заголовок.startsWith("Bearer ") ? заголовок.slice(7).trim() : "";
  if (!токен) return res.status(401).json({ error: "unauthorized" });
  const { data: кто, error: ктоErr } = await db.auth.getUser(токен);
  const user = кто && кто.user;
  if (ктоErr || !user) return res.status(401).json({ error: "unauthorized" });

  const почта = настоящаяПочта(user);
  if (!почта) return res.status(400).json({ error: "no_mail" });
  if (!можноЕщё(user.id)) {
    res.setHeader("Retry-After", "600");
    return res.status(429).json({ error: "too_many_requests" });
  }

  let тело = req.body;
  try { if (typeof тело === "string") тело = JSON.parse(тело || "{}"); } catch { тело = {}; }
  const код = String((тело && тело.code) || "").replace(/\s+/g, "");
  if (!/^\d{6,10}$/.test(код)) return res.status(400).json({ error: "bad_code" });

  // Свой клиент: проверка кода открывает сессию, а общий должен
  // остаться с сервисным ключом и без чужой сессии.
  const проверка = createClient(SUPABASE_URL, SERVICE_ROLE_KEY, { auth: { persistSession: false, autoRefreshToken: false } });
  const { data, error } = await проверка.auth.verifyOtp({ email: почта, token: код, type: "email" });
  if (error || !data || !data.user || data.user.id !== user.id) return res.status(401).json({ error: "bad_code" });
  // Сессия от проверки нам не нужна — закрываем, чтобы не висела.
  if (data.session && data.session.access_token) {
    try { await db.auth.admin.signOut(data.session.access_token, "local"); } catch { /* истечёт сама */ }
  }
  return res.status(200).json(выдатьБилет(user.id));
}
