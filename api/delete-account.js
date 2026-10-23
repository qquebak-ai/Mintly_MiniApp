/* Удаление аккаунта — целиком, вместе с учётной записью.
 *
 * Из браузера стереть можно только свои строки в таблицах, и то по
 * разрешениям: сама учётная запись в auth.users анонимному ключу не
 * доступна. Она и оставалась после «удалить аккаунт» — человек уходил,
 * веря, что его нет, а в базе висели и запись, и почта, и телеграм-id, по
 * которым вход узнавал его снова.
 *
 * Поэтому удаляет сервер своим ключом: сначала всё, что человек нажил
 * (кошельки, сделки, комментарии, приглашения, аватарки), потом саму
 * учётную запись. Внешние ключи в базе стоят с каскадом, и один
 * deleteUser убрал бы почти всё сам, — но «почти» здесь мало: таблица без
 * каскада промолчит, а строки останутся. Поэтому перечисляем явно.
 *
 * Кто удаляет — решает не тело запроса, а токен сессии в заголовке:
 * подставить чужой id в json может кто угодно, подделать подписанный
 * токен — нет.
 *
 * Переменные окружения (серверные, без префикса VITE_):
 *   SUPABASE_URL              — тот же адрес, что и во VITE_SUPABASE_URL
 *   SUPABASE_SERVICE_ROLE_KEY — service_role ключ проекта Supabase
 */

import { createClient } from "@supabase/supabase-js";

const SUPABASE_URL = process.env.SUPABASE_URL;
const SERVICE_ROLE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;

/* Что удаляем и какой колонкой оно держится за человека.
 *
 * Порядок сверху вниз: сначала листья, потом то, на что они ссылаются, —
 * иначе внешний ключ не даст убрать строку, за которую ещё кто-то
 * держится. Токены идут перед профилем, потому что комментарии и чат
 * висят на токенах.
 *
 * Отсутствующая таблица — не беда: часть SQL мог быть ещё не выполнен, а
 * удалению это не мешает. Такой отказ пропускаем, остальные копим и
 * отдаём в ответе. */
const СВОЁ = [
  ["wallet_ops", "user_id"],
  ["treasury_swaps", "user_id"],
  ["trades", "user_id"],
  ["token_comments", "user_id"],
  ["token_chat", "user_id"],
  ["holder_notify", "user_id"],
  ["achievements_done", "user_id"],
  ["address_book", "owner_id"],
  ["referral_payout", "user_id"],
  ["referral_claims", "inviter"],
  ["pending_referrals", "inviter"],
  ["support_relay", "user_id"],
  ["support_messages", "user_id"],
  ["app_seeds", "user_id"],
  ["app_wallets", "user_id"],
  ["tokens", "owner_id"],
  ["profiles", "id"],
];

/* Токены, которыми торгуют другие, вместе с аккаунтом не стираются.
   Строка токена — это и страница, и дорога к сделке: без неё держатели
   не могли бы продать в приложении то, что купили, и удаление аккаунта
   становилось способом запереть их деньги. У таких токенов только
   снимается владелец. Не вышло (в базе owner_id ещё обязателен) —
   аккаунт не удаляем вовсе, пока ничего не тронуто. */
async function отвязатьТокены(admin, id) {
  const { data: свои, error } = await admin.from("tokens").select("id").eq("owner_id", id);
  if (error) return НЕТ_ТАБЛИЦЫ.has(error.code) ? null : error.message;
  const чужие = [];
  for (const т of свои || []) {
    const { count } = await admin.from("trades").select("id", { count: "exact", head: true })
      .eq("token_id", т.id).neq("user_id", id);
    if ((count || 0) > 0) чужие.push(т.id);
  }
  if (!чужие.length) return null;
  const { error: снять } = await admin.from("tokens").update({ owner_id: null }).in("id", чужие);
  return снять ? снять.message : null;
}

/* Деньги на кошельках приложения.
 *
 * Ключи от кошельков лежат только у нас (app_wallets, app_seeds), и
 * удаление аккаунта стирало их вместе с деньгами: случайное нажатие — или
 * чужая сессия — и монеты на адресах оставались навсегда без хозяина.
 * Теперь, пока человек не записал фразу (проверка в api/wallet-seed.js),
 * аккаунт с деньгами не удаляется: сперва вывести. Не смогли спросить
 * сеть — считаем, что деньги есть: ошибиться в эту сторону безопаснее. */
const RPC_SOL = process.env.SOLANA_RPC || "https://api.mainnet-beta.solana.com";
const TONAPI = process.env.TON_TESTNET === "1" ? "https://testnet.tonapi.io" : "https://tonapi.io";
const TONAPI_KEY = process.env.TONAPI_KEY || "";

