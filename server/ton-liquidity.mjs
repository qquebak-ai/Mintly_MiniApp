/* Кошелёк ликвидности TON — один раз на сервере.
 *
 *   sudo -u mintly node /srv/mintly/server/ton-liquidity.mjs
 *
 * Заводит TON_LIQUIDITY_MNEMONIC в .env.server, если его ещё нет, и
 * печатает адрес. Кривые токенов, запущенных после этого, отдают
 * собранное этому кошельку, а сервер сам заводит пул на STON.fi
 * (api/ton-migrate.js). На кошельке нужен запас TON на газ — около
 * 2 TON: им оплачиваются Graduate и вклад в пул. Службу после скрипта
 * надо перезапустить.
 */
import fs from "node:fs";
import path from "node:path";
import { mnemonicNew, mnemonicToPrivateKey } from "@ton/crypto";
import { WalletContractV4 } from "@ton/ton";

const ФАЙЛ = process.env.ENV_FILE || path.join(path.dirname(new URL(import.meta.url).pathname), "..", ".env.server");
const текст = fs.existsSync(ФАЙЛ) ? fs.readFileSync(ФАЙЛ, "utf8") : "";
const было = текст.match(/^TON_LIQUIDITY_MNEMONIC=(.+)$/m);
const тест = (текст.match(/^TON_TESTNET=(.+)$/m) || [])[1] === "1" || process.env.TON_TESTNET === "1";
let слова;
if (было) {
  слова = было[1].trim().split(/\s+/);
  console.log("Кошелёк уже есть.");
} else {
  слова = await mnemonicNew(24);
  // Дописываем, а не переписываем: в файле ключи, которые нельзя потерять.
  const строки = текст.split("\n");
  while (строки.length && строки[строки.length - 1] === "") строки.pop();
  строки.push(`TON_LIQUIDITY_MNEMONIC=${слова.join(" ")}`, "");
  fs.writeFileSync(ФАЙЛ, строки.join("\n"), { mode: 0o600 });
  console.log("Завёл кошелёк ликвидности TON в .env.server.");
}
const пара = await mnemonicToPrivateKey(слова);
const адрес = WalletContractV4.create({ workchain: 0, publicKey: пара.publicKey }).address;
console.log(`Адрес: ${адрес.toString({ bounceable: false, testOnly: тест })}`);
console.log(тест ? "Пополни его с крана: https://t.me/testgiver_ton_bot (≈2 TON)." : "Пополни его на ≈2 TON для газа.");
