/* Запуск и торговля токеном на своей кривой в Solana.
 *
 * Зачем через сервер. Транзакция здесь непростая: создать счёт токена,
 * записать метаданные Metaplex, передать право выпуска кривой и завести
 * саму кривую — пять инструкций подряд, часть из которых требует знания
 * адресов программ и точной раскладки байтов. Собирать это в браузере
 * значит тащить туда полкилобайта библиотек и держать там же ключи
 * площадки. Поэтому сервер собирает готовую транзакцию, а подписывает её
 * человек в своём кошельке — приватных ключей мы по-прежнему не видим.
 *
 * Единственный ключ, который рождается здесь, — одноразовая пара самого
 * токена: она нужна ровно на одну подпись при создании счёта и после
 * этого не значит ничего, потому что право выпуска сразу уходит кривой.
 *
 * Переменные окружения:
 *   SOLANA_CURVE_PROGRAM — адрес развёрнутой программы кривой. Пока не
 *                          задан, запуск в Solana выключен целиком.
 *   SOLANA_FEE_ACCOUNT   — кошелёк площадки: туда идёт комиссия сделок.
 *   SOLANA_LIQUIDITY     — куда уходит ликвидность после закрытия кривой.
 *   SOLANA_RPC           — узел сети.
 *   SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY — для метаданных токена.
 */

import { createClient } from "@supabase/supabase-js";

/* Библиотеки Solana подтягиваются в момент, когда действительно нужны.
   Так функция отвечает на «включён ли запуск» и на метаданные, не
   разворачивая мегабайт кода, а если какая-то из библиотек не встала —
   ошибка приходит в ответе, а не роняет вызов целиком. */
let PublicKey, Connection, Keypair, SystemProgram, Transaction, TransactionInstruction, ComputeBudgetProgram;
let MINT_SIZE, TOKEN_PROGRAM_ID, AuthorityType;
let createAssociatedTokenAccountIdempotentInstruction, createInitializeMint2Instruction;
let createSetAuthorityInstruction, getAssociatedTokenAddressSync, getMinimumBalanceForRentExemptMint;

async function библиотеки() {
  if (PublicKey) return;
  const [web3, spl] = await Promise.all([
    import("@solana/web3.js"),
    import("@solana/spl-token"),
  ]);
  ({ PublicKey, Connection, Keypair, SystemProgram, Transaction, TransactionInstruction, ComputeBudgetProgram } = web3);
  ({
    MINT_SIZE, TOKEN_PROGRAM_ID, AuthorityType,
    createAssociatedTokenAccountIdempotentInstruction,
    createInitializeMint2Instruction,
    createSetAuthorityInstruction,
    getAssociatedTokenAddressSync,
    getMinimumBalanceForRentExemptMint,
  } = spl);
}

const RPC = process.env.SOLANA_RPC || "https://api.mainnet-beta.solana.com";
const PROGRAM = (process.env.SOLANA_CURVE_PROGRAM || "").trim();
const FEE_ACCOUNT = (process.env.SOLANA_FEE_ACCOUNT || "").trim();
const LIQUIDITY = (process.env.SOLANA_LIQUIDITY || FEE_ACCOUNT || "").trim();
const SUPABASE_URL = process.env.SUPABASE_URL;
const SERVICE_ROLE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;

const METADATA_ADDRESS = "metaqbxxUerdq28cj1RbAWkYQm3ybzjb6a8bt518x1s";

// Разрядность токена. Шесть знаков — то же, что у большинства мемкоинов
// сети: девять дают числа, которые не помещаются в u64 при миллиардной
// эмиссии.
const DECIMALS = 6;
const ЕДИНИЦА = 10 ** DECIMALS;
const LAMPORTS = 1_000_000_000;

