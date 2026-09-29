/* ---------------------------------------------------------
   tonLaunch.js — REAL on-chain memecoin launch via TonConnect.

   Replaces the previous fully-simulated TokenLaunchOverlay flow with
   actual blockchain transactions:
     1) upload logo + TEP-64 off-chain metadata JSON to public storage
     2) deploy a standard TEP-74 Jetton minter, signed by the user's
        connected wallet through TonConnect (no server-side private key
        ever touches this — the user approves every transaction)
     3) wait for the deploy to land on-chain
     4) create a TON/Jetton liquidity pool on STON.fi, seeded with the
        jetton supply share + the TON amount the user committed
     5) wait for the pool transaction to confirm

   REQUIRED NEW DEPENDENCIES (not in the project yet — run before use):
     npm install @ton-community/assets-sdk @ton/ton @ston-fi/sdk @orbs-network/ton-access

   IMPORTANT — read before shipping to mainnet:
   - This code was written without the ability to run it against a live
     network or verify it compiles against the exact package versions
     you'll install. Library APIs on the TON ecosystem move fast.
   - TEST ON TESTNET FIRST with small amounts. Confirm the minter
     deploys, the pool appears on STON.fi's testnet UI, and a test
     buy/sell round-trips correctly, before enabling this on mainnet.
   - Every step that moves funds goes through `tonConnectUI.sendTransaction`,
     which always shows the user their wallet's own approval screen with
     the exact amount — nothing is auto-signed or hidden.

   RPC ENDPOINT — why this uses TON Access instead of a hardcoded host:
   A hardcoded single host (e.g. testnet-v4.tonhubapi.com, or even the
   correctly-named sandbox-v4.tonhubapi.com) is a single point of failure
   from inside a browser/Telegram WebView: if that specific node is down,
   slow, or doesn't send permissive CORS headers to your app's origin,
   every request just times out. @orbs-network/ton-access
   (getHttpV4Endpoint) is built for this: it's a free, decentralized proxy
   in front of multiple TON API v4 nodes, explicitly designed for
   client-side dapp use, and it auto-selects a healthy node instead of
   pinning you to one.

   REVISION 2 — ton-access's own node-manager is itself unreachable here:
   Testing surfaced that BOTH getHttpV4Endpoint() and AssetsSDK's own
   createApi() fail identically — a SyntaxError parsing the response from
   ton.access.orbs.network/mngr/nodes, meaning that call never gets back
   valid JSON at all (blocked host, WAF/interstitial page, etc. from
   inside this environment). Every path that depends on ton-access's node
   manager is therefore unusable here, not just intermittently slow — so
   this revision stops depending on it as anything but a best-effort first
   try, and always falls back to a manually-built TonClient4 pointed at a
   known-good hardcoded v4 host (same list probeEndpoint already uses).
   AssetsSDK is now ALSO always constructed from that same manual
   TonClient4 (never from createApi()), since createApi() was observed to
   fail via the exact same broken call and was only ever adding a slow,
   guaranteed-to-fail network round trip before falling back anyway.

   REVISION 4 — deployJetton() no longer used as a combined send+wait call:
   The diagnostic trail showed getAccountLite succeeding, then all 3
   deployJetton retries failing identically with the exact same
   "Exceeded number of retries" — with NO "requesting wallet approval"
   log line ever appearing in between. deployJetton() is a convenience
   wrapper that (a) sends the deploy message via `sender`, then (b)
   internally polls the raw `client` it was built with to confirm the
   contract went active — a SEPARATE poll from this file's own
   waitForActive(), using the same fallback RPC host that Revision 3
   already proved can serve a stuck/stale block height. That internal
   poll is what was throwing, independent of whether the deploy message
   ever reached the wallet.

   Fix: the jetton minter's address is deterministic (computed from its
   code + init data, known before any transaction lands), so it's
   obtained via sdk.openJetton() without deploying anything. The actual
   deploy message is then sent explicitly via jetton.sendDeploy(sender,
   ...), and confirmation relies solely on this file's own waitForActive
   (which already goes through tonapi.io, not the flaky raw client).
   AssetsSDK's own internal wait-for-deploy is never invoked, so it can
   no longer be the thing exhausting retries.

   DEPLOY RETRY — why the deploy send is still wrapped in its own retry
   loop: even with a confirmed-reachable RPC endpoint, a single send
   attempt can still hit a transient wallet/network hiccup, so the send
   itself gets a few retries with backoff before surfacing an error.

   DIAGNOSTICS:
   The original version could fail with a bare, generic
   "Exceeded number of retries" message coming from deep inside one of
   the TON SDK libraries (TonClient4 / AssetsSDK / ton-access), with no
   indication of *which* call failed or *why*. Every network-touching
   step below is now wrapped in its own try/catch that:
     - logs the raw underlying error to the console (console.error/warn,
       prefixed "[launch-debug]") so it's visible even inside a Telegram
       WebView via remote debugging or a debug badge in the UI,
     - rethrows a new Error with a stage-specific Russian message plus
       the original error's text appended, so whatever bubbles up to
       TokenLaunchOverlay's error screen is actually actionable instead
       of a dead end.
   waitForActive() also now tracks and reports the last polling error
   instead of silently swallowing every failed attempt.

   REVISION 8 — combined into a single wallet approval:
   Previously the user had to approve THREE separate TonConnect
   transactions in a row (jetton deploy, premint, STON.fi liquidity),
   each opening its own wallet popup. tonConnectSender() now optionally
   collects messages into a `batch` array instead of sending them
   immediately (see the `collector` param and buildTonConnectMessage()).
   launchRealToken() uses that to build all three messages first — the
   jetton minter's own address is deterministic and known before any
   deploy happens, and the STON.fi pool address is likewise derivable
   from router+token pair without the pool existing yet — then flushes
   them as ONE tonConnectUI.sendTransaction call (TonConnect supports up
   to 4 messages per transaction). The user now approves the whole
   launch once. Waiting for on-chain confirmation (waitForActive) still
   happens afterward, unchanged, and a pool-message failure remains
   non-fatal exactly as before — deploy + premint still go out even if
   the STON.fi call couldn't be prepared.
--------------------------------------------------------- */

