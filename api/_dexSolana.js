/* Сделка по токену, который уже вышел на биржу (пул Raydium CPMM).
 *
 * Кривая после выхода закрыта, и покупка с продажей идут обменом в пуле
 * — с того же кошелька внутри приложения, теми же кнопками. Jupiter в
 * mainnet такой пул тоже нашёл бы, но в devnet его нет вовсе, а прямой
 * обмен в одном пуле работает одинаково в обеих сетях и не ждёт, пока
 * маршрутизатор проиндексирует новый пул.
 */
import { Connection, PublicKey, TransactionMessage, VersionedTransaction } from "@solana/web3.js";
import { NATIVE_MINT, getAssociatedTokenAddressSync } from "@solana/spl-token";
import { прочитатьПул, котировкаПула, инструкцииОбмена } from "./_raydium.js";

const RPC = process.env.SOLANA_RPC || "https://api.mainnet-beta.solana.com";
const LAMPORTS = 1_000_000_000;
const ЕДИНИЦА = 1_000_000;

export async function собратьОбменБиржи({ wallet, mint, пул, продажа, amount, slippageBps = 300 }) {
  const connection = new Connection(RPC, "confirmed");
  const владелец = new PublicKey(wallet);
  const mintKey = new PublicKey(mint);
  const пулKey = new PublicKey(пул);
  const п = await прочитатьПул(connection, пулKey);
  if (!п) throw new Error("пул не найден");
  const solПервый = п.m0.equals(NATIVE_MINT);
  const резервSol = solПервый ? п.резерв0 : п.резерв1;
  const резервТокена = solПервый ? п.резерв1 : п.резерв0;

  let amountIn;
  if (продажа) {
    // Не больше, чем лежит на счету: дробное «продать всё» после
    // умножения давало единицу-другую сверх остатка.
    const счёт = getAssociatedTokenAddressSync(mintKey, владелец);
    const есть = await connection.getTokenAccountBalance(счёт).then((б) => BigInt(б.value.amount)).catch(() => 0n);
    amountIn = BigInt(Math.floor(Number(amount) * ЕДИНИЦА));
    if (amountIn > есть) amountIn = есть;
  } else {
    amountIn = BigInt(Math.floor(Number(amount) * LAMPORTS));
  }
  if (!(amountIn > 0n)) throw new Error("пустая сделка");
  const выйдет = продажа ? котировкаПула(резервТокена, резервSol, amountIn) : котировкаПула(резервSol, резервТокена, amountIn);
  if (!(выйдет > 0n)) throw new Error("в пуле не хватает ликвидности");
  const minOut = (выйдет * BigInt(10_000 - Math.min(5000, Math.max(10, Number(slippageBps) || 300)))) / 10_000n;

  const инструкции = инструкцииОбмена({ владелец, пул: пулKey, п, mint: mintKey, покупка: !продажа, amountIn, minOut });
  const { blockhash } = await connection.getLatestBlockhash("confirmed");
  const tx = new VersionedTransaction(new TransactionMessage({
    payerKey: владелец, recentBlockhash: blockhash, instructions: инструкции,
  }).compileToV0Message());
  return {
    transaction: Buffer.from(tx.serialize()).toString("base64"),
    tokens: продажа ? Number(amountIn) / ЕДИНИЦА : Number(выйдет) / ЕДИНИЦА,
    solOut: продажа ? Number(выйдет) / LAMPORTS : 0,
    программа: п.программа.toBase58(),
  };
}