async function rpcSol(method, params) {
  const r = await fetch(RPC_SOL, {
    method: "POST", headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ jsonrpc: "2.0", id: 1, method, params }),
    signal: AbortSignal.timeout(8000),
  });
  const j = await r.json();
  if (j.error) throw new Error(j.error.message || "rpc");
  return j.result;
}

async function tonapi(путь) {
  const r = await fetch(`${TONAPI}${путь}`, {
    headers: TONAPI_KEY ? { Authorization: `Bearer ${TONAPI_KEY}` } : {},
    signal: AbortSignal.timeout(8000),
  });
  if (r.status === 404) return null;
  if (!r.ok) throw new Error(`tonapi ${r.status}`);
  return r.json();
}

async function деньгиНаКошельках(admin, id) {
  const { data: кошельки } = await admin.from("app_wallets").select("chain, address").eq("user_id", id);
  const где = [];
  for (const к of кошельки || []) {
    try {
      if (к.chain === "solana") {
        const баланс = await rpcSol("getBalance", [к.address]);
        let есть = Number((баланс && баланс.value) || 0) > 1_000_000;
        for (const programId of ["TokenkegQfeZyiNwAJbNbGKPFXCWuBvf9Ss623VQ5DA", "TokenzQdBNbLqP5VEhdkAS6EPFLC1PHnBqCXEpPxuEb"]) {
          if (есть) break;
          const счета = await rpcSol("getTokenAccountsByOwner", [к.address, { programId }, { encoding: "jsonParsed" }]);
          есть = ((счета && счета.value) || []).some((с) => Number(с?.account?.data?.parsed?.info?.tokenAmount?.amount || 0) > 0);
        }
        if (есть) где.push("solana");
      } else if (к.chain === "ton") {
        const счёт = await tonapi(`/v2/accounts/${encodeURIComponent(к.address)}`);
        let есть = Number((счёт && счёт.balance) || 0) > 50_000_000;
        if (!есть) {
          const жетоны = await tonapi(`/v2/accounts/${encodeURIComponent(к.address)}/jettons`);
          есть = ((жетоны && жетоны.balances) || []).some((ж) => BigInt(ж.balance || "0") > 0n);
        }
        if (есть) где.push("ton");
      } else if (к.chain === "evm") {
        const { СЕТИ } = await import("./wallet-evm.js");
        for (const [сеть, с] of Object.entries(СЕТИ)) {
          const r = await fetch(с.rpc, {
            method: "POST", headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ jsonrpc: "2.0", id: 1, method: "eth_getBalance", params: [к.address, "latest"] }),
            signal: AbortSignal.timeout(8000),
          });
          const j = await r.json();
          if (j.error) throw new Error(j.error.message || "rpc");
          if (BigInt(j.result || "0x0") > 100_000_000_000_000n) { где.push(сеть); break; }
        }
      }
    } catch (e) {
      console.warn("[delete-account] остаток не проверить:", к.chain, e && e.message);
      где.push(к.chain);
    }
  }
  return где;
}

// Нет такой таблицы или колонки — база отвечает этими кодами. Для нас
// это «удалять нечего», а не поломка.
const НЕТ_ТАБЛИЦЫ = new Set(["42P01", "42703", "PGRST205", "PGRST204"]);

async function убратьКартинки(admin, id) {
  // Аватарки и логотипы лежат в папке с именем человека. Складов два:
  // куда попала картинка, зависит от того, какой из них был доступен в
  // тот день (см. загрузку логотипа в приложении).
  for (const склад of ["avatars", "token-assets"]) {
    try {
      const { data, error } = await admin.storage.from(склад).list(id, { limit: 1000 });
      if (error || !data || !data.length) continue;
      await admin.storage.from(склад).remove(data.map((ф) => `${id}/${ф.name}`));
    } catch {
      // Склада может не быть вовсе — тогда и убирать нечего.
    }
  }
}