import { Address, beginCell, toNano, storeStateInit } from "@ton/core";
import { TonClient4 } from "@ton/ton";
import { getHttpV4Endpoint } from "@orbs-network/ton-access";
// Точечные импорты вместо корневого модуля. Корень тянет за собой
// хранилище на Pinata, а с ним axios с несколькими высокими уязвимостями
// — и всё это уезжало в пакет приложения, хотя из библиотеки нужны
// только два низкоуровневых класса. Сам AssetsSDK здесь ни разу не
// вызывался: объект создавался и оставался неиспользованным.
import { JettonMinter } from "@ton-community/assets-sdk/dist/jetton/JettonMinter";
import { JettonWallet } from "@ton-community/assets-sdk/dist/jetton/JettonWallet";
import {
  curveContract,
  poolContract,
  buildSetCurveBody,
  buildBuyBody,
  buildSetJettonWalletBody,
  CURVE_PARAMS,
  CURVE_TOTAL_SUPPLY,
  CURVE_GAS_BUY_OVERHEAD,
} from "./curveConfig";
import { supabase } from "./supabaseClient";

/* ---------------------------------------------------------
   1. TonConnect -> ton-core Sender adapter

   buildTonConnectMessage() turns a ton-core-shaped send() argument
   (`{ to, value, body?, init?, bounce? }` — the same shape
   JettonMinter.sendDeploy/sendMint and the STON.fi router's
   getProvideLiquidityTonTxParams() all produce) into the plain
   `{ address, amount, payload?, stateInit? }` object TonConnect's
   sendTransaction() expects inside its `messages` array. Pulled out
   of tonConnectSender.send() so the exact same encoding can be reused
   both for a single immediate send AND for building up several
   messages that get flushed together in one sendTransaction call.
--------------------------------------------------------- */
function buildTonConnectMessage(args) {
  // ton-core's internal() helper (used by JettonMinter.sendDeploy) sets
  // bounce:false for deploy messages (stateInit present, account doesn't
  // exist yet) and bounce:true otherwise. Respect the real flag instead
  // of always encoding bounceable, since a mismatch is a plausible
  // reason a wallet's local emulator refuses to simulate the transaction.
  const bounceable = args.bounce !== undefined ? args.bounce : !args.init;
  const message = {
    address: args.to.toString({ urlSafe: true, bounceable }),
    amount: args.value.toString(),
  };
  if (args.body) {
    message.payload = args.body.toBoc().toString("base64");
  }
  if (args.init) {
    message.stateInit = beginCell()
      .store(storeStateInit(args.init))
      .endCell()
      .toBoc()
      .toString("base64");
  }
  return message;
}

/* When `collector` is passed, send() no longer opens a wallet prompt of
   its own — it just appends the ton-core send args to that array and
   resolves immediately. This lets library calls that are normally
   "build message + send it right now" (JettonMinter.sendDeploy,
   JettonMinter.sendMint) instead just contribute a message to a batch
   that the caller flushes with a single tonConnectUI.sendTransaction()
   later — one wallet approval covering all of them, instead of one
   approval per call. Without a collector, behavior is unchanged: every
   call to send() immediately opens the wallet for that one message. */
function tonConnectSender(tonConnectUI, walletAddress, network = "mainnet", log = console.log, warn = console.warn, collector = null) {
  return {
    address: Address.parse(walletAddress),
    async send(args) {
      if (collector) {
        collector.push(args);
        log(`sender.send: queued message ${collector.length}/${collector.length} for the combined transaction (to ${args.to.toString()}, amount ${args.value.toString()}${args.init ? ", with stateInit" : ""}) — no wallet prompt yet`);
        return;
      }
      const message = buildTonConnectMessage(args);
      // Deploy failures have twice now shown identical results on every
      // retry, which means the actual problem isn't visible from outside
      // deployJetton — we can't tell from the "Exceeded number of retries"
      // message alone whether the wallet was ever even asked to sign, or
      // whether it signed and this is purely a confirmation-polling issue.
      // Logging around the one call that actually leaves this app (the
      // TonConnect approval request) answers that directly the next time
      // this happens, since it's included in the error screen's trail.
      log(`sender.send: requesting wallet approval — to ${message.address} (bounceable=${args.bounce !== undefined ? args.bounce : !args.init}), amount ${message.amount}${message.stateInit ? ", with stateInit" : ""}`);
      try {
        await tonConnectUI.sendTransaction({
          validUntil: Math.floor(Date.now() / 1000) + 300,
          network: network === "testnet" ? "-3" : "-239",
          messages: [message],
        });
        log("sender.send: wallet approved, transaction submitted");
      } catch (e) {
        warn(`sender.send: wallet did not approve / send failed: ${describeError(e)}`);
        throw e;
      }
    },
  };
}

/* ---------------------------------------------------------
   2. Metadata — upload logo + TEP-64 off-chain JSON to Supabase Storage
--------------------------------------------------------- */
// Расширение берём из типа файла, а не из его имени: имя приходит от
// пользователя, и «logo.png/../../чужая-папка» превратилось бы в путь
// мимо своей директории.
const IMAGE_EXT_BY_TYPE = {
  "image/png": "png",
  "image/jpeg": "jpg",
  "image/webp": "webp",
  "image/gif": "gif",
  "image/svg+xml": "png", // svg не принимаем: он умеет исполнять скрипты
};