/* Параметры кривой. Виртуальные резервы задают стартовую цену и
   крутизну, порог закрытия — момент, когда собранное уходит в пул.
   Считаются здесь, а не приходят из браузера: это правила площадки, а
   не настройка запуска.

   Числа решаются из трёх условий разом: порог — 35 SOL, капитализация
   на пороге — 25 тысяч долларов, и та же капитализация в пуле сразу
   после закрытия. Последнее задаёт развесовку: в пул уходят собранные
   35 SOL и весь невыкупленный выпуск, поэтому цена там равна
   35 / (выпуск − проданное). Чтобы она совпала с ценой кривой
   (vSol + собрано)² / (vSol × vTokens), должно выполняться
   vSol = порог² / (капитализация − в пул − порог) = 1225 / 180 = 6,8056,
   и тогда на кривой расходится 860 миллионов из миллиарда, а 140
   остаются под пару.

   Порог был 85 SOL при vSol = 94, и из этого следовал рост всего в
   3,8 раза: отношение цены на пороге к стартовой равно
   ((vSol + порог) / vSol)², то есть (капитализация / порог − 1)².
   Порог в 35 SOL при той же цели даёт рост в 37,7 раза и старт около
   660 долларов вместо семи тысяч. Плата — пул потоньше: седьмая часть
   выпуска (140 миллионов и 35 SOL) против трети прежде.

   В продаже стоит не 860 миллионов, а 866: порог берётся покупкой,
   которая его переваливает, и без запаса такая покупка упиралась бы в
   «столько токенов на кривой нет». Запас в шесть миллионов держит
   перелёт до полутора SOL, а под пару отложено ровно на него меньше —
   140 миллионов в пул складываются из этих 134 и непроданного
   остатка.

   Капитализация считается в SOL, поэтому в долларах она ходит вместе с
   курсом: пороговая цифра держится, пока SOL стоит около сотни. */
export const КРИВАЯ = {
  // 1225/180 SOL — доля не круглая, поэтому задаётся сразу в лямпортах.
  virtualSol: 6_805_555_556,
  virtualTokens: 1_027_222_222 * ЕДИНИЦА,
  tokensForSale: 866_000_000 * ЕДИНИЦА,
  graduationSol: 35 * LAMPORTS,
  /* Один процент с каждой сделки — столько же берёт pump.fun. Комиссия
     уходит на кошелёк площадки отдельным переводом и в резерв кривой не
     попадает, поэтому цену она не искажает: порог по-прежнему берётся
     35 монетами, просто вложить придётся примерно на процент больше.
     Ставка записывается в кривую при создании и задним числом не
     меняется — у токенов, запущенных при нулевой комиссии, она нулевой
     и останется. */
  feeBps: 100,
  // Запас под пару на бирже. Кривая выпускает его при закрытии вместе с
  // непроданным остатком: собранные монеты и эти токены и становятся
  // ликвидностью. Размер не произвольный — он и выравнивает цену пула с
  // последней ценой кривой (см. расчёт выше).
  liquidityTokens: 134_000_000 * ЕДИНИЦА,
};

// Адрес в Solana — base58 длиной 32–44 символа. Проверка без библиотеки:
// она нужна и до её загрузки, когда спрашивают всего лишь «включён ли
// запуск».
const адресОк = (s) => typeof s === "string" && /^[1-9A-HJ-NP-Za-km-z]{32,44}$/.test(s);

// Без адреса комиссии запуск падал уже на сборке сделки — «включено» в
// интерфейсе, а нажать нельзя. Поэтому оба адреса проверяем разом.
const запускВключён = () => адресОк(PROGRAM) && адресОк(FEE_ACCOUNT);

function программа() {
  if (!запускВключён()) return null;
  return new PublicKey(PROGRAM);
}

function кривуюДля(mint, programId) {
  return PublicKey.findProgramAddressSync(
    [Buffer.from("curve"), mint.toBuffer()],
    programId,
  )[0];
}

function метаПрограмма() {
  return new PublicKey(METADATA_ADDRESS);
}

function метаданныеДля(mint) {
  const мета = метаПрограмма();
  return PublicKey.findProgramAddressSync(
    [Buffer.from("metadata"), мета.toBuffer(), mint.toBuffer()],
    мета,
  )[0];
}

/* --- Раскладка байтов ------------------------------------------------
   Программа читает инструкции борщом: первый байт — номер варианта,
   дальше поля в порядке объявления. Собираем вручную: ради четырёх
   инструкций тянуть клиент Anchor незачем. */

