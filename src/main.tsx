import React from "react";
import ReactDOM from "react-dom/client";
import { TonConnectUIProvider } from "@tonconnect/ui-react";
import TonLaunchApp from "./App";
import Desktop from "./Desktop";
import { разобратьВозвратOAuth } from "./oauthВозврат";
import "./index.css";

// Показываем текст ошибки прямо на экране, если что-то сломается —
// это временная диагностика, чтобы увидеть проблему без консоли разработчика.
function showFatalError(err: unknown) {
  const msg = err instanceof Error ? `${err.message}\n\n${err.stack || ""}` : String(err);
  const el = document.createElement("pre");
  el.style.cssText = "background:#1a0000;color:#ff8080;padding:16px;font-size:12px;white-space:pre-wrap;word-break:break-word;position:fixed;inset:0;overflow:auto;z-index:99999;margin:0;";
  el.textContent = "ОШИБКА ЗАГРУЗКИ ПРИЛОЖЕНИЯ:\n\n" + msg;
  document.body.appendChild(el);
}
window.addEventListener("error", (e) => showFatalError(e.error || e.message));
window.addEventListener("unhandledrejection", (e) => showFatalError(e.reason));

const tg = (window as any).Telegram?.WebApp;
if (tg) {
  tg.ready();
  tg.expand();
  /* Telegram по умолчанию показывает приложение шторкой: её видно по
     полоске-ручке сверху, её тянут, она вздрагивает и закрывается сама.
     Просим целую страницу — метод появился в Bot API 8.0.

     Просьба бывает и отклонена: старый клиент, компьютер, уже открытое
     на весь экран окно. Отказ запоминаем, чтобы не просить повторно в
     пустоту. */
  let отказано = false;
  const наСтраницу = () => {
    const м = (tg as any).requestFullscreen;
    if (typeof м !== "function") { отказано = true; return; }
    try { м.call(tg); } catch { отказано = true; }
  };
  tg.onEvent?.("fullscreenFailed", () => { отказано = true; });
  наСтраницу();
  // Второй заход после первого кадра: часть клиентов отвечает отказом на
  // просьбу, поданную до того, как окно закончило раскрываться.
  setTimeout(() => { if (!tg.isFullscreen && !отказано) наСтраницу(); }, 700);
  // Свайп вниз по мини-приложению по умолчанию тянет всё окно (жест
  // закрытия). Посреди списка это мешает — из-под интерфейса видно
  // чёрный фон Telegram, — поэтому по умолчанию жест выключен. Но и
  // насовсем выключать его нельзя: закрывают приложение именно им, и с
  // запретом окно на потягивание только вздрагивало.
  //
  // Разводим по месту касания, а не по положению списка.
  //
  // Раньше жест отдавался Telegram везде, где список стоял в самом
  // верху. Но «в самом верху» — обычное состояние только что открытого
  // экрана: человек кладёт палец на ленту, ведёт вниз, чтобы прокрутить,
  // — и вместо прокрутки уезжает всё окно, из-под него видно переписку.
  //
  // Теперь окно тянется только за верхнюю полосу — там, где у экрана
  // шапка и прокручивать нечего. Палец на содержимом всегда прокручивает
  // содержимое, в каком бы месте список ни стоял. Закрыть приложение при
  // этом по-прежнему можно и жестом за верх, и кнопкой Telegram.
  tg.disableVerticalSwipes?.();

  if (tg.disableVerticalSwipes && tg.enableVerticalSwipes) {
    // Полоса у верхнего края, за которую окно ещё тянется. Отсчёт от
    // самого верха экрана, поэтому запас сверху (вырез, часы) входит в
    // неё же.
    const ПОЛОСА_ОКНА = 96;
    let отдан = false;
    const отдать = (кому: boolean) => {
      if (кому === отдан) return;
      отдан = кому;
      try { кому ? tg.enableVerticalSwipes() : tg.disableVerticalSwipes(); } catch { /* старый клиент */ }
    };
    // Есть ли под пальцем то, что вообще прокручивается: у самого
    // элемента прокрутки может не быть, а у его предка — быть.
    const естьПрокрутка = (эл: Element | null) => {
      for (let у: Element | null = эл; у && у !== document.body; у = у.parentElement) {
        const с = getComputedStyle(у);
        if (/(auto|scroll)/.test(с.overflowY) && у.scrollHeight - у.clientHeight > 4) return true;
      }
      return (document.documentElement.scrollHeight - window.innerHeight) > 4;
    };
    document.addEventListener(
      "touchstart",
      (e) => {
        const цель = e.target;
        if (!(цель instanceof Element)) { отдать(true); return; }
        // График живёт по своим правилам: там вертикальный жест двигает
        // цену, и отдавать его окну нельзя ни при каком положении.
        if (цель.closest('[data-chart="1"]')) { отдать(false); return; }
        // Страницы, приезжающие снизу (обмен, получение), закрываются тем
        // же движением вниз. Отданный Telegram жест сворачивал вместо
        // этого всё приложение — прямо посреди набора суммы.
        if (цель.closest('[data-sheet="1"]')) { отдать(false); return; }
        const y = e.touches && e.touches[0] ? e.touches[0].clientY : 0;
        отдать(y <= ПОЛОСА_ОКНА || !естьПрокрутка(цель));
      },
      { passive: true, capture: true }
    );
  }
}