// Всё, что держится за одну учётку, и сама учётка.
async function удалитьЦеликом(admin, id) {
  const беды = [];
  for (const [таблица, колонка] of СВОЁ) {
    const { error } = await admin.from(таблица).delete().eq(колонка, id);
    if (error && !НЕТ_ТАБЛИЦЫ.has(error.code)) {
      console.error(`[delete-account] ${таблица}.${колонка}:`, error.message);
      беды.push(`${таблица}: ${error.message}`);
    }
  }
  // Подписки держатся двумя концами — и тем, и другим.
  for (const колонка of ["follower_id", "following_id"]) {
    const { error } = await admin.from("follows").delete().eq(колонка, id);
    if (error && !НЕТ_ТАБЛИЦЫ.has(error.code)) беды.push(`follows: ${error.message}`);
  }
  // Кого он привёл — остаётся с ними, но без ссылки на него.
  await admin.from("profiles").update({ invited_by: null }).eq("invited_by", id);

  await убратьКартинки(admin, id);

  const { error: удалить } = await admin.auth.admin.deleteUser(id);
  if (удалить && !/not.?found/i.test(удалить.message || "")) {
    console.error("[delete-account] auth.users:", удалить.message);
    return { беды, ошибка: удалить.message };
  }
  return { беды, ошибка: null };

}

export default async function handler(req, res) {
  if (req.method !== "POST") {
    res.setHeader("Allow", "POST");
    return res.status(405).json({ error: "method_not_allowed" });
  }
  if (!SUPABASE_URL || !SERVICE_ROLE_KEY) {
    return res.status(500).json({ error: "server_not_configured" });
  }

  const заголовок = req.headers.authorization || "";
  const токен = заголовок.startsWith("Bearer ") ? заголовок.slice(7).trim() : "";
  if (!токен) return res.status(401).json({ error: "no_session" });

  const admin = createClient(SUPABASE_URL, SERVICE_ROLE_KEY, { auth: { persistSession: false } });

  const { data: сессия, error: authErr } = await admin.auth.getUser(токен);
  const человек = сессия && сессия.user;
  if (authErr || !человек) return res.status(401).json({ error: "bad_session" });
  const id = человек.id;

  /* Удаляем не одну учётку, а всё, что связано с этим человеком: у
     аккаунта из Telegram могли остаться вторые, пустые учётки — со
     служебным адресом tg<id>@telegram.local или с тем же telegram_id.
     Оставь их — и следующий вход узнал бы человека по ним. */
  const { data: свой } = await admin.from("profiles").select("telegram_id").eq("id", id).maybeSingle();
  const тг = (свой && свой.telegram_id) || (человек.user_metadata && человек.user_metadata.telegram_id) || null;
  const все = new Set([id]);
  if (тг) {
    const служебный = `tg${тг}@telegram.local`;
    const { data: связанные } = await admin.from("profiles").select("id")
      .or(`telegram_id.eq.${тг},email.eq."${служебный}"`).limit(20);
    for (const р of связанные || []) все.add(р.id);
    // Учётка без профиля видна только в самой авторизации.
    for (let стр = 1; стр <= 5; стр++) {
      const { data: список, error } = await admin.auth.admin.listUsers({ page: стр, perPage: 1000 });
      if (error || !список || !список.users || !список.users.length) break;
      for (const у of список.users) {
        const мета = у.user_metadata || {};
        if (у.email === служебный || String(мета.telegram_id || "") === String(тг)) все.add(у.id);
      }
      if (список.users.length < 1000) break;
    }
  }

  // Фраза записана — деньги человек вернёт по ней в любом кошельке.
  // Не записана — с деньгами на кошельках аккаунт не удаляем.
  for (const кто of все) {
    const { data: фраза } = await admin.from("app_seeds").select("confirmed_at").eq("user_id", кто).maybeSingle();
    if (фраза && фраза.confirmed_at) continue;
    const где = await деньгиНаКошельках(admin, кто);
    if (где.length) return res.status(409).json({ error: "wallet_not_empty", chains: [...new Set(где)] });
  }

  for (const кто of все) {
    const беда = await отвязатьТокены(admin, кто);
    if (беда) {
      console.error("[delete-account] токены не отвязать:", беда);
      return res.status(409).json({ error: "tokens_have_holders" });
    }
  }

  const беды = [];
  // Отложенное приглашение держится за сам telegram_id — без него новый
  // аккаунт на этом Telegram получил бы старого пригласившего.
  if (тг) await admin.from("pending_referrals").delete().eq("telegram_id", тг);
  for (const кто of все) {
    const итог = await удалитьЦеликом(admin, кто);
    if (итог.беды.length) беды.push(...итог.беды);
    if (итог.ошибка && кто === id) {
      return res.status(500).json({ error: "delete_failed", detail: итог.ошибка.slice(0, 200) });
    }
  }

  // Учётной записи больше нет — значит аккаунта нет нигде. Недоделки по
  // отдельным таблицам возвращаем, чтобы их было видно в журнале, но
  // удаление состоялось.
  return res.status(200).json({ ok: true, ...(беды.length ? { warnings: беды.slice(0, 8) } : {}) });
}
