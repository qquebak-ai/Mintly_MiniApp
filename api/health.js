/* Одна проверка на всё приложение.
 *
 * Сторож снаружи дёргал разные адреса и по любому 404 писал тревогу —
 * хотя 404 у него выходил и там, где такого адреса просто нет, и в те
 * секунды, пока сайт пересобирался. Здесь один адрес, который отвечает
 * всегда и говорит по каждому узлу отдельно: сайт на месте, запуск в
 * Solana открыт, кошелёк приложения включён.
 *
 * Код ответа: 200, когда всё главное на месте, 503 — когда нет. По нему
 * и стоит настраивать тревогу, а подробности — в теле.
 */

import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const корень = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");

const адресОк = (s) => typeof s === "string" && /^[1-9A-HJ-NP-Za-km-z]{32,44}$/.test(s.trim());

export default async function handler(req, res) {
  const сайт = fs.existsSync(path.join(корень, "dist", "index.html"));

  const запуск = адресОк(process.env.SOLANA_CURVE_PROGRAM || "")
    && адресОк(process.env.SOLANA_FEE_ACCOUNT || "");

  const кошелёк = !!(process.env.SUPABASE_URL
    && process.env.SUPABASE_SERVICE_ROLE_KEY
    && process.env.APP_WALLET_KEY);

  const база = !!(process.env.SUPABASE_URL && process.env.SUPABASE_SERVICE_ROLE_KEY);

  const всёНаМесте = сайт && база && кошелёк;
  res.setHeader("Cache-Control", "no-store");

  /* ?deep=1 — заодно спросить внешние узлы и замерить время ответа:
     по нему видно, отвечает ли серверу сеть Solana и tonapi, или
     кошелёк показывает нули потому, что узел молчит. */
  let узлы;
  if (req.query && req.query.deep) {
    const замер = async (имя, запрос) => {
      const t0 = Date.now();
      try {
        const r = await запрос();
        return { [имя]: { ms: Date.now() - t0, status: r.status, ok: r.ok, body: (await r.text()).slice(0, 160) } };
      } catch (e) {
        return { [имя]: { ms: Date.now() - t0, error: String((e && e.message) || e).slice(0, 160) } };
      }
    };
    const rpc = process.env.SOLANA_RPC || "https://api.mainnet-beta.solana.com";
    const части = await Promise.all([
      замер("solanaRpc", () => fetch(rpc, {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ jsonrpc: "2.0", id: 1, method: "getSlot" }),
        signal: AbortSignal.timeout(10000),
      })),
      замер("tonapi", () => fetch("https://tonapi.io/v2/status", {
        headers: process.env.TONAPI_KEY ? { Authorization: `Bearer ${process.env.TONAPI_KEY}` } : {},
        signal: AbortSignal.timeout(10000),
      })),
    ]);
    узлы = Object.assign({}, ...части);
  }
  return res.status(всёНаМесте ? 200 : 503).json({
    ok: всёНаМесте,
    site: сайт,
    db: база,
    solanaLaunch: запуск,
    appWallet: кошелёк,
    tonNetwork: process.env.TON_TESTNET === "1" ? "testnet" : "mainnet",
    solanaCluster: /devnet/.test(process.env.SOLANA_RPC || "") ? "devnet"
      : /testnet/.test(process.env.SOLANA_RPC || "") ? "testnet" : "mainnet-beta",
    uptime: Math.round(process.uptime()),
    ...(узлы ? { nodes: узлы } : {}),
  });
}
