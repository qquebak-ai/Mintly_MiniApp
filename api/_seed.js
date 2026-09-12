/* Одна фраза на оба кошелька.
 *
 * Раньше ключи рождались независимо: в Solana — случайная пара, в TON —
 * своя мнемоника. Два кошелька, две записи, две резервные копии, и
 * человеку нечего сказать на вопрос «а где мой кошелёк». Кошельки вроде
 * Phantom решают это иначе: фраза одна, а ключ каждой сети выводится из
 * неё по своему пути (Solana — m/44'/501', TON — m/44'/607'). Адреса при
 * этом разные, но восстанавливаются они вместе.
 *
 * Здесь живёт корень: BIP-39 из двадцати четырёх слов, зашифрованный тем
 * же ключом площадки и с тем же владельцем в связанных данных, что и
 * ключи кошельков. В открытом виде фраза существует только на время
 * вывода ключа.
 *
 * Прежние кошельки остаются как есть: у них на счетах деньги, и
 * перевыпустить ключ — значит их потерять. Общая фраза — для тех, кто
 * заводит кошелёк с этого момента.
 *
 * Переменные окружения: те же, что у кошельков (APP_WALLET_KEY).
 */

import crypto from "node:crypto";
import * as bip39 from "bip39";
import { derivePath } from "ed25519-hd-key";

// Пути вывода. Solana — тот же, что у Phantom, поэтому её ключ из этой
// фразы восстановится и во внешнем кошельке. У TON свой номер монеты.
export const ПУТЬ_SOLANA = "m/44'/501'/0'/0'";
export const ПУТЬ_TON = "m/44'/607'/0'";

function зашифровать(данные, ключ, владелец) {
  const соль = crypto.randomBytes(12);
  const шифр = crypto.createCipheriv("aes-256-gcm", ключ, соль);
  if (владелец) шифр.setAAD(Buffer.from(String(владелец)));
  const тело = Buffer.concat([шифр.update(данные), шифр.final()]);
  return Buffer.concat([соль, шифр.getAuthTag(), тело]).toString("base64");
}

function расшифроватьКлючом(строка, ключ, владелец) {
  const b = Buffer.from(String(строка), "base64");
  const шифр = crypto.createDecipheriv("aes-256-gcm", ключ, b.subarray(0, 12));
  шифр.setAuthTag(b.subarray(12, 28));
  if (владелец) шифр.setAAD(Buffer.from(String(владелец)));
  return Buffer.concat([шифр.update(b.subarray(28)), шифр.final()]);
}

/* Перебор ключей — как у кошельков: сначала нужным, потом прежним, на
   случай смены APP_WALLET_KEY. */
function расшифровать(строка, набор, владелец) {
  const порядок = строка.key_id && набор.набор.has(строка.key_id)
    ? [набор.набор.get(строка.key_id)]
    : [...набор.набор.values()];
  for (const ключ of порядок) {
    try {
      return расшифроватьКлючом(строка.seed_enc, ключ, владелец);
    } catch { /* следующий ключ */ }
  }
  throw new Error("фраза кошелька не читается");
}

/* Фраза человека: берём существующую или заводим новую.
 *
 * Таблица app_seeds закрыта политиками целиком — читает и пишет её
 * только сервер своим service_role (см. supabase_app_seed.sql).
 */
export async function фразаПользователя(db, user, набор) {
  const { data } = await db
    .from("app_seeds").select("user_id, seed_enc, key_id")
    .eq("user_id", user.id).maybeSingle();
  if (data && data.seed_enc) return расшифровать(data, набор, user.id).toString("utf8");

  const фраза = bip39.generateMnemonic(256); // 24 слова
  const строка = {
    user_id: user.id,
    seed_enc: зашифровать(Buffer.from(фраза, "utf8"), набор.текущий, user.id),
    key_id: набор.метка,
  };
  const { error } = await db.from("app_seeds").insert(строка);
  if (error) {
    // Завели параллельным запросом — берём ту, что легла первой: две
    // фразы у одного человека означали бы два разных кошелька в одной
    // сети.
    const { data: снова } = await db
      .from("app_seeds").select("user_id, seed_enc, key_id")
      .eq("user_id", user.id).maybeSingle();
    if (снова && снова.seed_enc) return расшифровать(снова, набор, user.id).toString("utf8");
    throw new Error(error.message);
  }
  return фраза;
}

/* Ключ сети из фразы. Возвращает 32 байта — из них обе цепочки строят
   свою пару: Solana через Keypair.fromSeed, TON через ed25519. */
export function ключПути(фраза, путь) {
  const семя = bip39.mnemonicToSeedSync(фраза);
  return derivePath(путь, семя.toString("hex")).key;
}

/* Есть ли фраза у человека — без расшифровки. Нужно, чтобы понять,
   заводился ли кошелёк уже из общего корня. */
export async function фразаЕсть(db, user_id) {
  const { data } = await db.from("app_seeds").select("user_id").eq("user_id", user_id).maybeSingle();
  return !!data;
}