function u64(n) {
  const b = Buffer.alloc(8);
  b.writeBigUInt64LE(BigInt(Math.trunc(n)));
  return b;
}

function u16(n) {
  const b = Buffer.alloc(2);
  b.writeUInt16LE(n);
  return b;
}

function строка(s) {
  const тело = Buffer.from(String(s), "utf8");
  const длина = Buffer.alloc(4);
  длина.writeUInt32LE(тело.length);
  return Buffer.concat([длина, тело]);
}

function инструкцияИнициализации(destination) {
  return Buffer.concat([
    Buffer.from([0]),
    u64(КРИВАЯ.virtualSol),
    u64(КРИВАЯ.virtualTokens),
    u64(КРИВАЯ.tokensForSale),
    u64(КРИВАЯ.graduationSol),
    u16(КРИВАЯ.feeBps),
    destination.toBuffer(),
    u64(КРИВАЯ.liquidityTokens),
  ]);
}

const инструкцияПокупки = (sol, минимум) =>
  Buffer.concat([Buffer.from([1]), u64(sol), u64(минимум)]);

const инструкцияПродажи = (токены, минимум) =>
  Buffer.concat([Buffer.from([2]), u64(токены), u64(минимум)]);

/* Метаданные Metaplex. Формат CreateMetadataAccountV3: номер инструкции,
   имя, тикер, ссылка на описание, роялти, три необязательных поля и
   признак изменяемости. Изменяемость выключаем — иначе создатель мог бы
   подменить имя и картинку уже купленного людьми токена. */
function инструкцияМетаданных({ mint, payer, name, symbol, uri }) {
  const data = Buffer.concat([
    Buffer.from([33]),
    строка(name.slice(0, 32)),
    строка(symbol.slice(0, 10)),
    строка(uri.slice(0, 200)),
    u16(0),
    Buffer.from([0]), // creators: нет
    Buffer.from([0]), // collection: нет
    Buffer.from([0]), // uses: нет
    Buffer.from([0]), // isMutable: нет
    Buffer.from([0]), // collectionDetails: нет
  ]);
  return new TransactionInstruction({
    programId: метаПрограмма(),
    keys: [
      { pubkey: метаданныеДля(mint), isSigner: false, isWritable: true },
      { pubkey: mint, isSigner: false, isWritable: false },
      { pubkey: payer, isSigner: true, isWritable: false },  // право выпуска ещё у создателя
      { pubkey: payer, isSigner: true, isWritable: true },   // и он же платит
      { pubkey: payer, isSigner: false, isWritable: false }, // и он же владелец записи
      { pubkey: SystemProgram.programId, isSigner: false, isWritable: false },
    ],
    data,
  });
}

/* --- Сборка транзакций ---------------------------------------------- */

/* Свежий блок — с памятью.
 *
 * Раньше каждая сделка начиналась с похода к узлу за блоком, да ещё за
 * окончательным: тот отстаёт секунд на десять, а ответ стоил полного
 * круга по сети. Здесь блок берётся подтверждённый и живёт две секунды:
 * за это время он не устаревает, а сделки, идущие одна за другой, уходят
 * в сеть без лишнего ожидания. Пока ответ в пути, все ждут его один, а
 * не заводят по своему запросу. */
let блокПамять = { hash: null, ts: 0, вПути: null };
const БЛОК_ЖИВЁТ_МС = 2000;

async function свежийБлок(connection) {
  if (блокПамять.hash && Date.now() - блокПамять.ts < БЛОК_ЖИВЁТ_МС) return блокПамять.hash;
  if (!блокПамять.вПути) {
    блокПамять.вПути = connection.getLatestBlockhash("confirmed")
      .then(({ blockhash }) => {
        блокПамять = { hash: blockhash, ts: Date.now(), вПути: null };
        return blockhash;
      })
      .catch((err) => {
        блокПамять.вПути = null;
        // Прошлый блок ещё может быть жив — лучше он, чем отказ.
        if (блокПамять.hash) return блокПамять.hash;
        throw err;
      });
  }
  return блокПамять.вПути;
}

/* Плата за очередь. В Solana сделки разбираются по цене за единицу
   вычислений: без неё транзакция ждёт общей очереди, с ней — уходит в
   ближайший блок. Считаные доли цента за сделку. */
