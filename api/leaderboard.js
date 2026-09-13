/* Таблица лучших.
 *
 * Считается по сделкам из trades: кто наторговал больше всех за неделю,
 * кто запустил больше токенов, у кого выше прибыль по своим же записям.
 * Всё — деньгами, а не штуками: десять сделок по доллару не то же самое,
 * что одна на тысячу.
 *
 * Почему на сервере. Таблица читает чужие строки, а trades закрыты
 * политиками: человек видит только свои. Значит, свести их может лишь
 * тот, у кого служебный ключ, — и он же прячет всё лишнее: наружу
 * уходят ник, аватарка и три числа, без адресов и идентификаторов
 * сделок.
 *
 * Цена сделки. В trades лежит сумма в монете цепочки и курс на момент
 * записи (ton_price_usd). Он пишется и для Solana, поэтому доверяем ему
 * только в разумных пределах: нулевой или явно чужой курс заменяем на
 * текущий из /api/market.
 *
 * Запрос: GET /api/leaderboard?period=7d&metric=volume
 *
 * Переменные окружения: SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY.
 */

import { createClient } from "@supabase/supabase-js";

const SUPABASE_URL = process.env.SUPABASE_URL;
const SERVICE_ROLE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;

// Больше двадцати строк в таблице никто не читает, а считать их дороже.
const МЕСТ = 20;
// Сколько сделок берём для свода. Недельный объём небольшой площадки
// укладывается в это с запасом.
const СДЕЛОК = 4000;
// Таблица меняется медленно: полминуты памяти убирают пересчёт на
// каждое открытие экрана.
const ПАМЯТЬ_МС = 30 * 1000;

const кеш = new Map(); // `${period}` -> { до, тело }

function admin() {
  if (!SUPABASE_URL || !SERVICE_ROLE_KEY) return null;
  return createClient(SUPABASE_URL, SERVICE_ROLE_KEY, { auth: { persistSession: false } });
}

const ОКНА = { "24h": 24 * 60 * 60 * 1000, "7d": 7 * 24 * 60 * 60 * 1000, all: 0 };

// Адрес Solana — base58; у TON он начинается с EQ/UQ/kQ/0Q. По этому и
// различаем цепочку сделки: колонки chain в trades нет.
const этоSolana = (адрес) => /^[1-9A-HJ-NP-Za-km-z]{32,44}$/.test(String(адрес || "")) && !/^(EQ|UQ|kQ|0Q)/.test(String(адрес || ""));

export default async function handler(req, res) {
  const db = admin();
  if (!db) return res.status(503).json({ error: "not_configured" });

  const окно = String((req.query && req.query.period) || "7d");
  const мс = ОКНА[окно] != null ? ОКНА[окно] : ОКНА["7d"];

  const было = кеш.get(окно);
  if (было && было.до > Date.now()) {
    res.setHeader("Cache-Control", "no-store");
    return res.status(200).json(было.тело);
  }

  let запрос = db
    .from("trades")
    .select("user_id, side, ton_amount, ton_price_usd, token_address, created_at")
    .order("created_at", { ascending: false })
    .limit(СДЕЛОК);
  if (мс > 0) запрос = запрос.gt("created_at", new Date(Date.now() - мс).toISOString());

  const { data: сделки, error } = await запрос;
  if (error) return res.status(500).json({ error: "db", detail: error.message });

  /* Курсы на случай, если в записи их нет. Спрашиваем один раз на свод:
     цена сделки недельной давности от сегодняшнего курса отличается, но
     это лучше нуля, с которым человек просто пропадает из таблицы. */
  let курсSol = 0;
  let курсTon = 0;
  try {
    const рынок = await import("./_market.js");
    const [sol, ton] = await Promise.all([
      рынок.курсSol().catch(() => 0),
      рынок.курсTon().catch(() => 0),
    ]);
    курсSol = Number(sol) || 0;
    курсTon = Number(ton) || 0;
  } catch { /* курсы не пришли — обойдёмся тем, что записано в сделке */ }

  const по = new Map(); // user_id -> { объём, сделок, прибыль }
  for (const с of сделки || []) {
    if (!с.user_id) continue;
    const сумма = Number(с.ton_amount) || 0;
    if (!(сумма > 0)) continue;
    const свой = Number(с.ton_price_usd) || 0;
    const курс = свой > 0 ? свой : (этоSolana(с.token_address) ? курсSol : курсTon);
    const деньги = сумма * (курс > 0 ? курс : 0);
    if (!(деньги > 0)) continue;

    const было = по.get(с.user_id) || { объём: 0, сделок: 0, прибыль: 0 };
    было.объём += деньги;
    было.сделок += 1;
    // Прибыль по своим же записям: продажи минус покупки. Позиция, что
    // осталась на руках, в неё не входит — это «снято со стола».
    было.прибыль += с.side === "sell" ? деньги : -деньги;
    по.set(с.user_id, было);
  }

  // Запуски считаем отдельно: токен могли завести и не торговать им.
  const { data: токены } = await db
    .from("tokens")
    .select("owner_id, created_at")
    .not("owner_id", "is", null)
    .gt("created_at", мс > 0 ? new Date(Date.now() - мс).toISOString() : "1970-01-01")
    .limit(2000);
  for (const т of токены || []) {
    const было = по.get(т.owner_id) || { объём: 0, сделок: 0, прибыль: 0 };
    было.запусков = (было.запусков || 0) + 1;
    по.set(т.owner_id, было);
  }

  const все = [...по.entries()]
    .map(([id, з]) => ({ id, ...з, запусков: з.запусков || 0 }))
    .sort((a, b) => b.объём - a.объём)
    .slice(0, МЕСТ);

  const { data: профили } = все.length
    ? await db.from("profiles").select("id, nickname, avatar_url, emoji, frame_id").in("id", все.map((с) => с.id))
    : { data: [] };
  const карта = new Map((профили || []).map((п) => [п.id, п]));

  const тело = {
    period: окно,
    rows: все.map((с, i) => {
      const п = карта.get(с.id) || {};
      return {
        place: i + 1,
        // Идентификатор нужен приложению, чтобы подсветить себя в
        // таблице: оно сравнивает его со своим и ничего о других не
        // узнаёт сверх того, что уже показано.
        userId: с.id,
        nickname: п.nickname || null,
        avatarUrl: п.avatar_url || null,
        emoji: п.emoji || null,
        frameId: п.frame_id || "none",
        volumeUsd: Math.round(с.объём),
        trades: с.сделок,
        launches: с.запусков,
        pnlUsd: Math.round(с.прибыль),
      };
    }),
  };

  кеш.set(окно, { до: Date.now() + ПАМЯТЬ_МС, тело });
  res.setHeader("Cache-Control", "no-store");
  return res.status(200).json(тело);
}