async function uploadJettonAssets({ logoFile, name, symbol, description }) {
  // Папка своя у каждого пользователя. Раньше первым сегментом стояло
  // время, и при upsert любой вошедший мог перезаписать чужой
  // metadata.json — то есть подменить имя, символ и картинку уже
  // выпущенного токена. Своя папка плюс запрет перезаписи это исключают,
  // а политика хранилища (supabase_storage_policies.sql) сверяет первый
  // сегмент пути с идентификатором пользователя.
  const { data: auth } = await supabase.auth.getUser();
  const uid = auth && auth.user && auth.user.id;
  if (!uid) throw new Error("Нужно войти в аккаунт, чтобы загрузить логотип токена");

  const stamp = Date.now();
  const contentType = logoFile.type || "image/png";
  const ext = IMAGE_EXT_BY_TYPE[contentType] || "png";
  const imagePath = `${uid}/${stamp}/logo.${ext}`;

  // WebKit inside Telegram's in-app WKWebView has a known bug where
  // fetch() silently fails with the bare message "Load failed" when the
  // request body is a streamed File/Blob — the body never actually gets
  // sent, so the request never reaches the server at all (no useful
  // status code, no CORS error, nothing — exactly the symptom seen here).
  // Reading the file into a plain ArrayBuffer first sends it as a normal
  // binary body instead, sidestepping that streaming path entirely.
  const imageBuffer = await logoFile.arrayBuffer();

  const { error: imgErr } = await supabase.storage
    .from("token-assets")
    .upload(imagePath, imageBuffer, { upsert: false, contentType });
  if (imgErr) {
    // Surface everything Supabase actually gave back (status/statusText
    // included, when present) instead of just imgErr.message, so a
    // missing bucket / RLS-policy rejection reads as an actual reason
    // instead of collapsing into the same "Load failed" wall of text.
    const status = imgErr.statusCode || imgErr.status;
    const detail = [imgErr.message, status ? `(HTTP ${status})` : null].filter(Boolean).join(" ");
    throw new Error(`Logo upload failed: ${detail}`);
  }
  const { data: imgData } = supabase.storage.from("token-assets").getPublicUrl(imagePath);
  const imageUrl = imgData.publicUrl;

  const metadata = {
    name,
    symbol,
    description: description || "",
    image: imageUrl,
    decimals: 9,
  };
  const metaPath = `${uid}/${stamp}/metadata.json`;
  // Same fix applied here: encode to raw bytes rather than passing a Blob.
  const metaBuffer = new TextEncoder().encode(JSON.stringify(metadata));
  const { error: metaErr } = await supabase.storage
    .from("token-assets")
    .upload(metaPath, metaBuffer, { upsert: false, contentType: "application/json" });
  if (metaErr) {
    const status = metaErr.statusCode || metaErr.status;
    const detail = [metaErr.message, status ? `(HTTP ${status})` : null].filter(Boolean).join(" ");
    throw new Error(`Metadata upload failed: ${detail}`);
  }
  const { data: metaData } = supabase.storage.from("token-assets").getPublicUrl(metaPath);

  return { imageUrl, metadataUrl: metaData.publicUrl };
}

/* ---------------------------------------------------------
   2b. Raw connectivity probe — a plain fetch() with its own hard
   timeout, deliberately bypassing TonClient4/AssetsSDK's internal
   retry logic. If this fails, the problem is basic network reachability
   (blocked host, no internet, CORS) — not a library/version bug. If
   this succeeds but deployJetton still throws "Exceeded number of
   retries", the problem is inside the SDK call itself (version
   mismatch, malformed request, wallet-state read failing, etc).

   Known-good TON API v4 hosts are used as a fallback list if the
   TON Access-selected endpoint doesn't answer within PROBE_TIMEOUT_MS —
   this lets the app try a different node instead of giving up.
--------------------------------------------------------- */
const PROBE_TIMEOUT_MS = 8000;
const FALLBACK_V4_ENDPOINTS = {
  mainnet: ["https://mainnet-v4.tonhubapi.com"],
  testnet: ["https://testnet-v4.tonhubapi.com", "https://sandbox-v4.tonhubapi.com"],
};

async function probeEndpoint(endpoint) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), PROBE_TIMEOUT_MS);
  try {
    const res = await fetch(`${endpoint}/block/latest`, { signal: controller.signal });
    clearTimeout(timer);
    if (!res.ok) {
      return { ok: false, reason: `HTTP ${res.status}` };
    }
    const json = await res.json().catch(() => null);
    if (!json || typeof json !== "object") {
      return { ok: false, reason: "unexpected response body" };
    }
    return { ok: true };
  } catch (e) {
    clearTimeout(timer);
    const reason = e?.name === "AbortError" ? `timed out after ${PROBE_TIMEOUT_MS}ms` : (e?.message || String(e));
    return { ok: false, reason };
  }
}

async function pickWorkingEndpoint(preferredEndpoint, network, log = console.log, warn = console.warn) {
  const candidates = [preferredEndpoint, ...(FALLBACK_V4_ENDPOINTS[network] || [])];
  const tried = [];
  for (const candidate of candidates) {
    if (!candidate || tried.includes(candidate)) continue;
    tried.push(candidate);
    log(`probing RPC endpoint: ${candidate}`);
    const result = await probeEndpoint(candidate);
    if (result.ok) {
      log(`endpoint OK: ${candidate}`);
      return candidate;
    }
    warn(`endpoint unreachable: ${candidate} - ${result.reason}`);
  }
  throw new Error(
    `Ни один TON RPC-узел не ответил (пробовали: ${tried.join(", ")}). ` +
    `Похоже на проблему сети/файрвола на устройстве, а не на код приложения.`
  );
}

