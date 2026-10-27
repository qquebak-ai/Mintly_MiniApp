import { Keypair, PublicKey, SystemProgram, Transaction, TransactionInstruction } from "@solana/web3.js";
import { проверитьТранзакцию } from "/home/user/Facet_MiniApp/api/_txguard.js";

const хозяин = Keypair.generate();
const чужой = Keypair.generate();
const КРИВАЯ = Keypair.generate().publicKey.toBase58();
const ТОКЕНЫ = new PublicKey("TokenkegQfeZyiNwAJbNbGKPFXCWuBvf9Ss623VQ5DA");
const блок = "11111111111111111111111111111111";

function собрать(инструкции, плательщик = хозяин.publicKey) {
  const tx = new Transaction();
  инструкции.forEach((i) => tx.add(i));
  tx.feePayer = плательщик;
  tx.recentBlockhash = блок;
  return tx.serialize({ requireAllSignatures: false, verifySignatures: false }).toString("base64");
}

const перевод = (кому, sol) => SystemProgram.transfer({
  fromPubkey: хозяин.publicKey, toPubkey: кому, lamports: Math.round(sol * 1e9),
});

let провалов = 0;
async function случай(имя, ожидаем, tx, правила) {
  let исход = "прошло";
  try { await проверитьТранзакцию(tx, правила); } catch (e) { исход = `отказ: ${e.message}`; }
  const ок = ожидаем === "прошло" ? исход === "прошло" : исход.startsWith("отказ");
  if (!ок) провалов += 1;
  console.log(`${ок ? "✓" : "✗"} ${имя} → ${исход}`);
}

const общее = { владелец: хозяин.publicKey.toBase58(), кривая: КРИВАЯ };

await случай("вывод на привязанный адрес в свой потолок", "прошло",
  собрать([перевод(чужой.publicKey, 1)]),
  { ...общее, дело: "withdraw", максПеревода: 1e9 });

await случай("вывод больше потолка", "отказ",
  собрать([перевод(чужой.publicKey, 1)]),
  { ...общее, дело: "withdraw", максПеревода: 0.5e9 });

await случай("кража под видом сделки", "отказ",
  собрать([перевод(чужой.publicKey, 5)]),
  { ...общее, дело: "trade", максПеревода: 0.01e9 });

await случай("покупка на кривой", "прошло",
  собрать([new TransactionInstruction({
    programId: new PublicKey(КРИВАЯ),
    keys: [{ pubkey: хозяин.publicKey, isSigner: true, isWritable: true }],
    data: Buffer.from([1, ...new Array(16).fill(0)]),
  })]),
  { ...общее, дело: "trade", максПеревода: 0.5e9 });

await случай("чужая программа", "отказ",
  собрать([new TransactionInstruction({
    programId: Keypair.generate().publicKey,
    keys: [{ pubkey: хозяин.publicKey, isSigner: true, isWritable: true }],
    data: Buffer.from([0]),
  })]),
  { ...общее, дело: "trade", максПеревода: 0.5e9 });

await случай("платит не наш кошелёк", "отказ",
  собрать([перевод(чужой.publicKey, 0.1)], чужой.publicKey),
  { ...общее, дело: "withdraw", максПеревода: 1e9 });

// Право выпуска: только при запуске.
const право = new TransactionInstruction({
  programId: ТОКЕНЫ,
  keys: [{ pubkey: хозяин.publicKey, isSigner: true, isWritable: true }],
  data: Buffer.from([6, 0, 0]),
});
await случай("смена права выпуска при запуске", "прошло",
  собрать([право]), { ...общее, дело: "launch", максПеревода: 0.03e9 });
await случай("смена права выпуска в сделке", "отказ",
  собрать([право]), { ...общее, дело: "trade", максПеревода: 0.03e9 });

// Закрытие счёта токена: нужно свопу (разворот wSOL), но не выводу.
const закрыть = new TransactionInstruction({
  programId: ТОКЕНЫ,
  keys: [{ pubkey: хозяин.publicKey, isSigner: true, isWritable: true }],
  data: Buffer.from([9]),
});
await случай("разворот wSOL в свопе", "прошло",
  собрать([закрыть]), { ...общее, дело: "swap", максПеревода: 0.02e9 });
await случай("закрытие счёта при выводе", "отказ",
  собрать([закрыть]), { ...общее, дело: "withdraw", максПеревода: 0.02e9 });

// Создание счёта с деньгами — тоже уход средств.
await случай("создание счёта сверх потолка", "отказ",
  собрать([SystemProgram.createAccount({
    fromPubkey: хозяин.publicKey, newAccountPubkey: чужой.publicKey,
    lamports: 2e9, space: 82, programId: ТОКЕНЫ,
  })]),
  { ...общее, дело: "launch", максПеревода: 0.03e9 });

// Сделки свежих токенов через PumpPortal: его программа — да, чужая — нет,
// и сверху никаких прямых переводов больше потолка.
const ПОРТАЛ = new PublicKey("FAdo9NCw1ssek6Z6yeWzWjhLVsr8uiCwcWNUnKgzTnHe");
await случай("покупка свежего токена через PumpPortal", "прошло",
  собрать([new TransactionInstruction({ programId: ПОРТАЛ, keys: [{ pubkey: хозяин.publicKey, isSigner: true, isWritable: true }], data: Buffer.from([1, 2, 3]) })]),
  { ...общее, дело: "pumpportal", максПеревода: 0.03e9 });
await случай("PumpPortal: чужая программа рядом", "отказ",
  собрать([new TransactionInstruction({ programId: Keypair.generate().publicKey, keys: [{ pubkey: хозяин.publicKey, isSigner: true, isWritable: true }], data: Buffer.from([0]) })]),
  { ...общее, дело: "pumpportal", максПеревода: 0.03e9 });
await случай("PumpPortal: перевод сверх потолка", "отказ",
  собрать([перевод(чужой.publicKey, 1)]),
  { ...общее, дело: "pumpportal", максПеревода: 0.03e9 });

console.log(провалов ? `\nПРОВАЛОВ: ${провалов}` : "\nвсе проверки прошли");
process.exit(провалов ? 1 : 0);