/* Приоритетная надбавка сети. Шестьдесят тысяч микролямпортов за единицу
   были взяты с запасом под загруженную сеть; на деле сделка проходит и с
   двадцатью, а платит за надбавку человек. Двадцать тысяч на двести
   двадцать тысяч единиц — это четыре тысячных цента. */
const ЦЕНА_ЕДИНИЦЫ = Number(process.env.SOLANA_PRIORITY_FEE || 20000); // микролямпорты
const ЕДИНИЦ_НА_СДЕЛКУ = 220000;

function приоритет(tx, единиц = ЕДИНИЦ_НА_СДЕЛКУ) {
  if (!ComputeBudgetProgram) return;
  tx.add(ComputeBudgetProgram.setComputeUnitLimit({ units: единиц }));
  if (ЦЕНА_ЕДИНИЦЫ > 0) tx.add(ComputeBudgetProgram.setComputeUnitPrice({ microLamports: ЦЕНА_ЕДИНИЦЫ }));
}

function вBase64(tx) {
  return tx.serialize({ requireAllSignatures: false, verifySignatures: false }).toString("base64");
}

/* Запуск: один вызов кошелька создаёт токен, записывает метаданные,
   отдаёт право выпуска кривой и заводит саму кривую. Порядок важен:
   метаданные требуют подписи того, у кого право выпуска, поэтому оно
   уходит кривой уже после их записи. */
export async function собратьЗапуск({ wallet, name, symbol, base, buySol }) {
  await библиотеки();
  const programId = программа();
  if (!programId) throw new Error("программа кривой не развёрнута");
  if (!адресОк(wallet)) throw new Error("плохой адрес кошелька");
  if (!FEE_ACCOUNT || !адресОк(FEE_ACCOUNT)) throw new Error("не задан кошелёк комиссии");
  if (!LIQUIDITY || !адресОк(LIQUIDITY)) throw new Error("не задан получатель ликвидности");

  const connection = new Connection(RPC, "confirmed");
  const payer = new PublicKey(wallet);
  const mintPair = Keypair.generate();
  const mint = mintPair.publicKey;
  const curve = кривуюДля(mint, programId);
  const feeWallet = new PublicKey(FEE_ACCOUNT);
  const destination = new PublicKey(LIQUIDITY);

  // Ссылка на описание указывает сюда же: имя и картинку кошельки
  // прочитают у нас, а адрес токена известен только после генерации его
  // пары ключей — поэтому ссылка собирается здесь, а не в браузере.
  const uri = `${base}/api/solana-launch?action=meta&mint=${mint.toBase58()}`;

  const аренда = await getMinimumBalanceForRentExemptMint(connection);
  const tx = new Transaction();

  tx.add(SystemProgram.createAccount({
    fromPubkey: payer,
    newAccountPubkey: mint,
    lamports: аренда,
    space: MINT_SIZE,
    programId: TOKEN_PROGRAM_ID,
  }));
  // Заморозки нет вовсе: с ней создатель мог бы запереть токены
  // покупателей, и продать их обратно кривой стало бы нельзя.
  tx.add(createInitializeMint2Instruction(mint, DECIMALS, payer, null, TOKEN_PROGRAM_ID));
  tx.add(инструкцияМетаданных({ mint, payer, name, symbol, uri }));
  tx.add(createSetAuthorityInstruction(mint, payer, AuthorityType.MintTokens, curve, [], TOKEN_PROGRAM_ID));

  tx.add(new TransactionInstruction({
    programId,
    keys: [
      { pubkey: payer, isSigner: true, isWritable: true },
      { pubkey: curve, isSigner: false, isWritable: true },
      { pubkey: mint, isSigner: false, isWritable: false },
      { pubkey: feeWallet, isSigner: false, isWritable: false },
      { pubkey: SystemProgram.programId, isSigner: false, isWritable: false },
    ],
    data: инструкцияИнициализации(destination),
  }));

  // Стартовая покупка создателя — той же транзакцией: иначе между
  // запуском и первой покупкой успевает влезть чужой бот.
  const лямпорты = Math.round(Number(buySol || 0) * LAMPORTS);
  if (лямпорты > 0) {
    const ata = getAssociatedTokenAddressSync(mint, payer);
    tx.add(createAssociatedTokenAccountIdempotentInstruction(payer, ata, payer, mint));
    tx.add(new TransactionInstruction({
      programId,
      keys: [
        { pubkey: payer, isSigner: true, isWritable: true },
        { pubkey: curve, isSigner: false, isWritable: true },
        { pubkey: mint, isSigner: false, isWritable: true },
        { pubkey: ata, isSigner: false, isWritable: true },
        { pubkey: feeWallet, isSigner: false, isWritable: true },
        { pubkey: TOKEN_PROGRAM_ID, isSigner: false, isWritable: false },
        { pubkey: SystemProgram.programId, isSigner: false, isWritable: false },
      ],
      data: инструкцияПокупки(лямпорты, 0),
    }));
  }

  tx.feePayer = payer;
  tx.recentBlockhash = await свежийБлок(connection);
  // Счёт токена подписывает себя сам — это единственное, для чего нужна
  // его пара ключей. Кошелёк добавит свою подпись поверх.
  tx.partialSign(mintPair);

  return {
    transaction: вBase64(tx),
    mint: mint.toBase58(),
    curve: curve.toBase58(),
    decimals: DECIMALS,
  };
}