/* ---------------------------------------------------------
   3. Poll until an address is an active contract on-chain.

   REVISION 3 — why this no longer polls through TonClient4 at all:
   The retry wrapper around deployJetton (added in revision 2) made
   zero difference — all 3 attempts failed with the exact same
   "Exceeded number of retries" instantly, one after another. That
   rules out a transient node hiccup: a real flake would vary between
   attempts. Identical, deterministic failure on every single try means
   whatever this was polling against was never going to change — most
   likely the community-run fallback host (testnet-v4.tonhubapi.com)
   was serving a stuck/stale block height, so every "did it go active
   yet" check was really asking about the same frozen block over and
   over, long after the deploy had actually gone through.

   Fix: stop asking that RPC host at all for this specific check. This
   app already depends on tonapi.io successfully elsewhere (the wallet
   balance fetch in App.jsx uses testnet.tonapi.io/tonapi.io directly
   and works) — so contract-active polling now goes through tonapi.io's
   own REST endpoint instead, which reports account status directly
   without needing a live block seqno from the same node being polled.
   Now tracks the last error seen during polling instead of silently
   discarding it, so a timeout tells you *why* it never became active
   (bad RPC node, wrong network, genuinely still pending, etc.) rather
   than just "timed out".
--------------------------------------------------------- */
async function fetchAccountStatusViaTonapi(address, network) {
  const host = network === "testnet" ? "testnet.tonapi.io" : "tonapi.io";
  const res = await fetch(`https://${host}/v2/blockchain/accounts/${address.toString()}`);
  if (!res.ok) throw new Error(`tonapi.io ${res.status}`);
  const body = await res.json().catch(() => null);
  return body && typeof body.status === "string" ? body.status : null;
}

/* fetchJettonWalletBalance / waitForJettonBalance — the jetton minter
   contract going "active" (waitForActive above) only proves the DEPLOY
   message landed on-chain. It says nothing about whether the separate
   premint message — sent in the same combined transaction, see
   REVISION 8 — was actually processed rather than bounced (insufficient
   gas on that specific message, transient routing issue, etc). Without
   this check the app could report a successful launch purely because
   the contract exists, while the creator's own jetton balance is still
   zero. This polls the creator's jetton-wallet balance for that token
   directly via tonapi.io until it's nonzero (or times out), so a
   bounced premint surfaces as a real, actionable error instead of a
   false "success". */
async function fetchJettonWalletBalance(ownerAddress, jettonMasterAddress, network) {
  const host = network === "testnet" ? "testnet.tonapi.io" : "tonapi.io";
  const res = await fetch(`https://${host}/v2/accounts/${ownerAddress.toString()}/jettons/${jettonMasterAddress.toString()}`);
  if (res.status === 404) return 0n; // no jetton wallet indexed yet = 0 balance so far
  if (!res.ok) throw new Error(`tonapi.io ${res.status}`);
  const body = await res.json().catch(() => null);
  if (!body || typeof body.balance !== "string") return 0n;
  try { return BigInt(body.balance); } catch { return 0n; }
}

async function waitForJettonBalance(ownerAddress, jettonMasterAddress, network, { timeoutMs = 60000, intervalMs = 4000, log = console.log, warn = console.warn } = {}) {
  const start = Date.now();
  let lastErr = null;
  let attempts = 0;
  while (Date.now() - start < timeoutMs) {
    attempts += 1;
    try {
      const balance = await fetchJettonWalletBalance(ownerAddress, jettonMasterAddress, network);
      if (balance > 0n) {
        log(`premint confirmed after ${attempts} attempt(s): jetton wallet balance = ${balance.toString()} base units`);
        return balance;
      }
    } catch (e) {
      lastErr = e;
      warn(`jetton balance poll #${attempts} failed: ${describeError(e)}`);
    }
    await new Promise((r) => setTimeout(r, intervalMs));
  }
  const suffix = lastErr ? ` (last error: ${describeError(lastErr)})` : " (balance stayed at 0 — the mint message most likely bounced)";
  throw new Error(`Баланс токенов на вашем кошельке так и не появился${suffix}`);
}

/* describeError — up to now every catch block only ever logged
   `e?.message`. When a library throws a short, generic string like
   "Exceeded number of retries" that message alone tells us nothing
   about what's actually underneath it — three separate diagnostic
   passes chased that string in three different directions with no way
   to tell which guess was right. This pulls every signal an Error
   object might carry (message, a slice of the stack so we know which
   file/line actually threw, `.cause` if the library wrapped a deeper
   error, and any other enumerable own properties some SDKs attach
   like `.code`/`.response`) so the NEXT failure is diagnosable from
   the trail alone instead of requiring another guess. */
function describeError(e) {
  if (!e) return String(e);
  const parts = [e.message || String(e)];
  if (e.cause) parts.push(`cause: ${describeError(e.cause)}`);
  try {
    const extra = Object.getOwnPropertyNames(e)
      .filter((k) => !["message", "stack", "cause"].includes(k))
      .map((k) => { try { return `${k}=${JSON.stringify(e[k])}`; } catch { return `${k}=<unserializable>`; } });
    if (extra.length) parts.push(`extra: ${extra.join(", ")}`);
  } catch { /* ignore */ }
  if (e.stack) {
    const firstLines = e.stack.split("\n").slice(0, 3).join(" | ");
    parts.push(`at: ${firstLines}`);
  }
  return parts.join(" — ");
}

async function waitForActive(address, network, { timeoutMs = 90000, intervalMs = 3000, label = "", log = console.log, warn = console.warn } = {}) {
  const start = Date.now();
  let lastErr = null;
  let attempts = 0;
  while (Date.now() - start < timeoutMs) {
    attempts += 1;
    try {
      const status = await fetchAccountStatusViaTonapi(address, network);
      if (status === "active") {
        log(`${label || "waitForActive"}: active after ${attempts} attempt(s)`);
        return true;
      }
    } catch (e) {
      lastErr = e;
      warn(`${label || "waitForActive"} poll #${attempts} failed: ${describeError(e)}`);
    }
    await new Promise((r) => setTimeout(r, intervalMs));
  }
  const suffix = lastErr ? ` (last error: ${lastErr.message || lastErr})` : " (no errors, contract just never went active in time)";
  throw new Error(`Timed out waiting for on-chain confirmation${label ? ` [${label}]` : ""}${suffix}`);
}

/* Retries an arbitrary async step a few times with a short, increasing
   delay before giving up. */
