/* Чат токена.
 *
 * Кто в нём говорит, решает создатель: 'all' — кто угодно, 'holders' —
 * только те, у кого токен на руках. Проверка владения возможна лишь на
 * сервере: баланс лежит в цепочке, а не в базе, и любой ответ браузера
 * «я держатель» ничего не стоит. Поэтому таблица закрыта политиками
 * целиком (см. supabase_token_chat.sql), а читает и пишет в неё только
 * этот обработчик.
 *
 * Чей кошелёк смотрим. Токены покупаются кошельком приложения и лежат на
 * нём же — его адрес и спрашиваем у сети. Внешних кошельков в
 * приложении больше нет, так что другого места у токенов и не бывает.
 *
 * Действия:
 *   GET  ?action=state&token=<id>  — режим чата, можно ли писать
 *   GET  ?action=list&token=<id>   — последние сообщения
 *   POST ?action=send  { token, body }
 *   POST ?action=mode  { token, mode } — только владелец токена
 *
 * Переменные окружения: SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY,
 * SOLANA_RPC (для проверки держателей Solana), TONAPI_KEY по желанию.
 */

import { createClient } from "@supabase/supabase-js";

const SUPABASE_URL = process.env.SUPABASE_URL;
const SERVICE_ROLE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;
const TESTNET = process.env.TON_TESTNET === "1";
const TONAPI = TESTNET ? "https://testnet.tonapi.io" : "https://tonapi.io";
const TONAPI_KEY = (process.env.TONAPI_KEY || "").trim();

const ДЛИНА = 400;
const СООБЩЕНИЙ = 60;
// Чаще раза в три секунды писать незачем: это чат, а не пулемёт.
const ПАУЗА_МС = 3000;
// Держит ли человек токен — ответ живёт минуту. Баланс меняется редко,
// а спрашивать сеть на каждое сообщение и каждое обновление списка
// значит упереться в лимиты узла.
const ПАМЯТЬ_МС = 60 * 1000;

const держатели = new Map(); // `${user}|${token}` -> { держит, до }
const последнее = new Map(); // user -> время последнего сообщения

function admin() {
  if (!SUPABASE_URL || !SERVICE_ROLE_KEY) return null;
  return createClient(SUPABASE_URL, SERVICE_ROLE_KEY, { auth: { persistSession: false } });
}

async function хозяин(req, db) {
  const заголовок = req.headers.authorization || "";
  const токен = заголовок.startsWith("Bearer ") ? заголовок.slice(7) : "";
  if (!токен) return null;
  const { data, error } = await db.auth.getUser(токен);
  if (error || !data || !data.user) return null;
  return data.user;
}

/* Сколько токена на кошельке приложения. Ноль значит «не держит»: доли
   нам не важны, важен сам факт. */
async function естьНаРуках(db, user, токен) {
  const сеть = (токен.chain || "ton") === "solana" ? "solana" : "ton";
  const { data: кошелёк } = await db
    .from("app_wallets")
    .select("address")
    .eq("user_id", user.id)
    .eq("chain", сеть)
    .maybeSingle();
  if (!кошелёк || !кошелёк.address || !токен.address) return false;

  if (сеть === "solana") {
    const { балансы } = await import("./solana.js");
    const б = await балансы({ wallet: кошелёк.address, mint: токен.address });
    return !!(б && Number(б.token) > 0);
  }

  try {
    const res = await fetch(`${TONAPI}/v2/accounts/${кошелёк.address}/jettons/${токен.address}`, {
      headers: TONAPI_KEY ? { Authorization: `Bearer ${TONAPI_KEY}` } : {},
    });
    if (!res.ok) return false;
    const j = await res.json();
    return Number(j && j.balance) > 0;
  } catch {
    return false;
  }
}

async function держитЛи(db, user, токен) {
  const ключ = `${user.id}|${токен.id}`;
  const было = держатели.get(ключ);
  if (было && было.до > Date.now()) return было.держит;
  const держит = await естьНаРуках(db, user, токен);
  держатели.set(ключ, { держит, до: Date.now() + ПАМЯТЬ_МС });
  return держит;
}

async function токенПо(db, id) {
  if (!id) return null;
  const { data } = await db
    .from("tokens")
    .select("id, owner_id, address, chain, chat_mode")
    .eq("id", id)
    .maybeSingle();
  return data || null;
}

