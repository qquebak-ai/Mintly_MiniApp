/* Вход в аккаунт на сайте.
 *
 * В мини-приложении вход один — через Telegram: там он бесплатный и
 * мгновенный, приложение и так знает, кто перед ним. На сайте Telegram
 * нет, поэтому способов три:
 *
 *   • Google — обычный OAuth Supabase, человек возвращается на ту же
 *     страницу уже с сессией;
 *   • почта и пароль — тоже Supabase, с письмом-подтверждением;
 *   • Phantom — подпись кошельком: сервер выдаёт одноразовую строку,
 *     кошелёк её подписывает, сервер проверяет и открывает сессию.
 *     Пароля здесь нет вовсе — ключ от аккаунта это сам кошелёк.
 *
 * Ник спрашивается один раз, при заведении профиля: он виден другим и
 * потом не меняется, поэтому придумывает его человек, а не сервер.
 */

import React, { useEffect, useState } from "react";
import { supabase } from "./supabaseClient";
import { ошибкаВозврата, запомнитьСтраницу } from "./oauthВозврат";
import { Ц, шрифт, цифры, ЗнакGoogle, ЗнакPhantom, ЗнакTelegram, ЦВЕТА_СЕРВИСОВ } from "./desktopUI";
import { апи } from "./апи";

const БОТ = import.meta.env.VITE_TG_BOT || "MintlyAppBot";

async function токенСессии() {
  const { data } = await supabase.auth.getSession();
  return (data && data.session && data.session.access_token) || null;
}

/* Профиль заводит сервер: таблица закрыта политиками, и клиент под своей
   сессией писать в неё не может. */
export async function завестиПрофиль(nickname) {
  const t = await токенСессии();
  if (!t) throw new Error("нет сессии");
  const res = await fetch(апи("/api/telegram-auth?action=profile"), {
    method: "POST",
    headers: { Authorization: `Bearer ${t}`, "Content-Type": "application/json" },
    body: JSON.stringify({ nickname }),
  });
  const json = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(json.error || `ошибка ${res.status}`);
  return json;
}

/* Есть ли у текущей сессии профиль. По этому и решается, спрашивать ли
   ник после входа. */
export async function профильЕсть() {
  const { data } = await supabase.auth.getUser();
  const id = data && data.user && data.user.id;
  if (!id) return false;
  const { data: p } = await supabase.from("profiles").select("id").eq("id", id).maybeSingle();
  return !!p;
}

async function войтиФантомом() {
  const провайдер = window.phantom && window.phantom.solana;
  if (!провайдер || !провайдер.isPhantom) {
    throw new Error("Phantom не найден — установите расширение");
  }
  const { publicKey } = await провайдер.connect();
  const адрес = publicKey.toString();

  const выдан = await fetch(апи("/api/telegram-auth?action=nonce")).then((r) => r.json());
  if (!выдан || !выдан.nonce) throw new Error("сервер не выдал код");

  const подписано = await провайдер.signMessage(new TextEncoder().encode(выдан.message), "utf8");
  const { default: bs58 } = await import("bs58");
  const подпись = bs58.encode(подписано.signature);

  const res = await fetch(апи("/api/telegram-auth?action=phantom"), {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ address: адрес, nonce: выдан.nonce, exp: выдан.exp, sig: выдан.sig, signature: подпись }),
  });
  const json = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(json.error || `ошибка ${res.status}`);

  const { error } = await supabase.auth.verifyOtp({ token_hash: json.token_hash, type: "magiclink" });
  if (error) throw error;
}

const поле = {
  width: "100%", height: 40, padding: "0 12px", borderRadius: 10, boxSizing: "border-box",
  background: Ц.панельВыше, border: `1px solid ${Ц.линия}`, color: Ц.текст,
  fontFamily: шрифт, fontSize: 14, outline: "none",
};

function Кнопка({ children, onClick, disabled, главная }) {
  return (
    <button
      onClick={onClick}
      disabled={disabled}
      className="кнопка"
      style={{
        width: "100%", padding: "11px 0", borderRadius: 11, cursor: disabled ? "default" : "pointer",
        border: главная ? "none" : `1px solid ${Ц.линия}`,
        background: главная ? Ц.акцент : Ц.панельВыше,
        color: главная ? "#05060A" : Ц.текст,
        fontFamily: шрифт, fontWeight: 700, fontSize: 14,
        opacity: disabled ? 0.55 : 1,
        // Знак сервиса и подпись идут одной строкой по центру.
        display: "flex", alignItems: "center", justifyContent: "center", gap: 9,
      }}
    >
      {children}
    </button>
  );
}

