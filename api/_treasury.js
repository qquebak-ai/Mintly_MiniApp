/* Казначейство площадки: два кошелька, из которых идёт обмен между
 * сетями.
 *
 * Зачем оно вообще. Обменять SOL на GRAM внутри одной сделки нельзя:
 * это разные цепочки, моста между ними у нас нет. Зато есть площадка,
 * которая держит запас обеих монет: человек отдаёт свою монету на
 * казначейский адрес, а казна тем же движением шлёт ему другую в другой
 * сети. Курс считается по рыночному, комиссия площадки удерживается один
 * раз (см. api/treasury-swap.js).
 *
 * Ключи закрыты тем же APP_WALLET_KEY, что и кошельки людей, и живут в
 * своей таблице (supabase_treasury.sql): у казначейства нет владельца, а
 * в app_wallets ключ — это user_id со ссылкой на auth.users.
 *
 * Переменные окружения: SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY,
 * APP_WALLET_KEY, SOLANA_RPC, TON_TESTNET, TONCENTER_URL, TONAPI_KEY.
 */

import crypto from "node:crypto";
import { createClient } from "@supabase/supabase-js";

const SUPABASE_URL = process.env.SUPABASE_URL;
const SERVICE_ROLE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;
const TESTNET = process.env.TON_TESTNET === "1";
const RPC = process.env.SOLANA_RPC || "https://api.mainnet-beta.solana.com";
const TONAPI = TESTNET ? "https://testnet.tonapi.io" : "https://tonapi.io";
const TONAPI_KEY = process.env.TONAPI_KEY || "";
const LAMPORTS = 1_000_000_000;

export const СЕТЬ_TON = TESTNET ? "testnet" : "mainnet";
export const СЕТЬ_SOL = /devnet/.test(RPC) ? "devnet" : /testnet/.test(RPC) ? "testnet" : "mainnet";

export function админ() {
  if (!SUPABASE_URL || !SERVICE_ROLE_KEY) return null;
  return createClient(SUPABASE_URL, SERVICE_ROLE_KEY, { auth: { persistSession: false } });
}

function разобратьКлюч(строка) {
  if (!строка) return null;
  try {
    const b = Buffer.from(String(строка), "base64");
    return b.length === 32 ? b : null;
  } catch { return null; }
}

export function ключи() {
  const текущий = разобратьКлюч(process.env.APP_WALLET_KEY);
  if (!текущий) return null;
  return { текущий, метка: crypto.createHash("sha256").update(текущий).digest("hex").slice(0, 8) };
}

/* Шифрование то же, что у кошельков людей, только вместо владельца —
   имя сети: у казначейского кошелька владельца нет, а связать шифр с
   чем-то посторонним всё равно нужно, иначе строку можно переставить из
   одной сети в другую. */
function зашифровать(данные, ключ, метка) {
  const соль = crypto.randomBytes(12);
  const шифр = crypto.createCipheriv("aes-256-gcm", ключ, соль);
  шифр.setAAD(Buffer.from(String(метка)));
  const тело = Buffer.concat([шифр.update(данные), шифр.final()]);
  return Buffer.concat([соль, шифр.getAuthTag(), тело]).toString("base64");
}

function расшифровать(строка, ключ, метка) {
  const b = Buffer.from(String(строка), "base64");
  const шифр = crypto.createDecipheriv("aes-256-gcm", ключ, b.subarray(0, 12));
  шифр.setAuthTag(b.subarray(12, 28));
  шифр.setAAD(Buffer.from(String(метка)));
  return Buffer.concat([шифр.update(b.subarray(28)), шифр.final()]);
}

// --- Solana ------------------------------------------------------------

let sol = null;
async function библиотекиSol() {
  if (!sol) sol = await import("@solana/web3.js");
  return sol;
}

async function rpc(method, params) {
  const res = await fetch(RPC, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ jsonrpc: "2.0", id: 1, method, params }),
  });
  if (!res.ok) throw new Error(`rpc ${res.status}`);
  const json = await res.json();
  if (json.error) throw new Error(json.error.message || "rpc");
  return json.result;
}

// --- TON ---------------------------------------------------------------

let тон = null;
async function библиотекиTon() {
  if (!тон) {
    const [core, ton, crypt] = await Promise.all([
      import("@ton/core"),
      import("@ton/ton"),
      import("@ton/crypto"),
    ]);
    тон = { ...core, ...ton, ...crypt };
  }
  return тон;
}

function клиентTon(TonClient) {
  return new TonClient({
    endpoint: process.env.TONCENTER_URL
      || (TESTNET ? "https://testnet.toncenter.com/api/v2/jsonRPC" : "https://toncenter.com/api/v2/jsonRPC"),
    apiKey: process.env.TONCENTER_API_KEY || undefined,
  });
}

// --- Кошелёк казны -----------------------------------------------------

/* Кошелёк казначейства для сети. Заводится при первом обращении и живёт
   дальше: адрес постоянный, потому что на него площадка сама кладёт
   запас монеты. */
