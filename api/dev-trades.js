/* Сделки создателя токена — для кружков «D» на графике.
 *
 * Таблица trades закрыта политиками: человек видит в ней только свои
 * строки. Сделки создателя и так лежат в цепочке у всех на виду, но
 * цепочка не говорит, какой кошелёк — создатель, поэтому сводим здесь
 * служебным ключом. Наружу уходят только сторона и время.
 *
 * Запрос: GET /api/dev-trades?token=<адрес токена>
 *
 * Переменные окружения: SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY.
 */

import { createClient } from "@supabase/supabase-js";

const SUPABASE_URL = process.env.SUPABASE_URL;
const SERVICE_ROLE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;
// Полминуты памяти: карточку открывают многие, а создатель торгует редко.
const ПАМЯТЬ_МС = 30_000;
const кеш = new Map(); // адрес -> { до, тело }

function admin() {
  if (!SUPABASE_URL || !SERVICE_ROLE_KEY) return null;
  return createClient(SUPABASE_URL, SERVICE_ROLE_KEY, { auth: { persistSession: false } });
}

export default async function handler(req, res) {
  const адрес = String((req.query && req.query.token) || "").trim();
  if (!адрес || адрес.length > 80) { res.status(200).json({ trades: [] }); return; }
  const было = кеш.get(адрес);
  if (было && было.до > Date.now()) { res.status(200).json(было.тело); return; }
  const db = admin();
  if (!db) { res.status(200).json({ trades: [] }); return; }
  try {
    const { data: токен } = await db.from("tokens").select("owner_id").eq("address", адрес).limit(1).maybeSingle();
    if (!токен || !токен.owner_id) { res.status(200).json({ trades: [] }); return; }
    const { data } = await db
      .from("trades")
      .select("side, created_at")
      .eq("token_address", адрес)
      .eq("user_id", токен.owner_id)
      .order("created_at", { ascending: false })
      .limit(100);
    const тело = { owner: токен.owner_id, trades: (data || []).map((с) => ({ side: с.side, at: с.created_at })) };
    кеш.set(адрес, { до: Date.now() + ПАМЯТЬ_МС, тело });
    res.status(200).json(тело);
  } catch {
    res.status(200).json({ trades: [] });
  }
}