/* Поля кривой из её счёта. Раскладка та же, что в программе: читают её
   и состояние наружу, и расчёт предела продажи. */
function поляКривой(d) {
  if (!d || d.length < 160) return null;
  let p = 0;
  const версия = d.readUInt8(p); p += 1;
  p += 1; // bump
  const закрыта = d.readUInt8(p) === 1; p += 1;
  p += 32 * 4; // mint, creator, fee_wallet, destination
  const virtualSol = Number(d.readBigUInt64LE(p)); p += 8;
  const virtualTokens = Number(d.readBigUInt64LE(p)); p += 8;
  const tokensForSale = Number(d.readBigUInt64LE(p)); p += 8;
  const graduationSol = Number(d.readBigUInt64LE(p)); p += 8;
  const feeBps = d.readUInt16LE(p); p += 2;
  const realSol = Number(d.readBigUInt64LE(p)); p += 8;
  const tokensSold = Number(d.readBigUInt64LE(p));
  return { версия, закрыта, virtualSol, virtualTokens, tokensForSale, graduationSol, feeBps, realSol, tokensSold };
}

/* Сколько токенов кривая способна выкупить прямо сейчас.
 *
 * Программа считает выплату из своего же инварианта и деление округляет
 * вниз — из-за этого выплата за «все свои токены» выходит на лямпорт-два
 * больше, чем кривая на самом деле собрала. Проверка «нет столько монет»
 * в программе строгая, и вся продажа отбивалась: окно закрывалось,
 * история писала продажу, а в сети ничего не происходило.
 *
 * Здесь считается ровно тот же инвариант и находится наибольшее
 * количество, при котором выплата не превысит запас кривой:
 * из k / (vТокены − продано + сколько) ≥ vSol + собрано − запас следует
 * сколько ≤ k / порог − (vТокены − продано). Разница с «продать всё» —
 * единицы шестого знака, человеку её не видно.
 */
async function пределПродажи(connection, curve) {
  const info = await connection.getAccountInfo(curve);
  const с = info && поляКривой(info.data);
  if (!с) return null;

  const аренда = await connection.getMinimumBalanceForRentExemption(info.data.length);
  const свободно = Math.max(0, info.lamports - аренда);
  const запас = BigInt(Math.min(с.realSol, свободно));

  const vSol = BigInt(с.virtualSol);
  const vТокены = BigInt(с.virtualTokens);
  const собрано = BigInt(с.realSol);
  const продано = BigInt(с.tokensSold);
  if (продано <= 0n) return 0;

  const k = (vSol + собрано) * (vТокены - продано);
  const порог = vSol + собрано - запас;
  if (порог <= 0n) return Number(продано);

  const предел = k / порог - (vТокены - продано);
  if (предел <= 0n) return 0;
  return Number(предел > продано ? продано : предел);
}