export default function DesktopAuth({ наВход }) {
  const [способ, setСпособ] = useState(null);        // null | "mail"
  const [режим, setРежим] = useState("login");        // login | signup
  const [почта, setПочта] = useState("");
  const [пароль, setПароль] = useState("");
  const [ник, setНик] = useState("");
  const [нуженНик, setНуженНик] = useState(false);
  const [идёт, setИдёт] = useState(false);
  const [ошибка, setОшибка] = useState("");
  const [письмо, setПисьмо] = useState(false);

  // Вход через Google заканчивается возвратом на страницу: если по дороге
  // что-то сорвалось, человек видит ту же форму и не понимает, почему он
  // не вошёл. Причина ждёт его здесь.
  useEffect(() => {
    const т = ошибкаВозврата();
    if (т) setОшибка(т);
  }, []);

  /* Вернулись от Google уже с сессией, но профиля ещё нет.
     Без этой проверки страница показывала те же кнопки входа, и человек
     жал «Продолжить с Google» по кругу: вход-то состоялся, не хватало
     только ника. */
  useEffect(() => {
    let жив = true;
    supabase.auth.getUser().then(async ({ data }) => {
      if (!жив || !(data && data.user)) return;
      if (!(await профильЕсть()) && жив) setНуженНик(true);
    });
    return () => { жив = false; };
  }, []);

  async function послеВхода() {
    // Профиль мог остаться с прошлого входа — тогда ник спрашивать не за
    // что. Нет профиля — просим ник и заводим.
    if (await профильЕсть()) { наВход && наВход(); return; }
    setНуженНик(true);
  }

  function поймать(e) {
    const т = String((e && e.message) || e);
    const словарь = {
      nickname_taken: "Такой ник уже занят",
      nickname_required: "Придумайте ник",
      account_conflict: "На этот кошелёк уже заведён другой аккаунт",
      bad_signature: "Подпись не сошлась",
      nonce_expired: "Код устарел, попробуйте ещё раз",
      "Invalid login credentials": "Неверная почта или пароль",
      "User already registered": "Эта почта уже занята — войдите",
    };
    setОшибка(словарь[т] || т);
  }

  async function google() {
    setОшибка("");
    запомнитьСтраницу();
    const { error } = await supabase.auth.signInWithOAuth({
      provider: "google",
      options: { redirectTo: window.location.origin + window.location.pathname },
    });
    if (error) поймать(error);
  }

  async function фантом() {
    setИдёт(true);
    setОшибка("");
    try {
      await войтиФантомом();
      await послеВхода();
    } catch (e) { поймать(e); } finally { setИдёт(false); }
  }

  async function почтой() {
    setИдёт(true);
    setОшибка("");
    setПисьмо(false);
    try {
      if (режим === "signup") {
        const { data, error } = await supabase.auth.signUp({ email: почта.trim(), password: пароль });
        if (error) throw error;
        // Если в проекте включено подтверждение почты, сессии сразу не
        // будет: человеку уходит письмо, и до перехода по ссылке входа
        // нет. Молчать об этом нельзя — иначе кажется, что кнопка не
        // сработала.
        if (!data.session) { setПисьмо(true); return; }
      } else {
        const { error } = await supabase.auth.signInWithPassword({ email: почта.trim(), password: пароль });
        if (error) throw error;
      }
      await послеВхода();
    } catch (e) { поймать(e); } finally { setИдёт(false); }
  }

  async function сохранитьНик() {
    setИдёт(true);
    setОшибка("");
    try {
      await завестиПрофиль(ник.trim());
      наВход && наВход();
    } catch (e) { поймать(e); } finally { setИдёт(false); }
  }

  if (нуженНик) {
    return (
      <Обёртка>
        <div style={{ fontFamily: шрифт, fontSize: 17, fontWeight: 700, marginBottom: 6 }}>Придумайте ник</div>
        <p style={{ fontFamily: шрифт, fontSize: 13, color: Ц.тусклый, lineHeight: 1.5, margin: "0 0 14px" }}>
          Под ним вас увидят остальные. Он выбирается один раз и потом не меняется.
        </p>
        <input value={ник} onChange={(e) => setНик(e.target.value)} placeholder="Ник" style={поле} maxLength={20} />
        <div style={{ marginTop: 12 }}>
          <Кнопка onClick={сохранитьНик} disabled={идёт || ник.trim().length < 3} главная>
            {идёт ? "Сохраняем…" : "Готово"}
          </Кнопка>
        </div>
        {/* Выход прямо отсюда: сюда попадают и те, кто вошёл случайно —
            чужим аккаунтом в общем браузере или не тем, чем собирались. */}
        <button
          onClick={async () => { await supabase.auth.signOut(); window.location.reload(); }}
          style={{
            marginTop: 10, width: "100%", padding: "9px 0", borderRadius: 10, cursor: "pointer",
            background: "transparent", border: "none", color: Ц.слабый, fontFamily: шрифт, fontSize: 12.5,
          }}
        >
          Это не мой аккаунт — выйти
        </button>
        {ошибка && <Ошибка>{ошибка}</Ошибка>}
      </Обёртка>
    );
  }

  return (
    <Обёртка>
      <div style={{ fontFamily: шрифт, fontSize: 17, fontWeight: 700, marginBottom: 14 }}>Вход в Mintly</div>

      <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
        <Кнопка onClick={google} disabled={идёт}><ЗнакGoogle размер={16} /> Продолжить с Google</Кнопка>
        <Кнопка onClick={фантом} disabled={идёт}><ЗнакPhantom размер={16} /> Войти кошельком Phantom</Кнопка>
        <Кнопка onClick={() => { setСпособ(способ === "mail" ? null : "mail"); setОшибка(""); }} disabled={идёт}>
          Почта и пароль
        </Кнопка>
      </div>

      {способ === "mail" && (
        <div style={{ marginTop: 14, display: "flex", flexDirection: "column", gap: 8 }}>
          <div style={{ display: "flex", gap: 6 }}>
            {[["login", "Войти"], ["signup", "Создать"]].map(([id, п]) => (
              <button
                key={id}
                onClick={() => { setРежим(id); setОшибка(""); setПисьмо(false); }}
                style={{
                  flex: 1, padding: "7px 0", borderRadius: 9, cursor: "pointer", border: "none",
                  background: режим === id ? Ц.панельВыше : "transparent",
                  color: режим === id ? Ц.текст : Ц.тусклый, fontFamily: шрифт, fontSize: 13, fontWeight: 600,
                }}
              >
                {п}
              </button>
            ))}
          </div>
          <input value={почта} onChange={(e) => setПочта(e.target.value)} placeholder="Почта" type="email" style={поле} />
          <input value={пароль} onChange={(e) => setПароль(e.target.value)} placeholder="Пароль" type="password" style={поле} />
          <Кнопка onClick={почтой} disabled={идёт || !почта.trim() || пароль.length < 6} главная>
            {идёт ? "Проверяем…" : режим === "signup" ? "Создать аккаунт" : "Войти"}
          </Кнопка>
          {письмо && (
            <div style={{ fontFamily: шрифт, fontSize: 12.5, color: Ц.тусклый, lineHeight: 1.5 }}>
              Письмо отправлено на {почта.trim()} — перейдите по ссылке из него и вернитесь сюда.
            </div>
          )}
        </div>
      )}

      {ошибка && <Ошибка>{ошибка}</Ошибка>}

      <div style={{ marginTop: 16, paddingTop: 14, borderTop: `1px solid ${Ц.линия}`, fontFamily: шрифт, fontSize: 12.5, color: Ц.слабый, lineHeight: 1.5 }}>
        Если аккаунт уже заведён в мини-приложении, войдите тем же способом, каким входили там:
        аккаунты из Telegram и с сайта — разные, и объединить их пока нельзя.{" "}
        <a
          href={`https://t.me/${БОТ}`}
          target="_blank"
          rel="noreferrer"
          style={{ color: ЦВЕТА_СЕРВИСОВ.telegram, textDecoration: "none", display: "inline-flex", alignItems: "center", gap: 5, verticalAlign: "-3px" }}
        >
          <ЗнакTelegram размер={14} /> Открыть в Telegram
        </a>
      </div>
    </Обёртка>
  );
}

function Обёртка({ children }) {
  return (
    <div style={{ background: Ц.панель, border: `1px solid ${Ц.линия}`, borderRadius: 16, padding: 20, maxWidth: 380 }}>
      {children}
    </div>
  );
}

function Ошибка({ children }) {
  return (
    <div style={{ marginTop: 10, fontFamily: шрифт, fontSize: 12.5, color: Ц.падение, lineHeight: 1.45 }}>{children}</div>
  );
}
