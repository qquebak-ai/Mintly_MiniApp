/* Кто стоит за адресом кошелька.
 *
 * В списке держателей раньше были одни адреса — набор букв, за которым
 * не видно, что половина этих кошельков заведена прямо здесь, и у их
 * хозяев есть имя и лицо. Ручка переводит адреса в профили: приложение
 * присылает адреса из списка, получает ник и аватарку тех, кого знает, и
 * оставляет адрес для остальных.
 *
 * Наружу уходит только то, что человек и так показывает о себе всем:
 * ник и аватарка. Ни почты, ни идентификатора учётной записи здесь нет —
 * по ним нашлось бы куда больше, чем «вот чей это кошелёк».
 *
 * Запрос: GET /api/wallet-owners?chain=solana&addresses=<через запятую>
 *
 * Переменные окружения: SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY.
 */

import { createClient } from "@supabase/supabase-js";

const SUPABASE_URL = process.env.SUPABASE_URL;
const SERVICE_ROLE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;

// Список крупнейших держателей — двадцать строк; больше за раз спрашивать
// незачем, а запрос в базу с сотней адресов стоит заметно дороже.
const ПРЕДЕЛ = 24;

// Пары «адрес — профиль» меняются раз в жизни кошелька, а карточку токена
// открывают часто. Минуты памяти хватает, чтобы список держателей не
// дёргал базу при каждом переключении вкладки.
const ПАМЯТЬ_МС = 60 * 1000;
const кеш = new Map(); // адрес -> { до, профиль | null }

function admin() {
  if (!SUPABASE_URL || !SERVICE_ROLE_KEY) return null;
  return createClient(SUPABASE_URL, SERVICE_ROLE_KEY, { auth: { persistSession: false } });
}

export default async function handler(req, res) {
  const db = admin();
  if (!db) return res.status(503).json({ error: "not_configured" });

  const сеть = String((req.query && req.query.chain) || "solana") === "ton" ? "ton" : "solana";
  const строка = String((req.query && req.query.addresses) || "");
  // Адреса приходят из чужой сети, поэтому пропускаем только те, что
  // похожи на адрес: в запрос к базе не должно попасть ничего лишнего.
  const адреса = [...new Set(
    строка.split(",")
      .map((а) => а.trim())
      .filter((а) => /^[A-Za-z0-9_:.-]{32,70}$/.test(а)),
  )].slice(0, ПРЕДЕЛ);
  if (!адреса.length) return res.status(200).json({ owners: {} });

  const сейчас = Date.now();
  const итог = {};
  const спросить = [];
  for (const а of адреса) {
    const было = кеш.get(`${сеть}|${а}`);
    if (было && было.до > сейчас) {
      if (было.профиль) итог[а] = было.профиль;
    } else {
      спросить.push(а);
    }
  }

  if (спросить.length) {
    const { data: кошельки, error } = await db
      .from("app_wallets")
      .select("user_id, address")
      .eq("chain", сеть)
      .in("address", спросить);
    if (error) return res.status(500).json({ error: "db", detail: error.message });

    const поПользователю = new Map();
    for (const к of кошельки || []) поПользователю.set(к.user_id, к.address);

    let профили = [];
    if (поПользователю.size) {
      const { data } = await db
        .from("profiles")
        .select("id, nickname, avatar_url, emoji")
        .in("id", [...поПользователю.keys()]);
      профили = data || [];
    }

    const поАдресу = new Map();
    for (const п of профили) {
      const адрес = поПользователю.get(п.id);
      if (!адрес) continue;
      поАдресу.set(адрес, {
        nickname: п.nickname || null,
        avatarUrl: п.avatar_url || null,
        emoji: п.emoji || null,
      });
    }

    for (const а of спросить) {
      const профиль = поАдресу.get(а) || null;
      // Незнакомые адреса тоже помним: иначе каждый чужой кошелёк в
      // списке снова и снова ходил бы в базу ни за чем.
      кеш.set(`${сеть}|${а}`, { до: сейчас + ПАМЯТЬ_МС, профиль });
      if (профиль) итог[а] = профиль;
    }

    if (кеш.size > 5000) {
      for (const [к, з] of кеш) if (з.до <= сейчас) кеш.delete(к);
    }
  }

  res.setHeader("Cache-Control", "no-store");
  return res.status(200).json({ owners: итог });
}