/* Покупка и продажа на уже заведённой кривой. */
export async function собратьСделку({ wallet, mint, продажа, amount, minOut }) {
  await библиотеки();
  const programId = программа();
  if (!programId) throw new Error("программа кривой не развёрнута");
  if (!адресОк(wallet) || !адресОк(mint)) throw new Error("плохой адрес");

  const connection = new Connection(RPC, "confirmed");
  const payer = new PublicKey(wallet);
  const mintKey = new PublicKey(mint);
  const curve = кривуюДля(mintKey, programId);
  const feeWallet = new PublicKey(FEE_ACCOUNT);
  const ata = getAssociatedTokenAddressSync(mintKey, payer);

  let единиц = Math.round(Number(amount) * ЕДИНИЦА);
  if (продажа) {
    /* Сколько на счету на самом деле — в тех же мельчайших единицах, что
       уйдут в инструкцию. Число штук приходит дробным, и «продать всё»
       после умножения давало единицу-другую сверх остатка: сжигание
       отбивалось, а человек видел закрытое окно и запись в истории. */
    const остаток = await connection.getTokenAccountBalance(ata).catch(() => null);
    const есть = остаток && остаток.value ? Number(остаток.value.amount) : null;
    if (есть != null && единиц > есть) единиц = есть;

    const предел = await пределПродажи(connection, curve);
    if (предел != null && единиц > предел) единиц = предел;
    if (!(единиц > 0)) throw new Error("продавать нечего");
  }

  const tx = new Transaction();
  приоритет(tx);
  if (!продажа) {
    tx.add(createAssociatedTokenAccountIdempotentInstruction(payer, ata, payer, mintKey));
  }
  tx.add(new TransactionInstruction({
    programId,
    keys: [
      { pubkey: payer, isSigner: true, isWritable: true },
      { pubkey: curve, isSigner: false, isWritable: true },
      { pubkey: mintKey, isSigner: false, isWritable: true },
      { pubkey: ata, isSigner: false, isWritable: true },
      { pubkey: feeWallet, isSigner: false, isWritable: true },
      { pubkey: TOKEN_PROGRAM_ID, isSigner: false, isWritable: false },
      ...(продажа ? [] : [{ pubkey: SystemProgram.programId, isSigner: false, isWritable: false }]),
    ],
    data: продажа
      ? инструкцияПродажи(единиц, Math.round(Number(minOut || 0) * LAMPORTS))
      : инструкцияПокупки(Math.round(Number(amount) * LAMPORTS), Math.round(Number(minOut || 0) * ЕДИНИЦА)),
  }));

  tx.feePayer = payer;
  tx.recentBlockhash = await свежийБлок(connection);
  return { transaction: вBase64(tx), curve: curve.toBase58() };
}

/* Закрытие кривой.
 *
 * Вызвать может кто угодно: важно не кто нажал, а что порог достигнут —
 * деньги всё равно уходят получателю, записанному в кривую при
 * создании. Плательщик комиссии нужен только чтобы транзакция вообще
 * попала в сеть.
 *
 * Вместе с монетами кривая выпускает на счёт получателя непроданный
 * остаток и отложенный запас: из них и собирается пара на бирже.
 */
export async function собратьЗакрытие({ payer, mint }) {
  await библиотеки();
  const programId = программа();
  if (!programId) throw new Error("программа кривой не развёрнута");
  if (!адресОк(payer) || !адресОк(mint)) throw new Error("плохой адрес");

  const connection = new Connection(RPC, "confirmed");
  const плательщик = new PublicKey(payer);
  const mintKey = new PublicKey(mint);
  const curve = кривуюДля(mintKey, programId);
  const получатель = new PublicKey(LIQUIDITY || FEE_ACCOUNT);
  const ata = getAssociatedTokenAddressSync(mintKey, получатель);

  const tx = new Transaction();
  // Счёт под ликвидность заводим здесь же: у получателя его может не
  // быть, а кривая создавать счета не умеет — она только выпускает.
  tx.add(createAssociatedTokenAccountIdempotentInstruction(плательщик, ata, получатель, mintKey));
  tx.add(new TransactionInstruction({
    programId,
    keys: [
      { pubkey: curve, isSigner: false, isWritable: true },
      { pubkey: mintKey, isSigner: false, isWritable: true },
      { pubkey: получатель, isSigner: false, isWritable: true },
      { pubkey: TOKEN_PROGRAM_ID, isSigner: false, isWritable: false },
      { pubkey: ata, isSigner: false, isWritable: true },
    ],
    data: Buffer.from([3]),
  }));

  tx.feePayer = плательщик;
  tx.recentBlockhash = await свежийБлок(connection);
  return { transaction: вBase64(tx), curve: curve.toBase58(), liquidity: ata.toBase58() };
}