// iOS игнорирует user-scalable=no, поэтому щипок гасим сами.
//
// Двойной тап раньше гасился здесь же: любой touchend в пределах 350 мс
// после предыдущего отменялся. Это отменяло и сам клик — при быстрых
// нажатиях подряд (например по предметам в магазине) второе нажатие
// просто не доходило до интерфейса, и казалось, что выбор не срабатывает.
// Масштабирование по двойному тапу выключает touch-action: manipulation
// в стилях, и делает это не ломая нажатия.
if (typeof document !== "undefined") {
  document.addEventListener("gesturestart", (e) => e.preventDefault());
  document.addEventListener("gesturechange", (e) => e.preventDefault());
  document.addEventListener("gestureend", (e) => e.preventDefault());

  // Щипок в Android-обёртке приходит не жестом, а двумя касаниями: там
  // gesture-события не срабатывают вовсе, и страницу удавалось растянуть
  // и увести вбок. Вернуть её обратно человеку нечем — в Telegram нет
  // адресной строки, чтобы перезагрузить, — поэтому глушим на входе.
  const мультитач = (e) => {
    if (!e.touches || e.touches.length <= 1) return;
    // График живёт по своим правилам: щипок там — это масштаб свечей, а
    // не страницы. Он помечает себя сам, и внутри него жест не трогаем —
    // иначе в Telegram двумя пальцами не приблизить график.
    const цель = e.target;
    if (цель && цель.closest && цель.closest('[data-chart="1"]')) return;
    e.preventDefault();
  };
  // Гасим с самого касания: к moveу браузер уже решил, что начинается
  // масштабирование, и отменять бывает поздно.
  document.addEventListener("touchstart", мультитач, { passive: false, capture: true });
  document.addEventListener("touchmove", мультитач, { passive: false, capture: true });
  document.addEventListener("dblclick", (e) => e.preventDefault(), { passive: false });

  // Тот же щипок на трекпаде и мыши с Ctrl — в десктопном Telegram.
  document.addEventListener("wheel", (e) => {
    if (e.ctrlKey) e.preventDefault();
  }, { passive: false });

  // Если страницу всё же сдвинули (например обёрткой), возвращаем её
  // к левому краю: перекошенный экран сам собой не выправляется.
  window.addEventListener("scroll", () => {
    if (window.scrollX !== 0) window.scrollTo(0, window.scrollY);
  }, { passive: true });
}

const manifestUrl = `${window.location.origin}/tonconnect-manifest.json`;

/* Мини-приложение рассчитано на телефон в Telegram, витрина — на монитор.
   Внутри Telegram всегда показываем мини-приложение, даже на широком
   экране десктопного клиента: там свои жесты, отступы и кнопка «назад».
   Снаружи — витрина, если экран действительно большой; «/pro» и «/app»
   позволяют выбрать вручную. */
function десктопнаяВитрина() {
  const путь = window.location.pathname.replace(/\/+$/, "");
  if (путь === "/app") return false;
  if (путь === "/pro") return true;
  if (tg && tg.initData) return false;
  return window.innerWidth >= 1100 && !("ontouchstart" in window && window.innerWidth < 1400);
}

const Корень = десктопнаяВитрина() ? Desktop : TonLaunchApp;

function нарисовать() {
  try {
    ReactDOM.createRoot(document.getElementById("root")!).render(
      <React.StrictMode>
        <TonConnectUIProvider
          manifestUrl={manifestUrl}
          actionsConfiguration={{
            // Внутри Telegram окно кошелька закрывалось раньше, чем по нему
            // успевали нажать. Без указанной стратегии возврата TonConnect
            // не знает, куда возвращать человека после подписи, и сворачивает
            // своё окно само.
            returnStrategy: "back",
            skipRedirectToWallet: "never",
          }}
        >
          <Корень />
        </TonConnectUIProvider>
      </React.StrictMode>
    );
  } catch (err) {
    showFatalError(err);
  }
}

/* Сначала разбираем возврат от Google, потом рисуем: иначе приложение
   успевает решить, что человек не вошёл, и показывает форму входа поверх
   уже состоявшегося входа. Отрисовку не блокируем ошибкой обмена — без
   сессии сайт всё равно должен открыться. */
разобратьВозвратOAuth().catch(() => {}).then(нарисовать);