export async function казна(db, набор, chain) {
  const сеть = chain === "solana" ? СЕТЬ_SOL : СЕТЬ_TON;
  const { data } = await db.from("treasury_wallets").select("chain, network, address, secret_enc, key_id").eq("chain", chain).maybeSingle();
  if (data) return data;

  let строка;
  if (chain === "solana") {
    const { Keypair } = await библиотекиSol();
    const пара = Keypair.generate();
    строка = {
      chain, network: сеть,
      address: пара.publicKey.toBase58(),
      secret_enc: зашифровать(Buffer.from(пара.secretKey), набор.текущий, `treasury:${chain}`),
      key_id: набор.метка,
    };
  } else {
    const { mnemonicNew, mnemonicToPrivateKey, WalletContractV4 } = await библиотекиTon();
    const слова = await mnemonicNew(24);
    const пара = await mnemonicToPrivateKey(слова);
    const контракт = WalletContractV4.create({ workchain: 0, publicKey: пара.publicKey });
    строка = {
      chain, network: сеть,
      address: контракт.address.toString({ bounceable: false, testOnly: TESTNET }),
      secret_enc: зашифровать(Buffer.from(слова.join(" ")), набор.текущий, `treasury:${chain}`),
      key_id: набор.метка,
    };
  }

  const { error } = await db.from("treasury_wallets").insert(строка);
  if (error) {
    // Завели параллельным запросом — читаем, что получилось: двух
    // казначейских кошельков в одной сети быть не должно.
    const { data: снова } = await db.from("treasury_wallets").select("chain, network, address, secret_enc, key_id").eq("chain", chain).maybeSingle();
    if (снова) return снова;
    throw new Error(error.message);
  }
  return строка;
}

/* Сколько на казначейском кошельке — числом монеты, а не мельчайших
   единиц. Спрашиваем сеть: свой учёт разошёлся бы с ней при первом же
   пополнении со стороны. */
export async function остаток(chain, адрес) {
  if (chain === "solana") {
    const b = await rpc("getBalance", [адрес]).catch(() => null);
    return Number((b && b.value) || 0) / LAMPORTS;
  }
  try {
    const res = await fetch(`${TONAPI}/v2/accounts/${адрес}`, {
      headers: TONAPI_KEY ? { Authorization: `Bearer ${TONAPI_KEY}` } : {},
    });
    if (!res.ok) return 0;
    const j = await res.json();
    return (Number(j.balance) || 0) / 1e9;
  } catch {
    return 0;
  }
}

/* Перевод из казны человеку. Возвращает подпись (Solana) или хеш
   сообщения (TON) — по ним обмен потом можно найти в цепочке. */
export async function отправитьИзКазны(строка, набор, куда, сумма) {
  if (!(сумма > 0)) throw new Error("bad_amount");

  if (строка.chain === "solana") {
    const { Keypair, Connection, PublicKey, SystemProgram, Transaction } = await библиотекиSol();
    const секрет = расшифровать(строка.secret_enc, набор.текущий, "treasury:solana");
    const пара = Keypair.fromSecretKey(new Uint8Array(секрет));
    const соединение = new Connection(RPC, "confirmed");
    const tx = new Transaction().add(SystemProgram.transfer({
      fromPubkey: пара.publicKey,
      toPubkey: new PublicKey(куда),
      lamports: Math.floor(сумма * LAMPORTS),
    }));
    const { blockhash, lastValidBlockHeight } = await соединение.getLatestBlockhash("confirmed");
    tx.recentBlockhash = blockhash;
    tx.lastValidBlockHeight = lastValidBlockHeight;
    tx.feePayer = пара.publicKey;
    tx.sign(пара);
    const подпись = await соединение.sendRawTransaction(tx.serialize(), {
      skipPreflight: false, preflightCommitment: "processed", maxRetries: 5,
    });
    return подпись;
  }

  const { mnemonicToPrivateKey, WalletContractV4, TonClient, internal, toNano, Address } = await библиотекиTon();
  const слова = расшифровать(строка.secret_enc, набор.текущий, "treasury:ton").toString("utf8").split(" ");
  const пара = await mnemonicToPrivateKey(слова);
  const контракт = WalletContractV4.create({ workchain: 0, publicKey: пара.publicKey });
  const client = клиентTon(TonClient);
  const кошелёк = client.open(контракт);
  const seqno = await кошелёк.getSeqno();
  await кошелёк.sendTransfer({
    secretKey: пара.secretKey,
    seqno,
    messages: [internal({
      to: Address.parse(куда),
      value: toNano(сумма.toFixed(9)),
      // Обычный перевод без тела: получатель — простой кошелёк, читать
      // ему нечего.
      body: "",
      bounce: false,
    })],
  });
  // У TON подписи как таковой нет — возвращаем номер, по которому
  // перевод отличим от соседних.
  return `seqno:${seqno}`;
}