/* Состояние кривой: по нему считаются цена, собранная сумма и полоса до
   листинга. Раскладка та же, что в программе. */
export async function состояние(mint) {
  if (!запускВключён() || !адресОк(mint)) return null;
  await библиотеки();
  const programId = программа();
  const connection = new Connection(RPC, "confirmed");
  const curve = кривуюДля(new PublicKey(mint), programId);
  const info = await connection.getAccountInfo(curve);
  if (!info || info.data.length < 160) return null;

  const поля = поляКривой(info.data);
  if (!поля) return null;
  const {
    версия, закрыта, virtualSol, virtualTokens,
    tokensForSale, graduationSol, feeBps, realSol, tokensSold,
  } = поля;

  const цена = (virtualSol + realSol) / (virtualTokens - tokensSold);
  return {
    версия,
    закрыта,
    curve: curve.toBase58(),
    solСобрано: realSol / LAMPORTS,
    solЦель: graduationSol / LAMPORTS,
    продано: tokensSold / ЕДИНИЦА,
    вПродаже: tokensForSale / ЕДИНИЦА,
    // Цена одной штуки в SOL: резервы считаются в мельчайших единицах,
    // поэтому переводим обе стороны разом.
    ценаSol: (цена * ЕДИНИЦА) / LAMPORTS,
    feeBps,
    // Виртуальные резервы отдаём наружу: по ним цена считается при любом
    // объёме выкупа, и картинка с графиком может нарисовать саму кривую,
    // пока по токену не прошло ни одной сделки.
    virtualSol,
    virtualTokens,
    tokensSold,
    realSol,
    graduationSol,
  };
}

/* Метаданные для кошельков и обозревателей. Ссылка на этот адрес
   записывается в токен при запуске, поэтому отвечать нужно всегда — даже
   когда токена в базе ещё нет: кошельки перечитают позже. */
async function метаданные(mint) {
  if (!SUPABASE_URL || !SERVICE_ROLE_KEY) return null;
  const db = createClient(SUPABASE_URL, SERVICE_ROLE_KEY, { auth: { persistSession: false } });
  const { data } = await db
    .from("tokens")
    .select("name, ticker, logo_url")
    .eq("address", mint)
    .maybeSingle();
  if (!data) return null;
  return {
    name: data.name,
    symbol: data.ticker,
    description: `${data.name} — токен, запущенный в Mintly.`,
    image: data.logo_url || "",
  };
}

/* Потолок сборок с одного адреса. Окно — минута, память — процесса:
   перезапуск обнуляет, и это нормально, цель скромная. */
const СБОРОК_В_МИНУТУ = Number(process.env.SOLANA_BUILD_RATE || 30);
const сборки = new Map();
function пропустить(ключ) {
  const сейчас = Date.now();
  const было = сборки.get(ключ);
  if (!было || сейчас - было.начало > 60_000) {
    сборки.set(ключ, { начало: сейчас, счёт: 1 });
    // Карта не должна расти бесконечно: раз в минуту чистим остывшие.
    if (сборки.size > 5000) {
      for (const [к, з] of сборки) if (сейчас - з.начало > 60_000) сборки.delete(к);
    }
    return true;
  }
  было.счёт += 1;
  return было.счёт <= СБОРОК_В_МИНУТУ;
}

// Общая память на состояние кривой — ровно на секунду (см. ниже).
const состояниеКеш = new Map();
const СОСТОЯНИЕ_МС = 1000;

