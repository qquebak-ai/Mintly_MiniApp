/* Экран токена на большом мониторе.
 *
 * Раскладка биржевого терминала: шапка с ключевыми числами, во всю
 * оставшуюся ширину — график, справа торговая панель, снизу вкладки со
 * сделками и держателями. На телефоне так нельзя — там всё это идёт
 * одной колонкой и по очереди, — а на мониторе иначе и не смотрят: цену,
 * стакан сделок и кнопку покупки держат перед глазами одновременно.
 *
 * Свечи и сделки идут через свой прокси (api/chart.js): он кеширует
 * ответы источника, поэтому десяток открытых вкладок не выбивает лимит.
 */

import React, { useEffect, useMemo, useRef, useState } from "react";
import { useTonAddress, useTonConnectUI } from "@tonconnect/ui-react";
import { Ц, шрифт, цифры, ПОЛОСА, деньги, цена, возраст, число, Логотип, Движение, ЗнакPhantom, ЦВЕТА_СЕРВИСОВ, изКеша, Скелет } from "./desktopUI";
import { supabase } from "./supabaseClient";
import { состояниеВнутреннего, сделкаВнутренним } from "./appWallet";
import { сделкаTon, сделкаSolana, подключитьPhantom, расширениеPhantom } from "./desktopTrade";
import { апи } from "./апи";

const ТАЙМФРЕЙМЫ = ["M1", "M5", "M15", "M30", "H1", "H4", "D1"];
const БЫСТРЫЕ_TON = [0.5, 1, 5, 10];
const БЫСТРЫЕ_SOL = [0.05, 0.1, 0.5, 1];

/* ---------- график ---------- */

/* Свечи рисуются на канве вручную: библиотека графиков ради одного
   экрана тянет больше кода, чем весь этот файл, а нужны от неё две вещи
   — тела свечей и шкалы. */
