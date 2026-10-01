import { chromium } from "/home/user/Facet_MiniApp/node_modules/playwright-core/index.mjs";
const ПАПКА = "/home/user/Facet_MiniApp/demo/promo/capture";
const b = await chromium.launch({ executablePath: "/opt/pw-browsers/chromium" });
const p = await b.newPage({ viewport: { width: 393, height: 852 }, hasTouch: true, isMobile: true, deviceScaleFactor: 2 });
const плохо = []; p.on("pageerror", (e) => плохо.push(e.message));
const ИД = "11111111-2222-3333-4444-555555555555";
const ЧЕЛОВЕК = { id: ИД, aud: "authenticated", role: "authenticated", email: "tg42@telegram.local",
  email_confirmed_at: "2026-01-01T00:00:00Z", phone: "", created_at: "2026-01-01T00:00:00Z", updated_at: "2026-01-01T00:00:00Z",
  app_metadata: { provider: "email", providers: ["email"] }, user_metadata: { telegram_id: 42, nickname: "leo", mail_pending: "qwerty@gmail.com" }, identities: [] };
const ПРОФИЛЬ = { id: ИД, nickname: "leo_builds", email: "tg42@telegram.local", bio: "", avatar_url: null, emoji: null,
  verified: false, creator_tier: 0, coins_granted: 0, coins_spent: 0, owned_cosmetics: [], mail_2fa: false };
await p.addInitScript(({ человек }) => {
  const срок = Math.floor(Date.now() / 1000) + 3600;
  const b64 = (о) => btoa(JSON.stringify(о)).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
  const токен = `${b64({ alg: "HS256", typ: "JWT" })}.${b64({ sub: человек.id, aud: "authenticated", role: "authenticated",
    email: человек.email, iss: "https://rinxzaakkhxdbhjghtwa.supabase.co/auth/v1", iat: срок - 3600, exp: срок,
    app_metadata: человек.app_metadata, user_metadata: человек.user_metadata, session_id: "aaaa-bbbb" })}.signature`;
  localStorage.setItem("sb-rinxzaakkhxdbhjghtwa-auth-token", JSON.stringify({ access_token: токен, token_type: "bearer",
    expires_in: 3600, expires_at: срок, refresh_token: "refresh", user: человек }));
  window.Telegram = { WebApp: { initData: "query_id=A&user=%7B%22id%22%3A42%7D&auth_date=1&hash=нет",
    initDataUnsafe: { user: { id: 42 } }, ready() {}, expand() {}, disableVerticalSwipes() {}, enableVerticalSwipes() {},
    HapticFeedback: { impactOccurred() {}, notificationOccurred() {} }, BackButton: { show() {}, hide() {}, onClick() {}, offClick() {} },
    colorScheme: "dark", themeParams: {}, version: "7.0", platform: "ios", onEvent() {}, offEvent() {}, setHeaderColor() {}, setBackgroundColor() {} } };
  localStorage.setItem("mintly_language", "EN");
}, { человек: ЧЕЛОВЕК });
const json = (route, т) => route.fulfill({ status: 200, contentType: "application/json", headers: { "access-control-allow-origin": "*" }, body: JSON.stringify(т) });
const токены = [
  { id: "t1", ticker: "FAK", name: "Фак", chain: "solana", network: "devnet", curve_address: "6iujoZf8", address: "Fb1bhKE4", owner_id: ИД,
    created_at: new Date().toISOString(),
    curve_cache: [{ price_ton: 0.0000029, real_ton: 1.5, graduation_ton: 85, tokens_sold: 100000, supply: 1000000000, fee_bps: 100,
      graduated: false, holders: 1, vol24_ton: 1.5, change24: 4.2, tx24: 1, logo_url: null, updated_at: new Date().toISOString() }] },
];
await p.route("**/*", async (route) => {
  const req = route.request(); const u = req.url();
  if (u.startsWith("http://localhost:5055/") && !u.includes("/api/")) return route.continue();
  if (req.method() === "OPTIONS") return route.fulfill({ status: 204, headers: { "access-control-allow-origin": "*", "access-control-allow-headers": "*", "access-control-allow-methods": "*" } });
  if (u.includes("/auth/v1/user")) return json(route, ЧЕЛОВЕК);
  if (u.includes("/rest/v1/profiles")) return json(route, (req.method() === "GET" && (u.includes("select=%2A") || u.includes("select=*"))) ? ПРОФИЛЬ : [ПРОФИЛЬ]);
  if (u.includes("/rest/v1/tokens")) return json(route, токены);
  if (u.includes("/rest/v1/") || u.includes("/functions/v1/")) return json(route, []);
  if (u.includes("wallet-solana?action=state")) return json(route, { address: "CHwAUWV5E8VA2KF1fDvTa5be5qYqKS38eun5eDRqqdnZ", sol: 4.9 });
  if (u.includes("wallet-ton?action=state")) return json(route, { address: "0:" + "a".repeat(64), ton: 190 });
  if (u.includes("coingecko.com")) return json(route, { "the-open-network": { usd: 3.1 } });
  if (u.includes("geckoterminal.com")) return json(route, { data: { attributes: { price_usd: "190" } } });
  if (u.includes("tonapi.io") && u.includes("/rates")) return json(route, { rates: { TON: { prices: { USD: 3.1 } } } });
  if (u.includes("/api/market-rates")) {
    const SOL = [118.04, 118.65, 119.93, 119.24, 119.69, 119.93, 118.83, 118.31, 118.75, 118.23, 117.68, 118.55, 118.91, 118.73, 118.09, 116.7, 117.12, 116.59, 117.84, 117.8, 117.65, 118.21, 119.0, 119.2, 119.49, 119.56, 119.13, 119.87, 119.63, 119.27, 120.11, 120.87, 121.17, 120.48];
    const TON = [1.616, 1.605, 1.641, 1.651, 1.648, 1.649, 1.645, 1.616, 1.601, 1.605, 1.582, 1.568, 1.563, 1.574, 1.576, 1.565, 1.546, 1.555, 1.535, 1.54, 1.551, 1.57, 1.558, 1.55, 1.561, 1.58, 1.591, 1.597, 1.588, 1.58, 1.572, 1.58, 1.561, 1.543];
    const pts = (a) => a.map((p, i) => ({ t: Date.now() - (a.length - i) * 2.6e6, p }));
    return json(route, { sol: { points: pts(SOL), price: 120.48, change24: 2.07 }, gram: { points: pts(TON), price: 1.543, change24: -4.52 } });
  }
  if (u.includes("/api/")) { console.log("API", u.slice(0,140)); return json(route, { exists: true, ready: true, started: true, enabled: true }); }
  return route.abort();
});
await p.goto("http://localhost:5055/", { waitUntil: "domcontentloaded" });
await p.waitForTimeout(6000);
await p.screenshot({ path: `${ПАПКА}/home.png` });
console.log((await p.evaluate(() => document.body.innerText)).replace(/\n+/g, " | ").slice(0, 500));
console.log("ошибки:", плохо.slice(0, 3));
await b.close();
