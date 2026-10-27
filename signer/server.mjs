/* Служба подписи внутренних кошельков.
 *
 * Зачем она отдельно. Пока ключ площадки лежит в переменных Vercel, он
 * лежит там же, где доступ к базе: одна утечка окружения открывает и
 * зашифрованные ключи, и ключ от них. Эта служба разрывает связку —
 * ключ живёт только здесь, на своём сервере, а Vercel умеет лишь
 * попросить «подпиши вот это» и не может ни прочитать ключ, ни увезти
 * его.
 *
 * Что она проверяет сама. Всё, что и приложение: транзакцию разбирает
 * тот же api/_txguard.js, плательщиком должен быть владелец ключа, и
 * есть свой независимый потолок перевода — просьба с завышенным
 * потолком обрезается до него. Служба не верит вызывающему: он тоже
 * может оказаться взломанным.
 *
 * Чего она не делает: не ходит в сеть Solana, не знает RPC и не
 * отправляет транзакции. Подписала — вернула байты, и всё.
 *
 * Запуск (см. README.md рядом):
 *   APP_WALLET_KEY=... SIGNER_TOKEN=... node server.mjs
 *
 * Слушает только localhost: наружу её выставляет либо туннель, либо
 * обратный прокси с TLS, но никогда — открытый порт.
 */

import http from "node:http";
import crypto from "node:crypto";
import { Keypair, Transaction, VersionedTransaction } from "@solana/web3.js";
import { проверитьТранзакцию, ДЕЛА } from "../api/_txguard.js";

const ПОРТ = Number(process.env.PORT || 8899);
const ХОСТ = process.env.HOST || "127.0.0.1";
const ТОКЕН = (process.env.SIGNER_TOKEN || "").trim();
const КРИВАЯ = (process.env.SOLANA_CURVE_PROGRAM || "").trim();
// Свой потолок, независимый от того, что попросил вызывающий. Больше
// этого за одну транзакцию не уходит никогда — сколько бы ни просили.
const ПОТОЛОК = Math.round(Number(process.env.SIGNER_MAX_SOL || 5) * 1e9);

function разобратьКлюч(raw) {
  const s = String(raw || "").trim();
  if (!s) return null;
  const b = /^[0-9a-f]{64}$/i.test(s) ? Buffer.from(s, "hex") : Buffer.from(s, "base64");
  return b.length === 32 ? b : null;
}

const меткаКлюча = (k) => crypto.createHash("sha256").update(k).digest("hex").slice(0, 8);

const ТЕКУЩИЙ = разобратьКлюч(process.env.APP_WALLET_KEY);
const ПРЕЖНИЙ = разобратьКлюч(process.env.APP_WALLET_KEY_OLD);
if (!ТЕКУЩИЙ) { console.error("нет APP_WALLET_KEY"); process.exit(1); }
if (!ТОКЕН || ТОКЕН.length < 24) { console.error("нет SIGNER_TOKEN (нужен длинный)"); process.exit(1); }

const НАБОР = new Map([[меткаКлюча(ТЕКУЩИЙ), ТЕКУЩИЙ]]);
if (ПРЕЖНИЙ) НАБОР.set(меткаКлюча(ПРЕЖНИЙ), ПРЕЖНИЙ);

function расшифровать(строка, ключ, владелец) {
  const b = Buffer.from(String(строка), "base64");
  const шифр = crypto.createDecipheriv("aes-256-gcm", ключ, b.subarray(0, 12));
  шифр.setAuthTag(b.subarray(12, 28));
  if (владелец) шифр.setAAD(Buffer.from(String(владелец)));
  return Buffer.concat([шифр.update(b.subarray(28)), шифр.final()]);
}

function ключКошелька({ secret, key_id, user_id }) {
  const порядок = key_id && НАБОР.has(key_id) ? [НАБОР.get(key_id)] : [...НАБОР.values()];
  for (const ключ of порядок) {
    for (const аад of [user_id, null]) {
      try { return расшифровать(secret, ключ, аад); } catch { /* следующий */ }
    }
  }
  throw new Error("ключ кошелька не читается");
}

/* Сравнение токена постоянным временем: обычное сравнение строк
   отвечает тем быстрее, чем раньше расходятся символы, и по этому можно
   подобрать токен. */
function токенСовпал(заголовок) {
  const дано = Buffer.from(String(заголовок || "").replace("Bearer ", ""));
  const надо = Buffer.from(ТОКЕН);
  return дано.length === надо.length && crypto.timingSafeEqual(дано, надо);
}

async function подписать(тело) {
  const { owner, transaction, maxTransfer, kind } = тело;
  if (!owner || !transaction) throw new Error("bad_request");

  const байты = ключКошелька(тело);
  const пара = Keypair.fromSecretKey(new Uint8Array(байты));
  if (пара.publicKey.toBase58() !== owner) throw new Error("ключ не от этого адреса");

  const потолок = Math.min(Math.round(Number(maxTransfer) || 0), ПОТОЛОК);
  // Дела различаются только набором разрешённых инструкций; если
  // вызывающий его не назвал, берём самый узкий — вывод.
  await проверитьТранзакцию(transaction, {
    владелец: owner,
    // Список дел — общий со стражем: раньше он был свой и без «dex»,
    // «graduate» и «pumpportal», и такие сделки проверялись как вывод.
    дело: ДЕЛА.includes(kind) ? kind : "withdraw",
    максПеревода: потолок,
    кривая: КРИВАЯ,
  });

  const сырые = Buffer.from(transaction, "base64");
  try {
    const v = VersionedTransaction.deserialize(new Uint8Array(сырые));
    v.sign([пара]);
    return Buffer.from(v.serialize()).toString("base64");
  } catch {
    const t = Transaction.from(сырые);
    t.partialSign(пара);
    return t.serialize({ requireAllSignatures: false }).toString("base64");
  }
}

const сервер = http.createServer(async (req, res) => {
  const ответ = (код, тело) => {
    res.writeHead(код, { "Content-Type": "application/json" });
    res.end(JSON.stringify(тело));
  };

  if (req.method === "GET" && req.url === "/health") return ответ(200, { ok: true });
  if (req.method !== "POST" || !String(req.url).startsWith("/sign")) return ответ(404, { error: "not_found" });
  if (!токенСовпал(req.headers.authorization)) return ответ(401, { error: "unauthorized" });

  let сырое = "";
  for await (const кусок of req) {
    сырое += кусок;
    // Транзакция Solana не бывает больше пары килобайт; всё, что
    // сильно больше, — попытка занять память.
    if (сырое.length > 64 * 1024) return ответ(413, { error: "too_large" });
  }

  try {
    const подписанная = await подписать(JSON.parse(сырое || "{}"));
    ответ(200, { signed: подписанная });
  } catch (e) {
    const текст = String((e && e.message) || e);
    console.warn("[signer]", текст);
    ответ(400, { error: "refused", detail: текст.slice(0, 200) });
  }
});

сервер.listen(ПОРТ, ХОСТ, () => console.log(`служба подписи слушает ${ХОСТ}:${ПОРТ}`));
