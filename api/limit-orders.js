/* Лимитные заявки: купить или продать токен, когда цена дойдёт до
 * заданной. Сама сделка — не здесь: заявку исполняет сервер
 * (api/_limitWorker.js) тем же путём, что и нажатие в приложении.
 *
 * GET  ?action=list            — свои открытые и недавние заявки
 * POST ?action=create          — { tokenId, side, amount, price, direction }
 * POST ?action=cancel          — { id }
 *
 * price — цена одного токена в монете сети (SOL, GRAM, BNB, ETH):
 * в ней же цену отдаёт поток кривых, и пересчитывать по курсу на
 * каждой проверке не нужно. direction: "below" — сработать, когда цена
 * опустится до заданной (покупка на откате, стоп), "above" — когда
 * поднимется (фиксация прибыли).
 */
import { createClient } from "@supabase/supabase-js";

const SUPABASE_URL = process.env.SUPABASE_URL;
const SERVICE_ROLE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;
// Больше двадцати висящих заявок у одного человека не бывает по делу —
// это перебор, который только нагружает проверку цен.
const ОТКРЫТЫХ_НЕ_БОЛЬШЕ = 20;

function admin() {
  if (!SUPABASE_URL || !SERVICE_ROLE_KEY) return null;
  return createClient(SUPABASE_URL, SERVICE_ROLE_KEY, { auth: { persistSession: false } });
}

async function хозяин(req, db) {
  const заголовок = req.headers.authorization || "";
  const токен = заголовок.startsWith("Bearer ") ? заголовок.slice(7) : "";
  if (!токен) return null;
  const { data, error } = await db.auth.getUser(токен);
  return error || !data ? null : data.user;
}

export default async function handler(req, res) {
  const db = admin();
  if (!db) return res.status(503).json({ error: "not_configured" });
  res.setHeader("Cache-Control", "no-store");
  const действие = String((req.query && req.query.action) || "list");
  try {
    const user = await хозяин(req, db);
    if (!user) return res.status(401).json({ error: "unauthorized" });

    if (действие === "list") {
      const { data, error } = await db.from("limit_orders")
        .select("id, token_id, chain, side, amount, price, direction, status, error, tx, created_at, filled_at, tokens(ticker, logo_url)")
        .eq("user_id", user.id)
        .order("created_at", { ascending: false })
        .limit(50);
      if (error) return res.status(500).json({ error: "db", detail: error.message });
      return res.status(200).json({ orders: data || [] });
    }

    if (req.method !== "POST") return res.status(405).json({ error: "method_not_allowed" });
    const тело = typeof req.body === "string" ? JSON.parse(req.body || "{}") : (req.body || {});

    if (действие === "create") {
      const side = тело.side === "sell" ? "sell" : тело.side === "buy" ? "buy" : null;
      const direction = тело.direction === "above" ? "above" : тело.direction === "below" ? "below" : null;
      const amount = Number(тело.amount);
      const price = Number(тело.price);
      if (!side || !direction || !(amount > 0) || !(price > 0) || !Number.isFinite(amount) || !Number.isFinite(price)) {
        return res.status(400).json({ error: "bad_request" });
      }
      const { data: токен } = await db.from("tokens").select("id, chain").eq("id", String(тело.tokenId || "")).maybeSingle();
      if (!токен) return res.status(404).json({ error: "token_not_found" });
      const { count } = await db.from("limit_orders").select("id", { count: "exact", head: true }).eq("user_id", user.id).eq("status", "open");
      if ((count || 0) >= ОТКРЫТЫХ_НЕ_БОЛЬШЕ) return res.status(429).json({ error: "too_many_orders" });
      const { data, error } = await db.from("limit_orders").insert({
        user_id: user.id, token_id: токен.id, chain: токен.chain || "ton", side, amount, price, direction, status: "open",
      }).select("id").single();
      if (error) return res.status(500).json({ error: "db", detail: error.message });
      return res.status(200).json({ ok: true, id: data.id });
    }

    if (действие === "cancel") {
      const { error } = await db.from("limit_orders").update({ status: "cancelled" })
        .eq("id", String(тело.id || "")).eq("user_id", user.id).eq("status", "open");
      if (error) return res.status(500).json({ error: "db", detail: error.message });
      return res.status(200).json({ ok: true });
    }

    return res.status(400).json({ error: "unknown_action" });
  } catch (e) {
    return res.status(500).json({ error: "server", detail: String((e && e.message) || e).slice(0, 160) });
  }
}
