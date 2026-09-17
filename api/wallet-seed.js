/* Фраза кошелька: показать один раз и запомнить, что её записали.
 *
 * Кошелёк у человека появляется сам, вместе с аккаунтом, — и это плохо
 * ровно тем, что он появляется молча: деньги есть, а записи из двадцати
 * четырёх слов, по которой их можно вернуть, человек в глаза не видел.
 * Здесь эта запись показывается: один экран со словами, потом проверка,
 * и только после неё кошелёк считается заведённым.
 *
 * Что здесь важно.
 *   — Слова отдаются только их владельцу и только по длинной дороге: с
 *     предупреждением и галочкой. Бумажка теряется, и посмотреть фразу
 *     заново человек имеет право — но не мимоходом.
 *   — В базе фраза остаётся зашифрованной, как и была: сервер
 *     расшифровывает её на время одного ответа и нигде не сохраняет.
 *   — Проверку слов делает сам экран: это память человека, а не пароль,
 *     и обманывать здесь он может только себя.
 *
 * Переменные окружения: SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY,
 * APP_WALLET_KEY (те же, что у кошельков).
 */

import crypto from "node:crypto";
import { createClient } from "@supabase/supabase-js";
import { фразаПользователя, новаяФраза } from "./_seed.js";

const SUPABASE_URL = process.env.SUPABASE_URL;
const SERVICE_ROLE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;

function admin() {
  if (!SUPABASE_URL || !SERVICE_ROLE_KEY) return null;
  return createClient(SUPABASE_URL, SERVICE_ROLE_KEY, { auth: { persistSession: false } });
}

function разобратьКлюч(raw) {
  const s = String(raw || "").trim();
  if (!s) return null;
  try {
    const b = /^[0-9a-f]{64}$/i.test(s) ? Buffer.from(s, "hex") : Buffer.from(s, "base64");
    return b.length === 32 ? b : null;
  } catch {
    return null;
  }
}

const меткаКлюча = (ключ) => crypto.createHash("sha256").update(ключ).digest("hex").slice(0, 8);

// Тот же набор ключей, что у кошельков: текущий и прежний, чтобы смена
// APP_WALLET_KEY не отрезала старые записи.
function ключи() {
  const текущий = разобратьКлюч(process.env.APP_WALLET_KEY);
  if (!текущий) return null;
  const прежний = разобратьКлюч(process.env.APP_WALLET_KEY_OLD);
  const набор = new Map([[меткаКлюча(текущий), текущий]]);
  if (прежний) набор.set(меткаКлюча(прежний), прежний);
  return { текущий, метка: меткаКлюча(текущий), набор };
}

async function хозяин(req, db) {
  const заголовок = req.headers.authorization || "";
  const токен = заголовок.startsWith("Bearer ") ? заголовок.slice(7).trim() : "";
  if (!токен) return null;
  const { data, error } = await db.auth.getUser(токен);
  if (error || !data || !data.user) return null;
  return data.user;
}

/* Что с фразой у человека.
 *
 * «Пущен в работу» и «записана» — разные вещи. Кошелёк на сервере
 * появляется сам при первом обращении к нему, поэтому наличия строки мало.
 * Начало отсчитываем от того, что человек сам отложил запись (revealed_at
 * ставится действием «пропустить»), конец — от пройденной проверки
 * (confirmed_at). Один лишь показ слов не значит ничего: человек мог
 * ошибиться в проверке и уйти, и тогда при следующем запуске его снова
 * встречает «Создать кошелёк» — уже со свежей фразой.
 * Колонок может ещё не быть — тогда считаем, что ни того, ни другого. */
async function записана(db, id) {
  const { data, error } = await db
    .from("app_seeds").select("user_id, confirmed_at, revealed_at")
    .eq("user_id", id).maybeSingle();
  if (error) return { есть: false, начато: false, готово: false };
  return {
    есть: !!data,
    начато: !!(data && data.revealed_at),
    готово: !!(data && data.confirmed_at),
    когда: (data && data.confirmed_at) || null,
  };
}

export default async function handler(req, res) {
  const db = admin();
  const набор = ключи();
  const действие = String((req.query && req.query.action) || "state");

  if (!db || !набор) return res.status(503).json({ error: "not_configured" });

  const user = await хозяин(req, db);
  if (!user) return res.status(401).json({ error: "unauthorized" });

  try {
    const состояние = await записана(db, user.id);

    if (действие === "state") {
      res.setHeader("Cache-Control", "no-store");
      return res.status(200).json({
        ready: состояние.готово,
        started: состояние.начато,
        exists: состояние.есть,
        confirmedAt: состояние.когда,
      });
    }

    if (req.method !== "POST") {
      res.setHeader("Allow", "POST");
      return res.status(405).json({ error: "method_not_allowed" });
    }

    if (действие === "reveal") {
      /* Показать фразу можно и после записи: бумажка теряется, а
         восстанавливать кошелёк по ней когда-нибудь придётся. Дорога к
         ней одна и длинная — через предупреждение с галочкой, — и это
         единственное, что стоит между открытой сессией и деньгами.
      /* Первый показ — это и есть «создать кошелёк»: выдаём свежую фразу,
         а не ту, что завелась сама при первом обращении к кошельку. Ту
         человек не видел и не выбирал, и привязывать к ней его деньги
         неправильно. Кошельки, выведенные из прежней записи, убираем —
         иначе слова на экране не открывали бы то, что за ними стоит.
         Дальше (вход из строки «Секретная фраза») отдаём как есть:
         там за фразой уже могут лежать деньги. */
      let фраза;
      if (!состояние.начато) {
        фраза = await новаяФраза(db, user, набор);
        const { error: убрать } = await db.from("app_wallets").delete().eq("user_id", user.id);
        if (убрать) console.error("[wallet-seed] прежние кошельки не убраны:", убрать.message);
      } else {
        фраза = await фразаПользователя(db, user, набор);
      }
      res.setHeader("Cache-Control", "no-store");
      return res.status(200).json({ words: String(фраза).trim().split(/\s+/) });
    }

    if (действие === "skip") {
      /* «Пропустить» — осознанный выбор: кошелёк идёт в работу, а запись
         откладывается, и о ней напоминает красная точка в меню. Пока его
         не сделали, показ слов заводит фразу заново — ошибиться в
         проверке и уйти безопасно, деньгам ещё неоткуда взяться. */
      const { error } = await db
        .from("app_seeds").update({ revealed_at: new Date().toISOString() })
        .eq("user_id", user.id).is("revealed_at", null);
      if (error) {
        console.error("[wallet-seed] отметка «отложено» не легла:", error.message);
        return res.status(500).json({ error: "skip_failed", detail: error.message.slice(0, 160) });
      }
      return res.status(200).json({ ok: true });
    }

    if (действие === "confirm") {
      // Проверку слов делает экран: это память человека, а не пароль.
      // Серверу остаётся запомнить, что копия сделана.
      const { error } = await db
        .from("app_seeds")
        .update({ confirmed_at: new Date().toISOString(), revealed_at: new Date().toISOString() })
        .eq("user_id", user.id);
      if (error) {
        console.error("[wallet-seed] отметка не легла:", error.message);
        return res.status(500).json({ error: "confirm_failed", detail: error.message.slice(0, 160) });
      }
      return res.status(200).json({ ok: true });
    }

    return res.status(400).json({ error: "bad_action" });
  } catch (e) {
    console.error("[wallet-seed]", e && e.message);
    return res.status(500).json({ error: "seed_failed", detail: String((e && e.message) || "").slice(0, 160) });
  }
}
