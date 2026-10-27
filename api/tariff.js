/* Тарифы Mintly — как подписки у нейросетей: Free, Pro и Turbo.
 *
 * GET  ?action=state       — свой тариф и срок, цены
 * POST ?action=buy {plan}  — оплатить месяц (SOL с кошелька приложения)
 *
 * Что даёт тариф — в api/_speed.js: Pro снимает наценку за «Быстро» и
 * вдвое режет за «Молнию», Turbo снимает её совсем и ведёт «Молнию»
 * самой короткой дорогой. Оплата — переводом на кошелёк комиссии
 * площадки (wallet-solana, action=tariff-pay, только изнутри), сумма в
 * SOL — по курсу на миг оплаты. Повторная оплата продлевает срок.
 */
import { createClient } from "@supabase/supabase-js";
import { ТАРИФЫ } from "./_speed.js";
import { ВНУТРЕННИЙ_ВХОД, ответВнутри } from "./_внутри.js";
import { забытьТариф } from "./_tariff.js";

const SUPABASE_URL = process.env.SUPABASE_URL;
const SERVICE_ROLE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;
const МЕСЯЦ_МС = 30 * 24 * 60 * 60 * 1000;

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
  const действие = String((req.query && req.query.action) || "state");
  try {
    const user = await хозяин(req, db);
    if (!user) return res.status(401).json({ error: "unauthorized" });
    const { data: строка } = await db.from("user_tariffs").select("plan, until").eq("user_id", user.id).maybeSingle();
    const действует = строка && строка.until && new Date(строка.until).getTime() > Date.now();
    const цены = Object.fromEntries(Object.entries(ТАРИФЫ).map(([к, т]) => [к, т.цена]));

    if (действие === "state") {
      return res.status(200).json({ plan: действует ? строка.plan : "free", until: действует ? строка.until : null, prices: цены });
    }
    if (req.method !== "POST" || действие !== "buy") return res.status(400).json({ error: "unknown_action" });

    const тело = typeof req.body === "string" ? JSON.parse(req.body || "{}") : (req.body || {});
    const план = String(тело.plan || "");
    if (!["pro", "turbo"].includes(план)) return res.status(400).json({ error: "bad_plan" });
    const { ценаМонеты } = await import("./market-rates.js");
    const курс = await ценаМонеты("sol");
    if (!(курс > 0)) return res.status(503).json({ error: "no_rate" });
    const sol = Math.ceil((ТАРИФЫ[план].цена / курс) * 1e4) / 1e4;

    const { default: кошелёк } = await import("./wallet-solana.js");
    const ответ = ответВнутри();
    await кошелёк({
      method: "POST", url: "/api/wallet-solana?action=tariff-pay", query: { action: "tariff-pay" },
      body: { amount: sol, requestKey: String(тело.requestKey || "").slice(0, 64) || null },
      headers: { "x-forwarded-for": String(req.headers["x-forwarded-for"] || "") }, [ВНУТРЕННИЙ_ВХОД]: user,
    }, ответ);
    if (ответ.код >= 300 || !ответ.тело || ответ.тело.error) {
      return res.status(ответ.код >= 300 ? ответ.код : 400).json(ответ.тело || { error: "payment_failed" });
    }
    // Продлеваем от конца действующего срока того же тарифа, иначе — с сегодня.
    const от = действует && строка.plan === план ? new Date(строка.until).getTime() : Date.now();
    const до = new Date(от + МЕСЯЦ_МС).toISOString();
    await db.from("user_tariffs").upsert({ user_id: user.id, plan: план, until: до, updated_at: new Date().toISOString() });
    забытьТариф(user.id);
    return res.status(200).json({ ok: true, plan: план, until: до, paid: sol, signature: ответ.тело.signature });
  } catch (e) {
    return res.status(500).json({ error: "server", detail: String((e && e.message) || e).slice(0, 160) });
  }
}
