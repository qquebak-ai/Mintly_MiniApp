/* Всё, что кошелёк потратил и получил, одним списком.
 *
 * Сделки приложение и так знает: оно само их записывает в trades. А вот
 * запуск токена, вывод на свой адрес, свод излишков и закрытие кривой
 * живут только в журнале операций — он серверный, закрыт от браузера
 * вместе с адресами и ip. Из-за этого история показывала покупки с
 * продажами и молчала о тратах, которые человек видел в балансе, но не
 * находил в списке.
 *
 * Здесь журнал пересказывается наружу: без ip, без внутренних полей —
 * вид операции, сумма, монета, время и подпись, по которой её видно в
 * обозревателе.
 *
 * Переменные окружения: SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY.
 */

import { createClient } from "@supabase/supabase-js";

const SUPABASE_URL = process.env.SUPABASE_URL;
const SERVICE_ROLE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;

// Столько строк отдаём за раз: история кошелька читается на экране
// целиком, листать её постранично незачем.
const ПРЕДЕЛ = 60;

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

export default async function handler(req, res) {
  const db = admin();
  if (!db) return res.status(503).json({ error: "not_configured" });

  const user = await хозяин(req, db);
  if (!user) return res.status(401).json({ error: "unauthorized" });

  const { data, error } = await db
    .from("wallet_ops")
    .select("id, chain, kind, amount, signature, created_at")
    .eq("user_id", user.id)
    .order("created_at", { ascending: false })
    .limit(ПРЕДЕЛ);

  if (error) return res.status(500).json({ error: "db", detail: error.message });

  res.setHeader("Cache-Control", "no-store");
  return res.status(200).json({
    ops: (data || []).map((о) => ({
      id: `op-${о.id}`,
      chain: о.chain === "ton" ? "ton" : "solana",
      kind: о.kind,
      amount: Number(о.amount) || 0,
      signature: о.signature || null,
      createdAt: о.created_at,
    })),
  });
}