/* Имена и аватарки авторов — одним запросом на всю страницу, а не по
   строке на сообщение. */
async function авторы(db, ids) {
  if (!ids.length) return new Map();
  const { data } = await db
    .from("profiles")
    .select("id, nickname, avatar_url")
    .in("id", ids);
  const карта = new Map();
  for (const п of data || []) карта.set(п.id, { nickname: п.nickname, avatarUrl: п.avatar_url });
  return карта;
}

export default async function handler(req, res) {
  const db = admin();
  if (!db) return res.status(503).json({ error: "not_configured" });

  const действие = String((req.query && req.query.action) || "");
  const user = await хозяин(req, db);
  res.setHeader("Cache-Control", "no-store");

  try {
    const тело = req.method === "POST"
      ? (typeof req.body === "string" ? JSON.parse(req.body || "{}") : (req.body || {}))
      : {};
    const id = String((req.query && req.query.token) || тело.token || "");
    const токен = await токенПо(db, id);
    if (!токен) return res.status(404).json({ error: "token_not_found" });

    const режим = токен.chat_mode === "holders" ? "holders" : "all";
    const свой = !!(user && String(токен.owner_id) === String(user.id));
    // Создателю чат открыт всегда: он его и завёл, а токен у него может
    // быть заперт собственным обещанием и до продажи не доходить.
    const пускают = режим === "all"
      ? !!user
      : !!user && (свой || await держитЛи(db, user, токен));

    if (действие === "state") {
      return res.status(200).json({ mode: режим, canWrite: пускают, canRead: режим === "all" || пускают, owner: свой });
    }

    if (действие === "list") {
      if (режим === "holders" && !пускают) {
        return res.status(200).json({ mode: режим, canWrite: false, canRead: false, messages: [] });
      }
      const { data, error } = await db
        .from("token_chat")
        .select("id, user_id, body, created_at")
        .eq("token_id", токен.id)
        .order("created_at", { ascending: false })
        .limit(СООБЩЕНИЙ);
      if (error) return res.status(500).json({ error: "db", detail: error.message });
      const строки = (data || []).slice().reverse();
      const карта = await авторы(db, [...new Set(строки.map((с) => с.user_id))]);
      return res.status(200).json({
        mode: режим,
        canWrite: пускают,
        canRead: true,
        messages: строки.map((с) => ({
          id: с.id,
          userId: с.user_id,
          body: с.body,
          createdAt: с.created_at,
          nickname: (карта.get(с.user_id) || {}).nickname || null,
          avatarUrl: (карта.get(с.user_id) || {}).avatarUrl || null,
          mine: !!(user && с.user_id === user.id),
        })),
      });
    }

    if (req.method !== "POST") return res.status(405).json({ error: "method_not_allowed" });
    if (!user) return res.status(401).json({ error: "unauthorized" });

    if (действие === "mode") {
      if (!свой) return res.status(403).json({ error: "not_owner" });
      const новый = тело.mode === "holders" ? "holders" : "all";
      const { error } = await db.from("tokens").update({ chat_mode: новый }).eq("id", токен.id);
      if (error) return res.status(500).json({ error: "db", detail: error.message });
      return res.status(200).json({ mode: новый });
    }

    if (действие === "send") {
      if (!пускают) return res.status(403).json({ error: "holders_only" });
      const текст = String(тело.body || "").trim().slice(0, ДЛИНА);
      if (!текст) return res.status(400).json({ error: "empty" });
      const было = последнее.get(user.id) || 0;
      if (Date.now() - было < ПАУЗА_МС) return res.status(429).json({ error: "too_often" });

      const { data, error } = await db
        .from("token_chat")
        .insert({ token_id: токен.id, user_id: user.id, body: текст })
        .select("id, created_at")
        .single();
      if (error) return res.status(500).json({ error: "db", detail: error.message });
      последнее.set(user.id, Date.now());
      return res.status(200).json({ id: data.id, createdAt: data.created_at });
    }

    return res.status(400).json({ error: "unknown_action" });
  } catch (err) {
    return res.status(500).json({ error: "internal", detail: String((err && err.message) || err).slice(0, 200) });
  }
}
