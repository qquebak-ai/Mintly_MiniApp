// Сборка src/tonLaunchCore.js для сервера: он не читает TypeScript
// (обёртки контрактов в src/contracts — .ts), поэтому получает один
// готовый файл. Библиотеки @ton/* остаются внешними — они есть в
// node_modules сервера. Запуск: node scripts/build-ton-core.mjs
import { build } from "esbuild";
await build({
  entryPoints: ["src/tonLaunchCore.js"],
  outfile: "api/_tonLaunchCore.js",
  bundle: true,
  platform: "node",
  format: "esm",
  target: "node18",
  external: ["@ton/*", "@ton-community/*"],
  banner: { js: "// Собрано из src/tonLaunchCore.js скриптом scripts/build-ton-core.mjs — не править руками." },
  logLevel: "warning",
});
console.log("api/_tonLaunchCore.js готов");