function График({ свечи, наведение = true }) {
  const обёртка = useRef(null);
  const холст = useRef(null);
  const [размер, setРазмер] = useState({ ш: 0, в: 0 });
  const [курсор, setКурсор] = useState(null);
  /* Окно показа: сколько свечей видно и от какой считаем. Колесо меняет
     ширину окна вокруг курсора, перетаскивание — его начало. Держим в
     состоянии, а не в самих данных: сами свечи приходят с сервера и
     перерисовываются по таймеру, а взгляд человека должен оставаться на
     месте. */
  const [окно, setОкно] = useState(null);
  /* Цена по вертикали двигается так же свободно, как время по
     горизонтали: сдвиг и масштаб считаем долями от размаха самих свечей,
     а не в долларах, — иначе после обновления данных вид уезжал бы сам
     собой. Единица масштаба — «ровно по свечам». */
  const [верт, setВерт] = useState({ сдвиг: 0, масштаб: 1 });
  const тянем = useRef(null);

  // Новый набор свечей — окно к правому краю: там свежая цена.
  useEffect(() => {
    if (!свечи || !свечи.length) { setОкно(null); return; }
    setОкно((прежнее) => {
      const видно = прежнее ? Math.min(прежнее.видно, свечи.length) : Math.min(90, свечи.length);
      return { начало: Math.max(0, свечи.length - видно), видно };
    });
  }, [свечи]);

  const показ = useMemo(() => {
    if (!свечи || !свечи.length) return свечи;
    if (!окно) return свечи.slice(-90);
    return свечи.slice(окно.начало, окно.начало + окно.видно);
  }, [свечи, окно]);

  function колесом(e) {
    if (!свечи || !свечи.length) return;
    e.preventDefault();
    // Shift (или Ctrl) под колесом растягивает цену, обычное колесо —
    // время. Так одним движением можно и растянуть тесный коридор, и
    // отойти по истории, не переключая режимов.
    if (e.shiftKey || e.ctrlKey || e.metaKey) {
      setВерт((в) => ({ ...в, масштаб: Math.max(0.15, Math.min(8, в.масштаб * (e.deltaY > 0 ? 1.15 : 1 / 1.15))) }));
      return;
    }
    setОкно((пр) => {
      const тек = пр || { начало: Math.max(0, свечи.length - 90), видно: Math.min(90, свечи.length) };
      const шаг = e.deltaY > 0 ? 1.18 : 1 / 1.18;
      const видно = Math.max(12, Math.min(свечи.length, Math.round(тек.видно * шаг)));
      // Приближаем к тому месту, где курсор: иначе график уезжает из-под
      // пальца, и попасть в нужную свечу нельзя.
      const r = обёртка.current ? обёртка.current.getBoundingClientRect() : null;
      const доля = r ? Math.max(0, Math.min(1, (e.clientX - r.left) / r.width)) : 0.5;
      const якорь = тек.начало + тек.видно * доля;
      const начало = Math.max(0, Math.min(свечи.length - видно, Math.round(якорь - видно * доля)));
      return { начало, видно };
    });
  }

  function тянуть(e) {
    if (!свечи || !свечи.length || !обёртка.current) return;
    тянем.current = {
      x: e.clientX,
      y: e.clientY,
      начало: (окно && окно.начало) || 0,
      сдвиг: верт.сдвиг,
      ширина: обёртка.current.clientWidth,
      высота: обёртка.current.clientHeight,
    };
    e.currentTarget.setPointerCapture(e.pointerId);
  }

  function ведём(e) {
    const r = обёртка.current.getBoundingClientRect();
    setКурсор({ x: e.clientX - r.left, y: e.clientY - r.top });
    const т = тянем.current;
    if (!т || !окно) return;
    // Насколько сдвинули палец, на столько же свечей едет окно.
    const наСвечу = т.ширина / окно.видно;
    const сдвиг = Math.round((т.x - e.clientX) / наСвечу);
    const начало = Math.max(0, Math.min(свечи.length - окно.видно, т.начало + сдвиг));
    if (начало !== окно.начало) setОкно({ ...окно, начало });
    // Вертикаль тянется без ограничителей: график можно увести хоть
    // целиком за край. Это и значит «свободно» — вернуть вид на место
    // всегда можно двойным щелчком.
    if (т.высота > 0) {
      const доля = ((e.clientY - т.y) / т.высота) * верт.масштаб;
      setВерт((в) => (в.сдвиг === т.сдвиг - доля ? в : { ...в, сдвиг: т.сдвиг - доля }));
    }
  }

  function отпустить(e) {
    тянем.current = null;
    try { e.currentTarget.releasePointerCapture(e.pointerId); } catch { /* указатель уже отпущен */ }
  }

  function сбросить() {
    setВерт({ сдвиг: 0, масштаб: 1 });
    if (!свечи || !свечи.length) return;
    const видно = Math.min(90, свечи.length);
    setОкно({ начало: Math.max(0, свечи.length - видно), видно });
  }

  useEffect(() => {
    const el = обёртка.current;
    if (!el) return;
    const следить = new ResizeObserver(() => {
      setРазмер({ ш: el.clientWidth, в: el.clientHeight });
    });
    следить.observe(el);
    setРазмер({ ш: el.clientWidth, в: el.clientHeight });
    return () => следить.disconnect();
  }, []);

  // Снизу — узкое поле, без полосы под подписи времени: свечам вся высота.
  const поле = { слева: 0, справа: 78, сверху: 14, снизу: 10 };

  const геометрия = useMemo(() => {
    if (!показ || показ.length < 2 || !размер.ш) return null;
    const ширина = размер.ш - поле.слева - поле.справа;
    const высота = размер.в - поле.сверху - поле.снизу;
    const верхСвечей = Math.max(...показ.map((с) => с.h));
    const низСвечей = Math.min(...показ.map((с) => с.l));
    const базРазмах = верхСвечей - низСвечей || верхСвечей || 1;
    // Свободный вид: центр уезжает вслед за перетаскиванием, размах
    // растягивается колесом с Shift. Без правок обоих чисел график был
    // прибит к своим максимуму и минимуму и вверх-вниз не двигался.
    const центр = (верхСвечей + низСвечей) / 2 - верт.сдвиг * базРазмах;
    const размах = базРазмах * верт.масштаб;
    const мин = центр - размах / 2;
    const макс = центр + размах / 2;
    return {
      ширина, высота, макс, мин, размах,
      шагX: ширина / показ.length,
      y: (v) => поле.сверху + (1 - (v - мин) / размах) * высота,
    };
  }, [показ, размер, верт]);

  useEffect(() => {
    const c = холст.current;
    if (!c || !размер.ш) return;
    const плотность = window.devicePixelRatio || 1;
    c.width = размер.ш * плотность;
    c.height = размер.в * плотность;
    const ctx = c.getContext("2d");
    ctx.setTransform(плотность, 0, 0, плотность, 0, 0);
    ctx.clearRect(0, 0, размер.ш, размер.в);

    if (!геометрия) {
      // Пока свечи едут, поверх холста лежит заглушка — она и объясняет
      // ожидание. Текстом остаётся только случай, когда ответ пришёл и
      // сделок в нём нет: это не ожидание, а ответ.
      if (показ) {
        ctx.fillStyle = Ц.слабый;
        ctx.font = `13px ${шрифт}`;
        ctx.fillText("За этот период сделок не было", 16, размер.в / 2);
      }
      return;
    }

    const { ширина, высота, мин, размах, шагX, y } = геометрия;

    // Свечи и сетку рисуем внутри поля графика: вид двигается свободно,
    // и без этого уведённые за край свечи налезали бы на шкалу цены.
    ctx.save();
    ctx.beginPath();
    ctx.rect(0, поле.сверху, ширина, высота);
    ctx.clip();

    // Сетка: по цене — пять уровней, по времени — примерно каждые 90 px.
    ctx.strokeStyle = Ц.линия;
    ctx.lineWidth = 1;
    for (let i = 0; i <= 5; i++) {
      const yy = Math.round(y(мин + (размах * i) / 5)) + 0.5;
      ctx.beginPath();
      ctx.moveTo(0, yy);
      ctx.lineTo(ширина, yy);
      ctx.stroke();
    }
    const шагЛиний = Math.max(1, Math.round(90 / шагX));
    показ.forEach((с, i) => {
      if (i % шагЛиний) return;
      const x = поле.слева + i * шагX + шагX / 2;
      ctx.beginPath();
      ctx.moveTo(Math.round(x) + 0.5, поле.сверху);
      ctx.lineTo(Math.round(x) + 0.5, поле.сверху + высота);
      ctx.strokeStyle = Ц.линия;
      ctx.stroke();
    });

    // Сами свечи.
    const тело = Math.max(1, Math.min(12, шагX * 0.66));
    показ.forEach((с, i) => {
      const x = поле.слева + i * шагX + шагX / 2;
      const рост = с.c >= с.o;
      ctx.strokeStyle = рост ? Ц.рост : Ц.падение;
      ctx.fillStyle = рост ? Ц.рост : Ц.падение;
      ctx.beginPath();
      ctx.moveTo(Math.round(x) + 0.5, y(с.h));
      ctx.lineTo(Math.round(x) + 0.5, y(с.l));
      ctx.stroke();
      const верх = y(Math.max(с.o, с.c));
      const низ = y(Math.min(с.o, с.c));
      ctx.fillRect(x - тело / 2, верх, тело, Math.max(1, низ - верх));
    });

    // Последняя цена — пунктиром на всю ширину, как в терминалах.
    const последняя = показ[показ.length - 1];
    const yy = Math.round(y(последняя.c)) + 0.5;
    ctx.setLineDash([4, 4]);
    ctx.strokeStyle = последняя.c >= последняя.o ? Ц.рост : Ц.падение;
    ctx.beginPath();
    ctx.moveTo(0, yy);
    ctx.lineTo(ширина, yy);
    ctx.stroke();
    ctx.setLineDash([]);

    // Перекрестие под курсором.
    if (курсор && наведение) {
      ctx.strokeStyle = Ц.линияЯрче;
      ctx.setLineDash([3, 3]);
      ctx.beginPath();
      ctx.moveTo(курсор.x, поле.сверху);
      ctx.lineTo(курсор.x, поле.сверху + высота);
      ctx.moveTo(0, курсор.y);
      ctx.lineTo(ширина, курсор.y);
      ctx.stroke();
      ctx.setLineDash([]);
    }
    ctx.restore();

    // Подписи шкал — поверх, уже без отсечения.
    ctx.font = `11px ${цифры}`;
    ctx.fillStyle = Ц.слабый;
    for (let i = 0; i <= 5; i++) {
      const v = мин + (размах * i) / 5;
      ctx.fillText(цена(v), ширина + 10, Math.round(y(v)) + 4.5);
    }

    // Ярлык последней цены на шкале держим у края, даже когда сама линия
    // уехала за границу: цена нужна всегда.
    const яЦены = Math.max(поле.сверху + 9, Math.min(поле.сверху + высота - 9, y(последняя.c)));
    ctx.fillStyle = последняя.c >= последняя.o ? Ц.рост : Ц.падение;
    ctx.fillRect(ширина + 4, яЦены - 9, поле.справа - 6, 18);
    ctx.fillStyle = "#06070A";
    ctx.font = `600 11px ${цифры}`;
    ctx.fillText(цена(последняя.c), ширина + 8, яЦены + 4);
  }, [показ, размер, геометрия, курсор, наведение]);

  // Свеча под курсором — её значения показываются в углу графика.
  const подКурсором = useMemo(() => {
    if (!курсор || !геометрия || !показ) return null;
    const i = Math.floor((курсор.x - поле.слева) / геометрия.шагX);
    return показ[Math.max(0, Math.min(показ.length - 1, i))] || null;
  }, [курсор, геометрия, показ]);

  return (
    <div
      ref={обёртка}
      style={{ position: "relative", width: "100%", height: "100%", cursor: тянем.current ? "grabbing" : "crosshair", touchAction: "none" }}
      onWheel={колесом}
      onPointerDown={тянуть}
      onPointerMove={ведём}
      onPointerUp={отпустить}
      onPointerCancel={отпустить}
      onDoubleClick={сбросить}
      onMouseLeave={() => setКурсор(null)}
    >
      <canvas ref={холст} style={{ width: "100%", height: "100%", display: "block" }} />
      {!показ && <ЗаглушкаГрафика />}
      {подКурсором && (
        <div
          style={{
            position: "absolute", left: 12, top: 10, display: "flex", gap: 12,
            fontFamily: цифры, fontSize: 11.5, color: Ц.тусклый, pointerEvents: "none",
          }}
        >
          {[["О", подКурсором.o], ["Н", подКурсором.h], ["Н", подКурсором.l], ["З", подКурсором.c]].map(([п, v], i) => (
            <span key={i}>{п} <span style={{ color: Ц.текст }}>{цена(v)}</span></span>
          ))}
        </div>
      )}
    </div>
  );
}

