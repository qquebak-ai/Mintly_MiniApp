/* Сборка контрактов EVM: solc из npm, без внешних инструментов.
 *
 * Запуск: node contracts/evm/build.mjs
 * Выход:  contracts/evm/out/<Контракт>.json — abi и байткод. Эти файлы
 * читают и проверка (test.mjs), и развёртывание (deploy.mjs), и сервер:
 * держать байткод в репозитории значит разворачивать ровно то, что
 * проверено.
 */
import fs from "node:fs";
import path from "node:path";
import { createRequire } from "node:module";

const require = createRequire(import.meta.url);
const solc = require("solc");
const папка = path.dirname(new URL(import.meta.url).pathname);

export function собрать({ сТестами = false } = {}) {
  const sources = { "MintlyCurve.sol": { content: fs.readFileSync(path.join(папка, "MintlyCurve.sol"), "utf8") } };
  if (сТестами) sources["Mocks.sol"] = { content: fs.readFileSync(path.join(папка, "test/Mocks.sol"), "utf8") };
  const вход = {
    language: "Solidity",
    sources,
    settings: {
      optimizer: { enabled: true, runs: 200 },
      evmVersion: "paris", // без PUSH0: так байткод одинаково пойдёт во всех трёх сетях
      outputSelection: { "*": { "*": ["abi", "evm.bytecode.object"] } },
    },
  };
  const выход = JSON.parse(solc.compile(JSON.stringify(вход)));
  const ошибки = (выход.errors || []).filter((e) => e.severity === "error");
  if (ошибки.length) throw new Error(ошибки.map((e) => e.formattedMessage).join("\n"));
  const итог = {};
  for (const файл of Object.keys(выход.contracts)) {
    for (const [имя, к] of Object.entries(выход.contracts[файл])) {
      итог[имя] = { abi: к.abi, bytecode: "0x" + к.evm.bytecode.object };
    }
  }
  return итог;
}

if (import.meta.url === `file://${process.argv[1]}`) {
  const итог = собрать();
  const out = path.join(папка, "out");
  fs.mkdirSync(out, { recursive: true });
  for (const имя of ["MintlyCurve", "MintlyToken"]) {
    fs.writeFileSync(path.join(out, `${имя}.json`), JSON.stringify(итог[имя]));
    console.log(`contracts/evm/out/${имя}.json`, Math.round(итог[имя].bytecode.length / 2), "байт");
  }
}
