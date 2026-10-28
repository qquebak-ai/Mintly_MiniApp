/* Витрина рынка для большого экрана.
 *
 * Мини-приложение рассчитано на телефон в Telegram: один столбец, крупные
 * кнопки, по токену на экран. За монитором так смотреть рынок нельзя —
 * там нужна таблица, где два десятка токенов видно разом и колонки можно
 * сравнивать глазом. Поэтому десктоп — отдельный экран, а не растянутый
 * мобильный: общие у них данные, а не разметка.
 *
 * Данные те же, что у телефона: обход (api/refresh-feed.js) раз в минуту
 * складывает рынок в feed_cache, отсюда он читается одним запросом. Свечи
 * идут через свой прокси (api/chart.js), чтобы не бить в биржевой
 * источник с каждой вкладки.
 *
 * Сделка на большом экране пока не подписывается: кошелёк и подтверждение
 * живут в мини-приложении, поэтому «Купить» ведёт в него с уже выбранным
 * токеном.
 */

import React, { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { supabase } from "./supabaseClient";
import DesktopToken from "./DesktopToken";
import { DesktopWallet, DesktopProfile } from "./DesktopWallet";
import { Ц, шрифт, цифры, ПОЛОСА, СТИЛИ, ЦВЕТА_СЕРВИСОВ, ЗнакTelegram, ЗнакTON, ЗнакSolana, деньги, цена, возраст, число, Логотип, Линия, Движение, изКеша, Скелет } from "./desktopUI";
import { апи } from "./апи";

const БОТ = import.meta.env.VITE_TG_BOT || "MintlyCobot";

/* Цвет с прозрачностью: подсветка кнопки должна быть тем же цветом, что
   и её текст, иначе на чёрном они расходятся в оттенках. */
const hexA = (hex, a) => {
  const n = parseInt(hex.slice(1), 16);
  return `rgba(${(n >> 16) & 255}, ${(n >> 8) & 255}, ${n & 255}, ${a})`;
};

const СЕТИ = [
  { id: "ton", подпись: "TON", сеть: "ton", Знак: ЗнакTON },
  { id: "sol", подпись: "Solana", сеть: "solana", Знак: ЗнакSolana },
];

const РАЗДЕЛЫ = [
  { id: "market", подпись: "Рынок" },
  { id: "wallet", подпись: "Кошелёк" },
  { id: "profile", подпись: "Профиль" },
];

const ВКЛАДКИ = [
  { id: "trending", подпись: "Популярные" },
  { id: "new", подпись: "Новые" },
  { id: "gainers", подпись: "В росте" },
];

/* ---------- данные ---------- */

async function загрузитьРынок(сеть) {
  const { data, error } = await supabase
    .from("feed_cache")
    .select("*")
    .eq("chain", сеть)
    .order("tx24", { ascending: false })
    .limit(200);
  if (error) throw error;
  return (data || []).map(изКеша).filter((t) => t.пул && t.цена > 0);
}

const КОЛОНКИ = [
  { id: "токен", подпись: "Токен", ширина: "minmax(220px, 2fr)", поле: null },
  { id: "цена", подпись: "Цена", ширина: "1fr", поле: "цена" },
  { id: "движение", подпись: "24ч", ширина: "0.7fr", поле: "движение" },
  { id: "капитализация", подпись: "Капитализация", ширина: "1fr", поле: "капитализация" },
  { id: "ликвидность", подпись: "Ликвидность", ширина: "1fr", поле: "ликвидность" },
  { id: "объём", подпись: "Объём 24ч", ширина: "1fr", поле: "объём" },
  { id: "сделки", подпись: "Сделок", ширина: "0.8fr", поле: "сделки" },
  { id: "возраст", подпись: "Возраст", ширина: "0.7fr", поле: "создан" },
  { id: "линия", подпись: "Сутки", ширина: "92px", поле: null },
];

/* Давно ли обновлялись цифры. Пишем словами: «12 секунд назад» человек
   читает быстрее, чем метку времени. */
function свежесть(когда) {
  const сек = Math.max(0, Math.round((Date.now() - когда) / 1000));
  if (сек < 5) return "обновлено только что";
  if (сек < 60) return `обновлено ${сек} с назад`;
  const мин = Math.round(сек / 60);
  return `обновлено ${мин} мин назад`;
}

/* Одна раскладка на шапку и на строки: если ширины разъедутся, колонки
   перестанут совпадать с заголовками. */
const СЕТКА = КОЛОНКИ.map((к) => к.ширина).join(" ");

/* Рынок, пока он едет: те же строки, только вместо чисел заглушки.
   Ширины у них разные и повторяются по кругу — ровный частокол
   одинаковых полос читается как узор, а не как список. */
function ЗаглушкаТаблицы({ строк = 12 }) {
  const ширины = ["58%", "72%", "64%", "80%", "52%", "68%"];
  return (
    <div aria-hidden>
      {Array.from({ length: строк }, (_, i) => (
        <div
          key={i}
          style={{
            display: "grid", gridTemplateColumns: СЕТКА, gap: 14, alignItems: "center",
            padding: "10px 4px", borderBottom: `1px solid ${Ц.линия}`,
            // Дальние строки бледнее: взгляд держится на первых, а низ
            // списка не спорит с ними за внимание.
            opacity: Math.max(0.25, 1 - i * 0.06),
          }}
        >
          <div style={{ display: "flex", alignItems: "center", gap: 10, minWidth: 0 }}>
            <Скелет ш={28} в={28} круг />
            <div style={{ flex: 1, minWidth: 0, display: "grid", gap: 6 }}>
              <Скелет ш="46%" в={11} />
              <Скелет ш="66%" в={9} />
            </div>
          </div>
          {КОЛОНКИ.slice(1).map((к, j) => (
            <div key={к.id} style={{ display: "flex", justifyContent: "flex-end" }}>
              <Скелет ш={ширины[(i + j) % ширины.length]} в={11} />
            </div>
          ))}
        </div>
      ))}
    </div>
  );
}

export default function Desktop() {
  const [сеть, setСеть] = useState(() => (localStorage.getItem("mintly.pro.chain") === "solana" ? "solana" : "ton"));
  const [вкладка, setВкладка] = useState("trending");
  const [строки, setСтроки] = useState(null);
  const [ошибка, setОшибка] = useState(null);
  const [поиск, setПоиск] = useState("");
  const [сорт, setСорт] = useState({ поле: "объём", по_убыв: true });
  const [выбран, setВыбран] = useState(null);
  /* Раздел переживает перезагрузку вкладки.
     Вход через Google уводит на Google и обратно, и страница собирается
     заново: человек, нажавший «продолжить с Google» в своём профиле,
     возвращался на витрину рынка и решал, что вход не сработал.
     Держим в памяти вкладки, а не браузера: новый визит должен
     начинаться с рынка. */
  const [раздел, setРаздел] = useState(() => {
    try {
      const с = sessionStorage.getItem("mintly.pro.раздел");
      return с === "wallet" || с === "profile" ? с : "market";
    } catch {
      return "market";
    }
  });
  useEffect(() => {
    try { sessionStorage.setItem("mintly.pro.раздел", раздел); } catch { /* приватный режим */ }
  }, [раздел]);
  // Когда список обновлялся в последний раз — по этому видно, что данные
  // живые, а не застыли на первом кадре.
  const [обновлено, setОбновлено] = useState(null);
  const [тик, setТик] = useState(0);
  // Кто вошёл. Без этого после входа через Google на экране не менялось
  // ничего, и понять, состоялся вход или нет, можно было только зайдя в
  // «Профиль».
  const [аккаунт, setАккаунт] = useState(null);

  useEffect(() => {
    let жив = true;
    const узнать = (польз) => {
      if (!польз) { if (жив) setАккаунт(null); return; }
      supabase
        .from("profiles")
        .select("nickname, avatar_url")
        .eq("id", польз.id)
        .maybeSingle()
        .then(({ data }) => {
          if (!жив) return;
          // Только настоящий профиль. Сессия без него — это ещё не
          // аккаунт: раньше в шапке появлялось имя, выведенное из почты,
          // и человек видел «аккаунт», в который не входил, а приложение
          // при этом продолжало просить войти.
          setАккаунт(data && data.nickname ? { ник: data.nickname, лого: data.avatar_url || null } : null);
        });
    };
    supabase.auth.getUser().then(({ data }) => узнать(data && data.user));
    const { data: подписка } = supabase.auth.onAuthStateChange((_, сессия) => узнать(сессия && сессия.user));
    return () => { жив = false; подписка.subscription.unsubscribe(); };
  }, []);

  /* Лента устарела — просим обход пройтись.
   *
   * Сервер сам решит, нужно ли: если строки свежие, он ответит отказом и
   * ничего не сделает. Зато витрина перестаёт зависеть от того, жив ли
   * планировщик, — а он однажды молчал сутки, и никто этого не заметил. */
  const подтолкнуть = useRef(0);
  const оживить = useCallback((возраст) => {
    if (!(возраст > 3 * 60 * 1000)) return;
    if (Date.now() - подтолкнуть.current < 60000) return;
    подтолкнуть.current = Date.now();
    // Обходим ровно ту сеть, которую человек сейчас смотрит: обе за один
    // вызов не укладываются в отведённое обработчику время.
    fetch(апи(`/api/refresh-feed?chain=${сеть}`)).catch(() => {});
  }, [сеть]);

  const обновить = useCallback(() => {
    загрузитьРынок(сеть)
      .then((список) => {
        setСтроки(список);
        setОшибка(null);
        // Возраст считаем по самим данным, а не по времени запроса: если
        // обход встанет, строка честно скажет «час назад», а не будет
        // бодро рапортовать «только что» на вчерашних ценах.
        const свежесть = Math.max(0, ...список.map((t) => new Date(t.обновлён || 0).getTime() || 0));
        setОбновлено(свежесть || Date.now());
        оживить(Date.now() - (свежесть || Date.now()));
      })
      // Сбой — не надпись об ошибке, а тихий повтор: таблица стоит
      // заглушкой, пока рынок не придёт.
      .catch(() => { setОшибка(null); setTimeout(() => обновитьRef.current && обновитьRef.current(), 3000); });
  }, [сеть, оживить]);
  const обновитьRef = useRef(обновить);
  обновитьRef.current = обновить;

  useEffect(() => {
    setСтроки(null);
    обновить();
    // Опрос остаётся страховкой на случай, если живой канал не поднялся
    // (сеть за строгим прокси, вкладка спала). Реже, чем раньше: цифры
    // теперь приходят сами.
    const iv = setInterval(() => {
      if (document.visibilityState === "visible") обновить();
    }, 60000);
    return () => clearInterval(iv);
  }, [обновить]);

  /* Живая лента: изменения приезжают из базы сами.
   *
   * Раньше витрина спрашивала список раз в полминуты, и цифра на экране
   * отставала от базы на эти полминуты плюс время запроса. Теперь обход
   * записал строку — она тут же меняется во всех открытых вкладках, за
   * доли секунды и без единого лишнего запроса. */
  useEffect(() => {
    const канал = supabase
      .channel(`рынок:${сеть}`)
      .on(
        "postgres_changes",
        { event: "*", schema: "public", table: "feed_cache", filter: `chain=eq.${сеть}` },
        (со) => {
          const строка = со.new && со.new.id ? изКеша(со.new) : null;
          setОбновлено(Date.now());
          if (со.eventType === "DELETE") {
            const ушёл = со.old && со.old.id;
            if (ушёл) setСтроки((пр) => (пр ? пр.filter((t) => t.id !== ушёл) : пр));
            return;
          }
          if (!строка || !строка.пул || !(строка.цена > 0)) return;
          setСтроки((пр) => {
            if (!пр) return пр;
            const i = пр.findIndex((t) => t.id === строка.id);
            if (i < 0) return [...пр, строка];
            const копия = пр.slice();
            копия[i] = строка;
            return копия;
          });
        }
      )
      .subscribe();
    return () => { supabase.removeChannel(канал); };
  }, [сеть]);

  useEffect(() => { localStorage.setItem("mintly.pro.chain", сеть); }, [сеть]);

  // Секунды с последнего обновления идут сами: без этого строка застывала
  // на «только что» до следующего запроса.
  useEffect(() => {
    const iv = setInterval(() => setТик((n) => n + 1), 5000);
    return () => clearInterval(iv);
  }, []);

  const список = useMemo(() => {
    if (!строки) return null;
    let ряд = строки;
    const q = поиск.trim().toLowerCase().replace(/^\$/, "");
    if (q) {
      ряд = ряд.filter((t) =>
        String(t.тикер || "").toLowerCase().includes(q)
        || String(t.имя || "").toLowerCase().includes(q)
        || String(t.адрес || "").toLowerCase() === q);
    }
    if (вкладка === "new") {
      const сутки = Date.now() - 24 * 60 * 60 * 1000;
      ряд = ряд.filter((t) => t.создан && new Date(t.создан).getTime() > сутки);
    }
    if (вкладка === "gainers") ряд = ряд.filter((t) => t.движение > 0);
    const поле = вкладка === "new" ? "создан" : сорт.поле;
    const убыв = вкладка === "new" ? true : сорт.по_убыв;
    const знач = (t) => (поле === "создан" ? new Date(t.создан || 0).getTime() : Number(t[поле]) || 0);
    return [...ряд].sort((a, b) => (убыв ? знач(b) - знач(a) : знач(a) - знач(b)));
  }, [строки, поиск, вкладка, сорт]);

  function переключитьСорт(поле) {
    if (!поле) return;
    setСорт((s) => (s.поле === поле ? { поле, по_убыв: !s.по_убыв } : { поле, по_убыв: true }));
  }

  return (
    <div style={{ minHeight: "100vh", background: Ц.фон, color: Ц.текст, fontFamily: шрифт, display: "flex", flexDirection: "column" }}>
      <style>{СТИЛИ}</style>
      <header
        style={{
          height: 58, flexShrink: 0, borderBottom: `1px solid ${Ц.линия}`, background: Ц.фон,
          display: "flex", justifyContent: "center", padding: "0 24px",
        }}
      >
      <div style={{ width: "100%", maxWidth: ПОЛОСА, display: "flex", alignItems: "center", gap: 18 }}>
        <span style={{ fontFamily: шрифт, fontWeight: 700, fontSize: 18, letterSpacing: "-0.02em" }}>Mintly</span>

        <div style={{ display: "flex", gap: 4 }}>
          {РАЗДЕЛЫ.map((р) => (
            <button
              key={р.id}
              onClick={() => { setРаздел(р.id); setВыбран(null); }}
              style={{
                fontFamily: шрифт, fontSize: 13.5, fontWeight: 600, padding: "7px 12px", borderRadius: 9, cursor: "pointer",
                background: раздел === р.id ? hexA(Ц.акцент, 0.16) : "transparent",
                border: "none", color: раздел === р.id ? Ц.акцент : Ц.тусклый,
              }}
            >
              {р.подпись}
            </button>
          ))}
        </div>

        <div style={{ width: 1, height: 22, background: Ц.линия }} />

        <div style={{ display: раздел === "market" && !выбран ? "flex" : "none", gap: 4 }}>
          {ВКЛАДКИ.map((в) => (
            <button
              key={в.id}
              onClick={() => setВкладка(в.id)}
              style={{
                fontFamily: шрифт, fontSize: 13.5, fontWeight: 600, padding: "7px 12px", borderRadius: 9, cursor: "pointer",
                background: вкладка === в.id ? hexA(Ц.акцент, 0.16) : "transparent",
                border: "none", color: вкладка === в.id ? Ц.акцент : Ц.тусклый,
              }}
            >
              {в.подпись}
            </button>
          ))}
        </div>

        <div style={{ display: раздел === "market" ? "flex" : "none", gap: 2, background: Ц.панельВыше, borderRadius: 10, padding: 3 }}>
          {СЕТИ.map((с) => (
            <button
              key={с.id}
              onClick={() => { setСеть(с.сеть); setВыбран(null); }}
              title={с.подпись}
              aria-label={с.подпись}
              style={{
                display: "flex", alignItems: "center", padding: "6px 14px", borderRadius: 8, cursor: "pointer",
                // Выбранная сеть — светлой подложкой, а не заливкой цветом
                // приложения: знаки у сетей свои, и акцент под ними спорил
                // с их собственными цветами.
                background: сеть === с.сеть ? Ц.линияЯрче : "transparent",
                border: "none",
                opacity: сеть === с.сеть ? 1 : 0.45,
                transition: "opacity 140ms ease, background 140ms ease",
              }}
            >
              <с.Знак размер={18} />
            </button>
          ))}
        </div>

        <input
          value={поиск}
          onChange={(e) => setПоиск(e.target.value)}
          placeholder="Тикер, название или адрес"
          style={{
            display: раздел === "market" && !выбран ? "block" : "none",
            flex: 1, maxWidth: 360, height: 34, padding: "0 12px", borderRadius: 10,
            background: Ц.панельВыше, border: `1px solid ${Ц.линия}`, color: Ц.текст,
            fontFamily: шрифт, fontSize: 13, outline: "none",
          }}
        />

        {аккаунт && (
          <button
            className="кнопка"
            onClick={() => { setРаздел("profile"); setВыбран(null); }}
            style={{
              marginLeft: "auto", display: "flex", alignItems: "center", gap: 8, flexShrink: 0,
              padding: "6px 12px 6px 6px", borderRadius: 999, cursor: "pointer",
              background: Ц.панельВыше, border: `1px solid ${Ц.линия}`, color: Ц.текст,
              fontFamily: шрифт, fontSize: 13, fontWeight: 600,
            }}
          >
            <Логотип src={аккаунт.лого} тикер={аккаунт.ник} размер={22} />
            <span style={{ maxWidth: 140, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{аккаунт.ник}</span>
          </button>
        )}

        <a
          className="кнопка"
          href={`https://t.me/${БОТ}`}
          target="_blank"
          rel="noreferrer"
          style={{
            // Вправо уезжает то, что стоит первым: с карточкой аккаунта
            // отступ держит она, без неё — сама кнопка.
            marginLeft: аккаунт ? 0 : "auto", display: "flex", alignItems: "center", gap: 8,
            fontFamily: шрифт, fontSize: 13, fontWeight: 600, color: ЦВЕТА_СЕРВИСОВ.telegram,
            textDecoration: "none", padding: "8px 14px", borderRadius: 10, whiteSpace: "nowrap", flexShrink: 0,
            border: `1px solid ${hexA(ЦВЕТА_СЕРВИСОВ.telegram, 0.45)}`,
            background: hexA(ЦВЕТА_СЕРВИСОВ.telegram, 0.12),
          }}
        >
          <ЗнакTelegram размер={16} /> Открыть в Telegram
        </a>
      </div>
      </header>

      <div style={{ flex: 1, display: "flex", minHeight: 0 }}>
        {раздел === "wallet" && (
          <div style={{ flex: 1, display: "flex", justifyContent: "center", overflowY: "auto" }}><DesktopWallet /></div>
        )}
        {раздел === "profile" && (
          <div style={{ flex: 1, display: "flex", justifyContent: "center", overflowY: "auto" }}><DesktopProfile /></div>
        )}
        {раздел === "market" && выбран && (
          <DesktopToken токен={выбран} наНазад={() => setВыбран(null)} />
        )}
        {раздел === "market" && !выбран && (
        <main style={{ flex: 1, minWidth: 0, display: "flex", flexDirection: "column", alignItems: "center" }}>
          <div
            style={{
              width: "100%", maxWidth: ПОЛОСА, display: "flex", alignItems: "center",
              justifyContent: "space-between", padding: "14px 4px 6px",
              fontFamily: шрифт, fontSize: 12.5, color: Ц.слабый,
            }}
          >
            <span style={{ display: "inline-flex", alignItems: "center", minHeight: 15 }}>
              {список == null ? <Скелет ш={96} в={10} /> : `${число(список.length)} ${поиск.trim() ? "найдено" : "токенов"}`}
              {список != null && поиск.trim() && строки ? ` из ${число(строки.length)}` : ""}
            </span>
            <span className="проявился" key={`${обновлено || 0}:${тик}`}>
              {обновлено ? свежесть(обновлено) : ""}
            </span>
          </div>

          <div
            style={{
              width: "100%", maxWidth: ПОЛОСА, boxSizing: "border-box",
              display: "grid", gridTemplateColumns: СЕТКА, gap: 14, padding: "12px 4px",
              borderBottom: `1px solid ${Ц.линия}`, position: "sticky", top: 0, background: Ц.фон, zIndex: 2,
            }}
          >
            {КОЛОНКИ.map((к) => (
              <button
                key={к.id}
                onClick={() => переключитьСорт(к.поле)}
                style={{
                  textAlign: к.id === "токен" ? "left" : "right",
                  background: "transparent", border: "none", padding: 0,
                  cursor: к.поле ? "pointer" : "default",
                  fontFamily: шрифт, fontSize: 11.5, letterSpacing: "0.04em", textTransform: "uppercase",
                  color: сорт.поле === к.поле ? Ц.текст : Ц.слабый,
                }}
              >
                {к.подпись}{сорт.поле === к.поле ? (сорт.по_убыв ? " ↓" : " ↑") : ""}
              </button>
            ))}
          </div>

          <div style={{ flex: 1, overflowY: "auto", width: "100%", maxWidth: ПОЛОСА }}>
            {ошибка && (
              <div style={{ padding: 20, fontFamily: шрифт, fontSize: 13.5, color: Ц.падение }}>
                Не удалось загрузить рынок: {ошибка}
              </div>
            )}
            {!список && !ошибка && <ЗаглушкаТаблицы />}
            {список && !список.length && (
              <div style={{ padding: 20, fontFamily: шрифт, fontSize: 13.5, color: Ц.слабый }}>
                По этому фильтру пусто.
              </div>
            )}
            {(список || []).map((t, i) => {
              const активна = выбран && выбран.id === t.id;
              return (
                <div
                  key={t.id}
                  className="строка вплыл"
                  onClick={() => setВыбран(t)}
                  style={{
                    display: "grid", gridTemplateColumns: СЕТКА, gap: 14, alignItems: "center",
                    padding: "10px 4px", cursor: "pointer",
                    borderBottom: `1px solid ${Ц.линия}`,
                    background: активна ? Ц.панель : "transparent",
                    // Задержка копится только у первых строк: при сорока
                    // элементах список собирался бы полторы секунды.
                    animationDelay: `${Math.min(i, 8) * 18}ms`,
                  }}
                >
                  <div style={{ display: "flex", alignItems: "center", gap: 10, minWidth: 0 }}>
                    <Логотип src={t.лого} тикер={t.тикер} />
                    <div style={{ minWidth: 0 }}>
                      <div style={{ fontFamily: шрифт, fontSize: 13.5, fontWeight: 700, whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>
                        ${t.тикер}
                      </div>
                      <div style={{ fontFamily: шрифт, fontSize: 11.5, color: Ц.тусклый, whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>
                        {t.имя}{t.биржа ? ` · ${t.биржа}` : ""}
                      </div>
                    </div>
                  </div>
                  <div style={{ textAlign: "right", fontFamily: цифры, fontSize: 13 }}>{цена(t.цена)}</div>
                  <div style={{ textAlign: "right" }}><Движение v={t.движение} /></div>
                  <div style={{ textAlign: "right", fontFamily: цифры, fontSize: 13 }}>{деньги(t.капитализация)}</div>
                  <div style={{ textAlign: "right", fontFamily: цифры, fontSize: 13, color: Ц.тусклый }}>{деньги(t.ликвидность)}</div>
                  <div style={{ textAlign: "right", fontFamily: цифры, fontSize: 13, color: Ц.тусклый }}>{деньги(t.объём)}</div>
                  <div style={{ textAlign: "right", fontFamily: цифры, fontSize: 13, color: Ц.тусклый }}>{число(t.сделки)}</div>
                  <div style={{ textAlign: "right", fontFamily: цифры, fontSize: 12.5, color: Ц.слабый }}>{возраст(t.создан)}</div>
                  <div style={{ display: "flex", justifyContent: "flex-end" }}>
                    <Линия пул={t.пул} сеть={t.сеть} рост={t.движение} />
                  </div>
                </div>
              );
            })}
          </div>
        </main>
        )}
      </div>
    </div>
  );
}