/* ---------- нижние вкладки ---------- */

function Сделки({ токен }) {
  const [строки, setСтроки] = useState(null);

  useEffect(() => {
    let жив = true;
    const грузить = () => {
      fetch(апи(`/api/chart?what=trades&pool=${encodeURIComponent(токен.пул)}&network=${токен.сеть}`))
        .then((r) => (r.ok ? r.json() : null))
        .then((j) => {
          if (!жив) return;
          const ряд = (j && j.data) || [];
          setСтроки(ряд.map((t) => {
            const a = t.attributes || {};
            return {
              id: t.id,
              покупка: String(a.kind || "").includes("buy"),
              время: a.block_timestamp,
              сумма: Number(a.volume_in_usd) || 0,
              цена: Number(a.price_to_in_usd || a.price_from_in_usd) || 0,
              кто: a.tx_from_address || "",
            };
          }).slice(0, 60));
        })
        .catch(() => { if (жив) setСтроки([]); });
    };
    грузить();
    const iv = setInterval(() => { if (document.visibilityState === "visible") грузить(); }, 15000);
    return () => { жив = false; clearInterval(iv); };
  }, [токен.пул, токен.сеть]);

  if (!строки) return <ЗаглушкаСделок />;
  if (!строки.length) return <Пусто>Сделок пока нет.</Пусто>;

  return (
    <div style={{ overflowY: "auto", height: "100%" }}>
      <div style={{ display: "grid", gridTemplateColumns: "90px 1fr 1fr 1fr 1fr", gap: 12, padding: "6px 16px", position: "sticky", top: 0, background: Ц.фон }}>
        {["Время", "Тип", "Объём", "Цена", "Адрес"].map((з) => (
          <span key={з} style={{ fontFamily: шрифт, fontSize: 11, textTransform: "uppercase", letterSpacing: "0.04em", color: Ц.слабый }}>{з}</span>
        ))}
      </div>
      {строки.map((с) => (
        <div key={с.id} style={{ display: "grid", gridTemplateColumns: "90px 1fr 1fr 1fr 1fr", gap: 12, padding: "5px 16px", fontFamily: цифры, fontSize: 12.5 }}>
          <span style={{ color: Ц.слабый }}>
            {с.время ? new Date(с.время).toLocaleTimeString("ru-RU", { hour: "2-digit", minute: "2-digit", second: "2-digit" }) : "—"}
          </span>
          <span style={{ color: с.покупка ? Ц.рост : Ц.падение }}>{с.покупка ? "покупка" : "продажа"}</span>
          <span style={{ color: Ц.текст }}>{деньги(с.сумма)}</span>
          <span style={{ color: Ц.тусклый }}>{цена(с.цена)}</span>
          <span style={{ color: Ц.слабый }}>{с.кто ? `${с.кто.slice(0, 6)}…${с.кто.slice(-4)}` : "—"}</span>
        </div>
      ))}
    </div>
  );
}