/* Wraps a TonClient4 instance so every RPC method call it makes is logged
   (call + success/failure) before deployJetton ever gets to use it. This
   was added after the trail showed deployJetton failing WITHOUT ever
   reaching sender.send (no "requesting wallet approval" line at all) —
   meaning the retries being exhausted are on some internal read call
   happening before the deploy message is even built/sent, not on wallet
   confirmation or post-deploy polling. Only known async RPC methods are
   wrapped (not e.g. .open(), which must return synchronously) — anything
   else is passed through bound to the real client so behavior/`this`
   stay correct. */
function instrumentApi(client, log, warn, network) {
  const ASYNC_METHODS = [
    "getLastBlock", "getAccount", "getAccountLite", "getAccountTransactions",
    "getConfig", "runMethod", "sendMessage", "isContractDeployed",
  ];
  return new Proxy(client, {
    get(target, prop, receiver) {
      // isContractDeployed is almost certainly the exact call deployJetton's
      // internal "wait until active" polling uses (this is the standard
      // provider method for that check across TON SDKs). Revision 3 already
      // proved the raw/fallback RPC host can serve a stuck, stale block
      // height for this kind of check — and the trail shows deployJetton
      // failing with "Exceeded number of retries" right after a successful
      // getAccountLite, which matches that exact failure mode. Routing this
      // one specific check through tonapi.io (same reliable source our own
      // waitForActive already uses) fixes deployJetton's internal wait
      // without needing to reverse-engineer or reimplement its send logic.
      if (prop === "isContractDeployed") {
        return async function (address) {
          log("client.isContractDeployed() called (routed via tonapi.io)");
          try {
            const status = await fetchAccountStatusViaTonapi(address, network);
            const deployed = status === "active";
            log(`client.isContractDeployed() OK -> ${deployed} (status: ${status})`);
            return deployed;
          } catch (e) {
            warn(`client.isContractDeployed() via tonapi.io failed: ${describeError(e)}`);
            throw e;
          }
        };
      }
      const orig = Reflect.get(target, prop, receiver);
      if (typeof orig !== "function") return orig;
      if (!ASYNC_METHODS.includes(prop)) return orig.bind(target);
      return async function (...args) {
        log(`client.${String(prop)}() called`);
        try {
          const result = await orig.apply(target, args);
          log(`client.${String(prop)}() OK`);
          return result;
        } catch (e) {
          warn(`client.${String(prop)}() failed: ${describeError(e)}`);
          throw e;
        }
      };
    },
  });
}

async function withRetries(fn, { attempts = 3, delayMs = 2500, label = "", log = console.log, warn = console.warn } = {}) {
  let lastErr;
  for (let i = 1; i <= attempts; i++) {
    try {
      if (i > 1) log(`${label || "step"}: retry attempt ${i}/${attempts}`);
      return await fn();
    } catch (e) {
      lastErr = e;
      warn(`${label || "step"} attempt ${i}/${attempts} failed: ${describeError(e)}`);
      if (i < attempts) await new Promise((r) => setTimeout(r, delayMs * i));
    }
  }
  throw lastErr;
}