export default async function handler(req, res) {
  const действие = String((req.query && req.query.action) || "");
  try {
    if (действие === "meta") {
      const m = await метаданные(String(req.query.mint || ""));
      if (!m) return res.status(404).json({ error: "not_found" });
      res.setHeader("Cache-Control", "public, max-age=60");
      return res.status(200).json(m);
    }

    if (действие === "state") {
      const mint = String(req.query.mint || "");
      /* Карточка спрашивает состояние каждые пару секунд, и зрителей у
         токена может быть много. Секунда общей памяти убирает лишние
         походы в сеть и при этом не заметна: свою сделку человек видит
         в следующем же круге. */
      const было = состояниеКеш.get(mint);
      const s = было && Date.now() - было.ts < СОСТОЯНИЕ_МС
        ? было.тело
        : await состояние(mint);
      if (!s) return res.status(404).json({ error: "not_found" });
      состояниеКеш.set(mint, { ts: Date.now(), тело: s });
      if (состояниеКеш.size > 300) {
        for (const [к, з] of состояниеКеш) if (Date.now() - з.ts > СОСТОЯНИЕ_МС) состояниеКеш.delete(к);
      }
      res.setHeader("Cache-Control", "no-store");
      return res.status(200).json(s);
    }

    if (действие === "enabled") {
      return res.status(200).json({
        enabled: запускВключён(),
        program: PROGRAM || null,
        fee: адресОк(FEE_ACCOUNT),
        cluster: /devnet/.test(RPC) ? "devnet" : /testnet/.test(RPC) ? "testnet" : "mainnet-beta",
        /* Параметры кривой отдаём наружу: по ним форма запуска считает,
           сколько токенов достанется за стартовую покупку. Держать их
           второй копией в приложении нельзя — там стояли числа кривой
           TON, и обещанное в форме расходилось с тем, что показывал
           итог запуска. */
        curve: {
          virtualSol: КРИВАЯ.virtualSol,
          virtualTokens: КРИВАЯ.virtualTokens,
          tokensForSale: КРИВАЯ.tokensForSale,
          graduationSol: КРИВАЯ.graduationSol,
          liquidityTokens: КРИВАЯ.liquidityTokens,
          feeBps: КРИВАЯ.feeBps,
          decimals: DECIMALS,
        },
      });
    }

    if (req.method !== "POST") return res.status(405).json({ error: "method_not_allowed" });
    /* Сборка транзакции никого не авторизует — она и не тратит ничего,
       подписывает потом сам человек. Но каждая сборка — это несколько
       запросов к узлу сети, и без потолка один скрипт занял бы собой
       весь лимит узла. Считаем по адресу обратившегося, в памяти
       процесса: точный учёт здесь не нужен, нужна отсечка. */
    const откуда = String(req.headers["x-forwarded-for"] || "").split(",")[0].trim() || "?";
    if (!пропустить(откуда)) return res.status(429).json({ error: "too_often" });
    const тело = typeof req.body === "string" ? JSON.parse(req.body || "{}") : (req.body || {});

    if (действие === "launch") {
      const имя = String(тело.name || "").trim();
      const тикер = String(тело.ticker || "").trim().toUpperCase();
      if (!имя || !тикер) return res.status(400).json({ error: "bad_request" });
      const хост = req.headers["x-forwarded-host"] || req.headers.host || "";
      const итог = await собратьЗапуск({
        wallet: тело.wallet,
        name: имя,
        symbol: тикер,
        base: хост ? `https://${хост}` : "",
        buySol: тело.buySol,
      });
      res.setHeader("Cache-Control", "no-store");
      return res.status(200).json(итог);
    }

    if (действие === "trade") {
      const итог = await собратьСделку({
        wallet: тело.wallet,
        mint: тело.mint,
        продажа: !!тело.sell,
        amount: тело.amount,
        minOut: тело.minOut,
      });
      res.setHeader("Cache-Control", "no-store");
      return res.status(200).json(итог);
    }

    return res.status(400).json({ error: "unknown_action" });
  } catch (err) {
    console.warn("[solana-launch]", err && err.message);
    return res.status(502).json({ error: "failed", detail: String((err && err.message) || err).slice(0, 200) });
  }
}
