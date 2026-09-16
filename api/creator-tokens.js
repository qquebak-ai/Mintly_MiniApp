/* Токены одного создателя.
 *
 * На чужом профиле список оставался пустым: таблица tokens закрыта
 * политиками, и вошедший в приложение человек видит через неё только
 * свои строки — чужие не отдаются вовсе. Свести их может лишь служебный
 * ключ, и наружу уходит ровно то, что и так показано на карточке
 * токена: имя, тикер, картинка, сеть и время запуска.
 *
 * Запрос: GET /api/creator-tokens?owner=<id профиля>&limit=50
 *
 * Переменные окружения: SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY.
 */

import { createClient } from "@supabase/supabase-js";

const SUPABASE_URL = process.env.SUPABASE_URL;
const SERVICE_ROLE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;

const СТРОК = 50;
// Полминуты памяти: список токенов человека меняется от силы раз в день,
// а на профиль заходят подряд с нескольких экранов.
const ПАМЯТЬ_МС = 30_000;

const кеш = new Map(); // владелец -> { до, тело }

function admin() {
  if (!SUPABASE_URL || !SERVICE_ROLE_KEY) return null;
  return createClient(SUPABASE_URL, SERVICE_ROLE_KEY, { auth: { persistSession: false } });
}

export default async function handler(req, res) {
  const db = admin();
  if (!db) { res.status(200).json({ rows: [] }); return; }

  const владелец = String((req.query && req.query.owner) || "").trim();
  // Идентификатор профиля — UUID. Проверка не ради безопасности (ключ
  // служебный и запрос всё равно параметризован), а чтобы не ходить в
  // базу за мусором.
  if (!/^[0-9a-f-]{36}$/i.test(владелец)) { res.status(200).json({ rows: [] }); return; }

  const предел = Math.min(Number((req.query && req.query.limit) || СТРОК) || СТРОК, СТРОК);
  const сейчас = Date.now();
  const в_кеше = кеш.get(владелец);
  if (в_кеше && в_кеше.до > сейчас) { res.status(200).json(в_кеше.тело); return; }

  const { data, error } = await db
    .from("tokens")
    .select("id, name, ticker, logo_url, address, chain, network, created_at, dex_pool_address, curve_address, supply")
    .eq("owner_id", владелец)
    .order("created_at", { ascending: false })
    .limit(предел);

  if (error) { res.status(200).json({ rows: [] }); return; }

  const тело = { rows: data || [] };
  кеш.set(владелец, { до: сейчас + ПАМЯТЬ_МС, тело });
  if (кеш.size > 500) {
    for (const [к, з] of кеш) if (з.до <= сейчас) кеш.delete(к);
  }
  res.status(200).json(тело);
}
