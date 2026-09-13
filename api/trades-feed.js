/* Лента сделок площадки.
 *
 * Бегущая строка в мемпаде показывала покупки с чужих бирж — их отдавал
 * агрегатор. Теперь в мемпаде только свои токены, и лента должна быть о
 * них же: кто и сколько только что купил или продал здесь.
 *
 * Почему на сервере. Таблица trades закрыта политиками: человек видит
 * только свои строки. Свести их может лишь служебный ключ — он же прячет
 * лишнее: наружу уходят тикер, сумма, время и адрес кошелька (тот самый,
 * что и так виден в списке держателей), без идентификаторов людей.
 *
 * Запрос: GET /api/trades-feed?limit=40
 *
 * Переменные окружения: SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY.
 */

import { createClient } from "@supabase/supabase-js";

const SUPABASE_URL = process.env.SUPABASE_URL;
const SERVICE_ROLE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;

// Лента показывает по одной сделке за раз и меняет их раз в пару секунд:
// полусотни строк хватает на пару минут показа.
const СТРОК = 50;
// Сделки идут поштучно, а лента и так листает медленно: пять секунд
// памяти снимают десяток одинаковых запросов с открытых экранов.
const ПАМЯТЬ_МС = 5000;

let кеш = null; // { до, тело }

function admin() {
  if (!SUPABASE_URL || !SERVICE_ROLE_KEY) return null;
  return createClient(SUPABASE_URL, SERVICE_ROLE_KEY, { auth: { persistSession: false } });
}

export default async function handler(req, res) {
  const db = admin();
  if (!db) return res.status(503).json({ error: "not_configured" });

  if (кеш && кеш.до > Date.now()) {
    res.setHeader("Cache-Control", "no-store");
    return res.status(200).json(кеш.тело);
  }

  const предел = Math.min(СТРОК, Math.max(5, Number((req.query && req.query.limit) || СТРОК) || СТРОК));

  /* Обмены сюда не попадают: side «swap» — это перекладывание своих
     монет, а не сделка по токену, и в ленте покупок ему нечего делать. */
  const { data: сделки, error } = await db
    .from("trades")
    .select("id, user_id, token_id, token_address, ticker, side, ton_amount, ton_price_usd, created_at")
    .in("side", ["buy", "sell"])
    .not("token_address", "is", null)
    .order("created_at", { ascending: false })
    .limit(предел);
  if (error) return res.status(500).json({ error: "db", detail: error.message });

  const адреса = [...new Set((сделки || []).map((с) => с.token_address).filter(Boolean))];
  const { data: токены } = адреса.length
    ? await db.from("tokens").select("id, address, ticker, chain, logo_url").in("address", адреса)
    : { data: [] };
  const поАдресу = new Map((токены || []).map((т) => [т.address, т]));

  /* Кошелёк покупателя — тот же, что виден в списке держателей токена:
     новой огласки тут нет, а строка «кто-то купил» без «кто» читается
     как выдуманная. Идентификатор человека наружу не идёт. */
  const люди = [...new Set((сделки || []).map((с) => с.user_id).filter(Boolean))];
  const { data: кошельки } = люди.length
    ? await db.from("app_wallets").select("user_id, address").in("user_id", люди)
    : { data: [] };
  const поЧеловеку = new Map((кошельки || []).map((к) => [к.user_id, к.address]));

  const тело = {
    rows: (сделки || []).map((с) => {
      const т = поАдресу.get(с.token_address) || null;
      const сумма = Number(с.ton_amount) || 0;
      const курс = Number(с.ton_price_usd) || 0;
      return {
        id: String(с.id),
        kind: с.side === "sell" ? "sell" : "buy",
        at: с.created_at,
        tokenId: т ? т.id : (с.token_id || null),
        address: с.token_address,
        ticker: (т && т.ticker) || с.ticker || null,
        chain: (т && т.chain) || null,
        logoUrl: (т && т.logo_url) || null,
        // Сумма в монете цепочки и её же оценка в долларах по курсу на
        // момент сделки: пересчитывать задним числом нельзя, цифра
        // относится к тому мгновению.
        amount: сумма,
        usd: курс > 0 ? сумма * курс : 0,
        from: поЧеловеку.get(с.user_id) || null,
      };
    }),
  };

  кеш = { до: Date.now() + ПАМЯТЬ_МС, тело };
  res.setHeader("Cache-Control", "no-store");
  return res.status(200).json(тело);
}