function Пусто({ children }) {
  return (
    <div style={{ padding: 18, fontFamily: шрифт, fontSize: 13, color: Ц.слабый }}>{children}</div>
  );
}

/* График, пока свечи едут: столбики разной высоты на месте будущих
   свечей. Высоты берутся по синусоиде, а не случайно, — иначе заглушка
   меняла бы рисунок на каждой перерисовке и дёргалась. */
function ЗаглушкаГрафика() {
  const столбики = Array.from({ length: 34 }, (_, i) => 30 + Math.abs(Math.sin(i * 0.7)) * 64);
  return (
    <div
      aria-hidden
      style={{
        // По центру области, а не во всю её высоту: панель графика на
        // большом мониторе выше экрана, и прижатая к низу заглушка
        // оказывалась за его краем.
        position: "absolute", left: 16, right: 84, top: "50%", transform: "translateY(-50%)",
        height: "min(46%, 240px)", display: "flex", alignItems: "flex-end", gap: 6,
        pointerEvents: "none", opacity: 0.75,
      }}
    >
      {столбики.map((в, i) => (
        <Скелет key={i} ш="100%" в={`${в}%`} стиль={{ flex: 1, borderRadius: 3 }} />
      ))}
    </div>
  );
}

/* Лента сделок, пока она едет. Колонки те же, что у настоящей: когда
   строки приедут, ничего не переставляется. */
function ЗаглушкаСделок({ строк = 14 }) {
  const ширины = ["62%", "48%", "74%", "56%", "68%"];
  return (
    <div aria-hidden style={{ padding: "10px 16px", display: "grid", gap: 11 }}>
      {Array.from({ length: строк }, (_, i) => (
        <div
          key={i}
          style={{
            display: "grid", gridTemplateColumns: "90px 1fr 1fr 1fr 1fr", gap: 12,
            opacity: Math.max(0.25, 1 - i * 0.055),
          }}
        >
          {ширины.map((ш, j) => (
            <Скелет key={j} ш={ширины[(i + j) % ширины.length]} в={10} />
          ))}
        </div>
      ))}
    </div>
  );
}