/* ---------------------------------------------------------
   4. Main orchestration — called from the app's launch flow.
--------------------------------------------------------- */
export async function launchRealToken({
  tonConnectUI,
  walletAddress,
  form,
  logoFile,
  buyAmountTon,
  treasuryAddress, // wallet that receives the "стартовая покупка" payment (same TREASURY_ADDRESS App.jsx uses for regular buys)
  feeAddress, // wallet that receives the platform commission cut of that payment
  feePercent = 0, // keep in sync with FEE_PERCENT in App.jsx
  network = "mainnet", // switch to "testnet" while validating this flow
  onStage,
}) {
  // Diagnostic trail shown directly in the error screen — since a
  // Telegram WebView on a phone has no devtools console, every
  // [launch-debug] line also gets pushed here so it reaches the user
  // even without remote debugging.
  const trail = [];
  function log(msg) {
    console.log("[launch-debug]", msg);
    trail.push(msg);
  }
  function warn(msg) {
    console.warn("[launch-debug]", msg);
    trail.push(`⚠ ${msg}`);
  }
  function fail(userMessage, e) {
    const detail = describeError(e);
    console.error("[launch-debug]", userMessage, e);
    trail.push(`✗ ${userMessage}: ${detail}`);
    const err = new Error(`${userMessage}: ${detail}\n\nЛог:\n${trail.join("\n")}`);
    throw err;
  }

  if (!walletAddress) throw new Error("Wallet not connected");
  if (!logoFile) throw new Error("Logo file is required");

  const name = form.name.trim();
  const symbol = form.ticker.trim().toUpperCase();
  const totalSupply = 1_000_000_000n; // matches TOKEN_FIXED_SUPPLY in App.jsx
  const decimals = 9n;

  // ---- Stage 0: metadata upload ----
  onStage?.(0);
  let metadataUrl;
  let logoUrl = null;
  try {
    const uploaded = await uploadJettonAssets({
      logoFile,
      name,
      symbol,
      description: form.desc.trim(),
    });
    metadataUrl = uploaded.metadataUrl;
    logoUrl = uploaded.imageUrl;
    log(`metadata uploaded: ${metadataUrl}`);
  } catch (e) {
    fail("Не удалось загрузить метаданные токена", e);
  }

  // Рабочий узел TON API v4. Раньше сначала пробовался createApi() из
  // библиотеки, но он приходил из её корневого модуля — а тот тянет за
  // собой хранилище на Pinata с уязвимым axios. Своего кода тут на
  // десяток строк: спросить у TON Access адрес, при неудаче взять из
  // запасного списка и проверить, что узел отвечает.
  let client, sender;
  let taEndpoint = null;
  try {
    taEndpoint = await getHttpV4Endpoint({ network });
    log(`TON Access suggested endpoint: ${taEndpoint} (network: ${network})`);
  } catch (e2) {
    warn(`getHttpV4Endpoint failed, relying on hardcoded fallback list: ${describeError(e2)}`);
  }
  let endpoint;
  try {
    endpoint = await pickWorkingEndpoint(taEndpoint, network, log, warn);
    log(`using RPC endpoint: ${endpoint}`);
  } catch (e2) {
    fail("Не удалось найти рабочий TON RPC-узел", e2);
  }
  try {
    client = new TonClient4({ endpoint });
    log("TonClient4 initialized");
  } catch (e2) {
    fail("Не удалось инициализировать TON-клиент", e2);
  }

  try {
    sender = tonConnectSender(tonConnectUI, walletAddress, network, log, warn);
  } catch (e) {
    fail("Не удалось инициализировать sender", e);
  }

  // batch/batchSender: collects the deploy, premint and (if built
  // successfully) liquidity-pool messages below WITHOUT opening the
  // wallet, so all of them can be flushed in a single
  // tonConnectUI.sendTransaction call further down — one wallet
  // approval for the whole launch instead of three separate ones.
  // TonConnect's own spec caps a single transaction at 4 messages,
  // which comfortably covers these 3.
  const batch = [];
  const batchSender = tonConnectSender(tonConnectUI, walletAddress, network, log, warn, batch);

  // Instrumented copy — used ONLY for our own standalone diagnostic call
  // below, never handed to AssetsSDK (see note above).
  const sdkApi = instrumentApi(client, log, warn, network);


  // Direct low-level probe: deployJetton likely needs to read the
  // sender wallet's on-chain account state internally (to size the
  // deploy message / check balance) via calls like getAccountLite.
  // Testing that exact call path here — separately from the generic
  // /block/latest probe above — tells us whether the failure is at
  // the basic TonClient4 method level (would fail here too) or purely
  // inside AssetsSDK's own deployJetton implementation (this succeeds,
  // deployJetton still fails).
  try {
    const seq = (await client.getLastBlock()).last.seqno;
    await client.getAccountLite(seq, Address.parse(walletAddress));
    log(`low-level getAccountLite check OK (block seqno ${seq})`);
  } catch (e) {
    warn(`low-level getAccountLite check failed: ${describeError(e)}`);
  }

  // ---- Stage 1: build every message first (deploy + premint + STON.fi
  // liquidity), all queued into `batch` via batchSender instead of each
  // opening its own wallet prompt — then send them all as ONE
  // TonConnect transaction below, so the user approves the whole launch
  // exactly once instead of three separate times. ----
  onStage?.(1);
  let jettonMasterAddress;
  try {
    // REVISION 7 — both deployJetton ("Exceeded number of retries",
    // zero variation, no wallet-approval log ever) and createJetton
    // ("is not a function") are dead ends now confirmed live, twice
    // each. The common thread: whatever throws inside these high-level
    // SDK methods gets caught by ton-core's own internal retry()
    // helper, which discards the real error and rethrows only the
    // generic string "Exceeded number of retries" — so no amount of
    // logging around the OUTSIDE of that call can ever reveal the real
    // cause. Bypassing it entirely: deploy the jetton minter directly
    // via the low-level JettonMinter class (same class assets-sdk uses
    // internally, confirmed exported from the package) using our own
    // batchSender and our own already-proven waitForActive. Any real
    // error here throws with its own message, uncaught by that retry().
    const offchainContent = beginCell().storeUint(0x01, 8).storeStringTail(metadataUrl).endCell();
    const minterContract = JettonMinter.createFromConfig({
      admin: Address.parse(walletAddress),
      content: offchainContent,
    });
    jettonMasterAddress = minterContract.address;
    const explorerHost = network === "testnet" ? "testnet.tonviewer.com" : "tonviewer.com";
    log(`computed jetton minter address (deterministic, no network call): ${jettonMasterAddress.toString()} — https://${explorerHost}/${jettonMasterAddress.toString()}`);
    const minter = client.open(minterContract);
    await minter.sendDeploy(batchSender, toNano("0.05"));
    log("jetton minter deploy message queued");
  } catch (e) {
    fail(
      "Не удалось подготовить деплой jetton-контракта (низкоуровневый deploy через JettonMinter)",
      e
    );
  }

  // Стартовой покупки внутри запуска больше нет. Раньше создатель
  // получал долю выпуском себе на кошелёк, а деньги отдельными
  // переводами уходили казначейству — рынка не было вовсе. Класть
  // покупку в ту же транзакцию тоже нельзя: сообщение до кривой доходит
  // за один шаг, а выпуск запаса до её кошелька — за два, поэтому
  // покупка успела бы прийти раньше токенов, и деньги списались бы
  // впустую. Поэтому запуск — одна транзакция, а покупка делается
  // обычной кнопкой на странице токена, когда запас уже на месте.

  // ---- Рынок токена: бондинг-кривая -------------------------------
  //
  // Раньше здесь готовилось создание пула на STON.fi, но ликвидность в
  // него никогда не отправлялась — вычислялся только будущий адрес, и
  // токен оставался без рынка. Обычному пулу нужна пара TON/токен от
  // кого-то извне, у свежего мемкоина её нет.
  //
  // Кривая сама выступает второй стороной сделки, поэтому торговать
  // можно сразу. Её адрес считается детерминированно из параметров, так
  // что весь запас можно отправить на её будущий кошелёк ещё до того,
  // как она развёрнута — в этой же транзакции.
  let curveAddress = null;
  let curveJettonWallet = null;
  let poolAddress = null;
  try {
    // Пул готовим первым: его адрес зависит только от жетона и
    // параметров площадки, и именно он зашивается в кривую получателем
    // ликвидности. Наоборот не выйдет — оба адреса зависели бы друг от
    // друга, и вычислить нельзя было бы ни один.
    const pool = await poolContract({
      admin: Address.parse(walletAddress),
      jettonMaster: jettonMasterAddress,
      feeWallet: Address.parse(feeAddress),
    });
    poolAddress = pool.address;
    log(`адрес пула (детерминированный, без запроса в сеть): ${poolAddress.toString()}`);

    const curve = await curveContract({
      admin: Address.parse(walletAddress),
      jettonMaster: jettonMasterAddress,
      feeWallet: Address.parse(feeAddress),
      // Куда уйдут деньги после набора порога — в собственный пул этого
      // же токена. Раньше здесь стояло казначейство площадки, и пару на
      // чужой бирже заводили руками: пока её не завели, торговать было
      // негде. Адрес зашивается в контракт навсегда, сменить его нельзя,
      // и это единственный способ вынуть средства из кривой.
      graduationDestination: poolAddress,
    });
    curveAddress = curve.address;
    log(`адрес кривой (детерминированный, без запроса в сеть): ${curveAddress.toString()}`);

    // Весь выпуск минтится сразу на кривую: владельцем кошелька
    // жетона становится она, а не создатель. Продаёт кривая только
    // tokensForSale, остальное держит до выпуска на DEX. Из-за этого создатель
    // больше не получает долю бесплатно — он покупает через кривую на
    // общих основаниях, как и все остальные.
    const minter = client.open(JettonMinter.createFromConfig({
      admin: Address.parse(walletAddress),
      content: beginCell().storeUint(0x01, 8).storeStringTail(metadataUrl).endCell(),
    }));
    await minter.sendMint(batchSender, curveAddress, CURVE_TOTAL_SUPPLY);
    log(`выпуск на кривую поставлен в очередь: ${CURVE_TOTAL_SUPPLY.toString()} базовых единиц`);

    // Адрес кошелька жетона у кривой выводится из пары «владелец +
    // мастер жетона», поэтому считается офлайн — сеть спрашивать не о
    // чем. Благодаря этому привязка едет тем же сообщением, что и
    // развёртывание: одно сообщение несёт и stateInit, и тело.
    // Имена полей обязаны быть ровно owner/jettonMaster: конфиг читается
    // по ним, а при опечатке в адреса молча уходит undefined и получается
    // посторонний адрес — кривая отправляла жетоны в пустоту, покупатель
    // платил и не получал ничего.
    curveJettonWallet = JettonWallet.createFromConfig({
      owner: curveAddress,
      jettonMaster: jettonMasterAddress,
    }).address;
    log(`кошелёк жетона у кривой (детерминированный): ${curveJettonWallet.toString()}`);

    await batchSender.send({
      to: curveAddress,
      value: toNano("0.05"),
      init: curve.init,
      body: buildSetJettonWalletBody(curveJettonWallet),
      bounce: false,
    });
    log("развёртывание кривой с привязкой кошелька поставлено в очередь");

    // Пул разворачивается сразу, той же транзакцией: потом на это никто
    // не придёт, а без развёрнутого контракта кривая отдала бы
    // ликвидность в пустоту. Ему нужны два адреса — собственный кошелёк
    // жетона и кривая, у которой он примет ликвидность. Оба считаются
    // офлайн, поэтому едут вместе с развёртыванием.
    const poolJettonWallet = JettonWallet.createFromConfig({
      owner: poolAddress,
      jettonMaster: jettonMasterAddress,
    }).address;
    await batchSender.send({
      to: poolAddress,
      value: toNano("0.06"),
      init: pool.init,
      body: buildSetJettonWalletBody(poolJettonWallet),
      bounce: false,
    });
    await batchSender.send({
      to: poolAddress,
      value: toNano("0.03"),
      body: buildSetCurveBody(curveAddress),
      bounce: false,
    });
    log(`развёртывание пула поставлено в очередь, его кошелёк жетона: ${poolJettonWallet.toString()}`);

    // Стартовая покупка создателя — четвёртым сообщением той же
    // транзакции. Раньше это было опасно: покупка доходит до кривой за
    // один шаг, а выпуск запаса до её кошелька — за два, поэтому деньги
    // списывались раньше, чем появлялись токены. Теперь контракт держит
    // такие покупки незакрытыми и при возврате сообщения откатывает
    // сделку и возвращает TON, так что порядок доставки больше не важен.
    const buyTon = Math.max(0, Number(buyAmountTon) || 0);
    if (buyTon > 0) {
      await batchSender.send({
        to: curveAddress,
        value: toNano(buyTon.toFixed(9)) + CURVE_GAS_BUY_OVERHEAD,
        body: buildBuyBody({ queryId: 0n, minTokensOut: 0n }),
        // Именно bounce: true. Если кривая отвергнет покупку (не хватило
        // на газ, порог уже взят), с bounce: false деньги остались бы у
        // неё, а токенов бы не было. С возвратом они придут обратно.
        bounce: true,
      });
      log(`стартовая покупка на ${buyTon} TON поставлена в очередь`);
    }
  } catch (e) {
    fail("Не удалось подготовить развёртывание кривой", e);
  }

  // ---- Первая транзакция: развёртывание жетона, выпуск запаса на
  // кривую и развёртывание самой кривой — три сообщения под одним
  // подтверждением кошелька. ----
  try {
    if (!batch.length) fail("Нечего отправлять — ни одно сообщение не было подготовлено", new Error("empty batch"));
    const messages = batch.map(buildTonConnectMessage);
    log(`запрашиваем одно подтверждение кошелька на ${messages.length} сообщени(я): жетон + запас на кривую + кривая + стартовая покупка`);
    await tonConnectUI.sendTransaction({
      validUntil: Math.floor(Date.now() / 1000) + 300,
      network: network === "testnet" ? "-3" : "-239",
      messages,
    });
    log("wallet approved the combined transaction — all queued messages submitted together");
  } catch (e) {
    fail("Кошелёк не подтвердил транзакцию запуска (жетон + кривая)", e);
  }

  // ---- Stage 2: wait for jetton minter to go active ----
  onStage?.(2);
  try {
    // Testnet indexers (tonapi.io included) can lag well behind mainnet,
    // and a persistent 404 (not "uninit", literally "not found") during
    // polling means tonapi.io doesn't see the account at all yet — that
    // can still just be indexing lag, not necessarily a failed deploy.
    // Longer timeout/interval gives it more room before giving up.
    await waitForActive(jettonMasterAddress, network, {
      label: "jetton minter",
      timeoutMs: 180000,
      intervalMs: 4000,
      log,
      warn,
    });
  } catch (e) {
    // Cross-check against the raw client directly (not tonapi.io) before
    // failing — this tells us whether the deploy message genuinely never
    // landed on-chain (still "uninit"/nonexist here too — likely bounced,
    // e.g. insufficient TON on the wallet for gas) versus tonapi.io simply
    // being slow to index it (raw client already shows it deployed).
    try {
      const rawState = await client.getAccountLite(
        (await client.getLastBlock()).last.seqno,
        jettonMasterAddress
      );
      log(`cross-check via raw client: account state = ${rawState?.account?.state?.type || "unknown"}`);
      if (rawState?.account?.state?.type === "active") {
        warn("tonapi.io was lagging but the raw client confirms the contract IS active — continuing");
      } else {
        fail(
          `Токен отправлен в сеть, но контракт так и не появился on-chain (адрес ${jettonMasterAddress.toString()}). Проверьте баланс TON на кошельке (на деплой нужно ~0.05 TON сверх комиссии) и адрес в тестнет-эксплорере (testnet.tonviewer.com)`,
          e
        );
      }
    } catch (e2) {
      fail("Токен отправлен в сеть, но контракт не подтвердился вовремя", e);
    }
  }

  // ---- Этап 2b: ждём, пока торговый запас доедет до кошелька кривой.
  // Пока его там нет, покупать нечего: кривая не сможет отдать жетоны, а
  // деньги покупателя уже спишутся. ----
  let mintedTokens = 0;
  try {
    await waitForJettonBalance(curveAddress, jettonMasterAddress, network, { log, warn, timeoutMs: 120000 });
    log("торговый запас на кривой подтверждён");

    // Адрес кошелька считался офлайн, поэтому сверяем его с тем, что
    // выдаёт сам мастер жетона. Если разошлись — кривая будет слать
    // жетоны в пустоту, и покупателям туда лучше не заходить.
    const minterCheck = client.open(JettonMinter.createFromConfig({
      admin: Address.parse(walletAddress),
      content: beginCell().storeUint(0x01, 8).storeStringTail(metadataUrl).endCell(),
    }));
    // Сверка адреса — необязательная страховка. Её сбой (сеть, лимит
    // API) не значит, что запуск не удался: запас выше уже подтверждён
    // чтением баланса. Раньше исключение отсюда ловил общий обработчик и
    // выдавал «запас не появился», хотя он появился.
    let realWallet = null;
    try {
      realWallet = await minterCheck.getWalletAddress(curveAddress);
    } catch (e) {
      warn(`Не удалось сверить адрес кошелька жетона (${describeError(e)}) — пропускаем проверку`);
    }
    if (realWallet && !realWallet.equals(curveJettonWallet)) {
      fail(
        `Кошелёк жетона у кривой определён неверно: привязан ${curveJettonWallet.toString()}, а мастер выдаёт ${realWallet.toString()}. Торговать таким токеном нельзя — запустите его заново`,
        new Error("jetton wallet mismatch"),
      );
    }
    log("привязанный кошелёк жетона совпал с адресом от мастера — токен торгуется");

    // Стартовая покупка ехала в той же транзакции: ждём, пока жетоны
    // дойдут до создателя. Если не дошли — контракт вернул деньги, и об
    // этом надо сказать, а не молчать.
    const buyTon2 = Math.max(0, Number(buyAmountTon) || 0);
    if (buyTon2 > 0) {
      try {
        const boughtRaw = await waitForJettonBalance(Address.parse(walletAddress), jettonMasterAddress, network, {
          log,
          warn,
          timeoutMs: 90000,
        });
        mintedTokens = Number(boughtRaw / (10n ** decimals));
        log(`стартовая покупка подтверждена: ${mintedTokens} токенов на кошельке`);
      } catch (e) {
        warn("Стартовая покупка не дошла — если жетоны выдать не удалось, кривая вернула TON обратно на кошелёк. Купить можно с страницы токена.");
      }
    }
  } catch (e) {
    const explorerHost = network === "testnet" ? "testnet.tonviewer.com" : "tonviewer.com";
    fail(
      `Жетон развёрнут, но торговый запас так и не появился на кривой — похоже, сообщение выпуска было отклонено сетью. Проверьте адрес в эксплорере (https://${explorerHost}/${jettonMasterAddress.toString()}) и остаток TON на кошельке`,
      e
    );
  }

  onStage?.(3);
  return {
    jettonMasterAddress: jettonMasterAddress.toString(),
    // Ссылка на логотип, который уже уехал в хранилище на нулевом шаге:
    // без запуска токена не бывает, значит и картинка к этому моменту
    // точно лежит. Приложение раньше грузило её второй раз в другой
    // бакет, и когда та загрузка отваливалась, в базу шёл null —
    // аватарка токена оставалась пустой у всех.
    logoUrl,
    // Кошелёк запустившего. По нему приложение потом показывает, сколько
    // выпуска осталось у создателя и продавал ли он — без адреса такую
    // проверку не сделать, а искать его по истории ненадёжно.
    creatorWallet: walletAddress,
    curveAddress: curveAddress ? curveAddress.toString() : null,
    curveJettonWallet: curveJettonWallet ? curveJettonWallet.toString() : null,
    // Пула на внешней бирже у токена нет и не будет: рынок свой. Пока
    // идёт кривая, торговля через неё, а после порога — через этот пул.
    // Он уже развёрнут и ждёт ликвидность.
    poolAddress: null,
    curvePoolAddress: poolAddress ? poolAddress.toString() : null,
    explorerUrl: `https://tonscan.org/address/${jettonMasterAddress.toString()}`,
    // Real, on-chain-confirmed balance (see waitForJettonBalance above) —
    // use this instead of the pre-launch estimate wherever the app
    // credits the creator's in-app balance, so it always matches what's
    // actually on their wallet.
    mintedTokens,
  };
}
