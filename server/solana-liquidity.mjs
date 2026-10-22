/* Кошелёк ликвидности Solana — один раз на сервере.
 *
 *   sudo -u mintly node /srv/mintly/server/solana-liquidity.mjs
 *
 * Заводит ключ SOLANA_LIQUIDITY_KEY в .env.server, если его ещё нет, и
 * печатает адрес. Кривые токенов, запущенных после этого, отдают
 * ликвидность этому кошельку, а сервер сам заводит из неё пул на Raydium
 * (api/solana-migrate.js). Пополнять кошелёк не нужно: плата за пул
 * берётся из собранного кривой. Службу после скрипта надо перезапустить.
 */
import fs from "node:fs";
import path from "node:path";
import { Keypair } from "@solana/web3.js";

const ФАЙЛ = process.env.ENV_FILE || path.join(path.dirname(new URL(import.meta.url).pathname), "..", ".env.server");
const текст = fs.existsSync(ФАЙЛ) ? fs.readFileSync(ФАЙЛ, "utf8") : "";
const было = текст.match(/^SOLANA_LIQUIDITY_KEY=(.+)$/m);
let ключ;
if (было) {
  ключ = Keypair.fromSecretKey(Uint8Array.from(JSON.parse(было[1])));
  console.log("Ключ уже есть.");
} else {
  ключ = Keypair.generate();
  // Дописываем, а не переписываем: в файле ключи, которые нельзя потерять.
  const строки = текст.split("\n");
  while (строки.length && строки[строки.length - 1] === "") строки.pop();
  строки.push(`SOLANA_LIQUIDITY_KEY=${JSON.stringify([...ключ.secretKey])}`, "");
  fs.writeFileSync(ФАЙЛ, строки.join("\n"), { mode: 0o600 });
  console.log("Завёл ключ кошелька ликвидности в .env.server.");
}
console.log(`Адрес: ${ключ.publicKey.toBase58()}`);