function ОТокене({ токен }) {
  const строки = [
    ["Сеть", токен.сеть === "solana" ? "Solana" : "TON"],
    ["Биржа", токен.биржа || "—"],
    ["Возраст пула", возраст(токен.создан)],
    ["Капитализация", деньги(токен.капитализация)],
    ["Ликвидность", деньги(токен.ликвидность)],
    ["Объём 24ч", деньги(токен.объём)],
    ["Сделок 24ч", число(токен.сделки)],
    ["Адрес токена", токен.адрес || "—"],
    ["Адрес пула", токен.пул || "—"],
  ];
  return (
    <div style={{ padding: "10px 16px", overflowY: "auto", height: "100%" }}>
      {строки.map(([п, з]) => (
        <div key={п} style={{ display: "flex", justifyContent: "space-between", gap: 16, padding: "6px 0", borderBottom: `1px solid ${Ц.линия}` }}>
          <span style={{ fontFamily: шрифт, fontSize: 12.5, color: Ц.тусклый }}>{п}</span>
          <span style={{ fontFamily: цифры, fontSize: 12.5, color: Ц.текст, wordBreak: "break-all", textAlign: "right" }}>{з}</span>
        </div>
      ))}
    </div>
  );
}

/* ---------- экран ---------- */

export default function DesktopToken({ токен: токенПроп, наНазад }) {
  /* Цифры экрана живут сами.
   *
   * Раньше это был снимок строки, сделанный в момент открытия: цена,
   * капитализация и объём стояли до возвращения на витрину. Теперь строка
   * приезжает из базы, как только обход её записал, — за доли секунды и
   * без опроса. */
  const [живой, setЖивой] = useState(токенПроп);
  useEffect(() => { setЖивой(токенПроп); }, [токенПроп]);
  useEffect(() => {
    if (!токенПроп || !токенПроп.id) return undefined;
    const канал = supabase
      .channel(`токен:${токенПроп.id}`)
      .on(
        "postgres_changes",
        { event: "UPDATE", schema: "public", table: "feed_cache", filter: `id=eq.${токенПроп.id}` },
        (со) => { if (со.new && со.new.id) setЖивой(изКеша(со.new)); }
      )
      .subscribe();
    return () => { supabase.removeChannel(канал); };
  }, [токенПроп && токенПроп.id]);
  const токен = живой || токенПроп;

  const [тф, setТф] = useState("M15");
  const [свечи, setСвечи] = useState(null);
  const [вкладка, setВкладка] = useState("trades");
  const [сторона, setСторона] = useState("buy");
  const [сумма, setСумма] = useState("");
  // Кошелёк приложения есть только у токенов Solana и только у вошедших:
  // тогда сделка проходит вообще без подтверждения в кошельке.
  const [кош, setКош] = useState(null);
  const [идёт, setИдёт] = useState(false);
  const [итог, setИтог] = useState("");
  // Кошельки, которыми сделку подписывает сам человек: TON — через
  // TonConnect, Solana — расширением Phantom в браузере.
  const адресTon = useTonAddress();
  const [tonConnectUI] = useTonConnectUI();
  const [адресSol, setАдресSol] = useState(null);
  const естьPhantom = !!расширениеPhantom();

  useEffect(() => {
    if (токен.сеть !== "solana") { setКош(null); return; }
    let жив = true;
    состояниеВнутреннего()
      .then((с) => { if (жив) setКош(с && !с.нуженВход && !с.ошибка ? с : null); })
      .catch(() => { if (жив) setКош(null); });
    return () => { жив = false; };
  }, [токен.сеть, токен.адрес]);

  // Уже разрешённое расширение подхватываем молча: заставлять нажимать
  // «подключить» на каждой перезагрузке незачем.
  useEffect(() => {
    if (токен.сеть !== "solana") return;
    const p = расширениеPhantom();
    if (!p || !p.isConnected || !p.publicKey) return;
    setАдресSol(p.publicKey.toString());
  }, [токен.сеть]);

  // Чем именно платим: у Solana это кошелёк приложения либо расширение,
  // у TON — подключённый TonConnect.
  const чем = токен.сеть === "solana"
    ? (кош ? "внутренний" : адресSol ? "phantom" : null)
    : (адресTon ? "ton" : null);

  async function сделать() {
    if (идёт || !(Number(сумма) > 0) || !токен.адрес || !чем) return;
    setИдёт(true);
    setИтог("");
    const продажа = сторона === "sell";
    try {
      if (чем === "внутренний") {
        await сделкаВнутренним({ mint: токен.адрес, продажа, amount: Number(сумма) });
        состояниеВнутреннего().then((с) => setКош(с && !с.нуженВход && !с.ошибка ? с : null)).catch(() => {});
      } else if (чем === "phantom") {
        await сделкаSolana({ mint: токен.адрес, кошелёк: адресSol, сумма: Number(сумма), продажа });
      } else {
        await сделкаTon({ tonConnectUI, жетон: токен.адрес, кошелёк: адресTon, сумма: Number(сумма), продажа });
      }
      setИтог(продажа ? "Продано" : "Куплено");
      setСумма("");
    } catch (e) {
      setИтог(String((e && e.message) || e).slice(0, 140));
    } finally {
      setИдёт(false);
    }
  }

  async function подключить() {
    setИтог("");
    try {
      if (токен.сеть === "solana") setАдресSol(await подключитьPhantom());
      else await tonConnectUI.openModal();
    } catch (e) {
      setИтог(String((e && e.message) || e).slice(0, 140));
    }
  }

  useEffect(() => {
    let жив = true;
    setСвечи(null);
    const грузить = () => {
      fetch(апи(`/api/chart?what=ohlcv&pool=${encodeURIComponent(токен.пул)}&tf=${тф}&network=${токен.сеть}`))
        .then((r) => (r.ok ? r.json() : null))
        .then((j) => {
          if (!жив) return;
          const список = (j && j.data && j.data.attributes && j.data.attributes.ohlcv_list) || [];
          setСвечи(список
            .map((s) => ({ t: s[0], o: Number(s[1]), h: Number(s[2]), l: Number(s[3]), c: Number(s[4]), v: Number(s[5]) }))
            .filter((s) => s.o > 0 && s.h > 0)
            .reverse()
            .slice(-220));
        })
        .catch(() => { if (жив) setСвечи([]); });
    };
    грузить();
    // Свежая свеча дорисовывается сама: смотреть на застывший график,
    // пока рядом идут сделки, — худшее, что может делать терминал.
    const iv = setInterval(() => { if (document.visibilityState === "visible") грузить(); }, 20000);
    return () => { жив = false; clearInterval(iv); };
  }, [токен.пул, токен.сеть, тф]);

  /* Последняя свеча дорисовывается живой ценой.
   *
   * Свечи источник отдаёт раз в двадцать секунд, а цена приезжает из базы
   * сразу. Без этого график стоял, хотя число над ним уже изменилось, и
   * казалось, что он отстал. Историю не трогаем — только текущую свечу. */
  const свечиЖивые = useMemo(() => {
    const p = Number(токен.цена) || 0;
    if (!свечи || !свечи.length || !(p > 0)) return свечи;
    const к = свечи.slice();
    const последняя = { ...к[к.length - 1] };
    if (последняя.c === p) return свечи;
    последняя.c = p;
    последняя.h = Math.max(последняя.h, p);
    последняя.l = Math.min(последняя.l, p);
    к[к.length - 1] = последняя;
    return к;
  }, [свечи, токен.цена]);

  const монета = токен.сеть === "solana" ? "SOL" : "TON";
  const быстрые = токен.сеть === "solana" ? БЫСТРЫЕ_SOL : БЫСТРЫЕ_TON;

  return (
    <div style={{ flex: 1, minWidth: 0, display: "flex", flexDirection: "column", minHeight: 0, alignItems: "center" }}>
      <div style={{ width: "100%", maxWidth: ПОЛОСА, display: "flex", flexDirection: "column", minHeight: 0, flex: 1 }}>
      {/* Шапка: всё, ради чего открывают токен, — в одну строку. */}
      <div style={{ display: "flex", alignItems: "center", gap: 16, padding: "10px 18px", borderBottom: `1px solid ${Ц.линия}`, background: Ц.панель }}>
        <button
          onClick={наНазад}
          style={{ background: "transparent", border: `1px solid ${Ц.линия}`, color: Ц.тусклый, borderRadius: 9, padding: "6px 12px", cursor: "pointer", fontFamily: шрифт, fontSize: 12.5 }}
        >
          ← Рынок
        </button>
        <Логотип src={токен.лого} тикер={токен.тикер} размер={38} крупно />
        <div>
          <div style={{ fontFamily: шрифт, fontWeight: 700, fontSize: 15 }}>${токен.тикер}</div>
          <div style={{ fontFamily: шрифт, fontSize: 11.5, color: Ц.тусклый }}>{токен.имя}{токен.биржа ? ` · ${токен.биржа}` : ""}</div>
        </div>
        <div style={{ display: "flex", gap: 22, marginLeft: 12 }}>
          {[
            ["Цена", цена(токен.цена)],
            ["Капитализация", деньги(токен.капитализация)],
            ["Ликвидность", деньги(токен.ликвидность)],
            ["Объём 24ч", деньги(токен.объём)],
            ["Сделок", число(токен.сделки)],
            ["Возраст", возраст(токен.создан)],
          ].map(([п, з]) => (
            <div key={п}>
              <div style={{ fontFamily: шрифт, fontSize: 10.5, textTransform: "uppercase", letterSpacing: "0.04em", color: Ц.слабый }}>{п}</div>
              <div style={{ fontFamily: цифры, fontSize: 13.5, color: Ц.текст, marginTop: 2 }}>{з}</div>
            </div>
          ))}
          <div>
            <div style={{ fontFamily: шрифт, fontSize: 10.5, textTransform: "uppercase", letterSpacing: "0.04em", color: Ц.слабый }}>24ч</div>
            <div style={{ marginTop: 2 }}><Движение v={токен.движение} /></div>
          </div>
        </div>
      </div>

      <div style={{ flex: 1, display: "flex", minHeight: 0 }}>
        {/* Левая половина: график и вкладки под ним. */}
        <div style={{ flex: 1, minWidth: 0, display: "flex", flexDirection: "column", minHeight: 0 }}>
          <div style={{ display: "flex", alignItems: "center", gap: 6, padding: "7px 14px", borderBottom: `1px solid ${Ц.линия}` }}>
            {ТАЙМФРЕЙМЫ.map((f) => (
              <button
                key={f}
                onClick={() => setТф(f)}
                style={{
                  fontFamily: цифры, fontSize: 12, padding: "4px 10px", borderRadius: 7, cursor: "pointer",
                  background: тф === f ? Ц.панельВыше : "transparent",
                  border: `1px solid ${тф === f ? Ц.линияЯрче : "transparent"}`,
                  color: тф === f ? Ц.текст : Ц.слабый,
                }}
              >
                {f}
              </button>
            ))}
            <span style={{ marginLeft: 10, fontFamily: шрифт, fontSize: 11.5, color: Ц.слабый }}>
              {токен.тикер}/{монета} · свечи по данным биржи
            </span>
          </div>

          {/* Графику отдана большая часть экрана: ради него терминал и
              открывают, а лента сделок читается и в четверти высоты. */}
          <div style={{ flex: 3, minHeight: 420, padding: "4px 10px 0" }}>
            <График свечи={свечиЖивые} />
          </div>

          <div style={{ flex: 1, minHeight: 170, borderTop: `1px solid ${Ц.линия}`, display: "flex", flexDirection: "column" }}>
            <div style={{ display: "flex", gap: 4, padding: "6px 14px", borderBottom: `1px solid ${Ц.линия}` }}>
              {[["trades", "Сделки"], ["about", "О токене"]].map(([id, п]) => (
                <button
                  key={id}
                  onClick={() => setВкладка(id)}
                  style={{
                    fontFamily: шрифт, fontSize: 12.5, fontWeight: 600, padding: "5px 12px", borderRadius: 8, cursor: "pointer",
                    background: вкладка === id ? Ц.панельВыше : "transparent", border: "none",
                    color: вкладка === id ? Ц.текст : Ц.тусклый,
                  }}
                >
                  {п}
                </button>
              ))}
            </div>
            <div style={{ flex: 1, minHeight: 0 }}>
              {вкладка === "trades" ? <Сделки токен={токен} /> : <ОТокене токен={токен} />}
            </div>
          </div>
        </div>

        {/* Правая колонка: торговая панель. */}
        <aside style={{ width: 300, flexShrink: 0, borderLeft: `1px solid ${Ц.линия}`, background: Ц.панель, display: "flex", flexDirection: "column", overflowY: "auto" }}>
          <div style={{ display: "flex", padding: 12, gap: 6 }}>
            {[["buy", "Купить"], ["sell", "Продать"]].map(([id, п]) => (
              <button
                key={id}
                onClick={() => setСторона(id)}
                style={{
                  flex: 1, padding: "9px 0", borderRadius: 10, cursor: "pointer", border: "none",
                  fontFamily: шрифт, fontWeight: 700, fontSize: 13.5,
                  background: сторона === id ? (id === "buy" ? Ц.рост : Ц.падение) : Ц.панельВыше,
                  color: сторона === id ? "#06070A" : Ц.тусклый,
                }}
              >
                {п}
              </button>
            ))}
          </div>

          <div style={{ padding: "0 12px" }}>
            <div style={{ fontFamily: шрифт, fontSize: 11, textTransform: "uppercase", letterSpacing: "0.04em", color: Ц.слабый, marginBottom: 6 }}>
              Сумма, {сторона === "buy" ? монета : токен.тикер}
            </div>
            <input
              value={сумма}
              onChange={(e) => setСумма(e.target.value.replace(",", ".").replace(/[^0-9.]/g, ""))}
              placeholder="0.0"
              inputMode="decimal"
              style={{
                width: "100%", height: 38, padding: "0 12px", borderRadius: 10, boxSizing: "border-box",
                background: Ц.панельВыше, border: `1px solid ${Ц.линия}`, color: Ц.текст,
                fontFamily: цифры, fontSize: 15, outline: "none",
              }}
            />
            <div style={{ display: "flex", gap: 6, marginTop: 8 }}>
              {быстрые.map((v) => (
                <button
                  key={v}
                  onClick={() => setСумма(String(v))}
                  style={{
                    flex: 1, padding: "6px 0", borderRadius: 8, cursor: "pointer",
                    background: Ц.панельВыше, border: `1px solid ${Ц.линия}`, color: Ц.тусклый,
                    fontFamily: цифры, fontSize: 12,
                  }}
                >
                  {v}
                </button>
              ))}
            </div>

            {/* Сделка заканчивается здесь. Кошелёк приложения подписывает
                на сервере, TonConnect и Phantom — у человека в кошельке;
                во всех трёх случаях никуда уходить не нужно. */}
            {чем ? (
              <>
                <button
                  onClick={сделать}
                  disabled={идёт || !(Number(сумма) > 0)}
                  style={{
                    width: "100%", marginTop: 12, padding: "12px 0", borderRadius: 11, border: "none",
                    cursor: идёт || !(Number(сумма) > 0) ? "default" : "pointer",
                    background: сторона === "buy" ? Ц.рост : Ц.падение, color: "#06070A",
                    fontFamily: шрифт, fontWeight: 700, fontSize: 14,
                    opacity: идёт || !(Number(сумма) > 0) ? 0.55 : 1,
                  }}
                >
                  {идёт
                    ? (чем === "внутренний" ? "Отправляем…" : "Подтвердите в кошельке…")
                    : сторона === "buy" ? `Купить ${токен.тикер}` : `Продать ${токен.тикер}`}
                </button>
                <div style={{ display: "flex", justifyContent: "space-between", fontFamily: шрифт, fontSize: 11.5, color: Ц.слабый, marginTop: 8 }}>
                  {чем === "внутренний" ? (
                    <>
                      <span>Баланс в приложении</span>
                      <span style={{ fontFamily: цифры, color: Ц.тусклый }}>{(Number(кош.sol) || 0).toFixed(4)} SOL</span>
                    </>
                  ) : (
                    <>
                      <span>Кошелёк</span>
                      <span style={{ fontFamily: цифры, color: Ц.тусклый }}>
                        {(() => { const a = чем === "ton" ? адресTon : адресSol; return `${a.slice(0, 4)}…${a.slice(-4)}`; })()}
                      </span>
                    </>
                  )}
                </div>
                {итог && (
                  <div style={{ fontFamily: шрифт, fontSize: 12, marginTop: 6, color: /Куплено|Продано/.test(итог) ? Ц.рост : Ц.падение }}>
                    {итог}
                  </div>
                )}
              </>
            ) : (
              <>
                <button
                  onClick={подключить}
                  disabled={токен.сеть === "solana" && !естьPhantom}
                  style={{
                    width: "100%", marginTop: 12, padding: "12px 0", borderRadius: 11, border: "none",
                    cursor: токен.сеть === "solana" && !естьPhantom ? "default" : "pointer",
                    background: токен.сеть === "solana" ? ЦВЕТА_СЕРВИСОВ.phantom : Ц.акцент,
                    color: "#0B0D1A", fontFamily: шрифт, fontWeight: 700, fontSize: 14,
                    opacity: токен.сеть === "solana" && !естьPhantom ? 0.5 : 1,
                  }}
                >
                  <span style={{ display: "inline-flex", alignItems: "center", gap: 8 }}>
                    {токен.сеть === "solana" ? <ЗнакPhantom размер={16} /> : null}
                    {токен.сеть === "solana" ? "Подключить Phantom" : "Подключить кошелёк"}
                  </span>
                </button>
                <div style={{ fontFamily: шрифт, fontSize: 11.5, color: Ц.слабый, marginTop: 8, lineHeight: 1.45 }}>
                  {токен.сеть === "solana"
                    ? (естьPhantom
                      ? "Сделка пройдёт здесь: маршрут соберёт сайт, подпись поставит Phantom."
                      : "Поставьте расширение Phantom — или войдите в аккаунт, и сделки пойдут кошельком приложения.")
                    : "Сделка пройдёт здесь: маршрут на бирже соберёт сайт, подпись поставит ваш кошелёк."}
                </div>
                {итог && (
                  <div style={{ fontFamily: шрифт, fontSize: 12, marginTop: 6, color: Ц.падение }}>{итог}</div>
                )}
              </>
            )}
          </div>

          <div style={{ marginTop: 16, padding: "12px 12px 20px", borderTop: `1px solid ${Ц.линия}` }}>
            <div style={{ fontFamily: шрифт, fontSize: 11, textTransform: "uppercase", letterSpacing: "0.04em", color: Ц.слабый, marginBottom: 8 }}>
              О токене
            </div>
            {[
              ["Капитализация", деньги(токен.капитализация)],
              ["Ликвидность", деньги(токен.ликвидность)],
              ["Объём 24ч", деньги(токен.объём)],
              ["Сделок 24ч", число(токен.сделки)],
            ].map(([п, з]) => (
              <div key={п} style={{ display: "flex", justifyContent: "space-between", padding: "5px 0" }}>
                <span style={{ fontFamily: шрифт, fontSize: 12.5, color: Ц.тусклый }}>{п}</span>
                <span style={{ fontFamily: цифры, fontSize: 12.5, color: Ц.текст }}>{з}</span>
              </div>
            ))}
            {токен.адрес && (
              <button
                onClick={() => navigator.clipboard && navigator.clipboard.writeText(токен.адрес)}
                style={{
                  width: "100%", marginTop: 10, padding: "8px 0", borderRadius: 9, cursor: "pointer",
                  background: "transparent", border: `1px solid ${Ц.линия}`, color: Ц.тусклый,
                  fontFamily: цифры, fontSize: 11.5,
                }}
              >
                {`${токен.адрес.slice(0, 10)}…${токен.адрес.slice(-8)}`} · копировать
              </button>
            )}
          </div>
        </aside>
      </div>
      </div>
    </div>
  );
}
