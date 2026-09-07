import React, { useState, useMemo, useEffect, useRef, useCallback } from "react";
import { createPortal } from "react-dom";
import {
  Search, Flame, TrendingUp, Clock, Sparkles, ArrowUpRight, ArrowDownRight,
  Wallet, Home as HomeIcon, PlusCircle, User, ChevronLeft, Share2, Star,
  ShieldCheck, ShieldAlert, Globe, Globe2, Send, Twitter, Image as ImageIcon, Upload,
  Copy, ExternalLink, LogOut, ChevronRight, ChevronDown, Rocket, HeartCrack,
  Lock, Gift, LifeBuoy,
  FileText, CheckCircle2, RefreshCw, X,
  Eye, EyeOff, LogIn, ShoppingBag, Trash2, Crown, Bell, Check, Cpu, Settings
} from "lucide-react";
import { useTonConnectUI, useTonWallet } from "@tonconnect/ui-react";
import { Address, beginCell, toNano } from "@ton/core";
import { supabase } from "./supabaseClient";
import { апи } from "./апи";
import {
  CURVE_PARAMS,
  CURVE_TOTAL_SUPPLY,
  curveParamsOf,
  tokensOutFor,
  tonOutFor,
  curvePriceTon,
  buildBuyBody,
  buildPoolBuyBody,
  buildSellPayload,
  CURVE_GAS_BUY_OVERHEAD,
  CURVE_SELL_FORWARD_TON,
  CURVE_SELL_VALUE,
} from "./curveConfig";
/* Библиотеки запуска токена (@ton/ton, assets-sdk и их криптография) —
   самая тяжёлая часть сборки, а нужны они ровно в одном месте: когда
   человек нажал «Запустить». Раньше они ехали в общем куске, и их
   ждали все — включая тех, кто просто открыл ленту. Теперь модуль
   подгружается в момент запуска: пока идёт заполнение формы, он уже в
   пути (см. предзагрузку в CreateView). */
let tonLaunchModule = null;
function загрузитьЗапуск() {
  if (!tonLaunchModule) tonLaunchModule = import("./tonLaunch");
  return tonLaunchModule;
}
/* ---------------------------------------------------------
   DESIGN TOKENS — shared by every screen (Home, Token, Create, Profile)
--------------------------------------------------------- */

/* Палитра: спокойный тёмный интерфейс финансового продукта.
 *
 * Оранжевый ушёл из основного цвета намеренно. Он лез в каждую кнопку и
 * каждую подсветку, и приложение читалось как витрина, а не как место,
 * где считают деньги. Акцент теперь холодный синий и появляется редко:
 * главная кнопка, выбранная вкладка, активное состояние, ссылка. Всё
 * остальное держится на трёх оттенках серого и одном белом.
 *
 * Зелёный и красный оставлены только за ростом и падением цены — это
 * язык рынка, и подменять его нечем.
 */
const DARK_THEME = {
  bg: "#08090B",
  surface: "#101216",
  surfaceHi: "#15181D",
  line: "#242830",
  lineHi: "#2E333C",
  ice: "#F5F7FA",
  paper: "#E4E7EC",
  muted: "#8B929D",
  // Приглушённый серый для второстепенных подписей: между muted и
  // границей, чтобы третий уровень текста не спорил со вторым.
  faint: "#5F6670",
  electric: "#6C7CFF",
  turquoise: "#6C7CFF",
  violet: "#6C7CFF",
  rose: "#8B929D",
  up: "#2ED47A",
  down: "#F0616D",
  warning: "#E5A83C",
  mintGlass: "#6C7CFF",
};

/* White theme: same structural logic, inverted — a paper-white canvas,
   near-black ink, identical Ember accent so the brand reads the same in
   either mode. Kept flat (no translucency), same reason as Dark below. */
const WHITE_THEME = {
  bg: "#F7F8FA",
  surface: "#FFFFFF",
  surfaceHi: "#F1F3F7",
  line: "#E3E6EC",
  lineHi: "#D3D7E0",
  ice: "#12141A",
  paper: "#12141A",
  muted: "#666D79",
  faint: "#8A919C",
  electric: "#4F5DE8",
  turquoise: "#4F5DE8",
  violet: "#4F5DE8",
  rose: "#666D79",
  up: "#1C9A6C",
  down: "#D93A49",
  warning: "#C77A16",
  mintGlass: "#2F9E7A",
};

const THEMES = { Dark: DARK_THEME, White: WHITE_THEME };

/* hexA(hex, alpha) -> "rgba(r,g,b,alpha)". Lets glow/ring/shadow effects
   that used to be hardcoded to white (e.g. "rgba(255,255,255,0.3)")
   instead track whatever the current theme's accent or ink color is,
   so they still make sense once the palette flips. */
function hexA(hex, alpha) {
  const h = hex.replace("#", "");
  const bigint = parseInt(h.length === 3 ? h.split("").map((c) => c + c).join("") : h, 16);
  const r = (bigint >> 16) & 255, g = (bigint >> 8) & 255, b = bigint & 255;
  return `rgba(${r},${g},${b},${alpha})`;
}

/* T is intentionally a mutable object (not reassigned) so that every
   component in this file — which reads T.xxx directly at render time —
   picks up new colors the instant the theme changes, without needing to
   thread theme props through the whole tree. applyTheme() mutates T's
   own keys in place; React's normal re-render (triggered by the
   appSettings state update in App()) then repaints everything with the
   fresh values. glow(alpha) is the accent-based replacement for the old
   hardcoded white glows; ink(alpha) is the same idea for structural
   (grid line / vignette) effects that used to assume a dark backdrop. */
let T = { ...DARK_THEME };
function applyTheme(mode) {
  Object.assign(T, THEMES[mode] || DARK_THEME);
  PRISM = mode === "White" ? LIGHT_PRISM : DARK_PRISM;
  PRISM_TEXT = "#FFFFFF";
}
function glow(alpha) { return hexA(T.turquoise, alpha); }
function ink(alpha) { return hexA(T.ice, alpha); }


/* ---------------------------------------------------------
   LANGUAGE / TRANSLATIONS
   Same pattern as the theme above: `lang` is a mutable module
   variable, t(key) looks a string up in the current language and
   falls back to Russian (then to the key itself) if missing.
   setLang() just updates the variable — the actual re-paint happens
   because changing appSettings.language re-renders the whole tree.
--------------------------------------------------------- */
let lang = "RU";
function setLang(v) { lang = v === "EN" ? "EN" : "RU"; }

const STR = {
  RU: {
    navHome: "Главная", navMempad: "Мемпад", navCreate: "Создать", navProfile: "Профиль", navShop: "Магазин", navWallet: "Кошелёк",
    walletBalanceLabel: "Баланс",
    appWalletTitle: "Баланс в приложении",
    appWalletHint: "Пополни этот адрес, и сделки в Solana будут уходить в сеть сразу, без подтверждения в кошельке.",
    appWalletTopUp: "Пополнить",
    appWalletWithdraw: "Вывести",
    appWalletAddressCopied: "Адрес скопирован",
    appWalletTopUpBody: "Отправь SOL на этот адрес — деньги появятся здесь через несколько секунд.",
    appWalletWithdrawTo: "Адрес получателя",
    appWalletAmount: "Сколько вывести",
    appWalletAll: "Всё",
    appWalletSent: "Отправлено",
    appWalletFailed: "Не получилось",
    appWalletPayout: "Адрес вывода",
    appWalletBind: "Привязать свой адрес",
    appWalletBindHint: "Вывод возможен только на свой адрес. Подтверди владение им подписью в Phantom — тогда увести монеты в чужой карман не сможет никто, даже с доступом к аккаунту.",
    appWalletBinding: "Открываю кошелёк…",
    appWalletBound: "Адрес привязан",
    appWalletPending: "Адрес заработает через сутки",
    appWalletPendingBody: "Смена адреса вывода на {address} вступит в силу через сутки. Это не вы?",
    appWalletCancel: "Отменить смену адреса",
    appWalletCancelled: "Смена адреса отменена",
    appWalletRebind: "Сменить адрес вывода",
    appWalletDailyLeft: "Осталось вывести за сутки",
    appWalletLimitHit: "Суточный лимит вывода исчерпан",
    appWalletOver: "Здесь больше {cap} — излишек лучше держать на своём кошельке.",
    appWalletSweep: "Автовывод излишка",
    appWalletSweepOff: "выключен",
    homeInCurves: "Сейчас в кривых",
    homeStatToday: "запусков за сутки",
    homeMoving: "В движении",
    homeTopAll: "Весь топ",
    homeTopHide: "Свернуть",
    appWalletNeedAuth: "Баланс в приложении привязан к аккаунту — войди или создай его в профиле, и адрес появится здесь.",
    walletEmptyTitle: "Кошелёк не подключён",
    walletEmptyBody: "Подключи TON-кошелёк, чтобы покупать, продавать и запускать токены.",
    shopTitle: "Магазин",
    tgAuthTitle: "Вход через Telegram",
    welcomeTitle: "Мемкоины на TON и Solana — прямо в Telegram",
    welcomeSub: "Запуск токена, рынок и кошелёк в одном месте. Кривая торгует с первой секунды, комиссия одна и та же для всех, а условия выпуска зашиты в контракт — не в интерфейс.",
    welcomeChip1: "Быстрый запуск",
    welcomeChip2: "Рынок с первой секунды",
    welcomeChip3: "TON + Solana",
    welcomeMarket1: "Автоматическая цена",
    welcomeMarket2: "Прозрачная формула",
    welcomeMarket3: "Торговля сразу после запуска",
    welcomeRiskShort: "Мемкоины — высокорисковый актив. Не вкладывай больше, чем готов потерять.",
    welcomeWallet1: "TON Connect",
    welcomeWallet1Body: "Подключение TON-кошелька",
    welcomeWallet2: "Phantom",
    welcomeWallet2Body: "Подключение Solana-кошелька",
    welcomeStep1: "Создай токен",
    welcomeStep1Body: "Имя, тикер и изображение",
    welcomeStep2: "Настрой запуск",
    welcomeStep2Body: "Параметры токена и первая покупка",
    welcomeStep3: "Выход на рынок",
    welcomeStep3Body: "Токен появляется на кривой и становится доступен для торговли",
    welcomePoint1Title: "Свои контракты",
    welcomePoint1Body: "Кривая и пул написаны нами и открыты: весь выпуск уходит на кривую, мимо неё его не достать.",
    welcomePoint2Title: "Две сети",
    welcomePoint2Body: "TON и Solana в одном приложении, каждая со своим кошельком.",
    welcomePoint3Title: "Запуск за минуту",
    welcomePoint3Body: "Имя, тикер, картинка — и токен в сети вместе с первой покупкой, одной подписью в кошельке.",
    welcomeNext: "Дальше",
    welcomeSlide2Title: "Рынок с первой секунды",
    welcomeSlide2Body: "Рынок токена — контракт, а не стакан заявок: он сам вторая сторона сделки. Цена идёт по формуле от выкупленного объёма, поэтому торговля начинается сразу, без чужой ликвидности.",
    welcomeSlide3Title: "TON и Solana рядом",
    welcomeSlide3Body: "TON и Solana с одинаковой математикой кривой: контракт на Tact и программа на Rust. Переключение сетей — движением, а не переустановкой приложения.",
    welcomeSlide4Title: "Запуск за пару минут",
    welcomeSlide4Body: "Имя, тикер, картинка и первая покупка — остальное берёт на себя контракт: эмиссия, цена, комиссия и выход на биржу по достижении порога.",
    welcomeCreate: "Создать аккаунт",
    welcomeLogin: "У меня уже есть аккаунт",
    welcomeSkip: "Продолжить без входа",
    welcomeRisk: "Криптоактивы связаны с риском: цена токенов может значительно меняться, а вложения — быть потеряны.",
    tgAuthCta: "Войти через Telegram",
    tgAuthHint: "Аккаунт создастся из твоего профиля Telegram — почта и пароль не нужны.",
    tgAuthCreateCta: "Создать аккаунт",
    tgAuthNickHint: "Придумай никнейм — под ним тебя увидят остальные. Он выбирается один раз и потом не меняется.",
    nicknameLocked: "Никнейм выбирается один раз при создании аккаунта и не меняется.",
    tgAuthOutside: "Открой приложение внутри Telegram, чтобы войти.",
    tgAuthFailed: "Не удалось войти через Telegram. Попробуй ещё раз.",
    tgAuthNotConfigured: "Вход через Telegram пока не настроен на сервере.",
    bootStepAuth: "Вход в аккаунт", bootStepFeed: "Лента покупок",
    bootStepTokens: "Токены сообщества", bootStepRate: "Курс TON",
    shopTabFrames: "Рамки", shopTabCards: "Карточки",
    shopEquip: "Надеть", shopEquipped: "Надето", shopOwned: "Куплено",
    editLookTitle: "Внешний вид", editLookHint: "Надень купленную рамку и карточку. Остальное — в магазине.",
    editLookEmpty: "Пока нечего надевать — рамки и карточки покупаются в магазине",
    shopNotEnough: "Не хватает {n} монет — закрой достижение",
    shopBuyFor: "Купить за {n}",
    shopLeftAfter: "Останется после покупки",
    shopNoItem: "Этой вещи ещё нет в каталоге — напиши в поддержку",
    shopBought: "{name} — куплено",
    shopCoinsHint: "Монеты приходят за достижения и за приглашённых друзей. Тратить их можно только здесь.",
    shopLockedTitle: "Магазин закрыт",
    shopLockedBody: "Рамки и карточки надеваются на профиль, а монеты приходят за достижения. Войди, чтобы всё это стало твоим.",
    cosmeticApplied: "Применено", cosmeticRemoved: "Снято",
    settingsSaved: "Настройки сохранены",
    langTitle: "Язык", themeTitle: "Оформление", themeWhite: "Светлая",
    notifyTitle: "Уведомления",
    notifyDesc: "Бот пишет о том, что происходит с твоими токенами. Что именно присылать — выбираешь здесь.",
    notifyBuys: "Покупки",
    notifyBuysSub: "Когда кто-то покупает твой токен",
    notifyMin: "Начиная с суммы",
    notifyMinSub: "Покупки мельче не тревожат",
    notifyProgress: "Путь до биржи",
    notifyProgressSub: "Половина пути, девять десятых, закрытие кривой",
    notifyNeedBot: "Открой бота и нажми «Старт», иначе сообщения не дойдут",
    notifySaved: "Сохранено",
    chestTitle: "Кейс",
    chestSub: "Случайная рамка или карточка из тех, которых у тебя ещё нет",
    chestOpen: "Открыть за {n}",
    chestGot: "Из кейса: {name}",
    chestEmpty: "Всё уже куплено — открывать нечего",
    chestOpening: "Открываем…",
    chestTake: "Забрать",
    nickChange: "Сменить ник",
    nickChangeSub: "Первый ник бесплатный, дальше {n} монет",
    nickChangeCta: "Сменить за {n}",
    nickChanged: "Теперь ты {name}",
    nickTaken: "Имя {name} уже занято",
    walletHoldings: "Твои токены",
    walletHoldingsEmpty: "Пока пусто. Купи токен в мемпаде — он появится здесь.",
    saveFailed: "Не удалось сохранить — попробуй ещё раз",
    langFullNote: "Интерфейс переведён на выбранный язык.",
    buy: "Купить", sell: "Продать", cancel: "Отмена", confirm: "Подтвердить", following: "Вы подписаны", share: "Поделиться",
    disconnectShort: "Отключить",
    connectWallet: "Подключить TON-кошелёк",
    editProfile: "Редактировать профиль", deleteAccount: "Удалить аккаунт",
    settings: "Настройки", security: "Безопасность",
    wallet: "Кошелёк", profileSettings: "Профиль", referral: "Реферальная программа",
    privacy: "Конфиденциальность", terms: "Условия использования", support: "Поддержка",
    launchPreparing: "Подготовка метаданных…",
    launchGenerating: "Генерация токена…",
    launchDeploying: "Деплой…",
    launchConfirming: "Подтверждение…",
    launchSuccessSub: "Токен успешно выпущен и готов к торгам",
    tokenCreatedStatus: "Токен создан",
    contractAddress: "Адрес контракта",
    totalSupply: "Общий выпуск",
    initialBuy: "Стартовая покупка",
    doneClose: "Готово",
    launchingWait: "Не закрывай экран, это займёт пару секунд…",
    heroTitle: "Начни уже сейчас",
    homeWelcome: "Добро пожаловать!",
    homeWelcomeSub: "Ты часть площадки. Создавай, торгуй, расти.",
    homeLive: "Онлайн",
    homeEcoTitle: "Площадка растёт",
    homeEcoRaised: "TON в токенах",
    homeEcoDex: "на бирже",
    homeDoNow: "Что сделать сейчас",
    homeDoLaunchNote: "Свой токен за пару минут",
    homeDoMempadNote: "Смотри, что запускают сейчас",
    homeDoProfileNote: "Твои токены, награды и настройки",
    homePopular: "Популярные",
    homePopularAll: "Все",
    heroBodyLead: "Создавай, торгуй и расти с ",
    heroBodyTail: " на сделку. Присоединяйся к экосистеме с первого дня.",
    heroFee: "комиссией 1%",
    mempadSpotlight: "В центре внимания",
    mempadLaunchToken: "Запустить токен",
    tickerBought: "купил", tickerSold: "продал",
    sinceSec: "с", sinceMin: "м", sinceHour: "ч", mempadFilterNew: "Новые", mempadFilterTrend: "Трендовые", mempadFilterHot: "Горячие", mempadFilterBluming: "В росте", mempadFilterDex: "DEX", mempadFilterSol: "Solana", homeActionLaunch: "Создать токен", homeActionMempad: "Мемпад", homeActionProfile: "Профиль",
    feedTitle: "Прямо сейчас",
    feedSub: "Что происходит на площадке",
    feedTrade: "{who} купил ${ticker} на {ton} TON",
    feedLaunch: "{who} запустил ${ticker}",
    topTitle: "Топ",
    topTokens: "Токены",
    topCreators: "Создатели",
    topRaised: "собрано {ton} TON",
    topOnDex: "свободный рынок",
    topClosing: "кривая закрыта, переезд в пул",
    topLaunched: "{n} токенов · {ton} TON",
    statLaunched24: "запусков за сутки",
    statRaised: "TON в токенах",
    statGraduated: "вышли на биржу",
    homeAlmostTitle: "Почти на бирже",
    homeAlmostSub: "Ближе всех к выходу на DEX",
    homeAlmostLeft: "осталось {left} TON",
    homeAlmostEmpty: "Пока никто не набрал заметную часть пути. Запусти токен — будешь первым.",
    emptyFilter: "По этому фильтру пока пусто — попробуй другой или загляни позже.", catMemes: "Мемы", catUtility: "Утилиты", catGames: "Игры", catAI: "AI", catSocial: "Соц",
    linkCopied: "Ссылка скопирована",
    tokenLinkCopied: "Ссылка на токен скопирована",
    reportSent: "Жалоба отправлена на проверку",
    back: "Назад",
    perToken: "/ токен", chartNoData: "История не загрузилась — биржа не ответила", chartRetry: "Повторить", ohlcHigh: "В", ohlcLow: "Н", ohlcClose: "З",
    statPrice: "Цена", statLiquidity: "Ликвидность", statHolders: "Держателей", statTx24h: "Сделок 24ч", statVolume24h: "Объём 24ч",
    trustTitle: "Проверка токена",
    trustCreatorHolds: "У создателя на руках",
    trustCreatorBought: "Купил при запуске",
    trustSold: "Создатель уже продавал",
    trustNotSold: "Создатель ничего не продавал",
    trustHolders: "Держателей",
    trustUnknown: "Нет данных: токен запущен до этой проверки",
    trustOfSupply: "% выпуска",
    gradTitle: "До листинга на бирже",
    gradLeft: "осталось {left} TON",
    gradDone: "Кривая закрыта — токен уходит на биржу",
    gradNote: "Когда в кривой наберётся {target} TON, торговля здесь закроется. Собранные TON и оставшийся выпуск уйдут на кошелёк площадки — из них заводится пара на бирже.",
    gradClosedTitle: "Кривая закрыта",
    gradClosedBody: "Токен набрал {target} TON. Кривая отработала, и всё собранное вместе с остатком выпуска переезжает в пул токена. Как только переезд закончится, торговля откроется снова — здесь же.",
    gradListedTitle: "Свободный рынок",
    gradListedBody: "Кривая отработала: теперь цена ходит вверх и вниз по резервам пула. Ликвидность заперта в контракте — вынуть её не может никто, поэтому продать можно в любой момент.",
    tabChart: "График", tabInfo: "Инфо", tabTx: "Транзакции", chartModePrice: "Цена",
    tabHolders: "Держатели", tabFeed: "Лента", tabAbout: "О токене",
    positionTitle: "Ваша позиция", positionValue: "Стоимость", positionAmount: "Количество",
    positionChange24: "За 24 часа", positionEmpty: "Токенов пока нет",
    thesisAdd: "Добавить тезис", thesisHint: "Зачем взял и когда выйдешь — заметка видна только тебе",
    thesisSave: "Сохранить", thesisPlaceholder: "Например: держу до листинга на бирже",
    unverifiedToken: "Токен не проверен",
    holdersEmpty: "Держателей пока не видно", holdersTop: "Крупнейшие",
    holdersShare: "доля",
    tokenNoAddress: "Адрес недоступен",
    txUnavailable: "Список транзакций пока недоступен для этого пула",
    txEmpty: "По этому пулу пока нет сделок",
    balanceLoading: "Баланс ещё загружается — секунду",
    infoEmpty: "У этого токена пока нет описания и ссылок",
    launchBuyCta: "Купить свой токен",
    creatorLabel: "Создатель",
    creatorTokens: "Его токены", creatorNoTokens: "Пока не запускал токены",
    profileNotFound: "Профиль не найден",
    txLoadFailed: "Не удалось загрузить сделки — обновим через несколько секунд",
    aboutToken: "О токене",
    youPay: "Вы платите", youSell: "Вы продаёте", youReceive: "Вы получите",
    available: "Доступно",
    insufficientFunds: "Недостаточно средств для этой суммы",
    slippage: "Проскальзывание",
    rate: "Курс",
    networkFee: "Комиссия сети",
    minReceive: "Мин. получите (с учётом slippage)",
    buyFor: "Купить за", sellFor: "Продать",
    rateLoading: "Загрузка курса…",
    nothingToSell: "Нечего продавать",
    enterAmount: "Введите сумму",
    logoUploaded: "Логотип загружен",
    bannerUploaded: "Баннер загружен",
    cropImageTitle: "Обрежь изображение",
    cropConfirm: "Применить",
    logoRequired: "Загрузи логотип токена — это обязательно",
    nameTickerRequired: "Укажи название и тикер токена",
    descRequiredWarning: "Опиши токен — после запуска описание изменить будет нельзя",
    buyAmountRequired: "Укажи сумму для запуска — на неё будут выкуплены первые токены",
    initialBuyHint: "На эту сумму ты выкупишь первые токены в той же транзакции — размер покупки и задаёт стартовую цену.",
    buyAmountTooLow: "Минимальная сумма запуска — ${min} (≈{tons} TON)",
    deleteToken: "Удалить токен из списка",
    confirmDelete: "Точно удалить?",
    deleteFailedToast: "Не удалось удалить — попробуйте ещё раз",
    tokenCreatedToast: "Токен {name} (${ticker}) создан ✅",
    padClosedTitle: "Мемпад закрыт",
    padClosedBody: "Чтобы запускать токены, сначала создай аккаунт и подключи TON-кошелёк — эмиссия подтверждается им напрямую.",
    createAccount: "Создать аккаунт",
    connectWalletCta: "Подключить кошелёк",
    launchTokenTitle: "Запусти токен",
    launchTokenSub: "Эмиссия происходит в сети TON сразу после подтверждения",
    launchTokenSubSol: "Эмиссия в сети Solana: миллиард штук, из них 800 млн продаёт кривая",
    logoLabel: "Логотип",
    logoShort: "Лого",
    bannerOptional: "Баннер 1200×400 (необязательно)",
    logoRequiredShort: "Логотип обязателен",
    nameLabel: "Название",
    tickerLabel: "Тикет",
    descLabel: "Описание",
    descPlaceholder: "О чём этот токен и почему он появился",
    descRequiredShort: "Описание обязательно — после запуска изменить его будет нельзя",
    siteLabel: "Сайт",
    launchAmountLabel: "Сумма для запуска (TON)",
    launchAmountNote: "На эту сумму сразу после запуска будут выкуплены первые токены — это стартовая ликвидность и первая цена токена.",
    youWillGet: "Ты получишь ≈",
    supplyShare: "выпуска",
    connectToConfirm: "Подключи кошелёк TON, чтобы подтвердить эмиссию",
    launchTokenCta: "Запустить токен",
    liqShort: "Ликв", volShort: "Об.", holdersShort: "держателей", maxLabel: "МАКС",
    wrongCurrentPin: "Неверный текущий PIN-код",
    pinMismatch: "PIN-коды не совпадают, начни заново",
    pinEnterCurrent: "Введи текущий PIN-код",
    pinEnterNew: "Придумай новый PIN-код",
    pinConfirmNew: "Повтори новый PIN-код",
    greetingBack: "С возвращением",
    greetingHi: "Привет, {name}",
    pinContinueNote: "Введи PIN-код, чтобы продолжить",
    pinForgot: "Забыл(а) PIN-код?",
    walletRequiredNote: "Покупка, продажа и запуск токенов доступны после подключения кошелька.",
    refCodeCopied: "Ссылка приглашения скопирована",
    refInvited: "Приглашено",
    refShare: "Поделиться ссылкой",
    refShareText: "Запускай мемкоины на TON вместе со мной в Mintly",
    editProfileDesc: "Никнейм, аватар, почта и описание профиля.",
    pinRow: "PIN-код",
    pinRowSub: "Запрашивать код при каждом открытии Mintly",
    enablePinFirst: "Сначала включи PIN-код",
    changePinCta: "Сменить PIN-код",
    referralDesc: "Приглашай друзей — получай монеты за каждого, кто заведёт аккаунт по твоей ссылке. Тратить их можно в магазине.",
    refPerFriend: "За каждого друга",
    refEarned: "Заработано монет",
    refVolume: "Оборот друзей",
    refShareNote: "С каждого TON, который наторговали приглашённые, тебе идёт 10 монет — доля с комиссии площадки. Монетами, не в TON: комиссию удерживает контракт в цепочке, и поделить её там нельзя.",
    refPayoutCta: "Забрать долю",
    refPayoutGot: "Начислено {n} монет",
    shareCardTitle: "Карточка токена",
    shareCardNote: "Картинка с текущими цифрами и твоей ссылкой приглашения. Перешли её в чат — кто откроет, попадёт в приложение по тебе.",
    shareCardSend: "Отправить картинку",
    shareCardSave: "Сохранить в галерею",
    shareCardCopy: "Скопировать ссылку",
    shareCardSaved: "Картинка сохранена",
    shareCardFail: "Не получилось собрать картинку",
    shareCardMcap: "Капитализация",
    shareCardToDex: "До биржи",
    shareCardOnDex: "На бирже",
    shareCardFooter: "Запусти свой мемкоин в Telegram",
    tokenAgeLabel: "Возраст",
    supportDesc: "Напиши, что случилось. Отвечаем в течение суток — ответ придёт сюда и в Telegram.",
    contactSupport: "Написать в поддержку",
    supportPlaceholder: "Что случилось?",
    supportSend: "Отправить",
    supportEmpty: "Переписки пока нет. Напиши первым — прочитаем все сообщения.",
    supportNeedAccount: "Чтобы написать в поддержку, сначала заведи аккаунт.",
    supportSent: "Отправлено",
    supportFailed: "Не отправилось. Попробуй ещё раз.",
    supportTooFast: "Слишком часто. Подожди немного.",
    supportTooMany: "На сегодня хватит сообщений — ответим на те, что уже есть.",
    supportTooLong: "Слишком длинно: не больше 2000 знаков.",
    supportUndelivered: "Поддержка сейчас недоступна — сообщение не отправилось. Попробуй позже.",
    supportTeam: "Поддержка",
    commentsTitle: "Обсуждение",
    commentPlaceholder: "Что думаешь о токене?",
    commentsEmpty: "Пока тихо. Скажи первое слово.",
    commentNeedAccount: "Заведи аккаунт, чтобы писать",
    commentTooFast: "Слишком часто. Подожди пару секунд.",
    commentTooMany: "На сегодня хватит сообщений.",
    commentTooLong: "Слишком длинно: не больше 400 знаков.",
    supportFaqLead: "Может, ответ уже здесь. Если нет — напиши нам.",
    supportOther: "Другое — написать в поддержку",
    supportBackToFaq: "Частые вопросы",
    supportYou: "Ты",
    copyLink: "Скопировать ссылку",
    privacyText: "Собираем ровно то, без чего приложение не работает: никнейм, адрес кошелька и историю сделок внутри Mintly. Сделки в цепочке публичны и без нас — мы храним только их привязку к аккаунту, чтобы посчитать портфель и прибыль. Рекламным сетям данные не передаются. Аккаунт удаляется в любой момент: локальный профиль стирается сразу, серверные записи — вместе с ним.",
    archTitle: "Как устроено",
    archLead: "Коротко о том, что стоит за кнопками: где живут деньги, кто считает цену и что происходит с токеном после запуска.",
    archCurveTitle: "Бондинг-кривая",
    archCurveBody: "Рынок токена — контракт, а не стакан заявок: он сам вторая сторона сделки. Цена считается по формуле от того, сколько уже выкуплено, поэтому торговать можно с первой секунды и не ждать, пока кто-то нальёт ликвидность. В TON это контракт на Tact, в Solana — программа на Rust; математика одна и та же.",
    archSupplyTitle: "Эмиссия и листинг",
    archSupplyBody: "Выпуск фиксированный — миллиард токенов, чеканится целиком и целиком уходит на кривую. В TON она продаёт 900 миллионов и держит остаток до листинга, порог — 1500 TON. В Solana продаётся 800 миллионов, 200 остаются под пару, порог — 85 SOL. Когда порог взят, кривая закрывается, а собранная монета вместе с остатком выпуска уходит в пул на бирже.",
    archFeeTitle: "Комиссия",
    archFeeBody: "1% с покупки и продажи удерживает сам контракт и сразу отправляет площадке — приложение между вами и деньгами не стоит. Ставка зашита в кривую при создании и задним числом не меняется. Запуск бесплатный: платите только за первую покупку и комиссию сети, она идёт валидаторам.",
    archKeysTitle: "Ключи и подпись",
    archKeysBody: "Ключ кошелька в приложении хранится зашифрованным (AES-256-GCM с привязкой к владельцу), а подписывает отдельная служба вне основного сервера — веб-приложение ключа не видит. Каждая транзакция перед подписью разбирается по инструкциям: чужие программы и переводы мимо кривой отклоняются. Вывод — только на адрес, подтверждённый подписью вашего кошелька; смена адреса вступает в силу через сутки, на вывод есть суточный лимит.",
    archDataTitle: "Данные рынка",
    archDataBody: "Цены, свечи и сделки собирает наш обход раз в минуту и складывает в кеш — приложение читает готовое, а не опрашивает биржевой источник с каждого телефона. Подделки под известные монеты и токены без имени и символа отсеиваются до показа.",
    accountLabel: "Аккаунт",
    loginTab: "Войти", createTab: "Создать аккаунт",
    changeAvatarHint: "Нажми, чтобы заменить",
    addAvatarHint: "Нажми, чтобы добавить фото",
    editHint: "Никнейм обязателен, остальное можно заполнить позже.",
    loginHint: "Войди в свой аккаунт по почте и паролю.",
    createHint: "Никнейм, почта и пароль обязательны, остальное можно заполнить позже.",
    nicknameLabel: "Никнейм",
    nicknameError: "2–20 символов, только латинские буквы, цифры, _ и ., начинается с буквы",
    bioLabel: "О себе (необязательно)",
    bioPlaceholder: "Пара слов о себе",
    submittingText: "Проверяем...",
    saveChanges: "Сохранить изменения",
    createAccountShort: "Создать",
    firstAccountFirst: "Сначала создай аккаунт",
    connectWalletContinue: "Подключи TON-кошелёк, чтобы продолжить",
    addressCopied: "Адрес скопирован",
    verifyRequestSent: "Заявка отправлена на проверку",
    profileVerified: "Профиль верифицирован",
    logOutShort: "Выйти",
    bioEmptyPlaceholder: "Расскажи о себе — это увидят другие в комментариях и профиле токенов.",
    memberSince: "с сегодняшнего дня",
    accountNotCreated: "Аккаунт не создан",
    accountNotCreatedBody: "Войди в свой аккаунт или создай новый, чтобы запускать токены, торговать и собирать достижения.",
    loginCta: "Войти",
    myTokensCreate: "Создать",
    myTokensTitle: "Мои токены",
    unnamedToken: "Токен без названия",
    noTokensYet: "Ты ещё не запустил ни одного токена.",
    noActivityYet: "Пока нет активности — покупки, продажи и запуски токенов появятся здесь.",
    profileConfirmed: "Профиль подтверждён",
    verifyPending: "Заявка на проверке",
    verifyCta: "Подтверди личность для бейджа",
    deleteAccountForever: "Удалить аккаунт навсегда",
    editProfileBtn: "Редактировать профиль",
    activityTitle: "Активность",
    homeHello: "Твоя площадка",
    achievementsTitle: "Достижения",
    achUnlockedOf: "{done} из {total}",
    achievementsIntro: "За достижения дают монеты. На них в магазине берут рамки и карточки — любые, какие нравятся.",
    achProgress: "Прогресс",
    achGoShop: "Открыть магазин",
    achAll: "Все",
    achFirstLaunch: "Первый запуск", achFirstLaunchHint: "Запустить свой первый токен",
    wreathBadgeTitle: "Знак создателя", wreathClose: "Закрыть",
    verifiedBadgeTitle: "Подтверждённый аккаунт",
    verifiedBadgeBody: "Приложение проверило, что этот профиль принадлежит своему владельцу.",
    wreathBadgeBody: "Выдан за то, что токен этого человека дорос до капитализации {sum}.",
    wreathTier1: "Первая тысяча", wreathTier2: "Десять тысяч", wreathTier3: "Сто тысяч",
    achMcap1k: "Первая тысяча", achMcap1kHint: "Довести свой токен до $1K капитализации",
    achMcap10k: "Десять тысяч", achMcap10kHint: "Довести свой токен до $10K капитализации",
    achMcap100k: "Сто тысяч", achMcap100kHint: "Довести свой токен до $100K капитализации",
    achWallet: "Кошелёк на месте", achWalletHint: "Подключить кошелёк TON",
    achFace: "Лицо профиля", achFaceHint: "Поставить аватарку и написать о себе",
    achStyle: "Со вкусом", achStyleHint: "Надеть рамку и карточку из магазина",
    achInvite1: "Первый приглашённый", achInvite1Hint: "Пригласить друга по своей ссылке",
    achInvite5: "Свой круг", achInvite5Hint: "Пригласить пятерых",
    achInvite10: "Десятка", achInvite10Hint: "Пригласить десятерых",
    achInvite25: "Сарафанное радио", achInvite25Hint: "Пригласить двадцать пять человек",
    verificationTitle: "Верификация",
    verifiedStatus: "Подтверждён",
    pendingStatus: "На проверке",
    notVerifiedStatus: "Не подтверждён",
    verifyAccountBtn: "Подтвердить аккаунт",
    marketCapLabel: "Маркеткап",
    manageBtn: "Управлять",
    connectWalletModalTitle: "Подключи TON-кошелёк, чтобы продолжить",
    deleteAccountQ: "Удалить аккаунт?",
    deleteAccountBody: "Это действие необратимо. Профиль, статистика и достижения будут удалены навсегда, ты выйдешь из аккаунта.",
    deletingText: "Удаляем...",
    deleteShort: "Удалить",
    themeChangedWhite: "Тема изменена: Белая",
    themeChangedDark: "Тема изменена: Тёмная",
    launchFailedTitle: "Не удалось запустить токен",
    retry: "Повторить",
    viewOnExplorer: "Открыть в обозревателе",
    pinChanged: "PIN-код изменён",
    pinEnabled: "PIN-код включён",
    pinDisabled: "PIN-код отключён",
    pinResetToast: "PIN-код сброшен — включи новый в настройках безопасности",
    profileUpdated: "Профиль обновлён",
    loggedIn: "Ты вошёл в аккаунт",
    accountCreatedToast: "Аккаунт создан",
    loggedOut: "Вы вышли из аккаунта",
    accountDeleted: "Аккаунт удалён",
    accountDeleteFailed: "Не удалось удалить аккаунт — база не дала. Ты остался в аккаунте.",
    connectWalletTrade: "Подключи TON-кошелёк, чтобы торговать",
    solConnecting: "Открываю Phantom — подтверди подключение",
    solWalletTitle: "Кошелёк Solana",
    solWalletNote: "Нужен для мемкоинов Solana. TON-кошелёк остаётся на месте.",
    solWalletConnect: "Подключить",
    solWalletConnectFirst: "кошелёк не подключён",
    solWalletOpening: "Открываю…",
    solWalletLoading: "Считаю баланс…",
    solWalletDisconnect: "Отключить кошелёк Solana",
    solDisconnected: "Кошелёк Solana отключён",
    solSignInWallet: "Подпиши сделку в Phantom",
    solDone: "Сделка ушла в сеть",
    solSent: "Отправлено",
    solFailed: "Не вышло",
    rateLoadingRetry: "Курс TON ещё загружается, попробуй через секунду",
    insufficientTon: "Не хватает TON: на кошельке {have}, нужно {need} с газом",
    tokenSaveFailed: "Токен создан в сети, но не сохранился: {reason}. Попробуем ещё раз при следующем запуске.",
    tokenSaveRecovered: "Токен ${ticker} дописан в приложение",
    openingWallet: "Открываем кошелёк…",
    openingWalletHint: "Кошелёк покажет готовую сделку — останется подтвердить.",
    openWalletCta: "Открыть кошелёк",
    changeAmountCta: "Изменить сумму",
    boughtToast: "Куплено ≈ {receive} ${ticker} за {pay} {unit}",
    txCancelled: "Транзакция отменена или не прошла",
    insufficientSellAmount: "Недостаточно токенов для продажи этой суммы",
    connectWalletSell: "Подключи TON-кошелёк, чтобы продать",
    soldToast: "Продано {pay} ${ticker} за ≈ {receive} {unit} 💸",
    authErrAlreadyRegistered: "Эта почта уже зарегистрирована — попробуй вкладку «Войти»",
    authErrInvalidCreds: "Неверная почта или пароль",
    authErrNotConfirmed: "Подтверди почту по ссылке из письма перед входом",
    authErrPasswordShort: "Пароль должен быть не короче 6 символов",
    authErrNicknameTaken: "Никнейм \"{name}\" уже занят",
    authErrGeneric: "Что-то пошло не так, попробуй ещё раз",
    authErrAvatarUpload: "Не удалось загрузить аватар: {msg}",
  },
  EN: {
    navHome: "Home", navMempad: "Mempad", navCreate: "Create", navProfile: "Profile", navShop: "Shop", navWallet: "Wallet",
    walletBalanceLabel: "Balance",
    appWalletTitle: "In-app balance",
    appWalletHint: "Top this address up and Solana trades go straight to the network, with no wallet confirmation.",
    appWalletTopUp: "Top up",
    appWalletWithdraw: "Withdraw",
    appWalletAddressCopied: "Address copied",
    appWalletTopUpBody: "Send SOL to this address — it shows up here within seconds.",
    appWalletWithdrawTo: "Recipient address",
    appWalletAmount: "Amount",
    appWalletAll: "All",
    appWalletSent: "Sent",
    appWalletFailed: "Didn't work",
    appWalletPayout: "Payout address",
    appWalletBind: "Bind your address",
    appWalletBindHint: "Withdrawals go to your own address only. Prove you own it by signing in Phantom — after that nobody can move the coins elsewhere, even with access to your account.",
    appWalletBinding: "Opening the wallet…",
    appWalletBound: "Address bound",
    appWalletPending: "The address takes effect in 24 hours",
    appWalletPendingBody: "Changing the payout address to {address} takes effect in 24 hours. Wasn't you?",
    appWalletCancel: "Cancel the change",
    appWalletCancelled: "Address change cancelled",
    appWalletRebind: "Change payout address",
    appWalletDailyLeft: "Left to withdraw today",
    appWalletLimitHit: "Daily withdrawal limit reached",
    appWalletOver: "More than {cap} sitting here — keep the excess in your own wallet.",
    appWalletSweep: "Auto-withdraw excess",
    appWalletSweepOff: "off",
    homeInCurves: "Live in curves",
    homeStatToday: "launched today",
    homeMoving: "On the move",
    homeTopAll: "Full top",
    homeTopHide: "Collapse",
    appWalletNeedAuth: "The app balance belongs to your account — sign in or create one in your profile and the address shows up here.",
    walletEmptyTitle: "No wallet connected",
    walletEmptyBody: "Connect a TON wallet to buy, sell and launch tokens.",
    shopTitle: "Shop",
    tgAuthTitle: "Sign in with Telegram",
    welcomeTitle: "Memecoins on TON and Solana — right inside Telegram",
    welcomeSub: "Launching, the market and your wallet in one place. The curve trades from the first second, the fee is the same for everyone, and the terms of a launch live in the contract — not in the interface.",
    welcomePoint1Title: "Our own contracts",
    welcomePoint1Body: "The curve and the pool are written by us and open: the supply can't leave past them.",
    welcomePoint2Title: "Two networks",
    welcomePoint2Body: "TON and Solana in one app, each with its own wallet.",
    welcomePoint3Title: "A minute to launch",
    welcomePoint3Body: "Name, ticker, image — and the token is live, together with your first buy.",
    welcomeNext: "Next",
    welcomeChip1: "Fast launch",
    welcomeChip2: "Market from second one",
    welcomeChip3: "TON + Solana",
    welcomeMarket1: "Automatic pricing",
    welcomeMarket2: "Transparent formula",
    welcomeMarket3: "Trading right after launch",
    welcomeRiskShort: "Memecoins are a high-risk asset. Never put in more than you can afford to lose.",
    welcomeWallet1: "TON Connect",
    welcomeWallet1Body: "Connect a TON wallet",
    welcomeWallet2: "Phantom",
    welcomeWallet2Body: "Connect a Solana wallet",
    welcomeStep1: "Create a token",
    welcomeStep1Body: "Name, ticker and image",
    welcomeStep2: "Set up the launch",
    welcomeStep2Body: "Token settings and your first buy",
    welcomeStep3: "Go to market",
    welcomeStep3Body: "The token lands on the curve and becomes tradable",
    welcomeSlide2Title: "A market from second one",
    welcomeSlide2Body: "A token\u2019s market is a contract, not an order book — it is the counterparty itself. Price follows a formula over the amount bought, so trading starts at once, with nobody else\u2019s liquidity.",
    welcomeSlide3Title: "TON and Solana side by side",
    welcomeSlide3Body: "TON and Solana with identical curve math: a Tact contract and a Rust program. Switching networks is a swipe, not a second app.",
    welcomeSlide4Title: "A couple of minutes to launch",
    welcomeSlide4Body: "Name, ticker, image and your first buy — the contract handles the rest: supply, price, fee and the move to a DEX once the threshold is met.",
    welcomeCreate: "Create account",
    welcomeLogin: "I already have an account",
    welcomeSkip: "Continue without signing in",
    welcomeRisk: "Crypto assets carry risk: token prices can swing hard, and what you put in can be lost.",
    tgAuthCta: "Sign in with Telegram",
    tgAuthHint: "Your account is created from your Telegram profile — no email, no password.",
    tgAuthCreateCta: "Create account",
    tgAuthNickHint: "Pick a nickname — that's how everyone else sees you. It's chosen once and can't be changed later.",
    nicknameLocked: "A nickname is chosen once, when the account is created, and can't be changed.",
    tgAuthOutside: "Open the app inside Telegram to sign in.",
    tgAuthFailed: "Telegram sign-in failed. Try again.",
    tgAuthNotConfigured: "Telegram sign-in is not configured on the server yet.",
    bootStepAuth: "Signing in", bootStepFeed: "Buy feed",
    bootStepTokens: "Community tokens", bootStepRate: "TON rate",
    shopTabFrames: "Frames", shopTabCards: "Cards",
    shopEquip: "Equip", shopEquipped: "Equipped", shopOwned: "Owned",
    editLookTitle: "Look", editLookHint: "Put on a frame and a card you own. Buying happens in the shop.",
    editLookEmpty: "Nothing to put on yet — frames and cards are bought in the shop",
    shopNotEnough: "{n} coins short — close an achievement",
    shopBuyFor: "Buy for {n}",
    shopLeftAfter: "Left after this",
    shopNoItem: "This item isn't in the catalogue yet — message support",
    shopBought: "{name} — bought",
    shopCoinsHint: "Coins come from achievements and invited friends. They're only spent here.",
    shopLockedTitle: "Shop is locked",
    shopLockedBody: "Frames and cards go on your profile, and coins come from achievements. Sign in to make them yours.",
    cosmeticApplied: "Applied", cosmeticRemoved: "Removed",
    settingsSaved: "Settings saved",
    langTitle: "Language", themeTitle: "Appearance", themeWhite: "White",
    notifyTitle: "Notifications",
    notifyDesc: "The bot tells you what happens to your tokens. Pick what it should send.",
    notifyBuys: "Buys",
    notifyBuysSub: "When someone buys your token",
    notifyMin: "From this amount",
    notifyMinSub: "Smaller buys stay silent",
    notifyProgress: "Road to the exchange",
    notifyProgressSub: "Halfway, nine tenths, curve closed",
    notifyNeedBot: "Open the bot and press Start, otherwise messages won't arrive",
    notifySaved: "Saved",
    chestTitle: "Chest",
    chestSub: "A random frame or card you don't own yet",
    chestOpen: "Open for {n}",
    chestGot: "From the chest: {name}",
    chestEmpty: "Everything is bought — nothing left to roll",
    chestOpening: "Opening…",
    chestTake: "Take it",
    nickChange: "Change nickname",
    nickChangeSub: "The first one is free, next ones cost {n} coins",
    nickChangeCta: "Change for {n}",
    nickChanged: "You are {name} now",
    nickTaken: "{name} is already taken",
    walletHoldings: "Your tokens",
    walletHoldingsEmpty: "Nothing yet. Buy a token in the mempad and it shows up here.",
    saveFailed: "Could not save — try again",
    langFullNote: "The interface is translated into the selected language.",
    buy: "Buy", sell: "Sell", cancel: "Cancel", confirm: "Confirm", following: "Following", share: "Share",
    disconnectShort: "Disconnect",
    connectWallet: "Connect TON Wallet",
    editProfile: "Edit profile", deleteAccount: "Delete account",
    settings: "Settings", security: "Security",
    wallet: "Wallet", profileSettings: "Profile", referral: "Referral program",
    privacy: "Privacy", terms: "Terms of use", support: "Support",
    launchPreparing: "Preparing metadata…",
    launchGenerating: "Generating token…",
    launchDeploying: "Deploying…",
    launchConfirming: "Confirming…",
    launchSuccessSub: "Your token has been created and is ready to trade",
    tokenCreatedStatus: "Token Created",
    contractAddress: "Contract address",
    totalSupply: "Total supply",
    initialBuy: "Initial buy",
    doneClose: "Done",
    launchingWait: "Don't close this screen, this'll just take a second…",
    heroTitle: "Start right now",
    homeWelcome: "Welcome!",
    homeWelcomeSub: "You are part of the platform. Create, trade, grow.",
    homeLive: "Online",
    homeEcoTitle: "The platform is growing",
    homeEcoRaised: "TON in tokens",
    homeEcoDex: "on DEX",
    homeDoNow: "What to do now",
    homeDoLaunchNote: "Your token in a couple of minutes",
    homeDoMempadNote: "See what is launching now",
    homeDoProfileNote: "Your tokens, rewards and settings",
    homePopular: "Popular",
    homePopularAll: "All",
    heroBodyLead: "Create, trade and grow with ",
    heroBodyTail: " per trade. Join the ecosystem from day one.",
    heroFee: "a 1% fee",
    mempadSpotlight: "Spotlight",
    mempadLaunchToken: "Launch token",
    tickerBought: "bought", tickerSold: "sold",
    sinceSec: "s", sinceMin: "m", sinceHour: "h", mempadFilterNew: "New", mempadFilterTrend: "Trending", mempadFilterHot: "Hot", mempadFilterBluming: "Bluming", mempadFilterDex: "DEX", mempadFilterSol: "Solana", homeActionLaunch: "Launch token", homeActionMempad: "Mempad", homeActionProfile: "Profile",
    feedTitle: "Right now",
    feedSub: "What's happening here",
    feedTrade: "{who} bought ${ticker} for {ton} TON",
    feedLaunch: "{who} launched ${ticker}",
    topTitle: "Top",
    topTokens: "Tokens",
    topCreators: "Creators",
    topRaised: "{ton} TON raised",
    topOnDex: "free market",
    topClosing: "curve closed, moving to the pool",
    topLaunched: "{n} tokens · {ton} TON",
    statLaunched24: "launches today",
    statRaised: "TON in tokens",
    statGraduated: "reached a DEX",
    homeAlmostTitle: "Almost listed",
    homeAlmostSub: "Closest to hitting a DEX",
    homeAlmostLeft: "{left} TON to go",
    homeAlmostEmpty: "Nobody is far along yet. Launch a token and be the first.",
    emptyFilter: "Nothing here for this filter yet — try another or check back later.", catMemes: "Memes", catUtility: "Utility", catGames: "Games", catAI: "AI", catSocial: "Social",
    linkCopied: "Link copied",
    tokenLinkCopied: "Token link copied",
    reportSent: "Report sent for review",
    back: "Back",
    perToken: "/ token", chartNoData: "History didn't load — the exchange didn't answer", chartRetry: "Try again", ohlcHigh: "H", ohlcLow: "L", ohlcClose: "C",
    statPrice: "Price", statLiquidity: "Liquidity", statHolders: "Holders", statTx24h: "Trades 24h", statVolume24h: "24h Volume",
    trustTitle: "Token check",
    trustCreatorHolds: "Creator still holds",
    trustCreatorBought: "Bought at launch",
    trustSold: "The creator has sold",
    trustNotSold: "The creator has not sold",
    trustHolders: "Holders",
    trustUnknown: "No data: launched before this check existed",
    trustOfSupply: "% of supply",
    gradTitle: "Until the exchange listing",
    gradLeft: "{left} TON to go",
    gradDone: "Curve closed — the token is heading to an exchange",
    gradNote: "Once the curve holds {target} TON, trading here closes. The collected TON and the remaining supply go to the platform wallet — the exchange pair is created from them.",
    gradClosedTitle: "Curve closed",
    gradClosedBody: "The token reached {target} TON. The curve is done, and everything it collected — plus the unsold supply — is moving into the token's own pool. Trading reopens right here once it lands.",
    gradListedTitle: "Free market",
    gradListedBody: "The curve is done: the price now moves both ways with the pool's reserves. The liquidity is locked in the contract and nobody can pull it out, so you can always sell.",
    tabChart: "Chart", tabInfo: "Info", tabTx: "Transactions", chartModePrice: "Price",
    tabHolders: "Holders", tabFeed: "Feed", tabAbout: "About",
    positionTitle: "Your position", positionValue: "Value", positionAmount: "Amount",
    positionChange24: "24h change", positionEmpty: "No tokens yet",
    thesisAdd: "Add thesis", thesisHint: "Why you bought and when you exit — only you see this note",
    thesisSave: "Save", thesisPlaceholder: "E.g. holding until it lists on a DEX",
    unverifiedToken: "Unverified token",
    holdersEmpty: "No holders visible yet", holdersTop: "Largest",
    holdersShare: "share",
    tokenNoAddress: "Address unavailable",
    txUnavailable: "Transaction list isn't available for this pool yet",
    txEmpty: "No trades on this pool yet",
    balanceLoading: "Still loading your balance — one moment",
    infoEmpty: "This token has no description or links yet",
    launchBuyCta: "Buy your token",
    creatorLabel: "Creator",
    creatorTokens: "Their tokens", creatorNoTokens: "No tokens launched yet",
    profileNotFound: "Profile not found",
    txLoadFailed: "Couldn't load trades — retrying in a few seconds",
    aboutToken: "About the token",
    youPay: "You pay", youSell: "You sell", youReceive: "You receive",
    available: "Available",
    insufficientFunds: "Not enough funds for this amount",
    slippage: "Slippage",
    rate: "Rate",
    networkFee: "Network fee",
    minReceive: "Min. received (incl. slippage)",
    buyFor: "Buy for", sellFor: "Sell",
    rateLoading: "Loading rate…",
    nothingToSell: "Nothing to sell",
    enterAmount: "Enter amount",
    logoUploaded: "Logo uploaded",
    bannerUploaded: "Banner uploaded",
    cropImageTitle: "Crop image",
    cropConfirm: "Apply",
    logoRequired: "Upload a token logo — it's required",
    nameTickerRequired: "Enter a token name and ticker",
    descRequiredWarning: "Describe the token — the description can't be changed after launch",
    buyAmountRequired: "Enter an amount for the launch — it buys the first tokens",
    initialBuyHint: "Buys the first tokens in the same transaction — the size of this buy sets the starting price.",
    buyAmountTooLow: "Minimum launch amount is ${min} (≈{tons} TON)",
    deleteToken: "Delete token from list",
    confirmDelete: "Delete for sure?",
    deleteFailedToast: "Couldn't delete — try again",
    tokenCreatedToast: "Token {name} (${ticker}) created ✅",
    padClosedTitle: "Memepad closed",
    padClosedBody: "To launch tokens, first create an account and connect a TON wallet — the mint is confirmed directly through it.",
    createAccount: "Create account",
    connectWalletCta: "Connect wallet",
    launchTokenTitle: "Launch a token",
    launchTokenSub: "Minting happens on the TON network right after confirmation",
    launchTokenSubSol: "Minted on Solana: one billion units, 800M of them sold by the curve",
    logoLabel: "Logo",
    logoShort: "Logo",
    bannerOptional: "Banner 1200×400 (optional)",
    logoRequiredShort: "Logo is required",
    nameLabel: "Name",
    tickerLabel: "Ticker",
    descLabel: "Description",
    descPlaceholder: "What this token is about and why it exists",
    descRequiredShort: "Description is required — it can't be changed after launch",
    siteLabel: "Website",
    launchAmountLabel: "Launch amount (TON)",
    launchAmountNote: "This amount buys the first tokens right after launch — it's the starting liquidity and initial price.",
    youWillGet: "You'll get ≈",
    supplyShare: "of supply",
    connectToConfirm: "Connect a TON wallet to confirm the mint",
    launchTokenCta: "Launch token",
    liqShort: "Liq", volShort: "Vol", holdersShort: "holders", maxLabel: "MAX",
    wrongCurrentPin: "Wrong current PIN",
    pinMismatch: "PINs don't match, try again",
    pinEnterCurrent: "Enter your current PIN",
    pinEnterNew: "Choose a new PIN",
    pinConfirmNew: "Repeat the new PIN",
    greetingBack: "Welcome back",
    greetingHi: "Hi, {name}",
    pinContinueNote: "Enter your PIN to continue",
    pinForgot: "Forgot PIN?",
    walletRequiredNote: "Buying, selling and launching tokens are available once a wallet is connected.",
    refCodeCopied: "Invite link copied",
    refInvited: "Invited",
    refShare: "Share the link",
    refShareText: "Launch memecoins on TON with me on Mintly",
    editProfileDesc: "Nickname, avatar, email and profile bio.",
    pinRow: "PIN code",
    pinRowSub: "Require a code every time Mintly opens",
    enablePinFirst: "Enable PIN code first",
    changePinCta: "Change PIN code",
    referralDesc: "Invite friends — earn coins for everyone who signs up through your link. Spend them in the shop.",
    refPerFriend: "Per friend",
    refEarned: "Coins earned",
    refVolume: "Friends' volume",
    refShareNote: "For every TON your invitees trade you get 10 coins — a share of the platform fee. In coins, not TON: the fee is withheld by the contract on-chain and can't be split there.",
    refPayoutCta: "Claim your share",
    refPayoutGot: "{n} coins credited",
    shareCardTitle: "Token card",
    shareCardNote: "An image with live numbers and your invite link. Forward it to a chat — whoever opens it lands in the app through you.",
    shareCardSend: "Send image",
    shareCardSave: "Save to gallery",
    shareCardCopy: "Copy link",
    shareCardSaved: "Image saved",
    shareCardFail: "Couldn't render the image",
    shareCardMcap: "Market cap",
    shareCardToDex: "To DEX",
    shareCardOnDex: "On DEX",
    shareCardFooter: "Launch your memecoin in Telegram",
    tokenAgeLabel: "Age",
    supportDesc: "Tell us what happened. We reply within a day — here and in Telegram.",
    contactSupport: "Message support",
    supportPlaceholder: "What happened?",
    supportSend: "Send",
    supportEmpty: "No messages yet. Write first — we read every one.",
    supportNeedAccount: "Create an account first to message support.",
    supportSent: "Sent",
    supportFailed: "Didn't go through. Try again.",
    supportTooFast: "Too often. Give it a moment.",
    supportTooMany: "That's enough for today — we'll answer what you've sent.",
    supportTooLong: "Too long: 2000 characters max.",
    supportUndelivered: "Support is unreachable right now — the message wasn't sent. Try later.",
    supportTeam: "Support",
    commentsTitle: "Discussion",
    commentPlaceholder: "What do you think?",
    commentsEmpty: "Quiet here. Say the first word.",
    commentNeedAccount: "Create an account to post",
    commentTooFast: "Too fast. Wait a couple of seconds.",
    commentTooMany: "That's enough for today.",
    commentTooLong: "Too long: 400 characters max.",
    supportFaqLead: "The answer might already be here. If not, write to us.",
    supportOther: "Something else — message support",
    supportBackToFaq: "Common questions",
    supportYou: "You",
    copyLink: "Copy link",
    privacyText: "We collect exactly what the app cannot run without: nickname, wallet address and your trade history inside Mintly. On-chain trades are public with or without us — we only keep their link to your account so the portfolio and P&L can be computed. Nothing goes to ad networks. Delete the account whenever you like: the local profile is wiped at once, the server records go with it.",
    archTitle: "How it works",
    archLead: "What sits behind the buttons: where the money lives, who computes the price, and what happens to a token after launch.",
    archCurveTitle: "Bonding curve",
    archCurveBody: "A token's market is a contract, not an order book — the contract itself is the counterparty. Price comes from a formula over how much has been bought, so trading works from the first second without waiting for anyone to seed liquidity. On TON it is a Tact contract, on Solana a Rust program; the math is the same.",
    archSupplyTitle: "Supply and listing",
    archSupplyBody: "Supply is fixed at one billion, minted in full and handed to the curve in full. On TON it sells 900 million and holds the rest until listing, with a 1500 TON threshold. On Solana 800 million are sold, 200 million wait for the pair, threshold 85 SOL. Once the threshold is met the curve closes, and the collected coin plus the remaining supply move into a pool on a DEX.",
    archFeeTitle: "Fees",
    archFeeBody: "The 1% on every buy and sell is withheld by the contract itself and sent straight to the platform — the app never stands between you and the money. The rate is baked into the curve at creation and never changes retroactively. Launching is free: you pay only for your first buy and the network fee, which goes to validators.",
    archKeysTitle: "Keys and signing",
    archKeysBody: "The in-app wallet key is stored encrypted (AES-256-GCM, bound to its owner) and signed by a separate service outside the main server — the web app never sees it. Every transaction is parsed instruction by instruction before signing: foreign programs and transfers around the curve are rejected. Withdrawals go only to an address you proved by signing with your own wallet; changing that address takes effect after 24 hours, and daily withdrawals are capped.",
    archDataTitle: "Market data",
    archDataBody: "Prices, candles and trades are collected by our own crawler once a minute and cached — the app reads what is ready instead of polling the market source from every phone. Impostors of well-known coins and tokens with no name or symbol are filtered out before they reach the list.",
    accountLabel: "Account",
    loginTab: "Log in", createTab: "Create account",
    changeAvatarHint: "Tap to replace",
    addAvatarHint: "Tap to add a photo",
    editHint: "Nickname is required, everything else can be filled in later.",
    loginHint: "Log in to your account with email and password.",
    createHint: "Nickname, email and password are required, everything else can be filled in later.",
    nicknameLabel: "Nickname",
    nicknameError: "2–20 characters, Latin letters, digits, _ and . only, must start with a letter",
    bioLabel: "Bio (optional)",
    bioPlaceholder: "A few words about yourself",
    submittingText: "Checking...",
    saveChanges: "Save changes",
    createAccountShort: "Create",
    firstAccountFirst: "Create an account first",
    connectWalletContinue: "Connect a TON wallet to continue",
    addressCopied: "Address copied",
    verifyRequestSent: "Request sent for review",
    profileVerified: "Profile verified",
    logOutShort: "Log out",
    bioEmptyPlaceholder: "Tell others about yourself — it'll show in comments and token profiles.",
    memberSince: "since today",
    accountNotCreated: "No account yet",
    accountNotCreatedBody: "Log in or create an account to launch tokens, trade and earn achievements.",
    loginCta: "Log in",
    myTokensCreate: "Create",
    myTokensTitle: "My Tokens",
    unnamedToken: "Unnamed Token",
    noTokensYet: "You haven't launched any tokens yet.",
    noActivityYet: "No activity yet — buys, sells and launches will show up here.",
    profileConfirmed: "Profile verified",
    verifyPending: "Review pending",
    verifyCta: "Verify your identity for a badge",
    deleteAccountForever: "Delete account forever",
    editProfileBtn: "Edit Profile",
    activityTitle: "Activity",
    homeHello: "Your launchpad",
    achievementsTitle: "Achievements",
    achUnlockedOf: "{done} of {total}",
    achievementsIntro: "Achievements pay in coins. Spend them in the shop on any frames and cards you like.",
    achProgress: "Progress",
    achGoShop: "Open shop",
    achAll: "All",
    achFirstLaunch: "First launch", achFirstLaunchHint: "Launch your first token",
    wreathBadgeTitle: "Creator badge", wreathClose: "Close",
    verifiedBadgeTitle: "Verified account",
    verifiedBadgeBody: "The app confirmed this profile belongs to its owner.",
    wreathBadgeBody: "Awarded for taking their token to a {sum} market cap.",
    wreathTier1: "First thousand", wreathTier2: "Ten thousand", wreathTier3: "Hundred thousand",
    achMcap1k: "First thousand", achMcap1kHint: "Take one of your tokens to a $1K market cap",
    achMcap10k: "Ten thousand", achMcap10kHint: "Take one of your tokens to a $10K market cap",
    achMcap100k: "Hundred thousand", achMcap100kHint: "Take one of your tokens to a $100K market cap",
    achWallet: "Wallet ready", achWalletHint: "Connect a TON wallet",
    achFace: "A face to the name", achFaceHint: "Add an avatar and a bio",
    achStyle: "Good taste", achStyleHint: "Equip a frame and a card from the shop",
    achInvite1: "First invite", achInvite1Hint: "Invite a friend with your link",
    achInvite5: "Your crowd", achInvite5Hint: "Invite five people",
    achInvite10: "Ten strong", achInvite10Hint: "Invite ten people",
    achInvite25: "Word of mouth", achInvite25Hint: "Invite twenty five people",
    verificationTitle: "Verification",
    verifiedStatus: "Verified",
    pendingStatus: "Pending",
    notVerifiedStatus: "Not Verified",
    verifyAccountBtn: "Verify Account",
    marketCapLabel: "Market Cap",
    manageBtn: "Manage",
    connectWalletModalTitle: "Connect your TON Wallet to continue",
    deleteAccountQ: "Delete account?",
    deleteAccountBody: "This action is irreversible. Your profile, stats and achievements will be permanently deleted, and you'll be signed out.",
    deletingText: "Deleting...",
    deleteShort: "Delete",
    themeChangedWhite: "Theme changed: White",
    themeChangedDark: "Theme changed: Dark",
    launchFailedTitle: "Couldn't launch the token",
    retry: "Retry",
    viewOnExplorer: "View on explorer",
    pinChanged: "PIN changed",
    pinEnabled: "PIN enabled",
    pinDisabled: "PIN disabled",
    pinResetToast: "PIN reset — enable a new one in security settings",
    profileUpdated: "Profile updated",
    loggedIn: "You're logged in",
    accountCreatedToast: "Account created",
    loggedOut: "You've logged out",
    accountDeleted: "Account deleted",
    accountDeleteFailed: "Could not delete the account — the database refused. You are still signed in.",
    connectWalletTrade: "Connect a TON wallet to trade",
    solConnecting: "Opening Phantom — approve the connection",
    solWalletTitle: "Solana wallet",
    solWalletNote: "For Solana memecoins. Your TON wallet stays as it is.",
    solWalletConnect: "Connect",
    solWalletConnectFirst: "wallet not connected",
    solWalletOpening: "Opening…",
    solWalletLoading: "Reading balance…",
    solWalletDisconnect: "Disconnect Solana wallet",
    solDisconnected: "Solana wallet disconnected",
    solSignInWallet: "Sign the swap in Phantom",
    solDone: "Swap sent to the network",
    solSent: "Sent",
    solFailed: "Didn't go through",
    rateLoadingRetry: "TON rate is still loading, try again in a second",
    insufficientTon: "Not enough TON: wallet has {have}, need {need} incl. gas",
    tokenSaveFailed: "Token is live on-chain but wasn't saved: {reason}. We'll retry on next launch.",
    tokenSaveRecovered: "Token ${ticker} added to the app",
    openingWallet: "Opening your wallet…",
    openingWalletHint: "Your wallet will show the prepared transaction — just confirm it.",
    openWalletCta: "Open wallet",
    changeAmountCta: "Change amount",
    boughtToast: "Bought ≈ {receive} ${ticker} for {pay} {unit}",
    txCancelled: "Transaction cancelled or failed",
    insufficientSellAmount: "Not enough tokens to sell this amount",
    connectWalletSell: "Connect a TON wallet to sell",
    soldToast: "Sold {pay} ${ticker} for ≈ {receive} {unit} 💸",
    authErrAlreadyRegistered: "This email is already registered — try the \"Log in\" tab",
    authErrInvalidCreds: "Invalid email or password",
    authErrNotConfirmed: "Confirm your email via the link in the message before logging in",
    authErrPasswordShort: "Password must be at least 6 characters",
    authErrNicknameTaken: "Nickname \"{name}\" is already taken",
    authErrGeneric: "Something went wrong, try again",
    authErrAvatarUpload: "Couldn't upload avatar: {msg}",
  },
};
function t(key) {
  return (STR[lang] && STR[lang][key]) || STR.RU[key] || key;
}
/* Many components use `t` as a prop name for "token", which shadows the
   global t() translation function inside their scope. tr()/trf() are
   plain aliases to t()/tf() for use inside exactly those components. */
function tr(key) { return t(key); }
function trf(key, vars) { return tf(key, vars); }
/* tf: same as t() but substitutes {placeholders} with values from vars,
   e.g. tf("greetingHi", { name: "Leo" }) -> "Привет, Leo" / "Hi, Leo" */
function tf(key, vars) {
  let s = t(key);
  Object.keys(vars || {}).forEach((k) => { s = s.replace(new RegExp(`\\{${k}\\}`, "g"), vars[k]); });
  return s;
}

/* Flat, not gradient — the brief is explicit that the accent should read
   as confident and solid, not decorative. Both themes share one Ember so
   the brand doesn't shift when the user switches appearance. */
const DARK_PRISM = "#6C7CFF";
const LIGHT_PRISM = "#6C7CFF";
let PRISM = DARK_PRISM;
let PRISM_TEXT = "#FFFFFF"; // Midnight ink reads best set on solid Ember in both themes
const FACET = "polygon(18% 0%, 100% 0%, 100% 82%, 82% 100%, 0% 100%, 0% 18%)";

/* Editorial serif for display type (hero numbers, page titles, section
   titles) paired with Inter for everything functional — body copy, labels,
   controls. Loaded via GlobalStyle's @import below. Numeric/on-chain data
   (prices, addresses, hashes) keeps a monospace face, which is the one
   place a "technical" register is appropriate and expected. */
/* Три роли, один шрифт — как и было задумано с самого начала. Jost
   объявлен в index.css, файлы лежат в проекте; запасные варианты те же,
   что стояли раньше, на случай если файл почему-то не доехал.
   Отдельного моноширинного нет намеренно: он выглядел бы заплаткой
   посреди геометрического гротеска, а ровные столбцы цифр даёт
   табличная разметка — она включена глобально ниже, в GlobalStyle. */
const displayFont = "'Jost', 'Futura', 'Century Gothic', 'Segoe UI', sans-serif";
const bodyFont = "'Jost', 'Futura', 'Century Gothic', -apple-system, sans-serif";
const monoFont = "'Jost', 'Futura', 'Century Gothic', 'Courier New', monospace";

/* Motion stays quiet: no overshoot/bounce, 200–300ms, ease-out. */
const SPRING = "240ms cubic-bezier(0.16, 1, 0.3, 1)";
const EASE = "240ms cubic-bezier(0.16, 1, 0.3, 1)";
/* PRESS is what makes taps feel instant: near-zero delay, ease-out-in curve,
   used only on :active. SPRING/EASE above stay for the release/bounce-back
   so the button snaps down immediately and eases back out smoothly. */
const PRESS = "70ms cubic-bezier(0.4, 0, 1, 1)";

/* Нижние шторки. Их дно совпадает с дном окна, а внизу у телефона либо
   полоса «домой», либо скруглённый угол, либо собственная панель
   Telegram — без запаса нижняя кнопка оказывается срезанной краем
   экрана. Сколько там занято, знает только корень приложения (Telegram
   присылает отступы событиями), поэтому он кладёт их в переменные
   --tg-inset-bottom/--tg-inset-top, а шторки берут их отсюда. Сверху
   ограничиваем высоту так, чтобы шапка шторки не уезжала под чёлку. */
/* Общий вид нижних шторок.
 *
 * Раньше шторка шла во всю ширину и упиралась в края экрана, а нижний
 * отступ безопасной зоны добавлялся внутрь карточки — на телефонах с
 * закруглёнными углами она оказывалась подрезанной, и выглядело это
 * криво. Часть окон (настройки, покупка сундука) уже была сделана
 * иначе — плавающей карточкой с полями по бокам, — и два вида шторок
 * ходили по приложению вперемешку.
 *
 * Теперь вид один: карточка не касается стенок, отступы и безопасную
 * зону держит подложка, а скругление у карточки со всех сторон. */
const SHEET_BACK = {
  position: "absolute", inset: 0, background: "rgba(0,0,0,0.75)",
  backdropFilter: "blur(4px)", WebkitBackdropFilter: "blur(4px)",
  display: "flex", alignItems: "flex-end", justifyContent: "center",
  padding: "0 12px calc(12px + var(--tg-inset-bottom, 0px))",
  paddingTop: "var(--tg-inset-top, 0px)",
};
function sheetCard(pad = 22, extra = {}) {
  return {
    width: "100%", maxWidth: 440,
    background: T.surface, border: `1px solid ${T.lineHi}`,
    borderRadius: 26,
    padding: pad,
    // Высоту ограничивает подложка: она уже вычла и чёлку, и нижнюю
    // зону, поэтому здесь достаточно «во всю доступную».
    maxHeight: "100%",
    overflowY: "auto",
    WebkitOverflowScrolling: "touch",
    ...extra,
  };
}

function fmtUSD(n) {
  // Как и с ценой: величина может быть ещё не посчитана. Прочерк вместо
  // числа, а не падение всего экрана на одном обращении.
  const v = typeof n === "number" ? n : (n === null || n === "" || n === undefined ? NaN : Number(n));
  if (!Number.isFinite(v)) return "—";
  if (v >= 1_000_000) return `$${(v / 1_000_000).toFixed(2)}M`;
  if (v >= 1_000) return `$${(v / 1_000).toFixed(1)}K`;
  return `$${v.toFixed(0)}`;
}

/* Подпись шкалы графика. Обычного округления тут мало: когда весь
   видимый разброс — полторы сотни долларов, соседние деления
   складываются в «$1.1K, $1.1K, $1.1K», и шкала выглядит нарисованной.
   Знаков после запятой берём ровно столько, чтобы соседние подписи
   отличались. */
function fmtAxisUSD(value, step) {
  const abs = Math.abs(value);
  const unit = abs >= 1_000_000 ? 1_000_000 : abs >= 1_000 ? 1_000 : 1;
  const suffix = unit === 1_000_000 ? "M" : unit === 1_000 ? "K" : "";
  const perUnit = step / unit;
  const digits = perUnit > 0 ? Math.max(0, Math.min(4, Math.ceil(-Math.log10(perUnit)))) : 0;
  return `$${(value / unit).toFixed(digits)}${suffix}`;
}
/* generateFakeContractAddress — purely cosmetic, client-side only.
   Produces a string shaped like a real TON address (EQ-prefixed,
   base64url alphabet, 48 chars) so the mock "success" screen looks
   legitimate. This is NEVER sent anywhere, checked against any chain,
   or used to construct a real transaction — it exists only to be
   displayed and copied by the user in this local simulation. */
function generateFakeContractAddress() {
  const alphabet = "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789-_";
  let body = "";
  for (let i = 0; i < 46; i++) body += alphabet[Math.floor(Math.random() * alphabet.length)];
  return `EQ${body}`;
}

/* generateFakeTxHash — same idea as above, shaped like a TON transaction
   hash (64 hex chars). Cosmetic only, generated entirely client-side. */
function generateFakeTxHash() {
  const hex = "0123456789abcdef";
  let h = "";
  for (let i = 0; i < 64; i++) h += hex[Math.floor(Math.random() * hex.length)];
  return h;
}

function fmtPrice(p) {
  // Цены может не быть вовсе: у токена на кривой она считается из
  // состояния контракта и приезжает позже самой карточки. Прочерк вместо
  // числа честнее выдуманного нуля, а главное — экран не падает целиком
  // из-за одной ненайденной величины.
  const n = typeof p === "number" ? p : (p === null || p === "" || p === undefined ? NaN : Number(p));
  if (!Number.isFinite(n)) return "—";
  return "$" + n.toFixed(n < 0.001 ? 6 : 4);
}
/* Подпись деления на оси времени. Формат зависит от шага: на минутах
   важен час и минута, на днях — дата, а год не нужен нигде — история у
   мемкоина короче него. */
function подписьВремени(sec, tf) {
  const д = new Date(sec * 1000);
  const дв = (v) => String(v).padStart(2, "0");
  if (tf === "D1" || tf === "W1" || tf === "MN1") return `${дв(д.getDate())}.${дв(д.getMonth() + 1)}`;
  if (tf === "H4" || tf === "H1") return `${дв(д.getDate())}.${дв(д.getMonth() + 1)} ${дв(д.getHours())}:00`;
  return `${дв(д.getHours())}:${дв(д.getMinutes())}`;
}

function fmtCountdown(ms) {
  const total = Math.max(0, Math.floor(ms / 1000));
  const h = Math.floor(total / 3600);
  const m = Math.floor((total % 3600) / 60);
  const s = total % 60;
  const pad = (v) => String(v).padStart(2, "0");
  return h > 0 ? `${h}:${pad(m)}:${pad(s)}` : `${m}:${pad(s)}`;
}

/* ---------------------------------------------------------
   LIVE PULSE — a single shared interval drives every sparkline in
   the app (feed cards, portfolio rows) instead of each card running
   its own timer, which is what would actually cause scroll jank with
   a long list. Components subscribe with useLiveTick() and read the
   current phase; the ticker itself auto-pauses when the tab/app is
   backgrounded (screen off / switched away) so it doesn't burn
   battery or CPU for nothing.
--------------------------------------------------------- */
let livePulse = 0;
const livePulseSubs = new Set();
if (typeof window !== "undefined" && typeof document !== "undefined") {
  let pulseIv = null;
  const startPulse = () => {
    if (pulseIv) return;
    pulseIv = setInterval(() => {
      livePulse += 1;
      livePulseSubs.forEach((fn) => fn(livePulse));
    }, 2000);
  };
  const stopPulse = () => { if (pulseIv) { clearInterval(pulseIv); pulseIv = null; } };
  document.addEventListener("visibilitychange", () => {
    if (document.hidden) stopPulse(); else startPulse();
  });
  startPulse();
}
function useLiveTick() {
  const [tick, setTick] = useState(livePulse);
  useEffect(() => {
    livePulseSubs.add(setTick);
    return () => livePulseSubs.delete(setTick);
  }, []);
  return tick;
}
/* Видно ли элемент на экране прямо сейчас.

   В отличие от разовых проверок выше (те нужны, чтобы один раз сходить
   за данными), эта следит постоянно: витрина длинная, и всё, что уехало
   за край, должно замирать. Иначе полтора десятка рамок анимируются
   разом, хотя видно четыре. */
function useOnScreen(ref, margin = "120px") {
  const [visible, setVisible] = useState(true);
  useEffect(() => {
    const el = ref.current;
    if (!el || typeof IntersectionObserver === "undefined") return;
    const io = new IntersectionObserver(
      (entries) => setVisible(!!(entries[0] && entries[0].isIntersecting)),
      { rootMargin: margin },
    );
    io.observe(el);
    return () => io.disconnect();
  }, [ref, margin]);
  return visible;
}

/* Есть ли у Telegram своя стрелка «назад».

   Внутри Telegram её рисует сам клиент в шапке, и вторая такая же
   кнопка внутри страницы — это две одинаковые стрелки одна под другой.
   Снаружи (обычный браузер) шапки нет вовсе, и без своей кнопки с
   вложенной страницы не выйти. Поэтому не убираем совсем, а прячем
   ровно там, где есть родная. */
function hasTelegramBack() {
  if (typeof window === "undefined") return false;
  const tg = window.Telegram && window.Telegram.WebApp;
  return !!(tg && tg.BackButton && typeof tg.BackButton.show === "function" && tg.initData);
}

/* Закрытие с анимацией.

   React убирает окно из разметки в тот же кадр, поэтому уход получался
   рывком: только что было — и нет. Держим последнее значение ещё
   несколько кадров, пока проигрывается анимация ухода, и лишь потом
   отпускаем. Возвращает [что показывать, уходит ли] — по второму флагу
   вешается класс, который и запускает анимацию.

   Срок короткий: закрытие должно быть быстрее открытия, иначе кажется,
   что окно не отпускает. */
const CLOSE_MS = 170;
function useClosing(value, ms = CLOSE_MS) {
  const [held, setHeld] = useState(value);
  const [closing, setClosing] = useState(false);
  const heldRef = useRef(value);
  heldRef.current = held;

  useEffect(() => {
    if (value) {
      setHeld(value);
      setClosing(false);
      return;
    }
    if (!heldRef.current) return;
    setClosing(true);
    const t = setTimeout(() => { setHeld(null); setClosing(false); }, ms);
    return () => clearTimeout(t);
  }, [value, ms]);

  return [value || held, closing];
}

/* Отклик на нажатие. Внутри Telegram просим у него — это родная
   вибрация клиента, и на iPhone работает только она: navigator.vibrate
   там не поддерживается вовсе, поэтому раньше на айфоне отклика не было
   нигде. Снаружи Telegram остаётся обычный вибромотор. */
function haptic(kind = "light") {
  if (typeof window === "undefined") return;
  const h = window.Telegram && window.Telegram.WebApp && window.Telegram.WebApp.HapticFeedback;
  try {
    if (h) {
      if ((kind === "error" || kind === "success" || kind === "warning") && h.notificationOccurred) {
        h.notificationOccurred(kind);
        return;
      }
      if (h.impactOccurred) { h.impactOccurred(kind); return; }
    }
  } catch (e) { /* старый клиент Telegram — метода может не быть */ }
  try {
    if (navigator.vibrate) navigator.vibrate(kind === "error" ? 40 : 12);
  } catch (e) { /* вибрация запрещена настройками */ }
}

// Local, per-device reaction counters (⭐/🔥/💔 on the token screen).
// There's no social backend here, so these are honestly just "how many
// times you tapped this on this device" — persisted so it survives a
// reload, not a fake global community count.
function useLocalCounter(storageKey, capAtOne = false) {
  const [count, setCount] = useState(() => {
    try {
      if (typeof window !== "undefined") {
        return parseInt(window.localStorage.getItem(storageKey) || "0", 10) || 0;
      }
    } catch (e) { /* localStorage unavailable */ }
    return 0;
  });
  function bump() {
    setCount(prev => {
      if (capAtOne && prev >= 1) return prev;
      const next = prev + 1;
      try { if (typeof window !== "undefined") window.localStorage.setItem(storageKey, String(next)); } catch (e) { /* unavailable */ }
      return next;
    });
  }
  return [count, bump];
}

/* ---------------------------------------------------------
   GLOBAL KEYFRAMES (CSS stand-ins for Framer Motion — see note
   in chat: the framer-motion package isn't available in this
   preview sandbox, so springs/stagger/counters are done with
   CSS + rAF tuned to the same 200–350ms spring timings. In the
   real Next.js app these map 1:1 onto <motion.div> primitives.)
--------------------------------------------------------- */

function GlobalStyle() {
  return (
    <style>{`
      html, body, #root { height: 100%; margin: 0; padding: 0; background: ${T.bg}; -webkit-tap-highlight-color: transparent; }
      /* Цифры одной ширины по всему приложению. Цена в ленте обновляется
         раз в несколько секунд, и с обычными цифрами (единица уже нуля)
         строка при каждом обновлении дёргалась вбок; на шкале графика от
         этого разъезжались подписи. */
      body { font-variant-numeric: tabular-nums; font-feature-settings: "tnum" 1; }
      /* Страница зафиксирована: сам документ не прокручивается и не
         оттягивается резинкой, иначе в Telegram из-под приложения
         вылезают чёрные поля сверху и снизу. Прокрутка живёт только
         внутри контентных контейнеров ниже. */
      html { overflow: hidden; overscroll-behavior: none; }
      body { position: fixed; top: 0; left: 0; right: 0; bottom: 0; overflow: hidden; overscroll-behavior: none; }
      * { -webkit-tap-highlight-color: transparent; }
      /* Щипок двумя пальцами ломал вёрстку: интерфейс рассчитан на
         ширину экрана и при масштабировании разъезжается. Одного
         user-scalable=no в мета-теге мало — iOS его игнорирует, поэтому
         жест масштабирования гасится и на уровне стилей. Этим же
         правилом отключается и приближение по двойному тапу: любое
         значение кроме auto его снимает. Гасить двойной тап вручную,
         отменяя touchend, нельзя — вместе с ним отменяется и нажатие. */
      /* Только вертикальная прокрутка. Двумя пальцами страницу удавалось
         растянуть и увести вбок — приложение оставалось в таком виде, и
         вернуть его назад было нечем: в Telegram нет адресной строки,
         чтобы перезагрузить. */
      html, body { touch-action: pan-y; overflow-x: hidden; overscroll-behavior-x: none; }
      /* iOS Safari (incl. Telegram's in-app WebView) auto-zooms the whole
         viewport when a focused input/textarea/select has a computed
         font-size under 16px. Forcing a 16px floor here — on top of the
         per-field fontSize already set to 16 in the Field component —
         is what actually stops the screen from zooming in while typing. */
      input, textarea, select { font-size: 16px; }
      @keyframes fadeInUp { from{opacity:0; transform:translateY(12px);} to{opacity:1; transform:translateY(0);} }
      /* Главная кнопка знакомства отзывается на нажатие сама: без этого
         на тёмном фоне непонятно, приняло ли касание. */
      .вст-кнопка { transition: transform 130ms ease-out, box-shadow 220ms ease-out, filter 220ms ease-out; }
      .вст-кнопка:active { transform: scale(0.985); filter: brightness(0.95); box-shadow: 0 6px 18px rgba(108,124,255,0.28) !important; }
      .вст-тихо { transition: color 180ms ease-out, opacity 180ms ease-out; }
      .вст-тихо:active { opacity: 0.6; }
      @keyframes spin360 { from{ transform: rotate(0deg); } to{ transform: rotate(360deg); } }
      @keyframes fadeIn { from{opacity:0;} to{opacity:1;} }
      @keyframes scaleIn { from{opacity:0; transform:scale(0.92);} to{opacity:1; transform:scale(1);} }
      @keyframes gridDrift { from{background-position:0 0,0 0;} to{background-position:140px 140px,140px 140px;} }
      @keyframes starTwinkle { 0%,100%{opacity:.2;} 50%{opacity:1;} }
      @keyframes starPulse { 0%,100%{opacity:0;} 50%{opacity:var(--o);} }
      @keyframes gridRunToward { from{ background-position: 0 0, 0 0; } to{ background-position: 0 44px, 0 0; } }
      @keyframes spotlightSweep { 0%{ transform: translateX(-120%); } 55%,100%{ transform: translateX(320%); } }
      @keyframes candleBreathe { 0%,100%{ transform: scaleY(0.72); } 50%{ transform: scaleY(1); } }
      /* Смена строки в ленте — только появление. Раньше анимация ещё и
         гасила строку в конце: если следующая сделка не приезжала (а её
         может не быть часами), лента так и стояла пустой рамкой, в
         которой видно одно лишь время. */
      @keyframes tickerSwap { from{opacity:0; transform:translateY(6px);} to{opacity:1; transform:translateY(0);} }
      @keyframes starDriftRight { from{ transform: translateX(-24px); } to{ transform: translateX(560px); } }
      @keyframes starDriftLeft { from{ transform: translateX(560px); } to{ transform: translateX(-24px); } }
      @keyframes glowPulse { 0%,100%{opacity:.35;} 50%{opacity:.75;} }

      /* Знакомство с приложением. Анимации здесь только на прозрачности
         и сдвиге — их браузер отдаёт видеокарте и не пересчитывает
         раскладку, поэтому пролистывание остаётся гладким даже на
         слабом телефоне. */
      @keyframes вступлениеВверх {
        from { opacity: 0; transform: translateY(16px); }
        to   { opacity: 1; transform: translateY(0); }
      }
      /* Линия кривой рисуется слева направо — как она и растёт. */
      @keyframes линияРисуется {
        from { stroke-dashoffset: var(--длина); }
        to   { stroke-dashoffset: 0; }
      }
      /* Монета всплывает и мягко покачивается: движение подсказывает,
         что рынок живой, но не отвлекает от текста. */
      @keyframes монетаПлывёт {
        0%, 100% { transform: translateY(0); }
        50%      { transform: translateY(-7px); }
      }
      /* Медленное дыхание подложки под иллюстрацией. */
      @keyframes аураДышит {
        0%, 100% { opacity: .35; transform: scale(1); }
        50%      { opacity: .6;  transform: scale(1.06); }
      }
      /* График-строка тянется во всю ширину карточки: у него свои
         размеры в разметке, а здесь они превращаются в долю ширины. */
      .fx-spark svg { width: 100%; height: auto; display: block; }
      /* Лента сделок едет влево ровно на половину — вторая половина
         списка её же копия, поэтому шва не видно. */
      @keyframes лентаЕдет {
        from { transform: translateX(0); }
        to   { transform: translateX(-50%); }
      }
      /* Полосы сияния гаснут и разгораются вразнобой — у каждой своя
         длительность и задержка, поэтому общая картина не повторяется. */
      @keyframes сияниеДышит {
        0%, 100% { opacity: .35; transform: scaleY(0.86); }
        50%      { opacity: 1;   transform: scaleY(1.12); }
      }
      @keyframes shimmer { from{ transform: translateX(-120%); } to{ transform: translateX(220%); } }
      /* Блик по тексту. Крайние точки — ровно 100% и 0%: подложка шире
         надписи, и в этих границах она всегда её закрывает. За ними
         (было 150% и -150%) картинка уезжает за пределы букв, красить их
         становится нечем — и «комиссией 1%» на полминуты пропадала. */
      @keyframes textSweep { 0%{background-position:100% 0;} 100%{background-position:0% 0;} }
      .fx-shine-text {
        background-image: linear-gradient(100deg, ${T.turquoise} 0%, ${T.turquoise} 40%, #ffffff 50%, ${T.turquoise} 60%, ${T.turquoise} 100%);
        background-size: 220% 100%;
        -webkit-background-clip: text;
        background-clip: text;
        color: transparent;
        animation: textSweep 5s linear infinite;
      }
      /* Блик по шкале до биржи: та же бегущая белая полоса, что и в
         надписи «комиссией 1%», только красит не буквы, а заливку. Шкала
         почти всегда стоит на месте, и без движения её принимали за
         поломанную картинку. */
      @keyframes barSweep { 0%{background-position:100% 0;} 100%{background-position:0% 0;} }
      .fx-shine-bar {
        background-image: linear-gradient(100deg, ${T.electric} 0%, ${T.electric} 40%, #ffffff 50%, ${T.electric} 60%, ${T.electric} 100%);
        background-size: 220% 100%;
        animation: barSweep 5s linear infinite;
      }
      .fx-shine-bar-up {
        background-image: linear-gradient(100deg, ${T.up} 0%, ${T.up} 40%, #ffffff 50%, ${T.up} 60%, ${T.up} 100%);
        background-size: 220% 100%;
        animation: barSweep 5s linear infinite;
      }

      /* Появление раздела: графика проступает и чуть подаётся вперёд —
         так переключение сети читается как смена места, а не как
         перекраска фона. */
      @keyframes netIn {
        from { opacity: 0; transform: translate3d(0, -10px, 0) scale(1.04); }
        to   { opacity: 1; transform: none; }
      }
      .fx-net-in { animation: netIn 460ms cubic-bezier(0.22,0.61,0.36,1) both; }
      /* Блик проходит по фигуре раз в семь секунд и половину времени
         стоит за краем: постоянно бегущая полоса читалась бы как
         неисправность, а редкая — как отражение света. */
      @keyframes netShine {
        0%        { transform: translate3d(0, 0, 0);     opacity: 0; }
        8%        { opacity: 0.9; }
        50%       { opacity: 0.9; }
        62%       { transform: translate3d(760px, 0, 0); opacity: 0; }
        100%      { transform: translate3d(760px, 0, 0); opacity: 0; }
      }
      /* Блик идёт от левого края за правый и гаснет ещё в пути: если он
         пропадал на месте, был виден край полосы — казалось, что
         картинка обрезана. */
      .fx-net-shine { animation: netShine 6s linear infinite; will-change: transform; }
      @keyframes mcapGlow { 0%,100%{text-shadow:0 0 10px currentColor,0 0 2px currentColor;} 50%{text-shadow:0 0 18px currentColor,0 0 4px currentColor;} }
      @keyframes ringPulse { 0%{box-shadow:0 0 0 0 ${glow(0.35)};} 100%{box-shadow:0 0 0 14px ${glow(0)};} }
      /* Появляется на месте — только проявлением и лёгким укрупнением,
         без наезда сверху. Уходит вверх и растворяется. */
      /* Заливка листа в индикаторе загрузки: бежит снизу вверх и уходит
         за верхний край, потом начинается заново. */
      @keyframes leafLoaderFill {
        0%   { transform: translateY(34px); }
        70%  { transform: translateY(0); }
        100% { transform: translateY(-4px); }
      }
      @keyframes leafLoaderBar {
        0%   { transform: translateX(-100%); }
        100% { transform: translateX(250%); }
      }
      /* Окно знака: сам венок медленно вырастает, и только потом
         проявляется подпись — сначала показываем награду, потом
         объясняем её. Лист поднимается снизу вместе со шторкой. */
      @keyframes wreathSheetUp {
        from { opacity: 0; transform: translateY(28px); }
        to   { opacity: 1; transform: translateY(0); }
      }
      @keyframes wreathGrowIn {
        0%   { opacity: 0; transform: scale(0.34); }
        60%  { opacity: 1; }
        100% { opacity: 1; transform: scale(1); }
      }
      @keyframes wreathCaptionIn {
        from { opacity: 0; transform: translateY(8px); }
        to   { opacity: 1; transform: translateY(0); }
      }
      /* Венок создателя: листья колышутся, как от ветра. Не маятник из
         двух положений — тот читается как подёргивание, — а неровная
         волна: сильный порыв, откат, слабое качание, снова порыв. Углы
         остаются небольшими: знак висит рядом с ником, и заметное
         движение там раздражало бы. */
      /* Извержение на орбите. Не ровное «дыхание» туда-сюда — то читается
         как лампочка на реостате, — а протуберанец: вспышка встаёт рывком
         и долго опадает, следом идёт слабый повторный выброс. На пике
         плазму отбрасывает наружу, поэтому линия заодно раздувается и
         размывается по краю. */
      @keyframes orbitFlare {
        0%   { opacity: 0.10; transform: scale(1);     filter: blur(0px); }
        7%   { opacity: 1;    transform: scale(1.045); filter: blur(1.4px); }
        24%  { opacity: 0.34; transform: scale(1.012); filter: blur(0.4px); }
        38%  { opacity: 0.72; transform: scale(1.028); filter: blur(0.9px); }
        62%  { opacity: 0.18; transform: scale(1.006); filter: blur(0.2px); }
        100% { opacity: 0.10; transform: scale(1);     filter: blur(0px); }
      }
      /* Расплав течёт под застывшей коркой: двигается не шум, а сама
         светящаяся подложка под ним. Пересчитывать шум каждый кадр
         телефон не обязан — а выглядит одинаково. */
      /* Осколок парит и кувыркается — но еле-еле: обломок камня в
         восходящем потоке, а не пропеллер. */
      @keyframes shardFloat {
        from { transform: translate3d(0, 0, 0) rotate(-6deg); opacity: 0.75; }
        to   { transform: translate3d(6px, -14px, 0) rotate(9deg); opacity: 1; }
      }
      /* Клуб дыма поднимается, расходится и тает. */
      @keyframes smokeRise {
        0%   { transform: translate3d(0, 0, 0) scale(0.6); opacity: 0; }
        25%  { opacity: 1; }
        100% { transform: translate3d(10px, -120px, 0) scale(1.5); opacity: 0; }
      }
      @keyframes moltenDrift {
        from { transform: translate3d(0, 0, 0); }
        to   { transform: translate3d(-50%, 0, 0); }
      }
      @keyframes moltenBreath {
        0%, 100% { opacity: 0.72; }
        50%      { opacity: 1; }
      }
      /* Уголёк и токсик: частица отрывается от кольца и уходит наружу,
         истончаясь. Путь задаётся переменной --rise у самой частицы —
         так одни улетают дальше других, и струя не выглядит строем. */
      @keyframes emberRise {
        0%   { transform: translateY(0) scale(1); opacity: 0; }
        12%  { opacity: 1; }
        70%  { opacity: 0.7; }
        100% { transform: translateY(calc(var(--rise, 20px) * -1)) scale(0.25); opacity: 0; }
      }
      /* Живой огонь не горит ровно. Неровные ступени вместо плавной
         волны: между ними глаз не успевает угадать следующую. */
      @keyframes frameFlicker {
        0%, 100% { opacity: 0.5; }
        18%      { opacity: 1; }
        31%      { opacity: 0.62; }
        47%      { opacity: 0.9; }
        63%      { opacity: 0.55; }
        82%      { opacity: 0.85; }
      }
      /* Искра слетает с кольца по касательной и гаснет на лету. */
      @keyframes sparkShoot {
        0%   { transform: translateX(0) scale(0.6); opacity: 0; }
        14%  { opacity: 1; }
        100% { transform: translateX(var(--fly, 18px)) scale(0.15); opacity: 0; }
      }
      /* Капля собирается на кольце, срывается и падает. Долгая пауза в
         начале — капли копятся медленнее, чем падают. */
      @keyframes dripFall {
        0%, 62% { transform: translateY(0) scale(0.5); opacity: 0; }
        68%     { transform: translateY(2px) scale(1); opacity: 0.9; }
        100%    { transform: translateY(var(--drop, 16px)) scale(0.7); opacity: 0; }
      }
      /* Пульс: не ровные круги, а удар сердца — сильная волна, слабая
         следом, пауза. */
      @keyframes heartWave {
        0%   { transform: scale(1); opacity: 0.75; }
        16%  { transform: scale(1.16); opacity: 0.32; }
        26%  { transform: scale(1.1); opacity: 0.4; }
        44%  { transform: scale(1.3); opacity: 0.14; }
        70%  { transform: scale(1.42); opacity: 0; }
        100% { transform: scale(1.42); opacity: 0; }
      }
      /* Корона затмения: лучи дышат, вытягиваясь наружу. */
      @keyframes coronaBreath {
        0%, 100% { transform: scaleY(1); opacity: 0.3; }
        50%      { transform: scaleY(1.45); opacity: 0.85; }
      }
      /* Грани льда вспыхивают вразнобой. */
      @keyframes frostTwinkle {
        0%, 100% { opacity: 0.2; }
        50%      { opacity: 0.95; }
      }
      /* Лист в полёте: кувыркается вокруг себя и то приближается, то
         уходит вглубь — от этого движение перестаёт быть механическим. */
      @keyframes leafTumble {
        0%   { transform: rotate(-16deg) scale(0.82); }
        30%  { transform: rotate(24deg) scale(1.08); }
        60%  { transform: rotate(-8deg) scale(0.92); }
        100% { transform: rotate(-16deg) scale(0.82); }
      }
      @keyframes wreathSway {
        0%   { transform: rotate(-1.8deg); }
        22%  { transform: rotate(1.9deg); }
        41%  { transform: rotate(-0.6deg); }
        58%  { transform: rotate(1.1deg); }
        76%  { transform: rotate(-2.1deg); }
        100% { transform: rotate(-1.8deg); }
      }
      @keyframes wreathStar {
        0%, 100% { opacity: 0.75; transform: scale(0.94); }
        50%      { opacity: 1;    transform: scale(1.06); }
      }
      /* Ракета: строго снизу вверх по центру, к концу — уменьшение и
         растворение за верхним краем. Конечная точка приходит переменной
         --fly-to. Сама картинка нарисована носом вверх-вправо, поэтому
         разворачивается на 45 градусов — иначе при вертикальном полёте
         она шла бы боком. */
      /* Открытие сундука. Сначала он вздрагивает — три коротких рывка с
         нарастанием, как будто внутри что-то бьётся; потом крышка
         откидывается назад, а из щели бьёт свет. */
      @keyframes chestShake {
        0%, 100% { transform: translate(0, 0) rotate(0deg); }
        12% { transform: translate(-3px, -1px) rotate(-1.5deg); }
        24% { transform: translate(3px, 0) rotate(1.5deg); }
        38% { transform: translate(-5px, -3px) rotate(-2.5deg); }
        52% { transform: translate(5px, 0) rotate(2.5deg); }
        66% { transform: translate(-6px, -5px) rotate(-3deg); }
        80% { transform: translate(6px, -1px) rotate(3deg); }
        92% { transform: translate(-2px, -2px) rotate(-1deg); }
      }
      /* Крышка откидывается назад: её плоскость сокращается почти в
         линию (она встала на ребро), потом слегка отваливается дальше и
         снова раскрывается — так читается инерция тяжёлой крышки. */
      @keyframes chestLidOpen {
        0%   { transform: translateY(0) scaleY(1); }
        50%  { transform: translateY(-2px) scaleY(0.05); }
        76%  { transform: translateY(-9px) scaleY(-0.72); }
        100% { transform: translateY(-7px) scaleY(-0.62); }
      }
      /* Изнанка проступает ровно в тот миг, когда крышка проходит через
         ребро: до этого мы видим лицевую сторону, после — обратную. */
      @keyframes lidFlip {
        0%, 54%  { opacity: 0; }
        58%      { opacity: 1; }
        100%     { opacity: 1; }
      }
      /* Свет из-под крышки: узкая полоса расходится в широкий конус. */
      @keyframes chestBeam {
        0%   { opacity: 0; transform: scaleX(0.2) scaleY(0.3); }
        40%  { opacity: 1; }
        100% { opacity: 0.85; transform: scaleX(1) scaleY(1); }
      }
      @keyframes chestFlash {
        0%   { opacity: 0; transform: scale(0.4); }
        30%  { opacity: 1; transform: scale(1.15); }
        100% { opacity: 0; transform: scale(1.8); }
      }
      /* Приз выезжает из сундука и оседает на месте. */
      @keyframes prizeRise {
        0%   { opacity: 0; transform: translateY(46px) scale(0.5); }
        55%  { opacity: 1; transform: translateY(-10px) scale(1.06); }
        100% { opacity: 1; transform: translateY(0) scale(1); }
      }
      @keyframes prizeGlow {
        0%, 100% { opacity: 0.45; }
        50% { opacity: 0.9; }
      }
      /* Искры разлетаются от сундука в момент вспышки. Каждой задан свой
         угол и задержка переменными. */
      /* Лента едет справа налево и встаёт на выигрышной вещи. Конечная
         точка приходит переменной --roll-to. */
      @keyframes rollStrip {
        0%   { transform: translateX(130px); }
        100% { transform: translateX(var(--roll-to)); }
      }
      @keyframes chestSpark {
        0%   { opacity: 0; transform: rotate(var(--a)) translateY(0) scale(0.5); }
        20%  { opacity: 1; }
        100% { opacity: 0; transform: rotate(var(--a)) translateY(var(--d)) scale(1); }
      }
      @keyframes rocketFly {
        0%   { transform: translate(-50%, calc(100vh + 150px)) rotate(-45deg); opacity: 0; }
        7%   { opacity: 1; }
        /* До самого конца летит в полную величину: уменьшать её на
           подлёте незачем, гаснет она у самой рамки. */
        88%  { transform: translate(-50%, calc(var(--fly-to) + 46px)) rotate(-45deg); opacity: 1; }
        100% { transform: translate(-50%, var(--fly-to)) rotate(-45deg); opacity: 0; }
      }
      /* Косметика: рамки аватарки и карточки профиля.

         Всё движение здесь — только сдвиг, поворот и прозрачность:
         предметов на витрине больше десятка, и они анимируются все
         разом. Любое правило, заставляющее браузер заново считать
         раскладку, превратило бы прокрутку магазина в кашу. */
      @keyframes frameWave { 0%{ transform: scale(1); opacity: 0.6; } 100%{ transform: scale(1.5); opacity: 0; } }
      @keyframes cardWave { from{ transform: translateX(-12%); } to{ transform: translateX(12%); } }
      @keyframes cardStreak {
        0%   { transform: translate3d(0, 0, 0); opacity: 0; }
        12%  { opacity: var(--o); }
        88%  { opacity: var(--o); }
        100% { transform: translate3d(-40px, var(--fall), 0); opacity: 0; }
      }
      @keyframes cardRise {
        0%   { transform: translate3d(0, 0, 0) scale(0.6); opacity: 0; }
        18%  { opacity: var(--o); }
        100% { transform: translate3d(0, var(--rise), 0) scale(1); opacity: 0; }
      }
      @keyframes cardLeafFall {
        0%   { transform: translate3d(0, 0, 0) rotate(var(--r0)); opacity: 0; }
        12%  { opacity: var(--o); }
        84%  { opacity: var(--o); }
        100% { transform: translate3d(var(--dx), var(--fall), 0) rotate(var(--r1)); opacity: 0; }
      }
      @keyframes cardBeam {
        from { opacity: 0.3; transform: translate3d(-26px, 0, 0) skewX(-14deg); }
        to   { opacity: 0.85; transform: translate3d(26px, 0, 0) skewX(-14deg); }
      }
      @keyframes holoShift { from{ background-position: 0% 0; } to{ background-position: 320% 0; } }
      @keyframes toastIn { from{opacity:0; transform:translateX(-50%) scale(0.94);} to{opacity:1; transform:translateX(-50%) scale(1);} }
      @keyframes toastOut { from{opacity:1; transform:translateX(-50%) translateY(0) scale(1);} to{opacity:0; transform:translateX(-50%) translateY(-22px) scale(0.98);} }
      @keyframes rocketUp { 0%{ transform:translateY(0) scale(0.75); opacity:0; } 18%{ opacity:0.9; } 100%{ transform:translateY(-70px) scale(1); opacity:0; } }
      @keyframes emberFall { 0%{ transform:translateY(-4px) scale(0.5); opacity:0; } 15%{ opacity:0.9; } 75%{ opacity:0.55; } 100%{ transform:translateY(60px) scale(1.1); opacity:0; } }
      @keyframes candleGrow { from{ transform:scaleY(0); opacity:0; } to{ transform:scaleY(1); opacity:1; } }
      @keyframes spotlightRotate { from{ transform: rotate(0deg); } to{ transform: rotate(360deg); } }
      @keyframes spotlightRotateRev { from{ transform: rotate(360deg); } to{ transform: rotate(0deg); } }
      @keyframes spotlightPulse { 0%,100%{ opacity:0.45; transform:scale(1); } 50%{ opacity:0.85; transform:scale(1.06); } }
      @keyframes spotlightOrbit { from{ transform: rotate(0deg) translateX(var(--orbit-r)) rotate(0deg); } to{ transform: rotate(360deg) translateX(var(--orbit-r)) rotate(-360deg); } }
      @keyframes shake { 0%,100%{ transform:translateX(0); } 20%{ transform:translateX(-8px); } 40%{ transform:translateX(8px); } 60%{ transform:translateX(-6px); } 80%{ transform:translateX(6px); } }
      @keyframes heroRocketFlame { 0%,100%{ opacity:0.55; transform: scaleY(0.85) scaleX(0.9); } 50%{ opacity:1; transform: scaleY(1.15) scaleX(1.05); } }
      @keyframes heroRocketFloat { 0%,100%{ transform: translateY(0) rotate(-3deg); } 50%{ transform: translateY(-5px) rotate(3deg); } }
      button { touch-action: manipulation; cursor: pointer; }
      /* Заполнение backwards, а не both, и никаких will-change.
         Оставленная после анимации трансформация делает элемент
         системой отсчёта для своего содержимого, и WebKit рисует
         текстовую каретку внутри полей мимо строки — на айфоне она
         уезжала под поле. Конечный кадр здесь и так совпадает с обычным
         состоянием, так что визуально ничего не меняется. */
      .fx-card { animation: fadeInUp 480ms cubic-bezier(0.16,1,0.3,1) backwards; transition: transform ${SPRING}, border-color ${EASE}, box-shadow ${EASE}; }
      .fx-card:active { transform: scale(0.98); transition: transform ${PRESS}; }
      /* Только для настоящей мыши. На тач-экране :hover прилипает после
         касания и не снимается до тапа в стороне, а !important перебивал
         рамку выбранного предмета — выделение выглядело залипшим. */
      @media (hover: hover) and (pointer: fine) {
        .fx-card:hover { border-color: ${T.lineHi}; }
      }
      .fx-tap { transition: transform ${SPRING}; }
      .fx-tap:active { transform: scale(0.96); transition: transform ${PRESS}; }
      /* Нажатие внутри виджета не должно вдавливать виджет целиком.
         Браузер считает нажатым не только то, на что нажали, но и всё,
         что вокруг: карточку, её обёртку, экран. Поэтому у внешнего
         блока отклик снимаем, как только внутри нажали что-то своё —
         кнопку, ссылку или поле. Сама кнопка-карточка при этом
         отзывается по-прежнему: она нажата не «внутри себя», а сама. */
      .fx-card:has(:is(button, a, input, select, textarea, [role="button"]):active),
      .fx-tap:has(:is(button, a, input, select, textarea, [role="button"]):active),
      .fx-chip:has(:is(button, a, input, select, textarea, [role="button"]):active) {
        transform: none;
      }
      /* Оформление внутри кнопки, а не кнопка. Такой блок берёт вид
         карточки — появление, рамку — но на нажатие не отзывается сам:
         иначе он вдавливался бы отдельно от кнопки, внутри которой
         лежит, и нажатие двоилось. */
      .fx-inert:active { transform: none; }
      /* Появление страницы: 200 мс вместо 320. Полсекунды на переход
         между вкладками читаются задержкой, а не плавностью — особенно
         теперь, когда отклик на нажатие приходит сразу. */
      .fx-view { animation: viewIn 200ms cubic-bezier(0.16,1,0.3,1) backwards; }
      @keyframes viewIn {
        from { opacity: 0; transform: translateY(8px) scale(0.994); }
        to   { opacity: 1; transform: none; }
      }
      /* Заглушка вместо ещё не пришедших данных.
         Блик едет отдельным слоем и размыт: градиентом по фону та же
         полоса выходит плоской и на широкой плашке почти не видна, а
         размытая читается как отблеск на стекле — сразу понятно, что
         место живое и содержимое вот-вот появится. */
      .fx-skeleton { position: relative; overflow: hidden; background: ${T.surfaceHi}; }
      .fx-skeleton::after {
        content: ""; position: absolute; top: -50%; bottom: -50%; left: 0; width: 55%;
        background: linear-gradient(90deg, transparent, ${T.ice}2E 42%, ${T.ice}52 50%, ${T.ice}2E 58%, transparent);
        filter: blur(12px);
        animation: shimmer 1.5s linear infinite;
      }
      @media (prefers-reduced-motion: reduce) { .fx-skeleton::after { animation: none; } }
      .fx-chip { transition: border-color ${EASE}, background ${EASE}, color ${EASE}, transform ${SPRING}; }
      .fx-chip:active { transition: border-color ${EASE}, background ${EASE}, color ${EASE}, transform ${PRESS}; }
      /* Замороженная плитка: всё внутри стоит. Анимации не снимаются, а
         ставятся на паузу — вернувшись на экран, они продолжают с того
         же места, и рамка не дёргается заново при каждой прокрутке. */
      .fx-frozen, .fx-frozen * { animation-play-state: paused !important; }
      .fx-modal-back { animation: fadeIn 220ms ease-out both; }
      .fx-modal-card { animation: scaleIn 260ms cubic-bezier(0.16,1,0.3,1) backwards; }
      /* Уход: затемнение гаснет, окно проседает вниз и слегка сжимается.
         Кривая с резким началом — рывок в сторону пальца, а не вязкое
         сползание. Ровно ${CLOSE_MS} мс: быстрее открытия, иначе окно
         кажется неотпускающим. */
      .fx-out.fx-modal-back { animation: backdropOut ${CLOSE_MS}ms ease-in both; }
      .fx-out .fx-modal-card, .fx-out.fx-modal-card { animation: sheetOut ${CLOSE_MS}ms cubic-bezier(0.4, 0, 0.9, 0.5) both; }
      @keyframes backdropOut { to { opacity: 0; } }
      @keyframes sheetOut { to { opacity: 0; transform: translateY(16px) scale(0.985); } }
      /* Появление вещей в примерке: одна за другой слева направо. */
      @keyframes lookIn {
        from { opacity: 0; transform: translateX(-14px) scale(0.92); }
        to   { opacity: 1; transform: none; }
      }
      .fx-look-in { animation: lookIn 300ms cubic-bezier(0.22, 1, 0.36, 1) both; }
      @media (prefers-reduced-motion: reduce) { .fx-look-in { animation: none; } }
      /* Раскрытие по нажатию: панель кошелька, заметка, длинный список.
         Появляется сверху вниз, из-под кнопки, которая её открыла, —
         иначе блок просто возникает и глазу приходится заново искать,
         что изменилось. */
      .fx-reveal { animation: revealDown 240ms cubic-bezier(0.16,1,0.3,1) backwards; }
      @keyframes revealDown {
        from { opacity: 0; transform: translateY(-6px) scale(0.99); }
        to   { opacity: 1; transform: none; }
      }
      /* Смена содержимого на месте: вкладки внутри карточки. Сдвиг
         маленький — это не переход на другой экран, а подмена. */
      .fx-swap { animation: swapIn 200ms cubic-bezier(0.16,1,0.3,1) backwards; }
      @keyframes swapIn {
        from { opacity: 0; transform: translateY(5px); }
        to   { opacity: 1; transform: none; }
      }
      /* Кнопка в ожидании ответа. Одной приглушённой прозрачности мало:
         так выглядит и запрещённая кнопка, и та, что уже работает, —
         человек жмёт второй раз, думая, что не попал. Пульсация говорит,
         что дело идёт. */
      .fx-busy { animation: busyPulse 1.1s ease-in-out infinite; }
      @keyframes busyPulse { 0%, 100% { opacity: 0.5; } 50% { opacity: 0.85; } }
      @media (prefers-reduced-motion: reduce) {
        .fx-reveal, .fx-swap { animation: none; }
        .fx-busy { animation: none; opacity: 0.6; }
      }
      /* Блик по кольцу до биржи: бежит слева направо и обрезан маской по
         собранной части, поэтому свет идёт только там, где уже есть
         деньги. Смещение считается от длины окружности — она у каждого
         размера своя и приходит переменной. */
      .fx-ring-glow { animation: ringGlow 2.6s linear infinite; }
      @keyframes ringGlow {
        from { stroke-dashoffset: 0; }
        to   { stroke-dashoffset: calc(var(--ring-len) * -1); }
      }
      @media (prefers-reduced-motion: reduce) { .fx-ring-glow { animation: none; opacity: 0.5; } }
      /* Крестик закрытия. Иконка в 16 пикселей — цель меньше пальца, и
         промах по ней читается как «окно не закрывается». Поле нажатия
         растёт наружу отрицательным полем, поэтому вёрстка не едет. */
      .fx-close {
        padding: 12px; margin: -12px; border-radius: 999px;
        display: flex; align-items: center; justify-content: center;
      }
      .fx-avatar { transition: transform ${SPRING}; }
      .fx-avatar:active { transform: scale(0.96); transition: transform ${PRESS}; }
      .cta-launch { transition: transform ${SPRING}, opacity ${EASE}; }
      .cta-launch:hover { opacity: 0.92; }
      .cta-launch:active { transform: scale(0.98); transition: transform ${PRESS}; }
      .tf-btn { transition: background ${EASE}, color ${EASE}, transform ${SPRING}; }
      .tf-btn:active { transform: scale(0.92); transition: background ${EASE}, color ${EASE}, transform ${PRESS}; }
      /* none, а не contain: contain лишь запрещает утянуть за собой окно,
         но сам список всё равно отскакивает на резинке — и над контентом
         засвечивается фон. none убирает и отскок тоже. */
      .no-scrollbar { scrollbar-width: none; -ms-overflow-style: none; overscroll-behavior: none; }
      .no-scrollbar::-webkit-scrollbar { display: none; width: 0; height: 0; }
    `}</style>
  );
}

/* deterministic pseudo-random so the star field doesn't reshuffle on re-render */
function seededRand(seed) {
  let s = seed;
  return function () {
    s = (s * 9301 + 49297) % 233280;
    return s / 233280;
  };
}

/* Три породы листьев для фона: клён, дуб и мята. Контуры построены по
   опорным точкам и зеркальны относительно черешка, поэтому лист не
   «косит» на одну сторону. Прожилки рисуются цветом фона: на почти
   прозрачном листе они не подсвечивают, а прорезают его, и деталь
   видно, не поднимая яркость. */
const LEAF_KINDS = [
  // клён
  {
    // Край не гладкий, а бугристый — как у листа мяты. Бугры посчитаны
    // по прежнему ровному контуру: он разложен по длине на одинаковые
    // куски, и каждый выгнут наружу. У самых острых мест выгиб гаснет,
    // иначе кончики лопастей заплывали бы.
    outline: "M 0.0 -1.0 Q 1.4 -1.0 2.6 -2.9 Q 4.2 -3.1 5.5 -4.2 Q 7.8 -3.6 8.5 -5.3 Q 9.3 -5.4 9.1 -6.7 Q 8.7 -6.4 6.3 -8.3 Q 7.1 -8.5 6.8 -9.8 Q 9.6 -9.5 9.8 -10.8 Q 12.7 -11.0 12.7 -12.2 Q 13.2 -12.5 11.9 -13.2 Q 11.9 -13.5 8.8 -14.1 Q 8.8 -14.7 5.9 -15.3 Q 7.1 -16.4 6.7 -17.2 Q 9.2 -19.0 8.9 -19.5 Q 10.3 -21.1 10.2 -21.8 Q 9.5 -22.8 7.1 -22.4 Q 6.2 -23.8 4.0 -23.2 Q 3.5 -25.3 2.6 -26.0 Q 2.0 -28.8 1.0 -28.7 Q 0.0 -29.5 -1.0 -28.7 Q -2.0 -28.8 -2.6 -26.0 Q -3.5 -25.3 -4.0 -23.2 Q -6.2 -23.8 -7.1 -22.4 Q -9.5 -22.8 -10.2 -21.8 Q -10.3 -21.1 -8.9 -19.5 Q -9.2 -19.0 -6.7 -17.2 Q -7.1 -16.4 -5.9 -15.3 Q -8.8 -14.7 -8.8 -14.1 Q -11.9 -13.5 -11.9 -13.2 Q -13.2 -12.5 -12.7 -12.2 Q -12.7 -11.0 -9.8 -10.8 Q -9.6 -9.5 -6.8 -9.8 Q -7.1 -8.5 -6.3 -8.3 Q -8.7 -6.4 -9.1 -6.7 Q -9.3 -5.4 -8.5 -5.3 Q -7.8 -3.6 -5.5 -4.2 Q -4.2 -3.1 -2.6 -2.9 Q -1.4 -1.0 0.0 -1.0 Z",
    stem: "M 0 -1 Q 0.4 1.6 0.2 4.6",
    // Одна сплошная жилковая система: средняя жилка идёт от черешка
    // до вершины, а боковые отходят от неё — и начинаются ровно в
    // точке на ней, первым куском вдоль неё, поэтому стык не виден.
    // Веером из одной точки лист в мелком размере собирался в тёмное
    // пятно у основания.
    veins: [
      "M 0 -1.40 Q 0.60 -15.40 0 -27.40",
      "M 0.14 -5 Q 5.30 -7.37 9.40 -5.90",
      "M -0.14 -5 Q -5.3 -7.37 -9.4 -5.90",
      "M 0.25 -9.60 Q 7.03 -12.26 12.50 -12",
      "M -0.25 -9.60 Q -7.03 -12.26 -12.5 -12",
      "M 0.30 -15 Q 5.52 -18.26 9.80 -20.50",
      "M -0.3 -15 Q -5.52 -18.26 -9.8 -20.50",
      "M 0.24 -20.40 Q 2.04 -23.14 3.60 -23.20",
      "M -0.24 -20.40 Q -2.04 -23.14 -3.6 -23.20",
    ],
  },
  // дуб
  {
    outline: "M 0.0 -1.0 Q 2.8 -1.6 3.4 -4.4 Q 7.8 -5.0 7.2 -8.0 Q 3.4 -8.6 3.2 -11.2 Q 8.4 -11.8 7.8 -14.8 Q 3.4 -15.4 3.2 -18.0 Q 7.6 -18.4 6.6 -21.4 Q 3.0 -22.0 2.8 -24.4 Q 4.8 -26.6 0.0 -29.0 Q -4.8 -26.6 -2.8 -24.4 Q -3.0 -22.0 -6.6 -21.4 Q -7.6 -18.4 -3.2 -18.0 Q -3.4 -15.4 -7.8 -14.8 Q -8.4 -11.8 -3.2 -11.2 Q -3.4 -8.6 -7.2 -8.0 Q -7.8 -5.0 -3.4 -4.4 Q -2.8 -1.6 -0.0 -1.0 Z",
    stem: "M 0 -1 Q -0.4 1.6 -0.6 4.6",
    veins: [
      "M 0 -1.5 L 0 -26.5",
      "M 0 -6.0 Q 2.4 -7.0 5.4 -8.6",
      "M 0 -6.0 Q -2.4 -7.0 -5.4 -8.6",
      "M 0 -12.6 Q 2.4 -13.6 5.8 -15.2",
      "M 0 -12.6 Q -2.4 -13.6 -5.8 -15.2",
      "M 0 -19.0 Q 2.4 -20.0 4.8 -21.6",
      "M 0 -19.0 Q -2.4 -20.0 -4.8 -21.6",
    ],
  },
  // мята — форма с натурного листа: широкая нижняя треть, острый кончик,
  // круглые фестоны по краю и три пары дуговых жилок. Контур считается
  // формулой (scripts/make-leaf.mjs), а не набран руками: прежний
  // собирался из отрезков и в мелком размере выглядел обгрызенным.
  {
    outline: "M 0.00 -1.00 C 0.33 -1.04, 1.52 -1.15, 1.99 -1.23 C 2.45 -1.30, 2.55 -1.38, 2.79 -1.45 C 3.02 -1.52, 3.21 -1.60, 3.39 -1.68 C 3.58 -1.75, 3.75 -1.82, 3.91 -1.90 C 4.07 -1.97, 4.22 -2.05, 4.37 -2.13 C 4.51 -2.20, 4.64 -2.27, 4.77 -2.35 C 4.89 -2.43, 5.01 -2.50, 5.13 -2.58 C 5.24 -2.65, 5.35 -2.72, 5.45 -2.80 C 5.55 -2.88, 5.64 -2.95, 5.73 -3.02 C 5.82 -3.10, 5.90 -3.17, 5.97 -3.25 C 6.04 -3.33, 6.11 -3.40, 6.17 -3.47 C 6.22 -3.55, 6.24 -3.63, 6.29 -3.70 C 6.34 -3.78, 6.39 -3.85, 6.44 -3.93 C 6.49 -4.00, 6.54 -4.08, 6.60 -4.15 C 6.65 -4.23, 6.70 -4.30, 6.75 -4.38 C 6.81 -4.45, 6.86 -4.52, 6.92 -4.60 C 6.98 -4.67, 7.04 -4.75, 7.10 -4.82 C 7.17 -4.90, 7.22 -4.97, 7.31 -5.05 C 7.39 -5.13, 7.52 -5.20, 7.61 -5.27 C 7.70 -5.35, 7.77 -5.42, 7.84 -5.50 C 7.91 -5.58, 7.98 -5.65, 8.03 -5.72 C 8.09 -5.80, 8.15 -5.87, 8.19 -5.95 C 8.24 -6.02, 8.28 -6.10, 8.31 -6.18 C 8.34 -6.25, 8.37 -6.33, 8.39 -6.40 C 8.41 -6.48, 8.42 -6.55, 8.42 -6.63 C 8.42 -6.70, 8.41 -6.78, 8.38 -6.85 C 8.35 -6.93, 8.26 -7.00, 8.23 -7.08 C 8.20 -7.15, 8.20 -7.22, 8.20 -7.30 C 8.19 -7.38, 8.19 -7.45, 8.20 -7.53 C 8.20 -7.60, 8.21 -7.67, 8.23 -7.75 C 8.25 -7.83, 8.27 -7.90, 8.30 -7.98 C 8.33 -8.05, 8.37 -8.13, 8.41 -8.20 C 8.46 -8.27, 8.49 -8.35, 8.57 -8.43 C 8.65 -8.50, 8.80 -8.57, 8.89 -8.65 C 8.98 -8.72, 9.04 -8.80, 9.10 -8.88 C 9.16 -8.95, 9.20 -9.02, 9.24 -9.10 C 9.27 -9.18, 9.30 -9.25, 9.32 -9.33 C 9.34 -9.40, 9.35 -9.47, 9.35 -9.55 C 9.35 -9.62, 9.35 -9.70, 9.33 -9.78 C 9.31 -9.85, 9.29 -9.93, 9.25 -10.00 C 9.21 -10.07, 9.16 -10.15, 9.09 -10.22 C 9.01 -10.30, 8.85 -10.38, 8.78 -10.45 C 8.71 -10.52, 8.68 -10.60, 8.64 -10.68 C 8.61 -10.75, 8.58 -10.82, 8.56 -10.90 C 8.55 -10.97, 8.53 -11.05, 8.53 -11.13 C 8.53 -11.20, 8.54 -11.28, 8.55 -11.35 C 8.57 -11.43, 8.59 -11.50, 8.62 -11.57 C 8.65 -11.65, 8.68 -11.73, 8.75 -11.80 C 8.83 -11.88, 8.99 -11.95, 9.07 -12.03 C 9.15 -12.10, 9.20 -12.18, 9.24 -12.25 C 9.29 -12.32, 9.32 -12.40, 9.34 -12.47 C 9.36 -12.55, 9.37 -12.63, 9.37 -12.70 C 9.37 -12.78, 9.36 -12.85, 9.34 -12.92 C 9.32 -13.00, 9.29 -13.07, 9.25 -13.15 C 9.21 -13.23, 9.17 -13.30, 9.10 -13.38 C 9.04 -13.45, 8.97 -13.53, 8.87 -13.60 C 8.77 -13.67, 8.59 -13.75, 8.49 -13.82 C 8.40 -13.90, 8.36 -13.98, 8.31 -14.05 C 8.25 -14.13, 8.21 -14.20, 8.18 -14.27 C 8.15 -14.35, 8.12 -14.43, 8.10 -14.50 C 8.09 -14.57, 8.08 -14.65, 8.08 -14.72 C 8.08 -14.80, 8.09 -14.88, 8.11 -14.95 C 8.13 -15.03, 8.14 -15.10, 8.19 -15.18 C 8.25 -15.25, 8.39 -15.33, 8.45 -15.40 C 8.52 -15.47, 8.55 -15.55, 8.57 -15.62 C 8.60 -15.70, 8.60 -15.78, 8.61 -15.85 C 8.61 -15.93, 8.60 -16.00, 8.58 -16.08 C 8.56 -16.15, 8.54 -16.22, 8.50 -16.30 C 8.47 -16.37, 8.43 -16.45, 8.37 -16.52 C 8.32 -16.60, 8.26 -16.68, 8.19 -16.75 C 8.12 -16.82, 8.04 -16.90, 7.93 -16.98 C 7.83 -17.05, 7.66 -17.13, 7.56 -17.20 C 7.47 -17.27, 7.42 -17.35, 7.36 -17.42 C 7.30 -17.50, 7.25 -17.58, 7.21 -17.65 C 7.16 -17.73, 7.13 -17.80, 7.10 -17.88 C 7.07 -17.95, 7.05 -18.02, 7.03 -18.10 C 7.02 -18.17, 7.01 -18.25, 7.01 -18.33 C 7.01 -18.40, 7.00 -18.48, 7.03 -18.55 C 7.05 -18.63, 7.14 -18.70, 7.17 -18.77 C 7.20 -18.85, 7.21 -18.93, 7.21 -19.00 C 7.21 -19.07, 7.19 -19.15, 7.17 -19.23 C 7.15 -19.30, 7.12 -19.38, 7.09 -19.45 C 7.06 -19.52, 7.02 -19.60, 6.97 -19.68 C 6.92 -19.75, 6.87 -19.82, 6.81 -19.90 C 6.75 -19.97, 6.68 -20.05, 6.61 -20.13 C 6.54 -20.20, 6.46 -20.28, 6.37 -20.35 C 6.27 -20.43, 6.13 -20.50, 6.05 -20.57 C 5.96 -20.65, 5.91 -20.72, 5.84 -20.80 C 5.78 -20.87, 5.73 -20.95, 5.68 -21.03 C 5.63 -21.10, 5.58 -21.18, 5.54 -21.25 C 5.50 -21.32, 5.46 -21.40, 5.43 -21.47 C 5.40 -21.55, 5.37 -21.63, 5.34 -21.70 C 5.32 -21.78, 5.28 -21.85, 5.27 -21.93 C 5.26 -22.00, 5.29 -22.07, 5.28 -22.15 C 5.26 -22.22, 5.24 -22.30, 5.21 -22.38 C 5.17 -22.45, 5.13 -22.53, 5.09 -22.60 C 5.05 -22.68, 5.00 -22.75, 4.95 -22.82 C 4.90 -22.90, 4.84 -22.98, 4.78 -23.05 C 4.73 -23.13, 4.66 -23.20, 4.60 -23.27 C 4.53 -23.35, 4.47 -23.43, 4.39 -23.50 C 4.32 -23.57, 4.25 -23.65, 4.17 -23.73 C 4.09 -23.80, 3.99 -23.88, 3.91 -23.95 C 3.84 -24.02, 3.78 -24.10, 3.71 -24.17 C 3.65 -24.25, 3.59 -24.33, 3.53 -24.40 C 3.47 -24.48, 3.41 -24.55, 3.35 -24.63 C 3.29 -24.70, 3.24 -24.77, 3.18 -24.85 C 3.13 -24.92, 3.07 -25.00, 3.02 -25.08 C 2.96 -25.15, 2.90 -25.23, 2.85 -25.30 C 2.80 -25.38, 2.76 -25.45, 2.70 -25.52 C 2.65 -25.60, 2.58 -25.68, 2.52 -25.75 C 2.46 -25.82, 2.39 -25.90, 2.32 -25.98 C 2.25 -26.05, 2.18 -26.13, 2.11 -26.20 C 2.03 -26.27, 1.96 -26.35, 1.88 -26.43 C 1.81 -26.50, 1.73 -26.57, 1.65 -26.65 C 1.57 -26.72, 1.49 -26.80, 1.41 -26.88 C 1.33 -26.95, 1.25 -27.03, 1.16 -27.10 C 1.08 -27.18, 0.99 -27.25, 0.91 -27.32 C 0.82 -27.40, 0.73 -27.47, 0.64 -27.55 C 0.55 -27.62, 0.46 -27.70, 0.36 -27.78 C 0.25 -27.85, 0.06 -27.96, 0.00 -28.00 C -0.06 -28.04, 0.06 -28.04, 0.00 -28.00 C -0.06 -27.96, -0.25 -27.85, -0.36 -27.78 C -0.46 -27.70, -0.55 -27.62, -0.64 -27.55 C -0.73 -27.47, -0.82 -27.40, -0.91 -27.32 C -0.99 -27.25, -1.08 -27.18, -1.16 -27.10 C -1.25 -27.03, -1.33 -26.95, -1.41 -26.88 C -1.49 -26.80, -1.57 -26.72, -1.65 -26.65 C -1.73 -26.57, -1.81 -26.50, -1.88 -26.43 C -1.96 -26.35, -2.03 -26.27, -2.11 -26.20 C -2.18 -26.13, -2.25 -26.05, -2.32 -25.98 C -2.39 -25.90, -2.46 -25.82, -2.52 -25.75 C -2.58 -25.68, -2.65 -25.60, -2.70 -25.52 C -2.76 -25.45, -2.80 -25.38, -2.85 -25.30 C -2.90 -25.23, -2.96 -25.15, -3.02 -25.07 C -3.07 -25.00, -3.13 -24.92, -3.18 -24.85 C -3.24 -24.77, -3.29 -24.70, -3.35 -24.63 C -3.41 -24.55, -3.47 -24.48, -3.53 -24.40 C -3.59 -24.33, -3.65 -24.25, -3.71 -24.18 C -3.78 -24.10, -3.84 -24.02, -3.91 -23.95 C -3.99 -23.88, -4.09 -23.80, -4.17 -23.73 C -4.25 -23.65, -4.32 -23.57, -4.39 -23.50 C -4.47 -23.43, -4.53 -23.35, -4.60 -23.27 C -4.66 -23.20, -4.73 -23.13, -4.78 -23.05 C -4.84 -22.98, -4.90 -22.90, -4.95 -22.82 C -5.00 -22.75, -5.05 -22.68, -5.09 -22.60 C -5.13 -22.53, -5.17 -22.45, -5.21 -22.38 C -5.24 -22.30, -5.26 -22.22, -5.28 -22.15 C -5.29 -22.07, -5.26 -22.00, -5.27 -21.93 C -5.28 -21.85, -5.32 -21.77, -5.34 -21.70 C -5.37 -21.63, -5.40 -21.55, -5.43 -21.47 C -5.46 -21.40, -5.50 -21.32, -5.54 -21.25 C -5.58 -21.18, -5.63 -21.10, -5.68 -21.03 C -5.73 -20.95, -5.78 -20.88, -5.84 -20.80 C -5.91 -20.73, -5.96 -20.65, -6.05 -20.57 C -6.13 -20.50, -6.27 -20.43, -6.37 -20.35 C -6.46 -20.28, -6.54 -20.20, -6.61 -20.12 C -6.68 -20.05, -6.75 -19.97, -6.81 -19.90 C -6.87 -19.82, -6.92 -19.75, -6.97 -19.68 C -7.02 -19.60, -7.06 -19.52, -7.09 -19.45 C -7.12 -19.38, -7.15 -19.30, -7.17 -19.23 C -7.19 -19.15, -7.21 -19.08, -7.21 -19.00 C -7.21 -18.93, -7.20 -18.85, -7.17 -18.77 C -7.14 -18.70, -7.05 -18.63, -7.03 -18.55 C -7.00 -18.48, -7.01 -18.40, -7.01 -18.32 C -7.01 -18.25, -7.02 -18.17, -7.03 -18.10 C -7.05 -18.02, -7.07 -17.95, -7.10 -17.88 C -7.13 -17.80, -7.16 -17.73, -7.21 -17.65 C -7.25 -17.58, -7.30 -17.50, -7.36 -17.43 C -7.42 -17.35, -7.47 -17.27, -7.56 -17.20 C -7.66 -17.13, -7.83 -17.05, -7.93 -16.98 C -8.04 -16.90, -8.12 -16.82, -8.19 -16.75 C -8.26 -16.68, -8.32 -16.60, -8.37 -16.52 C -8.43 -16.45, -8.47 -16.37, -8.50 -16.30 C -8.54 -16.22, -8.56 -16.15, -8.58 -16.08 C -8.60 -16.00, -8.61 -15.93, -8.61 -15.85 C -8.60 -15.78, -8.60 -15.70, -8.57 -15.63 C -8.55 -15.55, -8.52 -15.48, -8.45 -15.40 C -8.39 -15.32, -8.25 -15.25, -8.19 -15.18 C -8.14 -15.10, -8.13 -15.02, -8.11 -14.95 C -8.09 -14.88, -8.08 -14.80, -8.08 -14.72 C -8.08 -14.65, -8.09 -14.57, -8.10 -14.50 C -8.12 -14.43, -8.15 -14.35, -8.18 -14.28 C -8.21 -14.20, -8.25 -14.13, -8.31 -14.05 C -8.36 -13.97, -8.40 -13.90, -8.49 -13.82 C -8.59 -13.75, -8.77 -13.67, -8.87 -13.60 C -8.97 -13.53, -9.04 -13.45, -9.10 -13.38 C -9.17 -13.30, -9.21 -13.22, -9.25 -13.15 C -9.29 -13.07, -9.32 -13.00, -9.34 -12.92 C -9.36 -12.85, -9.37 -12.78, -9.37 -12.70 C -9.37 -12.63, -9.36 -12.55, -9.34 -12.48 C -9.32 -12.40, -9.29 -12.32, -9.24 -12.25 C -9.20 -12.17, -9.15 -12.10, -9.07 -12.03 C -8.99 -11.95, -8.83 -11.88, -8.75 -11.80 C -8.68 -11.73, -8.65 -11.65, -8.62 -11.58 C -8.59 -11.50, -8.57 -11.43, -8.55 -11.35 C -8.54 -11.27, -8.53 -11.20, -8.53 -11.13 C -8.53 -11.05, -8.55 -10.98, -8.56 -10.90 C -8.58 -10.82, -8.61 -10.75, -8.64 -10.67 C -8.68 -10.60, -8.71 -10.52, -8.78 -10.45 C -8.85 -10.38, -9.01 -10.30, -9.09 -10.22 C -9.16 -10.15, -9.21 -10.08, -9.25 -10.00 C -9.29 -9.93, -9.31 -9.85, -9.33 -9.77 C -9.35 -9.70, -9.35 -9.62, -9.35 -9.55 C -9.35 -9.47, -9.34 -9.40, -9.32 -9.33 C -9.30 -9.25, -9.27 -9.18, -9.24 -9.10 C -9.20 -9.03, -9.16 -8.95, -9.10 -8.88 C -9.04 -8.80, -8.98 -8.72, -8.89 -8.65 C -8.80 -8.57, -8.65 -8.50, -8.57 -8.43 C -8.49 -8.35, -8.46 -8.28, -8.41 -8.20 C -8.37 -8.13, -8.33 -8.05, -8.30 -7.97 C -8.27 -7.90, -8.25 -7.83, -8.23 -7.75 C -8.21 -7.67, -8.20 -7.60, -8.20 -7.53 C -8.19 -7.45, -8.19 -7.37, -8.20 -7.30 C -8.20 -7.22, -8.20 -7.15, -8.23 -7.07 C -8.26 -7.00, -8.35 -6.93, -8.38 -6.85 C -8.41 -6.78, -8.42 -6.70, -8.42 -6.63 C -8.42 -6.55, -8.41 -6.47, -8.39 -6.40 C -8.37 -6.32, -8.34 -6.25, -8.31 -6.17 C -8.28 -6.10, -8.24 -6.03, -8.19 -5.95 C -8.15 -5.88, -8.09 -5.80, -8.03 -5.73 C -7.98 -5.65, -7.91 -5.57, -7.84 -5.50 C -7.77 -5.42, -7.70 -5.35, -7.61 -5.27 C -7.52 -5.20, -7.39 -5.13, -7.31 -5.05 C -7.22 -4.98, -7.17 -4.90, -7.10 -4.83 C -7.04 -4.75, -6.98 -4.67, -6.92 -4.60 C -6.86 -4.52, -6.81 -4.45, -6.75 -4.38 C -6.70 -4.30, -6.65 -4.23, -6.60 -4.15 C -6.54 -4.08, -6.49 -4.00, -6.44 -3.92 C -6.39 -3.85, -6.34 -3.77, -6.29 -3.70 C -6.24 -3.62, -6.22 -3.55, -6.17 -3.48 C -6.11 -3.40, -6.04 -3.33, -5.97 -3.25 C -5.90 -3.18, -5.82 -3.10, -5.73 -3.02 C -5.64 -2.95, -5.55 -2.87, -5.45 -2.80 C -5.35 -2.73, -5.24 -2.65, -5.13 -2.58 C -5.01 -2.50, -4.89 -2.43, -4.77 -2.35 C -4.64 -2.28, -4.51 -2.20, -4.37 -2.12 C -4.22 -2.05, -4.07 -1.97, -3.91 -1.90 C -3.75 -1.83, -3.58 -1.75, -3.39 -1.68 C -3.21 -1.60, -3.02 -1.53, -2.79 -1.45 C -2.55 -1.38, -2.45 -1.30, -1.99 -1.22 C -1.52 -1.15, -0.33 -1.04, 0.00 -1.00 Z",
    stem: "M 0 -1 Q 0.2 2 -0.2 5.2",
    veins: [
      "M 0 -1.6 Q 0.3 -13 0 -24.6",
      "M 0.20 -5.86 Q 3.41 -6.23 6.56 -12.01",
      "M -0.20 -5.86 Q -3.41 -6.23 -6.56 -12.01",
      "M 0.20 -11.26 Q 2.74 -11.63 5.27 -17.38",
      "M -0.20 -11.26 Q -2.74 -11.63 -5.27 -17.38",
      "M 0.20 -16.66 Q 1.84 -17.03 3.54 -22.76",
      "M -0.20 -16.66 Q -1.84 -17.03 -3.54 -22.76",
    ],
  },
];


/* animated 0 -> value counter, no external deps */
function useCountUp(target, duration = 900, active = true) {
  const [val, setVal] = useState(0);
  useEffect(() => {
    if (!active) return;
    let raf, start;
    function tick(ts) {
      if (!start) start = ts;
      const p = Math.min(1, (ts - start) / duration);
      const eased = 1 - Math.pow(1 - p, 3);
      setVal(target * eased);
      if (p < 1) raf = requestAnimationFrame(tick);
    }
    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
  }, [target, duration, active]);
  return val;
}

/* ---------------------------------------------------------
   SHARED SMALL PIECES
--------------------------------------------------------- */

function ChangeBadge({ value, size = "sm" }) {
  const up = value >= 0;
  const color = up ? T.up : T.down;
  return (
    <span
      className={`inline-flex items-center gap-1 rounded-full ${size === "sm" ? "px-2 py-0.5 text-xs" : "px-3 py-1 text-sm"}`}
      style={{ color, background: up ? "rgba(49,208,123,0.14)" : "rgba(255,77,77,0.14)", fontFamily: monoFont }}
    >
      {up ? <ArrowUpRight size={size === "sm" ? 12 : 14} /> : <ArrowDownRight size={size === "sm" ? 12 : 14} />}
      {Math.abs(value).toFixed(1)}%
    </span>
  );
}

// MiniChart used to be a full recharts <AreaChart> wrapped in a
// <ResponsiveContainer> (which attaches a ResizeObserver) plus a live
// Tooltip listening for pointer move — a lot of machinery for something
// that's always drawn at one fixed pixel size (62×30 / 78×36) inside a
// button that already navigates on tap. With 6+ of these mounted at once
// in a scrolling list, that overhead was a real contributor to the scroll
// stutter. This is a plain SVG path — same look, a fraction of the cost —
// matching the approach already used for the main candlestick chart.
const MiniChart = React.memo(function MiniChart({ base, seed, poolAddress, curveAddress, tokenAddress, positive, id, width = 78, height = 36, length = 22 }) {
  const [closes, setCloses] = useState(null);
  // Источник настоящей истории: пул на DEX или своя кривая. Если нет ни
  // того ни другого, рисовать нечего — раньше здесь начиналась
  // синтетика, теперь остаётся пустое место.
  const source = poolAddress || curveAddress || null;
  const [visible, setVisible] = useState(!source);
  const elRef = useRef(null);

  // Only fetch real candle history once the card actually scrolls into
  // view. With 18+ cards in a feed, kicking off every request up front
  // would mean 18 simultaneous calls on what might be a mobile connection.
  useEffect(() => {
    if (!source || visible) return;
    const el = elRef.current;
    if (!el || typeof IntersectionObserver === "undefined") { setVisible(true); return; }
    const io = new IntersectionObserver((entries) => {
      if (entries[0]?.isIntersecting) { setVisible(true); io.disconnect(); }
    }, { rootMargin: "200px" });
    io.observe(el);
    return () => io.disconnect();
  }, [source, visible]);

  useEffect(() => {
    if (!source || !visible) return;
    let cancelled = false;
    function load() {
      const p = poolAddress
        ? fetchSparkCloses(poolAddress, length, tokenAddress)
        : fetchCurveSparkCloses(curveAddress, length);
      p.then((res) => {
        if (!cancelled && res) setCloses(res);
      });
    }
    load();
    // Cards can stay mounted a long time in the feed; periodically pull a
    // fresh real shape (throttled by fetchSparkCloses's own TTL/cache, so
    // this doesn't add extra network load beyond what the cache allows).
    const iv = setInterval(load, SPARK_TTL_MS);
    return () => { cancelled = true; clearInterval(iv); };
  }, [source, poolAddress, curveAddress, visible, length]);

  // Real pools: the fetched OHLCV shape is the true recent history, but it
  // only actually refreshes every SPARK_TTL_MS — without this, the line
  // would sit frozen in between even though the feed's price/mcap keeps
  // arriving every 2.5s. Instead we scale that real shape by how much
  // `base` (the live mcap from the current poll) has moved since the shape
  // was last fetched, so the sparkline actually tracks live price changes
  // rather than just wiggling in place. Demo tokens (no pool): fully
  // synthetic, phase-shifted by the same shared tick so those aren't
  // frozen either.
  const fetchBaseRef = useRef(null);
  useEffect(() => {
    if (closes && closes.length > 1) {
      fetchBaseRef.current = base || 1;
    }
  }, [closes]); // eslint-disable-line react-hooks/exhaustive-deps

  const data = useMemo(() => {
    // Только настоящие точки. Раньше поверх них подмешивалось
    // синусоидальное дрожание «чтобы линия жила», а при отсутствии
    // ответа рисовался целиком выдуманный ряд — по такому графику
    // человек принимал решение о покупке.
    if (closes && closes.length > 1) {
      const fetchBase = fetchBaseRef.current || base || 1;
      const ratio = fetchBase ? (base || fetchBase) / fetchBase : 1;
      return closes.map((v, i) => ({ i, mcap: v * ratio }));
    }
    // У токена на кривой между сделками цена и правда стоит на месте,
    // поэтому ровная линия — это правда, а не заглушка.
    if (curveAddress && base > 0) {
      return Array.from({ length }, (_, i) => ({ i, mcap: base }));
    }
    return null;
  }, [closes, base, seed, length, curveAddress]);

  // Настоящих точек нет — не рисуем ничего, только держим место, чтобы
  // строка карточки не прыгала.
  if (!data) {
    return <div ref={elRef} style={{ width, height }} />;
  }

  const color = positive ? T.up : T.down;
  const padX = 2, padTop = 4, padBottom = 2;
  const plotW = width - padX * 2;
  const plotH = height - padTop - padBottom;
  const values = data.map(d => d.mcap);
  const max = Math.max(...values), min = Math.min(...values);
  const range = (max - min) || 1;
  const step = values.length > 1 ? plotW / (values.length - 1) : 0;

  const points = values.map((v, i) => [
    padX + i * step,
    padTop + (1 - (v - min) / range) * plotH,
  ]);
  const linePath = points.map(([x, y], i) => `${i === 0 ? "M" : "L"}${x.toFixed(1)},${y.toFixed(1)}`).join(" ");
  const baseY = height - padBottom;
  const areaPath = `${linePath} L${points[points.length - 1][0].toFixed(1)},${baseY} L${points[0][0].toFixed(1)},${baseY} Z`;
  const gid = `spark-${id}`;

  return (
    <svg ref={elRef} width={width} height={height} viewBox={`0 0 ${width} ${height}`} style={{ display: "block", overflow: "visible" }}>
      <defs>
        <linearGradient id={gid} x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%" stopColor={color} stopOpacity={0.45} />
          <stop offset="100%" stopColor={color} stopOpacity={0} />
        </linearGradient>
      </defs>
      <path d={areaPath} fill={`url(#${gid})`} stroke="none" style={{ transition: "d 900ms ease-out" }} />
      <path d={linePath} fill="none" stroke={color} strokeWidth={1.8} strokeLinejoin="round" strokeLinecap="round" style={{ transition: "d 900ms ease-out" }} />
    </svg>
  );
});

const TIMEFRAMES = ["M1", "M5", "M15", "M30", "H1", "H4", "D1", "W1", "MN1"];
const TF_SECONDS = { M1: 60, M5: 300, M15: 900, M30: 1800, H1: 3600, H4: 14400, D1: 86400, W1: 604800, MN1: 2592000 };

/* ---------------------------------------------------------
   REAL MARKET DATA — TON meme pools via GeckoTerminal's public
   on-chain API (api.geckoterminal.com, no key required). This is
   the same underlying on-chain DEX data DexScreener itself shows;
   DexScreener's public API doesn't expose a candle/OHLCV endpoint,
   so charts are sourced from GeckoTerminal, token discovery from
   its TON "trending pools" list — real pools, real prices, real
   history, not generated.
--------------------------------------------------------- */

const GT_BASE = "https://api.geckoterminal.com/api/v2";
const GT_NETWORK = "ton";
// Сеть Solana в тех же справочниках GeckoTerminal. Лента, графики и
// карточки токенов читаются одним и тем же кодом — отличается только
// это слово в адресе запроса.
const GT_NETWORK_SOL = "solana";
// Мем-ленту оставляем только для настоящих "мемов" по капитализации —
// токены с капой от 1 млрд $ и выше выглядят как established/blue-chip
// активы, а не как мемкоины, поэтому отсекаем их ещё на этапе фетча.
const MCAP_FEED_CEILING = 1_000_000_000;

// Maps our UI timeframe buttons to GeckoTerminal's actual supported
// granularities (minute: 1/5/15, hour: 1/4/12, day: 1 — nothing else
// is available server-side). Timeframes finer than what GT offers
// natively (M30, W1, MN1) are built by resampling real candles
// client-side (grouping N consecutive real candles into one) rather
// than inventing data.
const GT_TF = {
  M1: { timeframe: "minute", aggregate: 1 },
  M5: { timeframe: "minute", aggregate: 5 },
  M15: { timeframe: "minute", aggregate: 15 },
  M30: { timeframe: "minute", aggregate: 15, resample: 2 },
  H1: { timeframe: "hour", aggregate: 1 },
  H4: { timeframe: "hour", aggregate: 4 },
  D1: { timeframe: "day", aggregate: 1 },
  W1: { timeframe: "day", aggregate: 1, resample: 7 },
  MN1: { timeframe: "day", aggregate: 1, resample: 30 },
};

// "EQAbc...wxYz" style truncation for on-chain addresses.
function shortAddr(addr) {
  if (!addr || addr.length < 12) return addr || "";
  return `${addr.slice(0, 4)}...${addr.slice(-4)}`;
}

// "07.23.26 · 03:00" style timestamp for the chart's OHLC readout line.
function fmtCandleStamp(timeSec) {
  if (!Number.isFinite(timeSec)) return "";
  const d = new Date(timeSec * 1000);
  const pad = (v) => String(v).padStart(2, "0");
  return `${pad(d.getMonth() + 1)}.${pad(d.getDate())}.${String(d.getFullYear()).slice(-2)} · ${pad(d.getHours())}:${pad(d.getMinutes())}`;
}

// Сумма в TON для ленты: крупные округляем до целых, мелкие показываем
// с двумя-тремя знаками — «0.12 TON» информативнее, чем «0 TON».
function fmtTon(n) {
  if (!(n > 0)) return "0";
  if (n >= 1000) return fmtCompact(n);
  if (n >= 100) return n.toFixed(0);
  if (n >= 1) return n.toFixed(2).replace(/\.?0+$/, "");
  return n.toFixed(3).replace(/\.?0+$/, "");
}

/* Сумма в монете, когда монета дорогая. fmtTon режет всё мельче тысячной
   в ноль — для TON это копейки, а для SOL по паре сотен долларов так
   выглядит любая сделка на доллар. Здесь мелочь остаётся видимой. */
function fmtCoin(n) {
  if (!(n > 0)) return "0";
  if (n >= 1) return fmtTon(n);
  if (n >= 0.001) return n.toFixed(3).replace(/\.?0+$/, "");
  if (n >= 0.00001) return n.toFixed(5).replace(/\.?0+$/, "");
  return "<0.00001";
}

function fmtCompact(n) {
  const v = Number(n) || 0;
  if (v >= 1_000_000) return `${(v / 1_000_000).toFixed(2)}M`;
  if (v >= 1_000) return `${(v / 1_000).toFixed(1)}K`;
  return v.toFixed(0);
}

// Compact "time since pool creation" label — real timestamp from
// GeckoTerminal's pool_created_at, not invented.
function fmtAge(isoDate) {
  if (!isoDate) return null;
  const created = new Date(isoDate).getTime();
  if (!Number.isFinite(created)) return null;
  const diffMin = Math.max(0, Math.floor((Date.now() - created) / 60000));
  if (diffMin < 60) return `${diffMin}M`;
  const diffH = Math.floor(diffMin / 60);
  if (diffH < 24) return `${diffH}H`;
  const diffD = Math.floor(diffH / 24);
  if (diffD < 30) return `${diffD}D`;
  return `${Math.floor(diffD / 30)}MO`;
}

// A small curated emoji set, deterministically assigned per ticker so
// real tokens (which have no emoji of their own) still get a stable
// icon instead of a random one that changes every render.
const TICKER_EMOJI = ["🐸", "🐕", "🐱", "🚀", "💎", "🐋", "🔥", "🌙", "🐹", "🦊", "🐻", "👾", "🎩", "🧊", "⚡", "🍀"];
function emojiForTicker(sym) {
  let h = 0;
  for (let i = 0; i < sym.length; i++) h = (h * 31 + sym.charCodeAt(i)) >>> 0;
  return TICKER_EMOJI[h % TICKER_EMOJI.length];
}
function hashSeed(str) {
  let h = 0;
  for (let i = 0; i < str.length; i++) h = (h * 31 + str.charCodeAt(i)) >>> 0;
  return (h % 9) + 1;
}

/* Укрупняет настоящие свечи до нужного шага там, где источник такого
   шага не отдаёт (полчаса, неделя, месяц).

   Границы считаются от начала эпохи, а не от первой пришедшей свечи.
   Раньше группировка шла подряд от начала списка — и стоило появиться
   одной новой свече, как все границы уезжали на шаг: недельные свечи
   перекраивались при каждом обновлении, и график каждые пятнадцать
   секунд менял форму. Теперь свеча привязана ко времени, а не к своему
   номеру в ответе, и обновление её не сдвигает. */
function bucketCandles(candles, stepSec) {
  if (!stepSec || !candles.length) return candles;
  const out = [];
  let cur = null;
  for (const c of candles) {
    const bucket = Math.floor(c.time / stepSec) * stepSec;
    if (!cur || cur.time !== bucket) {
      cur = { time: bucket, open: c.open, high: c.high, low: c.low, close: c.close, volume: c.volume || 0 };
      out.push(cur);
      continue;
    }
    cur.high = Math.max(cur.high, c.high);
    cur.low = Math.min(cur.low, c.low);
    cur.close = c.close;
    cur.volume += c.volume || 0;
  }
  return out;
}

/* Раскладывает свечи по ровной сетке времени.

   Источник отдаёт только те корзины, в которых были сделки: у неактивной
   пары минутные свечи идут с разрывами в двадцать, тридцать, пятьдесят
   минут. Приложение рисовало их подряд, будто они соседние, — и минутный
   график на самом деле охватывал двое суток, пятиминутный — недели, а
   соседние интервалы показывали совсем разные картинки. Отсюда и
   «непохожий на правду график, который меняется от переключения».

   Пустые промежутки заполняются ровными свечами по последней цене: между
   сделками цена и правда не меняется. Хвост до текущего момента
   дорисовывается, но не больше четверти экрана — иначе у редко торгуемой
   пары вся история уехала бы за левый край. */
function fillCandleGaps(candles, stepSec, limit = CHART_TOTAL, nowSec = Math.floor(Date.now() / 1000)) {
  if (!stepSec || !candles || candles.length < 2) return candles;
  const bucketOf = (t) => Math.floor(t / stepSec) * stepSec;

  const real = new Map();
  for (const c of candles) {
    const b = bucketOf(c.time);
    const cur = real.get(b);
    if (!cur) real.set(b, { ...c, time: b });
    else {
      cur.high = Math.max(cur.high, c.high);
      cur.low = Math.min(cur.low, c.low);
      cur.close = c.close;
      cur.volume = (cur.volume || 0) + (c.volume || 0);
    }
  }
  const times = [...real.keys()].sort((a, b) => a - b);
  const firstReal = times[0];
  const lastReal = times[times.length - 1];
  const tailMax = Math.max(2, Math.round(limit * 0.25));
  const end = Math.min(bucketOf(nowSec), lastReal + stepSec * tailMax);
  const start = Math.max(firstReal, end - stepSec * (limit - 1));

  // Цена на входе в окно — закрытие последней сделки левее него.
  let prevClose = real.get(firstReal).open;
  for (const t of times) {
    if (t > start) break;
    prevClose = real.get(t).close;
  }

  // Долгие простои не рисуем целиком. У мемкоина, по которому торговали
  // утром и вечером, минутный график превращался в стену из сотен
  // одинаковых плоских свечей: сделки сжимались в два пятнышка по краям,
  // а между ними — ровная черта во весь экран. Пропуск обозначаем
  // несколькими пустыми свечами и перескакиваем к следующей сделке;
  // подписи времени берутся из самих свечей, поэтому разрыв виден по
  // ним, а не выдаётся за непрерывную торговлю.
  const ПУСТЫХ_ПОДРЯД = 4;
  const out = [];
  let t = start;
  while (t <= end) {
    const hit = real.get(t);
    if (hit) {
      out.push(hit);
      prevClose = hit.close;
      t += stepSec;
      continue;
    }
    // Сколько пустых до следующей сделки (или до конца окна).
    const следующая = times.find((v) => v > t);
    const край = следующая != null && следующая <= end ? следующая : end + stepSec;
    const пустых = Math.round((край - t) / stepSec);
    const рисуем = Math.min(пустых, ПУСТЫХ_ПОДРЯД);
    for (let i = 0; i < рисуем; i++) {
      out.push({ time: t + i * stepSec, open: prevClose, high: prevClose, low: prevClose, close: prevClose, volume: 0 });
    }
    t = край;
  }
  return out;
}

// Fetches real trending TON meme pools. Returns tokens shaped to match
// the app's existing token model so every screen (cards, detail, stats)
// keeps working unchanged. Falls back to null on any failure so callers
// can keep showing the bundled fallback list instead of an empty feed.
/* Лента из базы: её собрал сервер (api/refresh-feed.js), обходя источник
   раз в минуту одним адресом вместо тысячи телефонов. Отсюда список
   приходит одним запросом и мгновенно; поход в сам источник остаётся
   запасным путём на случай, если обход почему-то молчит. */
/* Подделки под известные монеты. В свежих пулах их всегда десятки:
   «USDT», «Wrapped SOL», «Tether» — имена, на которые ловят невнимательных.
   Настоящие такие пары в мемпаде и не нужны: раздел про мемкоины. */
const ПОДДЕЛЬНЫЕ_ТИКЕРЫ = /^(usdt|usdc|usd1|usde|usds|fdusd|dai|busd|tusd|pyusd|sol|wsol|msol|jitosol|bsol|btc|wbtc|cbbtc|tbtc|eth|weth|steth|ton|wton|bnb|xrp|ada|doge|usd)$/i;
const ПОДДЕЛЬНЫЕ_ИМЕНА = /(tether|usd\s?coin|wrapped|staked\s|liquid\s?stak|circle|binance\s?coin|bitcoin|ethereum|solana\s?$|toncoin)/i;

function похожеНаПодделку(tok) {
  const тикер = String(tok.ticker || "").trim();
  const имя = String(tok.name || "").trim();
  return ПОДДЕЛЬНЫЕ_ТИКЕРЫ.test(тикер) || ПОДДЕЛЬНЫЕ_ИМЕНА.test(имя);
}

/* Токен без метаданных. У такого в цепочке не заполнено ничего: ни имя,
   ни символ, ни картинка, — и источник подставляет «Unknown Token» с
   хвостом адреса, а символом делает «UKWN…». В списке это строка, по
   которой не понять вообще ничего; чаще всего за ней брошенный пул.
   Отсев продублирован здесь, а не только в обходе: в кеше могли остаться
   строки, собранные до этой проверки. */
const БЕЗЫМЯННОЕ_ИМЯ = /^unknown\s*token/i;
const БЕЗЫМЯННЫЙ_ТИКЕР = /^ukwn/i;

/* Ловушка: купить можно, продать нельзя.
 *
 * Механику продавец прячет в контракте, снаружи её не прочитать — зато
 * виден след: за сутки десятки покупок и ни одной продажи. У живого
 * токена продажи есть всегда, даже на росте: кто-то фиксирует прибыль,
 * кто-то выходит в ноль. Ноль продаж при потоке покупок — не рынок, а
 * воронка. Малые числа не в счёт: у пула с тремя покупками отсутствие
 * продаж не значит ничего.
 *
 * Проверка продублирована здесь, а не только в обходе: в кеше могли
 * остаться строки, собранные до её появления. */
function западня({ покупки24 = 0, продажи24 = 0, покупки6 = 0, продажи6 = 0 }) {
  return (покупки24 >= 12 && продажи24 === 0) || (покупки6 >= 8 && продажи6 === 0);
}

function безымянный(tok) {
  const имя = String(tok.name || "").trim();
  const тикер = String(tok.ticker || "").trim();
  return !имя || !тикер || БЕЗЫМЯННОЕ_ИМЯ.test(имя) || БЕЗЫМЯННЫЙ_ТИКЕР.test(тикер);
}

async function fetchFeedFromCache(network = GT_NETWORK, limit = FEED_LIMIT, { свежие = false } = {}) {
  try {
    let запрос = supabase
      .from("feed_cache")
      .select("*")
      .eq("chain", network === GT_NETWORK_SOL ? "solana" : "ton");

    /* «Новые» — это не начало списка популярных, а отдельная выборка:
       обход помечает пулы, встреченные среди новых, временем встречи.
       Берём помеченные за последние сутки и ставим по возрасту пула. */
    запрос = свежие
      ? запрос
        .gt("new_at", new Date(Date.now() - НОВЫЕ_ОКНО_МС).toISOString())
        .order("pool_created_at", { ascending: false, nullsFirst: false })
      : запрос.order("tx24", { ascending: false });

    const { data, error } = await запрос.limit(limit);
    if (error || !data || !data.length) return null;

    // Свежесть проверяем по самой новой строке: если обход встал, лучше
    // сходить в источник самим, чем показывать вчерашние цены.
    const свежесть = Math.max(...data.map((r) => new Date(r.updated_at).getTime() || 0));
    if (Date.now() - свежесть > 10 * 60 * 1000) return null;

    return data.map((r) => ({
      id: r.id,
      chain: r.chain === "solana" ? "solana" : "ton",
      poolAddress: r.pool_address,
      tokenAddress: r.token_address || null,
      name: r.name,
      ticker: r.ticker,
      logoUrl: r.logo_url || null,
      emoji: emojiForTicker(r.ticker),
      price: Number(r.price) || 0,
      change: Number(r.change24) || 0,
      mcapNum: Number(r.mcap) || 0,
      liq: fmtCompact(Number(r.liq) || 0),
      vol: fmtCompact(Number(r.vol24) || 0),
      tx1h: Number(r.tx1h) || 0,
      tx6h: Number(r.tx6h) || 0,
      tx24h: Number(r.tx24) || 0,
      // Сколько из них продажи — по этому числу видно ловушку.
      продажи24: r.sells24 == null ? null : Number(r.sells24) || 0,
      cat: "Мемы",
      seed: hashSeed(r.id),
      verified: (Number(r.liq) || 0) > 50_000,
      live: true,
      dexName: r.dex_name || null,
      createdAt: r.pool_created_at || null,
    })).filter((t) => t.poolAddress && t.price > 0 && !похожеНаПодделку(t) && !безымянный(t)
      // sells24 в кеше появилась позже: у старых строк её нет, и тогда
      // судить о ловушке не по чему — пропускаем, обход отсеет сам.
      && !(t.продажи24 != null && западня({
        покупки24: Math.max(0, (t.tx24h || 0) - t.продажи24), продажи24: t.продажи24,
      }))
      && (свежие || t.mcapNum < MCAP_FEED_CEILING));
  } catch (err) {
    return null;
  }
}

async function fetchTonMemePools(limit = 18, pages = 1, network = GT_NETWORK) {
  // Одна страница GeckoTerminal — это 20 пулов, и на «Горячие» с «DEX»
  // такого списка мало. Ходим по нескольким страницам подряд и склеиваем
  // результат, отсеивая повторы по id пула.
  const collected = [];
  const seen = new Set();
  for (let page = 1; page <= pages; page++) {
    const rows = await fetchPoolsPage(page, network);
    if (!rows) break; // страница не отдалась — довольствуемся тем, что есть
    rows.forEach((tok) => {
      if (seen.has(tok.id)) return;
      seen.add(tok.id);
      collected.push(tok);
    });
    if (collected.length >= limit) break;
  }
  return collected.length ? collected.slice(0, limit) : null;
}

/* Разбор ответа GeckoTerminal в карточки ленты. Вынесен отдельно,
   потому что тем же путём идёт и один пул, открытый по ссылке из бота. */
function normalizePools(json, network = GT_NETWORK) {
  const rows = json?.data || [];
  const included = json?.included || [];
  const tokensById = new Map(included.filter(x => x.type === "token").map(x => [x.id, x.attributes || {}]));
  const dexById = new Map(included.filter(x => x.type === "dex").map(x => [x.id, x.attributes || {}]));
  return rows.map((row) => {
      const a = row.attributes || {};
      const baseTokenId = row.relationships?.base_token?.data?.id;
      const dexId = row.relationships?.dex?.data?.id;
      const bt = (baseTokenId && tokensById.get(baseTokenId)) || {};
      const dex = (dexId && dexById.get(dexId)) || {};
      const name = bt.name || (a.name || "TOKEN/TON").split("/")[0].trim();
      const ticker = (bt.symbol || name || "TOKEN").toUpperCase().slice(0, 10);
      const price = parseFloat(a.base_token_price_usd) || 0;
      const mcapNum = parseFloat(a.market_cap_usd) || parseFloat(a.fdv_usd) || 0;
      const change = parseFloat(a.price_change_percentage?.h24) || 0;
      const volNum = parseFloat(a.volume_usd?.h24) || 0;
      const liqNum = parseFloat(a.reserve_in_usd) || 0;
      // Сколько сделок прошло по пулу за час и за сутки — по этому
      // считается «в центре внимания»: там должен быть не самый крупный
      // токен, а самый торгуемый прямо сейчас.
      const txns = a.transactions || {};
      const txCount = (win) => {
        const w = txns[win] || {};
        return (Number(w.buys) || 0) + (Number(w.sells) || 0);
      };
      const сторона = (win, что) => Number((txns[win] || {})[что]) || 0;
      return {
        западня: западня({
          покупки24: сторона("h24", "buys"), продажи24: сторона("h24", "sells"),
          покупки6: сторона("h6", "buys"), продажи6: сторона("h6", "sells"),
        }),
        id: row.id,
        // Сеть токена. От неё зависит и график, и то, каким кошельком
        // человек будет платить: TON-токены подписывает TonConnect,
        // Solana — Phantom, и перепутать их нельзя.
        chain: network === GT_NETWORK_SOL ? "solana" : "ton",
        poolAddress: a.address,
        tokenAddress: bt.address || null,
        name,
        ticker,
        logoUrl: bt.image_url && !bt.image_url.includes("missing_small") ? bt.image_url : null,
        emoji: emojiForTicker(ticker),
        price,
        change,
        mcapNum,
        liq: fmtCompact(liqNum),
        vol: fmtCompact(volNum),
        tx1h: txCount("h1"),
        tx6h: txCount("h6"),
        tx24h: txCount("h24"),
        cat: "Мемы",
        seed: hashSeed(row.id),
        verified: liqNum > 50_000,
        live: true,
        dexName: dex.name || (dexId ? dexId.replace(/[-_]/g, ".").replace(/\b\w/g, c => c.toUpperCase()) : null),
        createdAt: a.pool_created_at || null,
      };
  }).filter(t => t.poolAddress && t.price > 0 && t.mcapNum < MCAP_FEED_CEILING
    && !похожеНаПодделку(t) && !безымянный(t) && !t.западня);
}

async function fetchPoolsPage(page, network = GT_NETWORK) {
  try {
    // include=base_token,dex pulls the actual token record (real name,
    // symbol, on-chain address, logo image_url) and the DEX the pool
    // trades on, for every pool in one request.
    const res = await gtFetch(`${GT_BASE}/networks/${network}/trending_pools?page=${page}&include=base_token,dex`);
    if (!res.ok) throw new Error(`GeckoTerminal ${res.status}`);
    return normalizePools(await res.json(), network);
  } catch (err) {
    return null; // caller keeps showing the last successfully fetched list
  }
}

/* Один пул по адресу. Нужен для ссылок из бота: карточку токена с биржи
   присылают в чат, и при открытии его ещё нет в ленте — она грузится
   пачками и до нужного токена может не дойти вовсе. */
async function fetchPoolByAddress(poolAddress, network = GT_NETWORK) {
  if (!poolAddress) return null;
  try {
    const res = await gtFetch(`${GT_BASE}/networks/${network}/pools/${poolAddress}?include=base_token,dex`);
    if (!res.ok) return null;
    const json = await res.json();
    // Одиночный пул приходит объектом. Пустой ответ или список вместо
    // него — не наш случай, и отдавать это в разбор ленты нельзя: он
    // ждёт готовую строку пула и падает на первом же поле.
    const строка = json && json.data;
    if (!строка || Array.isArray(строка) || !строка.id) return null;
    // Дальше разбор ровно тот же, что и у ленты.
    const один = normalizePools({ data: [строка], included: json.included || [] }, network);
    return один.length ? один[0] : null;
  } catch (err) {
    console.warn("[mintly] не удалось прочитать пул:", err && err.message);
    return null;
  }
}

// Real per-token description + socials, from GeckoTerminal's token-info
// endpoint (name/image/description/website/telegram/twitter). Cached per
// token address and only fetched lazily when a token is actually opened —
// calling this for every card in the feed would blow through the free API's
// rate limit for no benefit, since the list view never shows the description.
// Сеть токена в терминах справочника: у пришедших из ленты Solana она
// своя, у всех остальных — TON.
function сетьТокена(tok) {
  return tok && tok.chain === "solana" ? GT_NETWORK_SOL : GT_NETWORK;
}

const tokenInfoCache = new Map(); // tokenAddress -> info | null
async function fetchTokenInfo(tokenAddress, network = GT_NETWORK) {
  if (!tokenAddress) return null;
  const ключ = `${network}:${tokenAddress}`;
  if (tokenInfoCache.has(ключ)) return tokenInfoCache.get(ключ);
  try {
    let json = null;
    try {
      json = await своё("info", { token: tokenAddress, network });
    } catch (e) {
      const res = await gtFetch(`${GT_BASE}/networks/${network}/tokens/${tokenAddress}/info`);
      if (!res.ok) throw new Error(`GeckoTerminal ${res.status}`);
      json = await res.json();
    }
    const a = json?.data?.attributes || {};
    const info = {
      description: a.description || null,
      website: (a.websites && a.websites[0]) || null,
      telegram: a.telegram_handle ? `https://t.me/${a.telegram_handle}` : null,
      twitter: a.twitter_handle ? `https://x.com/${a.twitter_handle}` : null,
      imageUrl: a.image_url && !a.image_url.includes("missing_small") ? a.image_url : null,
    };
    tokenInfoCache.set(ключ, info);
    return info;
  } catch (err) {
    tokenInfoCache.set(ключ, null);
    return null;
  }
}

// Real per-token HOLDER count — genuinely distinct wallet count, not a
// stand-in. GeckoTerminal's free/keyless API doesn't expose this (holder
// counts there sit behind a paid CoinGecko tier), but every jetton on TON
// is indexed by TonAPI, whose public jetton-info endpoint returns a real
// holders_count computed from on-chain jetton-wallet contracts. This is
// intentionally the ONLY holders source in the app now — the old
// "holders" field was actually the 24h buy+sell transaction count
// mislabeled as holders, which is a different (and usually much larger)
// number. Always queried against TON mainnet: the feed's tokens come
// from GeckoTerminal's mainnet trending pools regardless of which
// network the connected wallet happens to be on for launching/trading.
const TONAPI_MAINNET_BASE = "https://tonapi.io";

// Сеть, в которой приложение запускает и торгует своими токенами.
// Отдельно от TONAPI_MAINNET_BASE выше: общая лента с бирж всегда
// читается из mainnet — в тестнете бирж попросту нет, — а собственные
// контракты сейчас в тестовой сети, чтобы обкатать торговлю без
// настоящих денег. Внутри компонента есть TON_TESTNET, он берёт
// значение отсюда: сеть задана в одном месте, и от неё зависит всё —
// адреса API, эксплорер, проверка сети кошелька, какие токены
// показывать в ленте.
//
// Переключается переменной окружения VITE_TON_TESTNET: «0» — боевая
// сеть, всё остальное (и её отсутствие) — тестовая. Правкой кода это
// быть перестало намеренно: серверная половина живёт в переменных
// Vercel (TON_TESTNET), и когда половины задавались по-разному,
// приложение и обходчик расходились в том, где искать кривые. Теперь
// обе меняются в одном месте — Vercel → Environment Variables:
//   VITE_TON_TESTNET=1  и  TON_TESTNET=1   — тестовая сеть,
//   без них (или с нулём)                  — боевая.
// По умолчанию боевая: приложение вышло из обкатки, и тестовая сеть
// нужна теперь только тем, кто её специально попросит.
const TON_TESTNET_NETWORK = String(import.meta.env.VITE_TON_TESTNET ?? "0") === "1";

/* Адреса площадки в записи текущей сети.
 *
 * Один и тот же счёт пишется по-разному: в боевой сети «UQ…»/«EQ…», в
 * тестовой — «0Q…»/«kQ…». Отличается только приставка, сам счёт тот же,
 * но кошелёк, увидев чужую приставку, отказывается отправлять — а
 * комиссия площадки была записана как раз в тестовой форме. Приводим к
 * форме текущей сети сами: так переключение сети не оставляет за собой
 * адрес, по которому деньги не уйдут. */
// Та же сеть словом: в базе она лежит строкой рядом с каждым токеном.
const CURRENT_NETWORK = TON_TESTNET_NETWORK ? "testnet" : "mainnet";

/* Сеть Solana — своя, и совпадать с TON она не обязана: кривая TON давно
   в боевой сети, а программа Solana ещё в devnet. Раньше токены Solana
   записывались как «mainnet» заодно с TON, и в ленте пробные монеты
   стояли рядом с настоящими, ничем не отличаясь.
   Берётся из того же переключателя, что и подпись в Phantom
   (VITE_SOLANA_CLUSTER): иначе кошелёк подписывал бы в одной сети, а
   приложение считало токен принадлежащим другой. */
const SOL_CLUSTER = String(import.meta.env.VITE_SOLANA_CLUSTER || "mainnet-beta");
const SOL_NETWORK = SOL_CLUSTER.startsWith("mainnet") ? "mainnet" : SOL_CLUSTER;
// Что показываем в ленте, топе и поиске: сеть TON и сеть Solana. Когда
// обе боевые — список из одной строки, и всё как раньше.
const ВИДИМЫЕ_СЕТИ = [...new Set([CURRENT_NETWORK, SOL_NETWORK])];
// Пробная сеть — та, где монеты ничего не стоят. Такой токен должен
// нести об этом пометку: человек, купивший его всерьёз, обвинит
// площадку, и будет прав.
const пробнаяСеть = (сеть) => !!сеть && сеть !== "mainnet";

function addressForNetwork(raw) {
  try {
    return Address.parse(raw).toString({ testOnly: TON_TESTNET_NETWORK, bounceable: false });
  } catch (e) {
    // Разобрать не вышло — отдаём как есть: пусть падает там, где видно.
    return raw;
  }
}

// Адрес кошелька жетона у конкретного владельца. Нужен для продажи:
// продать — значит перевести жетоны со своего кошелька на кошелёк
// кривой, а свой адрес заранее неизвестен и выводится мастером жетона.
// testnet приходит параметром: константа сети объявлена внутри
// компонента и на верхнем уровне модуля не видна.
// Состояние кривой прямо из контракта: сколько TON в ней реально лежит
// и сколько токенов продано. Всё остальное — цена, капитализация — это
// производные от этих двух чисел. Считать их из введённой при запуске
// суммы нельзя: если покупка не прошла и деньги вернулись, в ленте
// нарисовалась бы капитализация, которой не существует.
// Запросы к tonapi идут через общий шлюз: бесплатный тариф отвечает 429
// уже на паре запросов подряд, а их тут много — состояние кривой, её
// сделки, метаданные жетона, балансы. Ошибка выглядела как «данных
// нет», и график молча подменялся случайным.
// Промежуток между запросами держался отметкой времени последнего, и на
// одном запросе за другим это работало. Но при открытии приложения они
// уходят пачкой: лента считает рынок у дюжины кривых — состояние, сделки
// и метаданные у каждой, — и все они читают отметку до того, как хоть
// один успел отправиться. Промежуток получался общий, а не между ними:
// три десятка запросов уходили одновременно и упирались в 429. Дальше
// начиналось самое неприятное: открытый в этот момент график ничего не
// получал и рисовал ровную линию по последней известной цене, а через
// несколько переключений интервала — когда пачка уже прошла — вставал
// настоящий. Со стороны это и выглядит как «сначала липовый график,
// потом нормальный».
//
// Теперь запросы стоят в очереди по одному, а не соревнуются. У очереди
// есть приоритет: то, что человек видит прямо сейчас (график и состояние
// открытого токена), идёт вперёд ленты.
/* Пауза между запросами к tonapi.
 *
 * Держать её постоянной нельзя: без ключа сервис пускает считанные
 * запросы в минуту, ключ «для фронтенда» — ровно один в секунду, а на
 * платном тарифе можно куда чаще. Поэтому пауза подстраивается сама:
 * после каждого отказа растёт, после спокойной работы возвращается к
 * базовой. Так экран не упирается в 429 и не тормозит там, где лимит
 * позволяет больше. */
const TONAPI_BASE_GAP_MS = 180;
const TONAPI_MAX_GAP_MS = 1400;
let TONAPI_MIN_GAP_MS = TONAPI_BASE_GAP_MS;
let подрядУдачных = 0;

function отказПоЛимиту() {
  подрядУдачных = 0;
  TONAPI_MIN_GAP_MS = Math.min(TONAPI_MAX_GAP_MS, Math.round(TONAPI_MIN_GAP_MS * 1.8) + 120);
}

function запросПрошёл() {
  подрядУдачных += 1;
  // Возвращаемся не сразу: пара удачных ответов подряд ещё ничего не
  // значит, а прыгающая пауза снова упрётся в лимит.
  if (подрядУдачных >= 8 && TONAPI_MIN_GAP_MS > TONAPI_BASE_GAP_MS) {
    подрядУдачных = 0;
    TONAPI_MIN_GAP_MS = Math.max(TONAPI_BASE_GAP_MS, Math.round(TONAPI_MIN_GAP_MS * 0.7));
  }
}
const TON_PRIORITY = { chart: 3, token: 2, feed: 1, background: 0 };
let tonapiLastRequestAt = 0;
const tonQueue = [];
let tonBusy = false;
let tonSeq = 0;

async function tonPump() {
  if (tonBusy) return;
  tonBusy = true;
  try {
    while (tonQueue.length) {
      tonQueue.sort((a, b) => b.priority - a.priority || a.seq - b.seq);
      const job = tonQueue.shift();
      const wait = tonapiLastRequestAt + TONAPI_MIN_GAP_MS - Date.now();
      if (wait > 0) await sleep(wait);
      tonapiLastRequestAt = Date.now();
      try {
        let res = await fetch(job.url, withKey(job.init));
        if (res.status === 429) {
          отказПоЛимиту();
          const retryAfter = Number(res.headers.get("Retry-After")) || 0;
          await sleep(Math.min(6000, retryAfter ? retryAfter * 1000 : 1500));
          tonapiLastRequestAt = Date.now();
          res = await fetch(job.url, withKey(job.init));
          if (res.status === 429) отказПоЛимиту();
          else запросПрошёл();
        } else {
          запросПрошёл();
        }
        job.resolve(res);
      } catch (err) {
        job.reject(err);
      }
    }
  } finally {
    tonBusy = false;
  }
}

/* Ключ tonapi. Без него сервис пускает считанные запросы в минуту на
   адрес, и при открытии приложения пачка обращений — состояние кривой,
   свечи, метаданные, балансы — упирается в 429: цена и график тогда
   просто не приезжают. Ключ кладётся в переменную сборки
   VITE_TONAPI_KEY и подставляется во все запросы разом. */
const TONAPI_TOKEN = String(import.meta.env.VITE_TONAPI_KEY || "").trim();

function withKey(init) {
  if (!TONAPI_TOKEN) return init;
  const было = (init && init.headers) || {};
  return { ...(init || {}), headers: { ...было, Authorization: `Bearer ${TONAPI_TOKEN}` } };
}

function tonFetch(url, init, priority = TON_PRIORITY.feed) {
  return new Promise((resolve, reject) => {
    tonQueue.push({ url, init, priority, resolve, reject, seq: tonSeq++ });
    tonPump();
  });
}

// Один и тот же ответ нужен графику, ленте и окну сделки. Без общего
// кэша это втрое больше запросов на ровном месте — и снова 429.
function cachedFetcher(ttlMs) {
  const cache = new Map();
  const inflight = new Map();
  return function run(key, load) {
    const hit = cache.get(key);
    if (hit && Date.now() - hit.ts < ttlMs) return Promise.resolve(hit.value);
    if (inflight.has(key)) return inflight.get(key);
    const p = load().then(
      (value) => {
        inflight.delete(key);
        // Неудачу не кэшируем, но и не теряем прошлый удачный ответ:
        // лучше показать данные десятисекундной давности, чем ничего.
        if (value != null) cache.set(key, { value, ts: Date.now() });
        return value != null ? value : (hit ? hit.value : null);
      },
      () => {
        inflight.delete(key);
        return hit ? hit.value : null;
      },
    );
    inflight.set(key, p);
    return p;
  };
}
const curveStateCached = cachedFetcher(8000);
const curveTradesCached = cachedFetcher(12000);

async function fetchCurveState(curveAddress, testnet, priority = TON_PRIORITY.feed) {
  if (!curveAddress) return null;
  return curveStateCached(`${testnet ? "t" : "m"}:${curveAddress}`, () => loadCurveState(curveAddress, testnet, priority));
}

async function loadCurveState(curveAddress, testnet, priority = TON_PRIORITY.feed) {
  const host = testnet ? "https://testnet.tonapi.io" : TONAPI_MAINNET_BASE;
  try {
    const res = await tonFetch(`${host}/v2/blockchain/accounts/${curveAddress}/methods/data`, { method: "POST" }, priority);
    if (!res.ok) throw new Error(`tonapi ${res.status}`);
    const json = await res.json();
    const stack = json?.stack || [];
    if (stack.length < 7) return null;
    const num = (i) => BigInt(stack[i].num);
    // Порядок полей задан структурой CurveData в контракте. Параметры
    // читаются вместе с резервами намеренно: они зашиты в контракт при
    // запуске и у токенов, созданных до смены настроек, отличаются от
    // текущих. Считать по настройкам приложения — значит показывать
    // цену, которой у этого токена нет.
    return {
      virtualTon: num(0),
      virtualTokens: num(1),
      realTon: num(2),
      tokensSold: num(3),
      tokensForSale: num(4),
      graduationTon: num(5),
      feeBps: num(6),
      // Восьмое поле — признак того, что кривая уже закрыта. С этого
      // момента контракт не принимает ни покупки, ни продажи, поэтому
      // приложение обязано об этом знать: иначе кнопка «Купить» просто
      // молча отбивалась бы сетью.
      graduated: stack[7] ? Number(stack[7].num) !== 0 : false,
    };
  } catch (err) {
    console.error("[mintly] не удалось прочитать состояние кривой:", err);
    return null;
  }
}

/* Состояние своего пула. Читается тем же способом, что и кривая, но
   поля другие: у пула резервы настоящие, виртуальных нет.

   Порядок задан структурой PoolData в contracts/src/liquidity_pool.tact:
   tonReserve, tokenReserve, feeBps, ready, curve, jettonMaster,
   jettonWallet. Адреса в конце не читаем — приложению они не нужны. */
async function fetchPoolState(poolAddress, testnet, priority = TON_PRIORITY.token) {
  if (!poolAddress) return null;
  return curveStateCached(`p:${testnet ? "t" : "m"}:${poolAddress}`, () => loadPoolState(poolAddress, testnet, priority));
}

async function loadPoolState(poolAddress, testnet, priority = TON_PRIORITY.token) {
  const host = testnet ? "https://testnet.tonapi.io" : TONAPI_MAINNET_BASE;
  try {
    const res = await tonFetch(`${host}/v2/blockchain/accounts/${poolAddress}/methods/data`, { method: "POST" }, priority);
    if (!res.ok) throw new Error(`tonapi ${res.status}`);
    const json = await res.json();
    const stack = json?.stack || [];
    if (stack.length < 4) return null;
    const num = (i) => BigInt(stack[i].num);
    return {
      tonReserve: num(0),
      tokenReserve: num(1),
      feeBps: num(2),
      // Обе половины ликвидности на месте — торговля открыта. Пока
      // кривая не отдала свои, пул есть, но торговать в нём нечем.
      ready: stack[3] ? Number(stack[3].num) !== 0 : false,
    };
  } catch (err) {
    console.error("[mintly] не удалось прочитать состояние пула:", err);
    return null;
  }
}

// Реальный баланс жетона на кошельке. Локальный счётчик holdings —
// выдумка приложения: он не знает ни о покупках с другого устройства, ни
// о переводах мимо интерфейса. Из-за него кнопка «Продать» была
// заблокирована даже когда токены на кошельке лежали.
async function fetchJettonBalance(jettonMaster, ownerAddress, testnet) {
  const info = await fetchJettonAccount(jettonMaster, ownerAddress, testnet);
  return info ? info.balance : null;
}

async function fetchJettonWalletAddress(jettonMaster, ownerAddress, testnet) {
  const info = await fetchJettonAccount(jettonMaster, ownerAddress, testnet);
  return info ? info.wallet : null;
}

async function fetchJettonAccount(jettonMaster, ownerAddress, testnet) {
  if (!jettonMaster || !ownerAddress) return null;
  const host = testnet ? "https://testnet.tonapi.io" : TONAPI_MAINNET_BASE;
  try {
    const res = await fetch(`${host}/v2/accounts/${ownerAddress}/jettons/${jettonMaster}`);
    if (!res.ok) throw new Error(`tonapi ${res.status}`);
    const json = await res.json();
    const raw = json?.balance;
    const decimals = Number(json?.jetton?.decimals ?? 9);
    return {
      wallet: json?.wallet_address?.address || null,
      balance: raw == null ? 0 : Number(BigInt(raw) / 10n ** BigInt(decimals)),
      // Точное значение в минимальных единицах. Округлённое число токенов
      // годится для показа, но не для продажи: обратное умножение даёт
      // величину, которая может оказаться больше настоящей, и контракт
      // отвергает такой перевод.
      raw: raw == null ? 0n : BigInt(raw),
    };
  } catch (err) {
    console.error("[mintly] не удалось получить данные жетона:", err);
    return null;
  }
}
const HOLDERS_TTL_MS = 60_000;
const holdersCache = new Map(); // сеть+адрес -> { meta, ts }
const holdersInflight = new Map(); // tokenAddress -> Promise, de-dupes concurrent callers
// Метаданные жетона: держатели и выпущенное количество. Обе цифры из
// одного ответа, поэтому запрос один.
//
// Сеть приходит параметром: токены из общей ленты живут в mainnet, а
// запущенные в приложении — там, где работает приложение. Раньше адрес
// всегда спрашивали у mainnet, и для своих токенов ответом был «нет
// такого жетона», то есть прочерк вместо реального числа держателей.
async function fetchJettonMeta(tokenAddress, testnet = false, priority = TON_PRIORITY.feed) {
  if (!tokenAddress) return null;
  const key = `${testnet ? "t" : "m"}:${tokenAddress}`;
  const cached = holdersCache.get(key);
  if (cached && Date.now() - cached.ts < HOLDERS_TTL_MS) return cached.meta;
  if (holdersInflight.has(key)) return holdersInflight.get(key);
  const host = testnet ? "https://testnet.tonapi.io" : TONAPI_MAINNET_BASE;
  const p = (async () => {
    try {
      const res = await tonFetch(`${host}/v2/jettons/${tokenAddress}`, undefined, priority);
      if (!res.ok) throw new Error(`tonapi ${res.status}`);
      const json = await res.json();
      const decimals = Number(json?.metadata?.decimals ?? 9) || 9;
      const rawSupply = json?.total_supply != null ? String(json.total_supply) : null;
      const meta = {
        holders: typeof json?.holders_count === "number" ? json.holders_count : null,
        // Картинка из метаданных в цепочке. Нужна как запасной вариант
        // для токенов, у которых в базе логотип не сохранился: в
        // цепочке он всё равно есть, раз метаданные уехали до выпуска.
        image: json?.metadata?.image || json?.preview || null,
        // Выпуск читаем с цепочки, а не берём из настроек: у токенов,
        // созданных до смены параметров, он другой.
        supply: rawSupply != null ? Number(rawSupply) / 10 ** decimals : null,
      };
      holdersCache.set(key, { meta, ts: Date.now() });
      holdersInflight.delete(key);
      return meta;
    } catch (err) {
      holdersInflight.delete(key);
      return cached ? cached.meta : null;
    }
  })();
  holdersInflight.set(key, p);
  return p;
}

async function fetchJettonHolders(tokenAddress, testnet = false) {
  const meta = await fetchJettonMeta(tokenAddress, testnet);
  return meta ? meta.holders : null;
}

/* Логотип токена с запасным путём через цепочку.
 *
 * Обычно ссылка лежит в базе. Но у токенов, запущенных до того, как
 * приложение стало брать её прямо с запуска, поле пустое — там вместо
 * аватарки был серый кружок. Метаданные жетона в цепочке картинку
 * знают всегда, поэтому спрашиваем их и, если человек — владелец
 * токена, заодно дописываем ссылку в базу: тогда её увидят и лента, и
 * бот, а не только эта вкладка. */
function useTokenLogo(logoUrl, tokenAddress, testnet = false, tokenId = null, canFix = false) {
  const [ссылка, setСсылка] = useState(logoUrl || null);
  useEffect(() => {
    setСсылка(logoUrl || null);
    if (logoUrl || !tokenAddress) return;
    let отменено = false;
    fetchJettonMeta(tokenAddress, testnet).then((meta) => {
      const img = meta && meta.image;
      if (отменено || !img) return;
      setСсылка(img);
      if (canFix && tokenId) {
        supabase.from("tokens").update({ logo_url: img }).eq("id", tokenId).then(() => {});
      }
    });
    return () => { отменено = true; };
  }, [logoUrl, tokenAddress, testnet, tokenId, canFix]);
  return ссылка;
}

// Plain hook form of fetchJettonHolders, for spots (token detail header,
// info tab) that lay the number out themselves rather than using the
// icon+value HoldersBadge component. undefined = still loading, null =
// TonAPI has nothing for this address.
/* Держатели без служебных кошельков.
 *
 * tonapi считает жетонные кошельки, а один из них принадлежит самой
 * кривой: непроданный запас лежит на ней. Из-за этого у токена с
 * единственным покупателем показывалось два держателя. После закрытия
 * кривой остаток уходит на кошелёк площадки — он такой же служебный,
 * поэтому вычитаем в обоих случаях. */
function безСлужебных(holders, служебных = 0) {
  if (holders == null) return null;
  return Math.max(0, holders - служебных);
}

function useJettonHolders(tokenAddress, testnet = false, служебных = 0) {
  const [count, setCount] = useState(undefined);
  useEffect(() => {
    setCount(undefined);
    if (!tokenAddress) return;
    let cancelled = false;
    fetchJettonHolders(tokenAddress, testnet).then((c) => { if (!cancelled) setCount(безСлужебных(c, служебных)); });
    return () => { cancelled = true; };
  }, [tokenAddress, testnet, служебных]);
  return count;
}

// Fetches real OHLCV candles for one pool/timeframe. Returns
// { candles: [{time,open,high,low,close}], volume: [{time,value,color}] }
// in ascending time order, ready for lightweight-charts — or null on failure.
// Real recent trades for a pool (GeckoTerminal's /trades endpoint) — used
// by the Transactions tab on the token screen. Not cached: this is
// explicitly opened by the person to see what's happening right now.
// У бесплатного GeckoTerminal жёсткий лимит (около 30 запросов в минуту
// на адрес): при превышении он отвечает 429, и вызывающий код видит это
// как «данных нет». Раньше именно так пропадал список транзакций.
// gtFetch держит минимальный промежуток между запросами и один раз
// повторяет попытку после 429, дождавшись Retry-After.
const GT_MIN_GAP_MS = 320;

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

/* Очередь запросов к GeckoTerminal.

   Лимит там общий на адрес, а желающих много: свечи открытого токена,
   мини-графики карточек, лента сделок. Раньше они соревновались между
   собой, и первым под 429 попадал как раз график — самое важное на
   экране. Теперь запросы выстраиваются в одну очередь с приоритетом:
   открытый график идёт вперёд ленты и превью, а между запросами
   держится пауза. На 429 попытка повторяется с нарастающей задержкой —
   молча отдавать «данных нет» из-за лимита нельзя. */
// Сделки идут первыми: их ждут, глядя на пустой список, а график к
// этому моменту уже нарисован прошлым ответом.
const GT_PRIORITY = { trades: 4, chart: 3, spark: 1, feed: 0 };
const gtQueue = [];
let gtBusy = false;
let gtLastRequestAt = 0;

async function gtPump() {
  if (gtBusy) return;
  gtBusy = true;
  try {
    while (gtQueue.length) {
      gtQueue.sort((a, b) => b.priority - a.priority || a.seq - b.seq);
      const job = gtQueue.shift();
      // Запрос, который уже никому не нужен, не выполняем вовсе.
      // Переключение интервалов оставляло в очереди по запросу на каждое
      // нажатие: свечи выбранного интервала ждали, пока отработают
      // брошенные, а один 429 среди них тормозил очередь на секунды. При
      // быстром переключении это и выглядело как «график путается».
      if (job.signal && job.signal.aborted) { job.reject(new Error("aborted")); continue; }
      const wait = gtLastRequestAt + GT_MIN_GAP_MS - Date.now();
      if (wait > 0) await sleep(wait);
      gtLastRequestAt = Date.now();
      try {
        let res = await fetch(job.url);
        for (let attempt = 0; res.status === 429 && job.retries > attempt; attempt++) {
          // Очередь одна на всё приложение, и пока эта попытка спит, ждут
          // все остальные. Поэтому пауза короткая: повторить ещё раз
          // сверху дешевле, чем держать очередь запертой.
          const retryAfter = Number(res.headers.get("Retry-After")) || 0;
          await sleep(Math.min(4000, retryAfter ? retryAfter * 1000 : 900 * (attempt + 1)));
          // Пока ждали повтора, интервал могли переключить — тогда и
          // повторять незачем.
          if (job.signal && job.signal.aborted) { job.reject(new Error("aborted")); res = null; break; }
          gtLastRequestAt = Date.now();
          res = await fetch(job.url);
        }
        if (res) job.resolve(res);
      } catch (err) {
        job.reject(err);
      }
    }
  } finally {
    gtBusy = false;
  }
}

function gtFetch(url, { retries = 2, priority = GT_PRIORITY.feed, signal } = {}) {
  return new Promise((resolve, reject) => {
    gtQueue.push({ url, retries, priority, signal, resolve, reject, seq: gtQueue.length });
    gtPump();
  });
}

// Последний удачный ответ по каждому пулу. Нужен, чтобы при повторном
// открытии экрана или возврате на вкладку список рисовался сразу, а сеть
// догоняла в фоне — вместо пустого «загружаем».
const tradesCache = new Map(); // "сеть:пул" -> trades[]
function ключСделок(poolAddress, network = GT_NETWORK) {
  return `${network}:${poolAddress}`;
}
function cachedPoolTrades(poolAddress, network = GT_NETWORK) {
  return (poolAddress && tradesCache.get(ключСделок(poolAddress, network))) || null;
}

// limit по умолчанию щедрый: эндпоинт отдаёт последние сделки одной
// страницей, и обрезать её незачем — из этих же строк собирается и
// вкладка сделок, и общая лента, а пропущенная сделка обратно уже не
// приедет.
async function fetchPoolTrades(poolAddress, limit = 300, priority = GT_PRIORITY.trades, network = GT_NETWORK) {
  if (!poolAddress) return null;
  try {
    let json = null;
    try {
      json = await своё("trades", { pool: poolAddress, network });
    } catch (e) {
      const res = await gtFetch(`${GT_BASE}/networks/${network}/pools/${poolAddress}/trades`, { priority });
      if (!res.ok) throw new Error(`GeckoTerminal ${res.status}`);
      json = await res.json();
    }
    const rows = json?.data || [];
    const trades = rows.slice(0, limit).map(row => {
      const a = row.attributes || {};
      const volUsd = parseFloat(a.volume_in_usd) || 0;
      const rate = tonUsd();
      return {
        id: row.id,
        kind: a.kind, // "buy" | "sell"
        volUsd,
        // Сумма в TON: на бирже сделка считается в долларах, поэтому
        // переводим по текущему курсу. У сделок на своей кривой она
        // известна точно и подставляется без пересчёта.
        volTon: rate > 0 ? volUsd / rate : 0,
        priceUsd: parseFloat(a.price_from_in_usd || a.price_to_in_usd) || 0,
        txHash: a.tx_hash || null,
        from: a.tx_from_address || null,
        at: a.block_timestamp || null,
      };
    });
    tradesCache.set(ключСделок(poolAddress, network), trades);
    return trades;
  } catch (err) {
    return null;
  }
}

// Последние удачные свечи по паре «пул + таймфрейм». Если очередной
// запрос не прошёл, показываем их, а не пустой экран: свечи
// пятиминутной давности честнее надписи «истории нет» у токена, который
// торгуется прямо сейчас.
//
// Кэш переживает перезапуск приложения. Мини-приложение закрывают и
// открывают по десять раз на дню, а лимит запросов у источника общий:
// после перезапуска первый же отказ оставлял пустой экран, хотя те же
// свечи только что были на руках. Держим их в хранилище устройства —
// последние два десятка пар, дольше суток не показываем.
const OHLCV_STORE_KEY = "mintly_ohlcv_v1";
const OHLCV_STORE_MAX = 20;
const OHLCV_STORE_TTL_MS = 24 * 60 * 60 * 1000;
const ohlcvCache = new Map();

function loadOhlcvStore() {
  try {
    if (typeof window === "undefined") return;
    const raw = window.localStorage.getItem(OHLCV_STORE_KEY);
    if (!raw) return;
    const saved = JSON.parse(raw);
    const now = Date.now();
    for (const [key, entry] of Object.entries(saved || {})) {
      if (entry && entry.ts && now - entry.ts < OHLCV_STORE_TTL_MS && entry.value?.candles?.length) {
        ohlcvCache.set(key, entry);
      }
    }
  } catch (e) { /* хранилище недоступно или испорчено — не беда */ }
}
loadOhlcvStore();

function saveOhlcvStore() {
  try {
    if (typeof window === "undefined") return;
    const entries = [...ohlcvCache.entries()]
      .sort((a, b) => b[1].ts - a[1].ts)
      .slice(0, OHLCV_STORE_MAX);
    window.localStorage.setItem(OHLCV_STORE_KEY, JSON.stringify(Object.fromEntries(entries)));
  } catch (e) { /* переполнено — переживём */ }
}

/* Запасной источник истории цены — tonapi.

   Свечи у GeckoTerminal лучше: там настоящие open/high/low/close и
   объём. Но лимит у него общий на адрес и легко выбирается лентой и
   превью, а тогда на экране оставалась надпись «истории нет». tonapi —
   отдельный сервис со своим лимитом, и он отдаёт историю курса жетона
   точками. Из точек собираются свечи: открытие — предыдущая цена,
   закрытие — текущая, тени по ним же. Это честная история, просто без
   внутренних колебаний свечи; объём оттуда не приходит вовсе.

   Берётся только когда основной источник не ответил. */
const TF_WINDOW_SEC = {
  M1: 3 * 3600, M5: 12 * 3600, M15: 36 * 3600, M30: 3 * 86400,
  H1: 7 * 86400, H4: 21 * 86400, D1: 120 * 86400, W1: 400 * 86400, MN1: 900 * 86400,
};

async function fetchTonapiChart(jettonAddress, tf, testnet = false) {
  if (!jettonAddress) return null;
  const host = testnet ? "https://testnet.tonapi.io" : TONAPI_MAINNET_BASE;
  const now = Math.floor(Date.now() / 1000);
  const start = now - (TF_WINDOW_SEC[tf] || TF_WINDOW_SEC.H1);
  try {
    const res = await tonFetch(
      `${host}/v2/rates/chart?token=${encodeURIComponent(jettonAddress)}&currency=usd&start_date=${start}&end_date=${now}&points_count=200`,
      undefined,
      TON_PRIORITY.chart,
    );
    if (!res.ok) throw new Error(`tonapi ${res.status}`);
    const json = await res.json();
    const points = (json && json.points ? json.points : [])
      .map((pt) => ({ time: Math.floor(Number(pt[0])), price: Number(pt[1]) }))
      .filter((pt) => Number.isFinite(pt.time) && Number.isFinite(pt.price) && pt.price > 0)
      .sort((a, b) => a.time - b.time);
    if (points.length < 2) return null;

    // Точки приходят с произвольным шагом: двести штук на всё окно, каким
    // бы оно ни было. Оставлять их как есть нельзя — свеча тогда не
    // соответствует выбранному интервалу, и отсчёт до её закрытия врёт.
    // Поэтому точки раскладываются по тем же корзинам, что и везде.
    const step = TF_SECONDS[tf] || 3600;
    const raw = [];
    for (let i = 1; i < points.length; i++) {
      const open = points[i - 1].price;
      const close = points[i].price;
      raw.push({
        time: points[i].time,
        open, close,
        high: Math.max(open, close),
        low: Math.min(open, close),
        volume: 0,
      });
    }
    const candles = fillCandleGaps(bucketCandles(raw, step), step, CHART_TOTAL);
    if (!candles.length) return null;
    return {
      candles: candles.map((c) => ({ time: c.time, open: c.open, high: c.high, low: c.low, close: c.close })),
      volume: candles.map((c) => ({ time: c.time, value: 0, color: c.close >= c.open ? hexA(T.up, 0.32) : hexA(T.down, 0.32) })),
    };
  } catch (err) {
    return null;
  }
}

// Свечи по паре и интервалу живут в памяти полминуты. Без этого каждое
// нажатие кнопки интервала — новый запрос к источнику, а лимит там общий
// на всё приложение: несколько переключений подряд выбирали его целиком,
// и в ответ на график приходил отказ. Теперь возврат к уже показанному
// интервалу рисуется мгновенно и не тратит запрос.
const OHLCV_TTL_MS = 30_000;
const ohlcvInflight = new Map();

async function fetchPoolOHLCV(poolAddress, tf, priority = GT_PRIORITY.chart, signal = undefined, network = GT_NETWORK) {
  const cacheKey = `${network}:${poolAddress}:${tf}`;
  const hit = ohlcvCache.get(cacheKey);
  if (hit && Date.now() - hit.ts < OHLCV_TTL_MS) return hit.value;
  // Тот же запрос уже идёт — ждём его, а не шлём второй: обновление раз в
  // пятнадцать секунд и первая загрузка легко совпадают.
  if (ohlcvInflight.has(cacheKey)) return ohlcvInflight.get(cacheKey);
  const run = loadPoolOHLCV(poolAddress, tf, priority, signal, cacheKey, hit, network);
  ohlcvInflight.set(cacheKey, run);
  try { return await run; } finally { ohlcvInflight.delete(cacheKey); }
}

/* Свечи через свой сервер.
 *
 * Он держит ответ в сети доставки полминуты и отдаёт его всем сразу, без
 * очереди к источнику: у того общий лимит на всё приложение, и график
 * ждал своей очереди наравне с лентой и сделками. Отсюда и «у других
 * грузится моментально» — у них график отдаёт их собственный сервер.
 *
 * Прямой путь к источнику остаётся запасным: если своя ручка почему-то
 * не ответила, идём как раньше. */
async function своё(что, параметры, signal) {
  const строка = new URLSearchParams({ what: что, ...параметры }).toString();
  // Ручка живёт внутри обработчика графика: на бесплатном тарифе Vercel
  // двенадцать функций, и отдельная ради трёх запросов туда не влезала.
  const res = await fetch(апи(`/api/chart?${строка}`), { signal });
  if (!res.ok) throw new Error(`данные рынка ${res.status}`);
  return res.json();
}

async function свечиСоСвоего(poolAddress, tf, network, signal) {
  const json = await своё("ohlcv", { pool: poolAddress, tf, network }, signal);
  const list = (json && json.data && json.data.attributes && json.data.attributes.ohlcv_list) || [];
  if (!list.length) throw new Error("пусто");
  return list;
}

async function loadPoolOHLCV(poolAddress, tf, priority, signal, cacheKey, hit, network = GT_NETWORK) {
  const cfg = GT_TF[tf] || GT_TF.H1;
  const fetchLimit = Math.min(1000, 200 * (cfg.resample || 1));
  const url = `${GT_BASE}/networks/${network}/pools/${poolAddress}/ohlcv/${cfg.timeframe}?aggregate=${cfg.aggregate}&limit=${fetchLimit}&currency=usd&token=base`;
  try {
    let list = null;
    try {
      list = await свечиСоСвоего(poolAddress, tf, network, signal);
    } catch (e) {
      if (e && e.name === "AbortError") throw e;
      list = null;
    }
    if (!list) {
      const res = await gtFetch(url, { priority, retries: priority >= GT_PRIORITY.chart ? 3 : 1, signal });
      if (!res.ok) throw new Error(`GeckoTerminal ${res.status}`);
      const json = await res.json();
      list = json?.data?.attributes?.ohlcv_list || [];
    }
    let candles = list
      .map(([time, open, high, low, close, volume]) => ({ time, open, high, low, close, volume }))
      .filter(c => [c.time, c.open, c.high, c.low, c.close].every(v => typeof v === "number" && Number.isFinite(v)))
      .sort((a, b) => a.time - b.time);
    if (cfg.resample) candles = bucketCandles(candles, TF_SECONDS[tf] || 3600);
    if (!candles.length) throw new Error("empty ohlcv");
    // Пустые промежутки — это часы без сделок, а не соседние минуты.
    candles = fillCandleGaps(candles, TF_SECONDS[tf] || 3600, CHART_TOTAL);
    const result = {
      candles: candles.map(c => ({ time: c.time, open: c.open, high: c.high, low: c.low, close: c.close })),
      volume: candles.map(c => ({ time: c.time, value: Number.isFinite(c.volume) ? c.volume : 0, color: c.close >= c.open ? hexA(T.up, 0.32) : hexA(T.down, 0.32) })),
    };
    ohlcvCache.set(cacheKey, { value: result, ts: Date.now() });
    saveOhlcvStore();
    return result;
  } catch (err) {
    // Не вышло — отдаём прошлый удачный ответ, даже если он старше срока:
    // свечи получасовой давности честнее пустого экрана.
    return hit ? hit.value : null;
  }
}

// --- реальный график для токенов, запущенных в приложении -----------
//
// У такого токена нет пары на DEX, поэтому GeckoTerminal о нём ничего не
// знает и рисовать было нечего — вместо цены показывался случайный
// блуждающий график. Но вся история торгов лежит на самой кривой: цена
// в любой момент однозначно определяется тем, сколько TON в ней
// накоплено. Поэтому свечи собираются из списка транзакций кривой.
//
// Считать по TON, а не по количеству токенов, можно потому, что
// произведение резервов сохраняется: k = virtualTon × virtualTokens
// задано при создании и не меняется ни покупкой, ни продажей. Значит
// непроданный остаток выводится из накопленного TON, а цена — это
// отношение резервов. Комиссия площадки при этом снимается до того, как
// деньги попадают в резерв, поэтому её надо вычитать отдельно —
// параметры и её размер берутся у самой кривой.
// tonapi печатает опкоды как строку с ведущими нулями («0x0f8a7ea5»),
// поэтому сравниваем числами, а не текстом. Отсутствие опкода — пустое
// тело, то есть обычный перевод TON.
const CURVE_OP_BUY = 0x42555921;
const CURVE_OP_JETTON_NOTIFY = 0x7362d09c;
function msgOpCode(msg) {
  const raw = msg?.op_code;
  if (raw == null || raw === "") return null;
  const n = Number.parseInt(String(raw), 16);
  return Number.isFinite(n) ? n : null;
}

function curvePriceFromReserve(realTon, params) {
  const tonReserve = params.virtualTon + realTon;
  const tokenReserve = (params.virtualTon * params.virtualTokens) / tonReserve;
  if (tokenReserve <= 0n) return 0;
  return Number(tonReserve) / Number(tokenReserve);
}

// Сделки кривой по возрастанию времени. У покупки берём приложенную
// сумму за вычетом газа, у продажи — сколько TON ушло продавцу: обе
// величины видны в транзакции и не требуют разбора тела сообщения.
async function fetchCurveTrades(curveAddress, testnet, feeBps = 0n, priority = TON_PRIORITY.feed) {
  if (!curveAddress) return null;
  return curveTradesCached(
    `${testnet ? "t" : "m"}:${curveAddress}:${feeBps}`,
    () => loadCurveTrades(curveAddress, testnet, feeBps, priority),
  );
}

async function loadCurveTrades(curveAddress, testnet, feeBps, priority = TON_PRIORITY.feed) {
  const host = testnet ? "https://testnet.tonapi.io" : TONAPI_MAINNET_BASE;
  try {
    const res = await tonFetch(`${host}/v2/blockchain/accounts/${curveAddress}/transactions?limit=200`, undefined, priority);
    if (!res.ok) throw new Error(`tonapi ${res.status}`);
    const json = await res.json();
    const txs = (json?.transactions || []).slice().sort((a, b) => (a.utime || 0) - (b.utime || 0));
    const trades = [];
    let realTon = 0n;
    for (const tx of txs) {
      const inMsg = tx.in_msg;
      if (!inMsg || tx.success === false || tx.aborted) continue;
      const op = msgOpCode(inMsg);
      if (op === CURVE_OP_BUY) {
        // Из приложенной суммы контракт удерживает газ, потом свою
        // комиссию, и только остаток идёт в резерв — считаем так же.
        const tonIn = BigInt(inMsg.value || 0) - CURVE_GAS_BUY_OVERHEAD;
        if (tonIn <= 0n) continue;
        const net = tonIn - tonIn * feeBps / 10000n;
        if (net <= 0n) continue;
        realTon += net;
        trades.push({ time: tx.utime, ton: net, kind: "buy", realTon });
      } else if (op === CURVE_OP_JETTON_NOTIFY) {
        // Продажа — это уведомление, после которого кривая платит TON
        // обычным переводом без опкода. У прихода торгового запаса при
        // запуске таких переводов нет, поэтому он сюда не попадает.
        // Комиссия уходит таким же переводом, поэтому сумма всех таких
        // сообщений — это ровно то, на сколько уменьшился резерв.
        const payout = (tx.out_msgs || []).reduce((sum, m) => {
          const outOp = msgOpCode(m);
          return outOp ? sum : sum + BigInt(m.value || 0);
        }, 0n);
        if (payout <= 0n) continue;
        realTon = realTon > payout ? realTon - payout : 0n;
        trades.push({ time: tx.utime, ton: payout, kind: "sell", realTon });
      }
    }
    return trades;
  } catch (err) {
    console.error("[mintly] не удалось прочитать историю кривой:", err);
    return null;
  }
}

// Свечи из истории сделок. Пустые промежутки заполняются плоскими
// свечами по последней цене: на кривой цена между сделками действительно
// не меняется, поэтому это не выдумка, а честное отображение.
function buildCurveCandles(trades, timeframe, state = null, limit = CHART_TOTAL, rate = tonUsd()) {
  const params = curveParamsOf(state);
  const now = Math.floor(Date.now() / 1000);

  // История считается по сделкам, но резерв в ней набирается с нуля от
  // самой старой прочитанной транзакции — а читается их только двести.
  // У токена с более длинной историей начало обрезано, и весь ряд
  // оказывался ниже настоящего: график шёл лесенкой куда-то не туда и
  // заканчивался одной огромной свечой до настоящей цены. Поэтому цепочка
  // привязывается к резерву из контракта: он и есть истина на сейчас, а
  // приращения каждой сделки известны. Сдвигаем весь ряд на разницу —
  // тогда последняя точка совпадает с состоянием, а прошлые становятся
  // на своё место относительно неё.
  const list = trades || [];
  let shift = 0n;
  if (state?.realTon != null && list.length) {
    shift = state.realTon - list[list.length - 1].realTon;
  }
  const reserveAt = (v) => {
    const r = v + shift;
    return r > 0n ? r : 0n;
  };
  const points = list.map((tr) => ({
    time: tr.time,
    price: curvePriceFromReserve(reserveAt(tr.realTon), params) * rate,
    volume: Number(tr.ton) / 1e9 * rate,
  }));
  // Цена до первой известной сделки — резерв, который был перед ней, а не
  // ноль: у обрезанной истории до неё кривая уже стояла не в начале.
  const first = list[0];
  const beforeFirst = first
    ? (first.kind === "sell" ? first.realTon + first.ton : first.realTon - first.ton)
    : 0n;
  const startPrice = curvePriceFromReserve(reserveAt(beforeFirst), params) * rate;

  // Шаг ровно тот, что выбран кнопкой. Раньше он укрупнялся сам, чтобы
  // вся история влезла в отведённое число свечей, — и у токена
  // недельной давности минута, пять минут, четверть часа и полчаса
  // давали один и тот же график: переключение кнопок ничего не меняло, а
  // отсчёт до закрытия свечи считался по выбранному интервалу и не
  // сходился с её настоящей шириной.
  const step = TF_SECONDS[timeframe] || 3600;
  const bucketOf = (t) => Math.floor(t / step) * step;
  // Последняя точка — состояние прямо из контракта, если оно прочитано:
  // так конец графика совпадает с ценой, по которой идёт сделка.
  const lastPrice = state?.realTon != null
    ? curvePriceFromReserve(state.realTon, params) * rate
    : (points.length ? points[points.length - 1].price : startPrice);

  const firstTime = points.length ? points[0].time : now;
  const nowBucket = bucketOf(now);
  // Обычно окно кончается сейчас. Но если в него не попала ни одна
  // сделка, а история есть, окно сдвигается к последним сделкам: пустая
  // прямая на месте живого графика читается как поломка, хотя цена и
  // правда стоит — просто торги были раньше. Ничего не выдумываем,
  // время под осью подписано, и видно, что показан прошлый участок.
  let lastBucket = nowBucket;
  if (points.length) {
    const lastTrade = points[points.length - 1].time;
    if (lastTrade < nowBucket - step * (limit - 1)) {
      const tail = Math.max(2, Math.round(limit * 0.15));
      lastBucket = Math.min(nowBucket, bucketOf(lastTrade) + step * tail);
    }
  }
  // Окно — последние limit интервалов, но не раньше начала торгов.
  // Без нижней границы на мелком таймфрейме пришлось бы перебирать
  // десятки тысяч пустых интервалов, а на экране была бы прямая линия
  // из времён, когда токена ещё не существовало.
  let bucket = Math.max(
    bucketOf(firstTime) - step * Math.min(limit - 1, 12),
    lastBucket - step * (limit - 1),
  );
  const candles = [];
  const volume = [];
  let price = startPrice;
  let i = 0;
  // Сделки левее окна на экран не попадают, но цену двигают: прокручиваем
  // их, чтобы первая видимая свеча открылась по реальной цене.
  while (i < points.length && points[i].time < bucket) {
    price = points[i].price;
    i++;
  }
  while (bucket <= lastBucket) {
    const open = price;
    let high = open, low = open, close = open, vol = 0;
    while (i < points.length && points[i].time < bucket + step) {
      close = points[i].price;
      high = Math.max(high, close);
      low = Math.min(low, close);
      vol += points[i].volume;
      i++;
    }
    // Цену из контракта дописываем только в свечу, которая идёт прямо
    // сейчас. Если окно сдвинуто в прошлое, сегодняшняя цена в старой
    // свече была бы подделкой истории.
    if (bucket === lastBucket && lastBucket === nowBucket) {
      close = lastPrice;
      high = Math.max(high, close);
      low = Math.min(low, close);
    }
    candles.push({ time: bucket, open, high, low, close });
    volume.push({ time: bucket, value: vol, color: close >= open ? hexA(T.up, 0.32) : hexA(T.down, 0.32) });
    price = close;
    bucket += step;
  }
  if (!candles.length) return null;
  return { candles: candles.slice(-limit), volume: volume.slice(-limit) };
}

// Рыночные показатели токена на кривой — все из цепочки, ничего
// придуманного. Цена и капитализация считаются по резервам, объём и
// изменение — по списку сделок самой кривой, выпуск и держатели — по
// мастеру жетона. Раньше здесь стояли ноль или заглушка, потому что
// внешние агрегаторы про такой токен ничего не знают: пары на DEX у него
// ещё нет.
/* Рынок токена по его кривой.
 *
 * `быстро` — режим для первого показа ленты: берётся только состояние
 * кривой, то есть один запрос вместо трёх. Цена, капитализация и шкала
 * до биржи считаются уже из него, а история сделок (объём и движение за
 * сутки) догружается второй волной. Раньше лента ждала все три запроса
 * на каждый токен, и при очереди в 180 мс цифры появлялись через
 * несколько секунд после открытия. */
async function fetchCurveMarket(curveAddress, jettonMaster, testnet, rateArg = 0, { быстро = false } = {}) {
  if (!curveAddress) return null;
  const state = await fetchCurveState(curveAddress, testnet);
  if (!state) return null;
  const params = curveParamsOf(state);
  const [trades, meta] = быстро ? [null, null] : await Promise.all([
    fetchCurveTrades(curveAddress, testnet, params.feeBps),
    fetchJettonMeta(jettonMaster, testnet),
  ]);
  // Курс приходит параметром там, где он уже известен экрану: иначе
  // числа на соседних экранах считаются по разным курсам и прыгают.
  const rate = rateArg > 0 ? rateArg : tonUsd();
  // Без курса считать нечего: цена в долларах получилась бы нулевой, а
  // капитализация — пустой. Вернём null, вызывающий подождёт.
  if (!(rate > 0)) return null;
  const priceTon = curvePriceFromReserve(state.realTon, params);
  const supply = meta && meta.supply ? meta.supply : Number(CURVE_TOTAL_SUPPLY) / 1e9;

  const list = trades || [];
  const dayAgo = Math.floor(Date.now() / 1000) - 86400;
  const recent = list.filter((tr) => tr.time >= dayAgo);
  const volTon = recent.reduce((sum, tr) => sum + Number(tr.ton) / 1e9, 0);

  // Цена сутки назад — состояние кривой после последней сделки до окна.
  // Если сделок до окна не было, кривая стояла на стартовой цене.
  const before = list.filter((tr) => tr.time < dayAgo);
  const prevReal = before.length ? before[before.length - 1].realTon : 0n;
  const prevPrice = curvePriceFromReserve(prevReal, params);

  return {
    state,
    trades: list,
    priceTon,
    priceUsd: priceTon * rate,
    supply,
    mcapUsd: priceTon * rate * supply,
    // Ликвидность — то, что реально лежит в кривой: именно эти TON
    // выплачиваются продающим.
    liqUsd: (Number(state.realTon) / 1e9) * rate,
    vol24Usd: volTon * rate,
    tx24: recent.length,
    // Кошелёк кривой в держатели не записываем: запас на ней — это не
    // человек, купивший токен.
    holders: meta ? безСлужебных(meta.holders, 1) : null,
    change24: prevPrice > 0 ? ((priceTon - prevPrice) / prevPrice) * 100 : 0,
  };
}

// Сделки кривой в том же виде, в каком приходят сделки с DEX, — чтобы
// вкладка «Транзакции» рисовала и те и другие одним кодом.
function curveTradesToFeed(trades, params, limit = 200) {
  const rate = tonUsd();
  return (trades || [])
    .slice(-limit)
    .reverse()
    .map((tr, i) => ({
      id: `curve-${tr.time}-${i}`,
      kind: tr.kind,
      volTon: Number(tr.ton) / 1e9,
      volUsd: (Number(tr.ton) / 1e9) * rate,
      priceUsd: curvePriceFromReserve(tr.realTon, params) * rate,
      txHash: null,
      from: null,
      at: new Date(tr.time * 1000).toISOString(),
    }));
}

// Короткая история цены для мини-графика на карточке токена: те же
// свечи кривой, только пятнадцатиминутные и за небольшое окно.
const curveSparkCache = new Map(); // адрес -> { closes, ts }
async function fetchCurveSparkCloses(curveAddress, n = 24) {
  if (!curveAddress) return null;
  const cached = curveSparkCache.get(curveAddress);
  if (cached && Date.now() - cached.ts < SPARK_TTL_MS) return cached.closes;
  const res = await fetchCurveOHLCV(curveAddress, "M15", TON_TESTNET_NETWORK);
  const closes = res?.candles?.length ? res.candles.slice(-n).map((c) => c.close) : null;
  if (closes && closes.length > 1) curveSparkCache.set(curveAddress, { closes, ts: Date.now() });
  return closes || (cached ? cached.closes : null);
}

// Ровный ряд по известной цене. Нужен, когда история кривой ещё не
// приехала: у токена на кривой цена всё равно между сделками не
// меняется, так что прямая линия — это правда, а случайный график —
// нет.
function flatCandles(price, timeframe, limit = CHART_TOTAL) {
  if (!(price > 0)) return null;
  const step = TF_SECONDS[timeframe] || 3600;
  const last = Math.floor(Date.now() / 1000 / step) * step;
  const candles = [];
  const volume = [];
  for (let i = limit - 1; i >= 0; i--) {
    const time = last - i * step;
    candles.push({ time, open: price, high: price, low: price, close: price });
    volume.push({ time, value: 0, color: hexA(T.up, 0.32) });
  }
  return { candles, volume };
}

/* История сделок кривой из базы.
 *
 * Её складывает серверный обход (api/refresh-curves.js) — те же самые
 * транзакции, только прочитанные один раз на всех. Двести транзакций с
 * цепочки при каждом открытии токена стоили секунды ожидания графика, а
 * тут это один быстрый запрос к базе. Кеш устарел или пуст — возвращаем
 * пусто, и вызывающий читает цепочку сам, как раньше. */
const СДЕЛКИ_КЕШ_МС = 3 * 60 * 1000;
const сделкиКеш = new Map(); // tokenId -> { ряд, ts }

async function сделкиИзКеша(tokenId) {
  if (!tokenId) return null;
  const было = сделкиКеш.get(tokenId);
  if (было && Date.now() - было.ts < 20000) return было.ряд;
  const { data, error } = await supabase
    .from("curve_cache")
    .select("trades, updated_at")
    .eq("token_id", tokenId)
    .maybeSingle();
  if (error || !data || !Array.isArray(data.trades)) return null;
  const свежесть = data.updated_at ? new Date(data.updated_at).getTime() : 0;
  if (Date.now() - свежесть > СДЕЛКИ_КЕШ_МС) return null;
  const ряд = data.trades.map((p) => ({
    time: Number(p.t),
    ton: BigInt(p.ton),
    realTon: BigInt(p.r),
  }));
  сделкиКеш.set(tokenId, { ряд, ts: Date.now() });
  return ряд;
}

async function fetchCurveOHLCV(curveAddress, timeframe, testnet, rate = tonUsd(), tokenId = null) {
  if (!(rate > 0)) return null;
  // Состояние нужно не только ради последней точки: в нём лежат
  // параметры, с которыми развёрнута именно эта кривая. Без него
  // подставлялись сегодняшние настройки площадки — и если у токена они
  // другие (а так и бывает: параметры зашиты при запуске), цены
  // получались чужими. На экране это выглядело как случайный график,
  // который через пару переключений сам собой становился правильным —
  // это приезжало настоящее состояние. Нет состояния — нет графика;
  // вместо него рисуется ровная линия по известной цене, а попытка
  // повторяется.
  const state = await fetchCurveState(curveAddress, testnet, TON_PRIORITY.chart);
  if (!state) return null;
  // Сперва история из базы: она посчитана сервером и приезжает разом.
  // Нет её — читаем цепочку, как раньше.
  const trades = (await сделкиИзКеша(tokenId))
    || (await fetchCurveTrades(curveAddress, testnet, curveParamsOf(state).feeBps, TON_PRIORITY.chart));
  if (trades == null) return null;
  return buildCurveCandles(trades, timeframe, state, CHART_TOTAL, rate);
}

// Lightweight REAL-price feed for the small sparkline previews (feed
// cards, portfolio rows). Reuses the exact same GeckoTerminal OHLCV
// endpoint as the main candlestick chart — these are real, already-
// trading TON pools, not invented numbers — just at a coarse timeframe
// and short window, since a sparkline only needs the recent shape.
// Cached per pool with a TTL: cheap re-scrolling doesn't re-hit the
// network, but the shape itself still periodically refreshes instead of
// staying frozen on the very first fetch forever (the live "wiggle" +
// base-ratio scaling in MiniChart covers the seconds in between).
const SPARK_TTL_MS = 90_000;
const sparkCache = new Map(); // poolAddress -> { closes, ts }
const sparkInflight = new Map(); // poolAddress -> Promise, to de-dupe concurrent callers
async function fetchSparkCloses(poolAddress, n = 24, jettonAddress = null) {
  if (!poolAddress) return null;
  const cached = sparkCache.get(poolAddress);
  if (cached && Date.now() - cached.ts < SPARK_TTL_MS) return cached.closes;
  if (sparkInflight.has(poolAddress)) return sparkInflight.get(poolAddress);
  const p = (async () => {
    const result = (await fetchPoolOHLCV(poolAddress, "M15", GT_PRIORITY.spark))
      || (jettonAddress ? await fetchTonapiChart(jettonAddress, "M15") : null);
    const closes = result?.candles?.length ? result.candles.slice(-n).map(c => c.close) : null;
    if (closes && closes.length > 1) sparkCache.set(poolAddress, { closes, ts: Date.now() });
    sparkInflight.delete(poolAddress);
    return closes || (cached ? cached.closes : null);
  })();
  sparkInflight.set(poolAddress, p);
  return p;
}

// TerminalChart — our own candlestick renderer on <canvas>: no external
// chart library, no watermark, and no React-state-driven redraws during
// gestures (everything during pan/zoom/inertia is imperative canvas work
// via refs, so dragging never triggers a re-render and stays smooth even
// with hundreds of candles).
//
// Gestures:
//  - one-finger drag  -> pans the visible window, with inertia on release
//  - two-finger pinch -> zooms in/out around the pinch midpoint
//  - a quick tap (no real movement) -> shows a crosshair + reports the
//    tapped candle's OHLC via onHover; a drag clears it
//
// The visible window (which candles are on screen, and how zoomed in) is
// mount-local state in a ref — the caller resets it by changing this
// component's `key` (TokenDetail keys it on token+timeframe), so a live
// data refresh (same key, new candle values) never snaps the view back.
const CHART_MIN_VISIBLE = 12;
const CHART_DEFAULT_VISIBLE = 60;
// Width reserved on the right for the price-axis gutter (labels + the
// live current-price pill) — candles are plotted to the left of this,
// never underneath it.
// Ширина правой шкалы — одно число на все графики, и оно не зависит ни
// от данных, ни от масштаба. Любая подгонка под текущие подписи означает
// рывок: от ширины шкалы считается ширина поля свечей, и стоит ей
// шевельнуться, как весь график дёргается вбок. Самая длинная подпись —
// «$0.123456» из режима цены, девять знаков; в 76 точек она помещается
// с запасом, и туда же встаёт плашка текущей цены.
// Запасная ширина шкалы цен, пока подписи не измерены. Дальше она
// считается по самой длинной из них: фиксированные семьдесят шесть точек
// оставляли слева от цифр пустую полосу, а места под свечи — меньше.
const CHART_GUTTER = 76;

function TerminalChart({ candles, height = 340, themeKey, onHover, tf, valueFmt }) {
  const canvasRef = useRef(null);
  const wrapRef = useRef(null);
  const [widthPx, setWidthPx] = useState(320);
  // Ширина, по которой реально считается и рисуется кадр. Обновляется в
  // начале отрисовки прямым замером элемента: наблюдатель за размером
  // срабатывает не в тот же кадр, и по устаревшему числу холст рисуется
  // в одном размере, а растягивается в другом.
  const widthRef = useRef(320);

  const n = candles?.length || 0;
  const viewRef = useRef({ start: Math.max(0, n - CHART_DEFAULT_VISIBLE), count: Math.min(n, CHART_DEFAULT_VISIBLE) || 1 });
  // Пока человек не двигал график рукой, окно держится за правый край.
  // Окно задавалось номерами свечей и не пересчитывалось при обновлении,
  // а число свечей меняется на каждом обновлении — от этого график сам
  // уезжал то влево, то вправо.
  const pinnedRef = useRef(true);
  // Время свечи, стоящей у левого края. Окно задано номерами свечей, а
  // ряд пересобирается на каждом обновлении — и шаг в нём зависит от
  // длины истории, то есть номера не значат ничего постоянного. Держим
  // якорь по времени и после обновления возвращаем окно на ту же дату.
  const anchorTimeRef = useRef(null);
  /* Сколько времени показываем — в секундах, а не в свечах.
     Источник отдаёт свечи только там, где были сделки, и ряд то
     уплотняется, то редеет. Полсотни свечей в одном ответе — это час, в
     следующем — двадцать минут, и график на живом обновлении менял
     масштаб сам собой: только что был виден час, стало двадцать минут.
     Длительность окна от плотности ряда не зависит. */
  const spanRef = useRef(null);
  // Трогали ли шкалу цены руками. Пока нет — она подгоняется под данные
  // сама при каждом обновлении.
  const yUserRef = useRef(false);
  // Vertical (price) window — { min, max } in price units. Unlike before,
  // this is NOT recomputed from whatever candles happen to be visible;
  // it's set once (auto-fit on first draw) and from then on only changes
  // when the person actually drags/zooms vertically, so panning left/right
  // no longer rescales the chart under your finger.
  const yViewRef = useRef(null);
  const dragRef = useRef(null);     // { lastX, lastY, lastT, vx, vy, moved, startX, startY }
  const pinchRef = useRef(null);    // { startDist, startCount, anchorIdx }
  const yScaleRef = useRef(null);   // { startY, startMin, startMax } — right-edge scale handle
  const inertiaRaf = useRef(null);
  const hoverIdxRef = useRef(null);
  // Ширина шкалы цен. Живёт в ref, а не в состоянии: её читают и расчёт
  // раскладки, и отрисовка, и полоса захвата — все в одном кадре.
  // Ноль значит «ещё не мерили»: до первого замера подписей берётся
  // запасная ширина.
  const gutterRef = useRef(0);

  useEffect(() => {
    const el = wrapRef.current;
    if (!el || typeof ResizeObserver === "undefined") return;
    const ro = new ResizeObserver(entries => {
      const w = entries[0]?.contentRect?.width;
      if (w) setWidthPx(w);
    });
    ro.observe(el);
    setWidthPx(el.clientWidth || 320);
    return () => ro.disconnect();
  }, []);

  // Ширина шкалы считается на весь ряд сразу, ещё до первой отрисовки:
  // см. пояснение в computeLayout. Через эффект было бы поздно — первый
  // кадр успел бы нарисоваться с другой шириной и дёрнуться.
  // Живой замер ширины. Один источник на расчёт и на отрисовку: если
  // они разойдутся хоть на точку, картинка поедет.
  function chartWidth() {
    const el = wrapRef.current;
    // Именно дробная ширина из getBoundingClientRect, а не округлённая
    // clientWidth: на неокруглённой ширине родителя целое число даёт
    // растяжение холста на процент — как раз столько, чтобы подписи
    // поплыли.
    if (el) {
      const w = el.getBoundingClientRect().width;
      if (w > 0) widthRef.current = w;
    }
    return widthRef.current || widthPx;
  }

  /* Ширина шкалы — под самую длинную подпись, а не «на глаз».
     Считается по крайним значениям всего ряда, а не текущего окна: при
     прокрутке окно ползёт, длина подписи то «$32.9M», то «$980.00K», и
     шкала прыгала бы вслед за ней — вместе с полем свечей. Округление до
     восьми точек даёт запас, чтобы смена одного символа её не двигала. */
  function ширинаШкалы(min, max, range) {
    const canvas = canvasRef.current;
    const ctx = canvas && canvas.getContext("2d");
    if (!ctx) return gutterRef.current || CHART_GUTTER;
    const fmt = valueFmt || fmtPrice;
    const шаг = (range || Math.abs(max - min) || 1) / 6;
    const подписи = [max, min, (max + min) / 2].map(
      (v) => String(Math.abs(v) >= 1 ? fmtAxisUSD(v, шаг) : fmt(v)),
    );
    ctx.save();
    ctx.font = "10px " + monoFont;
    let ширина = Math.max(...подписи.map((t) => ctx.measureText(t).width));
    // Подпись в плашке текущей цены длиннее делений: у делений формат
    // короткий («$180M»), а в плашке — полный («$163.22M»). Считали
    // только по делениям, и плашке не хватало места: её текст обрезался
    // краем экрана.
    const последняя = candles && candles[candles.length - 1];
    if (последняя && Number.isFinite(последняя.close)) {
      ctx.font = "700 11px " + monoFont;
      ширина = Math.max(ширина, ctx.measureText(String(fmt(последняя.close))).width);
    }
    ctx.restore();
    if (!Number.isFinite(ширина) || ширина <= 0) return gutterRef.current || CHART_GUTTER;
    // Восемь точек справа от цифр и восемь слева — ровно на дыхание, плюс
    // поля самой плашки. Ширина только растёт: цена живая, и подпись то
    // длиннее, то короче — от каждой такой смены поле свечей меняло
    // ширину, и график вздрагивал вбок на ровном месте.
    const нужно = Math.min(104, Math.max(44, Math.ceil((ширина + 20) / 8) * 8));
    gutterRef.current = gutterRef.current ? Math.max(gutterRef.current, нужно) : нужно;
    return gutterRef.current;
  }

  /* Запомнить, сколько времени сейчас в окне. Вызывается после каждого
     жеста — по нему окно и восстанавливается на следующем обновлении. */
  function запомнитьРазмахОкна() {
    const v = viewRef.current;
    const слева = candles[Math.max(0, Math.min(n - 1, Math.floor(v.start)))];
    const справа = candles[Math.max(0, Math.min(n - 1, Math.ceil(v.start + v.count) - 1))];
    if (слева && справа && Number.isFinite(слева.time) && Number.isFinite(справа.time) && справа.time > слева.time) {
      spanRef.current = справа.time - слева.time;
    }
  }

  // Сколько свечей укладывается в запомненную длительность, считая от
  // правого края ряда.
  function свечейВРазмахе() {
    const размах = spanRef.current;
    if (!размах || !n) return null;
    const конец = candles[n - 1];
    if (!конец || !Number.isFinite(конец.time)) return null;
    let i = n - 1;
    while (i > 0 && Number.isFinite(candles[i - 1].time) && конец.time - candles[i - 1].time <= размах) i--;
    return Math.max(CHART_MIN_VISIBLE, Math.min(n, n - i));
  }

  function clampView() {
    const v = viewRef.current;
    v.count = Math.max(CHART_MIN_VISIBLE, Math.min(n, v.count || CHART_DEFAULT_VISIBLE));
    // Пустое место есть с обеих сторон. Справа за последней свечой — как
    // в любом терминале; слева до первой — потому что палец упирался в
    // невидимую стену ровно там, где у молодого токена всего десяток
    // свечей: график дёргался и вставал, и это читалось как поломка, а
    // не как «дальше истории нет».
    //
    // Уводить совсем в пустоту нельзя: часть свечей обязана остаться на
    // экране, иначе непонятно, куда возвращаться.
    const остаток = Math.max(1, v.count * 0.15);
    v.start = Math.max(-(v.count - остаток), v.start);
  }

  function computeLayout() {
    const v = viewRef.current;
    const count = v.count;
    const startI = Math.max(0, Math.floor(v.start));
    const endI = Math.min(n, Math.ceil(v.start + count) + 1);
    const visible = candles.slice(startI, endI);
    if (!visible.length) return null;
    if (!yViewRef.current) {
      // First time we have something to draw: auto-fit the price window
      // to what's currently visible, with a little breathing room. After
      // this it's frozen — only manual vertical drag / the scale handle
      // touch it again, never an automatic recompute. Only finite values
      // count here — a single bad candle (NaN/Infinity from a data
      // hiccup) must never be allowed to blow up the whole scale.
      const highs = visible.map(c => c.high).filter(Number.isFinite);
      const lows = visible.map(c => c.low).filter(Number.isFinite);
      const rawMax = highs.length ? Math.max(...highs) : 1;
      const rawMin = lows.length ? Math.min(...lows) : 0;
      const rawRange = (rawMax - rawMin) || (rawMax * 0.02) || 1;
      const pad = rawRange * 0.08;
      yViewRef.current = { min: rawMin - pad, max: rawMax + pad };
    }
    const { min, max } = yViewRef.current;
    const range = (max - min) || (max * 0.02) || 1;
    const padTop = height * 0.08, padBottom = height * 0.1;
    const drawHeight = height - padTop - padBottom;
    // Ширина шкалы — под самую длинную подпись. Считается по крайним
    // значениям всего ряда, а не текущего окна: при прокрутке окно
    // ползёт, длина подписи то «$32.9M», то «$980.00K», и ширина шкалы
    // прыгала бы вслед за ней. А от неё зависит ширина поля свечей —
    // поэтому график дёргался вбок на каждом кадре прокрутки.
    // Округление до восьми пикселей добавляет запас: подпись меняется
    // на символ, а шкала стоит на месте.
    const gutter = ширинаШкалы(min, max, range);
    const plotW = Math.max(1, chartWidth() - gutter);
    const slot = plotW / count;
    const bodyW = Math.max(2, Math.min(14, slot * 0.7));
    // Clamp so a stray out-of-range price (bad tick, huge wick) draws a
    // flat line pinned at the edge instead of shooting off into a wild
    // diagonal streak or resizing anything else on screen.
    const yFor = (price) => {
      if (!Number.isFinite(price)) price = min;
      const t = padTop + (1 - (price - min) / range) * drawHeight;
      return Math.max(-height, Math.min(height * 2, t));
    };
    const xFor = (idx) => (idx - v.start + 0.5) * slot;
    return { startI, endI, min, max, range, slot, bodyW, yFor, xFor, padTop, padBottom, drawHeight, plotW, gutter };
  }

  function draw() {
    const canvas = canvasRef.current;
    if (!canvas || !n || !widthPx) return;
    clampView();
    // Первый кадр задаёт размах окна: дальше от него и пляшем при
    // обновлениях, даже если человек ничего не трогал.
    if (spanRef.current == null) запомнитьРазмахОкна();
    const layout = computeLayout();
    if (!layout) return;
    // Размер холста трогаем только когда он правда изменился. Присвоение
    // canvas.width заново выделяет буфер под всю картинку, а рисуем мы и
    // по кадру на каждое движение пальца, и раз в секунду ради обратного
    // отсчёта. Постоянная переаллокация — это и лишняя работа, и повод
    // для системы отдать буфер поменьше: тогда шкала с подписями
    // становится мыльной.
    const dpr = typeof window !== "undefined" ? (window.devicePixelRatio || 1) : 1;
    // Ширину спрашиваем у самого элемента прямо сейчас, а не берём из
    // состояния: наблюдатель за размером срабатывает не в тот же кадр, и
    // при устаревшем числе холст рисуется в одном размере, а
    // растягивается в другом — отсюда мыло и рваные подписи на шкале.
    const wantW = Math.max(1, Math.round(chartWidth() * dpr));
    const wantH = Math.max(1, Math.round(height * dpr));
    if (canvas.width !== wantW || canvas.height !== wantH) {
      canvas.width = wantW;
      canvas.height = wantH;
    }
    // Ширина — «во всю ширину родителя». Точное число в точках я уже
    // пробовал: если замер ширины хоть немного отстаёт от настоящей,
    // холст перестаёт доставать до края и справа остаётся чёрная
    // полоса. Растяжение на доли точки — меньшее зло.
    if (canvas.style.width !== "100%") canvas.style.width = "100%";
    const cssH = `${height}px`;
    if (canvas.style.height !== cssH) canvas.style.height = cssH;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;
    // Чистим весь буфер целиком, в его собственных точках. Через
    // масштаб плотности крайний столбец мог не попасть под очистку из-за
    // округления — а поверх него каждую секунду дорисовывались подписи
    // шкалы, и они наслаивались друг на друга.
    ctx.setTransform(1, 0, 0, 1, 0, 0);
    ctx.clearRect(0, 0, canvas.width, canvas.height);
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    const widthNow = chartWidth();

    const { startI, endI, min, max, range, yFor, xFor, bodyW, plotW, padTop, padBottom, drawHeight, gutter } = layout;
    const fmt = valueFmt || fmtPrice;

    // Фоновая сетка внутри карточки —
    // только статичная и приглушённая, чтобы не спорить со свечами
    ctx.strokeStyle = hexA(T.ice, 0.05);
    ctx.lineWidth = 1;
    const gridTargetLines = Math.max(4, Math.round(drawHeight / 44));
    const gridRawStep = range / gridTargetLines;
    const gridMag = Math.pow(10, Math.floor(Math.log10(gridRawStep || 1)));
    const gridNorm = gridRawStep / (gridMag || 1);
    const gridStep = (gridNorm < 1.5 ? 1 : gridNorm < 3 ? 2 : gridNorm < 7 ? 5 : 10) * gridMag;
    if (gridStep > 0) {
      const gridFirst = Math.ceil(min / gridStep) * gridStep;
      for (let price = gridFirst; price <= max; price += gridStep) {
        const y = yFor(price);
        if (y < padTop - 4 || y > height - padBottom + 4) continue;
        ctx.beginPath();
        ctx.moveTo(0, y + 0.5);
        ctx.lineTo(plotW, y + 0.5);
        ctx.stroke();
      }
    }
    const gridColCount = Math.max(1, Math.round(plotW / 70));
    for (let c = 0; c <= gridColCount; c++) {
      const x = (plotW / gridColCount) * c;
      ctx.beginPath();
      ctx.moveTo(x + 0.5, padTop);
      ctx.lineTo(x + 0.5, height - padBottom);
      ctx.stroke();
    }

    // Candles — high-contrast bodies + wicks, sized to fill the available
    // width so they stay readable at any zoom level. Plotted only within
    // plotW, so nothing ever draws underneath the price-axis gutter.
    for (let i = startI; i < endI; i++) {
      const c = candles[i];
      if (!c) continue;
      if (![c.open, c.high, c.low, c.close].every(Number.isFinite)) continue;
      const x = xFor(i);
      if (x < -bodyW || x > plotW + bodyW) continue;
      const up = c.close >= c.open;
      const color = up ? T.up : T.down;
      ctx.strokeStyle = color;
      ctx.fillStyle = color;
      ctx.lineWidth = Math.max(1, bodyW * 0.14);
      ctx.beginPath();
      ctx.moveTo(x, yFor(c.high));
      ctx.lineTo(x, yFor(c.low));
      ctx.stroke();
      const yO = yFor(c.open), yC = yFor(c.close);
      const top = Math.min(yO, yC), h = Math.max(1.5, Math.abs(yC - yO));
      ctx.fillRect(x - bodyW / 2, top, bodyW, h);
    }

    const lastCandle = Number.isFinite(candles[n - 1]?.close) ? candles[n - 1] : null;
    let pillTop = null, pillBottom = null; // reserved zone so grid labels don't collide with the pill

    if (lastCandle) {
      const lastUp = lastCandle.close >= lastCandle.open;
      const lastColor = lastUp ? T.up : T.down;
      const y = yFor(lastCandle.close);
      // Dashed guide line at the live price, spanning only the candle area.
      ctx.strokeStyle = lastColor;
      ctx.lineWidth = 1;
      ctx.setLineDash([4, 3]);
      ctx.beginPath();
      ctx.moveTo(0, y);
      ctx.lineTo(plotW, y);
      ctx.stroke();
      ctx.setLineDash([]);

      const pillH = 32;
      pillTop = Math.max(0, Math.min(height - pillH, y - pillH / 2));
      pillBottom = pillTop + pillH;
    }

    // Price axis (right gutter) — evenly spaced "nice" price levels, like
    // a real trading chart's scale, instead of the old 3 faint labels.
    //
    // Шкала — тем же фоном, что и график, с тонкой чертой вместо
    // светлого прямоугольника: заливка другого цвета читалась как
    // приклеенный сбоку кусок, обрезанный сверху и снизу, а не как ось.
    ctx.fillStyle = T.bg;
    ctx.fillRect(plotW, 0, gutter, height);
    ctx.strokeStyle = hexA(T.ice, 0.08);
    ctx.lineWidth = 1;
    ctx.beginPath();
    ctx.moveTo(plotW + 0.5, padTop);
    ctx.lineTo(plotW + 0.5, height - padBottom);
    ctx.stroke();
    const targetLines = Math.max(4, Math.round(drawHeight / 44));
    const rawStep = range / targetLines;
    const mag = Math.pow(10, Math.floor(Math.log10(rawStep || 1)));
    const norm = rawStep / (mag || 1);
    const step = (norm < 1.5 ? 1 : norm < 3 ? 2 : norm < 7 ? 5 : 10) * mag;
    ctx.font = "10px " + monoFont;
    ctx.fillStyle = T.muted;
    ctx.textAlign = "right";
    if (step > 0) {
      const first = Math.ceil(min / step) * step;
      for (let price = first; price <= max; price += step) {
        const y = yFor(price);
        if (y < padTop - 4 || y > height - padBottom + 4) continue;
        if (pillTop != null && y > pillTop - 2 && y < pillBottom + 2) continue; // don't collide with the pill
        // Капитализация — числа от единицы и выше, у них подпись
        // подбирается по шагу шкалы. Цена за токен — доли цента, там
        // работает свой формат с длинным хвостом нулей.
        ctx.fillText(Math.abs(price) >= 1 ? fmtAxisUSD(price, step) : fmt(price), chartWidth() - 10, y + 3);
      }
    }
    ctx.textAlign = "left";

    /* Ось времени под свечами.
       Без неё нижний край графика обрывался пустой полосой: свечи есть,
       а к какому часу они относятся — негде посмотреть. Подписи ставим
       по свечам, а не по ровным отрезкам времени, — иначе на прокрутке
       они разъезжались бы с самими свечами. */
    {
      const шагПодписей = Math.max(1, Math.ceil((endI - startI) / Math.max(2, Math.round(plotW / 78))));
      ctx.font = "9px " + monoFont;
      ctx.fillStyle = T.faint;
      ctx.textAlign = "center";
      let правыйКрай = -Infinity;
      for (let i = startI; i < endI; i += шагПодписей) {
        const c = candles[i];
        if (!c || !Number.isFinite(c.time)) continue;
        const текст = подписьВремени(c.time, tf);
        const половина = ctx.measureText(текст).width / 2;
        const x = xFor(i);
        // Крайние подписи не режем краем поля: половина числа за
        // границей выглядит хуже, чем её отсутствие. Соседние разводим
        // по фактической ширине, а не по одному числу на все форматы —
        // «04.09 22:00» вдвое длиннее «22:00».
        if (x - половина < 2 || x + половина > plotW - 4) continue;
        if (x - половина < правыйКрай + 14) continue;
        правыйКрай = x + половина;
        ctx.fillText(текст, x, height - padBottom + 16);
      }
      ctx.textAlign = "left";
    }

    // Live current-price pill — the highlighted price + a live countdown
    // to when the current (rightmost) bar closes and the next candle
    // starts — e.g. counts down from 60s on the 1-minute timeframe. Ticks
    // every second via the redraw interval below.
    if (lastCandle && pillTop != null) {
      const lastUp = lastCandle.close >= lastCandle.open;
      const lastColor = lastUp ? T.up : T.down;
      const priceLabel = fmt(lastCandle.close);
      const barSec = TF_SECONDS[tf] || 3600;
      const leftMs = (lastCandle.time + barSec) * 1000 - Date.now();
      // Отсчёт показывается, только пока свеча и правда открыта. Когда
      // график показывает прошлый участок (сделок в текущем окне не
      // было), вечный «0:00» под ценой выглядел бы как зависший таймер.
      const live = leftMs > 0;
      // Плашка не во всю ширину шкалы и не впритык к краю: раньше она
      // упиралась в границу экрана, и её цифры обрезались вместе с ним.
      const отступ = 6;
      const плашкаX = plotW + 2;
      const плашкаШ = Math.max(24, chartWidth() - отступ - плашкаX);
      const плашкаВ = live ? 32 : 20;
      ctx.fillStyle = lastColor;
      ctx.beginPath();
      // roundRect есть не во всех встроенных браузерах — там просто угол.
      if (ctx.roundRect) ctx.roundRect(плашкаX, pillTop, плашкаШ, плашкаВ, 5);
      else ctx.rect(плашкаX, pillTop, плашкаШ, плашкаВ);
      ctx.fill();
      ctx.fillStyle = T.bg;
      ctx.textAlign = "center";
      ctx.font = "700 11px " + monoFont;
      ctx.fillText(priceLabel, плашкаX + плашкаШ / 2, pillTop + (live ? 13 : 10));
      if (live) {
        ctx.font = "9px " + monoFont;
        ctx.fillText(fmtCountdown(leftMs), плашкаX + плашкаШ / 2, pillTop + 26);
      }
      ctx.textAlign = "left";
    }

    // Crosshair — only on an explicit tap (see handleTap), not while
    // dragging/panning, so it never fights the pan gesture.
    if (hoverIdxRef.current != null) {
      const x = xFor(hoverIdxRef.current);
      ctx.strokeStyle = T.ice;
      ctx.setLineDash([3, 3]);
      ctx.lineWidth = 1;
      ctx.beginPath();
      ctx.moveTo(x, 0);
      ctx.lineTo(x, height);
      ctx.stroke();
      ctx.setLineDash([]);
    }
  }

  // Redraw on data refresh (live tick), resize, or theme swap — but this
  // never touches viewRef, so the user's pan/zoom position survives a
  // live update untouched (no snapping back).
  // Пришли новые свечи — если график не сдвигали рукой, окно
  // переставляется на правый край. Иначе при каждом обновлении оно
  // оставалось на прежних номерах свечей, а сами свечи под ним
  // сдвигались: график будто ездил сам по себе.
  useEffect(() => {
    if (!n) return;
    const v = viewRef.current;
    if (pinnedRef.current) {
      // Окно восстанавливаем по времени: сохранить прежнее число свечей
      // мало — в новом ответе их может быть вдвое больше на том же часе,
      // и масштаб менялся сам собой прямо под рукой.
      const поВремени = свечейВРазмахе();
      v.count = Math.max(CHART_MIN_VISIBLE, Math.min(n, поВремени || v.count || CHART_DEFAULT_VISIBLE));
      v.start = Math.max(0, n - v.count);
    } else if (anchorTimeRef.current != null) {
      // Ряд мог пересобраться с другим шагом: у свечей другие номера и
      // даже другие границы. Возвращаем окно на ту дату, где человек его
      // оставил, — иначе после каждого обновления график прыгал вбок.
      let best = 0, bestD = Infinity;
      for (let i = 0; i < n; i++) {
        const d = Math.abs(candles[i].time - anchorTimeRef.current);
        if (d < bestD) { bestD = d; best = i; }
      }
      v.start = Math.max(0, Math.min(best, Math.max(0, n - 1)));
      clampView();
    }
    // Окно цены подгоняется заново. Оно задавалось один раз при первой
    // отрисовке и дальше не менялось: приезжали новые свечи с другим
    // размахом, и они сплющивались в узкую полосу посреди пустого поля.
    // Если шкалу двигали руками — не трогаем, это уже выбор человека.
    //
    // И только пока график держится за правый край. Стоило отлистать в
    // историю, как очередная порция данных сбрасывала окно, оно
    // подгонялось под то, что сейчас на экране, и шкала на глазах
    // разъезжалась — заметнее всего сразу после того, как отпустишь.
    // Подгонять окно цены заново на каждом обновлении нельзя: свежая
    // свеча чуть меняет края, окно пересчитывается, и шкала на живом
    // графике «дышит» каждые пятнадцать секунд. Трогаем его только
    // когда данные действительно перестали помещаться — вышли за края
    // или, наоборот, съёжились в узкую полосу посреди пустого поля.
    if (!yUserRef.current && pinnedRef.current && yViewRef.current) {
      const v2 = viewRef.current;
      const from = Math.max(0, Math.floor(v2.start));
      const to = Math.min(n, Math.ceil(v2.start + v2.count) + 1);
      let lo = Infinity, hi = -Infinity;
      for (let i = from; i < to; i++) {
        const c = candles[i];
        if (Number.isFinite(c.low) && c.low < lo) lo = c.low;
        if (Number.isFinite(c.high) && c.high > hi) hi = c.high;
      }
      if (Number.isFinite(lo) && Number.isFinite(hi)) {
        const win = yViewRef.current;
        const winRange = (win.max - win.min) || 1;
        const outside = lo < win.min || hi > win.max;
        const tooSmall = (hi - lo) / winRange < 0.35;
        if (outside || tooSmall) yViewRef.current = null;
      }
    } else if (!yUserRef.current && pinnedRef.current) {
      yViewRef.current = null;
    }
  }, [n, candles]);

  useEffect(() => { draw(); });

  // The bar-close countdown needs a redraw every second even when nothing
  // else about the data has changed, or it would just sit frozen.
  useEffect(() => {
    const iv = setInterval(() => draw(), 1000);
    return () => clearInterval(iv);
  }, [tf, n]);

  function xFromEvent(clientX) {
    const rect = wrapRef.current?.getBoundingClientRect();
    return rect ? clientX - rect.left : 0;
  }
  function dist(touches) {
    return Math.hypot(touches[0].clientX - touches[1].clientX, touches[0].clientY - touches[1].clientY);
  }
  function midX(touches) {
    return xFromEvent((touches[0].clientX + touches[1].clientX) / 2);
  }
  function cancelInertia() {
    if (inertiaRaf.current) cancelAnimationFrame(inertiaRaf.current);
    inertiaRaf.current = null;
  }
  function panByPixels(dxScreen) {
    const layout = computeLayout();
    if (!layout) return;
    viewRef.current.start -= dxScreen / layout.slot;
    clampView();
    // Отпустили у самого правого края — снова держимся за него.
    const v = viewRef.current;
    pinnedRef.current = v.start + v.count >= n - 0.75;
    const left = candles[Math.max(0, Math.min(n - 1, Math.floor(v.start)))];
    anchorTimeRef.current = left && Number.isFinite(left.time) ? left.time : null;
    запомнитьРазмахОкна();
    draw();
  }
  // Вертикальный сдвиг: окно цены едет за пальцем так же, как время по
  // горизонтали. График должен двигаться свободно во все стороны.
  function panYByPixels(dyScreen) {
    const layout = computeLayout();
    if (!layout) return;
    yUserRef.current = true;
    const delta = (dyScreen / layout.drawHeight) * layout.range;
    yViewRef.current = { min: layout.min + delta, max: layout.max + delta };
    draw();
  }
  // Инерция — только по горизонтали. По вертикали она после отпускания
  // продолжала везти окно цены сама, и это читалось как «шкала стоит,
  // пока держишь, и разъезжается, как только отпустил». Пока палец на
  // экране, цена по-прежнему двигается вместе с ним.
  function startInertia(vxPxPerMs) {
    let vx = vxPxPerMs;
    function step() {
      if (Math.abs(vx) < 0.01) { inertiaRaf.current = null; return; }
      panByPixels(vx * 16);
      vx *= 0.93;
      inertiaRaf.current = requestAnimationFrame(step);
    }
    cancelInertia();
    inertiaRaf.current = requestAnimationFrame(step);
  }
  function indexAtX(clientX) {
    const layout = computeLayout();
    if (!layout) return null;
    const x = xFromEvent(clientX);
    const idx = Math.round(viewRef.current.start + x / layout.slot - 0.5);
    return Math.max(0, Math.min(n - 1, idx));
  }
  function reportHover(idx) {
    hoverIdxRef.current = idx;
    draw();
    onHover && onHover(idx == null ? null : candles[idx]);
  }

  function onTouchStart(e) {
    if (e.touches.length === 2) {
      cancelInertia();
      dragRef.current = null;
      const layout = computeLayout();
      if (!layout) return;
      const mx = midX(e.touches);
      pinchRef.current = { startDist: dist(e.touches), startCount: viewRef.current.count, anchorIdx: viewRef.current.start + mx / layout.slot };
      return;
    }
    cancelInertia();
    const x = e.touches[0].clientX, y = e.touches[0].clientY;
    dragRef.current = { lastX: x, lastY: y, lastT: performance.now(), vx: 0, vy: 0, moved: false, startX: x, startY: y };
  }
  function onTouchMove(e) {
    if (e.touches.length === 2 && pinchRef.current) {
      e.preventDefault();
      const d = dist(e.touches);
      const scale = d / (pinchRef.current.startDist || 1);
      let newCount = pinchRef.current.startCount / scale;
      newCount = Math.max(CHART_MIN_VISIBLE, Math.min(n, newCount));
      const mx = midX(e.touches);
      const newSlot = chartWidth() / newCount;
      viewRef.current = { start: pinchRef.current.anchorIdx - mx / newSlot, count: newCount };
      clampView();
      запомнитьРазмахОкна();
      draw();
      return;
    }
    if (!dragRef.current || e.touches.length !== 1) return;
    const x = e.touches[0].clientX, y = e.touches[0].clientY;
    const totalDx = x - dragRef.current.startX, totalDy = y - dragRef.current.startY;
    if (!dragRef.current.moved && Math.hypot(totalDx, totalDy) > 4) {
      dragRef.current.moved = true;
      hoverIdxRef.current = null; // a real pan cancels any tap crosshair
      onHover && onHover(null);
    }
    if (dragRef.current.moved) {
      e.preventDefault();
      const dx = x - dragRef.current.lastX;
      const dy = y - dragRef.current.lastY;
      const now = performance.now();
      const dt = Math.max(1, now - dragRef.current.lastT);
      dragRef.current.vx = dx / dt;
      dragRef.current.vy = dy / dt;
      dragRef.current.lastX = x; dragRef.current.lastY = y; dragRef.current.lastT = now;
      panByPixels(dx);
      panYByPixels(dy);
    }
  }
  function onTouchEnd(e) {
    if (pinchRef.current) { pinchRef.current = null; return; }
    if (dragRef.current) {
      if (dragRef.current.moved) {
        startInertia(dragRef.current.vx);
      } else {
        // No meaningful movement -> treat as a tap: show the crosshair.
        reportHover(indexAtX(dragRef.current.startX));
      }
      dragRef.current = null;
    }
  }

  // Desktop-friendly equivalents (mouse drag to pan, wheel to zoom) —
  // harmless extras for previewing outside the Telegram mobile client.
  function onMouseDown(e) {
    cancelInertia();
    dragRef.current = { lastX: e.clientX, lastY: e.clientY, lastT: performance.now(), vx: 0, vy: 0, moved: false, startX: e.clientX, startY: e.clientY };
  }
  function onMouseMove(e) {
    if (!dragRef.current || e.buttons !== 1) return;
    const totalDx = e.clientX - dragRef.current.startX, totalDy = e.clientY - dragRef.current.startY;
    if (!dragRef.current.moved && Math.hypot(totalDx, totalDy) > 4) { dragRef.current.moved = true; hoverIdxRef.current = null; onHover && onHover(null); }
    if (dragRef.current.moved) {
      const dx = e.clientX - dragRef.current.lastX;
      const dy = e.clientY - dragRef.current.lastY;
      const now = performance.now();
      const dt = Math.max(1, now - dragRef.current.lastT);
      dragRef.current.vx = dx / dt;
      dragRef.current.vy = dy / dt;
      dragRef.current.lastX = e.clientX; dragRef.current.lastY = e.clientY; dragRef.current.lastT = now;
      panByPixels(dx);
      panYByPixels(dy);
    }
  }
  function onMouseUp() {
    if (dragRef.current) {
      if (dragRef.current.moved) startInertia(dragRef.current.vx);
      else reportHover(indexAtX(dragRef.current.startX));
      dragRef.current = null;
    }
  }
  function onWheel(e) {
    e.preventDefault();
    const layout = computeLayout();
    if (!layout) return;
    const mx = xFromEvent(e.clientX);
    const anchorIdx = viewRef.current.start + mx / layout.slot;
    const factor = e.deltaY > 0 ? 1.1 : 0.9;
    let newCount = Math.max(CHART_MIN_VISIBLE, Math.min(n, viewRef.current.count * factor));
    const newSlot = chartWidth() / newCount;
    viewRef.current = { start: anchorIdx - mx / newSlot, count: newCount };
    clampView();
    запомнитьРазмахОкна();
    draw();
  }

  // Right-edge price-scale handle — drag it up/down to zoom the (now
  // manual) vertical price window, same as the scale gutter on a real
  // trading chart. Kept as its own gesture, separate from panning the
  // chart body, so the two don't fight each other.
  function scaleStart(clientY) {
    cancelInertia();
    const layout = computeLayout();
    if (!layout) return;
    yScaleRef.current = { startY: clientY, startMin: layout.min, startMax: layout.max };
  }
  function scaleMove(clientY) {
    if (!yScaleRef.current) return;
    yUserRef.current = true;
    const { startY, startMin, startMax } = yScaleRef.current;
    const dy = clientY - startY;
    const center = (startMin + startMax) / 2;
    const halfRange = (startMax - startMin) / 2 || 1;
    // Drag down -> zoom out (wider range); drag up -> zoom in (tighter).
    const factor = Math.pow(1.0045, dy);
    const newHalf = Math.max(halfRange * 0.06, halfRange * factor);
    yViewRef.current = { min: center - newHalf, max: center + newHalf };
    draw();
  }
  function scaleEnd() { yScaleRef.current = null; }
  function onScaleTouchStart(e) { e.stopPropagation(); scaleStart(e.touches[0].clientY); }
  function onScaleTouchMove(e) { if (!yScaleRef.current) return; e.preventDefault(); e.stopPropagation(); scaleMove(e.touches[0].clientY); }
  function onScaleMouseDown(e) { e.stopPropagation(); scaleStart(e.clientY); }
  function onScaleMouseMove(e) { if (!yScaleRef.current || e.buttons !== 1) return; e.stopPropagation(); scaleMove(e.clientY); }

  if (!n) return null;
  // Полоса захвата шкалы по ширине совпадает с самой шкалой: иначе
  // тянуть приходится мимо подписей.
  const layoutNow = computeLayout();
  const scaleGutter = gutterRef.current || CHART_GUTTER;
  return (
    <div ref={wrapRef} data-chart="1" style={{ width: "100%", height, position: "relative", touchAction: "none" }}
      onTouchStart={onTouchStart} onTouchMove={onTouchMove} onTouchEnd={onTouchEnd} onTouchCancel={onTouchEnd}
      onMouseDown={onMouseDown} onMouseMove={onMouseMove} onMouseUp={onMouseUp} onMouseLeave={onMouseUp} onWheel={onWheel}>
      <canvas ref={canvasRef} style={{ display: "block", width: "100%", height }} />
      {/* Invisible drag zone over the price axis: drag up/down to zoom the
          (now manual) vertical scale. The axis itself — labels + the live
          price pill — is drawn on the canvas, so there's no separate
          decorative handle here, just the touch/mouse target for it. */}
      <div
        onTouchStart={onScaleTouchStart} onTouchMove={onScaleTouchMove} onTouchEnd={scaleEnd} onTouchCancel={scaleEnd}
        onMouseDown={onScaleMouseDown} onMouseMove={onScaleMouseMove} onMouseUp={scaleEnd} onMouseLeave={scaleEnd}
        style={{ position: "absolute", right: 0, top: 0, width: scaleGutter, height: "100%", touchAction: "none", cursor: "ns-resize" }}
      />
    </div>
  );
}

/* TrendFX — the whole-widget signal: rockets streaking up through a growing
   token's card, or red streaks falling through a declining one. Positions are
   seeded per-token (via id) so they don't reshuffle on every re-render. */
function TrendFX({ up, seedKey = 1 }) {
  const items = useMemo(() => {
    const rand = seededRand(Math.floor(Math.abs(seedKey) * 97) + (up ? 11 : 53));
    const count = up ? 4 : 5;
    const out = [];
    for (let i = 0; i < count; i++) {
      out.push(
        up
          ? { left: 6 + rand() * 84, delay: rand() * 2.4, dur: 1.9 + rand() * 1.6, size: 12 + rand() * 7 }
          : { left: 4 + rand() * 88, top: rand() * 45, delay: rand() * 2.4, dur: 1.6 + rand() * 1.4, size: 3 + rand() * 3.5 }
      );
    }
    return out;
  }, [up, seedKey]);

  return (
    <div style={{
      position: "absolute", inset: 0, overflow: "hidden", pointerEvents: "none", borderRadius: "inherit",
      /* мягкая маска по верхнему/нижнему краю: ракеты и полосы затухают в прозрачность
         ДО того, как долетят до границы overflow:hidden, поэтому их больше не "срезает"
         жёсткой невидимой линией на краю виджета */
      WebkitMaskImage: "linear-gradient(to bottom, transparent 0%, #000 14%, #000 82%, transparent 100%)",
      maskImage: "linear-gradient(to bottom, transparent 0%, #000 14%, #000 82%, transparent 100%)",
      // With 6+ cards on screen each running continuous animations, an
      // un-contained repaint here forces the browser to recheck layout/paint
      // for the whole scrolling list on every frame — that's the freeze seen
      // while scrolling the feed. `contain` isolates each card's effect to
      // its own box so the compositor doesn't have to touch its neighbors.
      contain: "layout paint style",
      willChange: "transform",
    }}>
      {up && items.map((it, i) => (
            <Rocket
              key={i}
              size={it.size}
              style={{
                position: "absolute", left: `${it.left}%`, bottom: "-20%",
                color: T.ice,
                // A single drop-shadow instead of two chained ones: chained
                // filters roughly double the per-frame paint cost of an
                // already-expensive effect, multiplied by every rocket on
                // every visible card — a real contributor to scroll jank.
                filter: `drop-shadow(0 0 4px ${glow(0.55)})`,
                animation: `rocketUp ${it.dur}s cubic-bezier(0.3,0.1,0.4,1) ${it.delay}s infinite`,
              }}
            />
          ))}
    </div>
  );
}

/* SpotlightFX — a richer, purpose-built animated background just for the
   single featured "Spotlight" widget on the Mempad tab (there's only ever
   one on screen, so it can afford to be heavier than TrendFX, which has
   to run on every card in a scrolling list). No falling/rising motif here
   — a slowly rotating aurora glow, a soft breathing ring, and a handful
   of embers drifting in a slow orbit around the avatar. Color tracks the
   token's direction (up/down) but the motion itself doesn't — nothing
   here "falls". */
function SpotlightFX({ up, seedKey = 1 }) {
  const color = up ? T.up : T.down;
  const orbiters = useMemo(() => {
    const rand = seededRand(Math.floor(Math.abs(seedKey) * 131) + 17);
    return Array.from({ length: 6 }).map((_, i) => ({
      angle: (360 / 6) * i + rand() * 20,
      radius: 78 + rand() * 30,
      size: 2.5 + rand() * 2.5,
      dur: 10 + rand() * 8,
      delay: -rand() * 12,
      reverse: i % 2 === 0,
    }));
  }, [seedKey]);

  return (
    <div style={{
      position: "absolute", inset: 0, overflow: "hidden", pointerEvents: "none", borderRadius: "inherit",
      contain: "layout paint style",
    }}>
      {/* slowly rotating aurora glow, oversized so the rotation never
          reveals a hard edge */}
      <div style={{
        position: "absolute", inset: "-60%",
        background: `conic-gradient(from 0deg, ${hexA(color, 0)}, ${hexA(color, 0.22)} 25%, ${hexA(color, 0)} 55%, ${hexA(color, 0.14)} 80%, ${hexA(color, 0)})`,
        animation: "spotlightRotate 16s linear infinite",
        willChange: "transform",
      }} />
      {/* second, slower counter-rotating layer for depth */}
      <div style={{
        position: "absolute", inset: "-50%",
        background: `conic-gradient(from 90deg, ${hexA(T.ice, 0)}, ${hexA(T.ice, 0.05)} 40%, ${hexA(T.ice, 0)} 70%)`,
        animation: "spotlightRotateRev 24s linear infinite",
        willChange: "transform",
      }} />
      {/* soft breathing ring around the avatar */}
      <div style={{
        position: "absolute", left: "50%", top: "50%", width: 168, height: 168, marginLeft: -84, marginTop: -84,
        borderRadius: "50%", border: `1px solid ${hexA(color, 0.4)}`,
        animation: "spotlightPulse 3.4s ease-in-out infinite",
      }} />
      {/* embers slowly orbiting the avatar, not falling */}
      {orbiters.map((o, i) => (
        <span key={i} style={{
          position: "absolute", left: "50%", top: "50%", width: o.size, height: o.size,
          borderRadius: "50%", background: color, boxShadow: `0 0 6px 1.5px ${hexA(color, 0.55)}`,
          marginLeft: -o.size / 2, marginTop: -o.size / 2,
          "--orbit-r": `${o.radius}px`,
          transform: `rotate(${o.angle}deg) translateX(${o.radius}px)`,
          animation: `spotlightOrbit ${o.dur}s linear ${o.delay}s infinite ${o.reverse ? "reverse" : "normal"}`,
        }} />
      ))}
    </div>
  );
}

// "12с" / "4м" / "2ч" — насколько давно прошла сделка.
function fmtSince(iso) {
  const at = new Date(iso).getTime();
  if (!Number.isFinite(at)) return "";
  const sec = Math.max(0, Math.floor((Date.now() - at) / 1000));
  if (sec < 60) return `${sec}${t("sinceSec")}`;
  if (sec < 3600) return `${Math.floor(sec / 60)}${t("sinceMin")}`;
  return `${Math.floor(sec / 3600)}${t("sinceHour")}`;
}

/* RecentBuysTicker — живая лента последних реальных покупок по самым
   активным пулам ленты. Данные берутся из того же GeckoTerminal /trades,
   что и вкладка транзакций у токена; показываем по одной сделке за раз и
   раз в несколько секунд переключаем — так строка остаётся узкой и не
   отвлекает от виджета под ней. */
function RecentBuysTicker({ tokens, curveTokens, onOpen, onReady, сеть = "ton" }) {
  const [buys, setBuys] = useState([]);
  // Пока не пришёл первый ответ, на месте ленты стоит скелет той же
  // высоты: пустого прыгающего места на экране быть не должно.
  const [loaded, setLoaded] = useState(false);

  // Раньше опрашивались только три самых активных пула, и в ленту
  // попадали сделки трёх токенов из всей мемпады. Теперь берутся все, но
  // не разом: у бесплатного GeckoTerminal жёсткий лимит (около тридцати
  // запросов в минуту на адрес), и опрос сорока пулов сразу упёрся бы в
  // 429, то есть лента встала бы совсем.
  //
  // Поэтому список обходится по кругу: за цикл опрашивается небольшая
  // пачка, следующий цикл берёт следующую. Полный круг по сорока токенам
  // занимает пару минут, а сделки не теряются — они копятся в общем
  // списке, а не собираются заново на каждом заходе.
  const pools = useMemo(
    () =>
      [...(tokens || [])]
        .filter((tok) => tok.poolAddress)
        .sort((a, b) => (b.tx1h || b.tx24h || 0) - (a.tx1h || a.tx24h || 0)),
    [tokens]
  );
  // Токены, запущенные в приложении: у них своя кривая вместо пула, и
  // сделки читаются прямо из контракта.
  const curves = useMemo(
    () => (curveTokens || []).filter((tok) => tok.curveAddress),
    [curveTokens]
  );

  const collectedRef = useRef([]);
  const poolCursor = useRef(0);
  const curveCursor = useRef(0);

  useEffect(() => {
    if (!pools.length && !curves.length) { setBuys([]); return; }
    let cancelled = false;

    function mergeIn(rows, token) {
      const into = collectedRef.current;
      (rows || []).forEach((r) => {
        if ((r.kind !== "buy" && r.kind !== "sell") || !r.at) return;
        // Сверяем и по идентификатору, и по самой сделке: одна и та же
        // покупка приходит из разных ответов с разными номерами, и в
        // ленте она мелькала дважды.
        const same = (x) => x.id === r.id
          || (x.txHash && r.txHash && x.txHash === r.txHash && x.kind === r.kind && x.token.id === token.id);
        if (into.some(same)) return;
        into.push({ ...r, token });
      });
      into.sort((a, b) => new Date(b.at) - new Date(a.at));
      // Держим большой запас: за круг по всем токенам набегают сотни
      // сделок, и лента должна показать каждую, а не последние
      // несколько.
      collectedRef.current = into.slice(0, 600);
      if (!cancelled) setBuys(collectedRef.current);
    }

    // Сколько пулов берём за один заход. Лимит источника общий на всё
    // приложение, и лента не должна его выбирать: главное на экране —
    // график открытого токена. Пять запросов в минуту фону, остальное
    // ему; по приоритету очереди он к тому же идёт вперёд.
    const BATCH = 3;
    const INTERVAL_MS = 35000;

    async function load(first) {
      if (first) {
        // Ответы прошлого захода уже лежат в кэше — рисуем их сразу, не
        // дожидаясь сети.
        pools.forEach((p) => mergeIn(cachedPoolTrades(p.poolAddress, сетьТокена(p)), p));
      }

      const slice = [];
      for (let i = 0; i < Math.min(BATCH, pools.length); i++) {
        slice.push(pools[(poolCursor.current + i) % pools.length]);
      }
      if (pools.length) poolCursor.current = (poolCursor.current + slice.length) % pools.length;

      await Promise.all(
        slice.map(async (p) => {
          const rows = await fetchPoolTrades(p.poolAddress, 300, GT_PRIORITY.feed, сетьТокена(p));
          if (cancelled || !rows) return;
          mergeIn(rows, p);
        })
      );

      // И одна своя кривая за цикл — они читаются из другого источника,
      // со своим лимитом, поэтому идут отдельным неспешным потоком.
      if (curves.length) {
        const tok = curves[curveCursor.current % curves.length];
        curveCursor.current += 1;
        const m = await fetchCurveMarket(tok.curveAddress, tok.tokenAddress || tok.address, TON_TESTNET_NETWORK);
        if (!cancelled && m) mergeIn(curveTradesToFeed(m.trades, curveParamsOf(m.state), 200), tok);
      }

      if (!cancelled) setLoaded(true);
    }

    load(true);
    const poll = setInterval(() => load(false), INTERVAL_MS);
    return () => { cancelled = true; clearInterval(poll); };
  }, [pools, curves]);

  // Раздел ждёт ленту наравне со списком токенов, поэтому о первом
  // ответе нужно сказать наружу — сам компонент про экран ничего не
  // знает.
  const готовность = useRef(onReady);
  готовность.current = onReady;
  useEffect(() => {
    if (loaded && готовность.current) готовность.current();
  }, [loaded]);

  // Показанные сделки запоминаются: лента должна идти вперёд, а не
  // крутить по кругу одну и ту же покупку. Когда непоказанных не
  // осталось, строка просто стоит на последней, пока не приедут свежие.
  const shownRef = useRef(new Set());
  const [current, setCurrent] = useState(null);

  /* Смена сети — это другой рынок целиком, и накопленные сделки к нему
     отношения не имеют: в разделе Solana висели покупки за TON. Раньше
     компонент для этого пересоздавали ключом; теперь он чистит себя сам,
     а на экране не мелькает пустое место там, где только что была
     строка. */
  useEffect(() => {
    collectedRef.current = [];
    poolCursor.current = 0;
    curveCursor.current = 0;
    shownRef.current = new Set();
    setBuys([]);
    setCurrent(null);
  }, [сеть]);

  useEffect(() => {
    function pickNext(list, prev) {
      const fresh = list.find((x) => !shownRef.current.has(x.id));
      if (fresh) {
        shownRef.current.add(fresh.id);
        // Множество не должно расти бесконечно за долгую сессию.
        if (shownRef.current.size > 400) shownRef.current = new Set([fresh.id]);
        return fresh;
      }
      return prev && list.some((x) => x.id === prev.id) ? prev : list[0] || null;
    }
    setCurrent((prev) => pickNext(buys, prev));
    if (!buys.length) return;
    const swap = setInterval(() => setCurrent((prev) => pickNext(buys, prev)), 2600);
    return () => clearInterval(swap);
  }, [buys]);

  if (!buys.length) {
    // Запросы ещё идут — держим место под ленту, а не схлопываем его.
    if (!loaded) {
      return (
        <div
          className="flex items-center gap-2 rounded-[16px] px-3 py-2 overflow-hidden"
          style={{ background: hexA(T.up, 0.05), border: `1px solid ${hexA(T.up, 0.14)}` }}
        >
          <div className="fx-skeleton" style={{ width: 20, height: 20, borderRadius: "50%" }} />
          <div className="fx-skeleton" style={{ width: "38%", height: 10, borderRadius: 4 }} />
          <div className="fx-skeleton" style={{ width: "22%", height: 10, borderRadius: 4 }} />
        </div>
      );
    }
    return null;
  }
  const b = current || buys[0];
  if (!b) return null;

  return (
    // Коробка ровно на одну строку. Переключая сети, люди набирали на
    // этом месте столбец из нескольких сделок вперемешку — TON под SOL —
    // и он так и оставался на экране; выше одной строки лента теперь не
    // вырастет, что бы ни осталось от прошлой сети.
    <div style={{ maxHeight: 44, overflow: "hidden" }}>
    <button
      onClick={() => onOpen && onOpen(b.token)}
      className="fx-tap w-full flex items-center gap-2 rounded-[16px] px-3 py-2 overflow-hidden"
      style={{ background: hexA(b.kind === "sell" ? T.down : T.up, 0.07), border: `1px solid ${hexA(b.kind === "sell" ? T.down : T.up, 0.22)}`, textAlign: "left" }}
    >
      {/* Ключ по сделке: React заменяет блок целиком, и появление
          проигрывается заново. Время лежит здесь же — оно относится к
          сделке, а не к рамке, и снаружи оставалось от прошлой строки. */}
      <div key={b.id} className="flex items-center gap-2 min-w-0 w-full" style={{ animation: "tickerSwap 380ms ease-out both" }}>
        <TokenAvatar size={20} tone={b.kind === "sell" ? "down" : "up"} src={b.token.logoUrl} />
        <span className="truncate" style={{ fontFamily: monoFont, color: T.muted, fontSize: 12.5 }}>{shortAddr(b.from) || "—"}</span>
        <span style={{ fontFamily: bodyFont, color: b.kind === "sell" ? T.down : T.up, fontSize: 13, fontWeight: 700, whiteSpace: "nowrap" }}>
          {/* Сумма в монете той сети, где прошла сделка: в разделе
              Solana цифры в TON были просто неправдой. */}
          {b.kind === "sell" ? t("tickerSold") : t("tickerBought")} {(() => {
            const соло = b.token && b.token.chain === "solana";
            const курс = соло ? solUsd() : tonUsd();
            const сумма = !соло && b.volTon != null ? b.volTon : (курс > 0 ? b.volUsd / курс : 0);
            // Без курса пересчитывать нечего, и «0 SOL» здесь означало бы
            // не мелкую сделку, а незагруженный курс — показываем доллары,
            // они у источника есть всегда.
            if (!(сумма > 0)) return `$${b.volUsd < 1 ? b.volUsd.toFixed(2) : fmtCompact(b.volUsd)}`;
            // SOL стоит сотни долларов, поэтому обычная сделка на доллар —
            // это тысячные доли монеты. Прежние три знака округляли их в
            // ноль, и лента писала «купил 0 SOL».
            return `${fmtCoin(сумма)} ${соло ? "SOL" : "TON"}`;
          })()}
        </span>
        <span className="truncate" style={{ fontFamily: displayFont, color: T.ice, fontSize: 13, fontWeight: 700, flex: 1 }}>${b.token.ticker}</span>
        <span style={{ fontFamily: monoFont, color: T.muted, fontSize: 11.5, whiteSpace: "nowrap" }}>{fmtSince(b.at)}</span>
      </div>
    </button>
    </div>
  );
}

function MintlyFrame({ children, size = 52, glow }) {
  return (
    <div style={{
      width: size, height: size,
      display: "flex", alignItems: "center", justifyContent: "center", fontSize: size * 0.46, flexShrink: 0,
    }}>
      {children}
    </div>
  );
}

/* Premium circular token avatar: glass ring with a static gradient border.
   Used specifically for token logos (list cards, detail, portfolio) — the cut-corner
   MintlyFrame stays reserved for brand/utility chrome elsewhere. */
/* Уменьшенная копия картинки токена.
 *
 * Логотипы мемкоинов лежат в IPFS и весят сколько угодно: попадаются
 * двухмегабайтные PNG на кружок в тридцать восемь точек. На телефоне
 * такая лента грузится минутами, и вместо аватарок человек всё это время
 * видит эмодзи-заглушки.
 *
 * Прогоняем через пережимающий CDN: та же картинка приходит в три
 * килобайта. Если CDN не справится, показ откатывается на исходную
 * ссылку — она рабочая, просто тяжёлая. */
function превьюКартинки(url, размер) {
  const s = String(url || "");
  if (!/^https?:\/\//i.test(s)) return s;
  // Свои картинки (хранилище профилей) уже нужного размера — гонять их
  // через чужой CDN незачем.
  if (s.includes("supabase.co")) return s;
  const w = Math.max(64, Math.round(размер * 2));
  return `https://cdn.helius-rpc.com/cdn-cgi/image/width=${w},height=${w},fit=cover,format=auto/${s}`;
}

/* Место логотипа, пока он едет по сети: круг посветлее подложки и
   звезда внутри. Своей картинки у токена может и не быть вовсе — тогда
   заглушка остаётся насовсем, поэтому она нейтральная и не намекает на
   загрузку. */
function ЗаглушкаЛоготипа({ size }) {
  const внутренний = Math.round(size * 0.56);
  return (
    <div
      aria-hidden
      style={{
        position: "absolute", inset: 0, display: "flex",
        alignItems: "center", justifyContent: "center", background: T.surfaceHi,
      }}
    >
      <div
        style={{
          width: внутренний, height: внутренний, borderRadius: "50%",
          background: hexA(T.muted, 0.3), display: "flex",
          alignItems: "center", justifyContent: "center",
        }}
      >
        <Star size={Math.round(внутренний * 0.52)} fill={T.surfaceHi} color={T.surfaceHi} strokeWidth={1.5} />
      </div>
    </div>
  );
}

/* Путь токена до биржи — кольцом вокруг его логотипа.
 *
 * Полоска под карточкой говорила то же самое, но читалась отдельной
 * деталью: сначала логотип, потом где-то ниже — линия. Кольцо привязано
 * к самому токену, и в списке видно сразу, кто близок к выходу.
 *
 * По заполненной дуге бежит блик — он обрезан маской ровно по ней,
 * поэтому свет идёт только там, где собрано, и не подсказывает лишнего.
 */
function КольцоДоБиржи({ size, доля, готово = false, children }) {
  const id = React.useId();
  const толщина = Math.max(2, Math.round(size * 0.05));
  const внешний = size + Math.round(толщина * 4);
  const r = (внешний - толщина) / 2;
  const длина = 2 * Math.PI * r;
  const дуга = длина * Math.max(0, Math.min(1, доля || 0));
  const цвет = готово ? T.up : T.electric;
  return (
    <div style={{ position: "relative", width: внешний, height: внешний, flexShrink: 0 }}>
      <svg
        width={внешний} height={внешний} aria-hidden
        style={{ position: "absolute", inset: 0, transform: "rotate(-90deg)", overflow: "visible" }}
      >
        <defs>
          <mask id={`дуга${id}`}>
            <circle
              cx={внешний / 2} cy={внешний / 2} r={r} fill="none" stroke="#fff"
              strokeWidth={толщина} strokeLinecap="round" strokeDasharray={`${дуга} ${длина}`}
            />
          </mask>
        </defs>
        <circle cx={внешний / 2} cy={внешний / 2} r={r} fill="none" stroke={T.line} strokeWidth={толщина} />
        <circle
          cx={внешний / 2} cy={внешний / 2} r={r} fill="none" stroke={цвет}
          strokeWidth={толщина} strokeLinecap="round" strokeDasharray={`${дуга} ${длина}`}
        />
        {дуга > 1 && (
          <g mask={`url(#дуга${id})`}>
            <circle
              className="fx-ring-glow"
              cx={внешний / 2} cy={внешний / 2} r={r} fill="none" stroke={готово ? T.up : T.ice}
              strokeWidth={толщина} strokeLinecap="round"
              strokeDasharray={`${Math.round(длина * 0.14)} ${длина}`}
              style={{ "--ring-len": `${длина.toFixed(1)}px`, filter: `drop-shadow(0 0 ${толщина * 1.6}px ${hexA(цвет, 0.9)})` }}
            />
          </g>
        )}
      </svg>
      <div style={{ position: "absolute", left: толщина * 2, top: толщина * 2 }}>{children}</div>
    </div>
  );
}

function TokenAvatar({ size = 52, tone = "neutral", src }) {
  const [broken, setBroken] = useState(false);
  // Сначала пробуем лёгкую копию, при отказе — исходную ссылку, и только
  // потом сдаёмся на эмодзи.
  const [исходная, setИсходная] = useState(false);
  // Пока картинка едет, в кружке стоит заглушка — серый круг со
  // звездой. Раньше там подмигивала ракета и через мгновение сменялась
  // логотипом: список из сорока строк выглядел мигающей гирляндой, а
  // просто чернота читалась дырой. Заглушка ничего не обещает и ничем не
  // мигает, но место занято, и строка не прыгает.
  const [пришла, setПришла] = useState(false);
  useEffect(() => { setBroken(false); setИсходная(false); setПришла(false); }, [src]);
  const ringColor = T.lineHi;
  const естьКартинка = !!src && !broken;
  return (
    <div
      className="fx-avatar"
      style={{
        width: size, height: size, position: "relative", flexShrink: 0, borderRadius: "50%",
        border: `1.5px solid ${ringColor}`,
        background: T.surfaceHi,
        display: "flex", alignItems: "center", justifyContent: "center",
        fontSize: size * 0.44, overflow: "hidden",
      }}
    >
      {естьКартинка && !пришла && <ЗаглушкаЛоготипа size={size} />}
      {естьКартинка ? (
        <img
          src={исходная ? src : превьюКартинки(src, size)}
          alt=""
          // Грузим сразу, а не по мере прокрутки: строки списка коротки,
          // и «ленивая» загрузка откладывала картинку до того момента,
          // когда человек уже смотрит на пустой кружок.
          loading="eager"
          decoding="async"
          fetchpriority="high"
          onLoad={() => setПришла(true)}
          onError={() => (исходная ? setBroken(true) : setИсходная(true))}
          style={{
            width: "100%", height: "100%", objectFit: "cover", borderRadius: "50%",
            // Появление, а не подстановка: картинка приезжает по сети, и
            // резкая смена чёрного круга на логотип дёргает глаз.
            opacity: пришла ? 1 : 0, transition: "opacity 160ms ease-out",
          }}
        />
      ) : <ЗаглушкаЛоготипа size={size} />}
    </div>
  );
}

function GlassCard({ children, style, className = "", ...rest }) {
  return (
    <div className={`fx-card rounded-[20px] ${className}`} style={{ background: T.surface, border: `1px solid ${T.line}`, ...style }} {...rest}>
      {children}
    </div>
  );
}

function StatChip({ icon: Icon, label, value }) {
  return (
    <div className="fx-chip flex items-center gap-2 rounded-[20px] px-3 py-2" style={{ background: T.surface, border: `1px solid ${T.line}` }}>
      <Icon size={14} color={T.muted} />
      <div>
        <div style={{ fontFamily: monoFont, color: T.ice, fontSize: 14.5, lineHeight: 1.1 }}>{value}</div>
        <div style={{ fontFamily: bodyFont, color: T.muted, fontSize: 11 }}>{label}</div>
      </div>
    </div>
  );
}

function SectionTitle({ children, action }) {
  return (
    <div className="flex items-center justify-between mb-2.5">
      {/* Заголовок секции, а не экрана: 17 пунктов и полужирный. Прежние
          23 и жирный спорили с названием раздела и делали каждый блок
          похожим на отдельную страницу. */}
      <span style={{ fontFamily: displayFont, color: T.ice, fontSize: 17, fontWeight: 600, letterSpacing: "-0.01em" }}>{children}</span>
      {action}
    </div>
  );
}

// Сколько длится уход подсказки вверх. Ровно на это время её показ
// продлевается после срока жизни, иначе она пропала бы мгновенно.
const TOAST_OUT_MS = 280;

function Toast({ toast, insetTop = 0, leaving = false }) {
  if (!toast) return null;
  return (
    <div style={{
      position: "absolute", top: insetTop + 14, left: "50%", zIndex: 50,
      willChange: "transform, opacity",
      animation: leaving
        ? `toastOut ${TOAST_OUT_MS}ms cubic-bezier(0.4,0,1,1) both`
        : "toastIn 260ms cubic-bezier(0.16,1,0.3,1) both",
    }}>
      {/* toast intentionally ignores the app theme — like a native OS toast it
          stays a fixed dark pill with light text/icon so it's always legible,
          instead of flipping to (illegible) dark-on-dark under the White theme */}
      <div className="flex items-center gap-2 rounded-full px-4 py-2" style={{ background: "rgba(24,24,26,0.95)", border: "1px solid rgba(255,255,255,0.14)", boxShadow: "0 8px 24px rgba(0,0,0,0.4)" }}>
        <CheckCircle2 size={14} color="#31D07B" />
        <span style={{ fontFamily: bodyFont, fontSize: 13, color: "#F3F3F6", whiteSpace: "nowrap" }}>{toast}</span>
      </div>
    </div>
  );
}

/* ---------------------------------------------------------
   MOCK DATA — home
--------------------------------------------------------- */

const CATEGORIES = ["Все", "Мемы", "Утилиты", "Игры", "AI", "Соц"];
/* CATEGORIES / token.cat stay as fixed Russian ids internally (they're
   used as data keys), catLabel() maps an id to the translated label
   the current language should actually display. */
function catLabel(cat) {
  const map = { "Все": "catAll", "Мемы": "catMemes", "Утилиты": "catUtility", "Игры": "catGames", "AI": "catAI", "Соц": "catSocial" };
  return map[cat] ? t(map[cat]) : cat;
}

/* Достижения. Считаются по тому, что приложение действительно знает:
   сколько токенов человек запустил, сколько у него подписчиков и на
   скольких подписан он сам, подключён ли кошелёк, заполнен ли профиль,
   надета ли косметика. Ничего выдуманного и никаких «очков» — иначе
   значок ничего не значит.

   Каждое достижение возвращает текущее значение и цель, поэтому у
   незакрытых виден прогресс, а не просто замок. */
/* Монеты за достижения. Раньше каждое достижение открывало один
   определённый предмет, и половина витрины стояла под замком без всякого
   выбора: закрыл «первый запуск» — получил «Уголёк», хочешь ты его или
   нет. Теперь достижение приносит монеты, а что на них взять — дело
   вкуса. Предметов дороже, чем монет за все достижения, поэтому выбирать
   и правда приходится. */
const ACH_COINS = {
  firstLaunch: 120,
  mcap1k: 150,
  mcap10k: 300,
  mcap100k: 600,
  wallet: 60,
  face: 60,
  style: 60,
  invite1: 60,
  invite5: 150,
  invite10: 300,
  invite25: 600,
};

/* Монеты за каждого приглашённого — сверх достижений за приглашения.
   Достижения дают ступеньки (первый, пятый, десятый), а это платит за
   каждого, включая тех, кто попал между ступенями: иначе после двадцать
   пятого приглашения новые люди перестают что-либо приносить.
   Начисление считается по базе, не по счётчику в телефоне: приписать
   себе приглашённых, которых нет, нельзя. */
const REFERRAL_COINS = 100;
function coinsFromInvites(inviteCount) {
  return Math.max(0, Math.floor(inviteCount || 0)) * REFERRAL_COINS;
}

function buildAchievements({ tokensCount = 0, bestMcapUsd = 0, invites = 0, connected = false, profile = {}, cosmetics = {} }) {
  const bioLen = (profile.bio || "").trim().length;
  const hasFace = (profile.avatarUrl ? 1 : 0) + (bioLen >= 10 ? 1 : 0);
  const dressed = ((cosmetics.frame && cosmetics.frame !== "none") ? 1 : 0)
    + ((cosmetics.card && cosmetics.card !== "none") ? 1 : 0);
  return [
    { id: "firstLaunch", icon: Rocket, color: T.electric, value: tokensCount, target: 1 },
    // Не «сколько запустил», а «как высоко забрался»: берётся лучшая
    // капитализация среди своих токенов, считанная с самой кривой.
    { id: "mcap1k", icon: Flame, color: T.electric, value: bestMcapUsd, target: 1000, unit: "usd" },
    { id: "mcap10k", icon: TrendingUp, color: T.electric, value: bestMcapUsd, target: 10000, unit: "usd" },
    { id: "mcap100k", icon: Crown, color: T.electric, value: bestMcapUsd, target: 100000, unit: "usd" },
    { id: "wallet", icon: Wallet, color: T.up, value: connected ? 1 : 0, target: 1 },
    { id: "face", icon: User, color: T.up, value: hasFace, target: 2 },
    { id: "style", icon: ShoppingBag, color: T.up, value: dressed, target: 2 },
    // Приглашения по своей ссылке. Считаются по профилям, у которых в
    // поле «кто пригласил» стоит этот человек, — то есть по людям,
    // которые действительно зашли и завели аккаунт, а не по переходам.
    { id: "invite1", icon: Gift, color: T.violet, value: invites, target: 1 },
    { id: "invite5", icon: Gift, color: T.violet, value: invites, target: 5 },
    { id: "invite10", icon: Star, color: T.violet, value: invites, target: 10 },
    { id: "invite25", icon: ShieldCheck, color: T.violet, value: invites, target: 25 },
  ].map((a) => ({
    ...a,
    done: a.value >= a.target,
    label: t(`ach${a.id.charAt(0).toUpperCase()}${a.id.slice(1)}`),
    hint: t(`ach${a.id.charAt(0).toUpperCase()}${a.id.slice(1)}Hint`),
    coins: ACH_COINS[a.id] || 0,
  }));
}

// Прогресс строкой. Деньги показываем в долларах и сокращённо, иначе
// «332/100000» читается как ошибка.
function achProgressText(a) {
  const now = Math.min(a.value, a.target);
  if (a.unit === "usd") return `$${fmtCompact(now)}/$${fmtCompact(a.target)}`;
  return `${now}/${a.target}`;
}

// Сколько монет уже заработано и сколько потрачено. Отдельного счётчика
// в базе нет намеренно: баланс — это разница между закрытыми
// достижениями и купленным. Значит его нельзя рассинхронизировать, а в
// хранении нуждается только список покупок.
function coinsEarned(achievements) {
  return (achievements || []).reduce((sum, a) => sum + (a.done ? (ACH_COINS[a.id] || 0) : 0), 0);
}

function cosmeticPrice(kind, id) {
  const item = (kind === "frame" ? FRAME_BY_ID : CARD_BY_ID)[id];
  return (item && item.price) || 0;
}

// Ключ покупки — «вид:предмет»: у рамки и карточки бывают одинаковые
// названия («Искры», «Листопад»), и по одному имени их не различить.
function ownedKey(kind, id) { return `${kind}:${id}`; }

function coinsSpent(owned) {
  let sum = 0;
  for (const key of owned || []) {
    const [kind, id] = String(key).split(":");
    sum += cosmeticPrice(kind, id);
  }
  return sum;
}

/* Сундук. Дешевле любой рамки и карточки, но что достанется — не
   выбираешь. Нужен потому, что монеты иначе некуда девать: скупив всё
   нужное, человек копит их без цели. Из сундука приходит только то,
   чего ещё нет, — платить за уже купленное было бы обманом. */
const CHEST_PRICE = 140;
function chestPool(owned) {
  const pool = [];
  for (const item of AVATAR_FRAMES) {
    if ((item.price || 0) > 0 && !owned.has(ownedKey("frame", item.id))) pool.push({ kind: "frame", id: item.id, item });
  }
  for (const item of PROFILE_CARDS) {
    if ((item.price || 0) > 0 && !owned.has(ownedKey("card", item.id))) pool.push({ kind: "card", id: item.id, item });
  }
  return pool;
}

/* Смена ника. Первое имя выбирается бесплатно при создании аккаунта,
   дальше — за монеты: под ником человека знают в ленте покупок и в
   чужих профилях, и бесплатная чехарда именами всех бы запутала. */
const NICKNAME_PRICE = 500;

/* Пороги для уведомлений о покупках. Мелкий шаг внизу — токен на старте
   разбирают по чуть-чуть, и там важна каждая сделка; крупные значения
   нужны, когда торговля пошла и сообщений становится слишком много. */
const NOTIFY_THRESHOLDS = [0.05, 0.5, 1, 5, 10, 50];

// Пункта «Профиль» здесь нет: «Редактировать профиль» и так стоит на
// самом экране профиля, а удаление аккаунта переехало в «Безопасность».
const SETTINGS_ITEMS = [
  { key: "security", icon: Lock, tKey: "security" },
  { key: "notify", icon: Bell, tKey: "notifyTitle" },
  { key: "language", icon: Globe2, tKey: "langTitle" },
  { key: "referral", icon: Gift, tKey: "referral" },
  { key: "support", icon: LifeBuoy, tKey: "support" },
  { key: "architecture", icon: Cpu, tKey: "archTitle" },
  { key: "privacy", icon: FileText, tKey: "privacy" },
];

/* ---------------------------------------------------------
   HOME VIEW
--------------------------------------------------------- */

function CardStat({ icon: Icon, children }) {
  return (
    <span className="flex items-center gap-1" style={{ fontFamily: monoFont, fontSize: 11.5, color: T.muted }}>
      <Icon size={11} color={T.muted} /> {children}
    </span>
  );
}

// Real holder count, fetched lazily (only once actually scrolled into
// view, same IntersectionObserver pattern as MiniChart above) so a long
// feed doesn't fire 18+ TonAPI requests up front. Shows a dash while
// loading and stays a dash if TonAPI has nothing for this address —
// never falls back to a fabricated number.
const HoldersBadge = React.memo(function HoldersBadge({ tokenAddress, testnet = false, icon: Icon = User }) {
  const [count, setCount] = useState(undefined);
  const [visible, setVisible] = useState(!tokenAddress);
  const elRef = useRef(null);

  useEffect(() => {
    if (!tokenAddress || visible) return;
    const el = elRef.current;
    if (!el || typeof IntersectionObserver === "undefined") { setVisible(true); return; }
    const io = new IntersectionObserver((entries) => {
      if (entries[0]?.isIntersecting) { setVisible(true); io.disconnect(); }
    }, { rootMargin: "200px" });
    io.observe(el);
    return () => io.disconnect();
  }, [tokenAddress, visible]);

  useEffect(() => {
    if (!tokenAddress || !visible) return;
    let cancelled = false;
    fetchJettonHolders(tokenAddress, testnet).then((c) => { if (!cancelled) setCount(c); });
    return () => { cancelled = true; };
  }, [tokenAddress, visible, testnet]);

  return (
    <span ref={elRef} className="flex items-center gap-1" style={{ fontFamily: monoFont, fontSize: 11.5, color: T.muted }}>
      <Icon size={11} color={T.muted} />
      {count == null
        ? <span className="fx-skeleton" style={{ width: 26, height: 9, borderRadius: 3, display: "inline-block" }} />
        : count.toLocaleString("ru-RU")}
    </span>
  );
});

// Real tokens only — no bundled/demo list. The feed starts empty and
// fills in as soon as the first live GeckoTerminal fetch resolves.
// 2.5 секунды на опрос ленты сжигали почти весь лимит бесплатного
// GeckoTerminal (24 запроса в минуту из ~30), и всем остальным — графику,
// транзакциям, ленте покупок — доставались 429. Цены на мемкоинах не
// меняются настолько быстро, чтобы это того стоило.
// Как часто перечитывается список запусков площадки. Это запасной путь:
// обычно новую строку приносит живая подписка на базу, и таймер нужен
// там, где она не работает, — оборванное соединение, выключенная
// репликация, спящая вкладка. Пятнадцать секунд — предел, за которым
// ожидание становится заметным; чаще запрашивать всю ленту у базы от
// каждого открытого приложения незачем.
const СВОИ_ОБНОВЛЕНИЕ_МС = 15000;
// Каким считать «только что запущенный». Шесть часов: за сутки на
// Solana успевают появиться пары с десятками тысяч сделок, и в разделе
// новых им не место. Если за это окно пусто, оно расширяется до суток —
// пустой список хуже неточного.
const НОВЫЕ_ОКНО_МС = 6 * 60 * 60 * 1000;
const TOKEN_REFRESH_MS = 15000;

// Сколько пулов держим в ленте и с какой глубины их собираем. Одна
// страница GeckoTerminal — 20 пулов; пяти страниц хватает, чтобы во
// вкладках «Горячие» и «DEX» был длинный список, а не десяток строк.
const FEED_PAGES = 5;
const FEED_LIMIT = 100;
// Каждый N-й опрос ходит вглубь; остальные обновляют только первую
// страницу, чтобы не жечь лимит запросов.
const FEED_DEEP_EVERY = 8;

// Сколько токенов крутится в «центре внимания» и как часто меняется.
const SPOTLIGHT_COUNT = 5;
const SPOTLIGHT_ROTATE_MS = 8000;

/* RocketIconFX — the "Создать токен" icon in the corner: same rocket
   glyph, gently bobbing in place, with a small flickering flame
   underneath it (no glow behind the rocket itself). */
function RocketIconFX() {
  return (
    <div style={{ position: "relative", width: 34, height: 34, display: "flex", alignItems: "center", justifyContent: "center" }}>
      <Rocket
        size={27}
        strokeWidth={1.6}
        color={T.electric}
        style={{ position: "relative", transformOrigin: "center" }}
      />
    </div>
  );
}

/* ---------------------------------------------------------
   МЕМПАД — separate tab (between Home and Create). Layout: a title
   row with a launch-token CTA, a big "spotlight" card for the top
   token, a row of quick filters, and a compact list of tokens below —
   all built from the same real `tokens` feed the Home tab uses, just
   arranged differently.
--------------------------------------------------------- */
const MEMPAD_FILTERS = [
  { id: "new", labelKey: "mempadFilterNew" },
  { id: "trend", labelKey: "mempadFilterTrend" },
  { id: "dex", labelKey: "mempadFilterDex" },
  { id: "hot", labelKey: "mempadFilterHot" },
];

/* Трендовые — где прямо сейчас идут сделки.
 *
 * Это не то же, что «Горячие»: там наверху то, что сильнее выросло за
 * сутки, и туда попадает монета с одной сделкой и рисованным плюсом.
 * Тренд считается по числу сделок, а окно берётся то, в котором вообще
 * есть жизнь: час, потом шесть часов, потом сутки. Ночью и на выходных
 * часовое окно пустое у всех, и без отката список выходил бы пустым. */
function поТренду(arr) {
  const окно = ["tx1h", "tx6h", "tx24h"].find((w) => arr.some((tok) => (tok[w] || 0) > 0)) || "tx24h";
  return [...arr].sort((a, b) => (b[окно] || 0) - (a[окно] || 0));
}

/* Аура токена — фон карточки «В центре внимания».

   Цвет берётся из самого логотипа: картинка рисуется в холст размером
   восемь на восемь точек, из них считается средний тон, и он же
   разливается за карточкой мягким пятном. У каждого токена выходит своя
   подложка, и подборка каждый раз выглядит по-новому, ничего для этого
   не рисуя вручную.

   Если логотипа нет или чужой сервер не отдал картинку для чтения
   (браузер не пускает к пикселям без разрешения), цвет выводится из
   тикера — тот же токен всегда получает тот же оттенок. */
const аураКеш = new Map(); // ссылка на логотип -> [r,g,b]

function цветИзТикера(тикер) {
  const h = hashSeed(String(тикер || "?")) % 360;
  // Насыщенность и светлота фиксированы: случайные давали то грязь, то
  // кислоту, а так любой тикер получает ровный глубокий тон.
  const s = 0.62;
  const l = 0.52;
  const c = (1 - Math.abs(2 * l - 1)) * s;
  const x = c * (1 - Math.abs(((h / 60) % 2) - 1));
  const m = l - c / 2;
  const [r, g, b] = h < 60 ? [c, x, 0] : h < 120 ? [x, c, 0] : h < 180 ? [0, c, x]
    : h < 240 ? [0, x, c] : h < 300 ? [x, 0, c] : [c, 0, x];
  return [Math.round((r + m) * 255), Math.round((g + m) * 255), Math.round((b + m) * 255)];
}

function SpotlightAura({ src, ticker }) {
  const [цвет, setЦвет] = useState(() => (src && аураКеш.get(src)) || null);

  useEffect(() => {
    if (!src) { setЦвет(null); return; }
    const готовый = аураКеш.get(src);
    if (готовый) { setЦвет(готовый); return; }

    let cancelled = false;
    const img = new Image();
    img.crossOrigin = "anonymous";
    img.onload = () => {
      try {
        const c = document.createElement("canvas");
        c.width = 8; c.height = 8;
        const ctx = c.getContext("2d");
        ctx.drawImage(img, 0, 0, 8, 8);
        const { data } = ctx.getImageData(0, 0, 8, 8);
        let r = 0, g = 0, b = 0, n = 0;
        for (let i = 0; i < data.length; i += 4) {
          // Прозрачные и почти чёрные точки пропускаем: у логотипов на
          // прозрачном фоне они дают серую кашу вместо цвета.
          if (data[i + 3] < 40) continue;
          if (data[i] + data[i + 1] + data[i + 2] < 60) continue;
          r += data[i]; g += data[i + 1]; b += data[i + 2]; n += 1;
        }
        if (!n || cancelled) return;
        const итог = [Math.round(r / n), Math.round(g / n), Math.round(b / n)];
        аураКеш.set(src, итог);
        setЦвет(итог);
      } catch {
        // Чужой сервер не разрешил читать пиксели — останется цвет из тикера.
      }
    };
    img.src = src;
    return () => { cancelled = true; };
  }, [src]);

  const [r, g, b] = цвет || цветИзТикера(ticker);
  const тон = (a) => `rgba(${r}, ${g}, ${b}, ${a})`;

  return (
    <div
      aria-hidden
      style={{
        position: "absolute", inset: 0, pointerEvents: "none",
        background: `radial-gradient(70% 120% at 8% 50%, ${тон(0.22)} 0%, ${тон(0.06)} 45%, transparent 78%)`,
        // Смена токена в подборке не должна выглядеть как вспышка.
        transition: "background 520ms ease-out",
      }}
    />
  );
}

/* Пометка «тест» у токена из пробной сети. Монеты там ничего не стоят, а
   выглядит такой токен точно так же, как настоящий, — без подписи это
   ловушка для того, кто пришёл покупать. */
function ПометкаТест({ сеть, size = 10 }) {
  if (!пробнаяСеть(сеть)) return null;
  return (
    <span style={{
      fontFamily: monoFont, fontSize: size, lineHeight: 1.6, letterSpacing: 0.4,
      color: "#F2C14E", border: "1px solid #F2C14E55",
      borderRadius: 6, padding: "0 5px", flexShrink: 0, textTransform: "uppercase",
    }}>тест</span>
  );
}

/* Одна цифра в подвале карточки. Подпись мелкая и приглушённая: их
   четыре в ряд, и если каждую набрать наравне со значением, ряд читается
   как сплошная каша. */
function ЧислоКарточки({ подпись, значение, цвет }) {
  return (
    <div className="min-w-0">
      <div className="truncate" style={{ fontFamily: monoFont, color: цвет || T.ice, fontSize: 13, fontWeight: 600 }}>{значение}</div>
      <div className="truncate" style={{ fontFamily: bodyFont, color: T.faint, fontSize: 10.5, marginTop: 1 }}>{подпись}</div>
    </div>
  );
}

/* Карточка токена в мемпаде.
 *
 * Прежде здесь была строка: аватар, тикер, капитализация. По ней нельзя
 * было решить ничего — что за токен, о чём он, давно ли живёт, сколько
 * до биржи. Человек открывал десяток подряд, чтобы понять, и закрывал.
 *
 * Теперь карточка отвечает на это сразу: описание (его пишут при
 * запуске), возраст, шкала до листинга и четыре цифры, по которым
 * мемкоины и сравнивают. Открывать имеет смысл уже осознанно. */
const MempadRow = React.memo(function MempadRow({ t: tok, onOpen, index }) {
  const рост = (tok.change || 0) >= 0;
  const возраст = (fmtAge(tok.createdAt) || "")
    .replace(/M$/, " мин").replace(/H$/, " ч").replace(/D$/, " д");
  const своя = tok.graduationTon > 0;
  // Доля собранного до выхода на биржу. Только у своих: у токенов,
  // которые уже торгуются на DEX, идти некуда — они пришли.
  const доляДоБиржи = своя
    ? Math.max(0, Math.min(1, (Number(tok.raisedTon) || 0) / tok.graduationTon))
    : 0;
  // Держателей знают не у всех: у токенов с биржи их не сосчитать, зато
  // видно число сделок. Показываем то, что есть на самом деле.
  const людиИлиСделки = tok.holders != null
    ? { подпись: "держателей", значение: Number(tok.holders).toLocaleString("ru-RU") }
    : { подпись: "сделок за сутки", значение: (tok.tx24h || 0).toLocaleString("ru-RU") };

  return (
    <button
      onClick={() => onOpen(tok)}
      className="fx-tap fx-card w-full text-left"
      // Задержка появления копится только на первых карточках: при сорока
      // элементах прежние сорок миллисекунд на каждый растягивали список
      // на полторы секунды, и переключение вкладки выглядело медленным.
      //
      // Без фона, рамки и разделителя: сорок плашек подряд рябят, а
      // линия под каждой строкой режет список на куски. Строки разводит
      // зазор — этого хватает, чтобы не путать соседние токены.
      style={{
        padding: "10px 2px", background: "transparent",
        animationDelay: `${Math.min(index, 6) * 22}ms`,
      }}
    >
      <div className="flex items-center" style={{ gap: 12 }}>
        {своя ? (
          <КольцоДоБиржи size={46} доля={доляДоБиржи} готово={доляДоБиржи >= 1}>
            <TokenAvatar size={46} tone={рост ? "up" : "down"} src={tok.logoUrl} />
          </КольцоДоБиржи>
        ) : (
          <TokenAvatar size={46} tone={рост ? "up" : "down"} src={tok.logoUrl} />
        )}

        <div className="flex-1 min-w-0">
          <div className="flex items-center" style={{ gap: 6 }}>
            <span className="truncate" style={{ fontFamily: displayFont, color: T.ice, fontSize: 16, fontWeight: 600 }}>${tok.ticker}</span>
            <ПометкаТест сеть={tok.network} />
          </div>
          <div className="truncate" style={{ fontFamily: bodyFont, color: T.muted, fontSize: 12.5, marginTop: 2 }}>
            {tok.name || "—"}
            {возраст ? ` · ${возраст}` : ""}
            {tok.dexName ? ` · ${tok.dexName}` : ""}
          </div>
        </div>

        <div className="text-right flex-shrink-0">
          <div style={{ fontFamily: monoFont, color: T.ice, fontSize: 15, fontWeight: 600 }}>{fmtUSD(tok.mcapNum)}</div>
          <div style={{ fontFamily: monoFont, color: рост ? T.up : T.down, fontSize: 12.5, marginTop: 3 }}>
            {рост ? "+" : ""}{(tok.change || 0).toFixed(1)}%
          </div>
        </div>
      </div>

      {/* Описание — две строки, не больше: длинный текст на карточке
          вытесняет цифры, ради которых её и читают. */}
      {tok.description ? (
        <p style={{
          fontFamily: bodyFont, color: T.paper, fontSize: 12.5, lineHeight: 1.45, marginTop: 10,
          display: "-webkit-box", WebkitLineClamp: 2, WebkitBoxOrient: "vertical", overflow: "hidden",
        }}>
          {tok.description}
        </p>
      ) : null}

      <div className="grid" style={{ gridTemplateColumns: "repeat(4, minmax(0, 1fr))", gap: 8, marginTop: 12 }}>
        <ЧислоКарточки подпись="цена" значение={fmtPrice(tok.price)} />
        <ЧислоКарточки подпись={своя ? "в кривой" : "ликвидность"} значение={`$${tok.liq}`} />
        <ЧислоКарточки подпись="объём 24ч" значение={`$${tok.vol}`} />
        <ЧислоКарточки подпись={людиИлиСделки.подпись} значение={людиИлиСделки.значение} />
      </div>
    </button>
  );
});

function MempadRowSkeleton({ index }) {
  return (
    <div className="w-full flex items-center gap-3 py-3" style={{ animationDelay: `${index * 55}ms` }}>
      <div className="fx-skeleton" style={{ width: 44, height: 44, borderRadius: "50%" }} />
      <div className="flex-1 flex flex-col gap-2">
        <div className="fx-skeleton" style={{ width: "35%", height: 12, borderRadius: 4 }} />
        <div className="fx-skeleton" style={{ width: "50%", height: 9, borderRadius: 4 }} />
      </div>
      <div className="fx-skeleton" style={{ width: 44, height: 22, borderRadius: 6 }} />
    </div>
  );
}

// Приводит токен, запущенный в приложении, к тому же виду, в котором
// приходит внешняя лента, — чтобы карточка и экран токена рисовали и то
// и другое одним кодом.
//
// Цена, капитализация, объём и изменение приезжают из состояния кривой
// (см. fetchCurveMarket) и подставляются сюда как есть. Пока их нет —
// нули и прочерки: выдуманное число на экране торговли хуже пустого
// места. poolAddress остаётся пустым, пары на DEX у такого токена ещё
// нет; график при этом рисуется по истории самой кривой.
function localTokenToFeedShape(entry) {
  // priceTon приходит из состояния кривой, если оно уже прочитано;
  // иначе честнее показать ноль, чем выдуманное число.
  // Курс — монеты той цепочки, в которой считается кривая: цена токена
  // Solana выражена в SOL, и пересчёт по TON давал число втрое мимо.
  const курс = entry.chain === "solana" ? solUsd() : tonUsd();
  const price = entry.priceTon != null
    ? entry.priceTon * курс
    : (entry.mcapNum ? entry.mcapNum / 1_000_000_000 : 0);
  return {
    id: entry.id,
    tokenAddress: entry.address,
    poolAddress: null,
    name: entry.name,
    ticker: entry.ticker,
    logoUrl: entry.logoUrl,
    emoji: entry.emoji,
    price,
    change: entry.change || 0,
    mcapNum: entry.mcapNum,
    liq: entry.liq,
    vol: entry.vol,
    tx24h: entry.tx24h || 0,
    cat: "Мемы",
    seed: hashSeed(entry.id),
    verified: entry.verified,
    live: false,
    dexName: null,
    ownerId: entry.ownerId || null,
    curveAddress: entry.curveAddress || null,
    curveJettonWallet: entry.curveJettonWallet || null,
    chain: entry.chain === "solana" ? "solana" : "ton",
    // Сеть тащим дальше: по ней в списке ставится пометка «тест», и без
    // неё пробный токен неотличим от настоящего.
    network: entry.network || null,
    // Описание и держатели — для карточки в мемпаде: по ним видно, что
    // за токен, ещё до того, как его открыли.
    description: entry.description || null,
    bannerUrl: entry.bannerUrl || null,
    holders: entry.holders != null ? entry.holders : null,
    // Шкала до листинга: раньше эти числа сюда не доезжали, и полоса в
    // списке не рисовалась ни у одного своего токена.
    raisedTon: entry.raisedTon || 0,
    graduationTon: entry.graduationTon || 0,
    graduated: !!entry.graduated,
    createdAt: entry.createdAt ? new Date(entry.createdAt).toISOString() : null,
  };
}

/* ---------------------------------------------------------
   СОЗДАТЕЛЬ ТОКЕНА И ПОДПИСКИ
   У токенов, запущенных внутри приложения, известен owner_id, значит на
   карточке можно показать, кто его сделал, и дать подписаться. Токены из
   внешней ленты (GeckoTerminal) владельца не имеют — там блок просто не
   рисуется.
--------------------------------------------------------- */

// «1 подписчик», «2 подписчика», «5 подписчиков» — в русском без
// склонения по числу выглядит неряшливо.
// Профиль по id пользователя. Кэшируем: одна и та же карточка
// открывается по многу раз, а профиль меняется редко.
const creatorCache = new Map(); // userId -> profile | null
async function fetchCreatorProfile(userId) {
  if (!userId) return null;
  if (creatorCache.has(userId)) return creatorCache.get(userId);
  const { data, error } = await supabase
    .from("profiles")
    .select("id, nickname, bio, avatar_url, emoji, frame_id, card_id, creator_tier, verified")
    .eq("id", userId)
    .maybeSingle();
  const profile = error ? null : data;
  creatorCache.set(userId, profile);
  return profile;
}

/* TokenCreatorCard — блок «создатель» на экране токена: аватарка, ник,
   описание, число подписчиков и кнопка подписки. Подписка живёт в
   таблице follows (см. supabase_follows.sql) и требует входа. */
function TokenCreatorCard({ ownerId, currentUserId, onNeedAuth, showToast, onOpenProfile }) {
  const [creator, setCreator] = useState(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let cancelled = false;
    if (!ownerId) { setLoading(false); return; }
    setLoading(true);
    fetchCreatorProfile(ownerId).then((profile) => {
      if (cancelled) return;
      setCreator(profile);
      setLoading(false);
    });
    return () => { cancelled = true; };
  }, [ownerId]);

  if (!ownerId) return null;
  if (loading && !creator) {
    return (
      <div className="rounded-[22px] p-4 flex items-center justify-center" style={{ background: T.surface, border: `1px solid ${T.line}` }}>
        <LeafLoader size={34} />
      </div>
    );
  }
  if (!creator) return null;

  return (
    <div className="rounded-[22px] p-4 flex items-center gap-3" style={{ background: T.surface, border: `1px solid ${T.line}` }}>
      {/* Аватарка с ником — переход на профиль создателя. Кнопка подписки
          рядом отдельная, чтобы не приходилось открывать профиль ради
          одного нажатия. */}
      <button
        onClick={() => onOpenProfile && onOpenProfile(ownerId)}
        className="fx-tap flex items-center gap-3 flex-1 min-w-0"
        style={{ background: "transparent", border: "none", padding: 0, textAlign: "left" }}
      >
        <TokenAvatar size={44} src={creator.avatar_url} />
        <div className="flex-1 min-w-0 flex flex-col gap-0.5">
          <span style={{ fontFamily: bodyFont, color: T.muted, fontSize: 11.5, textTransform: "uppercase", letterSpacing: "0.04em" }}>{tr("creatorLabel")}</span>
          <div className="flex items-center gap-1 min-w-0">
            <span className="truncate" style={{ fontFamily: displayFont, color: T.ice, fontSize: 15, fontWeight: 700 }}>{creator.nickname}</span>
            <CreatorWreathBadge tier={Number(creator.creator_tier) || 0} size={16} />
            <ChevronRight size={14} color={T.muted} />
          </div>
        </div>
      </button>
    </div>
  );
}

/* PublicProfileView — профиль чужого пользователя: кто он, сколько у
   него подписчиков и какие токены он запускал. Открывается по нажатию
   на создателя на карточке токена. */
function PublicProfileView({ userId: ownerId, currentUserId, onBack, onOpenToken, onNeedAuth, showToast, insetTop = 0 }) {
  const [profile, setProfile] = useState(null);
  const [tokens, setTokens] = useState([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    (async () => {
      const prof = await fetchCreatorProfile(ownerId);
      if (cancelled) return;
      setProfile(prof);

      const { data } = await supabase
        .from("tokens")
        .select("*")
        .eq("owner_id", ownerId)
        .order("created_at", { ascending: false })
        .limit(50);
      if (cancelled) return;
      setTokens(data || []);
      setLoading(false);
    })();
    return () => { cancelled = true; };
  }, [ownerId]);

  if (loading && !profile) return <PageLoader minHeight={320} />;
  if (!profile) {
    return (
      <div className="fx-view flex flex-col gap-4">
        {!hasTelegramBack() && (
          <button onClick={onBack} className="fx-tap self-start flex items-center gap-1 rounded-full px-3 py-1.5" style={{ color: T.ice, fontFamily: bodyFont, fontSize: 14.5, background: T.surface, border: `1px solid ${T.line}` }}>
            <ChevronLeft size={16} /> {tr("back")}
          </button>
        )}
        <div className="rounded-[22px] p-6 flex items-center justify-center text-center" style={{ background: T.surface, border: `1px dashed ${T.line}` }}>
          <span style={{ fontFamily: bodyFont, color: T.muted, fontSize: 14 }}>{tr("profileNotFound")}</span>
        </div>
      </div>
    );
  }

  const frame = FRAME_BY_ID[profile.frame_id] ? profile.frame_id : "none";
  const card = CARD_BY_ID[profile.card_id] ? profile.card_id : "none";
  const creatorTier = Number(profile.creator_tier) || 0;

  return (
    <div className="fx-view" style={{ position: "relative" }}>
      {/* Шапка ровно та же, что и у своего профиля: подложка во всю
          ширину и рамка вокруг аватарки. Ради этого предметы из магазина
          и покупаются — их должно быть видно со стороны. */}
      <div className="flex flex-col items-center text-center gap-2" style={{ marginTop: 10, position: "relative", zIndex: 0 }}>
        <ProfileCardBg cardId={card} height={320} radius={0} bleed={16} top={PROFILE_CARD_TOP(insetTop)} />

        {/* Кнопка занимает свою строку над аватаркой: раньше она висела
            абсолютом в углу и налезала на рамку. */}
        {!hasTelegramBack() && (
          <div className="flex" style={{ position: "relative", zIndex: 2, width: "100%", justifyContent: "flex-start", marginBottom: 6 }}>
            <button onClick={onBack} className="fx-tap flex items-center gap-1 rounded-full px-3 py-1.5" style={{ background: T.surface, border: `1px solid ${T.line}`, fontFamily: bodyFont, fontSize: 14.5, color: T.ice }}>
              <ChevronLeft size={16} /> {tr("back")}
            </button>
          </div>
        )}

        <div style={{ position: "relative", zIndex: 1, lineHeight: 0 }}>
            <AvatarFrame frameId={frame} size={128}>
              <div style={{
                width: "100%", height: "100%", borderRadius: "50%",
                background: profile.avatar_url ? `center/cover no-repeat url(${profile.avatar_url})` : T.surfaceHi,
                border: frame === "none" ? `2px solid ${T.lineHi}` : "none",
                display: "flex", alignItems: "center", justifyContent: "center", fontSize: 52,
              }}>
                {!profile.avatar_url && (profile.emoji || <User size={40} color={T.muted} />)}
              </div>
            </AvatarFrame>
        </div>

        <div className="flex flex-col items-center gap-2" style={{ position: "relative", zIndex: 1, width: "100%" }}>
          <span className="flex items-center gap-1.5" style={{ fontFamily: displayFont, color: T.ice, fontSize: 20.5, fontWeight: 700, marginTop: 4 }}>
            {profile.nickname}
            <VerifiedBadge verified={!!profile.verified} size={16} />
            <CreatorWreathBadge tier={creatorTier} size={19} />
          </span>
          <p style={{ fontFamily: bodyFont, color: T.muted, fontSize: 14, maxWidth: 260, lineHeight: 1.5 }}>
            {profile.bio || tr("bioEmptyPlaceholder")}
          </p>
        </div>
      </div>

      <div className="mt-5 pb-4" style={{ position: "relative", zIndex: 1 }}>
        <SectionTitle>{tr("creatorTokens")}</SectionTitle>
        {tokens.length === 0 ? (
          <div className="rounded-[22px] p-5 flex items-center justify-center text-center" style={{ background: T.surface, border: `1px dashed ${T.line}` }}>
            <span style={{ fontFamily: bodyFont, color: T.muted, fontSize: 14 }}>{tr("creatorNoTokens")}</span>
          </div>
        ) : (
          <div className="flex flex-col gap-2">
            {tokens.map((row) => (
              <button
                key={row.id}
                onClick={() => onOpenToken(row)}
                className="fx-card flex items-center gap-3 rounded-[22px] w-full"
                style={{ background: T.surface, border: `1px solid ${T.line}`, padding: "12px 14px" }}
              >
                <TokenAvatar size={40} src={row.logo_url} />
                <div className="flex-1 min-w-0 flex flex-col items-start">
                  <span className="truncate" style={{ fontFamily: displayFont, color: T.ice, fontSize: 14.5, fontWeight: 700 }}>${row.ticker}</span>
                  <span className="truncate" style={{ fontFamily: bodyFont, color: T.muted, fontSize: 12.5 }}>{row.name}</span>
                </div>
                <ChevronRight size={16} color={T.muted} />
              </button>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}

/* ---------------------------------------------------------
   КОСМЕТИКА: рамки для аватарки и карточки-подложки профиля.
   Каталоги — обычные данные, чтобы добавить новый предмет можно было
   одной строкой, без правок в рендере. Всё рисуется CSS-градиентами и
   трансформами: никаких картинок, значит ничего не грузится по сети и
   тема (Dark/White) не ломает предметы.
--------------------------------------------------------- */

// Подписи предметов лежат прямо в каталоге, а не в общем словаре —
// их много и они нужны только здесь.
function pickLabel(obj) {
  if (!obj) return "";
  return obj[lang] || obj.RU || "";
}

const AVATAR_FRAMES = [
  { id: "none", label: { RU: "Без рамки", EN: "No frame" } },
  {
    // Не оранжевое кольцо, а тлеющий уголь: жар по кольцу дышит
    // вразнобой, и с него срываются искры, которые гаснут на лету.
    id: "ember", label: { RU: "Уголёк", EN: "Ember" }, price: 120,
    // Кольцо толще прочих: под ним не полоска цвета, а корка прогоревших
    // углей, и трещинам между ними нужна ширина.
    ring: 0.075,
    // Снизу — сама лава: от белого жара к тёмно-багровому, чтобы сквозь
    // разрывы корки было видно разную температуру.
    colors: ["#FF7A18", "#FFD08A", "#FF3B00", "#8E1400", "#FF7A18"], spin: 9, glow: "#FF4D0A",
    heat: { color: "#FFC46B", dur: 2.4 },
    rise: { count: 7, color: "#FF8A3D", dur: 2.8 },
    // Корка: тёмная порода кладётся поверх лавы рваными пятнами, и там,
    // где её нет, остаются светящиеся трещины.
    crust: {
      color: "#140B09", edge: "#FF6A1A",
      // Два слоя породы: крупные куски и мелкий щебень поверх, каждый
      // со своей скоростью — так корка не выглядит одним узором.
      layers: [
        { freq: 0.055, seed: 11, dur: 38, порог: [4.6, -1.5] },
        { freq: 0.14, seed: 3, dur: 27, порог: [3.6, -1.55], opacity: 0.9, reverse: true },
      ],
    },
    // Огонь: мелкая частая рябь на быстром повороте — язычки пламени
    // бегут по кромке.
    warp: {
      colors: ["#FFE3B0", "#FF6B35", "#7A1B00"],
      layers: [
        { scale: 6, dur: 9, width: 5, opacity: 0.9, seed: 5, freq: 0.06 },
        { scale: 10, dur: 17, width: 2.4, opacity: 0.5, seed: 21, freq: 0.09, reverse: true },
      ],
    },
  },
  {
    // Сияние — не полоса цвета, а занавеси, которые идут одна сквозь
    // другую. Поэтому поверх кольца ещё два размытых слоя: разные
    // скорости и встречные направления дают ту самую переливчатость.
    id: "aurora", label: { RU: "Полярное сияние", EN: "Aurora" }, price: 180,
    colors: ["#38D39F", "#2E6BFF", "#B14CFF", "#38D39F"], spin: 11, glow: "#2E6BFF",
    // Тонкое светлое ядро поверх цветного кольца. У настоящего сияния
    // самая яркая часть — узкая кромка, а цвет расходится от неё; без
    // ядра кольцо читается просто широкой цветной полосой.
    core: { color: "#DCF3FF", width: 0.3, opacity: 0.85 },
    // Занавеси наружу — то, чем сияние отличается от любого другого
    // свечения: свет не окружает кольцо ровным ореолом, а вырывается
    // вверх полосами разной длины и цвета.
    streamers: {
      colors: ["#38D39F", "#7CE3FF", "#2E6BFF", "#B14CFF"],
      count: 18, dur: 26, length: 0.42, width: 5,
    },
    // Кольцо тоньше обычного: у сияния свет живёт снаружи, а само оно —
    // узкая яркая кромка. Широкое кольцо съедало бы занавеси.
    ring: 0.028,
    curtains: [
      { colors: ["rgba(56,211,159,0)", "#7CE3FF", "rgba(46,107,255,0)", "#B14CFF", "rgba(56,211,159,0)"], dur: 7, blur: 3, opacity: 0.55 },
      { colors: ["rgba(177,76,255,0)", "#38D39F", "rgba(124,227,255,0)", "#2E6BFF", "rgba(177,76,255,0)"], dur: 17, blur: 5, opacity: 0.4, reverse: true },
    ],
    // Сияние: крупная медленная волна — занавесь колышется целиком, а
    // не дрожит по краю.
    warp: {
      colors: ["#7CE3FF", "#38D39F", "#B14CFF"],
      layers: [
        { scale: 14, dur: 26, width: 5, opacity: 0.75, seed: 9, freq: 0.014 },
        { scale: 20, dur: 40, width: 2.6, opacity: 0.45, seed: 31, freq: 0.02, reverse: true },
      ],
    },
  },
  {
    // Металл, а не жёлтая полоска: фаска по внутреннему краю даёт
    // толщину, а узкий блик, обегающий кольцо, — полировку.
    id: "gold", label: { RU: "Золото", EN: "Gold" }, price: 260,
    colors: ["#7A5B15", "#FFE9A8", "#C9A227", "#FFF6D5", "#7A5B15"], spin: 13, glow: "#FFD86B",
    metal: { bevel: "#3A2A08", shine: "#FFF6D5", dur: 4.2 },
    // Тонкий ободок снаружи — как вторая грань полированного кольца.
    outerRing: { color: "#FFD86B", opacity: 0.35, gap: 1.6 },
    // Пыль и искры вокруг. Полированное золото на чёрном без них
    // выглядит нарисованным кругом: блеск читается по тому, что вокруг
    // него что-то светится, а не по самому кольцу.
    sparks: { color: "#FFF0C0", dust: "#FFD86B", stars: 3, count: 26, dur: 6 },
    // Расплавленное золото: волна крупная, но очень медленная — тяжёлый
    // металл течёт, а не колышется.
    warp: {
      colors: ["#FFF6D5", "#FFD86B", "#7A5B15"],
      layers: [
        { scale: 7, dur: 34, width: 6, opacity: 0.9, seed: 13, freq: 0.02 },
      ],
    },
  },
  {
    // Лёд — это грани. По кольцу нарастают короткие иглы инея, каждая
    // вспыхивает в свой черёд: серое кольцо само по себе читалось
    // просто как металл потусклее.
    id: "ice", label: { RU: "Лёд", EN: "Ice" }, price: 200,
    colors: ["rgba(255,255,255,0.12)", "#FFFFFF", "rgba(255,255,255,0.12)", "#9FD8FF", "rgba(255,255,255,0.12)"],
    spin: 16, glow: "#9FD8FF",
    frost: { count: 9, color: "#DCF2FF", dur: 3.6 },
    // Лёд — это грани, а не гладкая окружность: кольцо набрано из
    // неровных кусков, и по стыкам идёт свет.
    facets: { count: 14, fill: "#7FC8FF", edge: "#EAF7FF", opacity: 0.4 },
    sparks: { color: "#EAF7FF", dust: "#9FD8FF", stars: 2, count: 16, dur: 5 },
    // Лёд: шум с изломами вместо плавного — край получается колючим, а
    // не волнистым. И почти неподвижным: лёд не течёт.
    warp: {
      colors: ["#FFFFFF", "#9FD8FF", "#2B4A63"],
      layers: [
        { scale: 5, dur: 60, width: 4.5, opacity: 0.32, seed: 7, freq: 0.05, type: "turbulence", octaves: 2 },
      ],
    },
  },
  {
    // Не точки по кругу, а настоящая орбита: два наклонённых эллипса,
    // по каждому идёт своё тело — и одно уходит за аватарку, другое
    // проходит перед ней. Кольцо под ними почти не видно, вся рамка
    // держится на этом движении.
    id: "orbit", label: { RU: "Орбита", EN: "Orbit" }, price: 240,
    colors: ["rgba(255,255,255,0.05)", "rgba(255,255,255,0.22)", "rgba(255,255,255,0.05)"],
    spin: 26, glow: "#FF6B35",
    orbit: {
      color: "#FF6B35",
      // flare — период вспышки на этой линии. Периоды несоразмерны
      // (3.7 и 5.3), поэтому извержения никогда не совпадают: рамка не
      // мигает целиком, а живёт вразнобой, как поверхность звезды.
      rings: [
        { tilt: -20, squash: 0.36, dur: 6.5, size: 2.6, trail: true, flare: 3.7 },
        { tilt: 38, squash: 0.24, dur: 10, size: 2, trail: true, flare: 5.3 },
      ],
    },
  },
  {
    // Были шесть звёздочек, приклеенных к краю, — они и мигали на
    // месте. Теперь искры срываются с кольца и гаснут на лету, а
    // звёздочки остались редкой подсветкой.
    id: "spark", label: { RU: "Искры", EN: "Sparks" }, price: 300,
    colors: ["rgba(255,255,255,0.08)", "#FFFFFF", "rgba(255,255,255,0.25)", "#CFE8FF", "rgba(255,255,255,0.08)"],
    spin: 24, glow: "#FFFFFF", sparks: 4,
    burst: { count: 8, color: "#FFFFFF", dur: 1.9 },
    // Разряд: мелкий частый излом на быстром повороте — кромка дрожит,
    // как дуга между контактами.
    warp: {
      colors: ["#FFFFFF", "#CFE8FF", "#3A4A5C"],
      layers: [
        { scale: 5, dur: 6, width: 3.4, opacity: 0.85, seed: 11, freq: 0.12, type: "turbulence", octaves: 2 },
      ],
    },
  },
  {
    // Кислота: со дна кольца поднимаются пузыри, а снизу срывается
    // капля. Без этого рамка была просто зелёной.
    id: "toxic", label: { RU: "Токсик", EN: "Toxic" }, price: 260,
    colors: ["#0F3D2A", "#5BFF9F", "#0F3D2A", "#B6FF3D", "#0F3D2A"], spin: 6, glow: "#5BFF9F",
    rise: { count: 4, color: "#B6FF3D", dur: 3.4, hollow: true },
    drip: { count: 2, color: "#5BFF9F", dur: 4.6 },
    // Слизь: крупная тягучая волна — край оплывает, а не рябит.
    warp: {
      colors: ["#B6FF3D", "#5BFF9F", "#0F3D2A"],
      layers: [
        { scale: 13, dur: 19, width: 6, opacity: 0.85, seed: 3, freq: 0.022 },
        { scale: 18, dur: 31, width: 2.6, opacity: 0.4, seed: 27, freq: 0.035, reverse: true },
      ],
    },
  },
  // Дальше — рамки со своим устройством, а не просто с другим набором
  // цветов: у каждой добавлен слой, которого нет у остальных.
  {
    // Голова с хвостом бежит по кольцу. Хвост — конический градиент,
    // который к голове разгорается; сама голова отдельной точкой, иначе
    // на тонком кольце она не читается.
    // Ядро с двойным хвостом: длинный холодный след по самому кольцу и
    // короткие искры, отстающие от головы. Голова разгорается и гаснет
    // на витке — комета не просто ездит по кругу, а горит.
    id: "comet", label: { RU: "Комета", EN: "Comet" }, price: 320,
    colors: ["rgba(255,255,255,0.04)", "rgba(255,255,255,0.14)", "rgba(255,255,255,0.04)"],
    spin: 28, glow: "#7CE3FF",
    comet: { color: "#7CE3FF", dur: 3.4, embers: 5, flare: true },
  },
  {
    // Пунктирная дуга поверх кольца: короткие штрихи бегут быстрее
    // самого кольца, и получается разряд, а не вращение.
    id: "plasma", label: { RU: "Плазма", EN: "Plasma" }, price: 320,
    colors: ["#2A0A3D", "#B14CFF", "#2A0A3D", "#2E6BFF", "#2A0A3D"], spin: 9, glow: "#B14CFF",
    // Два ряда штрихов навстречу друг другу: один разряд читается как
    // вращение, встречные — как пробой.
    dashes: { color: "#E6C8FF", dur: 2.8 },
    dashes2: { color: "#7CB0FF", dur: 1.6, reverse: true },
    // Пробой: самый мелкий и рваный край из всех, на быстром повороте.
    warp: {
      colors: ["#E6C8FF", "#B14CFF", "#2E6BFF"],
      layers: [
        { scale: 6, dur: 7, width: 3.2, opacity: 0.8, seed: 17, freq: 0.14, type: "turbulence", octaves: 2 },
      ],
    },
  },
  {
    // Листья с фона приложения, только облетают аватарку по кругу и
    // покачиваются на ходу.
    // Листья теперь не просто едут по кругу: каждый крутится вокруг себя,
    // покачивается и меняет размер на витке — то ближе, то дальше. Пород
    // три, и у каждой свой оттенок, как на фоне приложения.
    id: "leafring", label: { RU: "Листопад", EN: "Leaf fall" }, price: 280,
    colors: ["rgba(56,211,159,0.08)", "rgba(56,211,159,0.38)", "rgba(91,255,159,0.18)", "rgba(56,211,159,0.08)"],
    spin: 22, glow: "#38D39F",
    leafFall: { count: 6, colors: ["#5BFF9F", "#38D39F", "#9BFFC7"] },
  },
  {
    // Первая рамка, у которой край — не окружность. Кольцо пропущено
    // через застывший шум и медленно поворачивается: неровности едут по
    // краю, и получается язык пламени, а не вращение картинки. Шум
    // считается один раз — движение даёт поворот, а не пересчёт.
    id: "magma", label: { RU: "Магма", EN: "Magma" }, price: 460,
    colors: ["#2A0A00", "#FF3D00", "#FFC46B", "#FF6B35", "#2A0A00"],
    spin: 34, glow: "#FF5A1F",
    warp: {
      colors: ["#FFE3B0", "#FF6B35", "#7A1B00"],
      layers: [
        { scale: 9, dur: 15, width: 7, opacity: 0.95, seed: 3, freq: 0.03 },
        { scale: 15, dur: 26, width: 3.5, opacity: 0.55, seed: 17, freq: 0.05, reverse: true },
      ],
    },
    rise: { count: 6, color: "#FFB061", dur: 2.6 },
  },
  {
    // Радуга по кольцу и белый блик, который проходит по ней насквозь.
    id: "prism", label: { RU: "Призма", EN: "Prism" }, price: 400,
    colors: ["#FF3D6E", "#FFC46B", "#5BFF9F", "#2E6BFF", "#B14CFF", "#FF3D6E"],
    spin: 15, glow: "#B14CFF", sweep: true,
    // Расслоение цвета: тот же радужный круг двумя тонкими копиями,
    // сдвинутыми по фазе, — как свет, разложенный на краях стекла.
    chroma: [{ dur: 21, opacity: 0.5 }, { dur: 9, opacity: 0.35, reverse: true }],
    // Стекло: край гуляет медленно и по-разному у каждого цвета — от
    // этого по кромке идёт расслоение, как в настоящей призме.
    warp: {
      layers: [
        { scale: 9, dur: 23, width: 4, opacity: 0.7, seed: 4, freq: 0.026, colors: ["#FF3D6E", "#FFC46B", "#5BFF9F"] },
        { scale: 12, dur: 33, width: 3, opacity: 0.6, seed: 19, freq: 0.03, reverse: true, colors: ["#2E6BFF", "#B14CFF", "#FF3D6E"] },
      ],
    },
  },
  {
    // Кольца расходятся наружу — но не мерным метрономом, а ударом
    // сердца: сильная волна, слабая следом, пауза.
    id: "pulse", label: { RU: "Пульс", EN: "Pulse" }, price: 240,
    colors: ["rgba(56,211,159,0.14)", "#38D39F", "rgba(56,211,159,0.14)"],
    spin: 18, glow: "#38D39F", waves: 3, beat: true,
  },
  {
    // Почти чёрное кольцо с одной раскалённой дугой и широким ореолом:
    // видно только край, будто из-за него что-то светит.
    id: "eclipse", label: { RU: "Затмение", EN: "Eclipse" }, price: 360,
    colors: ["#08080C", "#08080C", "#FFE9A8", "#FF6B35", "#08080C", "#08080C"],
    spin: 24, glow: "#FF9A3D", halo: true,
    // Корона: лучи по кругу дышат вразнобой, поэтому свет из-за края
    // виден даже там, где сама раскалённая дуга уже прошла.
    corona: { count: 14, color: "#FFB061", dur: 4.4 },
    // Кромка солнца за диском: медленная крупная волна, только самый
    // край и раскалён.
    warp: {
      colors: ["#FFE9A8", "#FF9A3D", "#08080C"],
      layers: [
        { scale: 10, dur: 29, width: 4.5, opacity: 0.85, seed: 23, freq: 0.024 },
      ],
    },
  },
];

/* Поле лавы для карточки «Магма».
 *
 * Плиты выкладываются сеткой с перспективой: у горизонта мелкие и
 * узкие, к низу крупнее и шире. Так рисунок читается поверхностью,
 * уходящей вдаль, — а не набором линий. Восемь крупных многоугольников
 * до этого давали ровно то, чего не хотелось: на большой карточке от
 * плиты видно только пару длинных рёбер.
 *
 * Узлы сетки общие у соседних плит, поэтому щелей между ними нет; они
 * же сдвинуты случайно — иначе поле выглядит кафелем. Разброс считается
 * один раз от самого предмета, чтобы рисунок не прыгал.
 */
function magmaField(seedKey) {
  const rnd = seededRand(hashSeed(seedKey));
  const РЯДЫ = 7;
  const СТОЛБЦЫ = 9;
  // Горизонт держим примерно на середине. Без него поле перестаёт быть
  // полом: плиты растягиваются по всей высоте и читаются плоской сеткой
  // на стене — глубина пропадает. Всё, что выше, добирается небом и
  // заревом, поэтому фон всё равно занят целиком.
  const ГОРИЗОНТ = 52;
  const узлы = [];
  for (let r = 0; r <= РЯДЫ; r++) {
    const t = r / РЯДЫ;
    // Ряды сгущаются к горизонту: равномерные читаются лестницей.
    const глубина = Math.pow(t, 1.8);
    const y = ГОРИЗОНТ + (104 - ГОРИЗОНТ) * глубина;
    // Чем ближе, тем шире расходятся столбцы — это и даёт перспективу.
    const ширина = 40 + 96 * глубина;
    const шаг = ширина / СТОЛБЦЫ;
    const ряд = [];
    for (let c = 0; c <= СТОЛБЦЫ; c++) {
      const x = 50 + (c / СТОЛБЦЫ - 0.5) * ширина + (rnd() - 0.5) * шаг * 0.55;
      ряд.push([x, y + (rnd() - 0.5) * (4 + глубина * 7)]);
    }
    узлы.push(ряд);
  }

  const плиты = [];
  for (let r = 0; r < РЯДЫ; r++) {
    for (let c = 0; c < СТОЛБЦЫ; c++) {
      const углы = [узлы[r][c], узлы[r][c + 1], узлы[r + 1][c + 1], узлы[r + 1][c]];
      const глубина = (r + 1) / РЯДЫ;
      плиты.push({
        d: углы.map(([x, y], i) => `${i ? "L" : "M"}${x.toFixed(1)},${y.toFixed(1)}`).join(" ") + " Z",
        // Ближние плиты горячее: вверху порода остыла до черноты.
        жар: 0.16 + Math.pow(глубина, 1.3) * 0.84,
        dur: 4.5 + rnd() * 4,
        delay: -rnd() * 7,
      });
    }
  }
  return плиты;
}

const PROFILE_CARDS = [
  { id: "none", label: { RU: "Без карточки", EN: "No card" } },
  {
    id: "grid", label: { RU: "Сетка", EN: "Grid" }, price: 80,
    base: "linear-gradient(180deg, rgba(255,255,255,0.05), rgba(255,255,255,0))",
    grid: "rgba(255,255,255,0.10)", floor: true,
  },
  {
    id: "night", label: { RU: "Ночь", EN: "Night" }, price: 140,
    base: "linear-gradient(180deg, #101A3A 0%, #0A0A14 70%, rgba(0,0,0,0) 100%)",
    stars: 26,
  },
  {
    id: "emberCard", label: { RU: "Жар", EN: "Heat" }, price: 160,
    base: "linear-gradient(180deg, rgba(255,107,53,0.30) 0%, rgba(255,61,0,0.08) 55%, rgba(0,0,0,0) 100%)",
    blobs: [["#FF6B35", 0.35], ["#FFB35C", 0.22]],
  },
  {
    id: "auroraCard", label: { RU: "Сияние", EN: "Aurora" }, price: 200,
    base: "linear-gradient(180deg, rgba(46,107,255,0.22) 0%, rgba(177,76,255,0.12) 50%, rgba(0,0,0,0) 100%)",
    blobs: [["#2E6BFF", 0.4], ["#B14CFF", 0.3], ["#38D39F", 0.22]],
  },
  {
    id: "mint", label: { RU: "Мята", EN: "Mint" }, price: 160,
    base: "linear-gradient(180deg, rgba(56,211,159,0.26) 0%, rgba(56,211,159,0.05) 60%, rgba(0,0,0,0) 100%)",
    grid: "rgba(56,211,159,0.16)",
  },
  {
    id: "sunset", label: { RU: "Закат", EN: "Sunset" }, price: 240,
    base: "linear-gradient(180deg, #FF6B35 0%, #B14CFF 45%, rgba(0,0,0,0) 100%)",
    floor: true, grid: "rgba(255,255,255,0.16)",
  },
  {
    // Корка из плит: тёмные грани с раскалёнными швами между ними —
    // тот же приём, что у кейса, только развёрнутый на всю карточку.
    // Рисунок не случайный: плиты выложены руками, низ забит породой,
    // верх оставлен пустым под аватарку и ник. Случайная сетка трещин
    // получалась паутиной поверх текста.
    id: "magmaCard", label: { RU: "Магма", EN: "Magma" }, price: 380,
    // Не подложка с узором, а сцена: вулканический пейзаж, а на нём —
    // сущность из обсидиана, внутри которой течёт магма. Аватарка
    // приходится ей на голову, поэтому плечи и разведены в стороны.
    base: "linear-gradient(180deg, #0B0406 0%, #1A0709 38%, #3B0A0A 72%, #6B1414 100%)",
    magma: {
      stone: "#0C0508",     // обсидиан
      bordo: "#4A0E0E",     // тень в породе
      seam: "#FF4D14",      // раскалённая трещина
      hot: "#FFD27A",       // золото в жерле
    },
    obsidian: { edge: "#FF6B35", stone: "#08060A" },
    rise: 12, riseColor: "#FF8A2D",
    smoke: 3,
  },
  {
    id: "meteor", label: { RU: "Метеоры", EN: "Meteors" }, price: 220,
    base: "linear-gradient(180deg, #12163A 0%, #0A0A14 68%, rgba(0,0,0,0) 100%)",
    streaks: 7, streakColor: "#9FD8FF", stars: 16,
  },
  {
    id: "wave", label: { RU: "Волны", EN: "Waves" }, price: 220,
    base: "linear-gradient(180deg, rgba(12,26,48,0.92) 0%, rgba(0,0,0,0) 100%)",
    waves: [["#2E6BFF", 0.36], ["#38D39F", 0.26], ["#B14CFF", 0.22]],
  },
  {
    id: "sparkCard", label: { RU: "Искры", EN: "Sparks" }, price: 200,
    base: "linear-gradient(180deg, rgba(255,107,53,0.24) 0%, rgba(255,61,0,0.06) 60%, rgba(0,0,0,0) 100%)",
    rise: 16, riseColor: "#FFB35C",
  },
  {
    id: "leafCard", label: { RU: "Листопад", EN: "Leaf fall" }, price: 240,
    base: "linear-gradient(180deg, rgba(56,211,159,0.20) 0%, rgba(255,107,53,0.07) 55%, rgba(0,0,0,0) 100%)",
    cardLeaves: 9, leafColor: "#5BFF9F",
  },
  {
    id: "beam", label: { RU: "Лучи", EN: "Beams" }, price: 220,
    base: "linear-gradient(180deg, rgba(177,76,255,0.22) 0%, rgba(0,0,0,0) 75%)",
    beams: 4, beamColor: "#C9A0FF", grid: "rgba(177,76,255,0.14)",
  },
  {
    id: "holoCard", label: { RU: "Голограмма", EN: "Hologram" }, price: 300,
    base: "linear-gradient(180deg, rgba(255,255,255,0.05) 0%, rgba(0,0,0,0) 70%)",
    holo: true,
  },
];

const FRAME_BY_ID = Object.fromEntries(AVATAR_FRAMES.map(f => [f.id, f]));
const CARD_BY_ID = Object.fromEntries(PROFILE_CARDS.map(c => [c.id, c]));

/* Знак создателя — лавровый венок за капитализацию своего токена.

   Ступени: 1 — контур ($1K), 2 — заливка ($10K), 3 — заливка со звездой
   и свечением ($100K). Цифру внутрь не ставим: рядом с ником знак живёт
   в 16–20px, и любой текст там превращается в кашу — уровень читается
   по заливке и звезде.

   Венок рисуется из двух веток по пять листиков. Листики расставлены по
   дуге и к концу ветки мельчают — так растёт настоящий лавр, и без этого
   венок выглядит штампованным. */
const WREATH_LEAVES = 5;
const WREATH_FROM = 34;   // угол первого листика от вертикали
const WREATH_TO = 152;    // угол последнего — ветка почти смыкается внизу

function wreathLeafPositions() {
  const out = [];
  for (const side of [-1, 1]) {
    for (let i = 0; i < WREATH_LEAVES; i++) {
      const a = WREATH_FROM + ((WREATH_TO - WREATH_FROM) * i) / (WREATH_LEAVES - 1);
      out.push({ side, deg: side * a, scale: 1 - i * 0.09, i });
    }
  }
  return out;
}
const WREATH_POS = wreathLeafPositions();

/* Ветер не дует по расписанию: у каждого листа своя длительность и своя
   фаза. Задержка отрицательная — иначе первые секунды все листья стоят
   ровно и трогаются разом, что и выглядит как рывок. */
function wreathSwayTime(p) {
  return `${(4.9 + p.i * 0.63 + (p.side > 0 ? 0.42 : 0)).toFixed(2)}s`;
}
function wreathSwayDelay(p) {
  return `${-(p.i * 1.37 + (p.side > 0 ? 0.81 : 0)).toFixed(2)}s`;
}

// Дуга самой ветки — от первого листика к последнему.
function wreathBranchPath(side) {
  const cx = 30, cy = 32, r = 17;
  const p = (deg) => {
    const a = (deg * Math.PI) / 180;
    return [cx + side * r * Math.sin(a), cy - r * Math.cos(a)];
  };
  const [x1, y1] = p(WREATH_FROM);
  const [x2, y2] = p(WREATH_TO);
  return `M${x1} ${y1} A ${r} ${r} 0 0 ${side > 0 ? 1 : 0} ${x2} ${y2}`;
}

function starPath(cx, cy, r) {
  let d = "";
  for (let i = 0; i < 5; i++) {
    const ao = ((i * 72 - 90) * Math.PI) / 180;
    const ai = ((i * 72 - 54) * Math.PI) / 180;
    d += `${i ? "L" : "M"}${cx + r * Math.cos(ao)} ${cy + r * Math.sin(ao)} `;
    d += `L${cx + r * 0.45 * Math.cos(ai)} ${cy + r * 0.45 * Math.sin(ai)} `;
  }
  return d + "Z";
}

const CreatorWreath = React.memo(function CreatorWreath({ tier = 0, size = 20, animate = true }) {
  if (!tier) return null;
  const filled = tier >= 2;
  const fill = filled ? T.electric : "none";
  const glow = tier >= 3 ? `drop-shadow(0 0 ${Math.max(3, size * 0.09)}px ${hexA(T.electric, 0.85)})` : "none";
  return (
    <svg
      width={size} height={size} viewBox="0 0 60 60"
      style={{ display: "block", overflow: "visible", filter: glow, flexShrink: 0 }}
      aria-hidden="true"
    >
      {[-1, 1].map((side) => (
        <path
          key={side} d={wreathBranchPath(side)} fill="none"
          stroke={T.electric} strokeWidth={1.6} strokeLinecap="round" opacity={0.85}
        />
      ))}
      {WREATH_POS.map((p, idx) => (
        // Качание висит на отдельной обёртке: css-свойство transform
        // перебивает одноимённый атрибут целиком, и анимация прямо на
        // этой группе сбила бы весь разворот листика по дуге.
        <g key={idx} transform={`rotate(${p.deg} 30 32) translate(30 15) rotate(${p.side * -26})`}>
          <g style={animate ? {
            transformBox: "fill-box", transformOrigin: "50% 100%",
            animation: `wreathSway ${wreathSwayTime(p)} ease-in-out ${wreathSwayDelay(p)} infinite`,
          } : undefined}>
            <g transform={`scale(${p.scale})`}>
              <path
                d="M0 0 C 4.2 -2.6 5 -7.4 0 -12 C -5 -7.4 -4.2 -2.6 0 0 Z"
                fill={fill} stroke={filled ? "none" : T.electric} strokeWidth={1.5} strokeLinejoin="round"
              />
              <path d="M0 -0.6 L0 -11" stroke={filled ? T.bg : T.electric} strokeWidth={0.9} opacity={filled ? 0.45 : 0.9} />
            </g>
          </g>
        </g>
      ))}
      {tier >= 3 && (
        <path
          d={starPath(30, 6.5, 6)} fill={T.electric}
          style={animate ? {
            transformBox: "fill-box", transformOrigin: "50% 50%",
            animation: "wreathStar 4.5s ease-in-out infinite",
          } : undefined}
        />
      )}
    </svg>
  );
});

/* Венок вокруг аватарки — из настоящих листьев с фона.

   Рядом с ником знак живёт в 16–20px, там нужен простой силуэт, а вот
   вокруг аватарки места хватает на клён, дуб и мяту со всеми прожилками.
   Какой из трёх — выбирается в магазине, поэтому вид приходит снаружи. */
const WREATH_LEAF_KINDS = [
  // Порядок важен: номер в этом списке и есть то, что лежит в профиле.
  { id: "mix", leaf: -1, label: { RU: "Все три", EN: "All three" } },
  { id: "maple", leaf: 0, label: { RU: "Клён", EN: "Maple" } },
  { id: "oak", leaf: 1, label: { RU: "Дуб", EN: "Oak" } },
  { id: "mint", leaf: 2, label: { RU: "Мята", EN: "Mint" } },
];
const WREATH_LEAF_BY_ID = Object.fromEntries(WREATH_LEAF_KINDS.map((k) => [k.id, k]));

// Расстановка та же, что у малого знака: пять листьев на ветку по дуге,
// к верхнему разрыву мельчают. Размеры — в единицах картинки 200×200.
const WREATH_BIG_R = 62;
function wreathBigBranchPath(side) {
  const cx = 100, cy = 100, r = WREATH_BIG_R;
  const p = (deg) => {
    const a = (deg * Math.PI) / 180;
    return [cx + side * r * Math.sin(a), cy - r * Math.cos(a)];
  };
  const [x1, y1] = p(WREATH_FROM);
  const [x2, y2] = p(WREATH_TO);
  return `M${x1} ${y1} A ${r} ${r} 0 0 ${side > 0 ? 1 : 0} ${x2} ${y2}`;
}

const AvatarWreathArt = React.memo(function AvatarWreathArt({ tier = 0, kindId = "mix", size = 200, animate = true }) {
  const glowId = React.useId();
  if (!tier) return null;
  // Вид листа берётся на каждый листик отдельно: в смешанном венке они
  // чередуются клён — дуб — мята, причём по номеру места на ветке, так
  // что левая и правая половины остаются зеркальными.
  const pick = (WREATH_LEAF_BY_ID[kindId] || WREATH_LEAF_KINDS[0]).leaf;
  const leafAt = (i) => LEAF_KINDS[pick < 0 ? i % LEAF_KINDS.length : pick];
  const filled = tier >= 2;
  const veinColor = filled ? T.bg : T.electric;

  // Сам венок — без черенков: они торчали внутрь и ложились палками на
  // аватарку. Лист крепится прямо к ветке, этого достаточно.
  const renderBody = (moving) => (
    <>
      {[-1, 1].map((side) => (
        <path
          key={side} d={wreathBigBranchPath(side)} fill="none"
          stroke={T.electric} strokeWidth={2.6} strokeLinecap="round" opacity={0.8}
        />
      ))}
      {WREATH_POS.map((p, idx) => {
        const kind = leafAt(p.i);
        return (
          <g key={idx} transform={`rotate(${p.deg} 100 100) translate(100 ${100 - WREATH_BIG_R})`}>
            <g style={moving ? {
              transformBox: "fill-box", transformOrigin: "50% 100%",
              animation: `wreathSway ${wreathSwayTime(p)} ease-in-out ${wreathSwayDelay(p)} infinite`,
              willChange: "transform",
            } : undefined}>
              <g transform={`rotate(${p.side * -14}) scale(${(1.12 * p.scale).toFixed(3)})`}>
                <path d={kind.outline} fill={filled ? T.electric : "none"} stroke={T.electric} strokeWidth={filled ? 0.8 : 1.5} strokeLinejoin="round" />
                {kind.veins.map((v, vi) => (
                  <path key={vi} d={v} fill="none" stroke={veinColor} strokeWidth={0.8} opacity={filled ? 0.32 : 0.55} strokeLinecap="round" />
                ))}
              </g>
            </g>
          </g>
        );
      })}
      {tier >= 3 && (
        <path
          d={starPath(100, 21, 19)} fill={T.electric}
          style={moving ? {
            transformBox: "fill-box", transformOrigin: "50% 50%",
            animation: "wreathStar 4.5s ease-in-out infinite",
          } : undefined}
        />
      )}
    </>
  );

  return (
    <svg
      width={size} height={size} viewBox="0 0 200 200"
      style={{ display: "block", overflow: "visible" }}
      aria-hidden="true"
    >
      {/* Свечение — отдельным размытым слоем снизу, а не фильтром на всей
          картинке: drop-shadow размывал и сами листья, и венок выглядел
          мутным. Так гало есть, а края остаются острыми.

          Слой свечения намеренно неподвижен. Пока он повторял анимацию,
          браузер каждый кадр пересчитывал размытие и подгонял область
          фильтра к целым пикселям — от этого вся конструкция чуть
          подрагивала вверх-вниз. Неподвижное гало этого не делает, а на
          глаз размытое пятно и не должно качаться вместе с листьями. */}
      {tier >= 3 && (
        <>
          <defs>
            <filter id={glowId} x="-40%" y="-40%" width="180%" height="180%">
              <feGaussianBlur stdDeviation="4.5" />
            </filter>
          </defs>
          <g filter={`url(#${glowId})`} opacity={0.7} aria-hidden="true">{renderBody(false)}</g>
        </>
      )}
      {renderBody(animate)}
    </svg>
  );
});

/* Значки рядом с ником — венок создателя и подтверждение аккаунта.

   Оба объясняют себя по нажатию, поэтому окно у них одно на двоих:
   отличаются только картинкой и текстом. Значки висят и на чужих
   профилях, где догадаться об их смысле неоткуда.

   Окно уходит в портал: значок нередко лежит внутри кнопки перехода на
   профиль и внутри блоков с обрезкой. */
const WREATH_TIER_SUM = ["", "$1K", "$10K", "$100K"];

/* BadgeSheet — карточка снизу: картинка вырастает, подпись проявляется
   вместе с ней. Не впритык к краям экрана, иначе читается как обрезанная
   полоса, а не как отдельное окно. */
function BadgeSheet({ onClose, art, title, subtitle, text }) {
  if (typeof document === "undefined") return null;
  return createPortal(
    <div
      className="fx-modal-back"
      onClick={onClose}
      style={{
        position: "fixed", inset: 0, zIndex: 90, background: "rgba(0,0,0,0.8)",
        backdropFilter: "blur(4px)", display: "flex", alignItems: "flex-end",
        justifyContent: "center",
        padding: "0 12px calc(12px + var(--tg-inset-bottom, 0px))",
        paddingTop: "var(--tg-inset-top, 0px)",
      }}
    >
      <div
        onClick={(e) => e.stopPropagation()}
        style={{
          width: "100%", maxWidth: 420, background: T.surface,
          border: `1px solid ${T.lineHi}`, borderRadius: 26,
          padding: "26px 22px 22px",
          maxHeight: "100%", overflowY: "auto",
          display: "flex", flexDirection: "column", alignItems: "center", textAlign: "center",
          animation: "wreathSheetUp 340ms cubic-bezier(0.16,1,0.3,1) both",
        }}
      >
        <div style={{
          width: 160, height: 160, display: "flex", alignItems: "center", justifyContent: "center",
          animation: "wreathGrowIn 1100ms cubic-bezier(0.22,1,0.28,1) 120ms both",
        }}>
          {art}
        </div>
        <div style={{
          display: "flex", flexDirection: "column", alignItems: "center", width: "100%",
          animation: "wreathCaptionIn 520ms ease-out 160ms both",
        }}>
          <span style={{ fontFamily: displayFont, color: T.ice, fontSize: 19.5, fontWeight: 700, marginTop: 12 }}>{title}</span>
          {subtitle && (
            <span style={{ fontFamily: displayFont, color: T.electric, fontSize: 14.5, fontWeight: 700, marginTop: 2 }}>{subtitle}</span>
          )}
          <p style={{ fontFamily: bodyFont, color: T.muted, fontSize: 14, lineHeight: 1.5, marginTop: 8, maxWidth: 280 }}>{text}</p>
          <button
            onClick={onClose}
            className="fx-tap w-full rounded-[20px] py-3"
            style={{ marginTop: 18, maxWidth: 320, background: T.surfaceHi, border: `1px solid ${T.line}`, fontFamily: bodyFont, fontSize: 14.5, color: T.ice }}
          >
            {tr("wreathClose")}
          </button>
        </div>
      </div>
    </div>,
    document.body,
  );
}

/* BadgeTap — область нажатия вокруг значка. Палец толще самого значка
   (16–19px), поэтому область расширена отступом и тут же убрана
   отрицательным полем: на раскладку это не влияет. zIndex поднят —
   венок вокруг аватарки заходит своим слоем на строку с ником. */
function BadgeTap({ label, onOpen, children }) {
  return (
    <span
      role="button" tabIndex={0} aria-label={label}
      onClick={(e) => { e.stopPropagation(); e.preventDefault(); onOpen(); }}
      onKeyDown={(e) => { if (e.key === "Enter" || e.key === " ") { e.preventDefault(); onOpen(); } }}
      style={{
        display: "inline-flex", alignItems: "center", justifyContent: "center",
        cursor: "pointer", lineHeight: 0, padding: 13, margin: -13, borderRadius: 999,
        position: "relative", zIndex: 3, pointerEvents: "auto", touchAction: "manipulation",
        WebkitTapHighlightColor: "transparent",
      }}
    >
      {children}
    </span>
  );
}

function CreatorWreathBadge({ tier = 0, kindId = "mix", size = 19 }) {
  const [open, setOpen] = useState(false);
  if (!tier) return null;
  const close = (e) => { if (e) { e.stopPropagation(); e.preventDefault(); } setOpen(false); };
  return (
    <>
      <BadgeTap label={tr("wreathBadgeTitle")} onOpen={() => setOpen(true)}>
        <CreatorWreath tier={tier} size={size} />
      </BadgeTap>
      {open && (
        <BadgeSheet
          onClose={close}
          art={<AvatarWreathArt tier={tier} kindId={kindId} size={160} />}
          title={tr("wreathBadgeTitle")}
          subtitle={tr(`wreathTier${tier}`)}
          text={trf("wreathBadgeBody", { sum: WREATH_TIER_SUM[tier] || "" })}
        />
      )}
    </>
  );
}

/* VerifiedBadge — щит подтверждения. Окно то же, что у венка: человек
   уже знает, что значок можно нажать, и ждёт такого же объяснения. */
function VerifiedBadge({ verified = false, size = 16 }) {
  const [open, setOpen] = useState(false);
  if (!verified) return null;
  const close = (e) => { if (e) { e.stopPropagation(); e.preventDefault(); } setOpen(false); };
  return (
    <>
      <BadgeTap label={tr("verifiedBadgeTitle")} onOpen={() => setOpen(true)}>
        <ShieldCheck size={size} color={T.electric} />
      </BadgeTap>
      {open && (
        <BadgeSheet
          onClose={close}
          art={(
            <div style={{
              width: 132, height: 132, borderRadius: "50%",
              background: hexA(T.electric, 0.12),
              border: `1px solid ${hexA(T.electric, 0.35)}`,
              display: "flex", alignItems: "center", justifyContent: "center",
              filter: `drop-shadow(0 0 14px ${hexA(T.electric, 0.45)})`,
            }}>
              <ShieldCheck size={68} color={T.electric} />
            </div>
          )}
          title={tr("verifiedBadgeTitle")}
          text={tr("verifiedBadgeBody")}
        />
      )}
    </>
  );
}

// Ступень по лучшей капитализации своего токена. Пороги те же, что у
// достижений, — знак и достижение всегда приходят вместе.
function creatorTierOf(mcapUsd) {
  const v = Number(mcapUsd) || 0;
  if (v >= 100000) return 3;
  if (v >= 10000) return 2;
  if (v >= 1000) return 1;
  return 0;
}

/* TrustPanel — то, на что смотрят перед покупкой: сколько выпуска
   осталось у создателя и трогал ли он его вообще.

   Всё считается по цепочке. Сколько он купил при запуске, приложение
   знает из своей записи, сколько лежит сейчас — спрашивает у сети.
   Разница между этими числами и есть ответ на вопрос «продавал ли».
   У токенов, запущенных до появления этой проверки, кошелька создателя
   в записи нет — тогда честнее сказать «нет данных», чем додумывать. */
function TrustPanel({ token, testnet = false, holders = null }) {
  const [held, setHeld] = useState(undefined); // undefined — ещё грузим
  const wallet = token.creatorWallet;
  const supply = Number(token.supply) || 0;
  const bought = Number(token.buyTokens) || 0;

  useEffect(() => {
    if (!wallet || !token.address) { setHeld(null); return; }
    let cancelled = false;
    fetchJettonBalance(token.address, wallet, testnet)
      .then((b) => { if (!cancelled) setHeld(b); })
      .catch(() => { if (!cancelled) setHeld(null); });
    return () => { cancelled = true; };
  }, [wallet, token.address, testnet]);

  const pct = supply > 0 && held != null ? (held / supply) * 100 : null;
  // Порог в 1% — против пыли: остаток в несколько токенов после продажи
  // всего мешка не должен читаться как «ничего не продавал».
  const sold = held != null && bought > 0 && held < bought * 0.99;

  const rows = [];
  if (holders != null) rows.push([tr("trustHolders"), holders.toLocaleString("ru-RU"), T.ice]);
  if (bought > 0) rows.push([tr("trustCreatorBought"), `${fmtCompact(bought)} ${token.ticker ? "$" + token.ticker : ""}`, T.ice]);
  if (pct != null) rows.push([tr("trustCreatorHolds"), `${pct.toFixed(pct < 10 ? 1 : 0)}${tr("trustOfSupply")}`, pct > 20 ? T.down : T.ice]);

  return (
    <div className="rounded-[22px] p-3.5" style={{ background: T.surface, border: `1px solid ${T.line}` }}>
      <div style={{ fontFamily: displayFont, color: T.ice, fontSize: 14.5, fontWeight: 700, marginBottom: 8 }}>{tr("trustTitle")}</div>
      {rows.map(([label, value, color]) => (
        <div key={label} className="flex items-center justify-between" style={{ padding: "3px 0" }}>
          <span style={{ fontFamily: bodyFont, color: T.muted, fontSize: 13 }}>{label}</span>
          <span style={{ fontFamily: monoFont, color, fontSize: 13, fontWeight: 700 }}>{value}</span>
        </div>
      ))}
      {!wallet ? (
        <div className="flex items-center gap-1.5" style={{ marginTop: 6 }}>
          <ShieldAlert size={13} color={T.muted} />
          <span style={{ fontFamily: bodyFont, color: T.muted, fontSize: 12.5 }}>{tr("trustUnknown")}</span>
        </div>
      ) : held === undefined ? (
        <div className="fx-skeleton" style={{ width: "60%", height: 10, borderRadius: 4, marginTop: 8 }} />
      ) : (
        <div className="flex items-center gap-1.5" style={{ marginTop: 6 }}>
          {sold ? <ShieldAlert size={13} color={T.down} /> : <ShieldCheck size={13} color={T.up} />}
          <span style={{ fontFamily: bodyFont, color: sold ? T.down : T.up, fontSize: 12.5 }}>
            {sold ? tr("trustSold") : tr("trustNotSold")}
          </span>
        </div>
      )}
    </div>
  );
}

/* GraduationBar — сколько TON собрала кривая и сколько осталось до
   закрытия торгов и перехода на биржу.

   Оба числа берутся у самой кривой: цель зашита в контракт при запуске,
   и у токенов, созданных до смены настроек, она своя. Считать по
   настройкам приложения нельзя — покажем чужую цель. */
function GraduationBar({ raisedTon = 0, targetTon = 0, compact = false }) {
  if (!(targetTon > 0)) return null;
  const pct = Math.max(0, Math.min(100, (raisedTon / targetTon) * 100));
  const left = Math.max(0, targetTon - raisedTon);
  const done = left <= 0;
  if (compact) {
    return (
      // Блик по бегущему градиенту оставлен только крупной шкале: в
      // списке таких полосок два десятка, и каждая перекрашивалась
      // каждый кадр — прокрутка от этого дёргалась.
      <div style={{ height: 3, borderRadius: 2, background: T.surfaceHi, overflow: "hidden", marginTop: 6 }}>
        <div style={{ width: `${pct}%`, height: "100%", background: done ? T.up : T.electric }} />
      </div>
    );
  }
  return (
    <div className="rounded-[22px] p-3.5" style={{ background: T.surface, border: `1px solid ${T.line}` }}>
      <div className="flex items-center justify-between" style={{ marginBottom: 8 }}>
        <span style={{ fontFamily: bodyFont, color: T.muted, fontSize: 12.5 }}>{tr("gradTitle")}</span>
        <span style={{ fontFamily: monoFont, color: done ? T.up : T.ice, fontSize: 13, fontWeight: 700 }}>
          {done ? tr("gradDone") : `${pct.toFixed(0)}%`}
        </span>
      </div>
      <div style={{ height: 6, borderRadius: 3, background: T.surfaceHi, overflow: "hidden" }}>
        <div className={done ? "fx-shine-bar-up" : "fx-shine-bar"} style={{ width: `${pct}%`, height: "100%", transition: `width ${EASE}` }} />
      </div>
      <div className="flex items-center justify-between" style={{ marginTop: 7 }}>
        <span style={{ fontFamily: monoFont, color: T.muted, fontSize: 12 }}>
          {fmtTon(raisedTon)} / {fmtTon(targetTon)} TON
        </span>
        {!done && (
          <span style={{ fontFamily: bodyFont, color: T.muted, fontSize: 12 }}>{trf("gradLeft", { left: fmtTon(left) })}</span>
        )}
      </div>
      <p style={{ fontFamily: bodyFont, color: T.muted, fontSize: 12, lineHeight: 1.45, marginTop: 8 }}>
        {trf("gradNote", { target: fmtTon(targetTon) })}
      </p>
    </div>
  );
}

/* AvatarFrame — круглая рамка вокруг аватарки. Толщина считается от
   размера, чтобы предмет одинаково смотрелся и на 120px в профиле, и на
   64px в превью магазина. */
// Мемоизация не украшение: и рамка, и подложка — это десятки
// анимированных слоёв с размытием. Без неё любое обновление состояния
// приложения (например всплывающая подсказка после выбора) заставляло
// браузер заново раскладывать всю витрину, и выделение появлялось с
// заметной задержкой.
const AvatarFrame = React.memo(function AvatarFrame({ frameId, size = 120, children }) {
  const f = FRAME_BY_ID[frameId] || FRAME_BY_ID.none;
  // Толщина кольца по умолчанию одна на все рамки, но вещество бывает
  // разной толщины: корка углей на волосяной окружности не читается —
  // трещинам просто негде быть.
  const ring = Math.max(2, Math.round(size * (f.ring || 0.035)));
  // Чёрная середина лежит выше кольца явным этажом, а не просто следом
  // за ним в разметке. Кольцо крутится и из-за этого уезжает на
  // отдельный слой отрисовки, а такой слой в WebKit (в том числе внутри
  // Telegram) поднимается над соседями, у которых своего этажа нет: на
  // телефоне градиент затекал в середину, и рамка выглядела заливкой.
  const inner = (
    <div style={{ position: "absolute", inset: ring, borderRadius: "50%", overflow: "hidden", background: T.bg, zIndex: 2 }}>
      {children}
    </div>
  );

  if (f.id === "none") {
    return <div style={{ position: "relative", width: size, height: size }}>{inner}</div>;
  }

  /* На витрине рамка рисуется в 62 точки, в комментариях — в 36. Вся
     мелочь там не различима, но продолжает считаться: полтора десятка
     вещей на экране давали полторы сотни одновременных анимаций, и
     нажатия по нижнему меню начинали теряться. У мелких копий оставляем
     столько частиц, чтобы приём читался, — на глаз то же самое. */
  const крупно = size >= 84;
  const мало = (n, предел) => (крупно ? n : Math.min(n || 0, предел));

  const orbitR = size / 2 + ring * 1.5;
  // Кольцо вырезано маской: в середине у него просто нет пикселей.
  // Одной чёрной серединой поверх обойтись не вышло — на телефоне у
  // запертых предметов (там вся карточка идёт с прозрачностью) градиент
  // всё равно оказывался виден в центре. Теперь его там нет физически, и
  // чем бы ни кончилась возня с порядком слоёв, заливки не будет.
  const ringMask = `radial-gradient(circle at 50% 50%, transparent ${Math.max(0, size / 2 - ring - 0.5)}px, #000 ${Math.max(0.5, size / 2 - ring)}px)`;

  return (
    <div style={{ position: "relative", width: size, height: size }}>
      {/* дышащее свечение под рамкой; у «затмения» оно шире и ярче —
          в этом вся рамка, кольцо там почти чёрное */}
      <div style={{
        position: "absolute", inset: -ring, borderRadius: "50%",
        boxShadow: f.halo
          ? `0 0 ${size * 0.34}px ${ring * 2.4}px ${hexA(f.glow, 0.42)}`
          : `0 0 ${size * 0.18}px ${ring}px ${hexA(f.glow, 0.35)}`,
        // Мелкие копии не пульсируют: на экране их бывает полтора
        // десятка, а разницы на таком размере не видно.
        animation: крупно ? "glowPulse 3.2s ease-in-out infinite" : undefined, zIndex: 0,
      }} />
      {/* само кольцо — вращающийся конический градиент */}
      <div style={{
        position: "absolute", inset: 0, borderRadius: "50%",
        background: `conic-gradient(from 0deg, ${f.colors.join(", ")})`,
        animation: `spin360 ${f.spin}s linear infinite`,
        willChange: "transform", zIndex: 1,
        WebkitMaskImage: ringMask, maskImage: ringMask,
      }} />

      {/* Занавеси сияния: те же цвета, но размытые и на своей скорости,
          одна навстречу другой. Их наложение и даёт переливы, которых у
          одного кольца быть не может. */}
      {(крупно ? (f.curtains || []) : (f.curtains || []).slice(0, 1)).map((c, i) => (
        <div key={`cu${i}`} style={{
          position: "absolute", inset: 0, borderRadius: "50%",
          background: `conic-gradient(from ${i * 120}deg, ${c.colors.join(", ")})`,
          filter: `blur(${c.blur}px)`, opacity: c.opacity,
          animation: `spin360 ${c.dur}s linear infinite${c.reverse ? " reverse" : ""}`,
          willChange: "transform", zIndex: 1,
          WebkitMaskImage: ringMask, maskImage: ringMask,
        }} />
      ))}

      {/* Расслоение цвета у призмы. */}
      {(крупно ? (f.chroma || []) : (f.chroma || []).slice(0, 1)).map((c, i) => (
        <div key={`ch${i}`} style={{
          // Копии шире самого кольца и смещены наружу: под ним они
          // просто не видны, а по краю дают цветную кайму, как у стекла.
          position: "absolute", inset: -ring * (0.7 + i * 0.6), borderRadius: "50%",
          background: `conic-gradient(from ${i * 60}deg, ${f.colors.join(", ")})`,
          opacity: c.opacity, filter: `blur(${Math.max(1.5, ring * 0.6)}px)`,
          animation: `spin360 ${c.dur}s linear infinite${c.reverse ? " reverse" : ""}`,
          willChange: "transform", zIndex: 0,
        }} />
      ))}

      {/* Металл: тёмная фаска по внутреннему краю и узкий блик, который
          обегает кольцо. Без фаски золото выглядит наклейкой. */}
      {f.metal && (
        <>
          <div style={{
            position: "absolute", inset: ring * 0.9, borderRadius: "50%",
            boxShadow: `0 0 0 ${Math.max(1, ring * 0.28)}px ${hexA(f.metal.bevel, 0.85)}`,
            zIndex: 1,
          }} />
          <div style={{
            position: "absolute", inset: 0, borderRadius: "50%",
            background: `conic-gradient(from 0deg, transparent 0deg, transparent 300deg, ${hexA(f.metal.shine, 0.9)} 342deg, #fff 352deg, transparent 360deg)`,
            animation: `spin360 ${f.metal.dur}s linear infinite`,
            willChange: "transform", zIndex: 1,
            WebkitMaskImage: ringMask, maskImage: ringMask,
          }} />
        </>
      )}

      {/* Расплав: неровный, живущий край. Кольцо смещается застывшим
          шумом, а потом медленно поворачивается вместе с ним — бугры и
          языки едут по кромке. Пересчитывать шум на каждом кадре не
          нужно: телефон греется, а на глаз то же самое. */}
      {/* Живой край.

          Приём, на котором держалась «Магма», теперь общий: кольцо
          пропускается через застывший шум и медленно поворачивается
          вместе с ним, поэтому неровности едут по кромке. Идеальная
          окружность с точками по краю — это украшение; неровный край —
          уже вещество, и у каждой рамки оно своё: у огня мелкое и
          быстрое, у сияния крупное и медленное, у льда редкое и
          колючее.

          Шум считается один раз, движение даёт поворот — пересчитывать
          его каждый кадр телефон не обязан, а на глаз то же самое.

          Только для крупных копий. Мерил: полтора десятка таких колец на
          витрине поднимают кадр с 44 до 86 мс — вдвое, — и это ровно та
          нагрузка, из-за которой терялись нажатия. Ни область фильтра,
          ни число октав дела не меняют: дорого само их количество.
          Поэтому в плитках по 62 точки рамка остаётся прежней, а живой
          край показывается в профиле и на выигрыше из кейса. */}
      {f.warp && (крупно ? f.warp.layers : f.warp.layers.slice(0, 1)).map((L, i) => {
        // Размер в ключе: у маленьких аватарок своя копия фильтра, иначе
        // одна и та же деформация выглядела бы то грубой, то незаметной.
        const uid = `w${f.id}-${i}-${size}`;
        const цвета = L.colors || f.warp.colors;
        return (
          <svg
            key={uid} width={size} height={size} viewBox="0 0 100 100"
            style={{ position: "absolute", inset: 0, zIndex: 1, overflow: "visible", pointerEvents: "none" }}
            aria-hidden
          >
            <defs>
              {/* Область фильтра ровно под вылет кромки. Прежние минус
                  сорок пять процентов — это площадь втрое больше самой
                  рамки, и всю её браузер честно считал. Октав две:
                  третья на таком размере не видна, а стоит как первые
                  две вместе. */}
              <filter id={`f-${uid}`} x="-22%" y="-22%" width="144%" height="144%">
                <feTurbulence type={L.type || "fractalNoise"} baseFrequency={L.freq} numOctaves={L.octaves || 2} seed={L.seed} result="n" />
                <feDisplacementMap in="SourceGraphic" in2="n" scale={L.scale} xChannelSelector="R" yChannelSelector="G" />
              </filter>
              <linearGradient id={`g-${uid}`} x1="0" y1="0" x2="0.8" y2="1">
                {цвета.map((c, k) => (
                  <stop key={k} offset={`${Math.round((k / (цвета.length - 1)) * 100)}%`} stopColor={c} />
                ))}
              </linearGradient>
            </defs>
            <g style={{
              transformOrigin: "50px 50px",
              animation: `spin360 ${L.dur}s linear infinite${L.reverse ? " reverse" : ""}`,
            }}>
              <circle
                cx="50" cy="50" r={50 - L.width / 2}
                fill="none" stroke={`url(#g-${uid})`} strokeWidth={L.width}
                opacity={L.opacity} filter={`url(#f-${uid})`}
              />
            </g>
          </svg>
        );
      })}

      {/* Занавеси полярного сияния.

          Свет уходит наружу полосами, а не ровным ореолом: у каждой
          свой цвет, своя длина и своя яркость, а вся связка медленно
          поворачивается. Полосы гаснут к концу — иначе они читались бы
          спицами колеса, а не светом.

          Только для крупных копий: на витрине и в комментариях аватарки
          по 36–62 точки, там от полос остаётся цветная кайма, ради
          которой не стоит держать два десятка элементов. */}
      {f.streamers && крупно && (() => {
        const S = f.streamers;
        const вылет = size * S.length;
        const поле = size + вылет * 2;
        const ц = поле / 2;
        const r0 = size / 2 - ring * 0.4;
        // Длина каждой полосы своя, но постоянная: случай считается один
        // раз по номеру, а не заново на каждом кадре.
        const длина = (i) => вылет * (0.45 + ((Math.sin(i * 12.9898) * 43758.5453) % 1 + 1) % 1 * 0.55);
        return (
          <svg width={поле} height={поле} viewBox={`0 0 ${поле} ${поле}`}
            style={{ position: "absolute", left: -вылет, top: -вылет, zIndex: 0, pointerEvents: "none" }}
            aria-hidden
          >
            <defs>
              {S.colors.map((c, k) => (
                <linearGradient key={k} id={`au${k}-${size}`} x1="0" y1="1" x2="0" y2="0">
                  <stop offset="0%" stopColor={c} stopOpacity="0.85" />
                  <stop offset="40%" stopColor={c} stopOpacity="0.38" />
                  <stop offset="100%" stopColor={c} stopOpacity="0" />
                </linearGradient>
              ))}
            </defs>
            <g style={{
              transformOrigin: `${ц}px ${ц}px`,
              animation: `spin360 ${S.dur}s linear infinite`,
              // Размытие крупное: занавесь — это свет, а не спица. С
              // мелким размытием полосы читались колесом со спицами.
              filter: `blur(${Math.max(2.5, ring * 0.9)}px)`,
            }}>
              {Array.from({ length: S.count }, (_, i) => {
                // Углы с разбросом: строго равномерные полосы читаются
                // спицами колеса, а сияние — это неровный ряд.
                const шаг = 360 / S.count;
                const угол = шаг * i + (((Math.sin(i * 78.233) * 43758.5453) % 1 + 1) % 1 - 0.5) * шаг * 0.7;
                // Цвет по месту, а не по номеру: соседние занавеси одного
                // оттенка сливаются в одну широкую, как на небе, и по
                // кругу получается переход зелёного в голубой и дальше в
                // фиолетовый.
                const цвет = Math.floor(((угол % 360) + 360) % 360 / (360 / S.colors.length)) % S.colors.length;
                const L = длина(i);
                // Ширина тоже своя у каждой: одинаковые полосы читаются
                // разметкой, а не светом.
                const W = S.width * (0.6 + (i % 4) * 0.3);
                return (
                  // Поворот — на обёртке, мерцание — на самой полосе:
                  // в одном элементе они не уживаются, потому что стиль
                  // из анимации перебивает атрибут transform целиком, и
                  // полосы сваливаются в одну.
                  <g key={i} transform={`rotate(${угол} ${ц} ${ц})`}>
                    {/* Не прямоугольник, а расширяющаяся книзу полоса:
                        занавесь сияния шире у горизонта и сходит на нет
                        вверху. Прямые полосы одинаковой ширины и делали
                        из неё колесо со спицами. */}
                    <path
                      d={`M ${ц - W / 2} ${ц - r0} L ${ц - W * 0.16} ${ц - r0 - L} L ${ц + W * 0.16} ${ц - r0 - L} L ${ц + W / 2} ${ц - r0} Z`}
                      fill={`url(#au${цвет}-${size})`}
                      style={{
                        transformOrigin: `${ц}px ${ц}px`,
                        // Вразнобой: полосы сияния не гаснут разом, и
                        // одинаковая для всех анимация сразу выдаёт
                        // механику.
                        animation: `сияниеДышит ${(5.5 + (i % 5) * 1.7).toFixed(1)}s ease-in-out ${(i % 7) * 0.4}s infinite`,
                      }}
                    />
                  </g>
                );
              })}
            </g>
          </svg>
        );
      })()}

      {/* Светлое ядро кольца — самая яркая, самая узкая его часть. */}
      {f.core && (
        <div style={{
          position: "absolute", inset: ring * 0.35, borderRadius: "50%",
          border: `${Math.max(1, ring * f.core.width)}px solid ${hexA(f.core.color, f.core.opacity)}`,
          boxShadow: `0 0 ${ring * 2}px ${hexA(f.core.color, 0.5)}`,
          zIndex: 1,
        }} />
      )}

      {/* Жар уголька: то же кольцо, но ярче и вразнобой мерцающее. */}
      {f.heat && (
        <div style={{
          position: "absolute", inset: 0, borderRadius: "50%",
          background: `conic-gradient(from 40deg, transparent 0deg, ${hexA(f.heat.color, 0.9)} 60deg, transparent 150deg, ${hexA(f.heat.color, 0.7)} 240deg, transparent 320deg)`,
          filter: `blur(${Math.max(1, ring * 0.4)}px)`,
          animation: `frameFlicker ${f.heat.dur}s ease-in-out infinite`,
          zIndex: 1, WebkitMaskImage: ringMask, maskImage: ringMask,
        }} />
      )}

      {/* хвост кометы: к голове разгорается, за ней сходит на нет */}
      {f.comet && (
        <div style={{
          position: "absolute", inset: 0, borderRadius: "50%",
          background: `conic-gradient(from 0deg, ${hexA(f.comet.color, 0)} 0deg, ${hexA(f.comet.color, 0)} 235deg, ${hexA(f.comet.color, 0.5)} 330deg, ${f.comet.color} 357deg, ${hexA(f.comet.color, 0)} 360deg)`,
          animation: `spin360 ${f.comet.dur}s linear infinite`,
          willChange: "transform", zIndex: 1,
          WebkitMaskImage: ringMask, maskImage: ringMask,
        }} />
      )}

      {/* пунктирный разряд поверх кольца */}
      {f.dashes && (
        <svg width={size} height={size} style={{
          position: "absolute", inset: 0,
          animation: `spin360 ${f.dashes.dur}s linear infinite`, willChange: "transform", zIndex: 1,
        }} aria-hidden>
          <circle
            cx={size / 2} cy={size / 2} r={size / 2 - ring / 2}
            fill="none" stroke={f.dashes.color} strokeWidth={ring * 0.55} strokeLinecap="round"
            strokeDasharray={`${ring * 0.9} ${ring * 2.4}`} opacity={0.9}
            style={{ filter: `drop-shadow(0 0 ${ring * 1.6}px ${f.dashes.color})` }}
          />
        </svg>
      )}

      {/* Встречный ряд штрихов у плазмы. */}
      {f.dashes2 && (
        <svg width={size} height={size} style={{
          position: "absolute", inset: 0,
          animation: `spin360 ${f.dashes2.dur}s linear infinite${f.dashes2.reverse ? " reverse" : ""}`,
          willChange: "transform", zIndex: 1,
        }} aria-hidden>
          <circle
            cx={size / 2} cy={size / 2} r={size / 2 - ring * 1.1}
            fill="none" stroke={f.dashes2.color} strokeWidth={ring * 0.3} strokeLinecap="round"
            strokeDasharray={`${ring * 0.5} ${ring * 3.2}`} opacity={0.75}
            style={{ filter: `drop-shadow(0 0 ${ring}px ${f.dashes2.color})` }}
          />
        </svg>
      )}

      {/* белый блик, проходящий по радуге */}
      {f.sweep && (
        <div style={{ position: "absolute", inset: 0, borderRadius: "50%", overflow: "hidden", zIndex: 1, WebkitMaskImage: ringMask, maskImage: ringMask }}>
          <div style={{
            position: "absolute", top: "-30%", bottom: "-30%", width: "36%", left: 0,
            background: "linear-gradient(90deg, rgba(255,255,255,0) 0%, rgba(255,255,255,0.8) 50%, rgba(255,255,255,0) 100%)",
            filter: "blur(2px)",
            animation: "spotlightSweep 3.8s ease-in-out infinite",
          }} />
        </div>
      )}

      {/* Корка углей.

          Кольцо снизу — сплошная лава; сверху на неё кладётся тёмная
          порода, но не ровным слоем, а рваными пятнами: шум прогоняется
          через резкую кривую прозрачности, и от него остаются острова
          вместо мягкой дымки. Между островами лава и видна — это и есть
          трещины, рисовать их отдельно не нужно.

          Только для крупных копий: на витрине в шестьдесят точек
          отдельные трещины не различимы, а фильтр считается честно. */}
      {f.crust && крупно && f.crust.layers.map((L, i) => {
        const uid = `cr-${f.id}-${i}-${size}`;
        // Толщина кольца в единицах viewBox — оно рисуется в системе
        // 0..100 независимо от размера на экране.
        const ш = (ring / size) * 100;
        const [к, сдвиг] = L.порог;
        return (
          <svg
            key={uid} width={size} height={size} viewBox="0 0 100 100"
            style={{ position: "absolute", inset: 0, zIndex: 1, pointerEvents: "none", opacity: L.opacity || 1 }}
            aria-hidden
          >
            <defs>
              <filter id={uid} x="-15%" y="-15%" width="130%" height="130%">
                <feTurbulence type="fractalNoise" baseFrequency={L.freq} numOctaves="3" seed={L.seed} result="n" />
                {/* Прозрачность берётся из шума и растягивается так, что
                    полутона исчезают: остаётся либо порода, либо
                    просвет. */}
                <feColorMatrix in="n" type="matrix" values={`0 0 0 0 0  0 0 0 0 0  0 0 0 0 0  ${к} 0 0 0 ${сдвиг}`} result="m" />
                <feComposite in="SourceGraphic" in2="m" operator="in" />
              </filter>
            </defs>
            <g style={{
              transformOrigin: "50px 50px",
              animation: `spin360 ${L.dur}s linear infinite${L.reverse ? " reverse" : ""}`,
            }}>
              <circle cx="50" cy="50" r={50 - ш / 2} fill="none" stroke={f.crust.color} strokeWidth={ш} filter={`url(#${uid})`} />
            </g>
          </svg>
        );
      })}

      {/* Раскалённые кромки: край корки всегда горячее её середины. */}
      {f.crust && (
        <>
          <div style={{
            position: "absolute", inset: 0, borderRadius: "50%",
            boxShadow: `inset 0 0 ${Math.max(2, ring * 0.7)}px ${hexA(f.crust.edge, 0.85)}`,
            zIndex: 1, WebkitMaskImage: ringMask, maskImage: ringMask,
          }} />
          <div style={{
            position: "absolute", inset: ring - 1, borderRadius: "50%",
            border: `1px solid ${hexA(f.crust.edge, 0.75)}`,
            boxShadow: `0 0 ${ring}px ${hexA(f.crust.edge, 0.6)}`,
            zIndex: 1,
          }} />
        </>
      )}

      {inner}

      {/* голова кометы: та же длительность, что и у хвоста, но сдвинутая
          на три четверти круга — так она попадает ровно в его светлый
          конец и не убегает вперёд */}
      {f.comet && (
        <span style={{
          position: "absolute", left: "50%", top: "50%",
          width: ring * 1.8, height: ring * 1.8, marginLeft: -ring * 0.9, marginTop: -ring * 0.9,
          borderRadius: "50%", background: "#FFFFFF",
          boxShadow: `0 0 ${ring * 4}px ${ring}px ${hexA(f.comet.color, 0.75)}`,
          ["--orbit-r"]: `${size / 2 - ring / 2}px`,
          animation: `spotlightOrbit ${f.comet.dur}s linear ${-f.comet.dur * 0.75}s infinite`, zIndex: 3,
        }} />
      )}

      {/* Искры, отстающие от головы кометы: каждая идёт по тому же
          кругу, но с задержкой — и гаснет, не догнав. */}
      {f.comet && Array.from({ length: мало(f.comet.embers || 0, 2) }).map((_, i) => {
        const отставание = (i + 1) * 0.055;
        const с = ring * (1.1 - i * 0.12);
        return (
          <span key={`e${i}`} style={{
            position: "absolute", left: "50%", top: "50%",
            width: с, height: с, marginLeft: -с / 2, marginTop: -с / 2,
            borderRadius: "50%", background: f.comet.color,
            opacity: 0.75 - i * 0.12,
            boxShadow: `0 0 ${ring * 2}px ${hexA(f.comet.color, 0.7)}`,
            ["--orbit-r"]: `${size / 2 - ring / 2}px`,
            animation: `spotlightOrbit ${f.comet.dur}s linear ${-f.comet.dur * (0.75 - отставание)}s infinite`,
            zIndex: 3,
          }} />
        );
      })}

      {/* Вспышка на витке: голова разгорается и опадает, а не светит
          ровно — иначе комета читается как бегущая точка. */}
      {f.comet && f.comet.flare && (
        <span style={{
          position: "absolute", inset: -ring * 2, borderRadius: "50%",
          boxShadow: `0 0 ${size * 0.3}px ${ring * 1.6}px ${hexA(f.comet.color, 0.32)}`,
          animation: `glowPulse ${f.comet.dur}s ease-in-out infinite`,
          zIndex: 0,
        }} />
      )}

      {/* круги, расходящиеся наружу; у «пульса» — ударами сердца */}
      {Array.from({ length: мало(f.waves || 0, 2) }).map((_, i) => (
        <span key={`w${i}`} style={{
          position: "absolute", inset: 0, borderRadius: "50%",
          border: `${Math.max(1, ring * 0.5)}px solid ${hexA(f.glow, 0.55)}`,
          animation: f.beat
            ? `heartWave 2.6s cubic-bezier(0.2,0.8,0.3,1) ${-i * 0.87}s infinite`
            : `frameWave 3s ease-out ${-i * 1}s infinite`,
          zIndex: 3,
        }} />
      ))}

      {/* Частицы, срывающиеся с кольца: искры уголька и пузыри кислоты.
          Каждая стартует в своей точке края и уходит наружу по радиусу —
          поэтому поворот задаётся до подъёма, а сам подъём идёт по
          вложенному слою: иначе «вверх» у всех был бы один и тот же. */}
      {f.rise && Array.from({ length: мало(f.rise.count, 2) }).map((_, i) => {
        const угол = (360 / f.rise.count) * i + (i % 2 ? 18 : 0);
        const с = Math.max(2, ring * (0.7 + (i % 3) * 0.2));
        return (
          <span key={`ri${i}`} style={{
            position: "absolute", left: "50%", top: "50%", width: 0, height: 0,
            transform: `rotate(${угол}deg) translateY(${-(size / 2 - ring / 2)}px)`,
            zIndex: 3,
          }}>
            <span style={{
              display: "block", width: с, height: с, marginLeft: -с / 2, marginTop: -с / 2,
              borderRadius: "50%",
              background: f.rise.hollow ? "transparent" : f.rise.color,
              border: f.rise.hollow ? `1px solid ${f.rise.color}` : "none",
              boxShadow: `0 0 ${ring * 1.6}px ${hexA(f.rise.color, 0.8)}`,
              ["--rise"]: `${Math.round(size * (0.16 + (i % 3) * 0.05))}px`,
              animation: `emberRise ${f.rise.dur + (i % 3) * 0.6}s ease-out ${-i * (f.rise.dur / f.rise.count)}s infinite`,
            }} />
          </span>
        );
      })}

      {/* Капли: срываются с нижней части кольца и падают. */}
      {f.drip && Array.from({ length: мало(f.drip.count, 1) }).map((_, i) => {
        const угол = 120 + i * 55;
        const с = Math.max(2, ring * 0.9);
        return (
          <span key={`dr${i}`} style={{
            position: "absolute", left: "50%", top: "50%", width: 0, height: 0,
            transform: `rotate(${угол}deg) translateY(${size / 2 - ring / 2}px) rotate(${-угол}deg)`,
            zIndex: 3,
          }}>
            <span style={{
              display: "block", width: с, height: с * 1.3, marginLeft: -с / 2,
              borderRadius: "50% 50% 50% 50% / 60% 60% 40% 40%",
              background: f.drip.color,
              boxShadow: `0 0 ${ring * 1.4}px ${hexA(f.drip.color, 0.7)}`,
              ["--drop"]: `${Math.round(size * 0.2)}px`,
              animation: `dripFall ${f.drip.dur + i * 1.3}s ease-in ${-i * 2.1}s infinite`,
            }} />
          </span>
        );
      })}

      {/* Искры, слетающие с кольца по касательной. */}
      {f.burst && Array.from({ length: мало(f.burst.count, 3) }).map((_, i) => {
        const угол = (360 / f.burst.count) * i + 11;
        const с = Math.max(1.6, ring * 0.62);
        return (
          <span key={`bu${i}`} style={{
            position: "absolute", left: "50%", top: "50%", width: 0, height: 0,
            // Минус девяносто, а не плюс: с плюсом ось X после поворота
            // смотрит внутрь, и искры улетали в аватарку.
            transform: `rotate(${угол}deg) translateY(${-(size / 2 - ring / 2)}px) rotate(${-90 + (i % 2 ? 25 : -25)}deg)`,
            zIndex: 3,
          }}>
            <span style={{
              // Росчерк вдоль полёта, а не точка: точка на этом размере
              // читается как соринка, а не как искра.
              display: "block", width: с * 3, height: с, marginLeft: -с * 1.5, marginTop: -с / 2,
              borderRadius: с, background: `linear-gradient(90deg, ${hexA(f.burst.color, 0)}, ${f.burst.color})`,
              boxShadow: `0 0 ${ring * 1.8}px ${hexA(f.burst.color, 0.9)}`,
              ["--fly"]: `${Math.round(size * (0.16 + (i % 4) * 0.05))}px`,
              animation: `sparkShoot ${f.burst.dur + (i % 4) * 0.5}s ease-out ${-i * 0.42}s infinite`,
            }} />
          </span>
        );
      })}

      {/* Гранёное кольцо льда.

          Настоящий лёд не бывает ровной трубой: он колется, и кольцо
          из неровных кусков со светящимися стыками читается льдом с
          первого взгляда, а гладкое — просто голубым металлом.

          Радиусы вершин сдвинуты понемногу и постоянно (шум считается
          по номеру вершины), поэтому куски разной толщины, но картинка
          не дёргается от кадра к кадру. */}
      {f.facets && крупно && (() => {
        const N = f.facets.count;
        const ц = size / 2;
        const шум = (i, k) => (((Math.sin(i * 12.9898 + k * 78.233) * 43758.5453) % 1) + 1) % 1;
        const внешR = ц - ring * 0.4;
        const внутрR = ц - ring * 1.7;
        const точка = (a, r) => [ц + Math.cos(a) * r, ц + Math.sin(a) * r];
        const внеш = [], внутр = [];
        for (let i = 0; i < N; i++) {
          const a = (Math.PI * 2 / N) * i;
          внеш.push(точка(a, внешR * (1 - шум(i, 1) * 0.06)));
          внутр.push(точка(a + Math.PI / N, внутрR * (1 + шум(i, 2) * 0.07)));
        }
        const путь = (тчк) => `M ${тчк.map(([x, y]) => `${x.toFixed(1)} ${y.toFixed(1)}`).join(" L ")} Z`;
        return (
          <svg width={size} height={size} style={{ position: "absolute", inset: 0, zIndex: 2, pointerEvents: "none" }} aria-hidden>
            <defs>
              <linearGradient id={`ice-${size}`} x1="0" y1="0" x2="0.6" y2="1">
                <stop offset="0%" stopColor={f.facets.edge} stopOpacity="0.75" />
                <stop offset="45%" stopColor={f.facets.fill} stopOpacity="0.25" />
                <stop offset="100%" stopColor={f.facets.edge} stopOpacity="0.7" />
              </linearGradient>
            </defs>
            <path
              d={`${путь(внеш)} ${путь([...внутр].reverse())}`}
              fillRule="evenodd" fill={`url(#ice-${size})`} opacity={f.facets.opacity}
              stroke={f.facets.edge} strokeWidth={Math.max(0.6, ring * 0.14)} strokeLinejoin="round"
            />
            {/* Стыки кусков — короткие рёбра поперёк кольца, от внешней
                вершины к ближайшей внутренней. По ним и видно, что оно
                набрано из кусков, а не отлито. Раньше ребро тянулось к
                вершине через одну, и кольцо затягивало паутиной. */}
            {внеш.map(([x, y], i) => {
              const a = (Math.PI * 2 / N) * i;
              const [ix, iy] = точка(a, внутрR * (1 + шум(i, 2) * 0.07));
              return <line key={i} x1={x} y1={y} x2={ix} y2={iy} stroke={f.facets.edge} strokeWidth={Math.max(0.5, ring * 0.12)} opacity="0.4" />;
            })}
          </svg>
        );
      })()}

      {/* Тонкий ободок снаружи кольца. */}
      {f.outerRing && (
        <div style={{
          position: "absolute", inset: -ring * f.outerRing.gap, borderRadius: "50%",
          border: `${Math.max(1, ring * 0.16)}px solid ${hexA(f.outerRing.color, f.outerRing.opacity)}`,
          zIndex: 0, pointerEvents: "none",
        }} />
      )}

      {/* Пыль и искры вокруг кольца.

          Блеск виден не по самому кольцу, а по тому, что вокруг него
          что-то светится: мелкая пыль по орбите и несколько крупных
          искр с лучами. Без них полированный металл на чёрном выглядит
          просто нарисованным кругом. */}
      {f.sparks && крупно && (() => {
        const S = f.sparks;
        const поле = size * 1.5;
        const ц = поле / 2;
        const R = size / 2;
        const шум = (i, k) => (((Math.sin(i * 45.164 + k * 91.71) * 43758.5453) % 1) + 1) % 1;
        return (
          <svg width={поле} height={поле} viewBox={`0 0 ${поле} ${поле}`}
            style={{ position: "absolute", left: -(поле - size) / 2, top: -(поле - size) / 2, zIndex: 0, pointerEvents: "none" }}
            aria-hidden
          >
            <g style={{ transformOrigin: `${ц}px ${ц}px`, animation: `spin360 ${S.dur * 7}s linear infinite` }}>
              {Array.from({ length: S.count }, (_, i) => {
                const a = шум(i, 1) * Math.PI * 2;
                const r = R * (1.02 + шум(i, 2) * 0.34);
                const рад = Math.max(0.6, ring * (0.1 + шум(i, 3) * 0.22));
                return (
                  <circle
                    key={i} cx={ц + Math.cos(a) * r} cy={ц + Math.sin(a) * r} r={рад}
                    fill={S.dust} opacity={0.25 + шум(i, 4) * 0.5}
                    style={{ animation: `frostTwinkle ${(S.dur + (i % 5)).toFixed(1)}s ease-in-out ${-i * 0.31}s infinite` }}
                  />
                );
              })}
              {/* Крупные искры: короткий крест с длинными лучами — так
                  блик читается вспышкой, а не точкой побольше. */}
              {Array.from({ length: S.stars }, (_, i) => {
                const a = (Math.PI * 2 / S.stars) * i + шум(i, 5) * 1.2;
                const r = R * (0.99 + шум(i, 6) * 0.06);
                const x = ц + Math.cos(a) * r;
                const y = ц + Math.sin(a) * r;
                const L = ring * (0.9 + шум(i, 7) * 0.9);
                const т = Math.max(0.6, ring * 0.11);
                return (
                  <g key={`s${i}`} style={{
                    transformOrigin: `${x}px ${y}px`,
                    animation: `frostTwinkle ${(S.dur * 0.8 + i * 1.3).toFixed(1)}s ease-in-out ${-i * 1.7}s infinite`,
                    filter: `drop-shadow(0 0 ${ring}px ${S.color})`,
                  }}>
                    <line x1={x - L} y1={y} x2={x + L} y2={y} stroke={S.color} strokeWidth={т} strokeLinecap="round" />
                    <line x1={x} y1={y - L} x2={x} y2={y + L} stroke={S.color} strokeWidth={т} strokeLinecap="round" />
                    <circle cx={x} cy={y} r={т * 1.4} fill="#fff" />
                  </g>
                );
              })}
            </g>
          </svg>
        );
      })()}

      {/* Иней: короткие иглы по внутреннему краю, вспыхивают вразнобой. */}
      {f.frost && (
        <svg width={size} height={size} viewBox={`0 0 ${size} ${size}`} style={{ position: "absolute", inset: 0, zIndex: 3, pointerEvents: "none" }} aria-hidden>
          {Array.from({ length: мало(f.frost.count, 4) }).map((_, i) => {
            // Углы неровные, длины разные: ровный шаг по кругу читается
            // как деления циферблата, а не как наросший иней.
            const a = ((360 / f.frost.count) * i + (i % 3) * 7 - 5) * Math.PI / 180;
            const R = size / 2 - ring * 0.75;
            const дл = ring * (0.7 + (i % 4) * 0.28);
            const тчк = (rad, r) => [size / 2 + Math.cos(rad) * r, size / 2 + Math.sin(rad) * r];
            const [x1, y1] = тчк(a, R);
            const [x2, y2] = тчк(a, R - дл);
            // Две ветки под углом от середины иглы — так растёт иней.
            const [bx1, by1] = тчк(a + 0.3, R - дл * 0.85);
            const [bx2, by2] = тчк(a - 0.3, R - дл * 0.85);
            const [сx, сy] = тчк(a, R - дл * 0.45);
            const толщ = Math.max(0.5, ring * 0.1);
            return (
              <g key={i} style={{
                animation: `frostTwinkle ${f.frost.dur + (i % 4) * 0.8}s ease-in-out ${-i * 0.37}s infinite`,
              }}>
                <line x1={x1} y1={y1} x2={x2} y2={y2} stroke={f.frost.color} strokeWidth={толщ} strokeLinecap="round" />
                <line x1={сx} y1={сy} x2={bx1} y2={by1} stroke={f.frost.color} strokeWidth={толщ * 0.7} strokeLinecap="round" opacity="0.75" />
                <line x1={сx} y1={сy} x2={bx2} y2={by2} stroke={f.frost.color} strokeWidth={толщ * 0.7} strokeLinecap="round" opacity="0.75" />
              </g>
            );
          })}
        </svg>
      )}

      {/* Корона затмения: лучи из-за края, дышат вразнобой. */}
      {f.corona && Array.from({ length: мало(f.corona.count, 5) }).map((_, i) => {
        const угол = (360 / f.corona.count) * i;
        const дл = ring * (2.2 + (i % 3) * 1.1);
        return (
          <span key={`co${i}`} style={{
            position: "absolute", left: "50%", top: "50%", width: 0, height: 0,
            transform: `rotate(${угол}deg)`, zIndex: 0,
          }}>
            <span style={{
              display: "block", width: Math.max(1, ring * 0.5), height: дл,
              marginLeft: -ring * 0.25,
              marginTop: -(size / 2 + дл - ring * 0.5),
              transformOrigin: "50% 100%",
              background: `linear-gradient(to top, ${hexA(f.corona.color, 0.75)}, transparent)`,
              filter: `blur(${Math.max(0.5, ring * 0.25)}px)`,
              animation: `coronaBreath ${f.corona.dur + (i % 4) * 0.9}s ease-in-out ${-i * 0.31}s infinite`,
            }} />
          </span>
        );
      })}

      {/* Листопад: лист идёт по кругу, крутится вокруг себя и меняет
          размер — то приближается, то уходит вглубь. Половина листьев
          рисуется за аватаркой, половина перед ней. */}
      {f.leafFall && Array.from({ length: мало(f.leafFall.count, 3) }).map((_, i) => {
        const с = Math.max(9, Math.round(size * (0.15 + (i % 3) * 0.03)));
        const дл = 13 + (i % 4) * 3.5;
        return (
          <span key={`lf${i}`} style={{
            position: "absolute", left: "50%", top: "50%",
            width: с, height: с, marginLeft: -с / 2, marginTop: -с / 2,
            ["--orbit-r"]: `${orbitR - (i % 2) * ring}px`,
            animation: `spotlightOrbit ${дл}s linear ${-i * (дл / f.leafFall.count)}s infinite`,
            zIndex: i % 2 ? 3 : 0,
          }}>
            <span style={{
              display: "block",
              animation: `leafTumble ${3.4 + (i % 3) * 0.9}s ease-in-out infinite`,
              animationDelay: `${-i * 0.6}s`,
            }}>
              <LeafIcon size={с} kind={i % 3} color={f.leafFall.colors[i % f.leafFall.colors.length]} />
            </span>
          </span>
        );
      })}

      {/* листья, облетающие аватарку */}
      {Array.from({ length: f.leaves || 0 }).map((_, i) => {
        const s = Math.max(9, Math.round(size * 0.17));
        return (
          <span key={`l${i}`} style={{
            position: "absolute", left: "50%", top: "50%",
            width: s, height: s, marginLeft: -s / 2, marginTop: -s / 2,
            ["--orbit-r"]: `${orbitR}px`,
            animation: `spotlightOrbit ${15 + i * 3}s linear ${-i * 5}s infinite`, zIndex: 3,
          }}>
            <span style={{ display: "block", animation: `wreathSway ${5.2 + i * 0.7}s ease-in-out infinite` }}>
              <LeafIcon size={s} kind={i % 3} color={f.leafColor} />
            </span>
          </span>
        );
      })}
      {/* Орбиты: наклонённые эллипсы и тела, идущие по ним. Тело в
          верхней половине пути прячется за аватарку, в нижней проходит
          перед ней — это и создаёт объём. Один слой рисуется под
          аватаркой, другой поверх, а само тело переключается между ними
          на середине витка. */}
      {f.orbit && [0, 1].map((слой) => (
        <div key={`ob${слой}`} style={{
          position: "absolute", inset: -ring * 2, pointerEvents: "none",
          zIndex: слой === 0 ? 0 : 3,
        }}>
          {f.orbit.rings.map((r, i) => {
            const w = size + ring * 4;
            const h = w * r.squash;
            return (
              <div key={i} style={{
                position: "absolute", left: "50%", top: "50%",
                width: w, height: h, marginLeft: -w / 2, marginTop: -h / 2,
                transform: `rotate(${r.tilt}deg)`,
              }}>
                {/* Сама траектория — тонкая, чтобы не спорить с кольцом.
                    Слоя два: ровная холодная линия, которая видна всегда,
                    и поверх неё раскалённая — она и извергается. Порознь
                    их держим потому, что при затухании вспышки линия
                    должна не исчезать, а остывать. */}
                {слой === 0 && (
                  <>
                    <div style={{
                      position: "absolute", inset: 0, borderRadius: "50%",
                      border: `${Math.max(1, ring * 0.35)}px solid ${hexA(f.orbit.color, 0.32)}`,
                      boxShadow: `0 0 ${ring * 2}px ${hexA(f.orbit.color, 0.22)}`,
                    }} />
                    <div style={{
                      position: "absolute", inset: 0, borderRadius: "50%",
                      border: `${Math.max(1, ring * 0.45)}px solid ${hexA(f.orbit.color, 0.85)}`,
                      boxShadow: `0 0 ${ring * 5}px ${ring}px ${hexA(f.orbit.color, 0.5)}, inset 0 0 ${ring * 2}px ${hexA(f.orbit.color, 0.4)}`,
                      animation: `orbitFlare ${r.flare || 4}s cubic-bezier(0.2,0.9,0.3,1) infinite`,
                      // Сдвиг по фазе — чтобы линии не вспыхивали разом
                      // даже в первый заход, до расхождения периодов.
                      animationDelay: `${-i * 1.9}s`,
                    }} />
                  </>
                )}
                {/* Тело. Верхнюю половину пути показывает нижний слой,
                    нижнюю — верхний: половинки чередуются по фазе. */}
                <div style={{
                  position: "absolute", inset: 0,
                  animation: `spin360 ${r.dur}s linear infinite`,
                  animationDelay: `${-r.dur * (слой === 0 ? 0 : 0.5)}s`,
                  clipPath: слой === 0 ? "inset(0 0 50% 0)" : "inset(50% 0 0 0)",
                }}>
                  <span style={{
                    position: "absolute", left: "50%", top: 0,
                    width: ring * r.size, height: ring * r.size,
                    marginLeft: -ring * r.size / 2, marginTop: -ring * r.size / 2,
                    borderRadius: "50%", background: "#fff",
                    boxShadow: `0 0 ${ring * 4}px ${ring * 1.2}px ${f.orbit.color}`,
                  }} />
                  {/* След за телом: короткая дуга того же цвета. */}
                  {r.trail && (
                    <div style={{
                      position: "absolute", inset: 0, borderRadius: "50%",
                      border: `${Math.max(1, ring * 0.5)}px solid transparent`,
                      borderTopColor: hexA(f.orbit.color, 0.55),
                      filter: `blur(${ring * 0.3}px)`,
                    }} />
                  )}
                </div>
              </div>
            );
          })}
        </div>
      ))}

      {/* точки, вращающиеся по орбите вокруг рамки */}
      {Array.from({ length: f.orbiters || 0 }).map((_, i) => (
        <span key={`o${i}`} style={{
          position: "absolute", left: "50%", top: "50%",
          width: ring * 1.6, height: ring * 1.6, marginLeft: -ring * 0.8, marginTop: -ring * 0.8,
          borderRadius: "50%", background: f.orbitColor,
          boxShadow: `0 0 ${ring * 3}px ${ring * 0.6}px ${hexA(f.orbitColor, 0.6)}`,
          ["--orbit-r"]: `${orbitR}px`,
          animation: `spotlightOrbit ${9 + i * 2}s linear ${-i * 3}s infinite`, zIndex: 3,
        }} />
      ))}
      {/* мерцающие звёздочки по краю */}
      {Array.from({ length: мало(f.sparks || 0, 2) }).map((_, i) => {
        const a = (360 / (f.sparks || 1)) * i;
        const px = Math.cos((a * Math.PI) / 180) * orbitR;
        const py = Math.sin((a * Math.PI) / 180) * orbitR;
        const s = ring * 2.6;
        return (
          <svg key={`s${i}`} width={s} height={s} viewBox="0 0 10 10" style={{
            position: "absolute", left: "50%", top: "50%",
            transform: `translate(${px - s / 2}px, ${py - s / 2}px)`,
            ["--o"]: 0.9,
            opacity: 0, zIndex: 3,
            animation: `starPulse ${2.6 + i * 0.3}s ease-in-out ${-i * 0.4}s infinite`,
          }}>
            <path d="M5 0 C5.4 3.2 6.8 4.6 10 5 C6.8 5.4 5.4 6.8 5 10 C4.6 6.8 3.2 5.4 0 5 C3.2 4.6 4.6 3.2 5 0 Z" fill="#FFFFFF" />
          </svg>
        );
      })}
    </div>
  );
});

/* ProfileCardBg — подложка, которая рисуется за аватаркой и шапкой
   профиля. Абсолютная, ничего не ловит по клику и обрезается по своему
   контейнеру. */
/* Сцена карточки «Магма».

   Ровно то, что обещает название: озеро расплавленного камня. Сверху
   плывёт застывшая корка, между плитами светятся швы, из разломов бьёт
   жар, над поверхностью поднимаются искры.

   Раньше здесь стоял обсидиановый истукан, а лава была фоном за его
   спиной: карточка читалась как «каменный воин», а не как магма.

   Всё в сетке 100×100 и растягивается по карточке. Верхняя треть
   намеренно тёмная и пустая — там аватарка и ник, и любой рисунок под
   ними мешает читать. */
const MagmaScene = React.memo(function MagmaScene({ c, height, showcase }) {
  const м = c.magma;
  const мелко = height < 130;

  // Корка лежит сплошной плитой — расплав виден только там, где она
  // разошлась. Так и выглядит остывающая лава: чёрное поле, разрезанное
  // светящимися швами. Раньше плиты были выложены с широкими зазорами,
  // и низ карточки читался как оранжевые горы в закате, а не как магма.
  //
  // Швы заданы руками: случайные ломаные давали то паутину, то ровную
  // плитку. Каждый со своим ритмом — камень остывает неравномерно.
  const швы = [
    { d: "M0,64 L22,61 L38,67 L58,62 L76,68 L92,63 L100,66", ш: 1.1 },
    { d: "M0,82 L18,78 L34,84 L52,79 L70,85 L88,80 L100,83", ш: 1.3 },
    { d: "M22,61 L26,72 L20,82 L24,92 L20,100", ш: 0.7 },
    { d: "M58,62 L54,71 L60,80 L56,90 L60,100", ш: 0.7 },
    { d: "M92,63 L88,73 L94,82 L90,92", ш: 0.6 },
    { d: "M38,67 L44,76 L38,84", ш: 0.5 },
    { d: "M76,68 L72,77 L78,86", ш: 0.5 },
  ];

  // Окна расплава: там, где корка провалилась и видно открытую лаву.
  const окна = [
    "M20,82 L30,79 L36,85 L28,90 L18,88 Z",
    "M60,80 L72,77 L78,84 L66,88 Z",
    "M40,92 L54,89 L62,95 L44,98 Z",
  ];

  return (
    <>
      {/* Жар снизу — единственный источник света на карточке. */}
      <div style={{
        position: "absolute", left: "-15%", right: "-15%", bottom: "-14%", height: "56%",
        background: `radial-gradient(70% 100% at 50% 100%, ${hexA(м.seam, 0.32)} 0%, ${hexA(м.seam, 0.16)} 40%, transparent 76%)`,
        filter: "blur(14px)",
        animation: "moltenBreath 7s ease-in-out infinite",
      }} />

      <svg width="100%" height="100%" viewBox="0 0 100 100" preserveAspectRatio="none"
        style={{ position: "absolute", inset: 0 }} aria-hidden>
        <defs>
          {/* Расплав в глубине: к низу светлее — там горячее. */}
          <linearGradient id={`mg-lava-${Math.round(height)}`} x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stopColor={м.seam} stopOpacity="0.85" />
            <stop offset="60%" stopColor="#FF8A2D" stopOpacity="0.95" />
            <stop offset="100%" stopColor={м.hot} stopOpacity="1" />
          </linearGradient>
          {/* Сама порода: почти чёрная, чуть теплее у нижнего края. */}
          <linearGradient id={`mg-crust-${Math.round(height)}`} x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stopColor="#0A0407" />
            <stop offset="70%" stopColor={м.stone} />
            <stop offset="100%" stopColor="#1B080B" />
          </linearGradient>
        </defs>

        {/* Расплав заливает низ, корка ляжет поверх и почти всё закроет. */}
        <rect x="0" y="56" width="100" height="44" fill={`url(#mg-lava-${Math.round(height)})`} />

        {/* Корка: рваный верхний край, дальше сплошная порода до низа. */}
        <path d="M0,60 L14,57 L28,61 L44,56 L60,60 L74,55 L88,60 L100,57 L100,100 L0,100 Z"
          fill={`url(#mg-crust-${Math.round(height)})`} />

        {/* Верхняя кромка корки раскалена: на неё падает свет снизу. */}
        <path d="M0,60 L14,57 L28,61 L44,56 L60,60 L74,55 L88,60 L100,57" fill="none"
          stroke={м.seam} strokeOpacity="0.85" strokeWidth="0.9" strokeLinecap="round"
          vectorEffect="non-scaling-stroke" style={{ filter: `drop-shadow(0 0 4px ${hexA(м.seam, 0.8)})` }} />

        {/* Окна расплава — прорехи в корке. */}
        {окна.map((д, i) => (
          <g key={`ok${i}`} style={{ animation: `moltenBreath ${4.6 + i * 1.1}s ease-in-out ${-i * 1.3}s infinite` }}>
            {/* Свет из прорехи, а не наклейка: широкое размытое пятно
                снизу, поверх — приглушённый расплав. Резкий контур
                читался как приклеенный жёлтый ромб. */}
            <path d={д} fill={м.seam} fillOpacity="0.5" style={{ filter: "blur(3px)" }} />
            <path d={д} fill={м.hot} fillOpacity="0.45" style={{ filter: "blur(1.2px)" }} />
          </g>
        ))}

        {/* Швы: широкая мягкая полоса — зарево из глубины, поверх тонкая
            яркая нить — сам расплав в разломе. */}
        {швы.map((ш, i) => (
          <g key={`sh${i}`} style={{ animation: `moltenBreath ${5 + i * 0.8}s ease-in-out ${-i * 0.9}s infinite` }}>
            <path d={ш.d} fill="none" stroke={м.seam} strokeOpacity="0.6" strokeWidth={ш.ш * 3.4}
              strokeLinecap="round" style={{ filter: "blur(2.2px)" }} vectorEffect="non-scaling-stroke" />
            <path d={ш.d} fill="none" stroke={м.hot} strokeOpacity="0.95" strokeWidth={ш.ш}
              strokeLinecap="round" vectorEffect="non-scaling-stroke" />
          </g>
        ))}

        {/* Пузыри в открытом расплаве. На мелкой карточке их нет: точки
            в пару пикселей превращаются в шум. */}
        {!мелко && [[26, 85, 0.9, 0], [68, 83, 1.1, 1.2], [50, 94, 0.8, 0.6]].map(([x, y, r, d], i) => (
          <circle key={`bb${i}`} cx={x} cy={y} r={r} fill="#FFF3D0" fillOpacity="0.9"
            style={{ animation: `moltenBreath ${3.4 + i * 0.7}s ease-in-out ${-d}s infinite` }} />
        ))}
      </svg>

      {/* Дымка над лавой: тёплый воздух дрожит и слегка размывает
          границу между корой и тёмным верхом. */}
      <div style={{
        position: "absolute", left: 0, right: 0, top: "44%", height: "22%",
        background: `linear-gradient(180deg, transparent 0%, ${hexA(м.seam, 0.16)} 60%, transparent 100%)`,
        filter: "blur(6px)",
        animation: "moltenBreath 9s ease-in-out -3s infinite",
      }} />

      {/* Надпись — только на витрине. В профиле карточка работает фоном
          под ником и аватаркой, и вторая крупная надпись там лишняя. */}
      {showcase && (
        <span style={{
          position: "absolute", left: 0, right: 0, top: "7%", textAlign: "center",
          fontFamily: displayFont, fontWeight: 800,
          fontSize: Math.max(11, Math.round(height * 0.16)),
          letterSpacing: "0.14em",
          // Раскалённый металл: тёмный низ, светлая середина, золото по
          // верхней кромке — и тонкая тень, чтобы буквы стояли на месте,
          // а не парили.
          background: `linear-gradient(180deg, ${м.hot} 0%, #FF8A2D 42%, #B33A0C 72%, #5A1206 100%)`,
          WebkitBackgroundClip: "text", backgroundClip: "text", color: "transparent",
          textShadow: `0 1px 0 rgba(0,0,0,0.6)`,
          filter: `drop-shadow(0 0 8px ${hexA(м.seam, 0.5)})`,
        }}>
          МАГМА
        </span>
      )}
    </>
  );
});

const ProfileCardBg = React.memo(function ProfileCardBg({ cardId, height = 260, radius = 24, bleed = 0, top = 0, showcase = false }) {
  const c = CARD_BY_ID[cardId] || CARD_BY_ID.none;
  const blobs = useMemo(() => {
    const rnd = seededRand(hashSeed(cardId || "none"));
    return (c.blobs || []).map(([color, opacity], i) => ({
      color, opacity,
      size: 180 + rnd() * 140,
      left: `${5 + rnd() * 70}%`,
      top: `${rnd() * 55}%`,
      dur: 18 + rnd() * 14,
      delay: -i * 6,
    }));
  }, [cardId]);
  const stars = useMemo(() => {
    const rnd = seededRand(hashSeed(`${cardId}-stars`));
    return Array.from({ length: c.stars || 0 }, () => ({
      left: rnd() * 100, top: rnd() * 100, size: 4 + rnd() * 4,
      opacity: 0.35 + rnd() * 0.5, dur: 3 + rnd() * 4, delay: -rnd() * 6,
    }));
  }, [cardId]);
  // Метеоры, искры и листья расставлены случайно, но не заново при каждой
  // перерисовке: разброс считается один раз от самого предмета, иначе
  // рисунок прыгал бы при любом обновлении экрана.
  const streaks = useMemo(() => {
    const rnd = seededRand(hashSeed(`${cardId}-streaks`));
    return Array.from({ length: c.streaks || 0 }, () => ({
      left: rnd() * 110 - 5, top: -10 - rnd() * 30, len: 46 + rnd() * 54,
      opacity: 0.3 + rnd() * 0.5, dur: 2.6 + rnd() * 3.4, delay: -rnd() * 8,
    }));
  }, [cardId]);
  const rises = useMemo(() => {
    const rnd = seededRand(hashSeed(`${cardId}-rise`));
    return Array.from({ length: c.rise || 0 }, () => ({
      left: rnd() * 100, size: 2 + rnd() * 3,
      opacity: 0.35 + rnd() * 0.5, dur: 4 + rnd() * 5, delay: -rnd() * 9,
    }));
  }, [cardId]);
  const cardLeaves = useMemo(() => {
    const rnd = seededRand(hashSeed(`${cardId}-leaves`));
    return Array.from({ length: c.cardLeaves || 0 }, () => ({
      left: rnd() * 100, size: 12 + rnd() * 13, kind: Math.floor(rnd() * 3),
      dx: `${(rnd() - 0.5) * 70}px`, r0: `${rnd() * 360}deg`, r1: `${rnd() * 360 + 180}deg`,
      opacity: 0.45 + rnd() * 0.45, dur: 9 + rnd() * 9, delay: -rnd() * 14,
    }));
  }, [cardId]);
  const shards = useMemo(() => {
    const rnd = seededRand(hashSeed(`${cardId}-shards`));
    return Array.from({ length: c.shards || 0 }, () => ({
      left: 8 + rnd() * 84,
      // Только над породой: в верхней половине карточки осколкам
      // взяться неоткуда, там небо — и они висели ни на чём.
      top: 46 + rnd() * 40,
      size: 6 + rnd() * 9,
      rot: rnd() * 360,
      dur: 11 + rnd() * 12,
      delay: -rnd() * 14,
      // Осколок — не ромб, а неровный скол: три-четыре грани разной
      // длины, иначе получается кристалл из мультфильма.
      d: `M0,-1 L${(0.5 + rnd() * 0.4).toFixed(2)},${(-0.2 + rnd() * 0.3).toFixed(2)} L${(0.2 + rnd() * 0.3).toFixed(2)},${(0.8 + rnd() * 0.3).toFixed(2)} L${(-0.6 - rnd() * 0.3).toFixed(2)},${(0.3 + rnd() * 0.4).toFixed(2)} Z`,
    }));
  }, [cardId]);
  const smoke = useMemo(() => {
    const rnd = seededRand(hashSeed(`${cardId}-smoke`));
    return Array.from({ length: c.smoke || 0 }, () => ({
      left: 10 + rnd() * 80,
      size: 90 + rnd() * 120,
      dur: 16 + rnd() * 14,
      delay: -rnd() * 18,
      opacity: 0.16 + rnd() * 0.14,
    }));
  }, [cardId]);
  const field = useMemo(() => (c.crust ? magmaField(`${cardId}-field`) : []), [cardId]);
  const beams = useMemo(() => {
    const rnd = seededRand(hashSeed(`${cardId}-beams`));
    return Array.from({ length: c.beams || 0 }, (_, i) => ({
      left: 8 + i * 24 + rnd() * 8, width: 18 + rnd() * 22,
      dur: 9 + rnd() * 6, delay: -rnd() * 8,
    }));
  }, [cardId]);

  if (c.id === "none") return null;
  const gridImg = c.grid
    ? `linear-gradient(${c.grid} 1px, transparent 1px), linear-gradient(90deg, ${c.grid} 1px, transparent 1px)`
    : null;

  return (
    <div aria-hidden style={{
      position: "absolute", left: -bleed, right: -bleed, top,
      height: height - Math.min(0, top),
      borderRadius: radius, overflow: "hidden", pointerEvents: "none", zIndex: 0,
      contain: "layout paint style",
    }}>
      <div style={{ position: "absolute", inset: 0, background: c.base }} />

      {blobs.map((b, i) => (
        <div key={i} style={{
          position: "absolute", left: b.left, top: b.top, width: b.size, height: b.size,
          borderRadius: "50%", filter: "blur(34px)",
          background: `radial-gradient(circle, ${hexA(b.color, b.opacity)} 0%, ${hexA(b.color, 0)} 70%)`,
          animation: `spotlightPulse ${b.dur}s ease-in-out ${b.delay}s infinite`,
          willChange: "transform",
        }} />
      ))}

      {gridImg && !c.floor && (
        <div style={{
          position: "absolute", inset: 0, backgroundImage: gridImg, backgroundSize: "38px 38px",
          animation: "gridDrift 26s linear infinite",
          WebkitMaskImage: "linear-gradient(to bottom, #000 0%, transparent 90%)",
          maskImage: "linear-gradient(to bottom, #000 0%, transparent 90%)",
        }} />
      )}

      {c.floor && (
        <div style={{ position: "absolute", inset: 0, perspective: 220, perspectiveOrigin: "50% 0%" }}>
          <div style={{
            position: "absolute", left: "-50%", right: "-50%", top: "45%", height: "160%",
            backgroundImage: gridImg || `linear-gradient(rgba(255,255,255,0.12) 1px, transparent 1px), linear-gradient(90deg, rgba(255,255,255,0.12) 1px, transparent 1px)`,
            backgroundSize: "38px 38px",
            transform: "rotateX(76deg)", transformOrigin: "50% 0%",
            animation: "gridRunToward 6s linear infinite",
            WebkitMaskImage: "linear-gradient(to bottom, #000 0%, transparent 60%)",
            maskImage: "linear-gradient(to bottom, #000 0%, transparent 60%)",
          }} />
        </div>
      )}

      {stars.map((s, i) => (
        <svg key={i} width={s.size} height={s.size} viewBox="0 0 10 10" style={{
          position: "absolute", left: `${s.left}%`, top: `${s.top}%`,
          ["--o"]: s.opacity, opacity: 0,
          animation: `starPulse ${s.dur}s ease-in-out ${s.delay}s infinite`,
        }}>
          <path d="M5 0 C5.4 3.2 6.8 4.6 10 5 C6.8 5.4 5.4 6.8 5 10 C4.6 6.8 3.2 5.4 0 5 C3.2 4.6 4.6 3.2 5 0 Z" fill="#FFFFFF" />
        </svg>
      ))}

      {c.magma && <MagmaScene c={c} height={height} showcase={showcase} />}

      {/* Дым над жерлом: тёмные клубы поднимаются и растворяются. Без
          них жар читается светом, а не температурой. */}
      {smoke.map((д, i) => (
        <span key={`sm${i}`} style={{
          position: "absolute", left: `${д.left}%`, bottom: "-10%",
          width: д.size, height: д.size, marginLeft: -д.size / 2,
          borderRadius: "50%",
          background: `radial-gradient(circle, rgba(28,16,16,${д.opacity + 0.1}) 0%, rgba(20,10,10,${д.opacity}) 45%, transparent 72%)`,
          animation: `smokeRise ${д.dur}s ease-in-out ${д.delay}s infinite`,
        }} />
      ))}

      {/* Осколки обсидиана: чёрная грань с раскалённой кромкой. */}
      {shards.map((о, i) => (
        <svg key={`sh${i}`} width={о.size} height={о.size} viewBox="-1.2 -1.2 2.4 2.4" style={{
          position: "absolute", left: `${о.left}%`, top: `${о.top}%`,
          animation: `shardFloat ${о.dur}s ease-in-out ${о.delay}s infinite alternate`,
        }} aria-hidden>
          <g transform={`rotate(${о.rot})`}>
            {/* Скол залит камнем, а раскалена только кромка — тонкой
                линией. С толстой обводкой и пустой серединой получались
                вырезанные из бумаги четырёхугольники. */}
            <path d={о.d} fill="#2A1218" fillOpacity="0.96"
              stroke={(c.obsidian && c.obsidian.edge) || T.electric} strokeWidth="0.07"
              strokeLinejoin="round" opacity="0.9" />
          </g>
        </svg>
      ))}

      {/* Рама из обсидиана: тёмный кант по краю и раскалённая прожилка
          по его внутренней кромке. Кант задан тенью, а не растянутой
          картинкой: у растянутой ширина по бокам и сверху выходила
          разной, и рама смотрелась прямоугольником, начерченным по
          линейке. */}
      {c.obsidian && (
        <>
          <div style={{
            position: "absolute", inset: 0, borderRadius: radius, pointerEvents: "none",
            boxShadow: `inset 0 0 0 7px ${c.obsidian.stone}, inset 0 0 22px 8px rgba(0,0,0,0.55)`,
          }} />
          <div style={{
            position: "absolute", inset: 7, borderRadius: Math.max(0, radius - 5), pointerEvents: "none",
            border: `1px solid ${hexA(c.obsidian.edge, 0.7)}`,
            boxShadow: `0 0 10px ${hexA(c.obsidian.edge, 0.3)}, inset 0 0 16px ${hexA(c.obsidian.edge, 0.1)}`,
            animation: "moltenBreath 6s ease-in-out infinite",
          }} />
        </>
      )}

      {/* Волны: широкие размытые полосы ходят вдоль карточки. Каждая со
          своим сроком, поэтому они то расходятся, то накладываются. */}
      {(c.waves || []).map(([color, opacity], i) => (
        <div key={`v${i}`} style={{
          position: "absolute", left: "-60%", right: "-60%", top: `${6 + i * 16}%`, height: Math.max(70, height * 0.32),
          background: `radial-gradient(60% 100% at 50% 50%, ${hexA(color, opacity)} 0%, ${hexA(color, 0)} 70%)`,
          filter: "blur(16px)",
          animation: `cardWave ${15 + i * 5}s ease-in-out ${-i * 4}s infinite alternate`,
          willChange: "transform",
        }} />
      ))}

      {/* Метеоры: сама полоса наклонена, а движение задано снаружи —
          иначе поворот из стиля стёрся бы кадрами анимации. */}
      {streaks.map((s, i) => (
        <span key={`m${i}`} style={{
          position: "absolute", left: `${s.left}%`, top: s.top,
          ["--o"]: s.opacity, ["--fall"]: `${height + 60}px`, opacity: 0,
          animation: `cardStreak ${s.dur}s linear ${s.delay}s infinite`,
        }}>
          <span style={{
            display: "block", width: 1.6, height: s.len, transform: "rotate(18deg)",
            background: `linear-gradient(180deg, ${hexA(c.streakColor || "#FFFFFF", 0)} 0%, ${c.streakColor || "#FFFFFF"} 85%, #FFFFFF 100%)`,
            borderRadius: 999,
          }} />
        </span>
      ))}

      {/* Искры поднимаются от нижнего края и гаснут на полпути. */}
      {rises.map((s, i) => (
        <span key={`r${i}`} style={{
          position: "absolute", left: `${s.left}%`, bottom: -6,
          width: s.size, height: s.size, borderRadius: "50%",
          background: c.riseColor || "#FFFFFF",
          boxShadow: `0 0 8px 1px ${hexA(c.riseColor || "#FFFFFF", 0.7)}`,
          ["--o"]: s.opacity, ["--rise"]: `${-(height * 0.75)}px`, opacity: 0,
          animation: `cardRise ${s.dur}s linear ${s.delay}s infinite`,
        }} />
      ))}

      {/* Листья падают внутри карточки — те же, что и на фоне приложения. */}
      {cardLeaves.map((l, i) => (
        <span key={`cl${i}`} style={{
          position: "absolute", left: `${l.left}%`, top: -22,
          ["--o"]: l.opacity, ["--dx"]: l.dx, ["--r0"]: l.r0, ["--r1"]: l.r1,
          ["--fall"]: `${height + 30}px`, opacity: 0,
          animation: `cardLeafFall ${l.dur}s linear ${l.delay}s infinite`,
        }}>
          <LeafIcon size={l.size} kind={l.kind} color={c.leafColor || "#FFFFFF"} />
        </span>
      ))}

      {/* Лучи: наклонные световые столбы, качающиеся вдоль карточки. */}
      {beams.map((b, i) => (
        <div key={`b${i}`} style={{
          position: "absolute", top: -20, bottom: -20, left: `${b.left}%`, width: b.width,
          background: `linear-gradient(180deg, ${hexA(c.beamColor || "#FFFFFF", 0)} 0%, ${hexA(c.beamColor || "#FFFFFF", 0.4)} 45%, ${hexA(c.beamColor || "#FFFFFF", 0)} 100%)`,
          filter: "blur(7px)",
          animation: `cardBeam ${b.dur}s ease-in-out ${b.delay}s infinite alternate`,
          willChange: "transform",
        }} />
      ))}

      {/* Голограмма: радуга медленно течёт поперёк, поверх неё изредка
          проходит белый блик. */}
      {c.holo && (
        <>
          <div style={{
            position: "absolute", inset: 0,
            background: "linear-gradient(115deg, rgba(255,61,110,0.42), rgba(255,196,107,0.36), rgba(91,255,159,0.36), rgba(46,107,255,0.42), rgba(177,76,255,0.44), rgba(255,61,110,0.42))",
            backgroundSize: "320% 100%",
            animation: "holoShift 13s linear infinite",
            WebkitMaskImage: "linear-gradient(to bottom, #000 0%, transparent 86%)",
            maskImage: "linear-gradient(to bottom, #000 0%, transparent 86%)",
          }} />
          <div style={{ position: "absolute", inset: 0, overflow: "hidden" }}>
            <div style={{
              position: "absolute", top: "-40%", bottom: "-40%", width: "13%", left: 0,
              background: "linear-gradient(90deg, rgba(255,255,255,0) 0%, rgba(255,255,255,0.34) 50%, rgba(255,255,255,0) 100%)",
              transform: "skewX(-14deg)", filter: "blur(4px)",
              animation: "spotlightSweep 6s ease-in-out infinite",
            }} />
          </div>
        </>
      )}

      {/* низ подложки растворяется в фоне приложения, чтобы она читалась
          как фон экрана, а не как обрезанный прямоугольник; по бокам
          карточка идёт до самых краёв */}
      <div style={{
        position: "absolute", left: 0, right: 0, bottom: 0, height: "62%",
        background: `linear-gradient(to bottom, ${hexA(T.bg, 0)} 0%, ${hexA(T.bg, 0.55)} 45%, ${T.bg} 100%)`,
      }} />
    </div>
  );
});

/* BootSplash — стартовая заставка. Перекрывает весь интерфейс, пока идут
   первые запросы, и показывает, что именно ещё грузится: так пустые
   экраны не мелькают до прихода данных. */
/* KeepAlive — вкладка остаётся собранной, даже когда её не видно.

   Раньше каждая вкладка выбрасывалась при переходе и собиралась заново:
   лента перезапрашивалась, витрина заново решала, что заперто, тикер
   покупок начинал с нуля. Из-за этого при возврате на секунду
   показывалось «ещё ничего не загружено», хотя всё уже было загружено
   минуту назад.

   Скрываем показом, а не размонтированием: состояние, прокрутка и
   загруженные данные остаются на месте. Скрытая вкладка не ловит
   нажатия и не читается голосовыми программами. */
/* Профиль — обычная страница.
 *
 * Раньше он приезжал шторкой: ручка сверху, затемнение под ней, закрытие
 * пальцем вниз. На телефоне это выходило боком — жест ловил и список, и
 * шторку сразу, движение шло ступеньками, а промахнувшись мимо ручки,
 * человек закрывал экран вместо прокрутки.
 *
 * Теперь это просто экран: он занимает окно целиком, ничего не тянется,
 * а вернуться можно панелью разделов — она висит выше по слою и остаётся
 * доступной, пока профиль открыт.
 */
function СтраницаПрофиля({ открыт, insetTop = 0, children }) {
  return (
    <div
      aria-hidden={открыт ? undefined : true}
      inert={открыт ? undefined : ""}
      style={{
        position: "absolute", left: 0, right: 0, top: 0, bottom: 0,
        // Ниже панели разделов (её слой 5) и выше содержимого главной:
        // страница закрывает ленту, но не сам способ уйти с неё.
        zIndex: 3,
        background: T.bg,
        display: открыт ? "flex" : "none",
        flexDirection: "column",
      }}
    >
      <div
        className={`no-scrollbar px-4${открыт ? " fx-view" : ""}`}
        style={{
          flex: 1, overflowY: "auto", minHeight: 0,
          // Тот же отступ сверху, что и у главной: подложка карточки
          // профиля рассчитана ровно на него.
          paddingTop: contentTopPad(insetTop),
          paddingBottom: 92,
          overscrollBehavior: "contain",
        }}
      >
        {children}
      </div>
    </div>
  );
}

function KeepAlive({ show, children }) {
  // Вкладки собираются сразу, все, ещё под заставкой запуска: к моменту
  // первого перехода данные уже на месте. Раньше вкладка начинала
  // грузиться в тот момент, когда на неё переходили, и первые полсекунды
  // человек смотрел на пустоту.
  return (
    <div style={show ? undefined : { display: "none" }} aria-hidden={show ? undefined : true} inert={show ? undefined : ""}>
      {children}
    </div>
  );
}

/* LeafLoader — фирменный индикатор: лист заливается снизу вверх.

   Два режима. С числом — заливка стоит ровно на нём: так показывается
   готовность запуска, где шаги известны наперёд. Без числа — заливка
   бежит по кругу: у экрана нет предсказуемого прогресса, и врать
   полоской, которая якобы что-то знает, незачем.

   Отдельной картинки нет: контур и прожилки берутся из того же описания
   листьев, что падают на фоне. */
const LEAF_LOADER_TOP = -31;
const LEAF_LOADER_SPAN = 34;

function LeafLoader({ progress = null, size = 104 }) {
  const leaf = LEAF_KINDS[2];
  const clipId = React.useId();
  const running = progress == null;
  return (
    <svg width={size} height={size * 1.115} viewBox="-17 -33 34 38" style={{ overflow: "visible", display: "block" }} aria-hidden="true">
      <defs>
        <clipPath id={clipId}>
          {/* Прямоугольник закрывает лист целиком и уезжает вниз, а по
              мере готовности возвращается наверх. Двигаем сдвигом, а не
              координатой: координату браузер меняет скачком. */}
          <rect
            x="-17" y={LEAF_LOADER_TOP} width="34" height={LEAF_LOADER_SPAN}
            style={running ? {
              animation: "leafLoaderFill 1.6s cubic-bezier(0.4,0,0.2,1) infinite",
            } : {
              transform: `translateY(${(1 - progress) * LEAF_LOADER_SPAN}px)`,
              transition: "transform 520ms cubic-bezier(0.16,1,0.3,1)",
            }}
          />
        </clipPath>
      </defs>
      <path d={leaf.outline} fill="none" stroke={hexA(T.electric, 0.45)} strokeWidth={1.1} strokeLinejoin="round" />
      {leaf.veins.map((v, i) => (
        <path key={i} d={v} fill="none" stroke={hexA(T.electric, 0.28)} strokeWidth={0.6} strokeLinecap="round" />
      ))}
      <g clipPath={`url(#${clipId})`}>
        <path d={leaf.outline} fill={T.electric} />
        {leaf.veins.map((v, i) => (
          <path key={i} d={v} fill="none" stroke={T.bg} strokeWidth={0.6} opacity={0.35} strokeLinecap="round" />
        ))}
      </g>
      <path d={leaf.stem} fill="none" stroke={hexA(T.electric, 0.5)} strokeWidth={0.9} strokeLinecap="round" />
    </svg>
  );
}

/* PageLoader — тот же лист, но поверх страницы, пока её данные не
   приехали. Занимает место контента, а не весь экран: шапка и нижнее
   меню остаются на местах, и переход не выглядит как перезапуск. */
function PageLoader({ minHeight = 260 }) {
  return (
    <div className="fx-view" style={{ minHeight, display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", gap: 14 }}>
      <LeafLoader size={76} />
      <div style={{ width: 96, height: 3, borderRadius: 999, background: T.surfaceHi, overflow: "hidden" }}>
        <div style={{ width: "40%", height: "100%", borderRadius: 999, background: T.electric, animation: "leafLoaderBar 1.6s ease-in-out infinite" }} />
      </div>
    </div>
  );
}

/* Иллюстрации к слайдам знакомства.
 *
 * Рисуются линиями в той же палитре, что и остальной интерфейс: картинки
 * пришлось бы грузить по сети, а первый экран должен появляться сразу.
 * Анимации идут только на прозрачности и сдвиге — их считает видеокарта,
 * и пролистывание не дёргается.
 */
/* Поверхность карточек знакомства.
 *
 * Одна на все экраны: чипы, пункты рынка, кошельки, шаги запуска. Раньше
 * каждый блок красился отдельно и они выглядели набором разных предметов;
 * здесь у всех одна плоскость — чуть светлее фона, с волосяной рамкой и
 * внутренним бликом сверху. Блик важнее рамки: он и создаёт ощущение
 * поверхности, а не наклейки. */
const СТЕКЛО = {
  background: "linear-gradient(180deg, rgba(255,255,255,0.055) 0%, rgba(255,255,255,0.022) 100%)",
  border: "1px solid rgba(255,255,255,0.075)",
  boxShadow: "inset 0 1px 0 rgba(255,255,255,0.07), 0 10px 26px rgba(0,0,0,0.34)",
};

/* Цвета текста на этих экранах заданы прямо, а не через тему: экран
   знакомства всегда тёмный, и в светлой теме «цвет основного текста»
   становится почти чёрным — надписи на тёмном фоне пропадали. */
function ВступлениеКривая({ активен }) {
  const линия = "M8 96 C 40 92, 62 78, 84 56 S 128 14, 156 8";
  // Та же кривая, замкнутая вниз: по ней заливается площадь под линией.
  const площадь = `${линия} L 156 110 L 8 110 Z`;
  const ДЛИТЕЛЬНОСТЬ = "1.4s";
  // Плавность у линии и у точки должна быть одна и та же, иначе точка
  // отрывается от кончика: она едет по пути, а он «проявляется» рядом.
  const ПЛАВНО = "0.22 1 0.36 1";
  return (
    // Ключ перезапускает рисование при возврате на слайд: без него
    // анимация проигрывается один раз за всё время жизни экрана.
    <svg key={активен ? "идёт" : "стоит"} width="100%" height="150" viewBox="0 0 164 116"
      style={{ overflow: "visible" }} aria-hidden>
      <defs>
        <linearGradient id="встКривая" x1="0" y1="1" x2="1" y2="0">
          <stop offset="0%" stopColor={hexA(T.electric, 0.35)} />
          <stop offset="100%" stopColor="#A6B0FF" />
        </linearGradient>
        {/* Площадь под линией — то, чем биржевой график отличается от
            росчерка: она показывает, что за линией стоит объём. */}
        <linearGradient id="встПлощадь" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%" stopColor={hexA(T.electric, 0.28)} />
          <stop offset="100%" stopColor={hexA(T.electric, 0)} />
        </linearGradient>
        <filter id="встСвечение" x="-40%" y="-40%" width="180%" height="180%">
          <feGaussianBlur stdDeviation="3.4" result="р" />
          <feMerge><feMergeNode in="р" /><feMergeNode in="SourceGraphic" /></feMerge>
        </filter>
        <path id="встПуть" d={линия} />
      </defs>

      {/* Сетка почти не видна: она задаёт масштаб, а не рисует клетку. */}
      {[26, 52, 78, 104].map((y) => (
        <line key={y} x1="0" y1={y} x2="164" y2={y} stroke={hexA("#FFFFFF", 0.045)} strokeWidth="0.8" />
      ))}
      <line x1="0" y1="110" x2="164" y2="110" stroke={hexA("#FFFFFF", 0.09)} strokeWidth="0.8" />
      {/* Деления по времени — короткие штрихи, как на настоящей оси. */}
      {[24, 60, 96, 132].map((x) => (
        <line key={x} x1={x} y1="110" x2={x} y2="113.5" stroke={hexA("#FFFFFF", 0.09)} strokeWidth="0.8" />
      ))}

      <path
        d={площадь}
        fill="url(#встПлощадь)"
        style={активен
          ? { animation: "вступлениеВверх 900ms 520ms cubic-bezier(0.16,1,0.3,1) both" }
          : { opacity: 0 }}
      />
      <path
        d={линия}
        fill="none"
        stroke="url(#встКривая)"
        strokeWidth="2.4"
        strokeLinecap="round"
        filter="url(#встСвечение)"
        /* Своя мера длины: без неё штрих в 240 единиц не совпадает с
           настоящей длиной кривой, линия дорисовывается раньше времени и
           убегает вперёд точки. */
        pathLength="240"
        style={активен ? {
          ["--длина"]: 240,
          strokeDasharray: 240,
          animation: `линияРисуется ${ДЛИТЕЛЬНОСТЬ} cubic-bezier(0.22,1,0.36,1) both`,
        } : { strokeDasharray: 240, strokeDashoffset: 240 }}
      />
      {/* Точка — «сейчас». Она не появляется на конце, а едет по самой
          линии впереди её роста: так это читается как ход рынка, а не
          как нарисованная заранее картинка. Движение задано разметкой, а
          не стилями: CSS-путь понимают не все телефоны, а этот способ
          работает везде, где вообще есть SVG. */}
      {активен ? (
        <g>
          <circle r="7" fill={hexA(T.electric, 0.22)}>
            <animateMotion dur={ДЛИТЕЛЬНОСТЬ} fill="freeze"
              calcMode="spline" keyTimes="0;1" keySplines={ПЛАВНО}>
              <mpath href="#встПуть" />
            </animateMotion>
            <animate attributeName="opacity" values="0;1" dur="0.25s" fill="freeze" />
          </circle>
          <circle r="3.4" fill="#FFFFFF" stroke={T.electric} strokeWidth="1.6">
            <animateMotion dur={ДЛИТЕЛЬНОСТЬ} fill="freeze"
              calcMode="spline" keyTimes="0;1" keySplines={ПЛАВНО}>
              <mpath href="#встПуть" />
            </animateMotion>
            {/* Пока точка стоит на месте старта, её не должно быть видно —
                иначе первые кадры она висит в пустоте слева. */}
            <animate attributeName="opacity" values="0;1" dur="0.25s" fill="freeze" />
          </circle>
        </g>
      ) : (
        <circle cx="156" cy="8" r="3.4" fill="#FFFFFF" opacity="0" />
      )}
    </svg>
  );
}

/* Знаки сетей. Рисуем сами, а не грузим картинки: первый экран должен
   появляться сразу, а два маленьких значка стоят десятка строк. */
function ЗнакTON({ size = 26, color }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" aria-hidden>
      <path d="M3.2 7.4h17.6L12 20.8 3.2 7.4Z" stroke={color} strokeWidth="1.7" strokeLinejoin="round" />
      <path d="M12 7.4v13.4" stroke={color} strokeWidth="1.7" strokeLinecap="round" />
    </svg>
  );
}

function ЗнакSOL({ size = 26, color }) {
  // Три ленты со скошенными краями: верхняя и нижняя наклонены в одну
  // сторону, средняя — в другую.
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" aria-hidden>
      <path d="M6.4 5.2h15.2l-4 3.6H2.4l4-3.6Z" fill={color} />
      <path d="M2.4 10.2h15.2l4 3.6H6.4l-4-3.6Z" fill={color} />
      <path d="M6.4 15.2h15.2l-4 3.6H2.4l4-3.6Z" fill={color} />
    </svg>
  );
}

function ВступлениеСети({ активен }) {
  const монеты = [
    { подпись: "TON", цвет: T.electric, сдвиг: -48, Знак: ЗнакTON },
    { подпись: "SOL", цвет: T.up, сдвиг: 48, Знак: ЗнакSOL },
  ];
  return (
    <div className="flex items-center justify-center" style={{ height: 150, position: "relative" }}>
      {/* Связь между сетями: тонкая дуга под кружками. Она и говорит,
          что это одно приложение, а не два логотипа рядом. */}
      <svg width="200" height="60" viewBox="0 0 200 60" aria-hidden
        style={{ position: "absolute", top: "50%", transform: "translateY(-4px)", opacity: активен ? 1 : 0, transition: `opacity ${EASE}` }}>
        <path d="M52 30 C 82 48, 118 48, 148 30" fill="none"
          stroke={hexA("#FFFFFF", 0.14)} strokeWidth="1" strokeDasharray="3 4" />
      </svg>

      {/* Сдвиг в стороны и покачивание — на разных слоях. В один
          transform они не помещаются: покачивание задаёт его целиком и
          затирает сдвиг, отчего обе монеты слипались в центре. */}
      {монеты.map(({ подпись, цвет, сдвиг, Знак }, i) => (
        <div key={подпись} style={{ position: "absolute", transform: `translateX(${сдвиг}px)` }}>
          <div
            className="flex flex-col items-center justify-center"
            style={{
              width: 78, height: 78, borderRadius: "50%", gap: 2, position: "relative",
              // Стекло, а не плашка: свет падает сверху, снизу поверхность
              // темнее, и от этого кружок читается объёмным.
              background: `radial-gradient(120% 120% at 50% 8%, ${hexA(цвет, 0.16)} 0%, rgba(255,255,255,0.04) 42%, rgba(255,255,255,0.015) 100%)`,
              border: `1px solid ${hexA(цвет, 0.34)}`,
              boxShadow: `inset 0 1px 0 ${hexA("#FFFFFF", 0.12)}, 0 14px 34px ${hexA(цвет, 0.18)}`,
              animation: активен ? `монетаПлывёт 3.2s ease-in-out ${i * 0.6}s infinite` : "none",
            }}
          >
            <Знак color={цвет} />
            <span style={{ fontFamily: displayFont, fontSize: 10, fontWeight: 600, color: hexA(цвет, 0.92), letterSpacing: "0.1em" }}>
              {подпись}
            </span>
          </div>
        </div>
      ))}
    </div>
  );
}

/* Путь запуска: три шага, каждый со своей подписью.
   Прежде здесь стояли три слова без пояснений — «Свои контракты», «Две
   сети», «Запуск за минуту». Они ничего не обещали и ничего не
   объясняли; человек на последнем экране должен видеть, что именно
   произойдёт после кнопки. */
function ВступлениеЗапуск({ активен }) {
  const шаги = [
    ["welcomeStep1", "welcomeStep1Body"],
    ["welcomeStep2", "welcomeStep2Body"],
    ["welcomeStep3", "welcomeStep3Body"],
  ];
  return (
    <div className="flex flex-col justify-center" style={{ gap: 10 }}>
      {шаги.map(([имя, подпись], i) => (
        <div
          key={имя}
          className="flex items-center"
          style={{
            gap: 13, padding: "12px 15px", borderRadius: 18, ...СТЕКЛО,
            animation: активен ? `вступлениеВверх 460ms ${i * 140}ms cubic-bezier(0.16,1,0.3,1) both` : "none",
            opacity: активен ? undefined : 0,
          }}
        >
          {/* Номер моноширинным и с нулём впереди: три строки выстраиваются
              по одной вертикали, а «01» читается как шаг, а не как счётчик. */}
          <span style={{ fontFamily: monoFont, fontSize: 12, color: T.electric, flexShrink: 0, letterSpacing: "0.02em" }}>
            0{i + 1}
          </span>
          <div className="min-w-0">
            <div style={{ fontFamily: displayFont, fontSize: 14, fontWeight: 600, color: "#F4F6FB" }}>{t(имя)}</div>
            <div style={{ fontFamily: bodyFont, fontSize: 12.5, color: hexA("#FFFFFF", 0.56), marginTop: 1, lineHeight: 1.35 }}>{t(подпись)}</div>
          </div>
        </div>
      ))}
    </div>
  );
}

/* Три обещания в строку под первым экраном. Заголовок говорит, что это
   за приложение, а эти три слова — что оно умеет; вместе они читаются
   быстрее любого абзаца. */
function ВступлениеЧипы({ активен }) {
  const чипы = ["welcomeChip1", "welcomeChip2", "welcomeChip3"];
  return (
    <div className="flex items-center" style={{ gap: 6, flexWrap: "wrap" }}>
      {чипы.map((ключ, i) => (
        <span
          key={ключ}
          style={{
            fontFamily: bodyFont, fontSize: 12, color: hexA("#FFFFFF", 0.86),
            padding: "7px 12px", borderRadius: 999, ...СТЕКЛО,
            boxShadow: "inset 0 1px 0 rgba(255,255,255,0.07)",
            animation: активен ? `вступлениеВверх 420ms ${260 + i * 90}ms cubic-bezier(0.16,1,0.3,1) both` : "none",
            opacity: активен ? undefined : 0,
          }}
        >
          {t(ключ)}
        </span>
      ))}
    </div>
  );
}

/* Что именно значит «рынок с первой секунды» — тремя строчками, каждая с
   галочкой. Обещание без разбивки на пункты человек пролистывает. */
function ВступлениеРынок({ активен }) {
  const пункты = ["welcomeMarket1", "welcomeMarket2", "welcomeMarket3"];
  return (
    <div className="flex flex-col" style={{ gap: 10 }}>
      <div style={{
        borderRadius: 18, ...СТЕКЛО, padding: "13px 15px",
        animation: активен ? "вступлениеВверх 440ms 260ms cubic-bezier(0.16,1,0.3,1) both" : "none",
        opacity: активен ? undefined : 0,
      }}>
        {пункты.map((ключ, i) => (
          <div key={ключ} className="flex items-center" style={{ gap: 9, marginTop: i ? 8 : 0 }}>
            <Check size={13} color={T.electric} style={{ flexShrink: 0 }} />
            <span style={{ fontFamily: bodyFont, fontSize: 13, color: hexA("#FFFFFF", 0.86) }}>{t(ключ)}</span>
          </div>
        ))}
      </div>
      <p style={{ fontFamily: bodyFont, color: T.faint, fontSize: 11.5, lineHeight: 1.45, margin: 0 }}>
        {t("welcomeRiskShort")}
      </p>
    </div>
  );
}

/* Кошельки — по одному на сеть. Название и одна строка о том, зачем он:
   человек, который слышит «Phantom» впервые, должен понять из карточки,
   а не из поиска. */
function ВступлениеКошельки({ активен }) {
  const карточки = [
    { имя: "welcomeWallet1", подпись: "welcomeWallet1Body", цвет: T.electric, Знак: ЗнакTON },
    { имя: "welcomeWallet2", подпись: "welcomeWallet2Body", цвет: T.up, Знак: ЗнакSOL },
  ];
  return (
    <div className="flex flex-col" style={{ gap: 8 }}>
      {карточки.map(({ имя, подпись, цвет, Знак }, i) => (
        <div
          key={имя}
          className="flex items-center"
          style={{
            gap: 12, padding: "11px 15px", borderRadius: 18, ...СТЕКЛО,
            animation: активен ? `вступлениеВверх 440ms ${260 + i * 110}ms cubic-bezier(0.16,1,0.3,1) both` : "none",
            opacity: активен ? undefined : 0,
          }}
        >
          <Знак size={18} color={цвет} />
          <div className="min-w-0">
            <div style={{ fontFamily: displayFont, fontSize: 13.5, fontWeight: 600, color: "#F4F6FB" }}>{t(имя)}</div>
            <div style={{ fontFamily: bodyFont, fontSize: 12, color: hexA("#FFFFFF", 0.56), marginTop: 1 }}>{t(подпись)}</div>
          </div>
        </div>
      ))}
    </div>
  );
}

/* Знакомство с приложением.
 *
 * Раньше здесь был один экран со списком: человек либо читал его целиком,
 * либо не читал вовсе. Теперь это четыре страницы, которые листаются
 * пальцем, — каждая говорит одну вещь и показывает её же картинкой.
 *
 * Листание сделано обычной прокруткой с прилипанием: браузер везёт её
 * сам, с инерцией и на своей частоте кадров, а нам остаётся следить, на
 * какой странице человек сейчас. Ручная анимация по касанию выглядела бы
 * ровно так же, но считалась бы в JavaScript.
 *
 * Показывается один раз: закрыл — больше не мешает.
 */
function WelcomeScreen({ onCreate, onLogin, onSkip, insetTop = 0 }) {
  const лист = LEAF_KINDS[2];
  const лента = useRef(null);
  const [страница, setСтраница] = useState(0);

  // У каждой страницы своя картинка сверху и свой блок под текстом:
  // заголовок обещает, картинка показывает, блок — уточняет. Без
  // последнего экраны читались как четыре абзаца подряд.
  const страницы = [
    { title: "welcomeTitle", body: "welcomeSub", арт: null, низ: ВступлениеЧипы },
    { title: "welcomeSlide2Title", body: "welcomeSlide2Body", арт: ВступлениеКривая, низ: ВступлениеРынок },
    { title: "welcomeSlide3Title", body: "welcomeSlide3Body", арт: ВступлениеСети, низ: ВступлениеКошельки },
    { title: "welcomeSlide4Title", body: "welcomeSlide4Body", арт: ВступлениеЗапуск, низ: null },
  ];
  const последняя = страница >= страницы.length - 1;

  function приПрокрутке(e) {
    const el = e.currentTarget;
    const n = Math.round(el.scrollLeft / Math.max(1, el.clientWidth));
    if (n !== страница) setСтраница(Math.max(0, Math.min(страницы.length - 1, n)));
  }

  function листнуть(куда) {
    const el = лента.current;
    if (!el) return;
    el.scrollTo({ left: куда * el.clientWidth, behavior: "smooth" });
  }

  return (
    <div
      style={{
        position: "absolute", inset: 0, zIndex: 880,
        background: T.bg,
        display: "flex", flexDirection: "column", paddingTop: insetTop,
        animation: "fadeInUp 320ms cubic-bezier(0.16,1,0.3,1) both",
        overflow: "hidden",
      }}
    >
      {/* Знак и «пропустить» — над лентой: они не листаются вместе с ней. */}
      <div className="flex items-center justify-between" style={{ padding: "18px 22px 4px", position: "relative", zIndex: 1 }}>
        <div className="flex items-center" style={{ gap: 9 }}>
          <svg width="20" height="23" viewBox="-15 -31 30 34" aria-hidden>
            <defs>
              <linearGradient id="встЗнакЛист" x1="0" y1="0" x2="1" y2="1">
                <stop offset="0%" stopColor="#A9B2FF" />
                <stop offset="100%" stopColor={T.electric} />
              </linearGradient>
            </defs>
            <path d={лист.outline} fill="url(#встЗнакЛист)" />
            <path d={лист.stem} fill="none" stroke={hexA("#FFFFFF", 0.5)} strokeWidth="1" strokeLinecap="round" />
          </svg>
          <span style={{ fontFamily: displayFont, color: "#F4F6FB", fontSize: 16.5, fontWeight: 600, letterSpacing: "-0.01em" }}>Mintly</span>
        </div>
        <button onClick={onSkip} className="fx-tap вст-тихо" style={{ fontFamily: bodyFont, fontSize: 13, color: hexA("#FFFFFF", 0.42), background: "transparent", letterSpacing: "-0.005em" }}>
          {t("welcomeSkip")}
        </button>
      </div>

      {/* Сами страницы. Прилипание по горизонтали, вертикальной прокрутки
          внутри нет — текст на каждой умещается целиком. */}
      <div
        ref={лента}
        onScroll={приПрокрутке}
        className="no-scrollbar"
        style={{
          flex: 1, minHeight: 0, display: "flex", overflowX: "auto", overflowY: "hidden",
          scrollSnapType: "x mandatory", overscrollBehaviorX: "contain",
          position: "relative", zIndex: 1,
        }}
      >
        {страницы.map((стр, i) => {
          const Арт = стр.арт;
          const Низ = стр.низ;
          const активна = страница === i;
          return (
            <section
              key={стр.title}
              style={{
                flex: "0 0 100%", width: "100%", scrollSnapAlign: "start",
                display: "flex", flexDirection: "column", justifyContent: "center",
                // Между картинкой и текстом воздуха больше, чем между
                // строками текста: так экран читается сверху вниз одним
                // движением, а не тремя равными кусками.
                gap: 30, padding: "0 22px",
              }}
            >
              {Арт ? <Арт активен={активна} /> : (
                <div className="flex items-center justify-center" style={{ height: 150, position: "relative" }}>
                  <div style={{
                    position: "absolute", width: 210, height: 210, borderRadius: "50%",
                    background: `radial-gradient(circle, ${hexA(T.electric, 0.22)} 0%, ${hexA(T.electric, 0.06)} 45%, transparent 70%)`,
                    filter: "blur(4px)",
                    animation: активна ? "аураДышит 4s ease-in-out infinite" : "none",
                  }} />
                  {/* Лист объёмный: свет падает слева сверху, у края —
                      тень, жилка светлее самого листа. Плоская заливка
                      выглядела значком из набора иконок. */}
                  <svg width="86" height="98" viewBox="-15 -31 30 34" style={{ position: "relative" }} aria-hidden>
                    <defs>
                      <linearGradient id="встЛист" x1="0.1" y1="0" x2="0.9" y2="1">
                        <stop offset="0%" stopColor="#C3C9FF" />
                        <stop offset="45%" stopColor="#8B96FF" />
                        <stop offset="100%" stopColor="#4A56D8" />
                      </linearGradient>
                      <radialGradient id="встБлик" cx="0.32" cy="0.18" r="0.6">
                        <stop offset="0%" stopColor={hexA("#FFFFFF", 0.55)} />
                        <stop offset="100%" stopColor={hexA("#FFFFFF", 0)} />
                      </radialGradient>
                      <filter id="встЛистСвет" x="-60%" y="-60%" width="220%" height="220%">
                        <feGaussianBlur stdDeviation="1.6" result="р" />
                        <feMerge><feMergeNode in="р" /><feMergeNode in="SourceGraphic" /></feMerge>
                      </filter>
                    </defs>
                    <g style={активна ? { animation: "вступлениеВверх 520ms cubic-bezier(0.16,1,0.3,1) both" } : undefined}>
                      <path d={лист.outline} fill="url(#встЛист)" filter="url(#встЛистСвет)" />
                      <path d={лист.outline} fill="url(#встБлик)" />
                      <path d={лист.stem} fill="none" stroke={hexA("#FFFFFF", 0.55)} strokeWidth="0.9" strokeLinecap="round" />
                    </g>
                  </svg>
                </div>
              )}

              <div className="flex flex-col" style={{ gap: 14 }}>
                <h1 style={{
                  fontFamily: displayFont, color: "#F4F6FB", fontSize: 26, lineHeight: 1.24,
                  // Заголовок крупный, но не тяжёлый: плотность букв важнее
                  // жирности, иначе две строки превращаются в пятно.
                  fontWeight: 600, letterSpacing: "-0.028em", margin: 0, maxWidth: "19ch",
                  animation: активна ? "вступлениеВверх 480ms 80ms cubic-bezier(0.16,1,0.3,1) both" : "none",
                }}>
                  {t(стр.title)}
                </h1>
                <p style={{
                  fontFamily: bodyFont, color: hexA("#FFFFFF", 0.56), fontSize: 14.5, lineHeight: 1.62,
                  margin: 0, maxWidth: "36ch", letterSpacing: "-0.003em",
                  animation: активна ? "вступлениеВверх 480ms 180ms cubic-bezier(0.16,1,0.3,1) both" : "none",
                }}>
                  {t(стр.body)}
                </p>
                {Низ ? <div style={{ marginTop: 6 }}><Низ активен={активна} /></div> : null}
              </div>
            </section>
          );
        })}
      </div>

      {/* Точки и кнопки. Точка — не только указатель, но и кнопка: на
          последнюю страницу можно прыгнуть сразу. */}
      <div className="flex flex-col" style={{ gap: 14, padding: "10px 22px 26px", position: "relative", zIndex: 1 }}>
        <div className="flex items-center justify-center" style={{ gap: 7, paddingBottom: 2 }}>
          {страницы.map((стр, i) => {
            const тут = страница === i;
            const пройдена = i < страница;
            return (
              <button
                key={стр.title}
                onClick={() => листнуть(i)}
                className="fx-tap"
                aria-label={`${i + 1}`}
                style={{
                  // Пройденные страницы остаются подсвеченными: полоска
                  // читается как путь, а не как четыре одинаковые точки.
                  width: тут ? 26 : 6, height: 6, borderRadius: 999,
                  background: тут
                    ? `linear-gradient(90deg, ${T.electric}, #A6B0FF)`
                    : пройдена ? hexA(T.electric, 0.42) : hexA("#FFFFFF", 0.16),
                  boxShadow: тут ? `0 0 12px ${hexA(T.electric, 0.5)}` : "none",
                  transition: `width ${EASE}, background ${EASE}, box-shadow ${EASE}`,
                  padding: 0, border: "none",
                }}
              />
            );
          })}
        </div>

        {последняя ? (
          <div className="flex flex-col" style={{ gap: 10, animation: "вступлениеВверх 420ms both" }}>
            <button
              onClick={onCreate}
              className="fx-tap вст-кнопка w-full flex items-center justify-center gap-2"
              style={{
                padding: "17px 0", borderRadius: 20,
                background: `linear-gradient(135deg, #8A93FF 0%, ${T.electric} 52%, #5A66EE 100%)`,
                color: PRISM_TEXT, border: "none",
                boxShadow: `inset 0 1px 0 ${hexA("#FFFFFF", 0.3)}, 0 14px 34px ${hexA(T.electric, 0.34)}`,
                fontFamily: displayFont, fontWeight: 600, fontSize: 15.5, letterSpacing: "-0.01em",
              }}
            >
              {t("welcomeCreate")}
            </button>
            <button
              onClick={onLogin}
              className="fx-tap вст-кнопка w-full flex items-center justify-center gap-2"
              style={{
                padding: "15px 0", borderRadius: 20, ...СТЕКЛО,
                color: "#F4F6FB", fontFamily: displayFont, fontWeight: 600, fontSize: 14.5,
              }}
            >
              <Send size={14} /> {t("welcomeLogin")}
            </button>
            <p style={{ fontFamily: bodyFont, color: hexA("#FFFFFF", 0.34), fontSize: 11.5, lineHeight: 1.5, textAlign: "center", margin: "4px 0 0" }}>
              {t("welcomeRisk")}
            </p>
          </div>
        ) : (
          <button
            onClick={() => листнуть(страница + 1)}
            className="fx-tap вст-кнопка w-full flex items-center justify-center gap-2"
            style={{
              padding: "17px 0", borderRadius: 20,
              // Свет внутри кнопки идёт наискось: ровная заливка на тёмном
              // фоне выглядит наклейкой, а не поверхностью.
              background: `linear-gradient(135deg, #8A93FF 0%, ${T.electric} 52%, #5A66EE 100%)`,
              color: PRISM_TEXT, border: "none",
              boxShadow: `inset 0 1px 0 ${hexA("#FFFFFF", 0.3)}, 0 14px 34px ${hexA(T.electric, 0.34)}`,
              fontFamily: displayFont, fontWeight: 600, fontSize: 15.5, letterSpacing: "-0.01em",
            }}
          >
            {t("welcomeNext")} <ChevronRight size={16} />
          </button>
        )}
      </div>
    </div>
  );
}

function BootSplash({ steps, done, insetTop = 0 }) {
  const readyCount = steps.filter((s) => s.done).length;
  const progress = steps.length ? readyCount / steps.length : 1;

  return (
    <div
      style={{
        position: "absolute", inset: 0, zIndex: 900,
        background: T.bg,
        display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center",
        gap: 18, paddingTop: insetTop,
        opacity: done ? 0 : 1,
        transition: "opacity 420ms ease-out",
      }}
    >

      <div style={{ position: "relative", zIndex: 1, display: "flex", flexDirection: "column", alignItems: "center", gap: 16 }}>
        <LeafLoader progress={progress} size={104} />
        <div style={{ width: 132, height: 3, borderRadius: 999, background: T.surfaceHi, overflow: "hidden" }}>
          <div style={{
            width: `${Math.round(progress * 100)}%`, height: "100%", borderRadius: 999,
            background: T.electric, transition: "width 420ms cubic-bezier(0.16,1,0.3,1)",
          }} />
        </div>
      </div>
    </div>
  );
}

/* Одна карточка витрины. Отдельный мемоизированный компонент: при выборе
   предмета меняются ровно две карточки из десятка, а остальные — со всеми
   своими размытиями и анимациями — вообще не перерисовываются. Раньше
   перерисовывались все, и оранжевая рамка появлялась с задержкой. */
/* Витрина только продаёт. Надеть купленное можно в профиле, кнопкой
   «Редактировать профиль»: примерка — это про себя, а не про кассу, и
   раньше два действия жили на одной плитке и путались между собой. */
const ShopItem = React.memo(function ShopItem({ item, kind, equipped, owned, price, affordable, onOwnedTap, onBuy, onTooPoor }) {
  const handle = useCallback(() => {
    if (owned) return onOwnedTap && onOwnedTap(kind);
    if (!affordable) return onTooPoor && onTooPoor(price);
    return onBuy(kind, item.id);
  }, [owned, affordable, price, onOwnedTap, onBuy, onTooPoor, kind, item.id]);
  const плитка = useRef(null);
  const наЭкране = useOnScreen(плитка);

  return (
    <button
      ref={плитка}
      onClick={handle}
      // Подложки у плитки больше нет: рамка вокруг рамки — это две
      // рамки, и витрина превращалась в сетку контейнеров вместо сетки
      // предметов. Сам предмет остаётся в своём окне, подпись и цена —
      // просто под ним.
      // Надетое отмечается самим окном предмета, а не рамкой вокруг всей
      // плитки: та обводила заодно подпись и слово «Надето», упиралась в
      // края сетки и рисовалась прямыми углами поверх скруглённого
      // превью.
      className={`fx-card flex flex-col items-center gap-2.5 p-0${наЭкране ? "" : " fx-frozen"}`}
      style={{
        background: "transparent", border: "none",
        position: "relative", overflow: "hidden", contain: "paint",
        // Витрина длинная, а на экране помещается четыре плитки. Всё
        // остальное браузер до сих пор честно рисовал и анимировал —
        // два с лишним сотни движущихся слоёв разом, из-за чего нажатия
        // по нижнему меню отрабатывали через раз. С этим правилом
        // невидимые плитки не считаются вовсе; размер задан заранее,
        // чтобы полоса прокрутки не прыгала.
        contentVisibility: "auto",
        containIntrinsicSize: "190px 210px",
      }}
    >
      {/* Некупленное не гасим прозрачностью: предмет видно целиком, на
          то он и витрина, а что он ещё не твой — сказано ценой. */}
      <div style={{
        position: "relative", width: "100%", height: 104, borderRadius: 16, overflow: "hidden",
        background: T.surface,
        border: `1px solid ${equipped ? T.electric : T.line}`,
        // Второй контур внутрь: снаружи его срезал бы overflow плитки, а
        // так надетое видно с одного взгляда и по краю ничего не торчит.
        boxShadow: equipped ? `inset 0 0 0 1px ${hexA(T.electric, 0.45)}` : "none",
        display: "flex", alignItems: "center", justifyContent: "center",
      }}>
        {kind === "card" && <ProfileCardBg cardId={item.id} height={96} radius={16} showcase />}
        <div style={{ position: "relative", zIndex: 1 }}>
          {/* Внутри рамки — просто чёрный кружок: витрина про сам
              предмет, а своя аватарка тут только отвлекает. */}
          <AvatarFrame frameId={kind === "frame" ? item.id : "none"} size={62}>
            <div style={{ width: "100%", height: "100%", background: T.bg }} />
          </AvatarFrame>
        </div>
      </div>
      <div className="flex items-center gap-1.5">
        <span style={{ fontFamily: displayFont, color: T.ice, fontSize: 14, fontWeight: 600 }}>{pickLabel(item.label)}</span>
        {equipped && <CheckCircle2 size={13} color={T.electric} />}
      </div>
      {owned ? (
        <span style={{ fontFamily: bodyFont, fontSize: 12, color: equipped ? T.electric : T.muted, textAlign: "center", lineHeight: 1.3 }}>
          {equipped ? t("shopEquipped") : t("shopOwned")}
        </span>
      ) : (
        <span className="flex items-center gap-1" style={{ fontFamily: monoFont, fontSize: 12.5, fontWeight: 600, color: affordable ? T.electric : T.muted }}>
          <CoinIcon size={12} dim={!affordable} /> {price}
        </span>
      )}
    </button>
  );
});

/* AchievementsView — отдельная страница достижений.

   На ней видно и что уже закрыто, и что за это даётся: у награды
   рисуется сам предмет — рамка кружком, карточка полоской подложки, —
   чтобы не гадать по названию. */
function AchievementsView({ achievements = [], onGoShop, onBack }) {
  const done = achievements.filter((a) => a.done).length;
  return (
    <div className="fx-view flex flex-col gap-4 pt-2">
      {onBack && !hasTelegramBack() && (
        <button onClick={onBack} className="fx-tap flex items-center gap-1 self-start" style={{ fontFamily: bodyFont, fontSize: 14.5, color: T.muted }}>
          <ChevronLeft size={16} /> {t("back")}
        </button>
      )}
      <div>
        <span style={{ fontFamily: displayFont, color: T.ice, fontSize: 34, fontWeight: 800, letterSpacing: "-0.02em" }}>{t("achievementsTitle")}</span>
        <p style={{ fontFamily: bodyFont, color: T.muted, fontSize: 14, lineHeight: 1.5, marginTop: 4 }}>{t("achievementsIntro")}</p>
      </div>

      {/* Общий прогресс — без подложки: сама полоса и есть виджет, а
          карточка вокруг двух строк только добавляла слой. */}
      <div>
        <div className="flex items-center justify-between" style={{ marginBottom: 8 }}>
          <span style={{ fontFamily: bodyFont, color: T.muted, fontSize: 13 }}>{t("achProgress")}</span>
          <span style={{ fontFamily: monoFont, color: T.ice, fontSize: 14.5, fontWeight: 700 }}>{tf("achUnlockedOf", { done, total: achievements.length })}</span>
        </div>
        <div style={{ height: 6, borderRadius: 3, background: T.surfaceHi, overflow: "hidden" }}>
          <div style={{ width: `${achievements.length ? (done / achievements.length) * 100 : 0}%`, height: "100%", background: T.electric, transition: `width ${EASE}` }} />
        </div>
      </div>

      <div className="flex flex-col gap-2">
        {achievements.map((a, i) => {
          return (
            <div
              key={a.id}
              className="fx-card rounded-[22px] p-3.5 flex items-center gap-3"
              style={{
                background: T.surface,
                border: `1px solid ${a.done ? hexA(a.color, 0.45) : T.line}`,
                animationDelay: `${i * 40}ms`,
                position: "relative", overflow: "hidden",
              }}
            >
              <div style={{
                width: 40, height: 40, borderRadius: 12, flexShrink: 0,
                background: a.done ? hexA(a.color, 0.16) : T.surfaceHi,
                display: "flex", alignItems: "center", justifyContent: "center",
              }}>
                <a.icon size={18} color={a.done ? a.color : T.muted} />
              </div>

              <div className="min-w-0" style={{ flex: 1 }}>
                <div className="flex items-center gap-1.5">
                  <span style={{ fontFamily: displayFont, color: T.ice, fontSize: 14.5, fontWeight: 700 }}>{a.label}</span>
                  {a.done && <CheckCircle2 size={13} color={a.color} />}
                </div>
                <div style={{ fontFamily: bodyFont, color: T.muted, fontSize: 12.5, lineHeight: 1.35, marginTop: 2 }}>{a.hint}</div>
                {!a.done && a.target > 1 && (
                  <div className="flex items-center gap-2" style={{ marginTop: 6 }}>
                    <div style={{ flex: 1, height: 4, borderRadius: 2, background: T.surfaceHi, overflow: "hidden" }}>
                      <div style={{ width: `${Math.min(100, (a.value / a.target) * 100)}%`, height: "100%", background: hexA(a.color, 0.65) }} />
                    </div>
                    <span style={{ fontFamily: monoFont, fontSize: 11.5, color: T.muted }}>{achProgressText(a)}</span>
                  </div>
                )}
              </div>

              {/* Награда — монеты для магазина. Предмет за достижение
                  больше не закреплён: что купить, человек решает сам. */}
              {a.coins > 0 && (
                <div className="flex items-center gap-1 flex-shrink-0 rounded-full px-2.5 py-1"
                  style={{ background: a.done ? hexA(T.electric, 0.14) : T.surfaceHi, border: `1px solid ${a.done ? hexA(T.electric, 0.4) : T.line}` }}>
                  <CoinIcon size={12} dim={!a.done} />
                  <span style={{ fontFamily: monoFont, fontSize: 12.5, fontWeight: 700, color: a.done ? T.electric : T.muted }}>
                    +{a.coins}
                  </span>
                </div>
              )}
            </div>
          );
        })}
      </div>

      {onGoShop && (
        <button
          onClick={onGoShop}
          className="fx-tap w-full flex items-center justify-center gap-2 rounded-[20px] py-3"
          style={{ background: T.surface, border: `1px solid ${T.line}`, fontFamily: bodyFont, fontSize: 14.5, color: T.ice }}
        >
          <ShoppingBag size={15} color={T.electric} /> {t("achGoShop")}
        </button>
      )}
    </div>
  );
}

/* ShopView — витрина косметики: рамки для аватарки и карточки профиля.
   Предметы применяются мгновенно и запоминаются на устройстве, поэтому
   «купить» здесь — это «надеть»: отдельного баланса у магазина нет. */
/* Окно подтверждения покупки. Раньше нажатие на предмет сразу списывало
   монеты — а они конечные, и промахнуться по соседней карточке проще
   простого. Теперь сначала показываем сам предмет крупно, цену и сколько
   останется после покупки. */
function BuySheet({ item, kind, coins, cosmetics, onBuy, onClose }) {
  if (!item || typeof document === "undefined") return null;
  const price = item.price || 0;
  const left = coins - price;
  // Предмет показываем не сам по себе, а вместе с надетым: покупают
  // рамку — она стоит на своей карточке, покупают карточку — на ней
  // надетая рамка. Так сразу видно, подходят они друг к другу или нет.
  const previewCard = kind === "card" ? item.id : (cosmetics ? cosmetics.card : "none");
  const previewFrame = kind === "frame" ? item.id : (cosmetics ? cosmetics.frame : "none");
  return createPortal(
    <div
      className="fx-modal-back"
      onClick={onClose}
      style={{
        position: "fixed", inset: 0, zIndex: 90, background: "rgba(0,0,0,0.8)",
        backdropFilter: "blur(4px)", display: "flex", alignItems: "flex-end", justifyContent: "center",
        padding: "0 12px calc(12px + var(--tg-inset-bottom, 0px))",
        paddingTop: "var(--tg-inset-top, 0px)",
      }}
    >
      <div
        onClick={(e) => e.stopPropagation()}
        style={{
          width: "100%", maxWidth: 420, background: T.surface,
          border: `1px solid ${T.lineHi}`, borderRadius: 26, padding: "22px 22px 18px",
          maxHeight: "100%", overflowY: "auto",
          display: "flex", flexDirection: "column", alignItems: "center", textAlign: "center",
          animation: "wreathSheetUp 340ms cubic-bezier(0.16,1,0.3,1) both",
        }}
      >
        {/* Предмет крупно: покупают глазами, а не по названию. */}
        <div style={{ position: "relative", width: "100%", height: 132, borderRadius: 18, overflow: "hidden", background: T.surfaceHi, display: "flex", alignItems: "center", justifyContent: "center" }}>
          <ProfileCardBg cardId={previewCard} height={132} radius={18} />
          <div style={{ position: "relative", zIndex: 1 }}>
            <AvatarFrame frameId={previewFrame} size={84}>
              <div style={{ width: "100%", height: "100%", background: T.bg }} />
            </AvatarFrame>
          </div>
        </div>

        <span style={{ fontFamily: displayFont, color: T.ice, fontSize: 19.5, fontWeight: 700, marginTop: 14 }}>{pickLabel(item.label)}</span>
        <span style={{ fontFamily: bodyFont, color: T.muted, fontSize: 13, marginTop: 2 }}>
          {kind === "frame" ? t("shopTabFrames") : t("shopTabCards")}
        </span>

        <div className="flex items-center justify-between w-full rounded-[18px] px-4 py-3" style={{ marginTop: 14, background: T.bg, border: `1px solid ${T.line}` }}>
          <span style={{ fontFamily: bodyFont, color: T.muted, fontSize: 13 }}>{t("shopLeftAfter")}</span>
          <span className="flex items-center gap-1.5">
            <CoinIcon size={14} />
            <span style={{ fontFamily: monoFont, color: T.ice, fontSize: 14.5, fontWeight: 700 }}>{left}</span>
          </span>
        </div>

        <button
          onClick={() => onBuy(kind, item.id)}
          className="fx-tap w-full flex items-center justify-center gap-2 rounded-[20px] py-3.5"
          style={{ marginTop: 12, background: PRISM, color: PRISM_TEXT, fontFamily: displayFont, fontWeight: 700, fontSize: 15.5 }}
        >
          {tf("shopBuyFor", { n: price })}
        </button>
        <button
          onClick={onClose}
          className="fx-tap w-full rounded-[20px] py-2.5"
          style={{ marginTop: 8, background: "transparent", border: "none", fontFamily: bodyFont, fontSize: 14.5, color: T.muted }}
        >
          {t("cancel")}
        </button>
      </div>
    </div>,
    document.body,
  );
}

/* Подтверждение перед открытием кейса.

   То же правило, что и с покупкой вещи: монеты не уходят по одному
   нажатию. Здесь же видно, сколько останется и что вообще может выпасть
   — иначе непонятно, за что платишь. */
function ChestBuySheet({ coins, owned, onConfirm, onClose }) {
  if (typeof document === "undefined") return null;
  const pool = chestPool(owned);
  const left = Math.max(0, coins - CHEST_PRICE);
  const хватает = coins >= CHEST_PRICE && pool.length > 0;

  return createPortal(
    <div
      className="fx-modal-back"
      onClick={onClose}
      style={{
        position: "fixed", inset: 0, zIndex: 90, background: "rgba(0,0,0,0.85)",
        backdropFilter: "blur(4px)", display: "flex", alignItems: "flex-end", justifyContent: "center",
        padding: "0 12px calc(12px + var(--tg-inset-bottom, 0px))",
        paddingTop: "var(--tg-inset-top, 0px)",
      }}
    >
      <div
        onClick={(e) => e.stopPropagation()}
        style={{
          width: "100%", maxWidth: 420, background: T.surface,
          border: `1px solid ${T.lineHi}`, borderRadius: 26, padding: "22px 22px 18px",
          maxHeight: "100%", overflowY: "auto",
          display: "flex", flexDirection: "column", alignItems: "center", textAlign: "center",
          animation: "wreathSheetUp 340ms cubic-bezier(0.16,1,0.3,1) both",
        }}
      >
        {/* Кейс — то, ради чего открыто окно, поэтому он крупнее всего
            остального. Высота коробки идёт следом за масштабом: рисунок
            188 точек ростом, и меньшая коробка обрезала бы его сверху. */}
        <div style={{ transform: "scale(0.8)", transformOrigin: "center", height: 150, display: "flex", alignItems: "center" }}>
          <ChestArt open={false} />
        </div>

        <span style={{ fontFamily: displayFont, color: T.ice, fontSize: 19.5, fontWeight: 700, marginTop: 6 }}>{t("chestTitle")}</span>
        <span style={{ fontFamily: bodyFont, color: T.muted, fontSize: 13, marginTop: 4, lineHeight: 1.45, maxWidth: 280 }}>
          {t("chestSub")}
        </span>

        {/* Что может выпасть: несколько вещей из тех, которых ещё нет. */}
        {pool.length > 0 && (
          <div className="flex items-center justify-center gap-2" style={{ marginTop: 14 }}>
            {pool.slice(0, 4).map((это) => (
              <div key={`${это.kind}:${это.id}`} style={{
                width: 52, height: 52, borderRadius: 13, overflow: "hidden", position: "relative",
                background: T.bg, border: `1px solid ${T.line}`,
                display: "flex", alignItems: "center", justifyContent: "center",
              }}>
                {это.kind === "frame" ? (
                  <AvatarFrame frameId={это.id} size={36}>
                    <div style={{ width: "100%", height: "100%", background: T.bg }} />
                  </AvatarFrame>
                ) : (
                  <ProfileCardBg cardId={это.id} height={52} radius={13} />
                )}
              </div>
            ))}
            {pool.length > 4 && (
              <span style={{ fontFamily: monoFont, color: T.muted, fontSize: 13 }}>+{pool.length - 4}</span>
            )}
          </div>
        )}

        <div className="flex items-center justify-between w-full rounded-[18px] px-4 py-3" style={{ marginTop: 16, background: T.bg, border: `1px solid ${T.line}` }}>
          <span style={{ fontFamily: bodyFont, color: T.muted, fontSize: 13 }}>{t("shopLeftAfter")}</span>
          <span className="flex items-center gap-1.5">
            <CoinIcon size={14} dim={!хватает} />
            <span style={{ fontFamily: monoFont, color: хватает ? T.ice : T.muted, fontSize: 14.5, fontWeight: 700 }}>{left}</span>
          </span>
        </div>

        <button
          onClick={() => хватает && onConfirm()}
          disabled={!хватает}
          className="fx-tap w-full flex items-center justify-center gap-2 rounded-[20px] py-3.5"
          style={{
            marginTop: 12,
            background: хватает ? PRISM : T.surfaceHi,
            color: хватает ? PRISM_TEXT : T.muted,
            border: хватает ? "none" : `1px solid ${T.line}`,
            fontFamily: displayFont, fontWeight: 700, fontSize: 15.5,
          }}
        >
          <CoinIcon size={16} tone={хватает ? PRISM_TEXT : T.muted} />
          {pool.length ? tf("chestOpen", { n: CHEST_PRICE }) : t("chestEmpty")}
        </button>
        <button
          onClick={onClose}
          className="fx-tap w-full rounded-[20px] py-2.5"
          style={{ marginTop: 8, background: "transparent", border: "none", fontFamily: bodyFont, fontSize: 14.5, color: T.muted }}
        >
          {t("cancel")}
        </button>
      </div>
    </div>,
    document.body,
  );
}

/* Лента перебора при открытии кейса: размер плитки и место выигрышной.
   Тридцать штук — столько, чтобы разгон чувствовался, но ожидание не
   тянулось. */
const ROLL_ITEM = 76;
const ROLL_WIN_INDEX = 30;
const ROLL_MS = 2800;
const ROLL_EASE = [0.11, 0.75, 0.1, 1];

/* Когда мимо указателя проходит очередная вещь — по этим моментам и
   бьёт вибрация.

   Ровный метроном тут не годится: лента резко стартует и долго
   выбегает, а рука в это время чувствовала бы посторонний ритм поверх
   картинки. Поэтому щелчки считаются по той же кривой, по которой едет
   лента. Кривая отвечает на вопрос «сколько пути пройдено к моменту t»,
   а нужно обратное — когда пройдено ровно k делений; идём по параметру
   кривой и снимаем отсечки.

   Первые деления пролетают за 13 мс друг от друга. Их выбрасываем:
   телефон столько вибраций подряд не отрабатывает, Telegram лишние
   глотает, и вместо разгона в руке получилась бы каша. */
const ROLL_TICK_MIN_GAP = 55;
function rollTickTimes(steps, dur) {
  const bez = (s, a, b) => 3 * (1 - s) * (1 - s) * s * a + 3 * (1 - s) * s * s * b + s * s * s;
  const [x1, y1, x2, y2] = ROLL_EASE;
  const out = [];
  let деление = 1;
  let прошлый = -Infinity;
  for (let i = 1; i <= 600 && деление <= steps; i++) {
    const s = i / 600;
    const путь = bez(s, y1, y2); // ось Y кривой — какая доля пути пройдена
    while (деление <= steps && путь >= деление / steps) {
      const время = bez(s, x1, x2) * dur; // ось X — в какой момент это случилось
      if (время - прошлый >= ROLL_TICK_MIN_GAP) {
        out.push(время);
        прошлый = время;
      }
      деление++;
    }
  }
  return out;
}
const ROLL_TICKS = rollTickTimes(ROLL_WIN_INDEX, ROLL_MS);

/* Сам кейс.

   Не ларец, а транспортный кейс: низкий широкий короб с металлическими
   накладками по углам, двумя защёлками и светящимися линиями по швам.
   Знак приложения вынесен на лицевую панель шестигранным бейджем — по
   нему предмет и опознаётся с любого размера.

   Рисуется в перспективе три четверти: крышка уходит вглубь трапецией,
   лицевая стенка стоит фронтально. Откидываясь, крышка встаёт на ребро
   и показывает изнанку, а из короба бьёт свет. */
function ChestArt({ open }) {
  const cx = 80;
  const кшир = 54;      // половина ширины короба
  const пшир = 57;      // половина ширины крышки: она шире и нависает
  const зшир = 45;      // половина дальней кромки крышки — перспектива
  const тлщ = 9;        // торец крышки, видный полосой над коробом
  const верх = 88;      // переднее ребро верхней плоскости
  const плечо = верх + тлщ; // верх короба — уходит под крышку
  const шов = плечо + 2;    // стык крышки и короба
  const низ = 124;      // дно
  const глуб = 20;      // насколько крышка уходит назад
  const скос = 9;       // срез углов, как у кнопок приложения
  const взшир = зшир - (пшир - кшир); // дальняя кромка проёма в коробе

  const крышка = `${cx - пшир},${верх} ${cx - зшир},${верх - глуб} ${cx + зшир},${верх - глуб} ${cx + пшир},${верх}`;
  const проём = `${cx - кшир},${плечо} ${cx - взшир},${плечо - глуб} ${cx + взшир},${плечо - глуб} ${cx + кшир},${плечо}`;

  // Шестигранный бейдж: вершины слева и справа, верх и низ плоские.
  const гекс = (x, y, w, h) => [
    [x - w, y], [x - w * 0.5, y - h], [x + w * 0.5, y - h],
    [x + w, y], [x + w * 0.5, y + h], [x - w * 0.5, y + h],
  ].map((p) => p.join(",")).join(" ");

  const лист = LEAF_KINDS[2];
  // Знак внутри бейджа. Лист нарисован в своих координатах ростом около
  // тридцати точек с центром выше нуля — отсюда и сдвиг.
  const Знак = ({ x, y, s, opacity = 1 }) => (
    <g transform={`translate(${x} ${y + 14 * s}) scale(${s})`} opacity={opacity}>
      <path d={лист.outline} fill="#fff" opacity="0.92" />
      {лист.veins.slice(0, 5).map((v, i) => (
        <path key={i} d={v} fill="none" stroke={T.electric} strokeWidth="0.9" strokeLinecap="round" opacity="0.55" />
      ))}
    </g>
  );

  return (
    <svg width="196" height="188" viewBox="0 0 160 160" style={{ position: "relative", overflow: "visible" }}>
      <defs>
        {/* Металл накладок: сверху светлее, снизу уходит в тень. */}
        <linearGradient id="chSteel" x1="0" y1="0" x2="0.3" y2="1">
          <stop offset="0%" stopColor="#6E7480" />
          <stop offset="45%" stopColor="#3D414B" />
          <stop offset="100%" stopColor="#20232A" />
        </linearGradient>
        <linearGradient id="chFront" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%" stopColor="#1A1C22" />
          <stop offset="55%" stopColor="#0F1014" />
          <stop offset="100%" stopColor="#07080A" />
        </linearGradient>
        <linearGradient id="chLid" x1="0.1" y1="1" x2="0.9" y2="0">
          <stop offset="0%" stopColor="#24262E" />
          <stop offset="45%" stopColor="#16181D" />
          <stop offset="100%" stopColor="#0D0E12" />
        </linearGradient>
        {/* Блик на крышке: узкая светлая полоса поперёк. */}
        <linearGradient id="chSheen" x1="0" y1="0" x2="1" y2="0.6">
          <stop offset="0%" stopColor="#fff" stopOpacity="0" />
          <stop offset="45%" stopColor="#fff" stopOpacity="0.1" />
          <stop offset="60%" stopColor="#fff" stopOpacity="0" />
        </linearGradient>
        <radialGradient id="chBadge" cx="0.5" cy="0.5" r="0.5">
          <stop offset="0%" stopColor={T.electric} stopOpacity="0.95" />
          <stop offset="70%" stopColor={T.electric} stopOpacity="0.5" />
          <stop offset="100%" stopColor={T.electric} stopOpacity="0.18" />
        </radialGradient>
        <linearGradient id="chInner" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%" stopColor={T.electric} stopOpacity="0.95" />
          <stop offset="100%" stopColor={T.electric} stopOpacity="0.1" />
        </linearGradient>
        <linearGradient id="chBeam" x1="0" y1="1" x2="0" y2="0">
          <stop offset="0%" stopColor={T.electric} stopOpacity="0.5" />
          <stop offset="100%" stopColor={T.electric} stopOpacity="0" />
        </linearGradient>
        {/* Изнанка крышки: у ближней кромки её достаёт свет из короба,
            дальше уходит в тень. */}
        <linearGradient id="chBack" x1="0" y1="1" x2="0" y2="0">
          <stop offset="0%" stopColor={T.electric} stopOpacity="0.5" />
          <stop offset="55%" stopColor="#141418" stopOpacity="1" />
          <stop offset="100%" stopColor="#0a0a0d" stopOpacity="1" />
        </linearGradient>
        {/* Светящаяся линия: ярче к середине, к краям сходит на нет. */}
        <linearGradient id="chSlit" x1="0" y1="0" x2="1" y2="0">
          <stop offset="0%" stopColor={T.electric} stopOpacity="0" />
          <stop offset="50%" stopColor={T.electric} stopOpacity="0.9" />
          <stop offset="100%" stopColor={T.electric} stopOpacity="0" />
        </linearGradient>
        <linearGradient id="chSlitHot" x1="0" y1="0" x2="1" y2="0">
          <stop offset="0%" stopColor={T.electric} stopOpacity="0" />
          <stop offset="30%" stopColor={T.electric} stopOpacity="0.8" />
          <stop offset="50%" stopColor="#fff" stopOpacity="0.95" />
          <stop offset="70%" stopColor={T.electric} stopOpacity="0.8" />
          <stop offset="100%" stopColor={T.electric} stopOpacity="0" />
        </linearGradient>
      </defs>

      {/* Тень: широкая мягкая плюс узкая плотная под самым коробом. */}
      <ellipse cx={cx} cy={низ + 10} rx="66" ry="9" fill="#000" opacity="0.5" />
      <ellipse cx={cx} cy={низ + 8} rx="38" ry="4.5" fill="#000" opacity="0.7" />
      {/* Отсвет неона на полу: кейс светится, значит светит и вокруг. */}
      <ellipse cx={cx} cy={низ + 7} rx="52" ry="6" fill={T.electric} opacity="0.16" style={{ filter: "blur(5px)" }} />

      {/* Луч наружу — только когда открыт. Бьёт из проёма короба. */}
      {open && (
        <path
          d={`M${cx - взшир},${плечо - глуб} L${cx + взшир},${плечо - глуб} L${cx + взшир + 36},-50 L${cx - взшир - 36},-50 Z`}
          fill="url(#chBeam)"
          style={{ transformOrigin: `${cx}px ${плечо - глуб}px`, animation: "chestBeam 560ms ease-out both" }}
        />
      )}

      {/* Нутро: дальняя стенка и дно, залитые светом. */}
      {open && (
        <>
          <polygon points={проём} fill="url(#chInner)" />
          <polygon
            points={`${cx - взшир},${плечо - глуб} ${cx + взшир},${плечо - глуб} ${cx + взшир - 4},${плечо - глуб + 9} ${cx - взшир + 4},${плечо - глуб + 9}`}
            fill="#000" opacity="0.45"
          />
        </>
      )}

      {/* Лицевая стенка короба со срезанными углами. */}
      <path
        d={`M${cx - кшир},${плечо} H${cx + кшир} V${низ - скос} L${cx + кшир - скос},${низ} H${cx - кшир + скос} L${cx - кшир},${низ - скос} Z`}
        fill="url(#chFront)" stroke="#333741" strokeWidth="1.6" strokeLinejoin="round"
      />

      {/* Ломаная неоновая линия по низу лицевой стенки — та самая
          «подсветка корпуса», по которой кейс и читается техникой, а не
          деревянным ящиком. Идёт двумя отрезками, огибая бейдж. */}
      {[-1, 1].map((s) => {
        const внеш = cx + s * (кшир - 14);
        const внутр = cx + s * 20;
        const y = низ - 9;
        const d = `M${внеш},${y} H${внутр}`;
        return (
          <g key={s}>
            <path d={d} fill="none" stroke={T.electric} strokeWidth="4.5" opacity="0.35" strokeLinecap="round" strokeLinejoin="round" style={{ filter: "blur(2.5px)" }} />
            <path d={d} fill="none" stroke={T.electric} strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" />
          </g>
        );
      })}

      {/* Металлические уголки корпуса: накладка по краю с завёрнутым
          низом, как на транспортных ящиках, и парой заклёпок. */}
      {[-1, 1].map((s) => {
        const x = cx + s * кшир;
        return (
          <g key={s}>
            <path
              d={`M${x},${плечо + 1} H${x - s * 11} V${низ - 1} H${x - s * скос} L${x},${низ - скос - 1} Z`}
              fill="url(#chSteel)" stroke="#4A4F5A" strokeWidth="0.8" strokeLinejoin="round"
            />
            <circle cx={x - s * 5.5} cy={плечо + 6} r="1.3" fill="#0E1013" opacity="0.9" />
            <circle cx={x - s * 5.5} cy={низ - 8} r="1.3" fill="#0E1013" opacity="0.9" />
          </g>
        );
      })}

      {/* Бейдж со знаком приложения — центр лицевой панели. */}
      <g>
        <polygon points={гекс(cx, низ - 15, 19, 11)} fill={T.electric} opacity="0.25" style={{ filter: "blur(4px)" }} />
        <polygon points={гекс(cx, низ - 15, 16, 9.5)} fill="#0C0D11" stroke="#41465142" strokeWidth="3" strokeLinejoin="round" />
        <polygon points={гекс(cx, низ - 15, 13, 7.7)} fill="url(#chBadge)" stroke={T.electric} strokeWidth="1.2" strokeLinejoin="round" />
        <Знак x={cx} y={низ - 20} s={0.42} />
      </g>

      {/* Нижняя половина защёлок — она на коробе и остаётся на месте,
          когда крышка откидывается. Верхний язычок нарисован внутри
          группы крышки и уезжает вместе с ней. */}
      {[-1, 1].map((s) => {
        const x = cx + s * 33;
        return (
          <g key={s}>
            <rect x={x - 6} y={шов + 1} width="12" height="12" rx="2.5" fill="url(#chSteel)" stroke="#565C68" strokeWidth="0.8" />
            <line x1={x - 3.2} y1={шов + 5} x2={x + 3.2} y2={шов + 5} stroke="#0E1013" strokeWidth="1.5" strokeLinecap="round" />
            <line x1={x - 3.2} y1={шов + 9} x2={x + 3.2} y2={шов + 9} stroke="#0E1013" strokeWidth="1.5" strokeLinecap="round" />
          </g>
        );
      })}

      {/* Крышка целиком: верхняя плоскость и её торец. Откидываясь, она
          почти встаёт на ребро и показывает изнанку. */}
      <g style={{
        transformOrigin: `${cx}px ${верх - глуб}px`,
        animation: open ? "chestLidOpen 660ms cubic-bezier(0.32,1.2,0.5,1) both" : "none",
      }}>
        {/* Торец крышки: тёмная полоса с неоновой линией вдоль. */}
        <path
          d={`M${cx - пшир},${верх} H${cx + пшир} V${шов - 3} L${cx + пшир - 3},${шов} H${cx - пшир + 3} L${cx - пшир},${шов - 3} Z`}
          fill="#14161B" stroke="#333741" strokeWidth="1.4" strokeLinejoin="round"
          opacity={open ? 0.85 : 1}
        />
        {/* Верхние язычки защёлок — на торце крышки. */}
        {[-1, 1].map((s) => (
          <rect
            key={s} x={cx + s * 33 - 7} y={верх + 1} width="14" height={тлщ + 1} rx="2"
            fill="url(#chSteel)" stroke="#565C68" strokeWidth="0.8"
          />
        ))}

        {/* Плоскость крышки. */}
        <polygon points={крышка} fill="url(#chLid)" stroke="#3A3F49" strokeWidth="1.8" strokeLinejoin="round" />
        <polygon points={крышка} fill="url(#chSheen)" />

        {/* Тёмные панели на крышке — по одной слева и справа от бейджа,
            как люки на настоящем ящике. */}
        {!open && [-1, 1].map((s) => (
          <polygon
            key={s}
            points={`${cx + s * 16},${верх - 4} ${cx + s * 15},${верх - глуб + 5} ${cx + s * (зшир - 6)},${верх - глуб + 5} ${cx + s * (пшир - 9)},${верх - 4}`}
            fill="#0B0C10" opacity="0.75" stroke="#2C3039" strokeWidth="0.8" strokeLinejoin="round"
          />
        ))}

        {/* Неоновые вставки в углах крышки. */}
        {!open && [-1, 1].map((s) => (
          <line
            key={s}
            x1={cx + s * (пшир - 5)} y1={верх - 4}
            x2={cx + s * (зшир - 3)} y2={верх - глуб + 4}
            stroke={T.electric} strokeWidth="2.2" strokeLinecap="round" opacity="0.9"
          />
        ))}

        {/* Бейдж на крышке — тот же знак, но мельче. */}
        {!open && (
          <g>
            <polygon points={гекс(cx, верх - 10, 12, 6.5)} fill={T.electric} opacity="0.2" style={{ filter: "blur(3px)" }} />
            <polygon points={гекс(cx, верх - 10, 10, 5.4)} fill="#0C0D11" stroke="#41465166" strokeWidth="2" strokeLinejoin="round" />
            <polygon points={гекс(cx, верх - 10, 8, 4.4)} fill="url(#chBadge)" stroke={T.electric} strokeWidth="1" strokeLinejoin="round" />
            <Знак x={cx} y={верх - 13} s={0.26} />
          </g>
        )}

        {/* Изнанка: проступает, когда крышка развернулась. */}
        {open && (
          <polygon
            points={крышка}
            fill="url(#chBack)"
            stroke={hexA(T.electric, 0.8)}
            strokeWidth="1.6"
            strokeLinejoin="round"
            style={{ animation: "lidFlip 660ms ease-in both" }}
          />
        )}
      </g>

      {/* Свет из щели, пока кейс закрыт: пятно с раскалённой сердцевиной,
          тихо пульсирующее. Рисуется после крышки, иначе её обводка
          съедает половину свечения. */}
      {!open && (
        <g style={{ animation: "glowPulse 2.6s ease-in-out infinite" }}>
          <rect
            x={cx - кшир + 3} y={шов - 4.5} width={кшир * 2 - 6} height="8" rx="4"
            fill="url(#chSlit)" opacity="0.6" style={{ filter: "blur(3px)" }}
          />
          <rect
            x={cx - кшир + 9} y={шов - 1.9} width={кшир * 2 - 18} height="1.8" rx="0.9"
            fill="url(#chSlitHot)"
          />
        </g>
      )}
    </svg>
  );
}

/* Окно открытия сундука.

   Сначала сундук вздрагивает, потом крышка откидывается и из щели бьёт
   свет — и только после этого показывается, что досталось. Пауза здесь
   не для красоты: без неё выпавшая вещь появлялась мгновенно, и не
   оставалось секунды, ради которой сундук и открывают. */
function ChestReveal({ prize, onClose }) {
  // shaking — кейс вздрагивает; open — крышка откинулась; roll — лента
  // перебирает вещи и замедляется; prize — остановились на выпавшей.
  const [phase, setPhase] = useState("shaking");
  // Отсчёт начинается с появления приза, а не с запуска приложения.
  // Окно висит в разметке всегда (просто пустое), и таймеры, заведённые
  // при монтировании, успевали отыграть задолго до того, как человек
  // нажимал «открыть» — кейс сразу показывал результат.
  useEffect(() => {
    if (!prize) return;
    setPhase("shaking");
    const t = [
      setTimeout(() => setPhase("open"), 850),
      setTimeout(() => setPhase("roll"), 1350),
      setTimeout(() => setPhase("prize"), 4250),
    ];
    // Лента отдаётся в руку: щелчок на каждой вещи, что проезжает мимо
    // указателя. Последний — не щелчок, а остановка, поэтому весомее.
    let былаВибрация = 0;
    ROLL_TICKS.forEach((мс, i) => {
      const остановка = i === ROLL_TICKS.length - 1;
      t.push(setTimeout(() => {
        // Пока поток занят первым кадром ленты, таймеры сбиваются в кучу
        // и приходят вплотную — две такие вибрации сливаются в одну
        // длинную. Разгон от этого только смазывается, поэтому лишние
        // пропускаем прямо перед отправкой, а не только при расчёте.
        const сейчас = Date.now();
        if (!остановка && сейчас - былаВибрация < ROLL_TICK_MIN_GAP) return;
        былаВибрация = сейчас;
        haptic(остановка ? "medium" : "soft");
      }, 1350 + мс));
    });
    return () => t.forEach(clearTimeout);
  }, [prize && prize.kind, prize && prize.id]);

  /* Лента перебора. Что выпало, известно заранее — это прислала база, —
     но показать сразу значит отдать всё напряжение задаром. Поэтому мимо
     окна проезжают чужие вещи, лента замедляется и встаёт ровно на
     нужной. Порядок собирается один раз: пересчитывать его на каждой
     перерисовке нельзя, лента бы дёргалась. */
  const лента = useMemo(() => {
    if (!prize) return [];
    const все = [
      ...AVATAR_FRAMES.filter((i) => (i.price || 0) > 0).map((i) => ({ kind: "frame", id: i.id, item: i })),
      ...PROFILE_CARDS.filter((i) => (i.price || 0) > 0).map((i) => ({ kind: "card", id: i.id, item: i })),
    ];
    const out = [];
    for (let i = 0; i < ROLL_WIN_INDEX; i++) out.push(все[Math.floor(Math.random() * все.length)]);
    out.push(prize);
    for (let i = 0; i < 4; i++) out.push(все[Math.floor(Math.random() * все.length)]);
    return out;
  }, [prize && prize.id]);

  if (typeof document === "undefined" || !prize) return null;
  const item = prize.item;
  const открыт = phase !== "shaking";
  const крутится = phase === "roll";
  const показатьПриз = phase === "prize";

  return createPortal(
    <div
      className="fx-modal-back"
      onClick={показатьПриз ? onClose : undefined}
      style={{
        position: "fixed", inset: 0, zIndex: 95, background: "rgba(0,0,0,0.9)",
        backdropFilter: "blur(6px)", WebkitBackdropFilter: "blur(6px)",
        display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center",
        padding: "calc(24px + var(--tg-inset-top, 0px)) 24px calc(24px + var(--tg-inset-bottom, 0px))",
      }}
    >
      {/* Сам сундук. Пока не открыт — трясётся; после открытия остаётся
          на месте с откинутой крышкой, а приз выезжает над ним. */}
      <div style={{ position: "relative", width: 190, height: 210, display: "flex", alignItems: "flex-end", justifyContent: "center", paddingBottom: 6 }}>
        {открыт && (
          <>
            <div style={{
              position: "absolute", bottom: 12, width: 170, height: 170, borderRadius: "50%",
              background: `radial-gradient(closest-side, ${hexA(T.electric, 0.7)}, transparent 70%)`,
              animation: "chestFlash 700ms ease-out both",
            }} />
            {[0, 45, 90, 135, 180, 225, 270, 315].map((a, i) => (
              <span
                key={a}
                style={{
                  position: "absolute", width: 4, height: 12, borderRadius: 2, background: T.electric,
                  ["--a"]: `${a}deg`, ["--d"]: `${58 + (i % 3) * 14}px`,
                  animation: `chestSpark ${620 + (i % 3) * 90}ms ease-out both`,
                  animationDelay: `${i * 22}ms`,
                }}
              />
            ))}
          </>
        )}

        <ChestArt open={открыт} />

        {/* Приз выезжает поверх сундука */}
        {показатьПриз && (
          <div style={{
            position: "absolute", top: -18,
            animation: "prizeRise 620ms cubic-bezier(0.16,1,0.3,1) both",
          }}>
            <div style={{
              position: "absolute", inset: -22, borderRadius: "50%",
              background: `radial-gradient(closest-side, ${hexA(T.electric, 0.5)}, transparent 72%)`,
              animation: "prizeGlow 2.2s ease-in-out infinite",
            }} />
            <div style={{ position: "relative" }}>
              {prize.kind === "frame" ? (
                <AvatarFrame frameId={prize.id} size={92}>
                  <div style={{ width: "100%", height: "100%", background: T.bg }} />
                </AvatarFrame>
              ) : (
                <div style={{ width: 132, height: 84, borderRadius: 16, overflow: "hidden", position: "relative", border: `1px solid ${T.lineHi}` }}>
                  <ProfileCardBg cardId={prize.id} height={84} radius={16} />
                </div>
              )}
            </div>
          </div>
        )}
      </div>

      {/* Лента перебора: живёт между открытием крышки и показом приза. */}
      {крутится && (
        <div style={{
          position: "relative", width: "100%", maxWidth: 300, height: ROLL_ITEM + 14,
          marginTop: 16, overflow: "hidden",
          // Края уходят в темноту, иначе лента обрывается по краю окна.
          maskImage: "linear-gradient(90deg, transparent, #000 16%, #000 84%, transparent)",
          WebkitMaskImage: "linear-gradient(90deg, transparent, #000 16%, #000 84%, transparent)",
        }}>
          <div style={{
            display: "flex", gap: 8, alignItems: "center", height: "100%",
            // Кривая почти без разгона и с долгим выбегом — это и читается
            // как «замедляется и останавливается».
            animation: `rollStrip ${ROLL_MS}ms cubic-bezier(${ROLL_EASE.join(",")}) both`,
            ["--roll-to"]: `-${ROLL_WIN_INDEX * (ROLL_ITEM + 8) - (300 - ROLL_ITEM) / 2}px`,
          }}>
            {лента.map((это, i) => (
              <div key={i} style={{
                width: ROLL_ITEM, height: ROLL_ITEM, flexShrink: 0,
                display: "flex", alignItems: "center", justifyContent: "center",
                borderRadius: 14, background: T.surface, border: `1px solid ${T.line}`,
                position: "relative", overflow: "hidden",
              }}>
                {это.kind === "frame" ? (
                  <AvatarFrame frameId={это.id} size={ROLL_ITEM - 20}>
                    <div style={{ width: "100%", height: "100%", background: T.bg }} />
                  </AvatarFrame>
                ) : (
                  <ProfileCardBg cardId={это.id} height={ROLL_ITEM} radius={14} />
                )}
              </div>
            ))}
          </div>
          {/* Указатель по центру: без него непонятно, на чём лента встала. */}
          <div style={{
            position: "absolute", left: "50%", top: 0, bottom: 0, width: 2,
            transform: "translateX(-50%)", background: T.electric,
            boxShadow: `0 0 12px ${T.electric}`,
          }} />
        </div>
      )}

      {/* Подпись появляется вместе с призом, иначе выдаёт его заранее. */}
      <div style={{ minHeight: 88, marginTop: 22, display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "flex-start" }}>
        {показатьПриз ? (
          <div className="flex flex-col items-center" style={{ animation: "fadeInUp 420ms ease-out both" }}>
            <span style={{ fontFamily: bodyFont, color: T.muted, fontSize: 13 }}>
              {prize.kind === "frame" ? t("shopTabFrames") : t("shopTabCards")}
            </span>
            <span style={{ fontFamily: displayFont, color: T.ice, fontSize: 22, fontWeight: 700, marginTop: 4 }}>
              {pickLabel(item ? item.label : null) || prize.id}
            </span>
            <button
              onClick={onClose}
              className="fx-tap rounded-[20px] px-7 py-3"
              style={{ marginTop: 18, background: PRISM, color: PRISM_TEXT, fontFamily: displayFont, fontWeight: 700, fontSize: 15 }}
            >
              {t("chestTake")}
            </button>
          </div>
        ) : (
          <span style={{ fontFamily: bodyFont, color: T.muted, fontSize: 14 }}>{t("chestOpening")}</span>
        )}
      </div>
    </div>,
    document.body,
  );
}

/* Карточка сундука в магазине. Показывает цену и сколько вещей ещё не
   куплено: без этого непонятно, есть ли смысл открывать. */
function ChestCard({ coins, owned, onOpen }) {
  const left = chestPool(owned).length;
  const canOpen = left > 0 && coins >= CHEST_PRICE;
  return (
    // Без подложки: кейс — строка витрины, а не отдельный виджет.
    // Карточка вокруг названия и подписи читалась лишним слоем.
    <div className="flex items-center gap-3" style={{ padding: "2px 0" }}>
      <div style={{
        width: 40, height: 40, flexShrink: 0,
        display: "flex", alignItems: "center", justifyContent: "center",
      }}>
        <Gift size={22} color={T.electric} />
      </div>
      <div className="flex-1 min-w-0">
        <div style={{ fontFamily: displayFont, color: T.ice, fontSize: 15.5, fontWeight: 600 }}>{t("chestTitle")}</div>
        <div style={{ fontFamily: bodyFont, color: T.muted, fontSize: 12.5, lineHeight: 1.4, marginTop: 2 }}>
          {left > 0 ? t("chestSub") : t("chestEmpty")}
        </div>
      </div>
      {/* Цена без плашки: монета и число акцентом прямо на фоне —
          подложка вокруг двух знаков читалась лишним слоем. */}
      <button
        onClick={() => canOpen && onOpen && onOpen()}
        disabled={!canOpen}
        className="fx-tap flex items-center gap-1.5"
        style={{ flexShrink: 0, padding: "6px 2px", opacity: left > 0 ? 1 : 0.5 }}
      >
        <CoinIcon size={16} tone={canOpen ? T.electric : T.muted} />
        <span style={{
          fontFamily: displayFont, fontWeight: 600, fontSize: 15,
          color: canOpen ? T.electric : T.muted, letterSpacing: "-0.01em",
        }}>
          {CHEST_PRICE}
        </span>
      </button>
    </div>
  );
}

function ShopView({ cosmetics, owned, coins, onBuy, onOpenLook, onOpenChest, achievementsReady = true, onOpenAchievements, showToast, accountCreated = false, onOpenLogin }) {
  const [tab, setTab] = useState("frames");
  // Нажатие на уже купленное открывает примерку в «Редактировать
  // профиль» — сразу на нужной вкладке. Витрина не надевает ничего
  // сама, но и не отвечает бесполезной подсказкой.
  const lookRef = useRef(null);
  lookRef.current = (kind) => { haptic("light"); if (onOpenLook) onOpenLook(kind); };
  const ownedTap = useCallback((kind) => lookRef.current(kind), []);
  // Нажатие на некупленный предмет открывает окно подтверждения, а не
  // списывает монеты сразу.
  const [confirming, setConfirming] = useState(null); // { kind, id }
  // Кейс тоже спрашивает подтверждение: монеты не должны уходить по
  // одному касанию.
  const [chestConfirm, setChestConfirm] = useState(false);
  const buy = useCallback((k, id) => { setConfirming({ kind: k, id }); }, []);
  const buyRef = useRef(onBuy);
  useEffect(() => { buyRef.current = onBuy; });
  function confirmBuy(k, id) {
    setConfirming(null);
    buyRef.current(k, id);
  }
  const tooPoorRef = useRef(null);
  tooPoorRef.current = (price) => {
    if (showToast) showToast(tf("shopNotEnough", { n: Math.max(0, price - coins) }));
    if (onOpenAchievements) onOpenAchievements();
  };
  const tooPoor = useCallback((price) => tooPoorRef.current(price), []);
  const items = tab === "frames" ? AVATAR_FRAMES : PROFILE_CARDS;
  const kind = tab === "frames" ? "frame" : "card";
  const equippedId = cosmetics[kind];

  // Без аккаунта магазин закрыт целиком: монеты копятся за достижения,
  // а достижения считаются по профилю — купить и надеть тут нечего и
  // некому. Показываем витрину закрытой, а не пустой, и сразу даём вход.
  if (!accountCreated) {
    return (
      <div className="flex flex-col gap-4 pt-2">
        <span style={{ fontFamily: displayFont, color: T.ice, fontSize: 24, fontWeight: 600, letterSpacing: "-0.02em" }}>{t("shopTitle")}</span>
        {/* Закрытая витрина — это состояние экрана, а не объект на нём:
            текст лежит прямо на фоне, карточка вокруг него только
            добавляла лишний слой. */}
        <div className="flex flex-col gap-3" style={{ marginTop: 4 }}>
          <Lock size={20} color={T.muted} />
          <div style={{ fontFamily: displayFont, color: T.ice, fontSize: 17, fontWeight: 600 }}>{t("shopLockedTitle")}</div>
          <p style={{ fontFamily: bodyFont, color: T.muted, fontSize: 14, lineHeight: 1.55, maxWidth: 300, marginTop: -4 }}>{t("shopLockedBody")}</p>
          <button
            onClick={() => onOpenLogin && onOpenLogin()}
            className="fx-tap flex items-center justify-center gap-1.5 rounded-[14px] px-5 py-3"
            style={{ alignSelf: "flex-start", background: PRISM, color: PRISM_TEXT, fontFamily: displayFont, fontWeight: 600, fontSize: 14.5 }}
          >
            <Send size={14} /> {t("tgAuthCta")}
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-4 pt-2">
      <span style={{ fontFamily: displayFont, color: T.ice, fontSize: 24, fontWeight: 600, letterSpacing: "-0.02em" }}>{t("shopTitle")}</span>
      {/* Счётчик монет живёт только здесь: тратить их больше негде, а на
          остальных экранах он был бы просто цифрой без применения.
          Стоит вровень с заголовком и выше не поднимается, а при
          прокрутке остаётся у верхнего края — цены видно на любой высоте
          витрины. Отрицательный отступ поднимает плашку на строку
          заголовка: сама она — отдельный блок колонки, иначе прилипать
          было бы не к чему. Подложка непрозрачная: под плашкой проезжают
          карточки. */}
      <div style={{ position: "sticky", top: 4, zIndex: 5, alignSelf: "flex-end", marginTop: -46 }}>
        <button
          onClick={onOpenAchievements}
          className="fx-tap flex items-center gap-1.5 px-3 py-1.5"
          style={{
            borderRadius: 999,
            background: T.surface,
            border: `1px solid ${T.line}`,
          }}
        >
          <CoinIcon size={15} />
          <span style={{ fontFamily: monoFont, fontSize: 14, fontWeight: 600, color: T.ice }}>{coins}</span>
        </button>
      </div>
      <p style={{ fontFamily: bodyFont, color: T.muted, fontSize: 14, lineHeight: 1.5, marginTop: -8 }}>{t("shopCoinsHint")}</p>

      {/* Сундук — единственное, на что монеты уходят бесконечно: рамки и
          карточки рано или поздно скупаются все. */}
      <ChestCard coins={coins} owned={owned} onOpen={() => setChestConfirm(true)} />

      <div className="flex items-center gap-2">
        {[["frames", t("shopTabFrames")], ["cards", t("shopTabCards")]].map(([id, label]) => {
          const active = tab === id;
          return (
            <button key={id} onClick={() => setTab(id)} className="fx-tap fx-chip rounded-full px-3.5 py-1.5"
              style={{
                fontFamily: bodyFont, fontSize: 14, fontWeight: 600,
                background: active ? T.ice : "transparent", color: active ? T.bg : T.muted,
                border: `1px solid ${active ? T.ice : T.line}`,
              }}>
              {label}
            </button>
          );
        })}
      </div>

      {!achievementsReady ? (
        // Пока не посчитаны достижения, неизвестен и баланс: показывать
        // цены, которых человек «не может» себе позволить, — обман.
        <PageLoader minHeight={260} />
      ) : (
      <div className="grid grid-cols-2 gap-2.5" key={tab}>
        {items.map((item) => {
          const price = item.price || 0;
          const isOwned = price === 0 || owned.has(ownedKey(kind, item.id));
          return (
            <ShopItem
              key={item.id}
              item={item}
              kind={kind}
              equipped={equippedId === item.id}
              owned={isOwned}
              price={price}
              affordable={coins >= price}
              onOwnedTap={ownedTap}
              onBuy={buy}
              onTooPoor={tooPoor}
            />
          );
        })}
      </div>
      )}

      {chestConfirm && (
        <ChestBuySheet
          coins={coins}
          owned={owned}
          onConfirm={() => { setChestConfirm(false); if (onOpenChest) onOpenChest(); }}
          onClose={() => setChestConfirm(false)}
        />
      )}

      {confirming && (
        <BuySheet
          item={(confirming.kind === "frame" ? FRAME_BY_ID : CARD_BY_ID)[confirming.id]}
          kind={confirming.kind}
          coins={coins}
          cosmetics={cosmetics}
          onBuy={confirmBuy}
          onClose={() => setConfirming(null)}
        />
      )}
    </div>
  );
}

/* Переключатель сети ползунком.
 *
 * Два рынка — это два разных списка, и переключение между ними должно
 * стоить движения, а не случайного касания: ползунок перетаскивается и
 * прилипает к ближней стороне. Короткое нажатие по свободной половине
 * тоже переключает — тащить ради одного шага никто не обязан.
 *
 * Ползунок ведётся указателем, а не касанием: одни и те же события
 * приходят и от пальца, и от мыши, и захват указателя не теряется, если
 * палец ушёл за пределы дорожки. */
function NetworkSlider({ value, onChange, ширина = 168, высота = 38 }) {
  const дорожка = useRef(null);
  const тяга = useRef(null);
  const [сдвиг, setСдвиг] = useState(null);

  const пад = 3;
  // Рамка дорожки съедает по точке с каждой стороны, а бегунок стоит
  // внутри неё: без этой поправки половина считалась от внешней ширины,
  // и в правом положении он вылезал за край, а по вертикали сидел ниже
  // середины.
  const рамка = 1;
  const внутри = ширина - рамка * 2 - пад * 2;
  const шаг = внутри / 2;
  const база = value === "sol" ? шаг : 0;
  const x = сдвиг == null ? база : сдвиг;

  function начать(e) {
    тяга.current = { x0: e.clientX, база, ушёл: false };
    try { e.currentTarget.setPointerCapture(e.pointerId); } catch { /* мышь без захвата */ }
  }
  function вести(e) {
    const t = тяга.current;
    if (!t) return;
    const d = e.clientX - t.x0;
    if (Math.abs(d) > 3) t.ушёл = true;
    setСдвиг(Math.max(0, Math.min(шаг, t.база + d)));
  }
  function отпустить(e) {
    const t = тяга.current;
    if (!t) return;
    тяга.current = null;
    let цель;
    if (t.ушёл) {
      цель = (сдвиг ?? база) > шаг / 2 ? "sol" : "ton";
    } else {
      // Нажатие без движения: выбираем ту половину, по которой попали.
      const rect = дорожка.current ? дорожка.current.getBoundingClientRect() : null;
      цель = rect && e.clientX - rect.left > rect.width / 2 ? "sol" : "ton";
    }
    setСдвиг(null);
    if (цель !== value) { haptic("light"); onChange(цель); }
  }

  return (
    <div
      ref={дорожка}
      onPointerDown={начать}
      onPointerMove={вести}
      onPointerUp={отпустить}
      onPointerCancel={отпустить}
      className="self-start"
      style={{
        position: "relative", width: ширина, height: высота, flexShrink: 0,
        boxSizing: "border-box",
        borderRadius: 999, background: T.surface, border: `1px solid ${T.line}`,
        // Иначе первое же движение пальца уводит страницу в прокрутку и
        // ползунок остаётся на месте.
        touchAction: "none", userSelect: "none", cursor: "grab",
      }}
    >
      <div
        style={{
          position: "absolute", top: пад, left: пад,
          width: шаг, height: высота - рамка * 2 - пад * 2, borderRadius: 999,
          // Рамка считается внутрь ширины: иначе бегунок шире половины
          // дорожки на её толщину и в правом положении вылезает за край.
          boxSizing: "border-box",
          background: T.surfaceHi, border: `1px solid ${T.lineHi}`,
          transform: `translateX(${x}px)`,
          transition: сдвиг == null ? `transform 220ms cubic-bezier(0.32,1.2,0.5,1)` : "none",
        }}
      />
      {[["ton", "TON"], ["sol", "SOL"]].map(([id, подпись], i) => {
        // Подпись светлеет по мере подхода ползунка, а не скачком в
        // момент отпускания: иначе при перетаскивании ничего не
        // происходит до самого конца.
        const близость = 1 - Math.min(1, Math.abs(x - i * шаг) / шаг);
        return (
          <span
            key={id}
            style={{
              position: "absolute", top: 0, bottom: 0, left: пад + i * шаг, width: шаг,
              boxSizing: "border-box",
              display: "flex", alignItems: "center", justifyContent: "center",
              fontFamily: displayFont, fontSize: 13.5, fontWeight: 600,
              color: близость > 0.5 ? T.ice : T.faint,
              pointerEvents: "none",
            }}
          >
            {подпись}
          </span>
        );
      })}
    </div>
  );
}

function MempadView({ tokens, loading, myTokensLoading = false, myTokens, onOpen, onLaunch, solДоступен = false }) {
  const [filter, setFilter] = useState("new");
  // Сеть выбирается сверху, отдельно от фильтров: это не «ещё один
  // способ отсортировать», а другой рынок целиком — свои токены, свои
  // кошельки, своя лента.
  const [сеть, setСеть] = useState(() => {
    try {
      const с = typeof window !== "undefined" && window.localStorage.getItem("mintly.network");
      return с === "sol" || с === "ton" ? с : "ton";
    } catch {
      return "ton";
    }
  });
  useEffect(() => {
    try { if (typeof window !== "undefined") window.localStorage.setItem("mintly.network", сеть); } catch { /* приватный режим */ }
  }, [сеть]);

  // Лента Solana. Тот же источник и тот же разбор, что у основной, но
  // читается только по требованию: две сети сразу — это вдвое больше
  // запросов к источнику с общим лимитом на всё приложение.
  const [solTokens, setSolTokens] = useState(null);
  const [solLoading, setSolLoading] = useState(false);
  useEffect(() => {
    if (сеть !== "sol") return;
    let cancelled = false;
    if (!solTokens) setSolLoading(true);

    // Столько же страниц и с тем же обновлением, что у ленты TON: одна
    // страница давала два десятка токенов, список кончался на середине
    // экрана, и цифры в нём застывали на момент открытия.
    // Страницы читаются по очереди, а не разом: у источника общий лимит
    // на приложение, и пять одновременных запросов он отбивал целиком —
    // раздел оставался пустым. Сначала первая страница, чтобы список
    // появился сразу, потом добор остального в фоне.
    async function загрузить(глубоко) {
      const rows = (await fetchFeedFromCache(GT_NETWORK_SOL))
        || (глубоко
          ? await fetchTonMemePools(FEED_LIMIT, FEED_PAGES, GT_NETWORK_SOL)
          : await fetchTonMemePools(20, 1, GT_NETWORK_SOL));
      if (cancelled) return;
      // null означает, что источник не ответил. Затирать им уже
      // показанный список нельзя — лучше оставить прежние цифры.
      if (rows && rows.length) {
        setSolTokens((prev) => {
          if (глубоко || !prev || !prev.length) return rows;
          const свежие = new Map(rows.map((tok) => [tok.id, tok]));
          const слито = prev.map((tok) => свежие.get(tok.id) || tok);
          const известные = new Set(prev.map((tok) => tok.id));
          rows.forEach((tok) => { if (!известные.has(tok.id)) слито.push(tok); });
          return слито;
        });
      }
      setSolLoading(false);
    }

    загрузить(false).then(() => { if (!cancelled) загрузить(true); });
    const iv = setInterval(() => {
      if (document.visibilityState === "visible") загрузить(false);
    }, TOKEN_REFRESH_MS);
    return () => { cancelled = true; clearInterval(iv); };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [сеть]);

  // «В центре внимания» — пятёрка токенов, по которым прошло больше всего
  // сделок за последний час, и она прокручивается по кругу. Час берём как
  // основное окно: он показывает, где движение прямо сейчас, а не кто
  // крупнее по капитализации. Если за час везде тихо (ночь, выходные),
  // окно расширяется до 6 часов, потом до суток — так карточка никогда не
  // остаётся пустой.
  const localTokens = useMemo(() => (myTokens || []).map(localTokenToFeedShape), [myTokens]);

  // Свои запуски делятся по сетям: в разделе Solana нечего показывать
  // токенам TON и наоборот.
  const свои = useMemo(() => {
    const нужная = сеть === "sol" ? "solana" : "ton";
    return localTokens
      .filter((tok) => (tok.chain || "ton") === нужная)
      // Сверху — только что запущенные: «Новые» читаются как хроника, а
      // не как список в порядке, в котором база их вернула.
      .sort((a, b) => new Date(b.createdAt || 0) - new Date(a.createdAt || 0));
  }, [localTokens, сеть]);

  const spotlightTop = useMemo(() => {
    // Биржевой ленты может не быть вовсе — в тестовой сети её нет по
    // определению. Тогда в центр внимания идут свои токены: пустая
    // рамка вместо карточки выглядела поломкой.
    //
    // В Solana источник один — её собственная лента: своих запусков там
    // нет, и подмешивать TON-токены было бы враньём.
    // Пробные токены сюда не попадают: «в центре внимания» — витрина, а
    // не список всего подряд, и рекламировать монету, которая ничего не
    // стоит, площадка не должна. В самом списке ниже она остаётся, с
    // пометкой.
    const свои = localTokens.filter((tok) => (tok.chain || "ton") === (сеть === "sol" ? "solana" : "ton") && !пробнаяСеть(tok.network));
    const источник = сеть === "sol"
      ? (свои.length ? свои : (solTokens || []))
      : (tokens.length ? tokens : свои);
    if (!источник.length) return [];
    const ranked = (win) =>
      [...источник]
        .filter((tok) => (tok[win] || 0) > 0)
        .sort((a, b) => (b[win] || 0) - (a[win] || 0));
    const byActivity = ["tx1h", "tx6h", "tx24h"].map(ranked).find((list) => list.length);
    const list = byActivity || [...источник].sort((a, b) => b.mcapNum - a.mcapNum);
    return list.slice(0, SPOTLIGHT_COUNT);
  }, [tokens, localTokens, solTokens, сеть]);

  const [spotIdx, setSpotIdx] = useState(0);
  useEffect(() => {
    if (spotlightTop.length < 2) return;
    const iv = setInterval(() => setSpotIdx((i) => i + 1), SPOTLIGHT_ROTATE_MS);
    return () => clearInterval(iv);
  }, [spotlightTop.length]);

  // Индекс намеренно растёт без ограничения, а по кругу гоняем здесь:
  // так смена ленты не сбрасывает позицию на первый токен.
  const spotlight = spotlightTop.length ? spotlightTop[spotIdx % spotlightTop.length] : null;

  const list = useMemo(() => {
    // "New" now means what it literally says: tokens launched through
    // this app, not the newest items in the external real-market feed.
    // В Solana своих запусков нет, поэтому «Новые» там означает не
    // «запущенные здесь», а самые свежие пары рынка — по возрасту.
    /* «Новые» — те, кто ещё идёт по кривой и на биржу не вышел. Здесь
       токен ещё можно взять по цене кривой, и раздел ровно об этом.
       Пары, уже заведённые на DEX, лежат в соседних вкладках: подмешивать
       их сюда значит смешивать два разных способа купить. */
    if (filter === "new") {
      return свои
        .filter((tok) => !tok.graduated)
        .sort((a, b) => new Date(b.createdAt || 0) - new Date(a.createdAt || 0));
    }
    if (сеть === "sol") {
      const featured = new Set(spotlightTop.map((tok) => tok.id));
      let arr = (solTokens || []).filter((tok) => !featured.has(tok.id));
      switch (filter) {
        case "trend": arr = поТренду(arr); break;
        case "hot": arr = [...arr].sort((a, b) => b.change - a.change); break;
        case "dex": arr = arr.filter((tok) => tok.verified); break;
        default: break;
      }
      return arr;
    }
    const featured = new Set(spotlightTop.map((tok) => tok.id));
    let arr = tokens.filter((tok) => !featured.has(tok.id));
    switch (filter) {
      case "trend": arr = поТренду(arr); break;
      case "hot": arr = [...arr].sort((a, b) => b.change - a.change); break;
      case "dex": arr = arr.filter(tok => tok.verified); break;
      default: break;
    }
    return arr;
  }, [tokens, filter, spotlightTop, свои, solTokens, сеть]);

  // Что считать загрузкой, зависит от того, что сейчас на экране:
  // «Новые» — это свои токены из базы, остальное — биржевая лента.
  // Раньше здесь всегда стояла биржевая, и раздел успевал сказать
  // «пусто» до того, как приезжали свои.
  const рынокГрузится = сеть === "sol" ? (solLoading || !solTokens) : loading;
  const идётЗагрузка = filter === "new" ? myTokensLoading : рынокГрузится;

  /* Раздел показывается целиком или не показывается вовсе.
     Раньше он собирался на глазах: сначала пустая лента сделок, следом
     скелеты списка, потом «в центре внимания» — три перестроения подряд
     на каждом открытии. Теперь экран ждёт и список, и первый ответ
     ленты, а до тех пор стоит один загрузчик.

     Смена сети — это другой рынок целиком, поэтому ожидание начинается
     заново. */
  const [лентаГотова, setЛентаГотова] = useState(false);
  useEffect(() => {
    setЛентаГотова(false);
    // Страховка: у токена может не быть ни одной сделки, а источник
    // может и вовсе не ответить — держать человека перед загрузчиком
    // дольше нескольких секунд нельзя.
    const to = setTimeout(() => setЛентаГотова(true), 7000);
    return () => clearTimeout(to);
  }, [сеть]);
  const разделГотов = !идётЗагрузка && лентаГотова;

  return (
    <div className="flex flex-col" style={{ gap: 20, paddingTop: 8, paddingBottom: 16 }}>
      {/* Шапка раздела: название, поиск и выбор сети — одной строкой и
          двумя. Декоративная графика сети отсюда убрана: она занимала
          треть экрана и ничего не сообщала. */}
      <div className="flex items-center justify-between">
        <h1 style={{ fontFamily: displayFont, color: T.ice, fontSize: 24, fontWeight: 600, letterSpacing: "-0.01em", margin: 0 }}>
          {t("navMempad")}
        </h1>
        <div className="flex items-center" style={{ gap: 8 }}>
          <button
            className="fx-tap flex items-center justify-center"
            style={{ width: 34, height: 34, borderRadius: 10, background: "transparent", border: `1px solid ${T.line}` }}
          >
            <Search size={15} color={T.muted} />
          </button>
          <button
            onClick={onLaunch}
            className="fx-tap flex items-center gap-1.5"
            style={{
              padding: "8px 14px", borderRadius: 10,
              background: T.electric, color: PRISM_TEXT, border: "none",
              fontFamily: displayFont, fontSize: 13.5, fontWeight: 600,
              // В Solana кнопка появляется только когда программа
              // кривой развёрнута: до этого запускать там нечем.
              display: сеть === "sol" && !solДоступен ? "none" : undefined,
            }}
          >
            <Rocket size={14} strokeWidth={1.8} /> {t("mempadLaunchToken")}
          </button>
        </div>
      </div>

      {/* Сеть — ползунком: рынок меняется движением, а не случайным
          касанием по краю экрана. */}
      <NetworkSlider value={сеть} onChange={setСеть} />

      {/* Пока раздел не готов, его содержимое скрыто, но смонтировано:
          лента сама ходит за сделками, и без неё на экране ждать было бы
          нечего. */}
      {!разделГотов && <PageLoader minHeight={360} />}

      <div
        className="flex flex-col"
        style={{ gap: 20, display: разделГотов ? undefined : "none" }}
      >
      <RecentBuysTicker
        сеть={сеть}
        tokens={сеть === "sol" ? (solTokens || []) : tokens}
        curveTokens={сеть === "sol" ? [] : myTokens}
        onOpen={onOpen}
        onReady={() => setЛентаГотова(true)}
      />

      {spotlight && (
        <div>
          <div style={{ fontFamily: displayFont, color: T.muted, fontSize: 13, fontWeight: 500, letterSpacing: "0.02em", textTransform: "uppercase", marginBottom: 10 }}>
            {t("mempadSpotlight")}
          </div>
          {/* Один компактный блок вместо карусели крупных карточек:
              логотип, тикер, капитализация и движение — всё, что нужно,
              чтобы решить, открывать ли токен. */}
          <button
            key={spotlight.id}
            onClick={() => onOpen(spotlight)}
            className="fx-tap w-full flex items-center text-left"
            style={{ gap: 12, padding: 14, borderRadius: 16, background: T.surface, border: `1px solid ${T.line}`, position: "relative", overflow: "hidden" }}
          >
            {/* Своя обложка вытесняет ауру: автор нарисовал её сам, и
                подкрашивать её усреднённым цветом логотипа незачем.
                Затемнение сверху обязательно — по светлой картинке белый
                тикер не читается. */}
            {spotlight.bannerUrl ? (
              <>
                <div
                  aria-hidden
                  style={{
                    position: "absolute", inset: 0,
                    background: `center/cover no-repeat url(${spotlight.bannerUrl})`,
                  }}
                />
                <div
                  aria-hidden
                  style={{
                    position: "absolute", inset: 0,
                    background: `linear-gradient(90deg, ${hexA(T.bg, 0.92)} 0%, ${hexA(T.bg, 0.72)} 45%, ${hexA(T.bg, 0.45)} 100%)`,
                  }}
                />
              </>
            ) : (
              <SpotlightAura src={spotlight.logoUrl} ticker={spotlight.ticker} />
            )}
            <div style={{ position: "relative", zIndex: 1 }}>
              <TokenAvatar size={44} tone={spotlight.change >= 0 ? "up" : "down"} src={spotlight.logoUrl} />
            </div>
            <div className="flex-1 min-w-0" style={{ position: "relative", zIndex: 1 }}>
              <div className="flex items-center" style={{ gap: 8 }}>
                <span style={{ fontFamily: displayFont, color: T.ice, fontSize: 15.5, fontWeight: 600 }}>${spotlight.ticker}</span>
                <span style={{ fontFamily: monoFont, color: spotlight.change >= 0 ? T.up : T.down, fontSize: 13 }}>
                  {spotlight.change >= 0 ? "+" : ""}{(spotlight.change || 0).toFixed(1)}%
                </span>
              </div>
              <div style={{ fontFamily: bodyFont, color: T.muted, fontSize: 13, marginTop: 3 }}>
                {fmtUSD(spotlight.mcapNum)} · ${spotlight.vol}
              </div>
            </div>
            {spotlightTop.length > 1 && (
              <div className="flex items-center" style={{ gap: 4, position: "relative", zIndex: 1 }}>
                {spotlightTop.map((tok, i) => (
                  <span
                    key={tok.id}
                    onClick={(e) => { e.stopPropagation(); setSpotIdx(i); }}
                    style={{
                      width: 5, height: 5, borderRadius: 999,
                      background: i === spotIdx % spotlightTop.length ? T.electric : T.lineHi,
                      transition: `background ${EASE}`,
                    }}
                  />
                ))}
              </div>
            )}
          </button>
        </div>
      )}

      <div className="no-scrollbar flex items-center overflow-x-auto" style={{ gap: 18, touchAction: "pan-x", overscrollBehaviorX: "contain", overflowY: "hidden" }}>
        {MEMPAD_FILTERS.map((f) => {
          const active = filter === f.id;
          return (
            <button
              key={f.id}
              onClick={() => setFilter(f.id)}
              className="fx-tap whitespace-nowrap flex-shrink-0"
              style={{
                background: "transparent", border: "none", padding: 0,
                fontFamily: displayFont, fontSize: 14, fontWeight: active ? 600 : 500,
                color: active ? T.ice : T.faint,
                transition: `color ${EASE}`,
              }}
            >
              {t(f.labelKey)}
            </button>
          );
        })}
      </div>

      {/* Ни фона, ни рамки, ни разделителя — строки разводит зазор. */}
      <div className="flex flex-col gap-3" key={сеть}>
        {/* Смена фильтра внутри готового раздела — не повод гасить весь
            экран: там достаточно скелетов на месте строк.

            Длина списка ограничена: дальше шестидесяти строк никто не
            листает, а рисовать и анимировать их браузер обязан — на
            переключении вкладки это заметная задержка. */}
        {идётЗагрузка
          ? Array.from({ length: 4 }).map((_, i) => <MempadRowSkeleton key={i} index={i} />)
          : list.slice(0, 60).map((tok, i) => <MempadRow key={tok.id} t={tok} onOpen={onOpen} index={i} />)}
        {!идётЗагрузка && list.length === 0 && (
          <div style={{ fontFamily: bodyFont, color: T.muted, fontSize: 14, padding: "16px 0" }}>
            {t("emptyFilter")}
          </div>
        )}
      </div>
      </div>
    </div>
  );
}

/* Плавный набор числа для витрины.
 *
 * Соседний useCountUp начинает с нуля при каждой смене цели, а числа на
 * главной обновляются на ходу — прыжок к нулю читался бы как сбой.
 * Здесь анимация идёт от того, что уже показано: первый раз это ноль,
 * дальше — предыдущее значение.
 */
function useTicker(target, duration = 800) {
  const [val, setVal] = useState(0);
  const откуда = useRef(0);
  useEffect(() => {
    const начало = откуда.current;
    if (начало === target) return;
    let raf, start;
    const tick = (ts) => {
      if (!start) start = ts;
      const p = Math.min(1, (ts - start) / duration);
      const eased = 1 - Math.pow(1 - p, 3);
      const v = начало + (target - начало) * eased;
      откуда.current = p < 1 ? v : target;
      setVal(откуда.current);
      if (p < 1) raf = requestAnimationFrame(tick);
    };
    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
  }, [target, duration]);
  return val;
}


/* ГЛАВНАЯ.
 *
 * Экран, который человек видит первым и чаще всего. Раньше он был
 * длинным перечислением равнозначных блоков: приветствие, сводка, почти
 * на бирже, популярное, лента, топ. Всё одного веса — значит ничего не
 * главное, и взгляду не за что зацепиться.
 *
 * Теперь порядок такой: одно настоящее число площадки, один токен, на
 * который стоит смотреть, движение ленты строкой, короткий список
 * живого и свёрнутый топ. Держит всё расстояние, а не рамки: на тёмном
 * фоне карточка выделяет то, что внутри неё, — поэтому карточка здесь
 * ровно одна.
 */

/* Сводка площадки. Числа настоящие: собранное в кривых и вышедших на
   биржу считает функция базы, запуски за сутки — она же.
   Счётчика «онлайн» здесь больше нет: он рисовался случайными числами,
   и, раз заметив это, человек перестал бы верить и остальным. */
function ГлавнаяСводка({ live = [] }) {
  const [stats, setStats] = useState(null);

  useEffect(() => {
    let брошено = false;
    const прочитать = () => supabase.rpc("platform_stats", { p_network: CURRENT_NETWORK }).then(({ data, error }) => {
      if (!брошено && !error && data) setStats(data);
    }, () => {});
    прочитать();
    const id = setInterval(() => { if (document.visibilityState === "visible") прочитать(); }, 60000);
    return () => { брошено = true; clearInterval(id); };
  }, []);

  // Собранное и вышедших на биржу берём из ленты: она читает кривые
  // напрямую, а в базе эти числа от обхода по расписанию и отстают.
  const живые = useMemo(() => {
    const ряд = (live || []).filter((tok) => tok && tok.raisedTon != null);
    if (!ряд.length) return null;
    return {
      raisedTon: ряд.filter((tok) => !tok.graduated).reduce((s, tok) => s + (Number(tok.raisedTon) || 0), 0),
      graduated: ряд.filter((tok) => tok.graduated).length,
    };
  }, [live]);

  const собрано = Math.max((живые && живые.raisedTon) || 0, Number((stats || {}).raisedTon) || 0);
  const наБирже = Math.max((живые && живые.graduated) || 0, Number((stats || {}).graduated) || 0);
  const заСутки = Number((stats || {}).launched24) || 0;
  const плавно = useTicker(собрано);

  const показатели = [
    { число: String(заСутки), подпись: t("homeStatToday") },
    { число: String(наБирже), подпись: t("homeEcoDex") },
  ];

  return (
    <section>
      <div className="flex items-center" style={{ gap: 7 }}>
        <span style={{ width: 6, height: 6, borderRadius: "50%", background: T.up }} />
        <span style={{ fontFamily: bodyFont, color: T.muted, fontSize: 12.5, letterSpacing: "0.04em", textTransform: "uppercase" }}>
          {t("homeInCurves")}
        </span>
      </div>

      {/* Единственное крупное число на экране. Всё остальное — мельче,
          и потому взгляд начинает отсюда. */}
      <div className="flex items-baseline" style={{ gap: 8, marginTop: 8 }}>
        <span style={{ fontFamily: displayFont, color: T.ice, fontSize: 42, fontWeight: 600, lineHeight: 1, letterSpacing: "-0.03em" }}>
          {fmtTon(плавно).replace(" TON", "")}
        </span>
        <span style={{ fontFamily: monoFont, color: T.muted, fontSize: 15 }}>TON</span>
      </div>

      <div className="flex items-center" style={{ gap: 18, marginTop: 12 }}>
        {показатели.map((п, i) => (
          <div key={i} className="flex items-baseline" style={{ gap: 5 }}>
            <span style={{ fontFamily: monoFont, color: T.ice, fontSize: 14, fontWeight: 600 }}>{п.число}</span>
            <span style={{ fontFamily: bodyFont, color: T.muted, fontSize: 12.5 }}>{п.подпись}</span>
          </div>
        ))}
      </div>
    </section>
  );
}

/* Главный токен экрана — ближайший к листингу. Единственная карточка на
   главной, и потому она читается как «смотри сюда».

   Ближайший, а не самый крупный: у крупного всё уже случилось, а здесь
   виден отсчёт, который вот-вот кончится. Кривых нет вовсе — берём
   лучший по капитализации, чтобы место не пустовало. */
function ГлавныйТокен({ tokens = [], onOpen }) {
  const выбор = useMemo(() => {
    const наКривой = (tokens || [])
      .filter((tok) => tok.curveAddress && tok.graduationTon > 0 && tok.raisedTon < tok.graduationTon)
      .map((tok) => ({ tok, pct: (tok.raisedTon / tok.graduationTon) * 100 }))
      .sort((a, b) => b.pct - a.pct);
    if (наКривой.length) return наКривой[0];
    const крупный = (tokens || []).filter((tok) => tok.mcapNum > 0).sort((a, b) => b.mcapNum - a.mcapNum)[0];
    return крупный ? { tok: крупный, pct: null } : null;
  }, [tokens]);

  if (!выбор) return null;
  const { tok, pct } = выбор;
  const растёт = (tok.change || 0) >= 0;

  return (
    <section>
      <div className="flex items-baseline justify-between" style={{ marginBottom: 10 }}>
        <span style={{ fontFamily: bodyFont, color: T.muted, fontSize: 12.5, letterSpacing: "0.04em", textTransform: "uppercase" }}>
          {pct == null ? t("homePopular") : t("homeAlmostTitle")}
        </span>
      </div>

      <button
        onClick={() => onOpen && onOpen(tok)}
        className="fx-card fx-tap w-full text-left rounded-[24px]"
        style={{ position: "relative", overflow: "hidden", padding: 16, background: T.surface, border: `1px solid ${T.line}` }}
      >
        {/* Подложка берёт цвет из самого логотипа — у каждого токена
            своя, и подборка каждый раз выглядит по-новому. */}
        <SpotlightAura src={tok.logoUrl} ticker={tok.ticker} />

        <div className="flex items-center" style={{ gap: 12, position: "relative" }}>
          <TokenAvatar size={46} tone={растёт ? "up" : "down"} src={tok.logoUrl} />
          <div className="flex-1 min-w-0">
            <div className="truncate" style={{ fontFamily: displayFont, color: T.ice, fontSize: 18, fontWeight: 700, letterSpacing: "-0.01em" }}>
              ${tok.ticker}
            </div>
            <div className="truncate" style={{ fontFamily: bodyFont, color: T.muted, fontSize: 12.5, marginTop: 2 }}>{tok.name}</div>
          </div>
          <div className="text-right flex-shrink-0">
            {/* Курс TON приезжает отдельным запросом и иногда опаздывает.
                Пока его нет, капитализация равна нулю — показываем то,
                что известно и без него: собранное кривой. */}
            <div style={{ fontFamily: displayFont, color: T.ice, fontSize: 16, fontWeight: 700 }}>
              {tok.mcapNum > 0 ? fmtUSD(tok.mcapNum) : `${fmtTon(tok.raisedTon || 0)} TON`}
            </div>
            <div style={{ fontFamily: monoFont, color: растёт ? T.up : T.down, fontSize: 12.5, marginTop: 2 }}>
              {растёт ? "+" : ""}{(tok.change || 0).toFixed(1)}%
            </div>
          </div>
        </div>

        {/* График во всю ширину карточки: он и есть довод смотреть
            дальше. Ширину держит стиль, а не число в разметке, — иначе
            на узком телефоне линия вылезала бы за край. */}
        <div className="fx-spark" style={{ marginTop: 12, position: "relative" }}>
          <MiniChart
            id={`герой-${tok.id}`}
            base={tok.mcapNum || tok.raisedTon || 0}
            seed={tok.id}
            poolAddress={tok.dexPoolAddress}
            curveAddress={tok.curveAddress}
            tokenAddress={tok.tokenAddress}
            positive={растёт}
            width={320}
            height={76}
            length={28}
          />
        </div>

        {pct != null && (
          <div style={{ position: "relative", marginTop: 12 }}>
            <div style={{ height: 5, borderRadius: 3, background: T.surfaceHi, overflow: "hidden" }}>
              <div style={{ width: `${Math.min(100, pct)}%`, height: "100%", background: T.electric, borderRadius: 3 }} />
            </div>
            <div className="flex items-baseline justify-between" style={{ marginTop: 7 }}>
              <span style={{ fontFamily: bodyFont, color: T.muted, fontSize: 12 }}>
                {tf("homeAlmostLeft", { left: fmtTon(Math.max(0, tok.graduationTon - tok.raisedTon)) })}
              </span>
              <span style={{ fontFamily: monoFont, color: T.electric, fontSize: 13, fontWeight: 700 }}>{pct.toFixed(0)}%</span>
            </div>
          </div>
        )}
      </button>
    </section>
  );
}

/* Бегущая строка сделок.
 *
 * Раньше те же события лежали списком в восемь карточек и занимали
 * пол-экрана, сообщая одно: здесь кто-то есть. Одна строка говорит это
 * же, но не отбирает место у токенов, и главное — она движется, отчего
 * экран читается живым.
 *
 * Список продублирован: когда первая половина уезжает влево, на её
 * месте оказывается вторая, и шов не виден. */
function БегущаяЛента() {
  const [items, setItems] = useState(null);

  useEffect(() => {
    let брошено = false;
    const load = () => supabase.rpc("recent_activity", { p_limit: 12, p_network: CURRENT_NETWORK }).then(
      ({ data, error }) => { if (!брошено && !error) setItems(data || []); },
      () => {},
    );
    load();
    const t = setInterval(load, 30000);
    return () => { брошено = true; clearInterval(t); };
  }, []);

  if (!items || !items.length) return null;

  const текст = (с) => (с.kind === "launch"
    ? tf("feedLaunch", { who: с.nickname || "—", ticker: с.ticker || "?" })
    : tf("feedTrade", { who: с.nickname || "—", ticker: с.ticker || "?", ton: fmtTon(Number(с.ton) || 0) }));

  return (
    <div style={{ overflow: "hidden", height: 20, position: "relative", maskImage: "linear-gradient(90deg, transparent, #000 6%, #000 94%, transparent)", WebkitMaskImage: "linear-gradient(90deg, transparent, #000 6%, #000 94%, transparent)" }}>
      <div className="flex items-center" style={{ gap: 0, width: "max-content", animation: `лентаЕдет ${Math.max(28, items.length * 4.5)}s linear infinite` }}>
        {[...items, ...items].map((с, i) => (
          <span key={`${с.at}-${i}`} className="flex items-center" style={{ gap: 8, paddingRight: 22, flexShrink: 0 }}>
            <span style={{
              width: 5, height: 5, borderRadius: "50%",
              background: с.kind === "launch" ? T.electric : T.up,
            }} />
            <span style={{ fontFamily: bodyFont, color: T.muted, fontSize: 12.5, whiteSpace: "nowrap" }}>{текст(с)}</span>
          </span>
        ))}
      </div>
    </div>
  );
}

/* Живое движение: четыре строки со своим графиком.
 *
 * Прежде здесь было два блока — популярное лентой вбок и топ списком, —
 * которые показывали примерно одно и то же разными способами. Остался
 * один список: тикер, капитализация, форма движения и процент за сутки.
 * Больше четырёх строк не показываем: за остальным есть мемпад, и
 * отправить туда честнее, чем выкладывать половину его на главной. */
function ВДвижении({ tokens = [], onOpen, onAll }) {
  const ряд = useMemo(() => (tokens || [])
    // Капитализация считается через курс TON, а он приезжает отдельно и
    // иногда опаздывает: пока его нет, у всех ноль. Поэтому годится и
    // собранное кривой — тогда список не пустеет на ровном месте.
    .filter((tok) => tok.mcapNum > 0 || tok.raisedTon > 0)
    .slice()
    // По размаху движения, а не по величине: главная показывает, где
    // сейчас что-то происходит, а крупнейшие и так на виду.
    .sort((a, b) => Math.abs(b.change || 0) - Math.abs(a.change || 0))
    .slice(0, 4), [tokens]);
  if (!ряд.length) return null;

  return (
    <section>
      <div className="flex items-baseline justify-between" style={{ marginBottom: 6 }}>
        <span style={{ fontFamily: bodyFont, color: T.muted, fontSize: 12.5, letterSpacing: "0.04em", textTransform: "uppercase" }}>
          {t("homeMoving")}
        </span>
        <button onClick={onAll} className="fx-tap" style={{ background: "transparent", border: "none", padding: 0, fontFamily: bodyFont, color: T.muted, fontSize: 12.5 }}>
          {t("homePopularAll")}
        </button>
      </div>

      <div className="flex flex-col">
        {ряд.map((tok, i) => {
          const растёт = (tok.change || 0) >= 0;
          return (
            <button
              key={tok.id}
              onClick={() => onOpen && onOpen(tok)}
              className="fx-card fx-tap w-full flex items-center text-left"
              style={{ gap: 12, padding: "12px 0", background: "transparent", border: "none", animationDelay: `${i * 40}ms` }}
            >
              <TokenAvatar size={36} tone={растёт ? "up" : "down"} src={tok.logoUrl} />
              <div className="flex-1 min-w-0">
                <div className="truncate" style={{ fontFamily: displayFont, color: T.ice, fontSize: 14.5, fontWeight: 700 }}>${tok.ticker}</div>
                <div style={{ fontFamily: monoFont, color: T.muted, fontSize: 12, marginTop: 2 }}>
                  {tok.mcapNum > 0 ? fmtUSD(tok.mcapNum) : `${fmtTon(tok.raisedTon || 0)} TON`}
                </div>
              </div>
              <MiniChart
                id={`движ-${tok.id}`}
                base={tok.mcapNum || tok.raisedTon || 0}
                seed={tok.id}
                poolAddress={tok.dexPoolAddress}
                curveAddress={tok.curveAddress}
                tokenAddress={tok.tokenAddress}
                positive={растёт}
                width={62}
                height={28}
                length={20}
              />
              <span style={{ fontFamily: monoFont, color: растёт ? T.up : T.down, fontSize: 13, fontWeight: 700, width: 58, textAlign: "right", flexShrink: 0 }}>
                {растёт ? "+" : ""}{(tok.change || 0).toFixed(1)}%
              </span>
            </button>
          );
        })}
      </div>
    </section>
  );
}

/* Топ — одной строкой.
 *
 * Полный список интересен единицам, а места занимал как главный блок.
 * Свёрнут до первого места; остальные раскрываются по тапу, никуда не
 * уводя с экрана. */
function ТопСтрока({ onOpenToken, onOpenProfile, live = [] }) {
  const [data, setData] = useState(null);
  const [раскрыт, setРаскрыт] = useState(false);

  useEffect(() => {
    let брошено = false;
    supabase.rpc("leaderboard", { p_limit: 5, p_network: CURRENT_NETWORK }).then(
      ({ data: d, error }) => { if (!брошено && !error) setData(d); },
      () => {},
    );
    return () => { брошено = true; };
  }, []);

  // Собранное в базу пишет обход по расписанию: у свежего токена там
  // ноль, хотя кривая уже собрала. Лента на этом же экране читает кривые
  // напрямую — берём цифру оттуда и заново раскладываем по местам.
  const токены = useMemo(() => {
    const покривой = new Map();
    (live || []).forEach((tok) => { if (tok && tok.id != null) покривой.set(String(tok.id), tok); });
    const ряд = ((data && data.tokens) || []).map((э) => {
      const св = покривой.get(String(э.id));
      if (!св) return э;
      return {
        ...э,
        raised: св.raisedTon != null ? св.raisedTon : э.raised,
        mcapNum: св.mcapNum,
        logo_url: э.logo_url || св.logoUrl || null,
        dexPoolAddress: св.dexPoolAddress || null,
      };
    });
    return покривой.size ? ряд.slice().sort((a, b) => (Number(b.raised) || 0) - (Number(a.raised) || 0)) : ряд;
  }, [data, live]);

  if (!токены.length) return null;
  const видимые = раскрыт ? токены : токены.slice(0, 1);

  return (
    <section>
      <div className="flex items-baseline justify-between" style={{ marginBottom: 6 }}>
        <span style={{ fontFamily: bodyFont, color: T.muted, fontSize: 12.5, letterSpacing: "0.04em", textTransform: "uppercase" }}>
          {t("topTitle")}
        </span>
        {токены.length > 1 && (
          <button onClick={() => setРаскрыт((б) => !б)} className="fx-tap"
            style={{ background: "transparent", border: "none", padding: 0, fontFamily: bodyFont, color: T.muted, fontSize: 12.5 }}>
            {раскрыт ? t("homeTopHide") : t("homeTopAll")}
          </button>
        )}
      </div>

      <div className="flex flex-col">
        {видимые.map((э, i) => (
          <button
            key={э.id || i}
            onClick={() => onOpenToken && onOpenToken(э)}
            className="fx-card fx-tap w-full flex items-center text-left"
            style={{ gap: 12, padding: "10px 0", background: "transparent", border: "none", animationDelay: `${i * 40}ms` }}
          >
            <span style={{ fontFamily: monoFont, color: i === 0 ? T.electric : T.faint, fontSize: 13, fontWeight: 700, width: 14, flexShrink: 0 }}>{i + 1}</span>
            {/* Топ приходит из базы, и поля с эмодзи там нет: без запасного
                значка у токена без логотипа оставался пустой кружок. */}
            <TokenAvatar size={34} src={э.logo_url} />
            <div className="flex-1 min-w-0">
              <div className="truncate" style={{ fontFamily: displayFont, color: T.ice, fontSize: 14, fontWeight: 700 }}>${э.ticker}</div>
              <div style={{ fontFamily: bodyFont, color: T.muted, fontSize: 11.5, marginTop: 2 }}>
                {э.graduated
                  ? t(э.dexPoolAddress ? "topOnDex" : "topClosing")
                  : tf("topRaised", { ton: fmtTon(Number(э.raised) || 0) })}
              </div>
            </div>
            {э.mcapNum > 0 && (
              <span style={{ fontFamily: displayFont, color: T.ice, fontSize: 13.5, fontWeight: 700, flexShrink: 0 }}>{fmtUSD(э.mcapNum)}</span>
            )}
          </button>
        ))}
      </div>

      {/* Создатели — тем же списком, но только когда его раскрыли: на
          свёрнутой главной им места нет. */}
      {раскрыт && ((data && data.creators) || []).length > 0 && (
        <div className="fx-reveal flex flex-col" style={{ marginTop: 14 }}>
          <span style={{ fontFamily: bodyFont, color: T.faint, fontSize: 12, marginBottom: 4 }}>{t("topCreators")}</span>
          {(data.creators || []).map((э, i) => (
            <button
              key={э.id || i}
              onClick={() => onOpenProfile && onOpenProfile(э.id)}
              className="fx-tap w-full flex items-center text-left"
              style={{ gap: 12, padding: "9px 0", background: "transparent", border: "none" }}
            >
              <span style={{ fontFamily: monoFont, color: T.faint, fontSize: 13, fontWeight: 700, width: 14, flexShrink: 0 }}>{i + 1}</span>
              <AvatarFrame frameId={э.frame_id || "none"} size={30}>
                <div style={{
                  width: "100%", height: "100%", borderRadius: "50%",
                  background: э.avatar_url ? `center/cover no-repeat url(${э.avatar_url})` : T.surfaceHi,
                  display: "flex", alignItems: "center", justifyContent: "center", fontSize: 14,
                }}>{!э.avatar_url && (э.emoji || "🙂")}</div>
              </AvatarFrame>
              <div className="flex-1 min-w-0">
                <div className="truncate" style={{ fontFamily: displayFont, color: T.ice, fontSize: 13.5, fontWeight: 700 }}>{э.nickname || "—"}</div>
                <div style={{ fontFamily: bodyFont, color: T.muted, fontSize: 11.5, marginTop: 2 }}>
                  {tf("topLaunched", { n: э.launched, ton: fmtTon(Number(э.raised) || 0) })}
                </div>
              </div>
            </button>
          ))}
        </div>
      )}
    </section>
  );
}

/* Своя строка сверху: кто ты и куда идти за своим.
 *
 * Профиля в панели разделов больше нет — там переключаются между
 * рынками, а не между рынком и собой. Вход в него теперь один и там же,
 * где его ищут: аватарка в углу главной. */
function ШапкаГлавной({ profile, accountCreated, onOpenMyProfile }) {
  const аватар = profile && profile.avatarUrl;
  // Аватарка и имя — одной кнопкой слева: это одна мысль «я», и целиться
  // в кружок диаметром в сорок точек, когда рядом стоит собственное имя,
  // незачем.
  return (
    <button
      onClick={onOpenMyProfile}
      className="fx-tap flex items-center text-left"
      style={{ gap: 11, background: "transparent", border: "none", padding: 0, alignSelf: "flex-start" }}
    >
      <span
        style={{
          width: 38, height: 38, borderRadius: "50%", flexShrink: 0,
          border: `1.5px solid ${T.lineHi}`, overflow: "hidden",
          // Пока картинки нет — ровный тёмный кружок, а не серое пятно с
          // чужим значком внутри.
          background: аватар ? `center/cover no-repeat url(${аватар})` : T.bg,
          display: "flex", alignItems: "center", justifyContent: "center",
        }}
      >
        {!аватар && <User size={17} color={T.muted} />}
      </span>
      <span>
        <span style={{ display: "block", fontFamily: displayFont, color: T.ice, fontSize: 19, fontWeight: 600, letterSpacing: "-0.02em" }}>
          {accountCreated && profile && profile.nickname ? profile.nickname : "Mintly"}
        </span>
        <span style={{ display: "block", fontFamily: bodyFont, color: T.muted, fontSize: 12.5, marginTop: 1 }}>
          {accountCreated ? t("homeHello") : t("accountNotCreated")}
        </span>
      </span>
    </button>
  );
}

/* Свои токены, достижения и активность — теперь здесь.
 *
 * В профиле они лежали за лишним переходом, и человек, запустивший
 * токен, не видел его до тех пор, пока не вспомнит, где смотреть. */
function МоиДела({ myTokens = [], achievements = [], userId, onGoCreate, onOpenToken, onOpenAchievements }) {
  const закрыто = achievements.filter((a) => a.done).length;
  return (
    <>
      <section>
        <SectionTitle action={
          <button onClick={onGoCreate} className="fx-tap flex items-center gap-1" style={{ fontFamily: bodyFont, fontSize: 12.5, color: T.electric }}>
            <PlusCircle size={13} /> {t("myTokensCreate")}
          </button>
        }>{t("myTokensTitle")}</SectionTitle>
        {myTokens.length === 0 ? (
          <p style={{ fontFamily: bodyFont, color: T.muted, fontSize: 13.5, lineHeight: 1.5 }}>{t("noTokensYet")}</p>
        ) : (
          <div className="flex flex-col gap-2">
            {myTokens.slice(0, 3).map((tok) => <MyTokenCard key={tok.id} t={tok} onOpen={onOpenToken} />)}
          </div>
        )}
      </section>

      <МояАктивность userId={userId} />

      <section>
        <SectionTitle action={
          <button onClick={onOpenAchievements} className="fx-tap flex items-center gap-1" style={{ fontFamily: bodyFont, fontSize: 12.5, color: T.electric }}>
            {t("achAll")} <ChevronRight size={13} />
          </button>
        }>{t("achievementsTitle")}</SectionTitle>
        <button onClick={onOpenAchievements} className="fx-tap w-full text-left" style={{ padding: "2px 0" }}>
          <div className="flex items-center justify-between" style={{ marginBottom: 8 }}>
            <span style={{ fontFamily: bodyFont, color: T.muted, fontSize: 13 }}>{t("achProgress")}</span>
            <span style={{ fontFamily: monoFont, color: T.ice, fontSize: 14.5, fontWeight: 700 }}>
              {tf("achUnlockedOf", { done: закрыто, total: achievements.length })}
            </span>
          </div>
          <div style={{ height: 6, borderRadius: 3, background: T.surfaceHi, overflow: "hidden" }}>
            <div style={{ width: `${achievements.length ? (закрыто / achievements.length) * 100 : 0}%`, height: "100%", background: T.electric }} />
          </div>
          <div className="flex items-center gap-1.5" style={{ marginTop: 10, flexWrap: "wrap" }}>
            {achievements.filter((a) => !a.done).slice(0, 3).map((a) => (
              <span key={a.id} className="flex items-center gap-1 rounded-full px-2 py-1" style={{ background: T.surfaceHi, border: `1px solid ${T.line}` }}>
                <a.icon size={11} color={T.muted} />
                <span style={{ fontFamily: bodyFont, fontSize: 11.5, color: T.muted }}>{a.label}</span>
              </span>
            ))}
          </div>
        </button>
      </section>
    </>
  );
}

/* Свои сделки. В профиле на этом месте стояла надпись «пока пусто» —
   она стояла там всегда, потому что данные никто не читал. */
function МояАктивность({ userId }) {
  const [ряд, setРяд] = useState(null);

  useEffect(() => {
    if (!userId) { setРяд([]); return; }
    let брошено = false;
    supabase
      .from("trades")
      .select("id, ticker, side, ton_amount, token_amount, created_at")
      .eq("user_id", userId)
      .order("created_at", { ascending: false })
      .limit(5)
      .then(({ data, error }) => { if (!брошено) setРяд(error ? [] : (data || [])); });
    return () => { брошено = true; };
  }, [userId]);

  if (!ряд) return null;
  return (
    <section>
      <SectionTitle>{t("activityTitle")}</SectionTitle>
      {ряд.length === 0 ? (
        <p style={{ fontFamily: bodyFont, color: T.muted, fontSize: 13.5, lineHeight: 1.5 }}>{t("noActivityYet")}</p>
      ) : (
        <div className="flex flex-col" style={{ gap: 8 }}>
          {ряд.map((с) => {
            const покупка = с.side !== "sell";
            return (
              <div key={с.id} className="flex items-center" style={{ gap: 10 }}>
                {покупка ? <ArrowUpRight size={15} color={T.up} /> : <ArrowDownRight size={15} color={T.down} />}
                <span className="flex-1 truncate" style={{ fontFamily: bodyFont, fontSize: 13.5, color: T.paper }}>
                  {покупка ? t("tickerBought") : t("tickerSold")} ${String(с.ticker || "?").toUpperCase()}
                </span>
                <span style={{ fontFamily: monoFont, fontSize: 12.5, color: покупка ? T.up : T.down, whiteSpace: "nowrap" }}>
                  {fmtCoin(Number(с.ton_amount) || 0)} TON
                </span>
                <span style={{ fontFamily: monoFont, fontSize: 11.5, color: T.faint, whiteSpace: "nowrap" }}>
                  {fmtSince(с.created_at)}
                </span>
              </div>
            );
          })}
        </div>
      )}
    </section>
  );
}

function HomeView({
  onGoTab, onGoCreate, curveTokens = [], onOpenToken, onOpenProfile,
  profile = null, accountCreated = false, myTokens = [], achievements = [], userId = null,
  onOpenMyProfile, onOpenAchievements,
}) {
  // Главная — витрина площадки: сводка, токен дня, движение, топ. Монетам
  // из пробной сети там не место — их цена ничего не значит, а сводка по
  // ним показывала бы оборот, которого не было. В мемпаде они остаются,
  // с пометкой.
  const боевые = React.useMemo(() => curveTokens.filter((t) => !пробнаяСеть(t && t.network)), [curveTokens]);
  return (
    // Запас снизу — под закреплённую кнопку: в конце прокрутки она
    // должна висеть над пустотой, а не над последней строкой топа.
    <div className="flex flex-col" style={{ gap: 26, paddingTop: 8, paddingBottom: 96 }}>
      <ШапкаГлавной profile={profile} accountCreated={accountCreated} onOpenMyProfile={onOpenMyProfile} />
      <ГлавнаяСводка live={боевые} />
      <БегущаяЛента />
      <МоиДела
        myTokens={myTokens}
        achievements={achievements}
        userId={userId}
        onGoCreate={onGoCreate}
        onOpenToken={onOpenToken}
        onOpenAchievements={onOpenAchievements}
      />
      <ГлавныйТокен tokens={боевые} onOpen={onOpenToken} />
      <ВДвижении tokens={боевые} onOpen={onOpenToken} onAll={() => onGoTab("mempad")} />
      <ТопСтрока onOpenToken={onOpenToken} onOpenProfile={onOpenProfile} live={боевые} />

      {/* Запуск — главное действие экрана, и оно стоит в его конце.
          Раньше кнопка прилипала к низу и висела поверх прокрутки: пока
          на главной были только витринные блоки, это работало, но теперь
          под ней идут свои токены, активность и достижения — и она
          просвечивала прямо по ним. Читать список сквозь кнопку хуже,
          чем пролистать до неё; то же действие есть и в мемпаде. */}
      <div style={{ marginTop: 2, paddingTop: 6, paddingBottom: 10 }}>
        <button
          onClick={onGoCreate}
          className="fx-tap w-full flex items-center justify-center gap-2"
          style={{
            padding: "14px 16px", borderRadius: 16,
            background: T.electric, color: PRISM_TEXT, border: "none",
            fontFamily: displayFont, fontSize: 15, fontWeight: 600,
            boxShadow: `0 10px 30px ${hexA(T.electric, 0.35)}`,
          }}
        >
          <Rocket size={17} strokeWidth={1.8} /> {t("homeActionLaunch")}
        </button>
      </div>

    </div>
  );
}

/* WalletView — кошелёк отдельным разделом. Раньше он лежал карточкой
   посреди профиля, между аватаркой и своими токенами: чтобы посмотреть
   баланс, приходилось идти в личные настройки. */
/* Второй кошелёк — в сети Solana.

   TON-кошелёк подключается через TonConnect и живёт своей жизнью; здесь
   Phantom, и связь с ним хранится в браузере. Один человек спокойно
   держит оба: TON-кошелёк платит за свои токены, Solana-кошелёк — за
   мемкоины из ленты Solana. Ни один из них не заменяет другой, поэтому
   и подключаются они по отдельности. */
function SolanaWalletCard({ showToast }) {
  const [сессия, setСессия] = useState(null);
  const [баланс, setБаланс] = useState(null);
  const [идёт, setИдёт] = useState(false);
  const [скопировано, setСкопировано] = useState(false);

  // Связь могла остаться с прошлого раза: тогда подключать заново
  // незачем, достаточно вспомнить адрес.
  useEffect(() => {
    let cancelled = false;
    import("./phantom").then(({ сохранённаяСессия }) => {
      if (!cancelled) setСессия(сохранённаяСессия());
    });
    return () => { cancelled = true; };
  }, []);

  useEffect(() => {
    if (!сессия) { setБаланс(null); return; }
    let cancelled = false;
    fetch(апи(`/api/solana?action=balances&wallet=${сессия.wallet}`))
      .then((r) => r.json())
      .then((b) => { if (!cancelled && b && !b.error) setБаланс(Number(b.sol) || 0); })
      .catch(() => {});
    return () => { cancelled = true; };
  }, [сессия]);

  async function подключиться() {
    setИдёт(true);
    try {
      const { подключить } = await import("./phantom");
      showToast(t("solConnecting"));
      setСессия(await подключить());
    } catch (e) {
      showToast(`${t("solFailed")}: ${String((e && e.message) || e).slice(0, 60)}`);
    } finally {
      setИдёт(false);
    }
  }

  async function отключиться() {
    const { забыть } = await import("./phantom");
    забыть();
    setСессия(null);
    showToast(t("solDisconnected"));
  }

  const короткий = сессия ? `${сессия.wallet.slice(0, 4)}…${сессия.wallet.slice(-4)}` : "";

  return (
    <div className="w-full rounded-[22px] p-4" style={{ marginTop: 20, background: T.surface, border: `1px solid ${T.line}` }}>
      <div className="flex items-center justify-between gap-3">
        <div className="min-w-0">
          <div style={{ fontFamily: displayFont, color: T.ice, fontSize: 14.5, fontWeight: 700 }}>{t("solWalletTitle")}</div>
          <div style={{ fontFamily: bodyFont, color: T.muted, fontSize: 12.5, marginTop: 3, lineHeight: 1.4 }}>
            {сессия
              ? (баланс == null ? t("solWalletLoading") : `${баланс.toFixed(4)} SOL`)
              : t("solWalletNote")}
          </div>
        </div>
        {сессия ? (
          <button
            onClick={() => { navigator.clipboard?.writeText(сессия.wallet); setСкопировано(true); setTimeout(() => setСкопировано(false), 1400); }}
            className="fx-tap flex items-center gap-1.5 rounded-full flex-shrink-0"
            style={{ padding: "7px 12px", background: T.bg, border: `1px solid ${T.line}` }}
          >
            <span style={{ fontFamily: monoFont, color: T.ice, fontSize: 12.5 }}>{короткий}</span>
            {скопировано ? <CheckCircle2 size={12} color={T.up} /> : <Copy size={12} color={T.muted} />}
          </button>
        ) : (
          <button
            onClick={подключиться}
            disabled={идёт}
            className={`fx-tap flex items-center gap-1.5 rounded-full flex-shrink-0${идёт ? " fx-busy" : ""}`}
            style={{
              padding: "8px 14px", background: hexA(T.electric, 0.14),
              border: `1px solid ${hexA(T.electric, 0.4)}`,
              fontFamily: bodyFont, color: T.electric, fontSize: 13.5, fontWeight: 700,
              opacity: идёт ? 0.6 : 1,
            }}
          >
            <Wallet size={13} /> {идёт ? t("solWalletOpening") : t("solWalletConnect")}
          </button>
        )}
      </div>

      {сессия && (
        <button
          onClick={отключиться}
          className="fx-tap flex items-center gap-1.5"
          style={{ marginTop: 12, background: "transparent", border: "none", padding: 0, fontFamily: bodyFont, fontSize: 13, color: T.rose }}
        >
          <LogOut size={12} /> {t("solWalletDisconnect")}
        </button>
      )}
    </div>
  );
}

/* Баланс приложения — внутренний кошелёк в Solana.

   Обычная сделка идёт через Phantom: ушёл в кошелёк, подтвердил,
   вернулся. Пока ходишь, цена на кривой уезжает. Здесь ключ хранится у
   площадки, поэтому покупка уходит в сеть сразу после нажатия — и за
   это же приходится доверять нам хранение.

   Отсюда же настраивается всё, что это доверие ограничивает: адрес, на
   который единственно возможен вывод, и порог, выше которого излишек
   уходит на свой кошелёк сам. Оба ограничения нужны потому, что ключ у
   нас: даже если однажды украдут вход в аккаунт, увести монеты можно
   будет только на адрес хозяина, и только через сутки ожидания.

   Ничего не показываем, пока сервер не ответил адресом: без входа в
   аккаунт и без ключа площадки внутреннего кошелька просто нет. */
function AppWalletCard({ showToast }) {
  const [кош, setКош] = useState(null);
  const [скопировано, setСкопировано] = useState(false);
  const [панель, setПанель] = useState(null);   // null | "top" | "out"
  const [сумма, setСумма] = useState("");
  const [идёт, setИдёт] = useState(false);

  const обновить = useCallback(async () => {
    const { состояниеВнутреннего } = await import("./appWallet");
    const s = await состояниеВнутреннего();
    if (s) setКош(s);
  }, []);

  // Пополнение приходит мимо приложения — заметить его можно только
  // переспросив сеть. Раз в 12 секунд достаточно, чтобы перевод
  // «появился сам», пока человек смотрит на карточку.
  useEffect(() => {
    let жив = true;
    const тик = () => { if (жив) обновить(); };
    тик();
    const id = setInterval(тик, 12000);
    return () => { жив = false; clearInterval(id); };
  }, [обновить]);

  if (!кош) return null;

  /* Кошелька может не быть по двум понятным причинам: человек не вошёл
     в аккаунт (кошелёк привязан к нему) или сервер ответил отказом.
     Обе стоит назвать вслух: молча исчезнувший блок выглядит поломкой и
     не подсказывает, что делать. */
  if (кош.нуженВход || кош.ошибка) {
    return (
      <div className="w-full rounded-[22px] p-4" style={{ background: T.surface, border: `1px solid ${T.line}` }}>
        <div style={{ fontFamily: displayFont, color: T.ice, fontSize: 14.5, fontWeight: 700 }}>{t("appWalletTitle")}</div>
        <p style={{ fontFamily: bodyFont, color: T.muted, fontSize: 12.5, marginTop: 6, lineHeight: 1.45 }}>
          {кош.нуженВход ? t("appWalletNeedAuth") : `${t("appWalletFailed")}: ${кош.ошибка}`}
        </p>
      </div>
    );
  }

  const короткий = `${кош.address.slice(0, 4)}…${кош.address.slice(-4)}`;
  const остаток = Number(кош.sol) || 0;
  const потолок = Number(кош.cap) || 0;
  const многовато = потолок > 0 && остаток > потолок;

  function копировать() {
    navigator.clipboard?.writeText(кош.address);
    setСкопировано(true);
    haptic("light");
    setTimeout(() => setСкопировано(false), 1400);
    showToast(t("appWalletAddressCopied"));
  }

  // Ошибки сервера приходят кодами: суточный потолок и отсутствие
  // привязанного адреса человеку надо объяснить, остальное — как есть.
  function сорвалось(e) {
    const текст = String((e && e.message) || e);
    showToast(текст.includes("daily_limit") ? t("appWalletLimitHit")
      : текст.includes("no_payout") ? t("appWalletBindHint")
      : `${t("appWalletFailed")}: ${текст.slice(0, 60)}`);
  }

  async function действие(дело) {
    if (идёт) return;
    setИдёт(true);
    try { await дело(); } catch (e) { сорвалось(e); } finally { setИдёт(false); }
  }

  const вывести = (всё) => действие(async () => {
    const { вывестиСВнутреннего } = await import("./appWallet");
    await вывестиСВнутреннего({ amount: Number(сумма) || 0, all: !!всё });
    showToast(t("appWalletSent"));
    setПанель(null); setСумма("");
    обновить();
  });

  const привязать = () => действие(async () => {
    const { привязатьАдресВывода } = await import("./appWallet");
    showToast(t("appWalletBinding"));
    const итог = await привязатьАдресВывода();
    showToast(итог && итог.payout ? t("appWalletBound") : t("appWalletPending"));
    обновить();
  });

  const отменить = () => действие(async () => {
    const { отменитьПривязку } = await import("./appWallet");
    await отменитьПривязку();
    showToast(t("appWalletCancelled"));
    обновить();
  });

  const переключитьАвтовывод = () => действие(async () => {
    const { автовывод } = await import("./appWallet");
    await автовывод(кош.sweepAbove == null ? (потолок || 2) : null);
    обновить();
  });

  const кнопка = {
    padding: "9px 14px", borderRadius: 12, background: hexA(T.electric, 0.14),
    border: `1px solid ${hexA(T.electric, 0.4)}`, fontFamily: bodyFont,
    color: T.electric, fontSize: 13.5, fontWeight: 700,
  };
  const тихая = { ...кнопка, background: T.bg, border: `1px solid ${T.line}`, color: T.ice };
  const поле = {
    width: "100%", padding: "10px 12px", borderRadius: 12, background: T.bg,
    border: `1px solid ${T.line}`, color: T.ice, fontFamily: monoFont, fontSize: 13,
    outline: "none",
  };
  const подпись = { fontFamily: bodyFont, color: T.muted, fontSize: 12.5, lineHeight: 1.45 };

  return (
    <div className="w-full rounded-[22px] p-4" style={{ background: T.surface, border: `1px solid ${T.line}` }}>
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <div style={{ fontFamily: displayFont, color: T.ice, fontSize: 14.5, fontWeight: 700 }}>{t("appWalletTitle")}</div>
          <div className="flex items-baseline" style={{ gap: 6, marginTop: 6 }}>
            <span style={{ fontFamily: displayFont, color: T.ice, fontSize: 26, fontWeight: 600, lineHeight: 1, letterSpacing: "-0.02em" }}>
              {остаток.toFixed(4)}
            </span>
            <span style={{ fontFamily: monoFont, color: T.muted, fontSize: 13 }}>SOL</span>
          </div>
        </div>
        <button
          onClick={копировать}
          className="fx-tap flex items-center gap-1.5 rounded-full flex-shrink-0"
          style={{ padding: "7px 12px", background: T.bg, border: `1px solid ${T.line}` }}
        >
          <span style={{ fontFamily: monoFont, color: T.ice, fontSize: 12.5 }}>{короткий}</span>
          {скопировано ? <CheckCircle2 size={12} color={T.up} /> : <Copy size={12} color={T.muted} />}
        </button>
      </div>

      <p style={{ ...подпись, marginTop: 10 }}>{t("appWalletHint")}</p>

      {/* Горячий кошелёк должен быть маленьким. Молча смотреть, как на
          нём копится сумма, которую не жалко потерять только на словах,
          нечестно — говорим прямо, как только это случилось. */}
      {многовато && (
        <p style={{ ...подпись, color: T.ice, marginTop: 8 }}>
          {tf("appWalletOver", { cap: `${потолок} SOL` })}
        </p>
      )}

      <div className="flex" style={{ gap: 8, marginTop: 12 }}>
        <button className="fx-tap flex-1 flex items-center justify-center gap-1.5" style={кнопка}
          onClick={() => setПанель(панель === "top" ? null : "top")}>
          <ArrowDownRight size={14} /> {t("appWalletTopUp")}
        </button>
        <button className="fx-tap flex-1 flex items-center justify-center gap-1.5" style={тихая}
          onClick={() => setПанель(панель === "out" ? null : "out")}>
          <ArrowUpRight size={14} /> {t("appWalletWithdraw")}
        </button>
      </div>

      {панель === "top" && (
        <div className="fx-reveal" style={{ marginTop: 12 }}>
          <p style={подпись}>{t("appWalletTopUpBody")}</p>
          {/* Адрес целиком, а не сокращённый: его переносят руками, и
              многоточие посередине тут ломает всё. */}
          <button onClick={копировать} className="fx-tap w-full text-left"
            style={{ ...поле, marginTop: 8, wordBreak: "break-all", lineHeight: 1.5 }}>
            {кош.address}
          </button>
        </div>
      )}

      {панель === "out" && (
        <div className="fx-reveal flex flex-col" style={{ gap: 8, marginTop: 12 }}>
          {/* Без привязанного адреса выводить некуда — и это не помеха,
              а суть: адрес доказывается подписью кошелька, поэтому
              укравший вход не сможет назначить свой. */}
          {!кош.payout ? (
            <>
              <p style={подпись}>{t("appWalletBindHint")}</p>
              <button className={`fx-tap w-full${идёт ? " fx-busy" : ""}`} style={{ ...кнопка, opacity: идёт ? 0.5 : 1 }}
                onClick={привязать} disabled={идёт}>
                {t("appWalletBind")}
              </button>
            </>
          ) : (
            <>
              <div className="flex items-center justify-between" style={{ gap: 8 }}>
                <span style={подпись}>{t("appWalletPayout")}</span>
                <span style={{ fontFamily: monoFont, color: T.ice, fontSize: 12.5 }}>
                  {`${кош.payout.slice(0, 4)}…${кош.payout.slice(-4)}`}
                </span>
              </div>
              <div className="flex" style={{ gap: 8 }}>
                <input value={сумма} onChange={(e) => setСумма(e.target.value.replace(",", "."))}
                  inputMode="decimal" placeholder={t("appWalletAmount")} style={{ ...поле, flex: 1 }} />
                <button className="fx-tap" style={{ ...тихая, color: T.muted }}
                  onClick={() => вывести(true)} disabled={идёт}>{t("appWalletAll")}</button>
              </div>
              <button className={`fx-tap w-full${идёт ? " fx-busy" : ""}`} style={{ ...кнопка, opacity: идёт || !(Number(сумма) > 0) ? 0.5 : 1 }}
                onClick={() => вывести(false)} disabled={идёт || !(Number(сумма) > 0)}>
                {t("appWalletWithdraw")}
              </button>
              <div className="flex items-center justify-between" style={{ gap: 8 }}>
                <span style={{ ...подпись, color: T.faint }}>{t("appWalletDailyLeft")}</span>
                <span style={{ fontFamily: monoFont, color: T.faint, fontSize: 12 }}>
                  {(Number(кош.dailyLeft) || 0).toFixed(2)} SOL
                </span>
              </div>
              {/* Порог автовывода: излишек уходит на свой адрес сам, без
                  участия человека, — иначе он копится здесь просто
                  потому, что вывести всё время некогда. */}
              <button className="fx-tap w-full flex items-center justify-between"
                style={{ ...тихая, color: T.muted, marginTop: 2 }}
                onClick={переключитьАвтовывод} disabled={идёт}>
                <span>{t("appWalletSweep")}</span>
                <span style={{ fontFamily: monoFont, fontSize: 12, color: кош.sweepAbove == null ? T.faint : T.up }}>
                  {кош.sweepAbove == null ? t("appWalletSweepOff") : `> ${кош.sweepAbove} SOL`}
                </span>
              </button>
              <button className="fx-tap self-start" style={{ background: "transparent", border: "none", padding: 0, fontFamily: bodyFont, fontSize: 12.5, color: T.faint }}
                onClick={привязать} disabled={идёт}>
                {t("appWalletRebind")}
              </button>
            </>
          )}

          {/* Заказанная смена адреса видна всегда, пока идут сутки: это
              единственный способ заметить чужую привязку вовремя. */}
          {кош.pending && (
            <div style={{ padding: "10px 12px", borderRadius: 12, background: T.bg, border: `1px solid ${hexA(T.rose, 0.4)}` }}>
              <div style={{ ...подпись, color: T.ice }}>
                {tf("appWalletPendingBody", { address: `${кош.pending.slice(0, 4)}…${кош.pending.slice(-4)}` })}
              </div>
              <button className="fx-tap" style={{ background: "transparent", border: "none", padding: 0, marginTop: 6, fontFamily: bodyFont, fontSize: 13, fontWeight: 700, color: T.ice, textDecoration: "underline" }}
                onClick={отменить} disabled={идёт}>
                {t("appWalletCancel")}
              </button>
            </div>
          )}
        </div>
      )}

    </div>
  );
}


function WalletView({ connected, walletAddress, tonBalance = 0, tonPriceUsd = 0, onConnect, onDisconnect, onCopy, holdings = [], holdingsReady = false, showToast = () => {} }) {
  const [copied, setCopied] = useState(false);
  const balance = useCountUp(connected ? tonBalance : 0, 900, connected);
  const usd = useCountUp(connected ? tonBalance * tonPriceUsd : 0, 900, connected);
  const short = walletAddress ? `${walletAddress.slice(0, 6)}…${walletAddress.slice(-6)}` : "";

  if (!connected) {
    return (
      <div className="flex flex-col" style={{ gap: 24, paddingTop: 8 }}>
        <div>
          <h1 style={{ fontFamily: displayFont, color: T.ice, fontSize: 24, fontWeight: 600, margin: 0 }}>{t("navWallet")}</h1>
          <p style={{ fontFamily: bodyFont, color: T.muted, fontSize: 14, marginTop: 6, lineHeight: 1.45 }}>{t("walletEmptyBody")}</p>
        </div>
        <button
          onClick={onConnect}
          className="fx-tap w-full flex items-center justify-center gap-2"
          style={{ padding: "13px 16px", borderRadius: 14, background: T.electric, color: PRISM_TEXT, border: "none", fontFamily: displayFont, fontSize: 15, fontWeight: 600 }}
        >
          <Wallet size={16} strokeWidth={1.8} /> {t("connectWallet")}
        </button>

        {/* Кошельки друг от друга не зависят: мемкоины Solana можно
            торговать и не подключая TON-кошелёк вовсе. */}
        <AppWalletCard showToast={showToast} />
        <SolanaWalletCard showToast={showToast} />
      </div>
    );
  }

  return (
    <div className="flex flex-col" style={{ gap: 28, paddingTop: 8, paddingBottom: 16 }}>
      {/* Баланс. Крупно только само число — это единственная цифра на
          экране, ради которой сюда заходят. */}
      <section>
        <div style={{ fontFamily: bodyFont, color: T.muted, fontSize: 13 }}>{t("walletBalanceLabel")}</div>
        <div className="flex items-baseline" style={{ gap: 8, marginTop: 6 }}>
          <span style={{ fontFamily: displayFont, color: T.ice, fontSize: 34, fontWeight: 600, lineHeight: 1, letterSpacing: "-0.02em" }}>
            {balance.toFixed(2)}
          </span>
          <span style={{ fontFamily: monoFont, color: T.muted, fontSize: 15 }}>TON</span>
        </div>
        <div style={{ fontFamily: monoFont, color: T.faint, fontSize: 13.5, marginTop: 6 }}>≈ ${usd.toFixed(2)}</div>

        <button
          onClick={() => { onCopy(); setCopied(true); setTimeout(() => setCopied(false), 1400); }}
          className="fx-tap flex items-center gap-2"
          style={{ marginTop: 14, padding: "8px 12px", borderRadius: 10, background: T.surface, border: `1px solid ${T.line}` }}
        >
          <span style={{ fontFamily: monoFont, color: T.muted, fontSize: 12.5 }}>{short}</span>
          {copied ? <CheckCircle2 size={13} color={T.up} /> : <Copy size={13} color={T.faint} />}
        </button>
      </section>

      <AppWalletCard showToast={showToast} />
      <SolanaWalletCard showToast={showToast} />

      {/* Что куплено на этом кошельке. Только состав: сколько чего лежит.
          Прибыль, счётчик строк и кнопка продажи отсюда убраны — за
          сделкой человек идёт на экран токена, где видно и цену, и
          график, а не решает вслепую по одной цифре. */}
      <section className="w-full">
        <div style={{ fontFamily: displayFont, color: T.ice, fontSize: 17, fontWeight: 600, marginBottom: 4 }}>{t("walletHoldings")}</div>

        {!holdingsReady ? (
          <PageLoader minHeight={100} />
        ) : !holdings.length ? (
          // Пустое состояние строкой, а не пустым контейнером во весь
          // экран: сказать тут нечего, и занимать место незачем.
          <div style={{ fontFamily: bodyFont, color: T.muted, fontSize: 14, marginTop: 8 }}>{t("walletHoldingsEmpty")}</div>
        ) : (
          <div className="flex flex-col">
            {holdings.map(({ tok, amount }) => (
              <div
                key={tok.id}
                className="w-full flex items-center"
                style={{ gap: 12, padding: "13px 0" }}
              >
                <TokenAvatar size={36} src={tok.logoUrl} />
                <div className="flex-1 min-w-0 text-left">
                  <span className="truncate block" style={{ fontFamily: displayFont, color: T.ice, fontSize: 14.5, fontWeight: 600 }}>${tok.ticker}</span>
                </div>
                <div style={{ fontFamily: monoFont, color: T.muted, fontSize: 13 }}>{fmtCompact(amount)}</div>
              </div>
            ))}
          </div>
        )}
      </section>

      <button
        onClick={onDisconnect}
        className="fx-tap flex items-center gap-1.5 self-start"
        style={{ background: "transparent", border: "none", padding: 0, fontFamily: bodyFont, fontSize: 13.5, color: T.faint }}
      >
        <LogOut size={13} /> {t("disconnectShort")}
      </button>
    </div>
  );
}

/* ---------------------------------------------------------
   TOKEN DETAIL VIEW
--------------------------------------------------------- */

const CHART_TOTAL = 140;

/* Обсуждение под токеном.

   Списком идут последние сообщения, свежие сверху. Автор подписан ником
   и аватаркой в его же рамке — купленная косметика должна быть видна
   там, где на неё смотрят чужие люди, иначе её незачем покупать.

   Гость читает, но не пишет: строка ввода у него заменена приглашением
   завести аккаунт. Прятать от него саму ленту нельзя — это половина
   причины остаться. */
function TokenComments({ tokenId, currentUserId, onNeedAuth, onOpenProfile, showToast }) {
  const [items, setItems] = useState(null);
  const [draft, setDraft] = useState("");
  const [sending, setSending] = useState(false);

  const load = useCallback(async () => {
    if (!tokenId) return;
    const { data, error } = await supabase.rpc("token_comments_with_authors", { p_token: tokenId, p_limit: 50 });
    if (!error) setItems(data || []);
    else setItems([]);
  }, [tokenId]);

  useEffect(() => { setItems(null); load(); }, [load]);

  async function send() {
    const text = draft.trim();
    if (!text || sending) return;
    if (!currentUserId) { onNeedAuth && onNeedAuth(); return; }
    setSending(true);
    const { error } = await supabase.from("token_comments").insert({ token_id: tokenId, user_id: currentUserId, body: text });
    setSending(false);
    if (error) {
      // Ограничения стоят в базе, поэтому и текст берём из её ответа:
      // «слишком часто» и «слишком длинно» лечатся по-разному.
      const код = String(error.message || "");
      showToast(код.includes("too_fast") ? t("commentTooFast")
        : код.includes("too_many") ? t("commentTooMany")
        : код.includes("body_check") || код.includes("check constraint") ? t("commentTooLong")
        : t("saveFailed"));
      return;
    }
    setDraft("");
    haptic("light");
    load();
  }

  async function remove(id) {
    const { error } = await supabase.from("token_comments").delete().eq("id", id);
    if (error) { showToast(t("saveFailed")); return; }
    setItems((prev) => (prev || []).filter((c) => c.id !== id));
  }

  return (
    <div className="flex flex-col gap-3">
      <div className="flex items-center justify-between">
        <span style={{ fontFamily: displayFont, color: T.ice, fontSize: 15, fontWeight: 700 }}>{t("commentsTitle")}</span>
        {items && items.length > 0 && (
          <span style={{ fontFamily: monoFont, color: T.muted, fontSize: 12.5 }}>{items.length}</span>
        )}
      </div>

      {currentUserId ? (
        <div className="flex items-end gap-2">
          <textarea
            value={draft}
            onChange={(e) => setDraft(e.target.value.slice(0, 400))}
            placeholder={t("commentPlaceholder")}
            rows={1}
            style={{
              flex: 1, minWidth: 0, resize: "none",
              fontFamily: bodyFont, fontSize: 16, lineHeight: 1.4, color: T.ice,
              background: T.surface, border: `1px solid ${T.line}`, borderRadius: 18,
              padding: "10px 13px", outline: "none",
            }}
          />
          <button
            onClick={send}
            disabled={!draft.trim() || sending}
            className={`fx-tap flex items-center justify-center${sending ? " fx-busy" : ""}`}
            style={{
              width: 42, height: 42, borderRadius: "50%", flexShrink: 0,
              background: draft.trim() && !sending ? PRISM : T.surfaceHi,
              border: draft.trim() && !sending ? "none" : `1px solid ${T.line}`,
            }}
          >
            <Send size={15} color={draft.trim() && !sending ? PRISM_TEXT : T.muted} />
          </button>
        </div>
      ) : (
        <button
          onClick={() => onNeedAuth && onNeedAuth()}
          className="fx-tap w-full rounded-[18px] py-2.5"
          style={{ background: T.surface, border: `1px dashed ${T.line}`, fontFamily: bodyFont, fontSize: 13.5, color: T.muted }}
        >
          {t("commentNeedAccount")}
        </button>
      )}

      {items === null ? (
        <div className="flex items-center justify-center" style={{ height: 70 }}><LeafLoader size={30} /></div>
      ) : items.length === 0 ? (
        <div className="rounded-[20px] p-4 text-center" style={{ background: T.surface, border: `1px dashed ${T.line}` }}>
          <span style={{ fontFamily: bodyFont, color: T.muted, fontSize: 13.5 }}>{t("commentsEmpty")}</span>
        </div>
      ) : (
        <div className="flex flex-col gap-2">
          {items.map((c) => (
            <div key={c.id} className="flex gap-2.5 rounded-[20px] p-3" style={{ background: T.surface, border: `1px solid ${T.line}` }}>
              <button
                onClick={() => onOpenProfile && c.user_id && onOpenProfile(c.user_id)}
                className="fx-tap"
                style={{ background: "transparent", border: "none", padding: 0, flexShrink: 0, lineHeight: 0 }}
              >
                <AvatarFrame frameId={c.frame_id || "none"} size={36}>
                  <div style={{
                    width: "100%", height: "100%", borderRadius: "50%",
                    background: c.avatar_url ? `center/cover no-repeat url(${c.avatar_url})` : T.surfaceHi,
                    display: "flex", alignItems: "center", justifyContent: "center", fontSize: 16,
                  }}>
                    {!c.avatar_url && (c.emoji || "🙂")}
                  </div>
                </AvatarFrame>
              </button>
              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-2">
                  <span className="truncate" style={{ fontFamily: displayFont, color: T.ice, fontSize: 13.5, fontWeight: 700 }}>
                    {c.nickname || "—"}
                  </span>
                  <span style={{ fontFamily: monoFont, color: T.muted, fontSize: 11.5 }}>{fmtSince(c.created_at)}</span>
                  {c.user_id === currentUserId && (
                    <button onClick={() => remove(c.id)} className="fx-tap" style={{ background: "transparent", border: "none", marginLeft: "auto", padding: 0 }}>
                      <Trash2 size={12} color={T.muted} />
                    </button>
                  )}
                </div>
                <div style={{ fontFamily: bodyFont, color: T.paper, fontSize: 14, lineHeight: 1.45, marginTop: 3, whiteSpace: "pre-wrap", wordBreak: "break-word" }}>
                  {c.body}
                </div>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

/* Позиция человека по токену: сколько его на кошельке прямо сейчас.
   Спрашиваем у сети, а не у локального счётчика покупок — тот не знает
   ни о сделках с другого устройства, ни о переводах мимо приложения. */
function useПозиция(token, walletAddress) {
  const [количество, setКоличество] = useState(null);
  useEffect(() => {
    let жив = true;
    setКоличество(null);
    const адрес = token && (token.tokenAddress || token.address);

    async function загрузить() {
      if (!адрес) { if (жив) setКоличество(0); return; }
      try {
        if (token.chain === "solana") {
          const { сохранённаяСессия } = await import("./phantom");
          const сессия = сохранённаяСессия();
          if (!сессия) { if (жив) setКоличество(0); return; }
          const r = await fetch(апи(`/api/solana?action=balances&wallet=${сессия.wallet}&mint=${адрес}`))
            .then((x) => x.json());
          if (жив) setКоличество(Number(r && r.token) || 0);
          return;
        }
        if (!walletAddress) { if (жив) setКоличество(0); return; }
        const b = await fetchJettonBalance(адрес, walletAddress, !!token.curveAddress && TON_TESTNET_NETWORK);
        if (жив) setКоличество(Number(b) || 0);
      } catch {
        if (жив) setКоличество(0);
      }
    }
    загрузить();
    return () => { жив = false; };
  }, [token && token.id, token && token.tokenAddress, token && token.chain, walletAddress]);
  return количество;
}

/* Крупнейшие держатели. У каждой сети свой источник: в TON их отдаёт
   обозреватель, в Solana — узел через наш обработчик, чтобы ключ не
   уезжал в браузер. */
function useТопДержателей(token, открыто) {
  const [список, setСписок] = useState(null);
  useEffect(() => {
    if (!открыто) return;
    let жив = true;
    setСписок(null);
    const адрес = token && (token.tokenAddress || token.address);
    if (!адрес) { setСписок([]); return; }

    async function загрузить() {
      try {
        if (token.chain === "solana") {
          const r = await fetch(апи(`/api/solana?action=holders&mint=${адрес}`)).then((x) => x.json());
          const счета = (r && r.счета) || [];
          if (жив) setСписок(счета.map((с) => ({ адрес: с.адрес, доля: с.доля, количество: с.количество })));
          return;
        }
        const хост = (!!token.curveAddress && TON_TESTNET_NETWORK) ? "https://testnet.tonapi.io" : TONAPI_MAINNET_BASE;
        const r = await fetch(`${хост}/v2/jettons/${адрес}/holders?limit=12`).then((x) => x.json());
        const всего = (r && r.addresses) || [];
        const сумма = всего.reduce((acc, x) => acc + Number(x.balance || 0), 0);
        if (жив) {
          setСписок(всего.map((x) => ({
            адрес: (x.owner && x.owner.address) || x.address,
            доля: сумма > 0 ? (Number(x.balance || 0) / сумма) * 100 : 0,
            количество: null,
          })));
        }
      } catch {
        if (жив) setСписок([]);
      }
    }
    загрузить();
    return () => { жив = false; };
  }, [открыто, token && token.id, token && token.tokenAddress, token && token.chain]);
  return список;
}

/* Заметка о токене («тезис»). Живёт в телефоне: это личная мысль о
   сделке, а не публичные данные — отправлять её на сервер незачем. */
function useТезис(tokenId) {
  const ключ = `mintly.thesis.${tokenId || ""}`;
  const [текст, setТекст] = useState("");
  useEffect(() => {
    try { setТекст((typeof window !== "undefined" && window.localStorage.getItem(ключ)) || ""); }
    catch { setТекст(""); }
  }, [ключ]);
  const сохранить = useCallback((значение) => {
    setТекст(значение);
    try {
      if (typeof window === "undefined") return;
      if (значение.trim()) window.localStorage.setItem(ключ, значение);
      else window.localStorage.removeItem(ключ);
    } catch { /* приватный режим */ }
  }, [ключ]);
  return [текст, сохранить];
}

function TokenDetail({ t: token, onBack, showToast, onBuy, onSell, unlocked = true, connected = true, onConnectWallet, themeKey, currentUserId = null, onNeedAuth, onOpenProfile, tonPriceUsd = 0, walletAddress = null, onManage = null }) {
  // График вынесен из вкладок наверх, поэтому здесь остались только
  // разделы под ним: держатели, лента, о токене.
  const [tab, setTab] = useState("feed"); // holders | feed | about
  const [chartMode] = useState("mcap"); // always market cap — price toggle removed
  const [tf, setTf] = useState(() => {
    try {
      if (typeof window !== "undefined") {
        const saved = window.localStorage.getItem("mintly_chart_tf");
        if (saved && TIMEFRAMES.includes(saved)) return saved;
      }
    } catch (e) { /* localStorage unavailable */ }
    return "H1";
  });
  // Ряд интервалов прокручивается вбок; выбранный подводим в поле
  // зрения, иначе после открытия экрана он мог оказаться за краем.
  const tfRowRef = useRef(null);
  function changeTf(next) {
    setTf(next);
    try { if (typeof window !== "undefined") window.localStorage.setItem("mintly_chart_tf", next); } catch (e) { /* localStorage unavailable */ }
  }
  useEffect(() => {
    const row = tfRowRef.current;
    if (!row) return;
    const btn = row.querySelector(`[data-tf="${tf}"]`);
    if (!btn) return;
    // Прокручиваем сам ряд, а не страницу: scrollIntoView утянул бы за
    // собой весь экран токена.
    const left = btn.offsetLeft - (row.clientWidth - btn.offsetWidth) / 2;
    row.scrollTo({ left: Math.max(0, left), behavior: "smooth" });
  }, [tf, tab]);
  const [chartData, setChartData] = useState(null); // { candles, volume, isLive }
  const [chartLoading, setChartLoading] = useState(true);
  const chartSrcRef = useRef(null);
  // Нажатие «Повторить» на пустом графике: меняем число — и загрузка
  // начинается заново, не дожидаясь общего круга обновления.
  const [chartReload, setChartReload] = useState(0);
  const [hovered, setHovered] = useState(null);
  const up = token.change >= 0;
  // Сколько токена лежит на кошельке прямо сейчас — по этому числу
  // считается стоимость позиции и её движение за сутки.
  const позиция = useПозиция(token, walletAddress);
  const топДержателей = useТопДержателей(token, tab === "holders");
  const [тезис, сохранитьТезис] = useТезис(token.id);
  const [тезисОткрыт, setТезисОткрыт] = useState(false);
  const [черновикТезиса, setЧерновикТезиса] = useState("");
  // У токена на кривой жетон живёт в той же сети, что и приложение.
  // У токена на своей кривой один из жетонных кошельков — её
  // собственный, человеком он не является.
  const holdersCount = useJettonHolders(token.tokenAddress, !!token.curveAddress && TON_TESTNET_NETWORK, token.curveAddress ? 1 : 0);
  // Владелец заодно чинит запись в базе, поэтому передаём, он это или нет.
  const логотип = useTokenLogo(
    token.logoUrl,
    token.tokenAddress,
    !!token.curveAddress && TON_TESTNET_NETWORK,
    token.id,
    !!(currentUserId && token.ownerId && currentUserId === token.ownerId),
  );

  // Состояние кривой нужно ради шкалы до листинга: сколько TON уже
  // собрано и сколько зашито целью в самом контракте.
  const [curve, setCurve] = useState(null);
  useEffect(() => {
    if (!token.curveAddress) { setCurve(null); return; }
    let cancelled = false;
    const load = () => fetchCurveState(token.curveAddress, TON_TESTNET_NETWORK, TON_PRIORITY.token).then((st) => {
      if (!cancelled && st) setCurve(st);
    });
    load();
    const iv = setInterval(load, 20000);
    return () => { cancelled = true; clearInterval(iv); };
  }, [token.curveAddress]);

  // Состояние собственного пула. Спрашиваем только когда кривая уже
  // закрыта: до этого пул развёрнут, но пуст, и торговля идёт не через
  // него — лишний запрос в цепочку на каждый токен ленты ни к чему.
  const [poolState, setPoolState] = useState(null);
  useEffect(() => {
    if (!token.dexPoolAddress || !(curve && curve.graduated)) { setPoolState(null); return; }
    let cancelled = false;
    const load = () => fetchPoolState(token.dexPoolAddress, TON_TESTNET_NETWORK, TON_PRIORITY.token).then((st) => {
      if (!cancelled && st) setPoolState(st);
    });
    load();
    const iv = setInterval(load, 20000);
    return () => { cancelled = true; clearInterval(iv); };
  }, [token.dexPoolAddress, curve && curve.graduated]);

  // Рынок открыт: пул принял обе половины ликвидности и торгует. Между
  // закрытием кривой и этим моментом проходит несколько блоков —
  // покупать в это время физически не у кого.
  const рынокОткрыт = !!(token.dexPoolAddress && poolState && poolState.ready);

  // Real OHLCV (via GeckoTerminal's data API — no iframe, no branding) when
  // the token is backed by a live on-chain pool; a synthetic random-walk
  // chart otherwise (bundled demo tokens, or if the fetch fails) so the
  // screen never shows a blank chart. We render everything ourselves with
  // TerminalChart, so there's no external widget or watermark involved.
  // Токен, запущенный здесь же, торгуется на своей кривой, а не на DEX:
  // для него история берётся прямо из транзакций контракта. Случайный
  // график остаётся только там, где реальных данных нет вовсе.
  const curveChart = !token.poolAddress && !!token.curveAddress;
  // Какой интервал выбран прямо сейчас. Ответы приходят не в том
  // порядке, в каком их спрашивали: пока идёт запрос на пять минут,
  // человек успевает нажать час, и медленный ответ на пятиминутку
  // ложится поверх часового. Отсюда и путаница — кнопка одна, свечи
  // другие. Поэтому у каждого ответа спрашиваем, за свой ли он интервал.
  const tfRef = useRef(tf);
  tfRef.current = tf;
  useEffect(() => {
    let cancelled = false;
    const reqTf = tf;
    // Запросы брошенного интервала снимаются с очереди: иначе свечи
    // выбранного ждут, пока отработают все, что нажали до него.
    const abort = typeof AbortController !== "undefined" ? new AbortController() : null;
    setChartLoading(true);
    async function attempt(allowFlat) {
      let result = null;
      let src = null;
      if (token.poolAddress) {
        result = await fetchPoolOHLCV(token.poolAddress, tf, GT_PRIORITY.chart, abort ? abort.signal : undefined, сетьТокена(token));
        if (result) src = "pool";
      }
      // Курс передаём тот же, по которому посчитана цена в шапке. Раньше
      // график брал его сам, и пока настоящий курс не приехал, строился
      // по запасному — цифры на графике и над ним расходились в разы.
      // Ветка идёт после биржевой и только если та ничего не дала: у
      // токена, вышедшего на биржу, есть оба адреса, и раньше свежий
      // биржевой график тут же затирался историей кривой.
      if (!result && token.curveAddress) {
        result = await fetchCurveOHLCV(token.curveAddress, tf, TON_TESTNET_NETWORK, tonPriceUsd > 0 ? tonPriceUsd : tonUsd(), token.id);
        if (result) src = "curve";
      }
      // Запасной истории курса от tonapi здесь больше нет. Это другой
      // ряд: у той же пары в тот же момент он показывал 33.59M против
      // 33.33M у биржи, и рисовался с другой сеткой времени. Стоило
      // бирже не ответить сразу (лимит запросов при открытии
      // приложения), как на экран попадал он, а через пару переключений
      // его сменяли настоящие свечи — это и было «сначала липовый
      // график, потом нормальный». Лучше подождать биржу.
      // Выдуманных свечей больше нет ни для кого. У токена на кривой
      // история есть всегда, и если запрос не прошёл (у бесплатного
      // tonapi жёсткий лимит), рисуется ровная линия по текущей цене —
      // между сделками цена и правда стоит. У токена с биржи данные
      // либо пришли, либо нет: во втором случае показываем «нет
      // данных», а не случайное движение.
      let flat = false;
      if (!result && allowFlat && curveChart) { result = flatCandles(token.price, tf, CHART_TOTAL); src = "curve"; flat = true; }
      if (cancelled || reqTf !== tfRef.current) return false;
      // Источник запоминается: обновлять график надо из того же места.
      // Иначе свечи биржи и точки tonapi сменяли друг друга — сетка
      // времени у них разная, и картинка дёргалась вбок.
      chartSrcRef.current = src;
      // Интервал едет вместе со свечами: экран рисует их, только когда
      // они и вправду за выбранный интервал, а не «какие пришли».
      if (result) {
        setChartData({ ...result, tf: reqTf, isLive: true });
        setChartLoading(false);
        return flat ? "flat" : "real";
      }
      return false;
    }
    (async () => {
      // Не вышло с первого раза — почти всегда это лимит запросов у
      // бесплатного tonapi, в который упирается пачка запросов при
      // открытии приложения. Повторяем сами, не дожидаясь общего круга
      // обновления в пятнадцать секунд.
      //
      // Первые попытки идут без запасной ровной линии: показать прямую по
      // последней известной цене вместо истории — это и есть тот самый
      // «липовый график», который потом сам собой сменяется настоящим.
      // Лучше подержать загрузку на пару секунд дольше.
      for (const [pause, allowFlat] of [[0, false], [2000, false], [4500, true]]) {
        if (pause) await new Promise((r) => setTimeout(r, pause));
        if (cancelled || reqTf !== tfRef.current) return;
        const got = await attempt(allowFlat);
        if (cancelled || reqTf !== tfRef.current) return;
        if (got === "real") return;
        if (got === "flat") return;
      }
      setChartData(null);
      setChartLoading(false);
    })();
    return () => { cancelled = true; if (abort) abort.abort(); };
    // priceKnown в зависимостях намеренно: пока цена не приехала, ровную
    // линию строить не из чего, и попытку нужно повторить.
    // tonPriceUsd в зависимостях: график считается в долларах, и при
    // смене курса его нужно пересобрать, иначе он повиснет на старом.
  }, [tf, token.id, token.poolAddress, token.curveAddress, token.price > 0, tonPriceUsd, chartReload]);

  // Обновление открытого графика. Крутится и тогда, когда данных ещё
  // нет: первый запрос мог не пройти из-за лимита, и без повторов на
  // экране навсегда оставалась бы надпись «истории нет». Дорисовывать
  // дрожание последней свече, как раньше, больше не нужно — выдуманных
  // движений на графике нет вовсе.
  useEffect(() => {
    if (!token.poolAddress && !curveChart) return;
    let cancelled = false;
    const reqTf = tf;
    const abort = typeof AbortController !== "undefined" ? new AbortController() : null;
    async function refresh() {
      let fresh = null;
      if (curveChart) {
        fresh = await fetchCurveOHLCV(token.curveAddress, tf, TON_TESTNET_NETWORK, tonPriceUsd > 0 ? tonPriceUsd : tonUsd(), token.id);
      } else {
        // Только биржа. Если она не ответила — на экране остаётся то, что
        // уже нарисовано, и следующий круг спросит снова.
        fresh = token.poolAddress ? await fetchPoolOHLCV(token.poolAddress, tf, GT_PRIORITY.chart, abort ? abort.signal : undefined, сетьТокена(token)) : null;
        if (fresh) chartSrcRef.current = "pool";
      }
      if (cancelled || reqTf !== tfRef.current || !fresh?.candles?.length) return;
      setChartData((prev) => (prev
        ? { ...prev, candles: fresh.candles, volume: fresh.volume, tf: reqTf }
        : { ...fresh, tf: reqTf, isLive: true }));
      setChartLoading(false);
    }
    const iv = setInterval(refresh, 15000);
    return () => { cancelled = true; clearInterval(iv); if (abort) abort.abort(); };
  }, [token.id, token.poolAddress, token.curveAddress, curveChart, tf, tonPriceUsd]);

  // Real supply estimate (mcap / price) derived from the same live data —
  // used only to scale the chart between "price" and "market cap" display,
  // exactly like GeckoTerminal/STON.fi's own MCap/Price toggle.
  // Множитель «цена → капитализация» — это выпуск токена, и он не
  // меняется. Но считался он из цены и капитализации, которые приезжают
  // из ленты отдельно от свечей и чуть разъезжаются на каждом
  // обновлении. От этого множитель дрожал, и вместе с ним прыгал ВЕСЬ
  // график: все свечи разом уезжали вверх-вниз, а за ними и шкала.
  // Поэтому берём его один раз на токен и держим.
  const supplyRef = useRef({ id: null, value: 0 });
  if (supplyRef.current.id !== token.id) supplyRef.current = { id: token.id, value: 0 };
  if (!supplyRef.current.value && token.price > 0 && token.mcapNum > 0) {
    supplyRef.current.value = token.mcapNum / token.price;
  }
  const supplyEst = supplyRef.current.value;
  const scaledCandles = useMemo(() => {
    if (!chartData?.candles) return null;
    // Без множителя рисовать нечего: раньше в этот момент график молча
    // показывал цену вместо капитализации — все числа менялись в
    // тридцать миллионов раз, шкала перестраивалась, и это и был тот
    // самый рывок. Лучше подождать, пока множитель приедет.
    if (chartMode === "price") return chartData.candles;
    if (!supplyEst) return null;
    return chartData.candles.map(c => ({ ...c, open: c.open * supplyEst, high: c.high * supplyEst, low: c.low * supplyEst, close: c.close * supplyEst }));
  }, [chartData, chartMode, supplyEst]);
  // Свечи годятся к показу, только если они за выбранный сейчас интервал.
  // Пока их нет — крутится загрузка; «нет данных» пишем лишь тогда, когда
  // запрос отработал и не принёс ничего.
  const chartReady = !!(chartData && chartData.tf === tf && scaledCandles && scaledCandles.length);
  // Множитель «цена → капитализация» приезжает отдельно от свечей: пока
  // его нет, показывать нечего, но и «нет данных» неправда.
  const chartPending = chartLoading || (!!chartData && chartData.tf === tf && !scaledCandles);

  // Кнопка «поделиться» открывает карточку картинкой: голая ссылка в
  // чате не показывает ни цифр, ни лого — превью мини-приложения
  // Telegram не разворачивает.
  const [shareOpen, setShareOpen] = useState(false);
  function handleShare() { haptic("light"); setShareOpen(true); }
  function copyContract() {
    if (!token.tokenAddress) return;
    if (typeof navigator !== "undefined" && navigator.clipboard) {
      navigator.clipboard.writeText(token.tokenAddress).catch(() => {});
      showToast(tr("addressCopied"));
    }
  }

  // Honest, local-only reaction counters (no social backend here — see
  // useLocalCounter). ⭐ favorite / 🔥 hype / 💔 rug-report, each capped at
  // one tap per device so they read as a toggle, not a spam counter.
  const [favCount, bumpFav] = useLocalCounter(`mintly_fav_${token.id}`, true);
  const [hypeCount, bumpHype] = useLocalCounter(`mintly_hype_${token.id}`, true);
  const [rugCount, bumpRug] = useLocalCounter(`mintly_rug_${token.id}`, true);
  function handleRug() {
    if (rugCount < 1) showToast(tr("reportSent"));
    bumpRug();
  }

  // Real description + social links for this token, fetched once per
  // token address from GeckoTerminal's info endpoint (cached — see
  // fetchTokenInfo). null while loading or if GeckoTerminal has nothing
  // on file for this token, in which case the About card is simply
  // omitted instead of showing an invented bio.
  const [info, setInfo] = useState(null);
  useEffect(() => {
    let cancelled = false;
    setInfo(null);
    setInfoLoading(!!token.tokenAddress);
    if (token.tokenAddress) {
      fetchTokenInfo(token.tokenAddress, сетьТокена(token)).then((res) => {
        if (cancelled) return;
        setInfo(res);
        setInfoLoading(false);
      });
    }
    return () => { cancelled = true; };
  }, [token.tokenAddress]);

  // Real recent trades for the Transactions tab — only fetched once that
  // tab is actually opened (no point spending API calls on tabs nobody
  // looked at), refreshed while it stays open.
  const [infoLoading, setInfoLoading] = useState(false);
  const [trades, setTrades] = useState(() => cachedPoolTrades(token.poolAddress, сетьТокена(token)));
  const [tradesLoading, setTradesLoading] = useState(false);
  // У токена на кривой сделок в агрегаторах нет: список собирается из
  // транзакций самого контракта.
  useEffect(() => {
    if (tab !== "tx" || token.poolAddress || !token.curveAddress) return;
    let cancelled = false;
    setTradesLoading(true);
    async function load() {
      const m = await fetchCurveMarket(token.curveAddress, token.tokenAddress, TON_TESTNET_NETWORK);
      if (cancelled) return;
      if (m) setTrades(curveTradesToFeed(m.trades, curveParamsOf(m.state)));
      else setTrades((prev) => (prev && prev.length ? prev : null));
      setTradesLoading(false);
    }
    load();
    const iv = setInterval(load, 15000);
    return () => { cancelled = true; clearInterval(iv); };
  }, [tab, token.curveAddress, token.tokenAddress, token.poolAddress]);

  // Ждать перехода на вкладку не нужно: запрос дешёвый, а список к
  // моменту нажатия уже готов. Раньше он начинался только по клику, и
  // человек смотрел на пустоту ровно столько, сколько идёт запрос.
  useEffect(() => {
    if (!token.poolAddress) return;
    let cancelled = false;
    // Есть что показать из прошлого захода — рисуем немедленно и не
    // включаем «загружаем»: обновление приедет через секунду поверх.
    const cached = cachedPoolTrades(token.poolAddress, сетьТокена(token));
    if (cached) setTrades(cached);
    setTradesLoading(!cached);
    async function load() {
      const res = await fetchPoolTrades(token.poolAddress, 300, GT_PRIORITY.trades, сетьТокена(token));
      if (cancelled) return;
      // null = запрос не прошёл. Уже показанный список в этом случае
      // оставляем на месте: мигать пустым экраном из-за одного 429 хуже,
      // чем показать данные пятнадцатисекундной давности.
      if (res) setTrades(res);
      else setTrades((prev) => (prev && prev.length ? prev : null));
      setTradesLoading(false);
    }
    load();
    // Пока вкладка сделок не открыта, обновлять список ни к чему.
    const iv = tab === "tx" ? setInterval(load, 15000) : null;
    return () => { cancelled = true; if (iv) clearInterval(iv); };
  }, [tab, token.poolAddress, token.chain]);

  // Ссылки на сайт и соцсети приходят из внешнего источника, то есть их
  // содержимое мы не контролируем. Открываем только http и https:
  // javascript:-адрес, попавший в такое поле, выполнился бы в окне
  // приложения со всеми его правами.
  function openSocial(url) {
    if (typeof window === "undefined" || !url) return;
    let parsed;
    try {
      parsed = new URL(String(url), window.location.origin);
    } catch (e) {
      return;
    }
    if (parsed.protocol !== "http:" && parsed.protocol !== "https:") return;
    window.open(parsed.href, "_blank", "noopener,noreferrer");
  }

  return (
    <div className="fx-view flex flex-col pb-4" style={{ position: "relative", gap: 18 }}>
      <TrendFX up={up} seedKey={token.seed} />
      <TokenShareSheet
        token={shareOpen ? { ...token, logoUrl: логотип } : null}
        curve={curve}
        holders={holdersCount}
        userId={currentUserId}
        onClose={() => setShareOpen(false)}
        showToast={showToast}
      />
      <div style={{ position: "relative", zIndex: 1, display: "flex", flexDirection: "column", gap: 18 }}>

      {/* Шапка — одной строкой вместо двух. Раньше кнопка «назад» жила
          этажом выше имени токена, и первый экран начинался с двух
          полупустых полос. */}
      <div className="flex items-center gap-3">
        {!hasTelegramBack() && (
          <button onClick={onBack} className="fx-tap flex items-center justify-center flex-shrink-0"
            style={{ width: 32, height: 32, borderRadius: 10, background: "transparent", border: `1px solid ${T.line}`, color: T.ice }}>
            <ChevronLeft size={17} />
          </button>
        )}
        <TokenAvatar size={38} tone={up ? "up" : "down"} src={логотип} />
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-1.5">
            <span className="truncate" style={{ fontFamily: displayFont, color: T.ice, fontSize: 17, fontWeight: 600 }}>{token.name}</span>
            {token.verified && <ShieldCheck size={13} color={T.electric} style={{ flexShrink: 0 }} />}
            <ПометкаТест сеть={token.network} size={10.5} />
          </div>
          <div className="truncate" style={{ fontFamily: monoFont, color: T.faint, fontSize: 12 }}>
            ${token.ticker}{fmtAge(token.createdAt) ? ` · ${fmtAge(token.createdAt)}` : ""}{token.dexName ? ` · ${token.dexName}` : ""}
          </div>
        </div>
        <div className="flex items-center gap-1 flex-shrink-0">
          <button onClick={handleShare} className="fx-tap flex items-center justify-center"
            style={{ width: 32, height: 32, borderRadius: 10, border: `1px solid ${T.line}` }}>
            <Share2 size={14} color={T.muted} />
          </button>
          {/* Ссылка и удаление — только у своего токена. Раньше они жили
              кнопкой «Управлять» на карточке в профиле, но карточка ведёт
              на этот экран, и распоряжаться токеном логично здесь же. */}
          {onManage && (
            <button onClick={() => onManage(token)} className="fx-tap flex items-center justify-center"
              aria-label={tr("manageBtn")}
              style={{ width: 32, height: 32, borderRadius: 10, border: `1px solid ${T.line}` }}>
              <Settings size={14} color={T.muted} />
            </button>
          )}
        </div>
      </div>

      {/* Цена — главное число экрана. Раньше её место занимала
          капитализация, а цена шла подписью снизу: смотрят же в первую
          очередь на цену, а капитализация — контекст к ней. */}
      <div className="flex flex-col" style={{ gap: 8 }}>
        <div className="flex items-end justify-between gap-3">
          <div className="min-w-0">
            <div className="flex items-end gap-2 flex-wrap">
              <span style={{ fontFamily: displayFont, fontWeight: 700, fontSize: 34, lineHeight: 1.05, color: T.ice, letterSpacing: "-0.02em", wordBreak: "break-all" }}>
                {fmtPrice(token.price)}
              </span>
              <div style={{ marginBottom: 3 }}><ChangeBadge value={token.change} size="md" /></div>
            </div>
          </div>
          {token.tokenAddress ? (
            <button onClick={copyContract} className="fx-tap flex items-center gap-1.5 flex-shrink-0" style={{ padding: "4px 0" }}>
              <span style={{ fontFamily: monoFont, color: T.faint, fontSize: 12 }}>{shortAddr(token.tokenAddress)}</span>
              <Copy size={11} color={T.faint} />
            </button>
          ) : null}
        </div>

        {/* Второстепенные числа — одной строкой мелким шрифтом: они
            нужны для сверки, а не для чтения по слогам. */}
        <div className="no-scrollbar flex items-center overflow-x-auto" style={{ gap: 14, whiteSpace: "nowrap" }}>
          {[
            [t("marketCapLabel"), fmtUSD(token.mcapNum)],
            [tr("statVolume24h"), `$${token.vol}`],
            [tr("statLiquidity"), `$${token.liq}`],
            token.chain === "solana"
              ? [tr("statTx24h"), (token.tx24h || 0).toLocaleString("ru-RU")]
              : [tr("statHolders"), holdersCount == null ? "—" : holdersCount.toLocaleString("ru-RU")],
          ].map(([подпись, значение]) => (
            <div key={подпись} className="flex items-center flex-shrink-0" style={{ gap: 6 }}>
              <span style={{ fontFamily: bodyFont, color: T.faint, fontSize: 12 }}>{подпись}</span>
              <span style={{ fontFamily: monoFont, color: T.paper, fontSize: 12.5 }}>{значение}</span>
            </div>
          ))}
        </div>

        {/* Непроверенный токен — строкой, а не жёлтым щитом во весь
            экран: предупредить нужно, напугать — нет. */}
        {!token.verified && (
          <div className="flex items-center" style={{ gap: 6 }}>
            <ShieldAlert size={13} color={T.warning} />
            <span style={{ fontFamily: bodyFont, color: T.warning, fontSize: 12.5 }}>{tr("unverifiedToken")}</span>
          </div>
        )}
      </div>

      {/* Интервалы графика */}
      <div className="flex flex-col" style={{ gap: 10 }}>
        <div className="no-scrollbar flex gap-1.5 overflow-x-auto" ref={tfRowRef} style={{ paddingBottom: 2 }}>
          {TIMEFRAMES.map(f => (
            <button
              key={f}
              data-tf={f}
              onClick={() => changeTf(f)}
              className="tf-btn fx-tap rounded-[10px] px-2.5 py-1 flex-shrink-0"
              style={{
                fontFamily: monoFont, fontSize: 12,
                background: tf === f ? T.surfaceHi : "transparent",
                color: tf === f ? T.ice : T.faint,
                border: `1px solid ${tf === f ? T.lineHi : "transparent"}`,
              }}
            >
              {f}
            </button>
          ))}
        </div>

        {/* График идёт во всю ширину страницы, а не лежит в карточке:
            рамка и скругление вокруг него мешали читать свечи у краёв, а
            места под сам график оставалось меньше. */}
        <div style={{ position: "relative", marginLeft: -16, marginRight: -16, background: T.bg }}>
          {!chartReady && chartPending ? (
            <div className="flex items-center justify-center" style={{ height: 360 }}>
              <LeafLoader size={64} />
            </div>
          ) : !chartReady ? (
            <div className="flex flex-col items-center justify-center gap-3" style={{ height: 360, padding: "0 20px" }}>
              <span style={{ fontFamily: monoFont, fontSize: 12, color: T.muted, textAlign: "center" }}>{tr("chartNoData")}</span>
              <button
                onClick={() => setChartReload((v) => v + 1)}
                className="fx-tap rounded-full px-3.5 py-1.5"
                style={{ background: T.surface, border: `1px solid ${T.line}`, fontFamily: bodyFont, fontSize: 13, color: T.ice }}
              >
                {tr("chartRetry")}
              </button>
            </div>
          ) : (
            <TerminalChart key={`${token.id}-${tf}-${chartMode}`} candles={scaledCandles} height={360} themeKey={themeKey} onHover={setHovered} tf={tf} valueFmt={chartMode === "price" ? fmtPrice : fmtUSD} />
          )}
        </div>
      </div>

      {/* Позиция — сразу под графиком: посмотрел на цену и увидел, что
          она значит именно для тебя. */}
      <div className="flex flex-col" style={{ gap: 12, padding: 14, borderRadius: 16, background: T.surface, border: `1px solid ${T.line}` }}>
        <div className="flex items-center justify-between">
          <span style={{ fontFamily: displayFont, color: T.ice, fontSize: 14.5, fontWeight: 600 }}>{tr("positionTitle")}</span>
          {позиция != null && позиция > 0 && (
            <span style={{ fontFamily: monoFont, fontSize: 12.5, color: up ? T.up : T.down }}>
              {up ? "+" : ""}{fmtUSD(Math.abs(позиция * token.price * (token.change || 0) / 100) * (up ? 1 : -1))} · {tr("positionChange24")}
            </span>
          )}
        </div>
        {позиция == null ? (
          <div className="flex flex-col gap-2">
            <div className="fx-skeleton" style={{ width: 120, height: 22, borderRadius: 6 }} />
            <div className="fx-skeleton" style={{ width: 90, height: 12, borderRadius: 4 }} />
          </div>
        ) : позиция > 0 ? (
          <div className="flex items-end justify-between gap-3">
            <div>
              <div style={{ fontFamily: displayFont, color: T.ice, fontSize: 24, fontWeight: 600, letterSpacing: "-0.01em" }}>
                {fmtUSD(позиция * token.price)}
              </div>
              <div style={{ fontFamily: monoFont, color: T.faint, fontSize: 12.5, marginTop: 2 }}>
                {fmtCoin(позиция)} ${token.ticker}
              </div>
            </div>
          </div>
        ) : (
          <span style={{ fontFamily: bodyFont, color: T.muted, fontSize: 13.5 }}>{tr("positionEmpty")}</span>
        )}

        {/* Кнопки сделки живут здесь же: решение принимается по позиции,
            а не по отдельному блоку внизу страницы. */}
        {curve && curve.graduated && !рынокОткрыт ? null : (connected || token.chain === "solana") ? (
          <div className="flex gap-2">
            <button onClick={onBuy} className="fx-tap flex-1 rounded-[14px] py-2.5 flex items-center justify-center gap-1.5" style={{ fontFamily: displayFont, fontWeight: 600, fontSize: 14.5, background: PRISM, color: PRISM_TEXT, opacity: unlocked ? 1 : 0.55 }}>{!unlocked && <Lock size={13} />}{tr("buy")}</button>
            <button onClick={onSell} className="fx-tap flex-1 rounded-[14px] py-2.5 flex items-center justify-center gap-1.5" style={{ fontFamily: displayFont, fontWeight: 600, fontSize: 14.5, background: "transparent", color: T.ice, border: `1px solid ${T.lineHi}`, opacity: unlocked ? 1 : 0.55 }}>{!unlocked && <Lock size={13} />}{tr("sell")}</button>
          </div>
        ) : (
          <button onClick={onConnectWallet} className="fx-tap w-full rounded-[14px] py-2.5 flex items-center justify-center gap-2" style={{ fontFamily: displayFont, fontWeight: 600, fontSize: 14.5, background: T.ice, color: T.bg }}>
            <Wallet size={15} /> {tr("connectWalletCta")}
          </button>
        )}
      </div>

      {/* Тезис — личная заметка о сделке. Строка, а не карточка: пока
          она пустая, ей незачем занимать место. */}
      {тезисОткрыт ? (
        <div className="fx-reveal flex flex-col" style={{ gap: 8 }}>
          <textarea
            value={черновикТезиса}
            onChange={(e) => setЧерновикТезиса(e.target.value.slice(0, 280))}
            placeholder={tr("thesisPlaceholder")}
            rows={3}
            style={{
              width: "100%", resize: "none", padding: "10px 12px", borderRadius: 12,
              background: T.surface, border: `1px solid ${T.line}`, outline: "none",
              fontFamily: bodyFont, fontSize: 14, color: T.ice, lineHeight: 1.45,
            }}
          />
          <div className="flex items-center justify-between">
            <span style={{ fontFamily: bodyFont, color: T.faint, fontSize: 11.5 }}>{tr("thesisHint")}</span>
            <button
              onClick={() => { сохранитьТезис(черновикТезиса); setТезисОткрыт(false); }}
              className="fx-tap rounded-[12px] px-3.5 py-1.5 flex-shrink-0"
              style={{ background: T.surfaceHi, border: `1px solid ${T.lineHi}`, fontFamily: displayFont, fontSize: 13, color: T.ice }}
            >
              {tr("thesisSave")}
            </button>
          </div>
        </div>
      ) : (
        <button
          onClick={() => { setЧерновикТезиса(тезис); setТезисОткрыт(true); }}
          className="fx-tap w-full flex items-center justify-between text-left"
          style={{ gap: 10, padding: "11px 14px", borderRadius: 14, border: `1px dashed ${T.line}` }}
        >
          <span className="truncate" style={{ fontFamily: bodyFont, fontSize: 13.5, color: тезис ? T.paper : T.muted }}>
            {тезис || tr("thesisAdd")}
          </span>
          <PlusCircle size={15} color={T.faint} style={{ flexShrink: 0 }} />
        </button>
      )}

      {/* Путь до биржи и её итог: у токенов на своей кривой это главное
          число после цены, у остальных блока просто нет. */}
      {curve && curve.graduated ? (
        <div className="flex items-start gap-3" style={{ padding: 14, borderRadius: 16, background: T.surface, border: `1px solid ${hexA(рынокОткрыт ? T.up : T.warning, 0.35)}` }}>
          <ShieldCheck size={17} color={рынокОткрыт ? T.up : T.warning} style={{ flexShrink: 0, marginTop: 1 }} />
          <div>
            <div style={{ fontFamily: displayFont, color: T.ice, fontSize: 14, fontWeight: 600 }}>
              {tr(рынокОткрыт ? "gradListedTitle" : "gradClosedTitle")}
            </div>
            <p style={{ fontFamily: bodyFont, color: T.muted, fontSize: 13, lineHeight: 1.5, marginTop: 3 }}>
              {рынокОткрыт
                ? tr("gradListedBody")
                : trf("gradClosedBody", { target: fmtTon(Number(curve.graduationTon) / 1e9) })}
            </p>
          </div>
        </div>
      ) : curve ? (
        <GraduationBar
          raisedTon={Number(curve.realTon) / 1e9}
          targetTon={Number(curve.graduationTon) / 1e9}
        />
      ) : null}

      {/* Вкладки: держатели, лента, о токене. График выше — он больше не
          прячется за вкладкой, а лежит на виду. */}
      <div className="flex items-center" style={{ gap: 20, borderBottom: `1px solid ${T.line}` }}>
        {[["holders", tr("tabHolders")], ["feed", tr("tabFeed")], ["about", tr("tabAbout")]].map(([id, label]) => (
          <button key={id} onClick={() => setTab(id)} className="fx-tap" style={{
            fontFamily: displayFont, fontSize: 14, fontWeight: tab === id ? 600 : 500, padding: "0 0 10px",
            color: tab === id ? T.ice : T.faint,
            borderBottom: `2px solid ${tab === id ? T.electric : "transparent"}`,
            marginBottom: -1,
          }}>{label}</button>
        ))}
      </div>

      {tab === "holders" && (
        <div className="fx-swap flex flex-col" style={{ gap: 14 }}>
          <div className="flex items-baseline" style={{ gap: 8 }}>
            <span style={{ fontFamily: displayFont, color: T.ice, fontSize: 22, fontWeight: 600 }}>
              {holdersCount == null ? "—" : holdersCount.toLocaleString("ru-RU")}
            </span>
            <span style={{ fontFamily: bodyFont, color: T.faint, fontSize: 13 }}>{tr("statHolders")}</span>
          </div>
          {топДержателей == null ? (
            <div className="flex flex-col" style={{ gap: 10 }}>
              {[0, 1, 2].map((i) => <div key={i} className="fx-skeleton" style={{ width: "100%", height: 14, borderRadius: 4 }} />)}
            </div>
          ) : топДержателей.length === 0 ? (
            <span style={{ fontFamily: bodyFont, color: T.muted, fontSize: 13.5 }}>{tr("holdersEmpty")}</span>
          ) : (
            <div className="flex flex-col" style={{ gap: 12 }}>
              <span style={{ fontFamily: bodyFont, color: T.faint, fontSize: 12, textTransform: "uppercase", letterSpacing: "0.04em" }}>{tr("holdersTop")}</span>
              {топДержателей.map((h, i) => (
                <div key={`${h.адрес}-${i}`} className="flex items-center" style={{ gap: 10 }}>
                  <span style={{ fontFamily: monoFont, color: T.faint, fontSize: 12, width: 18, flexShrink: 0 }}>{i + 1}</span>
                  <span className="truncate" style={{ fontFamily: monoFont, color: T.paper, fontSize: 13, flex: 1 }}>{shortAddr(h.адрес)}</span>
                  {/* Доля — полоской и числом: так видно, собран ли токен
                      в одних руках, без чтения процентов подряд. */}
                  <div style={{ width: 64, height: 4, borderRadius: 2, background: T.surfaceHi, overflow: "hidden", flexShrink: 0 }}>
                    <div style={{ width: `${Math.min(100, Math.max(2, h.доля || 0))}%`, height: "100%", background: T.electric }} />
                  </div>
                  <span style={{ fontFamily: monoFont, color: T.ice, fontSize: 12.5, width: 48, textAlign: "right", flexShrink: 0 }}>
                    {(h.доля || 0).toFixed(1)}%
                  </span>
                </div>
              ))}
            </div>
          )}
        </div>
      )}

      {tab === "feed" && (
        <div className="fx-swap flex flex-col" style={{ gap: 16 }}>
          {/* Отклики на токен — компактной строкой над сделками. */}
          <div className="flex items-center gap-2">
            <button onClick={bumpFav} className="fx-tap flex items-center gap-1.5 rounded-full px-3 py-1.5" style={{ border: `1px solid ${T.line}` }}>
              <Star size={13} color={favCount ? T.electric : T.faint} fill={favCount ? T.electric : "none"} />
              <span style={{ fontFamily: monoFont, fontSize: 12.5, color: T.paper }}>{favCount}</span>
            </button>
            <button onClick={bumpHype} className="fx-tap flex items-center gap-1.5 rounded-full px-3 py-1.5" style={{ border: `1px solid ${T.line}` }}>
              <Flame size={13} color={hypeCount ? T.up : T.faint} fill={hypeCount ? T.up : "none"} />
              <span style={{ fontFamily: monoFont, fontSize: 12.5, color: T.paper }}>{hypeCount}</span>
            </button>
            <button onClick={handleRug} className="fx-tap flex items-center gap-1.5 rounded-full px-3 py-1.5" style={{ border: `1px solid ${T.line}` }}>
              <HeartCrack size={13} color={rugCount ? T.down : T.faint} />
              <span style={{ fontFamily: monoFont, fontSize: 12.5, color: T.paper }}>{rugCount}</span>
            </button>
          </div>

          {/* Сделки строками, без карточек: столбцы читаются глазом
              сверху вниз, рамка вокруг каждой сделке ничего не добавляла. */}
          {!token.poolAddress && !token.curveAddress ? (
            <span style={{ fontFamily: bodyFont, color: T.muted, fontSize: 13.5 }}>{tr("txUnavailable")}</span>
          ) : tradesLoading && !trades ? (
            <div className="flex items-center justify-center" style={{ height: 100 }}><LeafLoader size={40} /></div>
          ) : !trades ? (
            <span style={{ fontFamily: bodyFont, color: T.muted, fontSize: 13.5 }}>{tr("txLoadFailed")}</span>
          ) : trades.length === 0 ? (
            <span style={{ fontFamily: bodyFont, color: T.muted, fontSize: 13.5 }}>{tr("txEmpty")}</span>
          ) : (
            <div className="flex flex-col">
              {trades.map(tx => (
                <div key={tx.id} className="flex items-center justify-between" style={{ padding: "9px 0" }}>
                  <span style={{ fontFamily: displayFont, fontWeight: 600, fontSize: 13, color: tx.kind === "buy" ? T.up : T.down }}>
                    {tx.kind === "buy" ? tr("buy") : tr("sell")}
                  </span>
                  <span style={{ fontFamily: monoFont, fontSize: 13, color: T.ice }}>${tx.volUsd < 1000 ? tx.volUsd.toFixed(2) : fmtCompact(tx.volUsd)}</span>
                  <span style={{ fontFamily: monoFont, fontSize: 12, color: T.faint }}>{tx.at ? fmtCandleStamp(Math.floor(new Date(tx.at).getTime() / 1000)) : ""}</span>
                </div>
              ))}
            </div>
          )}

          {/* Обсуждение — там же, где сделки: лента токена целиком. */}
          {token.id && (
            <TokenComments
              tokenId={token.id}
              currentUserId={currentUserId}
              onNeedAuth={onNeedAuth}
              onOpenProfile={onOpenProfile}
              showToast={showToast}
            />
          )}
        </div>
      )}

      {tab === "about" && (
        <div className="fx-swap flex flex-col" style={{ gap: 16 }}>
          {infoLoading && !info ? (
            <div className="flex flex-col gap-2">
              <div className="fx-skeleton" style={{ width: "100%", height: 12, borderRadius: 4 }} />
              <div className="fx-skeleton" style={{ width: "80%", height: 12, borderRadius: 4 }} />
            </div>
          ) : (info?.description || info?.telegram || info?.twitter || info?.website) ? (
            <div className="flex flex-col" style={{ gap: 10 }}>
              {info.description && (
                <p style={{ fontFamily: bodyFont, color: T.paper, fontSize: 14.5, lineHeight: 1.55 }}>{info.description}</p>
              )}
              {(info.telegram || info.twitter || info.website) && (
                <div className="flex items-center gap-4">
                  {info.telegram && <button onClick={() => openSocial(info.telegram)} className="fx-tap"><Send size={16} color={T.muted} /></button>}
                  {info.twitter && <button onClick={() => openSocial(info.twitter)} className="fx-tap"><Twitter size={16} color={T.muted} /></button>}
                  {info.website && <button onClick={() => openSocial(info.website)} className="fx-tap"><Globe size={16} color={T.muted} /></button>}
                </div>
              )}
            </div>
          ) : (
            <span style={{ fontFamily: bodyFont, color: T.muted, fontSize: 13.5 }}>{tr("infoEmpty")}</span>
          )}

          {/* Кто запустил токен. Есть только у токенов из приложения —
              у внешних пулов владельца нет, блок сам себя не рисует. */}
          <TokenCreatorCard
            ownerId={token.ownerId}
            currentUserId={currentUserId}
            onNeedAuth={onNeedAuth}
            showToast={showToast}
            onOpenProfile={onOpenProfile}
          />

          {token.curveAddress && (
            <TrustPanel token={token} testnet={TON_TESTNET_NETWORK} holders={holdersCount} />
          )}
        </div>
      )}

      </div>
    </div>
  );
}

/* Mock account context the trade sheet needs — a real app would read
   this from the connected wallet / portfolio instead of hardcoding it. */
// Курс TON. Только настоящий, с биржи: запасное «примерно столько»
// здесь стоять не может — по нему считаются цена, капитализация и ось
// графика, и разойтись они могут в разы (зашито было 7.1 при реальных
// 1.3, то есть впятеро). Пока курс не приехал, функция возвращает ноль,
// и всё, что от него зависит, честно ждёт, а не рисует выдуманное.
// Хранится вне React намеренно: курс читают и функции вне компонентов
// (график, пересчёт ленты), которым пропсы недоступны.
let tonUsdLive = 0;
function tonUsd() {
  return tonUsdLive > 0 ? tonUsdLive : 0;
}

/* Курс SOL. Нужен там же, где и курс TON: суммы сделок источник отдаёт в
   долларах, а показывать их надо в монете той сети, где сделка прошла.
   Спрашиваем не чаще раза в пять минут — на цифрах ленты точность до
   секунды ничего не меняет. */
let solUsdLive = 0;
let solUsdAt = 0;
function solUsd() {
  if (typeof window !== "undefined" && Date.now() - solUsdAt > 5 * 60 * 1000) {
    solUsdAt = Date.now();
    fetch(`${GT_BASE}/networks/${GT_NETWORK_SOL}/tokens/So11111111111111111111111111111111111111112`)
      .then((r) => r.json())
      .then((j) => {
        const цена = parseFloat(j?.data?.attributes?.price_usd) || 0;
        if (цена > 0) solUsdLive = цена;
      })
      .catch(() => {});
  }
  return solUsdLive > 0 ? solUsdLive : 0;
}
// Минимальная стартовая покупка. В тестнете её нет: там TON ничего не
// стоят, порог в долларах не имеет смысла и только мешает проверять.
const MIN_LAUNCH_USD = 5;
const MIN_LAUNCH_ENFORCED = !TON_TESTNET_NETWORK;
const NETWORK_FEE_TON = 0.05;
const SLIPPAGE_OPTIONS = [0.5, 1, 3];

function parseAmount(str) {
  const n = parseFloat(str.replace(",", "."));
  return Number.isFinite(n) && n > 0 ? n : 0;
}

/* Карточка токена картинкой.
 *
 * Ссылку из приложения и раньше можно было отправить, но в чате она
 * выглядит серой строкой: превью Telegram не покажет ни цифр, ни лого —
 * мини-приложение он не разворачивает. Картинка показывает сразу всё:
 * тикер, капитализацию, движение цены и сколько собрано до биржи.
 *
 * Рисуем сами на canvas, а не картинкой с сервера: цифры уже на экране,
 * гонять их через свою функцию ради превью незачем, да и работает это
 * без сети. Размер 1080×1350 — Telegram сжимает вложение по длинной
 * стороне, и с меньшего холста тикер в ленте становится мылом.
 *
 * Ссылка внизу — реферальная: карточку переслали, кто-то открыл, и
 * приглашение засчиталось тому, кто отправил. */
const SHARE_W = 1080;
const SHARE_H = 1350;

function shareRect(ctx, x, y, w, h, r) {
  ctx.beginPath();
  ctx.moveTo(x + r, y);
  ctx.arcTo(x + w, y, x + w, y + h, r);
  ctx.arcTo(x + w, y + h, x, y + h, r);
  ctx.arcTo(x, y + h, x, y, r);
  ctx.arcTo(x, y, x + w, y, r);
  ctx.closePath();
}

function shareLoadImage(src) {
  return new Promise((resolve) => {
    if (!src) { resolve(null); return; }
    const img = new Image();
    // Без этого холст «пачкается» чужой картинкой и toBlob отбивается
    // с ошибкой безопасности. Не отдал заголовки — рисуем эмодзи.
    img.crossOrigin = "anonymous";
    img.onload = () => resolve(img);
    img.onerror = () => resolve(null);
    img.src = src;
  });
}

async function drawTokenShareCard(canvas, { token, curve, link, holders }) {
  const ctx = canvas.getContext("2d");
  if (!ctx) return;
  canvas.width = SHARE_W;
  canvas.height = SHARE_H;

  // Шрифт приложения приезжает из сети. Пока он не готов, canvas молча
  // рисует системным — карточка выходила чужой на вид.
  try {
    if (document.fonts && document.fonts.load) {
      await Promise.all([
        document.fonts.load("700 92px 'Jost'"),
        document.fonts.load("400 36px 'Jost'"),
      ]);
    }
  } catch (e) { /* нет так нет */ }

  const logo = await shareLoadImage(token.logoUrl);

  const M = 88;                    // поля
  const ink = "#FFFFFF";
  const muted = "#7C828B";
  const accent = "#FF6B35";

  ctx.fillStyle = "#07080A";
  ctx.fillRect(0, 0, SHARE_W, SHARE_H);
  // Два пятна света: тёплое сверху и мятное снизу — те же два цвета, на
  // которых стоит весь интерфейс.
  let g = ctx.createRadialGradient(SHARE_W * 0.88, 90, 0, SHARE_W * 0.88, 90, 820);
  g.addColorStop(0, "rgba(255,107,53,0.30)");
  g.addColorStop(1, "rgba(255,107,53,0)");
  ctx.fillStyle = g;
  ctx.fillRect(0, 0, SHARE_W, SHARE_H);
  g = ctx.createRadialGradient(60, SHARE_H - 120, 0, 60, SHARE_H - 120, 760);
  g.addColorStop(0, "rgba(127,231,196,0.14)");
  g.addColorStop(1, "rgba(127,231,196,0)");
  ctx.fillStyle = g;
  ctx.fillRect(0, 0, SHARE_W, SHARE_H);

  ctx.strokeStyle = "rgba(255,255,255,0.10)";
  ctx.lineWidth = 2;
  shareRect(ctx, 26, 26, SHARE_W - 52, SHARE_H - 52, 58);
  ctx.stroke();

  ctx.textBaseline = "alphabetic";
  ctx.textAlign = "left";

  // Шапка
  ctx.fillStyle = ink;
  ctx.font = "700 46px 'Jost', sans-serif";
  ctx.fillText("MINTLY", M, 148);
  ctx.fillStyle = muted;
  ctx.font = "400 30px 'Jost', sans-serif";
  ctx.textAlign = "right";
  ctx.fillText("TON", SHARE_W - M, 146);
  ctx.textAlign = "left";

  // Аватар токена
  const A = 220;
  const ax = M;
  const ay = 246;
  ctx.save();
  shareRect(ctx, ax, ay, A, A, 64);
  ctx.clip();
  ctx.fillStyle = "rgba(255,255,255,0.05)";
  ctx.fillRect(ax, ay, A, A);
  if (logo) {
    // Логотипы приходят любой формы: вписываем по короткой стороне,
    // иначе квадратная рамка режет широкую картинку по краям.
    const k = Math.max(A / logo.width, A / logo.height);
    const w = logo.width * k;
    const h = logo.height * k;
    ctx.drawImage(logo, ax + (A - w) / 2, ay + (A - h) / 2, w, h);
  } else {
    ctx.font = "120px 'Apple Color Emoji', 'Noto Color Emoji', 'Segoe UI Emoji', sans-serif";
    ctx.textAlign = "center";
    ctx.fillStyle = ink;
    ctx.fillText(token.emoji || "🪙", ax + A / 2, ay + A / 2 + 44);
    ctx.textAlign = "left";
  }
  ctx.restore();
  ctx.strokeStyle = "rgba(255,107,53,0.55)";
  ctx.lineWidth = 3;
  shareRect(ctx, ax, ay, A, A, 64);
  ctx.stroke();

  // Тикер и название
  const tx = ax + A + 44;
  ctx.fillStyle = ink;
  ctx.font = "700 88px 'Jost', sans-serif";
  ctx.fillText(`$${String(token.ticker || "").toUpperCase()}`, tx, ay + 112);
  ctx.fillStyle = muted;
  ctx.font = "400 40px 'Jost', sans-serif";
  const name = String(token.name || "");
  ctx.fillText(name.length > 18 ? name.slice(0, 17) + "…" : name, tx, ay + 176);

  // Капитализация и движение
  ctx.fillStyle = muted;
  ctx.font = "400 32px 'Jost', sans-serif";
  ctx.fillText(t("shareCardMcap"), M, 626);
  ctx.fillStyle = ink;
  ctx.font = "700 112px 'Jost', sans-serif";
  const mcap = fmtUSD(token.mcapNum);
  ctx.fillText(mcap, M, 728);

  const change = Number(token.change);
  if (Number.isFinite(change)) {
    const up = change >= 0;
    const label = `${up ? "+" : ""}${change.toFixed(2)}%`;
    // Ширина числа меряется его же шрифтом: капитализация бывает и
    // «$980», и «$12.40M», и плашка должна встать вплотную к любой.
    ctx.font = "700 112px 'Jost', sans-serif";
    const mw = ctx.measureText(mcap).width;
    ctx.font = "700 38px 'Jost', sans-serif";
    const bw = ctx.measureText(label).width + 48;
    ctx.fillStyle = up ? "rgba(56,211,159,0.16)" : "rgba(255,77,90,0.16)";
    shareRect(ctx, M + mw + 28, 668, bw, 62, 31);
    ctx.fill();
    ctx.fillStyle = up ? "#38D39F" : "#FF4D5A";
    ctx.fillText(label, M + mw + 52, 710);
  }

  ctx.fillStyle = muted;
  ctx.font = "400 34px 'Jost', sans-serif";
  ctx.fillText(`${fmtPrice(token.price)} ${t("perToken")}`, M, 794);

  // Путь до биржи. Кривая может быть ещё не прочитана — тогда полосы
  // просто нет, выдумывать проценты нельзя.
  const barY = 890;
  const barDrawn = !!(curve && curve.graduationTon);
  if (barDrawn) {
    const raised = Number(curve.realTon) / 1e9;
    const target = Number(curve.graduationTon) / 1e9;
    const done = curve.graduated || raised >= target;
    const pct = done ? 1 : Math.max(0, Math.min(1, raised / target));
    ctx.fillStyle = muted;
    ctx.font = "400 32px 'Jost', sans-serif";
    ctx.fillText(done ? t("shareCardOnDex") : t("shareCardToDex"), M, barY - 24);
    ctx.textAlign = "right";
    ctx.fillStyle = done ? "#38D39F" : ink;
    ctx.font = "700 34px 'Jost', sans-serif";
    ctx.fillText(done ? `${fmtTon(raised)} TON` : `${fmtTon(raised)} / ${fmtTon(target)} TON`, SHARE_W - M, barY - 24);
    ctx.textAlign = "left";

    const bw = SHARE_W - M * 2;
    ctx.fillStyle = "rgba(255,255,255,0.07)";
    shareRect(ctx, M, barY, bw, 26, 13);
    ctx.fill();
    const fill = Math.max(26, bw * pct);
    const fg = ctx.createLinearGradient(M, 0, M + fill, 0);
    if (done) { fg.addColorStop(0, "#38D39F"); fg.addColorStop(1, "#7FE7C4"); }
    else { fg.addColorStop(0, "#FF6B35"); fg.addColorStop(1, "#FFA46B"); }
    ctx.fillStyle = fg;
    shareRect(ctx, M, barY, fill, 26, 13);
    ctx.fill();
  }

  // Три числа в ряд. Стоят они здесь не для красоты: без них у токена
  // без кривой середина карточки оставалась пустой, а сами цифры —
  // первое, что смотрят перед покупкой.
  const cells = [
    [t("statHolders"), holders == null ? "—" : String(holders)],
    [t("statVolume24h"), token.vol ? `$${token.vol}` : "—"],
    [t("tokenAgeLabel"), fmtAge(token.createdAt) || "—"],
  ];
  const gap = 18;
  const cw = (SHARE_W - M * 2 - gap * 2) / 3;
  // Без полосы до биржи ряд поднимается: иначе под ценой зияет дыра.
  const cy = barDrawn ? 950 : 890;
  cells.forEach(([label, value], i) => {
    const cx = M + (cw + gap) * i;
    ctx.fillStyle = "rgba(255,255,255,0.05)";
    shareRect(ctx, cx, cy, cw, 112, 34);
    ctx.fill();
    ctx.textAlign = "center";
    ctx.fillStyle = muted;
    ctx.font = "400 27px 'Jost', sans-serif";
    ctx.fillText(label, cx + cw / 2, cy + 44);
    ctx.fillStyle = ink;
    ctx.font = "700 40px 'Jost', sans-serif";
    ctx.fillText(value, cx + cw / 2, cy + 90);
    ctx.textAlign = "left";
  });

  // Подвал: ссылка приглашения крупно, под ней зачем её открывать.
  const fy = SHARE_H - 248;
  ctx.fillStyle = "rgba(255,255,255,0.05)";
  shareRect(ctx, M, fy, SHARE_W - M * 2, 108, 40);
  ctx.fill();
  ctx.strokeStyle = "rgba(255,107,53,0.35)";
  ctx.lineWidth = 2;
  shareRect(ctx, M, fy, SHARE_W - M * 2, 108, 40);
  ctx.stroke();
  ctx.fillStyle = accent;
  ctx.font = "700 34px 'Jost', sans-serif";
  ctx.textAlign = "center";
  const short = String(link).replace(/^https?:\/\//, "");
  ctx.fillText(short.length > 42 ? short.slice(0, 41) + "…" : short, SHARE_W / 2, fy + 68);
  ctx.fillStyle = muted;
  ctx.font = "400 32px 'Jost', sans-serif";
  ctx.fillText(t("shareCardFooter"), SHARE_W / 2, fy + 172);
  ctx.textAlign = "left";
}

/* Шторка с готовой карточкой: сверху то, что уйдёт в чат, снизу три
   действия. Отправка идёт системным окном «поделиться» — оно кладёт
   картинку прямо в чат Telegram; там, где такого окна нет, файл просто
   сохраняется, и переслать его человек может сам. */
function TokenShareSheet({ token: tokenProp, curve, holders, userId, onClose, showToast }) {
  // Пока шторка уезжает, токена в пропсах уже нет — держим последний,
  // иначе на кадрах закрытия рисовать нечего и всё падает.
  const [token, closing] = useClosing(tokenProp);
  const canvasRef = useRef(null);
  const blobRef = useRef(null);
  const [ready, setReady] = useState(false);
  const link = referralLink(userId) || `https://t.me/${TG_BOT}`;
  // Состояние кривой страница перечитывает по таймеру и каждый раз даёт
  // новый объект. Пересобирать картинку из-за этого незачем — следим за
  // самими числами.
  const curveRef = useRef(curve);
  curveRef.current = curve;
  const raisedKey = curve ? `${curve.realTon}/${curve.graduationTon}/${curve.graduated}` : "";

  useEffect(() => {
    if (!token) return;
    let cancelled = false;
    setReady(false);
    (async () => {
      const canvas = canvasRef.current;
      if (!canvas) return;
      try {
        await drawTokenShareCard(canvas, { token, curve: curveRef.current, link, holders });
        if (cancelled) return;
        await new Promise((resolve) => canvas.toBlob((b) => { blobRef.current = b; resolve(); }, "image/png"));
        if (!cancelled) setReady(!!blobRef.current);
      } catch (e) {
        if (!cancelled) showToast(t("shareCardFail"));
      }
    })();
    return () => { cancelled = true; };
  }, [token, raisedKey, holders, link, showToast]);

  if (!token) return null;

  const file = () => {
    const b = blobRef.current;
    if (!b) return null;
    try { return new File([b], `mintly-${token.ticker || "token"}.png`, { type: "image/png" }); }
    catch (e) { return null; }
  };

  function saveFile() {
    const b = blobRef.current;
    if (!b) { showToast(t("shareCardFail")); return; }
    const url = URL.createObjectURL(b);
    const a = document.createElement("a");
    a.href = url;
    a.download = `mintly-${token.ticker || "token"}.png`;
    document.body.appendChild(a);
    a.click();
    a.remove();
    setTimeout(() => URL.revokeObjectURL(url), 5000);
    showToast(t("shareCardSaved"));
  }

  async function send() {
    haptic("light");
    const f = file();
    if (f && navigator.canShare && navigator.canShare({ files: [f] })) {
      try {
        await navigator.share({ files: [f], text: link });
        return;
      } catch (e) {
        // Человек закрыл окно сам — это не ошибка и «сохранили» тут врать
        // не надо.
        if (e && e.name === "AbortError") return;
      }
    }
    saveFile();
  }

  function copyLink() {
    if (navigator.clipboard) navigator.clipboard.writeText(link).catch(() => {});
    showToast(t("linkCopied"));
  }

  // Шторку открывает страница токена, а у неё своя система координат:
  // без портала подложка легла бы внутрь прокручиваемой страницы и
  // поехала бы вместе с ней.
  const sheet = (
    <div className={`fx-modal-back${closing ? " fx-out" : ""}`} style={{ ...SHEET_BACK, position: "fixed", zIndex: 300 }} onClick={onClose}>
      <div className="fx-modal-card" onClick={(e) => e.stopPropagation()} style={sheetCard(18, { paddingBottom: 22 })}>
        <div className="flex items-center justify-between" style={{ marginBottom: 10 }}>
          <span style={{ fontFamily: displayFont, color: T.ice, fontSize: 16, fontWeight: 700 }}>{t("shareCardTitle")}</span>
          <button onClick={onClose} className="fx-tap fx-close"><X size={16} color={T.muted} /></button>
        </div>
        <canvas
          ref={canvasRef}
          style={{ display: "block", width: "100%", borderRadius: 20, background: T.surfaceHi, aspectRatio: "1080 / 1350", opacity: ready ? 1 : 0.4, transition: "opacity 220ms ease" }}
        />
        <p style={{ fontFamily: bodyFont, color: T.muted, fontSize: 12.5, lineHeight: 1.45, margin: "10px 2px 0" }}>
          {t("shareCardNote")}
        </p>
        <button
          onClick={send}
          disabled={!ready}
          className="fx-tap w-full flex items-center justify-center gap-2 rounded-[18px] py-3 mt-3"
          style={{ background: T.electric, color: "#0D1117", fontFamily: displayFont, fontWeight: 700, fontSize: 14.5, opacity: ready ? 1 : 0.5 }}
        >
          <Send size={15} /> {t("shareCardSend")}
        </button>
        <div className="flex gap-2 mt-2">
          <button
            onClick={saveFile}
            disabled={!ready}
            className="fx-tap flex-1 flex items-center justify-center gap-1.5 rounded-[18px] py-2.5"
            style={{ background: T.surfaceHi, border: `1px solid ${T.line}`, color: T.ice, fontFamily: displayFont, fontWeight: 700, fontSize: 13, opacity: ready ? 1 : 0.5 }}
          >
            <ImageIcon size={14} color={T.muted} /> {t("shareCardSave")}
          </button>
          <button
            onClick={copyLink}
            className="fx-tap flex-1 flex items-center justify-center gap-1.5 rounded-[18px] py-2.5"
            style={{ background: T.surfaceHi, border: `1px solid ${T.line}`, color: T.ice, fontFamily: displayFont, fontWeight: 700, fontSize: 13 }}
          >
            <Copy size={14} color={T.muted} /> {t("shareCardCopy")}
          </button>
        </div>
      </div>
    </div>
  );

  return typeof document !== "undefined" ? createPortal(sheet, document.body) : sheet;
}

/* TradeModal — the buy/sell sheet: pick an amount (with quick %/preset
   chips), see the live conversion, pick slippage tolerance, and confirm.
   Shared between the Buy and Sell CTAs so switching tabs mid-flow works. */
function TradeModal({ t: token, tradeModal: tradeModalProp, onClose, onConfirm, walletTonBalance = 0, tonPriceUsd = 0, heldAmount = null, curveState = null }) {
  // Курс SOL нужен только окну сделки по токену Solana — там он один раз
  // пересчитывает введённую сумму в примерное количество токенов.
  const [solPriceUsd, setSolPriceUsd] = useState(0);
  // Сколько на кошельке Solana: монет — чтобы знать предел покупки,
  // токенов — чтобы было что продавать. Оба числа живут в сети, и без
  // них поле «Доступно» показывало прочерк.
  const [solБаланс, setSolБаланс] = useState(null);
  // Первым делом: остальные хуки читают tradeModal, и объявить его ниже
  // значит обратиться к нему до создания.
  const [tradeModal, closing] = useClosing(tradeModalProp);
  const [mode, setMode] = useState(tradeModal ? tradeModal.mode : "buy");
  // Сумму можно подставить снаружи — так после запуска токена открывается
  // готовая покупка ровно на то, что человек ввёл в форме создания.
  const [amountStr, setAmountStr] = useState(tradeModal?.prefill ? String(tradeModal.prefill) : "");
  const [slippage, setSlippage] = useState(1);

  useEffect(() => {
    if (!tradeModal || !token || token.chain !== "solana") { setSolБаланс(null); return; }
    let cancelled = false;
    (async () => {
      const { сохранённаяСессия } = await import("./phantom");
      const сессия = сохранённаяСессия();
      if (!сессия || cancelled) return;
      const параметры = new URLSearchParams({ wallet: сессия.wallet });
      if (token.tokenAddress) параметры.set("mint", token.tokenAddress);
      const b = await fetch(апи(`/api/solana?action=balances&${параметры}`)).then((r) => r.json()).catch(() => null);
      if (!cancelled && b && !b.error) setSolБаланс({ sol: Number(b.sol) || 0, token: Number(b.token) || 0 });
    })();
    return () => { cancelled = true; };
  }, [tradeModal, token && token.chain, token && token.tokenAddress]);

  useEffect(() => {
    if (!tradeModal || !token || token.chain !== "solana" || solPriceUsd > 0) return;
    let cancelled = false;
    fetch(`${GT_BASE}/networks/${GT_NETWORK_SOL}/tokens/So11111111111111111111111111111111111111112`)
      .then((r) => r.json())
      .then((j) => {
        const цена = parseFloat(j?.data?.attributes?.price_usd) || 0;
        if (!cancelled && цена > 0) setSolPriceUsd(цена);
      })
      .catch(() => {});
    return () => { cancelled = true; };
  }, [tradeModal, token && token.chain, solPriceUsd]);

  useEffect(() => {
    if (tradeModal) {
      setMode(tradeModal.mode);
      setAmountStr(tradeModal.prefill ? String(tradeModal.prefill) : "");
      setSlippage(1);
    }
  }, [tradeModal]);

  if (!tradeModal) return null;

  // null означает «баланс ещё не пришёл из сети». Подставлять сюда
  // локальный счётчик нельзя: он копит оценки по каждой сделке и
  // расходится с настоящим балансом — из-за этого в окне продажи
  // показывалось вдвое больше, чем есть, и продажа уходила в никуда.
  const balanceKnown = heldAmount != null;
  const holdingTokens = balanceKnown ? heldAmount : 0;
  // Leave one network fee's worth of TON unspent so the buy transaction
  // itself doesn't fail for insufficient gas, and don't let anyone "buy"
  // before the real wallet balance/price have actually loaded.
  const spendableTon = Math.max(0, walletTonBalance - NETWORK_FEE_TON);
  const amount = parseAmount(amountStr);
  const isBuy = mode === "buy";
  // Чем платят за этот токен. У ленты Solana это SOL, у всего
  // остального — TON: подписать поле «TON» там, где спишется SOL, значит
  // прямо ввести человека в заблуждение. Объявлено до первого
  // использования — ниже на него смотрят и предел суммы, и подписи.
  const соло = token.chain === "solana";
  const монета = соло ? "SOL" : "TON";

  // Покупка теперь считается в TON, а не в долларах: пользователь вводит
  // сумму в TON, и она напрямую ограничена доступным балансом кошелька.
  // У Solana предел свой: монеты на её кошельке, а при продаже — сколько
  // токена там лежит. Немного оставляем на комиссию сети, иначе сделка
  // не пройдёт из-за нехватки на газ.
  const solДоступно = solБаланс ? Math.max(0, solБаланс.sol - 0.005) : null;
  const maxAmount = соло
    ? (isBuy ? (solДоступно == null ? Infinity : solДоступно) : (solБаланс ? solБаланс.token : holdingTokens))
    : (isBuy ? spendableTon : holdingTokens);
  const overMax = amount > maxAmount;
  // Курс токена (token.price) хранится в USD, поэтому для оценки
  // количества токенов TON всё ещё конвертируется через tonPriceUsd —
  // но это только для отображения "вы получите", сама сделка идёт в TON.
  // У токенов на кривой цена в ленте ещё нулевая, а делить на ноль
  // нельзя: раньше отсюда приходила Infinity, она уезжала в локальный
  // счётчик, и в окне продажи значилось «Доступно: ∞».
  const priceUsd = token.price > 0 ? token.price : 0;
  // У токенов на кривой сумма считается её же формулой — той самой, что
  // применит контракт. По цене из ленты считать нельзя: она обновляется
  // редко, а для свежего токена её просто нет.
  let estimate;
  if (curveState) {
    // Комиссию берём из самой кривой: у токенов, запущенных до её
    // введения, она нулевая и такой останется навсегда.
    const feeBps = curveParamsOf(curveState).feeBps;
    if (isBuy) {
      const tonIn = toNano(amount.toFixed(9));
      const netTon = tonIn - tonIn * feeBps / 10000n;
      estimate = Number(tokensOutFor(curveState, netTon) / 1000000000n);
    } else {
      const gross = tonOutFor(curveState, toNano(amount.toFixed(9)));
      const net = gross - gross * feeBps / 10000n;
      estimate = (Number(net) / 1e9) * tonPriceUsd;
    }
  } else if (соло) {
    // Точный маршрут посчитает Jupiter при подтверждении; здесь — грубая
    // прикидка по цене из ленты, чтобы поле не было пустым.
    const solUsd = solPriceUsd > 0 ? solPriceUsd : 0;
    estimate = isBuy
      ? (priceUsd > 0 && solUsd > 0 ? (amount * solUsd) / priceUsd : 0)
      : amount * priceUsd;
  } else {
    estimate = isBuy
      ? (priceUsd > 0 ? (amount * tonPriceUsd) / priceUsd : 0)
      : amount * priceUsd;
  }
  const feeUsd = NETWORK_FEE_TON * tonPriceUsd;
  // В Solana точную сумму покажет сам кошелёк, поэтому курс TON здесь
  // ни при чём и ждать его незачем.
  const canConfirm = amount > 0 && !overMax && (соло || (isBuy ? tonPriceUsd > 0 : balanceKnown));

  function setPct(pct) {
    if (!Number.isFinite(maxAmount)) return;
    const v = maxAmount * pct;
    setAmountStr(isBuy ? v.toFixed(v < 10 ? 4 : 2) : v.toFixed(v < 10 ? 4 : 0));
  }

  function handleConfirm() {
    if (!canConfirm) return;
    const payAmount = isBuy ? `${amount.toLocaleString("ru-RU", { maximumFractionDigits: 4 })} ${монета}` : `${amount.toLocaleString("ru-RU")}`;
    const receiveAmount = isBuy ? estimate.toLocaleString("ru-RU", { maximumFractionDigits: 0 }) : `$${estimate.toFixed(2)}`;
    const unit = isBuy ? "" : "";
    onConfirm(mode, payAmount, receiveAmount, unit, amount, estimate);
  }

  return (
    <div className={`fx-modal-back${closing ? " fx-out" : ""}`} style={{ ...SHEET_BACK, zIndex: 60 }} onClick={onClose}>
      <div className="fx-modal-card" onClick={(e) => e.stopPropagation()} style={sheetCard(20)}>
        <div className="flex items-center justify-between" style={{ marginBottom: 14 }}>
          <div className="flex items-center gap-2">
            <TokenAvatar size={34} src={token.logoUrl} />
            <div>
              <div style={{ fontFamily: displayFont, color: T.ice, fontSize: 15, fontWeight: 700 }}>{token.name}</div>
              <div style={{ fontFamily: monoFont, color: T.muted, fontSize: 11.5 }}>${token.ticker} · {fmtPrice(token.price)}</div>
            </div>
          </div>
          <button onClick={onClose} className="fx-tap fx-close"><X size={16} color={T.muted} /></button>
        </div>

        <div className="flex rounded-[20px] p-1" style={{ background: T.bg, border: `1px solid ${T.line}` }}>
          {[{ id: "buy", label: t("buy") }, { id: "sell", label: t("sell") }].map(o => {
            const active = mode === o.id;
            return (
              <button key={o.id} onClick={() => { setMode(o.id); setAmountStr(""); }} className="fx-tap flex-1 rounded-[16px] py-2"
                style={{
                  fontFamily: displayFont, fontWeight: 700, fontSize: 14.5,
                  background: active ? (o.id === "buy" ? T.turquoise : T.rose) : "transparent",
                  color: active ? PRISM_TEXT : T.muted,
                }}>
                {o.label}
              </button>
            );
          })}
        </div>

        <div className="flex items-center justify-between" style={{ marginTop: 16 }}>
          <span style={{ fontFamily: bodyFont, color: T.muted, fontSize: 13 }}>{isBuy ? t("youPay") : t("youSell")}</span>
          <span style={{ fontFamily: bodyFont, color: T.muted, fontSize: 12 }}>
            {t("available")}: {соло
              // Пока кошелёк Solana не подключён, спрашивать баланс не у
              // кого — тогда и предела нет.
              ? (solБаланс == null
                ? t("solWalletConnectFirst")
                : isBuy
                  ? `${(solДоступно || 0).toLocaleString("ru-RU", { maximumFractionDigits: 4 })} SOL`
                  : `${solБаланс.token.toLocaleString("ru-RU", { maximumFractionDigits: 4 })} ${token.ticker}`)
              : isBuy
                ? `${spendableTon.toLocaleString("ru-RU", { maximumFractionDigits: 4 })} TON`
                : balanceKnown ? `${holdingTokens.toLocaleString("ru-RU")} ${token.ticker}` : "…"}
          </span>
        </div>
        <div className="flex items-center gap-2 rounded-[20px] px-3.5 py-3 mt-1.5" style={{ background: T.bg, border: `1px solid ${overMax ? T.rose : T.line}` }}>
          <input
            value={amountStr}
            onChange={(e) => setAmountStr(e.target.value.replace(/[^0-9.,]/g, ""))}
            placeholder="0.00"
            inputMode="decimal"
            style={{ fontFamily: displayFont, fontWeight: 700, color: T.ice, fontSize: 21.5, background: "transparent", border: "none", outline: "none", flex: 1, minWidth: 0 }}
          />
          <span style={{ fontFamily: monoFont, color: T.muted, fontSize: 14.5 }}>{isBuy ? монета : `$${token.ticker}`}</span>
        </div>
        {overMax && <div style={{ fontFamily: bodyFont, color: T.rose, fontSize: 12, marginTop: 4 }}>{t("insufficientFunds")}</div>}

        <div className="grid grid-cols-4 gap-1.5" style={{ marginTop: 8 }}>
          {[0.25, 0.5, 0.75, 1].map(pct => (
            <button key={pct} onClick={() => setPct(pct)} className="fx-tap rounded-[16px] py-1.5" style={{ background: T.surfaceHi, border: `1px solid ${T.line}`, fontFamily: monoFont, fontSize: 12.5, color: T.ice }}>
              {pct === 1 ? t("maxLabel") : `${pct * 100}%`}
            </button>
          ))}
        </div>

        <div className="rounded-[20px] p-3.5 mt-3.5" style={{ background: T.bg, border: `1px solid ${T.line}` }}>
          <div className="flex items-center justify-between">
            <span style={{ fontFamily: bodyFont, color: T.muted, fontSize: 13 }}>{t("youReceive")}</span>
            <span style={{ fontFamily: displayFont, color: T.ice, fontSize: 15, fontWeight: 700 }}>
              {amount > 0 ? (isBuy ? `≈ ${estimate.toLocaleString("ru-RU", { maximumFractionDigits: 0 })} ${token.ticker}` : `≈ $${estimate.toFixed(2)}`) : "—"}
            </span>
          </div>
        </div>

        <div style={{ marginTop: 14 }}>
          <span style={{ fontFamily: bodyFont, color: T.muted, fontSize: 13 }}>{t("slippage")}</span>
          <div className="flex gap-1.5 mt-1.5">
            {SLIPPAGE_OPTIONS.map(s => (
              <button key={s} onClick={() => setSlippage(s)} className="fx-tap rounded-[16px] px-3 py-1.5" style={{ background: slippage === s ? T.ice : T.surfaceHi, color: slippage === s ? T.bg : T.muted, border: `1px solid ${slippage === s ? T.ice : T.line}`, fontFamily: monoFont, fontSize: 12.5 }}>
                {s}%
              </button>
            ))}
          </div>
        </div>

        <div className="flex flex-col gap-1.5" style={{ marginTop: 14, fontFamily: monoFont, fontSize: 12, color: T.muted }}>
          <div className="flex justify-between"><span>{t("rate")}</span><span style={{ color: T.ice }}>{fmtPrice(token.price)} / ${token.ticker}</span></div>
          {/* Комиссию платят монетой той сети, где идёт сделка. В Solana
              к ней добавляется разовая аренда счёта под новый токен —
              её берут один раз и возвращают, когда счёт закрывают. */}
          <div className="flex justify-between"><span>{t("networkFee")}</span><span style={{ color: T.ice }}>
            {соло
              ? `≈0.003 SOL${solPriceUsd > 0 ? ` ($${(0.003 * solPriceUsd).toFixed(2)})` : ""}`
              : `${NETWORK_FEE_TON} TON ($${feeUsd.toFixed(2)})`}
          </span></div>
          <div className="flex justify-between"><span>{t("minReceive")}</span><span style={{ color: T.ice }}>{amount > 0 ? (isBuy ? `${(estimate * (1 - slippage / 100)).toLocaleString("ru-RU", { maximumFractionDigits: 0 })} ${token.ticker}` : `$${(estimate * (1 - slippage / 100)).toFixed(2)}`) : "—"}</span></div>
        </div>

        <button onClick={handleConfirm} disabled={!canConfirm} className="fx-tap w-full rounded-[20px] py-3 mt-5" style={{
          fontFamily: displayFont, fontWeight: 700, fontSize: 15,
          background: canConfirm ? (isBuy ? T.turquoise : T.rose) : T.surfaceHi,
          color: canConfirm ? PRISM_TEXT : T.muted,
          opacity: canConfirm ? 1 : 0.6,
          boxShadow: canConfirm ? `0 0 20px ${isBuy ? glow(0.3) : hexA(T.rose, 0.25)}` : "none",
        }}>
          {amount > 0 ? (isBuy ? `${t("buyFor")} ${amount.toLocaleString("ru-RU", { maximumFractionDigits: 4 })} ${монета}` : `${t("sellFor")} ${amount.toLocaleString("ru-RU")} ${token.ticker}`) : (isBuy && tonPriceUsd <= 0 ? t("rateLoading") : !isBuy && holdingTokens <= 0 ? t("nothingToSell") : t("enterAmount"))}
        </button>
      </div>
    </div>
  );
}

/* ---------------------------------------------------------
   CREATE TOKEN VIEW
--------------------------------------------------------- */

function Field({ label, placeholder, area, value, onChange, type = "text", icon: Icon, autoComplete, error = false }) {
  const Comp = area ? "textarea" : "input";
  const [focus, setFocus] = useState(false);
  const [reveal, setReveal] = useState(false);
  const isPassword = type === "password";
  const realType = isPassword ? (reveal ? "text" : "password") : type;
  return (
    <label className="flex flex-col gap-1.5">
      <span style={{ fontFamily: bodyFont, color: T.muted, fontSize: 13 }}>{label}</span>
      <div style={{ position: "relative", display: "flex", alignItems: "center" }}>
        {Icon && (
          <Icon size={14} color={T.muted} style={{ position: "absolute", left: 11, pointerEvents: "none" }} />
        )}
        <Comp
          placeholder={placeholder}
          rows={area ? 3 : undefined}
          value={value}
          onChange={onChange}
          onFocus={() => setFocus(true)}
          onBlur={() => setFocus(false)}
          type={!area ? realType : undefined}
          autoComplete={autoComplete}
          className="rounded-[20px] py-2.5 w-full"
          style={{
            fontFamily: bodyFont, fontSize: 17.5, color: T.ice, background: T.surface,
            border: `1px solid ${error ? T.down : focus ? T.electric : T.line}`, outline: "none",
            resize: area ? "none" : undefined,
            paddingLeft: Icon ? 32 : 12, paddingRight: isPassword ? 34 : 12,
            boxShadow: focus ? `0 0 0 3px ${glow(0.14)}` : "none",
            transition: `border-color ${EASE}, box-shadow ${EASE}`,
          }}
        />
        {isPassword && (
          <button
            type="button"
            onClick={() => setReveal((r) => !r)}
            className="fx-tap"
            style={{ position: "absolute", right: 10, background: "transparent", border: "none", padding: 2, display: "flex" }}
          >
            {reveal ? <EyeOff size={15} color={T.muted} /> : <Eye size={15} color={T.muted} />}
          </button>
        )}
      </div>
    </label>
  );
}

/* ---------------------------------------------------------
   IMAGE CROP MODAL — used for both the token logo and the profile
   avatar (both end up displayed as circles via TokenAvatar / the
   profile picture), so this always crops to a square/circle at a
   fixed output resolution. Pure canvas + pointer events, no external
   cropper library: drag to pan, the range slider to zoom, "cover"-fit
   on load so there's never empty space around the crop circle.
--------------------------------------------------------- */
const CROP_BOX = 280;      // on-screen viewport size (css px)
const CROP_OUTPUT = 512;   // exported image size (px)

function ImageCropModal({ file, shape = "circle", onCancel, onConfirm }) {
  const [imgEl, setImgEl] = useState(null);
  const [natural, setNatural] = useState({ w: 0, h: 0 });
  const [baseScale, setBaseScale] = useState(1);
  const [zoom, setZoom] = useState(1);
  const [pos, setPos] = useState({ x: 0, y: 0 });
  const dragRef = useRef(null);
  const objectUrlRef = useRef(null);

  useEffect(() => {
    if (!file) { setImgEl(null); return; }
    if (objectUrlRef.current) URL.revokeObjectURL(objectUrlRef.current);
    const url = URL.createObjectURL(file);
    objectUrlRef.current = url;
    const img = new Image();
    img.onload = () => {
      const cover = Math.max(CROP_BOX / img.naturalWidth, CROP_BOX / img.naturalHeight);
      const w = img.naturalWidth * cover, h = img.naturalHeight * cover;
      setNatural({ w: img.naturalWidth, h: img.naturalHeight });
      setBaseScale(cover);
      setZoom(1);
      setPos({ x: (CROP_BOX - w) / 2, y: (CROP_BOX - h) / 2 });
      setImgEl(img);
    };
    img.src = url;
    return () => { if (objectUrlRef.current) URL.revokeObjectURL(objectUrlRef.current); };
  }, [file]);

  const scale = baseScale * zoom;

  function clampPos(x, y, s) {
    const w = natural.w * s, h = natural.h * s;
    const minX = Math.min(0, CROP_BOX - w), minY = Math.min(0, CROP_BOX - h);
    return { x: Math.min(0, Math.max(minX, x)), y: Math.min(0, Math.max(minY, y)) };
  }

  // Re-clamp whenever zoom changes so the image can never drift outside
  // the crop box after zooming out.
  useEffect(() => {
    setPos((p) => clampPos(p.x, p.y, scale));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [zoom, natural.w, natural.h]);

  function pointFromEvent(e) { return e.touches ? e.touches[0] : e; }
  function onPointerDown(e) {
    const p = pointFromEvent(e);
    dragRef.current = { startX: p.clientX, startY: p.clientY, origX: pos.x, origY: pos.y };
  }
  function onPointerMove(e) {
    if (!dragRef.current) return;
    if (e.touches) e.preventDefault();
    const p = pointFromEvent(e);
    const dx = p.clientX - dragRef.current.startX;
    const dy = p.clientY - dragRef.current.startY;
    setPos(clampPos(dragRef.current.origX + dx, dragRef.current.origY + dy, scale));
  }
  function onPointerUp() { dragRef.current = null; }

  function handleConfirm() {
    if (!imgEl) return;
    const cropX = -pos.x / scale;
    const cropY = -pos.y / scale;
    const cropSize = CROP_BOX / scale;
    const canvas = document.createElement("canvas");
    canvas.width = CROP_OUTPUT;
    canvas.height = CROP_OUTPUT;
    const ctx = canvas.getContext("2d");
    ctx.drawImage(imgEl, cropX, cropY, cropSize, cropSize, 0, 0, CROP_OUTPUT, CROP_OUTPUT);
    canvas.toBlob((blob) => {
      if (!blob) return;
      const baseName = (file.name || "image").replace(/\.[^.]+$/, "");
      const croppedFile = new File([blob], `${baseName}-cropped.jpg`, { type: "image/jpeg" });
      const url = URL.createObjectURL(croppedFile);
      onConfirm(croppedFile, url);
      // Качество 0.82 вместо 0.92: на кружке в 40–90 пикселей разницы
      // не видно, а файл легче примерно вдвое — столько же экономится
      // на отправке, и «Сохранить» перестаёт ждать мобильную сеть.
    }, "image/jpeg", 0.82);
  }

  if (!file) return null;

  // Окно кадрирования выносится порталом прямо в документ. Оно вставлено
  // внутрь прокручиваемого содержимого (форма создания токена, экран
  // профиля), и раньше позиционировалось относительно него: выезжало
  // вместе с прокруткой, затемнение накрывало не весь экран, а кнопки
  // уходили под нижнее меню. Одного position: fixed мало — экраны
  // появляются с анимацией, а элемент с transform становится системой
  // отсчёта и для fixed-потомков тоже.
  const modal = (
    <div
      className="fx-modal-back"
      style={{
        position: "fixed", inset: 0, zIndex: 300,
        background: "rgba(0,0,0,0.9)", backdropFilter: "blur(6px)", WebkitBackdropFilter: "blur(6px)",
        display: "flex", alignItems: "center", justifyContent: "center",
        padding: "calc(20px + var(--tg-inset-top, 0px)) 20px calc(20px + var(--tg-inset-bottom, 0px))",
      }}
      onClick={(e) => { e.stopPropagation(); onCancel(); }}
    >
      <div className="fx-modal-card" onClick={(e) => e.stopPropagation()} style={{ width: "100%", maxWidth: 340, maxHeight: "100%", overflowY: "auto", background: T.surface, border: `1px solid ${T.lineHi}`, borderRadius: 24, padding: 20, display: "flex", flexDirection: "column", alignItems: "center", gap: 16 }}>
        <div style={{ fontFamily: displayFont, color: T.ice, fontSize: 16, fontWeight: 700 }}>{t("cropImageTitle")}</div>
        <div
          onMouseDown={onPointerDown} onMouseMove={onPointerMove} onMouseUp={onPointerUp} onMouseLeave={onPointerUp}
          onTouchStart={onPointerDown} onTouchMove={onPointerMove} onTouchEnd={onPointerUp} onTouchCancel={onPointerUp}
          style={{
            width: CROP_BOX, height: CROP_BOX, position: "relative", overflow: "hidden",
            borderRadius: shape === "circle" ? "50%" : 16,
            border: `1px solid ${T.lineHi}`, touchAction: "none", cursor: "grab", background: "#050505",
          }}
        >
          {imgEl && (
            <img
              src={imgEl.src}
              alt=""
              draggable={false}
              style={{
                position: "absolute", left: pos.x, top: pos.y,
                width: natural.w * scale, height: natural.h * scale,
                maxWidth: "none", userSelect: "none", pointerEvents: "none",
              }}
            />
          )}
        </div>
        <div className="flex items-center gap-2.5 w-full">
          <span style={{ fontFamily: monoFont, color: T.muted, fontSize: 14.5 }}>–</span>
          <input
            type="range" min={1} max={4} step={0.01} value={zoom}
            onChange={(e) => setZoom(parseFloat(e.target.value))}
            style={{ flex: 1, accentColor: T.turquoise }}
          />
          <span style={{ fontFamily: monoFont, color: T.muted, fontSize: 14.5 }}>+</span>
        </div>
        <div className="flex items-center gap-2 w-full">
          <button onClick={onCancel} className="fx-tap flex-1 rounded-[20px] py-2.5" style={{ background: "transparent", border: `1px solid ${T.line}`, fontFamily: bodyFont, fontSize: 14.5, color: T.muted }}>{t("cancel")}</button>
          <button onClick={handleConfirm} className="fx-tap flex-1 rounded-[20px] py-2.5" style={{ background: PRISM, color: PRISM_TEXT, fontFamily: displayFont, fontWeight: 700, fontSize: 14.5 }}>{t("cropConfirm")}</button>
        </div>
      </div>
    </div>
  );

  return typeof document !== "undefined" ? createPortal(modal, document.body) : modal;
}

/* ---------------------------------------------------------
   TOKEN LAUNCH OVERLAY — fully local simulation of "creating" a token.
   IMPORTANT: this never touches the network. No RPC call, no smart
   contract, no TonConnect transaction, no API request is made anywhere
   in this component. It only runs a timed sequence of UI states
   (Preparing → Generating → Deploying → Confirming → Success) and,
   once "done", renders a locally generated fake contract address and
   a "Token Created" badge. All resulting data lives purely in this
   component's state / the caller's in-memory state — it is cosmetic
   only and must never be mistaken for a real on-chain asset.
--------------------------------------------------------- */
/* Total supply is fixed for every token created through this flow — it's
   not a field the user edits. Shown as a read-only line in the form and
   baked into the simulated result. */
const TOKEN_FIXED_SUPPLY = 1_000_000_000;
const TOKEN_FIXED_SUPPLY_LABEL = TOKEN_FIXED_SUPPLY.toLocaleString("ru-RU");
// Сколько токенов даст стартовая покупка. Считается ровно той же
// формулой, что и в контракте, по свежей кривой: до этого здесь стояла
// линейная прикидка «столько-то токенов за TON», и она обещала втрое
// больше, чем кривая выдаёт на самом деле.
function tokensForTon(tonAmount) {
  const n = Math.max(0, tonAmount || 0);
  if (n <= 0) return { tokens: 0, pct: 0 };
  // Контракт удерживает газ из присланного и берёт комиссию с остатка.
  const netTon = toNano(n.toFixed(9)) * (10000n - CURVE_PARAMS.feeBps) / 10000n;
  const raw = tokensOutFor({ realTon: 0n, tokensSold: 0n }, netTon);
  const tokens = Number(raw / 1000000000n);
  const pct = Math.min(100, (tokens / TOKEN_FIXED_SUPPLY) * 100);
  return { tokens, pct };
}

const LAUNCH_STEPS = [
  { key: "preparing", label: () => t("launchPreparing"), icon: FileText },
  { key: "generating", label: () => t("launchGenerating"), icon: Sparkles },
  { key: "deploying", label: () => t("launchDeploying"), icon: Rocket },
  { key: "confirming", label: () => t("launchConfirming"), icon: ShieldCheck },
];

function TokenLaunchOverlay({ open, form, category, logoUrl, buyAmount, stepIndex, done, error, result, onClose, onRetry, onViewToken }) {
  // Окно держится на экране, пока идёт анимация ухода: разметка ниже
  // помечает себя классом закрытия, и без этого значения экран запуска
  // падал на первом же открытии.
  const [видно, closing] = useClosing(open);
  const [copied, setCopied] = useState(false);
  const [logCopied, setLogCopied] = useState(false);
  useEffect(() => { if (open) setCopied(false); }, [open]);

  if (!видно) return null;

  function copyAddr() {
    const addr = result && result.address;
    if (addr && typeof navigator !== "undefined" && navigator.clipboard) navigator.clipboard.writeText(addr).catch(() => {});
    setCopied(true);
    setTimeout(() => setCopied(false), 1400);
  }

  function copyErrorLog() {
    if (error && typeof navigator !== "undefined" && navigator.clipboard) navigator.clipboard.writeText(error).catch(() => {});
    setLogCopied(true);
    setTimeout(() => setLogCopied(false), 1400);
  }

  return (
    <div className={`fx-modal-back${closing ? " fx-out" : ""}`} style={{ position: "absolute", inset: 0, zIndex: 80, background: "rgba(0,0,0,0.92)", backdropFilter: "blur(6px)", display: "flex", alignItems: "center", justifyContent: "center", padding: "calc(20px + var(--tg-inset-top, 0px)) 20px calc(20px + var(--tg-inset-bottom, 0px))", overflowY: "auto" }}>
      {error ? (
        <div className="fx-modal-card flex flex-col items-center text-center gap-4" style={{ width: "100%", maxWidth: 340, background: T.surface, border: `1px solid ${T.lineHi}`, borderRadius: 24, padding: 24 }}>
          <div style={{ width: 64, height: 64, clipPath: FACET, background: hexA(T.down, 0.12), border: `1px solid ${hexA(T.down, 0.35)}`, display: "flex", alignItems: "center", justifyContent: "center" }}>
            <ShieldAlert size={26} color={T.down} />
          </div>
          <div style={{ maxHeight: 220, overflowY: "auto", width: "100%" }}>
            <div style={{ fontFamily: displayFont, color: T.ice, fontSize: 17.5, fontWeight: 700 }}>{t("launchFailedTitle")}</div>
            <div style={{ fontFamily: bodyFont, color: T.muted, fontSize: 13, marginTop: 6, lineHeight: 1.5, whiteSpace: "pre-wrap", textAlign: "left" }}>{error}</div>
          </div>
          <div className="flex flex-col gap-2 w-full mt-1">
            <button onClick={copyErrorLog} className="fx-tap w-full rounded-[20px] py-3" style={{ background: "transparent", border: `1px solid ${T.line}`, fontFamily: bodyFont, fontSize: 14.5, color: T.ice, display: "flex", alignItems: "center", justifyContent: "center", gap: 6 }}>
              <Copy size={14} color={T.ice} /> {logCopied ? t("linkCopied") : "Скопировать лог"}
            </button>
            <button onClick={onRetry} className="fx-tap w-full rounded-[20px] py-3" style={{ background: PRISM, color: PRISM_TEXT, fontFamily: displayFont, fontWeight: 700, fontSize: 15 }}>
              {t("retry")}
            </button>
            <button onClick={() => onClose && onClose(null)} className="fx-tap w-full rounded-[20px] py-3" style={{ background: "transparent", border: `1px solid ${T.line}`, fontFamily: bodyFont, fontSize: 14.5, color: T.muted }}>
              {t("doneClose")}
            </button>
          </div>
        </div>
      ) : !done ? (
        <div className="fx-modal-card flex flex-col items-center text-center gap-5" style={{ width: "100%", maxWidth: 340 }}>
          {/* Голая крутилка, без гранёной плашки: она тут ничего не
              значила, а на пустом экране читалась как оборванная
              картинка. */}
          <div style={{ display: "flex", alignItems: "center", justifyContent: "center", height: 64 }}>
            <RefreshCw size={30} color={T.electric} style={{ animation: "spin360 1.1s linear infinite" }} />
          </div>
          <div>
            <div style={{ fontFamily: displayFont, color: T.ice, fontSize: 17.5, fontWeight: 700 }}>
              {form.name.trim() || "Token"} · ${(form.ticker.trim() || "TICKER").toUpperCase()}
            </div>
            <div style={{ fontFamily: bodyFont, color: T.muted, fontSize: 12.5, marginTop: 6 }}>{t("launchingWait")}</div>
          </div>
          <div className="flex flex-col gap-2.5 w-full mt-1">
            {LAUNCH_STEPS.map((step, i) => {
              const Icon = step.icon;
              const state = i < stepIndex ? "done" : i === stepIndex ? "active" : "pending";
              return (
                <div key={step.key} className="flex items-center gap-2.5 rounded-[20px] px-3 py-2.5" style={{
                  background: state === "active" ? ink(0.07) : "transparent",
                  border: `1px solid ${state === "active" ? ink(0.22) : T.line}`,
                  opacity: state === "pending" ? 0.45 : 1,
                  transition: `opacity ${EASE}, background ${EASE}`,
                }}>
                  {state === "done" ? (
                    <CheckCircle2 size={16} color={T.up} />
                  ) : state === "active" ? (
                    <RefreshCw size={16} color={T.electric} style={{ animation: "spin360 1s linear infinite" }} />
                  ) : (
                    <Icon size={16} color={T.muted} />
                  )}
                  <span style={{ fontFamily: bodyFont, fontSize: 14, color: state === "pending" ? T.muted : T.ice, textAlign: "left" }}>{step.label()}</span>
                </div>
              );
            })}
          </div>
        </div>
      ) : (
        <div className="fx-modal-card fx-view flex flex-col items-center text-center gap-4" style={{ width: "100%", maxWidth: 360, background: T.surface, border: `1px solid ${T.lineHi}`, borderRadius: 24, padding: 24 }}>
          <div style={{ width: 68, height: 68, borderRadius: "50%", overflow: "hidden", background: result.logoUrl ? `center/cover no-repeat url(${result.logoUrl})` : T.surfaceHi, border: `1px solid ${T.lineHi}`, display: "flex", alignItems: "center", justifyContent: "center" }}>
            {!result.logoUrl && <Rocket size={26} color={T.electric} />}
          </div>
          <div className="flex items-center gap-1.5 rounded-full px-3 py-1" style={{ background: hexA(T.up, 0.12), border: `1px solid ${hexA(T.up, 0.35)}` }}>
            <ShieldCheck size={13} color={T.up} />
            <span style={{ fontFamily: bodyFont, fontSize: 12, fontWeight: 600, color: T.up }}>{t("tokenCreatedStatus")}</span>
          </div>
          <div>
            <div style={{ fontFamily: displayFont, color: T.ice, fontSize: 20.5, fontWeight: 700 }}>{result.name}</div>
            <div style={{ fontFamily: monoFont, color: T.muted, fontSize: 13, marginTop: 2 }}>${result.ticker}</div>
          </div>
          <p style={{ fontFamily: bodyFont, color: T.muted, fontSize: 13, lineHeight: 1.5, marginTop: -6 }}>{t("launchSuccessSub")}</p>

          <div className="w-full flex flex-col gap-2 mt-1">
            <div className="flex items-center justify-between rounded-[20px] px-3 py-2.5" style={{ background: T.surfaceHi, border: `1px solid ${T.line}` }}>
              <span style={{ fontFamily: bodyFont, fontSize: 12, color: T.muted }}>{t("totalSupply")}</span>
              <span style={{ fontFamily: monoFont, fontSize: 13, color: T.ice }}>{result.supply}</span>
            </div>
            <div className="flex items-center justify-between rounded-[20px] px-3 py-2.5" style={{ background: T.surfaceHi, border: `1px solid ${T.line}` }}>
              <span style={{ fontFamily: bodyFont, fontSize: 12, color: T.muted }}>{t("initialBuy")}</span>
              <span style={{ fontFamily: monoFont, fontSize: 13, color: T.ice, textAlign: "right" }}>
                {result.buyAmount} {result.chain === "solana" ? "SOL" : "TON"}<br />
                <span style={{ fontSize: 11.5, color: T.muted }}>
                  {(Number(result.buyTokens) || 0).toLocaleString("ru-RU")} ${result.ticker} · {(Number(result.buyPct) || 0).toFixed((Number(result.buyPct) || 0) < 1 ? 3 : 1)}%
                </span>
              </span>
            </div>
            <div className="flex items-center justify-between rounded-[20px] px-3 py-2.5 gap-2" style={{ background: T.surfaceHi, border: `1px solid ${T.line}` }}>
              <div className="flex flex-col items-start min-w-0">
                <span style={{ fontFamily: bodyFont, fontSize: 12, color: T.muted }}>{t("contractAddress")}</span>
                <span style={{ fontFamily: monoFont, fontSize: 12.5, color: T.ice, whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis", maxWidth: 190 }}>{result.address}</span>
              </div>
              <button onClick={copyAddr} className="fx-tap flex-shrink-0">
                {copied ? <CheckCircle2 size={15} color={T.turquoise} /> : <Copy size={15} color={T.muted} />}
              </button>
            </div>
            {result.explorerUrl && (
              <a href={result.explorerUrl} target="_blank" rel="noreferrer" className="fx-tap flex items-center justify-center gap-1.5 rounded-[20px] px-3 py-2.5" style={{ background: T.surfaceHi, border: `1px solid ${T.line}`, textDecoration: "none" }}>
                <ExternalLink size={13} color={T.muted} />
                <span style={{ fontFamily: bodyFont, fontSize: 12.5, color: T.muted }}>{t("viewOnExplorer")}</span>
              </a>
            )}
          </div>

          <div className="flex flex-col gap-2 w-full mt-2">
            <button
              onClick={() => onViewToken && onViewToken(result)}
              className="fx-tap w-full rounded-[20px] py-3"
              style={{ background: PRISM, color: PRISM_TEXT, fontFamily: displayFont, fontWeight: 700, fontSize: 15 }}
            >
              {t("launchBuyCta")}
            </button>
            <button onClick={() => onClose && onClose(result)} className="fx-tap w-full rounded-[20px] py-3" style={{ background: "transparent", border: `1px solid ${T.line}`, fontFamily: bodyFont, fontSize: 14.5, color: T.muted }}>
              {t("doneClose")}
            </button>
          </div>
        </div>
      )}
    </div>
  );
}

function CreateView({ showToast, unlocked, accountCreated, connected, onOpenCreateProfile, onOpenConnectModal, onLaunch, solДоступен = false }) {
  const [form, setForm] = useState({ name: "", ticker: "", buyAmount: "", desc: "", tg: "", x: "", site: "" });
  // В какой сети запускать. Пока программа кривой в Solana не
  // развёрнута, выбора нет вовсе — предлагать действие, которое всё
  // равно не пройдёт, хуже, чем не предлагать его.
  const [сетьЗапуска, setСетьЗапуска] = useState(() => {
    // Тот же выбор рынка, что и в мемпаде: пришёл из раздела Solana —
    // запускать, скорее всего, тоже там.
    try {
      const с = typeof window !== "undefined" && window.localStorage.getItem("mintly.network");
      return с === "sol" ? "sol" : "ton";
    } catch {
      return "ton";
    }
  });
  useEffect(() => {
    try { if (typeof window !== "undefined") window.localStorage.setItem("mintly.network", сетьЗапуска); } catch { /* приватный режим */ }
  }, [сетьЗапуска]);
  const вSolana = solДоступен && сетьЗапуска === "sol";
  // Подпись обязательна: сама транзакция запуска эту сумму не тратит —
  // покупка идёт отдельным шагом сразу после создания. Без пояснения
  // человек ждёт токены на кошельке и не понимает, почему их нет.
  const [category, setCategory] = useState(null);
  const [logoUrl, setLogoUrl] = useState(null);
  const [logoFile, setLogoFile] = useState(null);
  const [bannerUrl, setBannerUrl] = useState(null);
  // Файл нужен целиком: раньше баннер жил только как blob-ссылка на
  // предпросмотр и умирал вместе со вкладкой, никуда не сохраняясь.
  const [bannerFile, setBannerFile] = useState(null);
  const [touched, setTouched] = useState(false);
  const [logoCropFile, setLogoCropFile] = useState(null);
  const logoInputRef = useRef(null);
  const bannerInputRef = useRef(null);

  // Форму заполняют не меньше полуминуты — за это время библиотеки
  // запуска успевают доехать, и нажатие «Запустить» не упирается в
  // ожидание загрузки.
  useEffect(() => { загрузитьЗапуск(); }, []);

  function set(key) { return (e) => setForm(f => ({ ...f, [key]: e.target.value })); }
  // Разделитель допускается ровно один: без этого в поле набиралось
  // «0,1,2», а parseFloat от такого — не число, и запуск молча упирался
  // в «введите сумму». Запятая приводится к точке сразу, чтобы значение
  // в состоянии всегда годилось для разбора.
  function setBuyAmount(e) {
    const raw = String(e.target.value).replace(/[^0-9.,]/g, "").replace(/,/g, ".");
    const [head, ...rest] = raw.split(".");
    const cleaned = (rest.length ? `${head}.${rest.join("")}` : head).slice(0, 12);
    setForm((f) => ({ ...f, buyAmount: cleaned }));
  }
  function onPickLogo(e) {
    const file = e.target.files && e.target.files[0];
    e.target.value = ""; // allow re-picking the same file later
    if (!file) return;
    setLogoCropFile(file);
  }
  function handleLogoCropConfirm(croppedFile, croppedUrl) {
    setLogoUrl(croppedUrl);
    setLogoFile(croppedFile);
    setLogoCropFile(null);
    showToast(t("logoUploaded"));
  }
  function onPickBanner(e) {
    const file = e.target.files && e.target.files[0];
    e.target.value = "";
    if (!file) return;
    setBannerUrl(URL.createObjectURL(file));
    setBannerFile(file);
    showToast(t("bannerUploaded"));
  }
  function handleLaunch() {
    setTouched(true);
    if (!logoUrl) {
      showToast(t("logoRequired"));
      return;
    }
    if (!form.name.trim() || !form.ticker.trim()) {
      showToast(t("nameTickerRequired"));
      return;
    }
    if (!form.desc.trim()) {
      showToast(t("descRequiredWarning"));
      return;
    }
    const buyNum = parseFloat(form.buyAmount.replace(",", "."));
    if (!Number.isFinite(buyNum) || buyNum <= 0) {
      showToast(t("buyAmountRequired"));
      return;
    }
    // Порог задан в долларах, поэтому проверять его без курса нельзя:
    // при нуле любая сумма выглядела бы недостаточной. Курс берётся той
    // сети, в которой идёт запуск, — иначе доллары считались бы по чужой
    // монете.
    const rate = вSolana ? solUsd() : tonUsd();
    if (MIN_LAUNCH_ENFORCED && rate > 0) {
      const минимум = MIN_LAUNCH_USD / rate;
      if (buyNum * rate < MIN_LAUNCH_USD) {
        showToast(trf("buyAmountTooLow", { min: MIN_LAUNCH_USD, tons: минимум.toFixed(вSolana ? 3 : 2) }));
        return;
      }
    }
    // Real launch: hands off to the root app, which deploys an actual
    // jetton on-chain via TonConnect and seeds a STON.fi pool with the
    // committed buyAmount (see tonLaunch.js / handleLaunchRequest).
    onLaunch({
      form, category, logoUrl, logoFile, bannerFile,
      buyAmount: form.buyAmount.trim(),
      chain: вSolana ? "solana" : "ton",
      onFinish: finishLaunch,
    });
  }

  function resetForm() {
    setForm({ name: "", ticker: "", buyAmount: "", desc: "", tg: "", x: "", site: "" });
    setCategory(null);
    setLogoUrl(null);
    setLogoFile(null);
    setBannerUrl(null);
    setBannerFile(null);
    setTouched(false);
  }

  function finishLaunch(result) {
    if (result) showToast(tf("tokenCreatedToast", { name: result.name, ticker: result.ticker }));
    resetForm();
  }

  if (!unlocked) {
    return (
      <div className="fx-view flex flex-col items-center justify-center text-center gap-3" style={{ minHeight: "70%", paddingTop: 40 }}>
        <MintlyFrame size={64} glow={`${T.violet}55`}><Lock size={26} color={T.violet} /></MintlyFrame>
        <div style={{ fontFamily: displayFont, color: T.ice, fontSize: 18.5, fontWeight: 700, marginTop: 6 }}>{t("padClosedTitle")}</div>
        <p style={{ fontFamily: bodyFont, color: T.muted, fontSize: 14, lineHeight: 1.5, maxWidth: 280 }}>
          {t("padClosedBody")}
        </p>
        <div className="flex flex-col gap-2 w-full mt-2" style={{ maxWidth: 260 }}>
          {!accountCreated && (
            <button onClick={onOpenCreateProfile} className="fx-tap w-full rounded-[20px] py-3" style={{ background: PRISM, color: PRISM_TEXT, fontFamily: displayFont, fontWeight: 700, fontSize: 14.5 }}>
              {t("createAccount")}
            </button>
          )}
          {!connected && (
            <button onClick={onOpenConnectModal} className="fx-tap w-full flex items-center justify-center gap-2 rounded-[20px] py-3" style={{ background: accountCreated ? PRISM : T.surfaceHi, color: accountCreated ? PRISM_TEXT : T.ice, border: accountCreated ? "none" : `1px solid ${T.line}`, fontFamily: displayFont, fontWeight: 700, fontSize: 14.5 }}>
              <Wallet size={15} /> {t("connectWalletCta")}
            </button>
          )}
        </div>
      </div>
    );
  }

  // Своего запаса снизу тут нет: полосу вкладок уже учитывает
  // прокручиваемый контейнер экрана. Раньше к ней добавлялись ещё сто
  // сорок точек, и под кнопкой запуска оставалась пустая половина экрана.
  return (
    <div className="fx-view flex flex-col gap-7" style={{ position: "relative" }}>
      <div>
        <div style={{ fontFamily: displayFont, color: T.ice, fontSize: 20.5, fontWeight: 700 }}>{t("launchTokenTitle")}</div>
        <div style={{ fontFamily: bodyFont, color: T.muted, fontSize: 13, marginTop: 2 }}>
          {вSolana ? t("launchTokenSubSol") : t("launchTokenSub")}
        </div>
        {/* Сеть выбирается тем же ползунком, что и в мемпаде: это один и
            тот же выбор рынка, и выглядеть он должен одинаково. */}
        {solДоступен && (
          <div style={{ marginTop: 12 }}>
            <NetworkSlider value={сетьЗапуска} onChange={setСетьЗапуска} />
          </div>
        )}
      </div>

      <div>
        <span style={{ fontFamily: bodyFont, color: T.muted, fontSize: 13 }}>{t("logoLabel")}</span>
        <div className="flex gap-3 mt-1.5">
          <input ref={logoInputRef} type="file" accept="image/*" onChange={onPickLogo} style={{ display: "none" }} />
          <input ref={bannerInputRef} type="file" accept="image/*" onChange={onPickBanner} style={{ display: "none" }} />
          <button onClick={() => logoInputRef.current && logoInputRef.current.click()} className="fx-tap flex flex-col items-center justify-center gap-1 flex-shrink-0 overflow-hidden" style={{ width: 76, height: 76, borderRadius: "50%", background: logoUrl ? `center/cover no-repeat url(${logoUrl})` : T.surface, border: logoUrl ? `1.5px solid ${T.lineHi}` : `1px dashed ${touched && !logoUrl ? T.down : T.line}` }}>
            {!logoUrl && (<><ImageIcon size={18} color={touched ? T.down : T.muted} /><span style={{ fontFamily: bodyFont, color: touched ? T.down : T.muted, fontSize: 10 }}>{t("logoShort")}</span></>)}
          </button>
          <button onClick={() => bannerInputRef.current && bannerInputRef.current.click()} className="fx-tap flex-1 flex flex-col items-center justify-center gap-1 rounded-[22px] overflow-hidden" style={{ background: bannerUrl ? `center/cover no-repeat url(${bannerUrl})` : T.surface, border: bannerUrl ? `1.5px solid ${T.lineHi}` : `1px dashed ${T.line}` }}>
            {!bannerUrl && (<><Upload size={18} color={T.muted} /><span style={{ fontFamily: bodyFont, color: T.muted, fontSize: 11 }}>{t("bannerOptional")}</span></>)}
          </button>
        </div>
        {touched && !logoUrl && <span style={{ fontFamily: bodyFont, color: T.down, fontSize: 12, marginTop: 4, display: "block" }}>{t("logoRequiredShort")}</span>}
      </div>

      <Field label={t("nameLabel")} placeholder="Prism Cat" value={form.name} onChange={set("name")} />
      <Field label={t("tickerLabel")} placeholder="PRSM" value={form.ticker} onChange={set("ticker")} />

      <div>
        <Field label={t("descLabel")} placeholder={t("descPlaceholder")} area value={form.desc} onChange={set("desc")} error={touched && !form.desc.trim()} />
        {touched && !form.desc.trim() && <span style={{ fontFamily: bodyFont, color: T.down, fontSize: 12, marginTop: 4, display: "block" }}>{t("descRequiredShort")}</span>}
      </div>

      <div className="grid grid-cols-3 gap-2">
        <Field label="Telegram" placeholder="t.me/..." value={form.tg} onChange={set("tg")} />
        <Field label="X" placeholder="x.com/..." value={form.x} onChange={set("x")} />
        <Field label={t("siteLabel")} placeholder="site.xyz" value={form.site} onChange={set("site")} />
      </div>

      <div className="flex flex-col gap-1.5">
        <span style={{ fontFamily: bodyFont, color: T.muted, fontSize: 13 }}>{t("launchAmountLabel")}</span>
        <div className="flex items-center gap-2 rounded-[20px] px-3.5 py-3" style={{ background: T.surface, border: `1px solid ${touched && MIN_LAUNCH_ENFORCED && (вSolana ? solUsd() : tonUsd()) > 0 && !(parseFloat(form.buyAmount.replace(",", ".")) * (вSolana ? solUsd() : tonUsd()) >= MIN_LAUNCH_USD) ? T.down : T.line}` }}>
          <input
            value={form.buyAmount}
            onChange={setBuyAmount}
            placeholder="10"
            inputMode="decimal"
            autoComplete="off"
            autoCorrect="off"
            spellCheck={false}
            enterKeyHint="done"
            // Высота строки задаётся явно: без неё каретка наследует
            // межстрочный интервал от родителя и рисуется выше самого
            // текста.
            style={{ fontFamily: displayFont, fontWeight: 700, color: T.ice, fontSize: 17.5, lineHeight: "20px", height: 20, background: "transparent", border: "none", outline: "none", flex: 1, minWidth: 0, padding: 0 }}
          />
          <span style={{ fontFamily: monoFont, color: T.muted, fontSize: 14.5 }}>{вSolana ? "SOL" : "TON"}</span>
        </div>
        <p style={{ fontFamily: bodyFont, color: T.muted, fontSize: 12, lineHeight: 1.5, marginTop: 6 }}>
          {t("initialBuyHint")}
        </p>
        {(() => {
          const buyNum = parseFloat(form.buyAmount.replace(",", "."));
          const rate = вSolana ? solUsd() : tonUsd();
          const minBuyTon = rate > 0 ? MIN_LAUNCH_USD / rate : 0;
          if (!Number.isFinite(buyNum) || buyNum <= 0) {
            return (
              <p style={{ fontFamily: bodyFont, color: T.muted, fontSize: 12, lineHeight: 1.5 }}>
                {t("launchAmountNote")}
              </p>
            );
          }
          if (MIN_LAUNCH_ENFORCED && rate > 0 && buyNum * rate < MIN_LAUNCH_USD) {
            return (
              <p style={{ fontFamily: bodyFont, color: T.down, fontSize: 12, lineHeight: 1.5 }}>
                {trf("buyAmountTooLow", { min: MIN_LAUNCH_USD, tons: minBuyTon.toFixed(вSolana ? 3 : 2) })}
              </p>
            );
          }
          const { tokens, pct } = tokensForTon(buyNum);
          return (
            <div className="flex items-center justify-between rounded-[20px] px-3.5 py-2.5" style={{ background: ink(0.06), border: `1px solid ${ink(0.2)}` }}>
              <span style={{ fontFamily: bodyFont, color: T.electric, fontSize: 13 }}>{t("youWillGet")}</span>
              <span style={{ fontFamily: monoFont, color: T.electric, fontSize: 14, fontWeight: 600 }}>
                {tokens.toLocaleString("ru-RU")} {(form.ticker.trim() || "TOKEN").toUpperCase()} · {pct.toFixed(pct < 1 ? 3 : 1)}% {t("supplyShare")}
              </span>
            </div>
          );
        })()}
      </div>

      {!connected && (
        <div className="rounded-[22px] p-4 flex items-center gap-2.5" style={{ background: ink(0.07), border: `1px solid ${ink(0.22)}` }}>
          <Wallet size={16} color={T.electric} />
          <span style={{ fontFamily: bodyFont, color: T.electric, fontSize: 14 }}>{t("connectToConfirm")}</span>
        </div>
      )}

      <button onClick={handleLaunch} className="cta-launch fx-tap rounded-[22px]" style={{ fontFamily: displayFont, fontWeight: 700, fontSize: 17.5, color: PRISM_TEXT, background: PRISM, position: "sticky", bottom: 12, padding: "18px 0" }}>
        {t("launchTokenCta")}
      </button>

      <ImageCropModal file={logoCropFile} shape="circle" onCancel={() => setLogoCropFile(null)} onConfirm={handleLogoCropConfirm} />
    </div>
  );
}

/* ---------------------------------------------------------
   PROFILE VIEW
--------------------------------------------------------- */

function MyTokenCard({ t, onOpen }) {
  // Свои токены живут в той же сети, что и приложение, а один из
  // жетонных кошельков — кошелёк кривой. Раньше здесь спрашивали
  // mainnet и получали прочерк вместо числа.
  const holdersCount = useJettonHolders(t.address, TON_TESTNET_NETWORK, t.curveAddress ? 1 : 0);
  // Вся карточка ведёт на экран токена: за своим токеном заходят
  // смотреть график и сделки, а не в служебное окно. Отдельной кнопки
  // рядом больше нет — она перехватывала касание там, где его ждали от
  // самой карточки.
  return (
    <GlassCard
      style={{ padding: "12px 14px", cursor: "pointer" }}
      className="fx-tap flex items-center gap-3"
      role="button"
      tabIndex={0}
      onClick={() => onOpen && onOpen(t)}
      onKeyDown={(e) => { if (e.key === "Enter" || e.key === " ") { e.preventDefault(); onOpen && onOpen(t); } }}
    >
      <TokenAvatar tone={t.verified ? "neutral" : "neutral"} src={t.logoUrl} />
      <div className="flex-1 min-w-0">
        <div className="flex items-center gap-1.5">
          <span style={{ fontFamily: displayFont, color: T.ice, fontSize: 15, fontWeight: 600 }}>{t.name}</span>
          {t.verified && <ShieldCheck size={12} color={T.electric} />}
          <span style={{ fontFamily: monoFont, color: T.muted, fontSize: 11 }}>${t.ticker}</span>
          <ПометкаТест сеть={t.network} size={9.5} />
        </div>
        <div style={{ fontFamily: displayFont, fontWeight: 700, fontSize: 17.5, color: T.turquoise, marginTop: 2 }}>{fmtUSD(t.mcapNum)}</div>
        <div style={{ fontFamily: bodyFont, color: T.muted, fontSize: 11.5, marginTop: 2 }}>{tr("liqShort")} ${t.liq} · {holdersCount == null ? "—" : holdersCount.toLocaleString("ru-RU")} {tr("holdersShort")} · {tr("volShort")} {t.vol}</div>
      </div>
      <ChevronRight size={16} color={T.muted} style={{ flexShrink: 0 }} />
    </GlassCard>
  );
}

/* ---------------------------------------------------------
   PIN-CODE — app-open lock. Three pieces:
   - PinDots / PinKeypad: shared visual primitives
   - PinSetupModal: bottom-sheet used from Security settings to
     create / change / disable the PIN (asks for the current PIN
     first when one already exists)
   - PinLockScreen: full-screen gate shown on launch when the
     PIN is enabled, blocking the app until the right code is typed
--------------------------------------------------------- */

const PIN_LENGTH = 4;

function PinDots({ length = PIN_LENGTH, filled, error }) {
  return (
    <div className="flex items-center justify-center gap-3" style={{ animation: error ? "shake 340ms ease" : "none" }}>
      {Array.from({ length }).map((_, i) => (
        <div key={i} style={{
          width: 14, height: 14, borderRadius: "50%",
          background: i < filled ? (error ? T.down : PRISM) : "transparent",
          border: `1.5px solid ${i < filled && !error ? "transparent" : error ? T.down : "rgba(255,255,255,0.20)"}`,
          transition: `background ${EASE}, border-color ${EASE}`,
        }} />
      ))}
    </div>
  );
}

function PinKeypad({ onDigit, onBackspace }) {
  const keys = ["1", "2", "3", "4", "5", "6", "7", "8", "9", "", "0", "back"];
  return (
    <div className="grid grid-cols-3 gap-5" style={{ width: "100%", maxWidth: 264, margin: "0 auto" }}>
      {keys.map((k, idx) => {
        if (k === "") return <div key={idx} />;
        if (k === "back") {
          return (
            <button key={idx} onClick={() => { haptic("soft"); onBackspace(); }} className="fx-tap flex items-center justify-center" style={{ width: "100%", aspectRatio: "1 / 1", borderRadius: "50%", background: "transparent" }}>
              <span style={{ fontFamily: bodyFont, fontSize: 20.5, color: T.muted }}>⌫</span>
            </button>
          );
        }
        return (
          <button
            key={idx}
            onClick={() => { haptic("light"); onDigit(k); }}
            className="fx-tap flex items-center justify-center"
            style={{
              width: "100%",
              aspectRatio: "1 / 1",
              borderRadius: "50%",
              background: T.surfaceHi,
              border: `1px solid ${T.line}`,
              boxShadow: "0 4px 14px rgba(0,0,0,0.35)",
            }}
          >
            <span style={{ fontFamily: displayFont, fontSize: 22, fontWeight: 700, color: T.ice }}>{k}</span>
          </button>
        );
      })}
    </div>
  );
}

function PinSetupModal({ mode: modeProp, currentPin, onClose, onComplete, onDisable, showToast }) {
  // Первым делом: ниже на mode завязаны и состояние, и эффекты.
  const [mode, closing] = useClosing(modeProp);
  const [stage, setStage] = useState(mode === "change" || mode === "disable" ? "verify" : "new");
  const [entry, setEntry] = useState("");
  const [firstNew, setFirstNew] = useState("");
  const [error, setError] = useState(false);

  useEffect(() => {
    if (!mode) return;
    setStage(mode === "change" || mode === "disable" ? "verify" : "new");
    setEntry(""); setFirstNew(""); setError(false);
  }, [mode]);

  if (!mode) return null;

  function shakeAnd(after) {
    haptic("error");
    setError(true);
    setTimeout(() => { setError(false); setEntry(""); after && after(); }, 340);
  }

  function submitStage(code) {
    if (stage === "verify") {
      if (code === currentPin) {
        setEntry("");
        if (mode === "disable") onDisable();
        else setStage("new");
      } else {
        showToast(t("wrongCurrentPin"));
        shakeAnd();
      }
      return;
    }
    if (stage === "new") {
      setFirstNew(code);
      setEntry("");
      setStage("confirm");
      return;
    }
    if (stage === "confirm") {
      if (code === firstNew) {
        onComplete(code);
      } else {
        showToast(t("pinMismatch"));
        setFirstNew("");
        shakeAnd(() => setStage("new"));
      }
    }
  }

  function handleDigit(d) {
    if (entry.length >= PIN_LENGTH) return;
    const next = entry + d;
    setEntry(next);
    if (next.length === PIN_LENGTH) setTimeout(() => submitStage(next), 120);
  }
  function handleBackspace() { setEntry((e) => e.slice(0, -1)); }

  const titles = {
    verify: t("pinEnterCurrent"),
    new: t("pinEnterNew"),
    confirm: t("pinConfirmNew"),
  };

  return (
    <div className={`fx-modal-back${closing ? " fx-out" : ""}`} style={{ ...SHEET_BACK, zIndex: 70, background: "rgba(0,0,0,0.82)" }} onClick={onClose}>
      <div className="fx-modal-card" onClick={(e) => e.stopPropagation()} style={sheetCard(22, { paddingBottom: 30 })}>
        <div className="flex justify-end"><button onClick={onClose} className="fx-tap fx-close"><X size={16} color={T.muted} /></button></div>
        <div className="flex flex-col items-center text-center gap-1" style={{ marginTop: -8 }}>
          <MintlyFrame size={52} glow={`${T.electric}55`}><Lock size={20} color={T.electric} /></MintlyFrame>
          <div style={{ fontFamily: displayFont, color: T.ice, fontSize: 16, fontWeight: 700, marginTop: 8 }}>{titles[stage]}</div>
        </div>
        <div style={{ margin: "26px 0" }}><PinDots filled={entry.length} error={error} /></div>
        <PinKeypad onDigit={handleDigit} onBackspace={handleBackspace} />
      </div>
    </div>
  );
}

function PinLockScreen({ pin, profile, onUnlock, onForgot }) {
  const [entry, setEntry] = useState("");
  const [error, setError] = useState(false);

  function handleDigit(d) {
    if (entry.length >= PIN_LENGTH) return;
    const next = entry + d;
    setEntry(next);
    if (next.length === PIN_LENGTH) {
      setTimeout(() => {
        if (next === pin) { onUnlock(); }
        else {
          haptic("error");
          setError(true);
          setTimeout(() => { setError(false); setEntry(""); }, 340);
        }
      }, 100);
    }
  }
  function handleBackspace() { setEntry((e) => e.slice(0, -1)); }

  const hasName = profile && profile.nickname;

  return (
    <div className="fx-view" style={{ position: "absolute", inset: 0, zIndex: 200, background: T.bg, display: "flex", flexDirection: "column", alignItems: "center", overflow: "hidden" }}>
      <div style={{ position: "relative", flex: 1, width: "100%", display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", padding: "calc(24px + var(--tg-inset-top, 0px)) 24px calc(24px + var(--tg-inset-bottom, 0px))" }}>
        <div style={{ fontFamily: displayFont, color: T.ice, fontSize: 24, fontWeight: 700, letterSpacing: "-0.02em", textAlign: "center" }}>
          {hasName ? tf("greetingHi", { name: profile.nickname }) : t("greetingBack")}
        </div>

        <div style={{ marginTop: 22, position: "relative" }}>
          <div style={{
            width: 76, height: 76, borderRadius: "50%", overflow: "hidden",
            background: profile && profile.avatarUrl ? `center/cover no-repeat url(${profile.avatarUrl})` : T.surfaceHi,
            border: `1px solid ${T.lineHi}`, display: "flex", alignItems: "center", justifyContent: "center",
          }}>
            {!(profile && profile.avatarUrl) && (
              profile && profile.emoji
                ? <span style={{ fontSize: 32 }}>{profile.emoji}</span>
                : <Lock size={26} color={T.ice} />
            )}
          </div>
        </div>

        <div style={{ fontFamily: bodyFont, color: T.muted, fontSize: 14, marginTop: 14 }}>{t("pinContinueNote")}</div>

        <div style={{ margin: "28px 0" }}><PinDots filled={entry.length} error={error} /></div>
        <PinKeypad onDigit={handleDigit} onBackspace={handleBackspace} />
        <button onClick={onForgot} className="fx-tap" style={{ marginTop: 26, fontFamily: bodyFont, fontSize: 14, color: T.muted, textDecoration: "underline", textUnderlineOffset: 3 }}>
          {t("pinForgot")}
        </button>
      </div>
    </div>
  );
}

function ConnectModal({ open, onClose, onConnect }) {
  // Окно держится на экране, пока идёт анимация ухода: раньше оно
  // пропадало кадром, и казалось, что нажатие сломало экран.
  const [видно, closing] = useClosing(open);
  if (!видно) return null;
  return (
    <div className={`fx-modal-back${closing ? " fx-out" : ""}`} style={{ ...SHEET_BACK, zIndex: 60 }} onClick={onClose}>
      <div className="fx-modal-card" onClick={(e) => e.stopPropagation()} style={sheetCard(22)}>
        <div className="flex justify-end"><button onClick={onClose} className="fx-tap fx-close"><X size={16} color={T.muted} /></button></div>
        <div className="flex flex-col items-center text-center gap-2" style={{ marginTop: -8 }}>
          <MintlyFrame size={56} glow={`${T.electric}55`}><Wallet size={22} color={T.electric} /></MintlyFrame>
          <div style={{ fontFamily: displayFont, color: T.ice, fontSize: 17.5, fontWeight: 700, marginTop: 6 }}>{t("connectWalletModalTitle")}</div>
          <div style={{ fontFamily: bodyFont, color: T.muted, fontSize: 14, lineHeight: 1.5 }}>{t("walletRequiredNote")}</div>
        </div>
        <button onClick={() => { onConnect(); onClose(); }} className="fx-tap w-full rounded-[20px] py-3 mt-5" style={{ background: PRISM, color: PRISM_TEXT, fontFamily: displayFont, fontWeight: 700, fontSize: 15 }}>
          {t("connectWalletCta")}
        </button>
      </div>
    </div>
  );
}

/* Small reusable on/off switch used inside settings rows. */
function ToggleSwitch({ on, onChange }) {
  return (
    <button
      onClick={() => onChange(!on)}
      className="fx-tap"
      style={{
        width: 42, height: 24, borderRadius: 999, flexShrink: 0, position: "relative",
        background: on ? PRISM : T.surfaceHi, border: `1px solid ${on ? "transparent" : T.line}`,
        transition: `background ${EASE}, border-color ${EASE}`,
      }}
    >
      <div style={{
        position: "absolute", top: 2, left: on ? 20 : 2, width: 18, height: 18, borderRadius: "50%",
        background: on ? PRISM_TEXT : T.muted, transition: `left ${SPRING}`,
      }} />
    </button>
  );
}

function SettingsRow({ label, sub, children }) {
  return (
    <div className="flex items-center gap-3 py-3" style={{ borderBottom: `1px solid ${T.line}` }}>
      <div className="flex-1">
        <div style={{ fontFamily: bodyFont, fontSize: 14.5, color: T.ice }}>{label}</div>
        {sub && <div style={{ fontFamily: bodyFont, fontSize: 12, color: T.muted, marginTop: 2 }}>{sub}</div>}
      </div>
      {children}
    </div>
  );
}


/* Переписка с поддержкой.

   Раньше «Поддержка» открывала ссылку на чат, которого нет, — человек
   упирался в тупик. Теперь это настоящая переписка: вопрос уходит на
   сервер, тот кладёт его в базу и пересылает команде в Telegram, а ответ
   возвращается сюда же (см. api/support.js и api/_support.js).

   Новые ответы забираем опросом раз в двенадцать секунд, пока окно
   открыто. Постоянное соединение здесь было бы лишним: переписка со
   службой поддержки — не чат, где важна каждая секунда, а держать канал
   ради одного сообщения в неделю дороже, чем изредка спросить. */
/* Частые вопросы.

   Большая часть обращений — одни и те же семь вопросов, и ответ на них
   человеку нужен сейчас, а не через сутки. Поэтому переписка начинается
   не с пустого поля, а со списка: живой ответ остаётся для того, что
   сюда не уложилось.

   Числа здесь не выдуманы, а взяты из кода: цена сундука и смены ника —
   из магазина, порог запуска — из проверки формы, потолок кривой — из
   параметров контракта. Расходиться им нельзя: человек, которому в
   поддержке сказали «1500 TON», будет считать по этому числу. */
const SUPPORT_FAQ = [
  {
    id: "launch",
    q: { RU: "Как запустить свой токен?", EN: "How do I launch a token?" },
    a: {
      RU: `Мемпад → «Запустить токен». Нужен аккаунт и подключённый кошелёк TON. В форме — логотип, название, тикер, описание и сумма первой покупки: минимум $${MIN_LAUNCH_USD} в TON, плюс около ${NETWORK_FEE_TON} TON уйдёт на комиссию сети. Токен появляется в сети сразу после подписи в кошельке.`,
      EN: `Mempad → "Launch token". You need an account and a connected TON wallet. Fill in the logo, name, ticker, description and your first buy: at least $${MIN_LAUNCH_USD} worth of TON, plus about ${NETWORK_FEE_TON} TON for the network fee. The token goes on-chain right after you sign in the wallet.`,
    },
  },
  {
    id: "fees",
    q: { RU: "Какие комиссии?", EN: "What are the fees?" },
    a: {
      RU: "Площадка берёт 1% с каждой покупки и продажи — контракт удерживает его сам. Отдельно платится комиссия сети TON, она идёт валидаторам, а не нам. Запуск токена бесплатный: платишь только за первую покупку и сеть.",
      EN: "The platform takes 1% of every buy and sell — the contract withholds it itself. On top of that there's the TON network fee, which goes to validators, not us. Launching is free: you only pay for your first buy and the network.",
    },
  },
  {
    id: "curve",
    q: { RU: "Почему цена растёт сама?", EN: "Why does the price move on its own?" },
    a: {
      RU: "У каждого токена своя бондинг-кривая — контракт, который сам является второй стороной сделки. Чем больше токенов выкуплено, тем дороже следующий; при продаже — наоборот. Поэтому торговать можно с первой секунды, не дожидаясь, пока кто-то заведёт ликвидность.",
      EN: "Every token gets its own bonding curve — a contract that is itself the counterparty. The more tokens bought, the pricier the next one; selling moves it back. That's why trading works from the first second, with nobody needing to seed liquidity.",
    },
  },
  {
    id: "dex",
    q: { RU: "Когда токен попадёт на биржу?", EN: "When does a token reach an exchange?" },
    a: {
      RU: "Когда в кривой наберётся 1500 TON. После этого торговля внутри приложения заканчивается: собранные TON и оставшийся выпуск уходят на биржу и становятся парой для торговли. На экране токена видно, сколько пути пройдено.",
      EN: "Once the curve collects 1500 TON. Trading inside the app then ends: the collected TON and the remaining supply move to a DEX and become a trading pair. The token screen shows how far along it is.",
    },
  },
  {
    id: "referral",
    q: { RU: "Не засчитался друг по ссылке", EN: "My invite didn't count" },
    a: {
      RU: `Приглашение засчитывается один раз — за нового человека, который завёл аккаунт, перейдя по твоей ссылке. Если у него уже был аккаунт в Mintly или он открыл приложение не по ссылке, монеты не начислятся. За каждого засчитанного — ${REFERRAL_COINS} монет, счётчик в разделе «Приглашения».`,
      EN: `An invite counts once — for a new person who created an account after following your link. If they already had a Mintly account, or opened the app without the link, nothing is credited. Each counted invite is ${REFERRAL_COINS} coins; the counter lives in "Referral".`,
    },
  },
  {
    id: "coins",
    q: { RU: "Что за монеты и где их тратить?", EN: "What are coins for?" },
    a: {
      RU: `Монеты дают за достижения и приглашения. Тратятся в магазине: рамки и карточки профиля, кейс за ${CHEST_PRICE} монет со случайной вещью и смена ника за ${NICKNAME_PRICE}. На токены и TON они не меняются.`,
      EN: `Coins come from achievements and invites. Spend them in the shop: profile frames and cards, a chest for ${CHEST_PRICE} coins with a random item, and a nickname change for ${NICKNAME_PRICE}. They don't convert to tokens or TON.`,
    },
  },
  {
    id: "wallet",
    q: { RU: "Кошелёк не подключается", EN: "The wallet won't connect" },
    a: {
      RU: "Проверь, что кошелёк работает в основной сети TON, а не в тестовой — при несовпадении приложение скажет об этом перед подписью. Помогает и обычное: обновить кошелёк, переоткрыть приложение, отключить и подключить заново в разделе «Кошелёк».",
      EN: "Make sure the wallet is on TON mainnet, not testnet — the app warns about a mismatch before signing. The usual steps help too: update the wallet, reopen the app, disconnect and connect again in \"Wallet\".",
    },
  },
];

/* Одна строка вопроса: нажатие раскрывает ответ. */
function FaqItem({ item, open, onToggle }) {
  return (
    <div style={{ background: T.surfaceHi, border: `1px solid ${T.line}`, borderRadius: 18, overflow: "hidden" }}>
      <button
        onClick={onToggle}
        className="fx-tap w-full flex items-center gap-2"
        style={{ background: "transparent", border: "none", padding: "12px 14px", textAlign: "left" }}
      >
        <span style={{ fontFamily: bodyFont, fontSize: 14.5, color: T.ice, flex: 1 }}>{pickLabel(item.q)}</span>
        <ChevronDown
          size={15} color={T.muted}
          style={{ flexShrink: 0, transform: open ? "rotate(180deg)" : "none", transition: `transform ${EASE}` }}
        />
      </button>
      {open && (
        <div style={{
          fontFamily: bodyFont, fontSize: 13.5, lineHeight: 1.5, color: T.muted,
          padding: "0 14px 13px", animation: "fadeInUp 240ms ease-out both",
        }}>
          {pickLabel(item.a)}
        </div>
      )}
    </div>
  );
}

function SupportChat({ accountCreated, showToast, onRead }) {
  const [messages, setMessages] = useState([]);
  const [loading, setLoading] = useState(true);
  const [draft, setDraft] = useState("");
  const [sending, setSending] = useState(false);
  // Начинаем с частых вопросов, а не с пустого поля: у большинства вопрос
  // из списка, и ответ нужен сейчас.
  const [mode, setMode] = useState("faq");
  const [openQuestion, setOpenQuestion] = useState(null);
  const дно = useRef(null);

  async function load() {
    const { data, error } = await supabase
      .from("support_messages")
      .select("id, body, from_admin, admin_name, created_at")
      .order("created_at", { ascending: true })
      .limit(200);
    if (!error) setMessages(data || []);
    setLoading(false);
  }

  useEffect(() => {
    if (!accountCreated) { setLoading(false); return; }
    load();
    const t = setInterval(load, 12000);
    return () => clearInterval(t);
  }, [accountCreated]);

  /* Прочитанными ответы становятся при входе в переписку, а не при
     открытии окна: окно открывается на списке вопросов, и до самих
     ответов человек может не дойти. Отметь мы их раньше — метка на
     пункте настроек погасла бы, а ответ так и остался бы непрочитанным. */
  useEffect(() => {
    if (mode !== "chat" || !accountCreated) return;
    supabase.rpc("support_mark_seen").then(() => {}, () => {});
    if (onRead) onRead();
  }, [mode, accountCreated]);

  // Показываем последнее сообщение, а не начало переписки: ради него
  // окно и открывают.
  useEffect(() => {
    if (mode !== "chat") return;
    if (дно.current && дно.current.scrollIntoView) дно.current.scrollIntoView({ block: "nearest" });
  }, [messages.length, mode]);

  async function send() {
    const text = draft.trim();
    if (!text || sending) return;
    setSending(true);
    try {
      const { data: { session } } = await supabase.auth.getSession();
      const token = session && session.access_token;
      if (!token) throw new Error("no_session");
      const res = await fetch(апи("/api/support"), {
        method: "POST",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
        body: JSON.stringify({ body: text }),
      });
      const json = await res.json().catch(() => ({}));
      if (!res.ok || !json.ok) {
        const код = json.error;
        // Недоставленный вопрос сервер не сохраняет, поэтому и говорим
        // прямо: не отправилось. Иначе человек ждал бы ответа на то,
        // чего никто не получил.
        if (код === "undelivered") console.warn("[mintly] поддержка недоступна:", json.detail);
        showToast(код === "too_fast" ? t("supportTooFast")
          : код === "too_many" ? t("supportTooMany")
          : код === "too_long" ? t("supportTooLong")
          : код === "undelivered" ? t("supportUndelivered")
          : t("supportFailed"));
        return;
      }
      setDraft("");
      // Своё сообщение подставляем сразу, не дожидаясь опроса: пауза в
      // двенадцать секунд читается как «не отправилось».
      if (json.message) setMessages((prev) => [...prev, json.message]);
      else load();
      haptic("light");
    } catch (err) {
      showToast(t("supportFailed"));
    } finally {
      setSending(false);
    }
  }

  if (!accountCreated) {
    return (
      <p style={{ fontFamily: bodyFont, color: T.muted, fontSize: 14, lineHeight: 1.5, textAlign: "center", marginTop: 6 }}>
        {t("supportNeedAccount")}
      </p>
    );
  }

  if (mode === "faq") {
    return (
      <div className="fx-swap flex flex-col">
        <p style={{ fontFamily: bodyFont, color: T.muted, fontSize: 13, lineHeight: 1.5, textAlign: "center" }}>
          {t("supportFaqLead")}
        </p>
        <div className="flex flex-col gap-2" style={{ marginTop: 14 }}>
          {SUPPORT_FAQ.map((item) => (
            <FaqItem
              key={item.id}
              item={item}
              open={openQuestion === item.id}
              // Открыт всегда один: раскрытые разом ответы превращают
              // список в простыню, по которой уже не найти свой вопрос.
              onToggle={() => setOpenQuestion(openQuestion === item.id ? null : item.id)}
            />
          ))}
        </div>
        <button
          onClick={() => setMode("chat")}
          className="fx-tap w-full flex items-center justify-center gap-2 rounded-[20px] py-3"
          style={{ marginTop: 14, background: PRISM, color: PRISM_TEXT, fontFamily: displayFont, fontWeight: 700, fontSize: 15 }}
        >
          <Send size={14} /> {t("supportOther")}
        </button>
      </div>
    );
  }

  return (
    <div className="fx-swap flex flex-col">
      <button
        onClick={() => setMode("faq")}
        className="fx-tap flex items-center gap-1"
        style={{ background: "transparent", border: "none", fontFamily: bodyFont, fontSize: 13, color: T.muted, alignSelf: "flex-start" }}
      >
        <ChevronLeft size={13} color={T.muted} /> {t("supportBackToFaq")}
      </button>
      <p style={{ fontFamily: bodyFont, color: T.muted, fontSize: 13, lineHeight: 1.5, textAlign: "center", marginTop: 8 }}>
        {t("supportDesc")}
      </p>

      <div className="flex flex-col gap-2" style={{ marginTop: 14, minHeight: 120 }}>
        {loading && !messages.length && (
          <div style={{ fontFamily: bodyFont, color: T.muted, fontSize: 13, textAlign: "center", padding: "18px 0" }}>…</div>
        )}
        {!loading && !messages.length && (
          <div style={{ fontFamily: bodyFont, color: T.muted, fontSize: 13, textAlign: "center", padding: "18px 0", lineHeight: 1.5 }}>
            {t("supportEmpty")}
          </div>
        )}
        {messages.map((m) => {
          const свой = !m.from_admin;
          return (
            <div key={m.id} style={{ alignSelf: свой ? "flex-end" : "flex-start", maxWidth: "86%" }}>
              <div style={{
                fontFamily: bodyFont, fontSize: 11.5, color: T.muted,
                textAlign: свой ? "right" : "left", marginBottom: 3,
              }}>
                {свой ? t("supportYou") : (m.admin_name || t("supportTeam"))}
              </div>
              <div style={{
                fontFamily: bodyFont, fontSize: 14, lineHeight: 1.45,
                color: свой ? PRISM_TEXT : T.ice,
                background: свой ? PRISM : T.surfaceHi,
                border: свой ? "none" : `1px solid ${T.line}`,
                borderRadius: 18,
                // Угол со стороны своего автора срезан меньше — так с
                // одного взгляда видно, кто говорит, даже без подписи.
                borderBottomRightRadius: свой ? 6 : 18,
                borderBottomLeftRadius: свой ? 18 : 6,
                padding: "9px 13px", whiteSpace: "pre-wrap", wordBreak: "break-word",
              }}>
                {m.body}
              </div>
            </div>
          );
        })}
        <div ref={дно} />
      </div>

      {/* Поле ввода липнет к низу окна: переписка растёт вверх, а писать
          человек хочет не прокручивая. */}
      <div style={{
        position: "sticky", bottom: 0, marginTop: 12, paddingTop: 10, paddingBottom: 2,
        background: T.surface,
      }}>
        <div className="flex items-end gap-2">
          <textarea
            value={draft}
            onChange={(e) => setDraft(e.target.value.slice(0, 2000))}
            placeholder={t("supportPlaceholder")}
            rows={2}
            style={{
              flex: 1, minWidth: 0, resize: "none",
              fontFamily: bodyFont, fontSize: 16, lineHeight: 1.4, color: T.ice,
              background: T.bg, border: `1px solid ${T.line}`, borderRadius: 18,
              padding: "10px 13px", outline: "none",
            }}
          />
          <button
            onClick={send}
            disabled={!draft.trim() || sending}
            className={`fx-tap flex items-center justify-center${sending ? " fx-busy" : ""}`}
            style={{
              width: 46, height: 46, borderRadius: "50%", flexShrink: 0,
              background: draft.trim() && !sending ? PRISM : T.surfaceHi,
              border: draft.trim() && !sending ? "none" : `1px solid ${T.line}`,
            }}
          >
            <Send size={16} color={draft.trim() && !sending ? PRISM_TEXT : T.muted} />
          </button>
        </div>
      </div>
    </div>
  );
}

/* SettingsPanel — a lightweight bottom-sheet used so every row under
   "Settings" actually opens real, distinct content instead of the
   same placeholder for every item. */
/* Доля с комиссий приглашённых.

   За друга и раньше давали монеты — разово, за сам факт регистрации.
   Приводить того, кто торгует, это не мотивировало никак: привёл и
   забыл. Теперь с оборота друзей капает дальше.

   Чем это не является — сказано прямо в подписи: TON никуда не
   переводится. Комиссию удерживает контракт кривой и отправляет на
   кошелёк площадки ещё в цепочке, поделить её там между людьми нельзя.
   Поэтому доля идёт монетами, и обещать «процент с комиссий в TON» я
   не стал. */
function ReferralShare({ showToast }) {
  const [state, setState] = useState(null);
  const [busy, setBusy] = useState(false);

  const load = useCallback(async () => {
    // Тот же вызов и считает, и начисляет: спрашивать «сколько там» и
    // забирать отдельными кнопками незачем — забрать всё равно захотят.
    const { data, error } = await supabase.rpc("referral_claim");
    if (!error && data && data.ok) setState(data);
  }, []);

  useEffect(() => { load(); }, [load]);

  async function claim() {
    if (busy) return;
    setBusy(true);
    const { data, error } = await supabase.rpc("referral_claim");
    setBusy(false);
    if (error || !data || !data.ok) { showToast(t("saveFailed")); return; }
    setState(data);
    if (data.coins > 0) { haptic("success"); showToast(tf("refPayoutGot", { n: data.coins })); }
  }

  if (!state) return null;
  const оборот = Number(state.volume) || 0;

  return (
    <div className="mt-2 rounded-[20px] px-3.5 py-3" style={{ background: T.surfaceHi, border: `1px solid ${T.line}` }}>
      <div className="flex items-center justify-between">
        <span style={{ fontFamily: bodyFont, color: T.muted, fontSize: 14 }}>{t("refVolume")}</span>
        <span style={{ fontFamily: monoFont, color: T.ice, fontSize: 15, fontWeight: 700 }}>{fmtTon(оборот)} TON</span>
      </div>
      <p style={{ fontFamily: bodyFont, color: T.muted, fontSize: 12, lineHeight: 1.45, marginTop: 6 }}>
        {t("refShareNote")}
      </p>
      <button
        onClick={claim}
        disabled={busy}
        className={`fx-tap w-full flex items-center justify-center gap-1.5 rounded-[16px] py-2.5 mt-2${busy ? " fx-busy" : ""}`}
        style={{ background: T.surface, border: `1px solid ${hexA(T.electric, 0.4)}`, fontFamily: displayFont, fontWeight: 700, fontSize: 13.5, color: T.electric }}
      >
        <CoinIcon size={14} /> {t("refPayoutCta")}
      </button>
    </div>
  );
}

function SettingsPanel({
  item: itemProp, onClose, appSettings, onUpdateSetting,
  profile, showToast,
  onTogglePin, onChangePin, insetBottom = 0, insetTop = 0,
  accountCreated, onDeleteAccount, userId, inviteCount = 0, onSupportRead,
  notifyPrefs = { buys: true, minTon: 0.05, progress: true }, onUpdateNotify,
}) {
  const [deleteConfirmOpen, setDeleteConfirmOpen] = useState(false);
  const [deleting, setDeleting] = useState(false);
  // Окно держится на экране, пока идёт анимация ухода, поэтому и
  // содержимое берём последнее — иначе на кадр уходило бы пустое.
  const [item, closing] = useClosing(itemProp);

  if (!item) return null;
  const Icon = item.icon;

  async function confirmDeleteAccount() {
    setDeleting(true);
    await onDeleteAccount();
    setDeleting(false);
    setDeleteConfirmOpen(false);
    onClose();
  }
  const refLink = referralLink(userId);
  function copyReferral() {
    if (!refLink) return;
    if (typeof navigator !== "undefined" && navigator.clipboard) navigator.clipboard.writeText(refLink).catch(() => {});
    showToast(t("refCodeCopied"));
  }
  // Внутри Telegram открываем родной экран «переслать», снаружи — обычную
  // вкладку с тем же адресом.
  function shareReferral() {
    if (!refLink || typeof window === "undefined") return;
    const url = `https://t.me/share/url?url=${encodeURIComponent(refLink)}&text=${encodeURIComponent(t("refShareText"))}`;
    const wa = window.Telegram && window.Telegram.WebApp;
    if (wa && wa.openTelegramLink) wa.openTelegramLink(url);
    else window.open(url, "_blank", "noopener,noreferrer");
  }

  let body = null;
  switch (item.key) {
    case "security":
      body = (
        <div className="mt-2">
          <SettingsRow label={t("pinRow")} sub={t("pinRowSub")}>
            <ToggleSwitch on={appSettings.pinEnabled} onChange={onTogglePin} />
          </SettingsRow>
          <button
            onClick={() => { if (appSettings.pinEnabled) onChangePin(); else showToast(t("enablePinFirst")); }}
            className="fx-tap w-full flex items-center justify-center gap-2 rounded-[20px] py-3 mt-3"
            style={{ background: T.surfaceHi, border: `1px solid ${T.line}`, fontFamily: bodyFont, fontSize: 14.5, color: appSettings.pinEnabled ? T.ice : T.muted, opacity: appSettings.pinEnabled ? 1 : 0.55 }}
          >
            <Lock size={14} color={T.muted} /> {t("changePinCta")}
          </button>
          {/* Удаление аккаунта переехало сюда из «Профиля»: пункт с
              одной кнопкой «Редактировать» дублировал такую же кнопку на
              самом экране профиля, а удаление по смыслу и так о
              безопасности. */}
          {accountCreated && (
            <button
              onClick={() => setDeleteConfirmOpen(true)}
              className="fx-tap w-full flex items-center justify-center gap-2 rounded-[20px] py-3 mt-3"
              style={{ background: "transparent", border: `1px solid rgba(255,77,77,0.35)`, fontFamily: displayFont, fontWeight: 700, fontSize: 14.5, color: T.down }}
            >
              <ShieldAlert size={15} /> {t("deleteAccountForever")}
            </button>
          )}
          {deleteConfirmOpen && (
            <div className="fx-modal-back" style={{ position: "fixed", inset: 0, zIndex: 80, background: "rgba(0,0,0,0.8)", backdropFilter: "blur(4px)", display: "flex", alignItems: "center", justifyContent: "center", padding: "calc(24px + var(--tg-inset-top, 0px)) 24px calc(24px + var(--tg-inset-bottom, 0px))", overflowY: "auto" }} onClick={() => !deleting && setDeleteConfirmOpen(false)}>
              <div className="fx-modal-card" onClick={(e) => e.stopPropagation()} style={{ width: "100%", maxWidth: 340, background: T.surface, border: `1px solid ${T.lineHi}`, borderRadius: 20, padding: 22 }}>
                <div className="flex items-center gap-2" style={{ marginBottom: 10 }}>
                  <ShieldAlert size={18} color={T.down} />
                  <span style={{ fontFamily: displayFont, color: T.ice, fontSize: 17.5, fontWeight: 700 }}>{t("deleteAccountQ")}</span>
                </div>
                <p style={{ fontFamily: bodyFont, color: T.muted, fontSize: 14, lineHeight: 1.5, marginBottom: 18 }}>
                  {t("deleteAccountBody")}
                </p>
                <div className="flex items-center gap-2">
                  <button onClick={() => setDeleteConfirmOpen(false)} disabled={deleting} className="fx-tap flex-1 rounded-[20px] py-2.5" style={{ background: T.surfaceHi, border: `1px solid ${T.line}`, fontFamily: bodyFont, fontSize: 14.5, color: T.ice, opacity: deleting ? 0.6 : 1 }}>
                    {t("cancel")}
                  </button>
                  <button onClick={confirmDeleteAccount} disabled={deleting} className="fx-tap flex-1 rounded-[20px] py-2.5" style={{ background: T.down, border: "none", fontFamily: displayFont, fontWeight: 700, fontSize: 14.5, color: "#1a0000", opacity: deleting ? 0.6 : 1 }}>
                    {deleting ? t("deletingText") : t("deleteShort")}
                  </button>
                </div>
              </div>
            </div>
          )}
        </div>
      );
      break;
    case "notify":
      body = (
        <>
          <p style={{ fontFamily: bodyFont, color: T.muted, fontSize: 14, lineHeight: 1.5, textAlign: "center" }}>
            {t("notifyDesc")}
          </p>
          <div className="mt-2">
            <SettingsRow label={t("notifyBuys")} sub={t("notifyBuysSub")}>
              <ToggleSwitch on={notifyPrefs.buys} onChange={(v) => onUpdateNotify && onUpdateNotify({ buys: v })} />
            </SettingsRow>
            <SettingsRow label={t("notifyProgress")} sub={t("notifyProgressSub")}>
              <ToggleSwitch on={notifyPrefs.progress} onChange={(v) => onUpdateNotify && onUpdateNotify({ progress: v })} />
            </SettingsRow>
          </div>

          {/* Порог показываем только когда покупки вообще включены:
              иначе это настройка ни к чему. */}
          {notifyPrefs.buys && (
            <div className="mt-3">
              <div style={{ fontFamily: bodyFont, fontSize: 14.5, color: T.ice }}>{t("notifyMin")}</div>
              <div style={{ fontFamily: bodyFont, fontSize: 12, color: T.muted, marginTop: 2 }}>{t("notifyMinSub")}</div>
              <div className="flex flex-wrap gap-2 mt-2.5">
                {NOTIFY_THRESHOLDS.map((v) => {
                  const active = Math.abs(Number(notifyPrefs.minTon) - v) < 0.0005;
                  return (
                    <button
                      key={v}
                      onClick={() => onUpdateNotify && onUpdateNotify({ minTon: v })}
                      className="fx-tap fx-chip rounded-full px-3.5 py-2"
                      style={{
                        fontFamily: monoFont, fontSize: 13, fontWeight: 700,
                        background: active ? T.ice : "transparent",
                        color: active ? T.bg : T.muted,
                        border: `1px solid ${active ? T.ice : T.line}`,
                      }}
                    >
                      {v} TON
                    </button>
                  );
                })}
              </div>
            </div>
          )}

          <p style={{ fontFamily: bodyFont, color: T.muted, fontSize: 12, lineHeight: 1.5, marginTop: 14, textAlign: "center" }}>
            {t("notifyNeedBot")}
          </p>
        </>
      );
      break;
    case "language":
      body = (
        <div className="flex flex-col gap-2 mt-2">
          {["RU", "EN"].map((lng) => (
            <button key={lng} onClick={() => onUpdateSetting("language", lng)} className="fx-tap w-full flex items-center justify-between rounded-[20px] py-3 px-3.5" style={{ background: T.surfaceHi, border: `1px solid ${appSettings.language === lng ? T.turquoise : T.line}` }}>
              <span style={{ fontFamily: bodyFont, fontSize: 14.5, color: T.ice }}>{lng === "RU" ? "Русский" : "English"}</span>
              {appSettings.language === lng && <CheckCircle2 size={16} color={T.turquoise} />}
            </button>
          ))}
          <p style={{ fontFamily: bodyFont, color: T.muted, fontSize: 12, lineHeight: 1.5, marginTop: 2 }}>{t("langFullNote")}</p>
        </div>
      );
      break;
    case "referral":
      body = (
        <>
          <p style={{ fontFamily: bodyFont, color: T.muted, fontSize: 14, lineHeight: 1.5, textAlign: "center" }}>
            {t("referralDesc")}
          </p>
          {/* Цена приглашения стоит первой строкой: ради неё сюда и
              заходят, а счёт приглашённых без неё — просто число. */}
          <div className="flex items-center justify-between mt-3 rounded-[20px] px-3.5 py-3" style={{ background: T.surfaceHi, border: `1px solid ${hexA(T.electric, 0.35)}` }}>
            <span style={{ fontFamily: bodyFont, color: T.muted, fontSize: 14 }}>{t("refPerFriend")}</span>
            <span className="flex items-center gap-1.5" style={{ fontFamily: displayFont, color: T.electric, fontSize: 17.5, fontWeight: 700 }}>
              <CoinIcon size={16} /> {REFERRAL_COINS}
            </span>
          </div>
          <div className="flex items-center justify-between mt-2 rounded-[20px] px-3.5 py-3" style={{ background: T.surfaceHi, border: `1px solid ${T.line}` }}>
            <span style={{ fontFamily: bodyFont, color: T.muted, fontSize: 14 }}>{t("refInvited")}</span>
            <span style={{ fontFamily: displayFont, color: T.turquoise, fontSize: 17.5, fontWeight: 700 }}>{inviteCount}</span>
          </div>
          <div className="flex items-center justify-between mt-2 rounded-[20px] px-3.5 py-3" style={{ background: T.surfaceHi, border: `1px solid ${T.line}` }}>
            <span style={{ fontFamily: bodyFont, color: T.muted, fontSize: 14 }}>{t("refEarned")}</span>
            <span className="flex items-center gap-1.5" style={{ fontFamily: displayFont, color: T.ice, fontSize: 17.5, fontWeight: 700 }}>
              <CoinIcon size={16} /> {coinsFromInvites(inviteCount)}
            </span>
          </div>
          {/* Доля с комиссий друзей. Стоит после счёта приглашённых:
              сперва человек видит, сколько привёл, потом — что с этого
              капает дальше. */}
          <ReferralShare showToast={showToast} />

          <div className="flex items-center gap-2 mt-2 rounded-[20px] px-3 py-2.5" style={{ background: T.surfaceHi, border: `1px solid ${T.line}` }}>
            <span style={{ fontFamily: monoFont, color: T.ice, fontSize: 12.5, flex: 1, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{refLink || "—"}</span>
            <button onClick={copyReferral} className="fx-tap" disabled={!refLink}><Copy size={14} color={T.muted} /></button>
          </div>
          {refLink && (
            <button onClick={shareReferral} className="fx-tap w-full flex items-center justify-center gap-2 rounded-[20px] py-3 mt-3" style={{ background: PRISM, color: PRISM_TEXT, fontFamily: displayFont, fontWeight: 700, fontSize: 15 }}>
              <Send size={14} /> {t("refShare")}
            </button>
          )}
        </>
      );
      break;
    case "support":
      body = <SupportChat accountCreated={accountCreated} showToast={showToast} onRead={onSupportRead} />;
      break;
    case "architecture":
      /* Разделами, а не сплошным текстом: человек читает то, что его
         сейчас волнует, — комиссию или то, у кого ключ, — и не ищет это
         в абзаце на страницу. */
      body = (
        <div className="flex flex-col" style={{ gap: 10, marginTop: 4 }}>
          <p style={{ fontFamily: bodyFont, color: T.muted, fontSize: 14, lineHeight: 1.6 }}>{t("archLead")}</p>
          {[
            ["archCurveTitle", "archCurveBody"],
            ["archSupplyTitle", "archSupplyBody"],
            ["archFeeTitle", "archFeeBody"],
            ["archKeysTitle", "archKeysBody"],
            ["archDataTitle", "archDataBody"],
          ].map(([заголовок, текст], i) => (
            <div
              key={заголовок}
              className="fx-card rounded-[18px]"
              style={{ background: T.surfaceHi, border: `1px solid ${T.line}`, padding: "13px 15px", animationDelay: `${i * 45}ms` }}
            >
              <div style={{ fontFamily: displayFont, color: T.ice, fontSize: 14.5, fontWeight: 700 }}>{t(заголовок)}</div>
              <p style={{ fontFamily: bodyFont, color: T.muted, fontSize: 13.5, lineHeight: 1.6, marginTop: 6 }}>{t(текст)}</p>
            </div>
          ))}
        </div>
      );
      break;
    case "privacy":
      body = <p style={{ fontFamily: bodyFont, color: T.muted, fontSize: 14, lineHeight: 1.6, marginTop: 4 }}>{t("privacyText")}</p>;
      break;
    default:
      body = null;
  }

  return (
    <div className={`fx-modal-back${closing ? " fx-out" : ""}`} style={{ position: "absolute", inset: 0, zIndex: 60, background: "rgba(0,0,0,0.75)", backdropFilter: "blur(4px)", display: "flex", alignItems: "flex-end", justifyContent: "center", padding: `0 12px ${insetBottom + 14}px` }} onClick={onClose}>
      <div
        className="fx-modal-card"
        onClick={(e) => e.stopPropagation()}
        style={{
          width: "100%", maxWidth: 440, background: T.surface, border: `1px solid ${T.lineHi}`, borderRadius: 26,
          // Считаем от окна приложения, а не от vh: внутри Telegram высота
          // окна меньше высоты браузерного экрана, и 88vh вылезали за край.
          maxHeight: `calc(100% - ${insetTop + 14}px)`, minHeight: 0, display: "flex", flexDirection: "column", overflow: "hidden",
          boxShadow: "0 -16px 44px rgba(0,0,0,0.45)",
        }}
      >
        <div style={{ display: "flex", justifyContent: "center", paddingTop: 10, flexShrink: 0 }}>
          <div style={{ width: 36, height: 4, borderRadius: 2, background: T.line }} />
        </div>
        <div style={{ padding: "4px 22px 0", flexShrink: 0 }}>
          <div className="flex justify-end"><button onClick={onClose} className="fx-tap fx-close"><X size={16} color={T.muted} /></button></div>
          <div className="flex flex-col items-center text-center gap-2" style={{ marginTop: -8 }}>
            <MintlyFrame size={52} glow={`${T.electric}44`}><Icon size={20} color={T.electric} /></MintlyFrame>
            <div style={{ fontFamily: displayFont, color: T.ice, fontSize: 17.5, fontWeight: 700, marginTop: 6 }}>{t(item.tKey)}</div>
          </div>
        </div>
        <div className="no-scrollbar" style={{ padding: "0 22px", paddingBottom: 22, overflowY: "auto", flex: 1, minHeight: 0 }}>
          {body}
        </div>
      </div>
    </div>
  );
}

/* TokenManageSheet — the "Manage" action on a token you created:
   surfaces real controls (copy link, verify, edit info) rather than
   a dead button. */
function TokenManageSheet({ token: tokenProp, onClose, showToast, onDelete }) {
  const [confirmingDelete, setConfirmingDelete] = useState(false);
  const [token, closing] = useClosing(tokenProp);
  useEffect(() => { if (token) setConfirmingDelete(false); }, [token]);
  if (!token) return null;
  function copyLink() {
    const url = `https://mintly.app/token/${token.id}`;
    if (typeof navigator !== "undefined" && navigator.clipboard) navigator.clipboard.writeText(url).catch(() => {});
    showToast(t("tokenLinkCopied"));
  }
  return (
    <div className={`fx-modal-back${closing ? " fx-out" : ""}`} style={{ ...SHEET_BACK, zIndex: 60 }} onClick={onClose}>
      <div className="fx-modal-card" onClick={(e) => e.stopPropagation()} style={sheetCard(22)}>
        <div className="flex justify-end"><button onClick={onClose} className="fx-tap fx-close"><X size={16} color={T.muted} /></button></div>
        <div className="flex items-center gap-3" style={{ marginTop: -8, marginBottom: 14 }}>
          <TokenAvatar size={44} src={token.logoUrl} />
          <div>
            <div style={{ fontFamily: displayFont, color: T.ice, fontSize: 16, fontWeight: 700 }}>{token.name}</div>
            <div style={{ fontFamily: monoFont, color: T.muted, fontSize: 12 }}>${token.ticker}</div>
          </div>
        </div>
        <div className="flex flex-col gap-2">
          <button onClick={copyLink} className="fx-tap w-full flex items-center gap-2 rounded-[20px] py-3 px-3.5" style={{ background: T.surfaceHi, border: `1px solid ${T.line}` }}>
            <Copy size={15} color={T.muted} /><span style={{ fontFamily: bodyFont, fontSize: 14.5, color: T.ice }}>{t("copyLink")}</span>
          </button>
          {/* Список приходит из базы и содержит только свои токены,
             поэтому удаление здесь безопасно. */}
          {onDelete && (
            confirmingDelete ? (
              <div className="flex gap-2">
                <button
                  onClick={() => { onDelete(token.id); setConfirmingDelete(false); onClose(); }}
                  className="fx-tap flex-1 flex items-center justify-center gap-2 rounded-[20px] py-3 px-3.5"
                  style={{ background: hexA(T.down, 0.14), border: `1px solid ${hexA(T.down, 0.4)}` }}
                >
                  <span style={{ fontFamily: bodyFont, fontSize: 14.5, color: T.down, fontWeight: 600 }}>{t("confirmDelete")}</span>
                </button>
                <button
                  onClick={() => setConfirmingDelete(false)}
                  className="fx-tap flex-1 flex items-center justify-center gap-2 rounded-[20px] py-3 px-3.5"
                  style={{ background: T.surfaceHi, border: `1px solid ${T.line}` }}
                >
                  <span style={{ fontFamily: bodyFont, fontSize: 14.5, color: T.muted }}>{t("cancel")}</span>
                </button>
              </div>
            ) : (
              <button
                onClick={() => setConfirmingDelete(true)}
                className="fx-tap w-full flex items-center gap-2 rounded-[20px] py-3 px-3.5"
                style={{ background: "transparent", border: `1px solid ${hexA(T.down, 0.35)}` }}
              >
                <Trash2 size={15} color={T.down} /><span style={{ fontFamily: bodyFont, fontSize: 14.5, color: T.down }}>{t("deleteToken")}</span>
              </button>
            )
          )}
        </div>
      </div>
    </div>
  );
}

/* Fallback identicon pool: when no avatar is uploaded, every profile still
   gets a face — a random emoji picked once at account-creation time and
   stored on the profile (not re-rolled on every render). */
const PROFILE_EMOJI_POOL = ["😎", "🦊", "🐼", "🐸", "🐵", "🦁", "🐯", "🐨", "🐙", "🦄", "🐳", "🦉", "🐺", "🐲", "🤖", "👾", "🎃", "🧊", "🌟", "🔥"];
function randomProfileEmoji() { return PROFILE_EMOJI_POOL[Math.floor(Math.random() * PROFILE_EMOJI_POOL.length)]; }

/* Nickname rule: Latin letters, numbers, underscore and dot only, 2–20
   chars, must start with a letter — keeps profile URLs / mentions safe. */
const NICKNAME_RE = /^[A-Za-z][A-Za-z0-9_.]{1,19}$/;

/* ---------------------------------------------------------
   ВХОД ЧЕРЕЗ TELEGRAM
   Мини-приложение получает от Telegram строку initData, подписанную
   ключом бота. Проверить подпись можно только зная токен бота, поэтому
   она уходит на сервер (api/telegram-auth.js), а оттуда возвращается
   одноразовый токен, которым открывается обычная сессия Supabase.
   Ни почта, ни пароль у человека не спрашиваются.
--------------------------------------------------------- */

function telegramInitData() {
  if (typeof window === "undefined") return null;
  const data = window.Telegram && window.Telegram.WebApp && window.Telegram.WebApp.initData;
  return data && data.length ? data : null;
}

function telegramUser() {
  if (typeof window === "undefined") return null;
  const wa = window.Telegram && window.Telegram.WebApp;
  return (wa && wa.initDataUnsafe && wa.initDataUnsafe.user) || null;
}

/* Токены, которые создались в сети, но не записались в базу.
 *
 * Контракт уже развёрнут и деньги потрачены — потерять такой токен
 * из-за одной неудачной записи нельзя. Складываем его в телефон и
 * дописываем в базу при следующем запуске приложения, когда сессия
 * наверняка живая. */
const LOST_TOKENS_KEY = "mintly_lost_tokens";

function сохранитьПотерянный(строка) {
  try {
    const было = JSON.parse(localStorage.getItem(LOST_TOKENS_KEY) || "[]");
    if (было.some((t) => t && t.address === строка.address)) return;
    localStorage.setItem(LOST_TOKENS_KEY, JSON.stringify([...было, строка].slice(-10)));
  } catch (e) { /* localStorage недоступен */ }
}

function потерянныеТокены() {
  try { return JSON.parse(localStorage.getItem(LOST_TOKENS_KEY) || "[]") || []; }
  catch (e) { return []; }
}

function забытьПотерянный(address) {
  try {
    const было = потерянныеТокены().filter((t) => t && t.address !== address);
    localStorage.setItem(LOST_TOKENS_KEY, JSON.stringify(было));
  } catch (e) { /* localStorage недоступен */ }
}

// Ссылка приглашения. Имя бота и мини-приложения знает только тот, кто
// заводил бота, поэтому берём их из переменных окружения сборки. Если их
// не задали — показываем хотя бы сам код, чтобы экран не был пустым.
const TG_BOT = String(import.meta.env.VITE_TG_BOT || "MintlyAppbot").replace(/^@/, "").trim();
const TG_APP = String(import.meta.env.VITE_TG_APP || "Mintly").trim();
function referralCode(userId) { return userId ? "ref_" + userId : ""; }
/* Ссылка приглашения ведёт в чат с ботом, а не сразу в приложение.
   Прямая ссылка (t.me/бот/приложение?startapp=…) короче и красивее, но
   работает только пока у мини-приложения задано короткое имя в BotFather:
   стоит имени не совпасть — Telegram молча открывает просто бота и метку
   не передаёт никому, а приглашение теряется без единого признака ошибки.
   Через бота надёжнее: метку он получает всегда, кладёт её себе и сам
   открывает приложение кнопкой. */
function referralLink(userId) {
  const code = referralCode(userId);
  if (!code) return "";
  if (!TG_BOT) return code;
  return `https://t.me/${TG_BOT}?start=${code}`;
}

/* Вышел ли человек из аккаунта сам. Внутри Telegram подпись initData
   лежит в окне всегда, поэтому приложение умеет входить молча при
   запуске — и после «Выйти» тут же заводило сессию заново: обновил
   страницу и снова внутри. Отметка о добровольном выходе живёт в
   телефоне и снимается только при новом входе руками. */
const SIGNED_OUT_KEY = "mintly_signed_out";
function isSignedOutByHand() {
  try { return localStorage.getItem(SIGNED_OUT_KEY) === "1"; } catch (e) { return false; }
}
function markSignedOut(on) {
  try {
    if (on) localStorage.setItem(SIGNED_OUT_KEY, "1");
    else localStorage.removeItem(SIGNED_OUT_KEY);
  } catch (e) { /* приватный режим — тогда просто не запомним */ }
}

/* Одной отметки о выходе мало. Она пишется в момент нажатия, а до этого
   выход мог случиться на прошлой версии приложения или в тот раз, когда
   память телефона не приняла запись, — тогда отметки нет, и молчаливый
   вход снова затаскивает внутрь. Поэтому вторая отметка: «на этом
   телефоне вход уже был». Молча входим только пока её нет, то есть
   ровно один раз — при первом знакомстве. Дальше сессия живёт сама, а
   если она пропала, значит человек вышел или её срок истёк, и правильно
   показать кнопку входа, а не заводить сессию за него. */
const SEEN_SESSION_KEY = "mintly_seen_session";
function hasSeenSession() {
  try { return localStorage.getItem(SEEN_SESSION_KEY) === "1"; } catch (e) { return false; }
}
function markSeenSession() {
  try { localStorage.setItem(SEEN_SESSION_KEY, "1"); } catch (e) { /* см. выше */ }
}

/* Принимает ли телефон записи вообще. Если нет — молчаливый вход
   выключаем совсем: обе отметки выше не сохранятся, и выйти станет
   физически невозможно, сколько ни нажимай. */
function storageWorks() {
  try {
    localStorage.setItem("mintly_probe", "1");
    localStorage.removeItem("mintly_probe");
    return true;
  } catch (e) { return false; }
}

/* Заводится ли аккаунт впервые. Спрашиваем до входа: если профиля ещё
   нет, на экране появляется поле ника, и человек выбирает имя сам, а не
   получает выдуманное из профиля Telegram. Сервер на этот вызов ничего
   не создаёт и не меняет — только смотрит и предлагает свободный ник. */
async function probeTelegramAccount() {
  const initData = telegramInitData();
  if (!initData) throw new Error("no_telegram");
  const res = await fetch(апи("/api/telegram-auth"), {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ initData, probe: true }),
  });
  const json = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(json.error || `probe_failed_${res.status}`);
  return { exists: !!json.exists, nickname: json.nickname || "" };
}

/* Кто пригласил. Telegram кладёт сюда то, что стояло после startapp= в
   ссылке приглашения. Значение только передаём — доверять ему нельзя,
   сервер сам проверит, что такой пользователь есть, что это не сам
   приглашённый, и запишет связь единожды. */
function telegramStartParam() {
  const tg = typeof window !== "undefined" ? window.Telegram && window.Telegram.WebApp : null;
  return (tg && tg.initDataUnsafe && tg.initDataUnsafe.start_param) || "";
}

/* Засчитать приглашение тому, кто уже вошёл. Метку из ссылки отправлял
   только вход, поэтому человек с готовой сессией переходил по чужой
   ссылке впустую: входить ему незачем, а больше её никто не отправлял.
   Ошибки глотаем — это фоновое дело, мешать открытию приложения ему
   нечем. */
async function linkReferralIfAny() {
  const initData = telegramInitData();
  const startParam = telegramStartParam();
  if (!initData || !startParam.startsWith("ref_")) return;
  try {
    await fetch(апи("/api/telegram-auth"), {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ initData, startParam, linkReferralOnly: true }),
    });
  } catch (err) {
    console.warn("[mintly] referral link failed:", err && err.message);
  }
}

// Бросает ошибку с понятным кодом — вызывающая сторона показывает текст.
async function signInWithTelegram(nickname) {
  const initData = telegramInitData();
  if (!initData) throw new Error("no_telegram");

  const startParam = telegramStartParam();

  const res = await fetch(апи("/api/telegram-auth"), {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ initData, startParam, nickname: nickname || undefined }),
  });
  const json = await res.json().catch(() => ({}));
  if (!res.ok) {
    // Консоли внутри Telegram нет, поэтому текст ошибки сервера едет
    // вместе с кодом — иначе непонятно, на каком шаге всё встало.
    const err = new Error(json.error || `auth_failed_${res.status}`);
    err.detail = json.detail || "";
    throw err;
  }

  // Отметки снимаем до обмена токена, а не после: обмен сам поднимает
  // событие о входе, и обработчик события читает их сразу же. Сними мы
  // их следом — событие успело бы увидеть «человек вышел» и не загрузить
  // профиль. Если обмен не удастся, сессии всё равно не будет.
  markSignedOut(false);
  markSeenSession();
  const { error } = await supabase.auth.verifyOtp({ token_hash: json.token_hash, type: "magiclink" });
  if (error) throw error;
}

/* AuthModal — replaces the old single-button flow. Handles three modes:
   "login"  — email + password, signs in against real Supabase auth
   "create" — nickname + email + password (+ optional avatar/bio), signs up
   "edit"   — profile fields only, no password, updates the existing row
   When not in "edit" mode, a segmented tab lets the user flip between
   login/create without closing the sheet — that's the "красивое меню". */
/* Выбор рамки и карточки из купленных. Стоит в «Редактировать профиль»
   и больше нигде: в магазине плитка отвечала сразу за покупку и за
   примерку, и одно нажатие делало то одно, то другое. */
function LookPicker({ cosmetics, owned, onEquip, focus }) {
  // Из магазина сюда приходят с уже выбранным видом вещи: нажали на
  // карточку — открылась вкладка карточек, а не рамок.
  const [tab, setTab] = useState(focus === "card" ? "card" : "frame");
  const блок = useRef(null);
  useEffect(() => {
    if (!focus) return;
    setTab(focus === "card" ? "card" : "frame");
    // Окно редактирования длинное, и примерка внизу: без подводки
    // человек попадал бы на аватарку и ник, а пришёл он не за ними.
    const id = setTimeout(() => {
      if (блок.current && блок.current.scrollIntoView) блок.current.scrollIntoView({ block: "center", behavior: "smooth" });
    }, 220);
    return () => clearTimeout(id);
  }, [focus]);
  const все = tab === "frame" ? AVATAR_FRAMES : PROFILE_CARDS;
  // Бесплатное доступно всегда — им же и снимают надетое.
  const мои = все.filter((it) => !(it.price > 0) || (owned && owned.has(ownedKey(tab, it.id))));
  const надето = cosmetics[tab] || "none";

  return (
    <div className="mt-4" ref={блок}>
      <div className="flex items-center justify-between" style={{ marginBottom: 8 }}>
        <span style={{ fontFamily: displayFont, color: T.ice, fontSize: 14.5, fontWeight: 700 }}>{t("editLookTitle")}</span>
        <div className="flex items-center gap-1.5">
          {[["frame", t("shopTabFrames")], ["card", t("shopTabCards")]].map(([id, label]) => {
            const active = tab === id;
            return (
              <button key={id} onClick={() => setTab(id)} className="fx-tap fx-chip rounded-full px-3 py-1"
                style={{
                  fontFamily: bodyFont, fontSize: 12.5, fontWeight: 600,
                  background: active ? T.ice : "transparent", color: active ? T.bg : T.muted,
                  border: `1px solid ${active ? T.ice : T.line}`,
                }}>
                {label}
              </button>
            );
          })}
        </div>
      </div>
      <p style={{ fontFamily: bodyFont, color: T.muted, fontSize: 12, lineHeight: 1.4, marginBottom: 10 }}>
        {мои.length > 1 ? t("editLookHint") : t("editLookEmpty")}
      </p>
      {/* Ряд прокручивается вбок: вещей со временем становится много, а
          сетка на всю ширину отодвинула бы кнопку «Сохранить» за экран.
          key по вкладке — чтобы волна появления шла заново на каждом
          переключении, а не только при открытии окна. */}
      <div key={tab} className="no-scrollbar flex gap-2 overflow-x-auto" style={{ paddingBottom: 2 }}>
        {мои.map((it, i) => {
          const выбрано = надето === it.id;
          return (
            <button
              key={it.id}
              onClick={() => { haptic("light"); onEquip(tab, it.id); }}
              className="fx-tap fx-look-in flex flex-col items-center gap-1.5 rounded-[18px] p-2"
              style={{
                flex: "0 0 auto", width: 84,
                background: T.bg, border: `1px solid ${выбрано ? hexA(T.electric, 0.55) : T.line}`,
                position: "relative", overflow: "hidden",
                // Волна слева направо. Дальше десятой плитки задержку не
                // копим: последняя иначе выезжала бы через секунду после
                // того, как ряд уже прокрутили руками.
                animationDelay: `${Math.min(i, 9) * 45}ms`,
              }}
            >
              <div style={{ position: "relative", width: "100%", height: 54, borderRadius: 12, overflow: "hidden", background: T.surfaceHi, display: "flex", alignItems: "center", justifyContent: "center" }}>
                {tab === "card" && <ProfileCardBg cardId={it.id} height={54} radius={12} showcase />}
                <div style={{ position: "relative", zIndex: 1 }}>
                  <AvatarFrame frameId={tab === "frame" ? it.id : "none"} size={38}>
                    <div style={{ width: "100%", height: "100%", background: T.bg }} />
                  </AvatarFrame>
                </div>
              </div>
              <span style={{ fontFamily: bodyFont, fontSize: 11, color: выбрано ? T.electric : T.muted, textAlign: "center", lineHeight: 1.2, whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis", maxWidth: "100%" }}>
                {pickLabel(it.label)}
              </span>
            </button>
          );
        })}
      </div>
    </div>
  );
}

function AuthModal({ open, onClose, onSubmit, initial, mode = "create", walletAddress, onChangeNickname, cosmetics = { frame: "none", card: "none" }, owned, onEquip, lookFocus = null }) {
  const isEdit = mode === "edit";
  // Окно держится на экране, пока идёт анимация ухода: без этого оно
  // пропадало кадром, и закрытие читалось сбоем, а не действием.
  const [видно, closing] = useClosing(open);
  const [tgBusy, setTgBusy] = useState(false);
  const [tgError, setTgError] = useState("");
  const [authTab, setAuthTab] = useState(isEdit ? "create" : mode); // "login" | "create"
  const [serverError, setServerError] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [nickname, setNickname] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [bio, setBio] = useState("");
  const [avatarUrl, setAvatarUrl] = useState(null);
  const [previewEmoji, setPreviewEmoji] = useState(() => randomProfileEmoji());
  const [avatarFile, setAvatarFile] = useState(null);
  const [avatarCropFile, setAvatarCropFile] = useState(null);
  const avatarInputRef = useRef(null);
  const isLogin = !isEdit && authTab === "login";
  // Что известно об аккаунте до входа: null — ещё спрашиваем,
  // { exists } — ответ сервера. Пока не знаем, поле ника не показываем:
  // у тех, кто уже заходил, его нет вовсе.
  const [tgProbe, setTgProbe] = useState(null);
  const [tgNick, setTgNick] = useState("");
  const [tgNickTouched, setTgNickTouched] = useState(false);
  // Смена ника в режиме правки профиля.
  const [nickEditing, setNickEditing] = useState(false);
  const [newNick, setNewNick] = useState("");
  const [nickTouched, setNickTouched] = useState(false);

  useEffect(() => {
    if (!open || isEdit || !telegramInitData()) return;
    let alive = true;
    setTgProbe(null);
    setTgNick("");
    setTgNickTouched(false);
    probeTelegramAccount()
      .then((info) => { if (alive) setTgProbe(info); })
      // Не достучались до сервера — не превращаем вход в форму создания:
      // у того, кто уже заходил, ник не спрашивают, а кнопка «Создать
      // аккаунт» с пустым полем просто не нажимается, и войти нельзя.
      // Пробуем войти как есть; если аккаунт всё-таки новый, сервер
      // ответит «нужен ник», и поле появится.
      .catch(() => { if (alive) setTgProbe({ exists: true }); });
    return () => { alive = false; };
  }, [open, isEdit]);

  useEffect(() => {
    if (open) {
      setAuthTab(isEdit ? "create" : mode);
      setNickname(initial && initial.nickname ? initial.nickname : "");
      setEmail(initial && initial.email ? initial.email : "");
      setPassword("");
      setBio(initial && initial.bio ? initial.bio : "");
      setAvatarUrl(initial && initial.avatarUrl ? initial.avatarUrl : null);
      setAvatarFile(null);
      setAvatarCropFile(null);
      setPreviewEmoji(initial && initial.emoji ? initial.emoji : randomProfileEmoji());
      setServerError("");
      setTgError("");
      setTgBusy(false);
    }
  }, [open, mode]);

  if (!видно) return null;

  // Регистрация и вход больше не спрашивают почту с паролем — вместо них
  // одна кнопка «Войти через Telegram». Режим редактирования профиля
  // остаётся прежней формой (ник, описание, аватарка).
  if (!isEdit) {
    const tgUser = telegramUser();
    const insideTelegram = !!telegramInitData();

    // Первый вход: профиля с таким telegram_id ещё нет, значит аккаунт
    // сейчас создастся — и ник человек выбирает сам.
    const probing = insideTelegram && !tgProbe;
    const isNew = insideTelegram && !!tgProbe && !tgProbe.exists;
    const tgNickTrimmed = tgNick.trim();
    const tgNickValid = NICKNAME_RE.test(tgNickTrimmed);
    const canEnter = insideTelegram && !probing && !tgBusy && (!isNew || tgNickValid);

    async function handleTelegramLogin() {
      if (isNew && !tgNickValid) { setTgNickTouched(true); return; }
      setTgError("");
      setTgBusy(true);
      try {
        await signInWithTelegram(isNew ? tgNickTrimmed : "");
        onClose();
      } catch (err) {
        const code = (err && err.message) || "";
        if (code === "nickname_required") setTgProbe({ exists: false });
        const detail = (err && err.detail) ? ` — ${String(err.detail).slice(0, 220)}` : "";
        setTgError(code === "no_telegram" ? t("tgAuthOutside")
          : code === "server_not_configured" ? t("tgAuthNotConfigured")
          // Имя увели между проверкой и созданием — человек остаётся на
          // том же экране и выбирает другое.
          : code === "nickname_taken" ? tf("authErrNicknameTaken", { name: tgNickTrimmed })
          // Сервер говорит, что аккаунт новый и без ника его не завести —
          // показываем поле, даже если разведка сказала иначе.
          : code === "nickname_required" ? t("tgAuthNickHint")
          : `${t("tgAuthFailed")} (${code || "?"})${detail}`);
      } finally {
        setTgBusy(false);
      }
    }

    return (
      <div className={`fx-modal-back${closing ? " fx-out" : ""}`} style={{ ...SHEET_BACK, zIndex: 60 }} onClick={onClose}>
        <div className="fx-modal-card" onClick={(e) => e.stopPropagation()} style={sheetCard(22)}>
          <div className="flex items-center justify-between" style={{ marginBottom: 14 }}>
            <span style={{ fontFamily: displayFont, color: T.ice, fontSize: 17.5, fontWeight: 700 }}>{t("tgAuthTitle")}</span>
            <button onClick={onClose} className="fx-tap fx-close"><X size={16} color={T.muted} /></button>
          </div>

          <div className="flex flex-col items-center text-center gap-3" style={{ paddingBottom: 6 }}>
            <AvatarFrame frameId="ember" size={96}>
              <div style={{
                width: "100%", height: "100%", display: "flex", alignItems: "center", justifyContent: "center",
                background: tgUser && tgUser.photo_url ? `center/cover no-repeat url(${tgUser.photo_url})` : T.surfaceHi,
                fontSize: 34,
              }}>
                {!(tgUser && tgUser.photo_url) && <Send size={28} color={T.electric} />}
              </div>
            </AvatarFrame>

            {tgUser && (
              <span style={{ fontFamily: displayFont, color: T.ice, fontSize: 17.5, fontWeight: 700 }}>
                {tgUser.username ? `@${tgUser.username}` : [tgUser.first_name, tgUser.last_name].filter(Boolean).join(" ")}
              </span>
            )}

            <p style={{ fontFamily: bodyFont, color: T.muted, fontSize: 14, lineHeight: 1.5, maxWidth: 280 }}>
              {!insideTelegram ? t("tgAuthOutside") : isNew ? t("tgAuthNickHint") : t("tgAuthHint")}
            </p>

            {/* Поле ника — только при первом входе. Имя из профиля
                Telegram подставлено заранее: чаще всего его и оставляют,
                но теперь это выбор, а не назначение. */}
            {isNew && (
              <div className="w-full flex flex-col text-left" style={{ gap: 4 }}>
                <Field
                  label={t("nicknameLabel")}
                  placeholder="leo_builds"
                  value={tgNick}
                  onChange={(e) => { setTgNick(e.target.value); setTgNickTouched(true); }}
                  error={tgNickTouched && !tgNickValid}
                />
                {tgNickTouched && !tgNickValid && (
                  <span style={{ fontFamily: bodyFont, color: T.rose, fontSize: 12 }}>{t("nicknameError")}</span>
                )}
              </div>
            )}

            {tgError && <span style={{ fontFamily: bodyFont, color: T.rose, fontSize: 13 }}>{tgError}</span>}

            <button
              onClick={handleTelegramLogin}
              disabled={!canEnter}
              className="fx-tap w-full flex items-center justify-center gap-2 rounded-[20px] py-3.5 mt-1"
              style={{
                background: canEnter ? PRISM : T.surfaceHi,
                color: canEnter ? PRISM_TEXT : T.muted,
                fontFamily: displayFont, fontWeight: 700, fontSize: 15,
                boxShadow: canEnter ? `0 0 22px ${glow(0.28)}` : "none",
                opacity: tgBusy ? 0.6 : 1,
              }}
            >
              {tgBusy || probing
                ? <><RefreshCw size={15} style={{ animation: "spin360 1.1s linear infinite" }} /> {t("submittingText")}</>
                : <><Send size={15} /> {isNew ? t("tgAuthCreateCta") : t("tgAuthCta")}</>}
            </button>
          </div>
        </div>
      </div>
    );
  }

  const nicknameTrimmed = nickname.trim();
  // В профиле не правятся ни почта с паролем (аккаунт заводится
  // Telegram-ом, адрес технический), ни ник — он выбирается один раз при
  // создании аккаунта. Остаются описание и аватарка, а им проверять
  // нечего.
  const canSubmit = true;

  function onPickAvatar(e) {
  const file = e.target.files && e.target.files[0];
  e.target.value = ""; // allow re-picking the same file later
  if (!file) return;
  setAvatarCropFile(file);
}
function handleAvatarCropConfirm(croppedFile, croppedUrl) {
  setAvatarUrl(croppedUrl); // только превью, в БД пойдёт после загрузки
  setAvatarFile(croppedFile);
  setAvatarCropFile(null);
}

// Расширение файла берём из его типа, а не из имени. Имя приходит от
// пользователя: «logo.png/../../что-то» превратилось бы в путь, который
// уезжает из своей папки, а «.svg» — в картинку, умеющую исполнять
// скрипты у того, кто откроет её напрямую.
const UPLOAD_EXT_BY_TYPE = {
  "image/png": "png",
  "image/jpeg": "jpg",
  "image/webp": "webp",
  "image/gif": "gif",
};
function safeImageExt(file) {
  return UPLOAD_EXT_BY_TYPE[(file && file.type) || ""] || "png";
}

// Загружает файл в Supabase Storage и возвращает публичный URL
async function uploadAvatarIfNeeded(userId) {
  if (!avatarFile) return avatarUrl; // ничего не выбирали — оставляем как было
  const path = `${userId}/${Date.now()}.${safeImageExt(avatarFile)}`;
  // contentType задаём сами: без него Supabase иногда ставит
  // application/octet-stream, и картинка потом отдаётся браузеру как
  // файл на скачивание.
  const { error: uploadError } = await supabase.storage
    .from("avatars")
    .upload(path, avatarFile, { upsert: true, contentType: avatarFile.type || "image/jpeg", cacheControl: "31536000" });
  if (uploadError) {
    setServerError(tf("authErrAvatarUpload", { msg: uploadError.message }));
    return null;
  }
  const { data } = supabase.storage.from("avatars").getPublicUrl(path);
  return data.publicUrl;
}
  function friendlyAuthError(message) {
    const m = (message || "").toLowerCase();
    if (m.includes("already registered") || m.includes("already exists")) return t("authErrAlreadyRegistered");
    if (m.includes("invalid login credentials")) return t("authErrInvalidCreds");
    if (m.includes("email not confirmed")) return t("authErrNotConfirmed");
    if (m.includes("password") && m.includes("6")) return t("authErrPasswordShort");
    if (m.includes("nickname")) return tf("authErrNicknameTaken", { name: nicknameTrimmed });
    return message || t("authErrGeneric");
  }

  async function handleSubmit() {
    setServerError("");
    if (!canSubmit) return;
    setSubmitting(true);

// ---------- EDIT (no auth call — just updates the row) ----------
    if (isEdit) {
      // Кто мы — берём из сохранённой сессии, а не запросом getUser():
      // тот каждый раз ходит на сервер сверять токен, и на медленной
      // сети кнопка секунду висела в «Проверяем…» ещё до того, как
      // началось само сохранение. Сессия лежит на устройстве и знает
      // тот же идентификатор.
      const { data: sessionData } = await supabase.auth.getSession();
      const userId = sessionData?.session?.user?.id;
      let uploadedUrl = avatarUrl; // если userId вдруг не найден — оставляем как было

      if (userId) {
        uploadedUrl = await uploadAvatarIfNeeded(userId);
        if (avatarFile && !uploadedUrl) { setSubmitting(false); return; } // загрузка не удалась

        // Запись в базу не задерживает окно: картинка уже загружена, а
        // строка профиля — короткая, и ждать её ответа человеку незачем.
        // Ошибку он увидит на следующем открытии, там же где и правил.
        supabase
          .from("profiles")
          .update({
            // Ник не трогаем: он неизменяем, и в базе на это стоит
            // отдельный запрет (supabase_nickname_lock.sql).
            bio: bio.trim(),
            avatar_url: uploadedUrl,
            emoji: uploadedUrl ? null : previewEmoji,
          })
          .eq("id", userId)
          .then(({ error }) => {
            if (error) console.error("[mintly] профиль не сохранился:", error.message);
          });
      }
      setSubmitting(false);

      onSubmit({
        nickname: nicknameTrimmed,
        email: email.trim(),
        bio: bio.trim(),
        avatarUrl: uploadedUrl,
        emoji: uploadedUrl ? null : previewEmoji,
      });
      return;
    }

  }

  return (
    <div className={`fx-modal-back${closing ? " fx-out" : ""}`} style={{ ...SHEET_BACK, zIndex: 60 }} onClick={onClose}>
      <div className="fx-modal-card" onClick={(e) => e.stopPropagation()} style={sheetCard(22)}>
        <div className="flex items-center justify-between" style={{ marginBottom: isEdit ? 4 : 14 }}>
          <span style={{ fontFamily: displayFont, color: T.ice, fontSize: 17.5, fontWeight: 700 }}>
            {isEdit ? t("editProfile") : t("accountLabel")}
          </span>
          <button onClick={onClose} className="fx-tap fx-close"><X size={16} color={T.muted} /></button>
        </div>

        {!isEdit && (
          <div className="flex" style={{ background: T.bg, border: `1px solid ${T.line}`, borderRadius: 12, padding: 3, marginBottom: 16 }}>
            {[
              { id: "login", label: t("loginTab"), icon: LogIn },
              { id: "create", label: t("createTab"), icon: Sparkles },
            ].map(({ id, label, icon: Icon }) => {
              const active = authTab === id;
              return (
                <button
                  key={id}
                  onClick={() => { setAuthTab(id); setServerError(""); }}
                  className="fx-tap tf-btn flex-1 flex items-center justify-center gap-1.5 rounded-[16px] py-2"
                  style={{
                    background: active ? PRISM : "transparent",
                    color: active ? PRISM_TEXT : T.muted,
                    fontFamily: displayFont, fontWeight: 700, fontSize: 14,
                  }}
                >
                  <Icon size={13} /> {label}
                </button>
              );
            })}
          </div>
        )}

        <p style={{ fontFamily: bodyFont, color: T.muted, fontSize: 13, marginBottom: 16 }}>
          {isEdit ? t("editHint") : isLogin ? t("loginHint") : t("createHint")}
        </p>

        {!isLogin && (
          // При редактировании аватарка стоит в надетой рамке и на
          // надетой карточке: выбор внизу окна меняет её тут же, и
          // примерять вслепую, а потом идти смотреть в профиль, больше
          // не нужно. При создании аккаунта косметики ещё нет — там
          // остаётся голый кружок.
          <div className="flex flex-col items-center gap-1.5" style={{ marginBottom: 16 }}>
            <input ref={avatarInputRef} type="file" accept="image/*" onChange={onPickAvatar} style={{ display: "none" }} />
            {isEdit && onEquip ? (
              <div style={{ position: "relative", width: "100%", height: 132, borderRadius: 20, overflow: "hidden", background: T.bg, border: `1px solid ${T.line}`, display: "flex", alignItems: "center", justifyContent: "center" }}>
                <ProfileCardBg cardId={cosmetics.card} height={132} radius={20} />
                <button
                  onClick={() => avatarInputRef.current && avatarInputRef.current.click()}
                  className="fx-tap fx-avatar"
                  style={{ position: "relative", zIndex: 1 }}
                >
                  <AvatarFrame frameId={cosmetics.frame} size={92}>
                    <div style={{
                      width: "100%", height: "100%", fontSize: 34,
                      display: "flex", alignItems: "center", justifyContent: "center",
                      background: avatarUrl ? `center/cover no-repeat url(${avatarUrl})` : T.bg,
                    }}>
                      {!avatarUrl && previewEmoji}
                    </div>
                  </AvatarFrame>
                </button>
              </div>
            ) : (
              <button onClick={() => avatarInputRef.current && avatarInputRef.current.click()} className="fx-tap flex flex-col items-center justify-center gap-1 overflow-hidden" style={{ width: 84, height: 84, borderRadius: "50%", background: avatarUrl ? `center/cover no-repeat url(${avatarUrl})` : T.bg, border: avatarUrl ? `1.5px solid ${T.lineHi}` : `1px dashed ${T.lineHi}`, fontSize: 34 }}>
                {!avatarUrl && previewEmoji}
              </button>
            )}
            <span style={{ fontFamily: bodyFont, color: T.muted, fontSize: 11.5 }}>{avatarUrl ? t("changeAvatarHint") : t("addAvatarHint")}</span>
          </div>
        )}

        <div className="flex flex-col gap-3.5">
          {/* Ник меняется за монеты. Бесплатно его выбирают один раз, при
              создании аккаунта: под ним человека знают в ленте покупок и
              в чужих профилях, и бесплатная чехарда именами всех бы
              запутала. Пока смена не начата — имя просто показано. */}
          {!isLogin && (
            <div className="flex flex-col gap-1.5">
              <span style={{ fontFamily: bodyFont, color: T.muted, fontSize: 13 }}>{t("nicknameLabel")}</span>
              {nickEditing ? (
                <>
                  <Field
                    label=""
                    placeholder="leo_builds"
                    value={newNick}
                    onChange={(e) => { setNewNick(e.target.value); setNickTouched(true); }}
                    error={nickTouched && !NICKNAME_RE.test(newNick.trim())}
                  />
                  {nickTouched && !NICKNAME_RE.test(newNick.trim()) && (
                    <span style={{ fontFamily: bodyFont, color: T.rose, fontSize: 12 }}>{t("nicknameError")}</span>
                  )}
                  <div className="flex items-center gap-2">
                    <button
                      onClick={() => { setNickEditing(false); setNewNick(""); setNickTouched(false); }}
                      className="fx-tap rounded-[20px] px-4 py-2.5"
                      style={{ background: T.surfaceHi, border: `1px solid ${T.line}`, fontFamily: bodyFont, fontSize: 13.5, color: T.ice }}
                    >
                      {t("cancel")}
                    </button>
                    <button
                      onClick={() => onChangeNickname && onChangeNickname(newNick.trim(), () => { setNickEditing(false); setNewNick(""); setNickTouched(false); })}
                      disabled={!NICKNAME_RE.test(newNick.trim())}
                      className="fx-tap flex-1 flex items-center justify-center gap-1.5 rounded-[20px] px-4 py-2.5"
                      style={{
                        background: NICKNAME_RE.test(newNick.trim()) ? PRISM : T.surfaceHi,
                        color: NICKNAME_RE.test(newNick.trim()) ? PRISM_TEXT : T.muted,
                        border: NICKNAME_RE.test(newNick.trim()) ? "none" : `1px solid ${T.line}`,
                        fontFamily: displayFont, fontWeight: 700, fontSize: 13.5,
                      }}
                    >
                      <CoinIcon size={14} dim={!NICKNAME_RE.test(newNick.trim())} /> {tf("nickChangeCta", { n: NICKNAME_PRICE })}
                    </button>
                  </div>
                </>
              ) : (
                <>
                  <div className="flex items-center gap-2 rounded-[20px] px-3.5 py-2.5" style={{ background: T.bg, border: `1px solid ${T.line}` }}>
                    <span className="flex-1" style={{ fontFamily: displayFont, color: T.ice, fontSize: 14.5, fontWeight: 700 }}>{nickname}</span>
                    <button
                      onClick={() => { setNickEditing(true); setNewNick(nickname); }}
                      className="fx-tap flex items-center gap-1.5 rounded-full px-3 py-1.5"
                      style={{ background: T.surfaceHi, border: `1px solid ${T.line}`, fontFamily: bodyFont, fontSize: 12.5, color: T.ice }}
                    >
                      <CoinIcon size={13} /> {t("nickChange")}
                    </button>
                  </div>
                  <span style={{ fontFamily: bodyFont, color: T.muted, fontSize: 12 }}>{tf("nickChangeSub", { n: NICKNAME_PRICE })}</span>
                </>
              )}
            </div>
          )}
          {!isLogin && <Field label={t("bioLabel")} placeholder={t("bioPlaceholder")} area value={bio} onChange={(e) => setBio(e.target.value)} />}
        </div>

        {/* Примерка. Магазин только продаёт, а надевают купленное здесь:
            рядом с аватаркой и ником, то есть там, где человек и так
            решает, как он выглядит. */}
        {isEdit && onEquip && <LookPicker cosmetics={cosmetics} owned={owned} onEquip={onEquip} focus={lookFocus} />}
        {serverError && <span style={{ fontFamily: bodyFont, color: T.rose, fontSize: 13, marginTop: 10, display: "block" }}>{serverError}</span>}
        <button onClick={handleSubmit} disabled={submitting} className="fx-tap w-full rounded-[20px] py-3 mt-5" style={{ background: canSubmit ? PRISM : T.surfaceHi, color: canSubmit ? PRISM_TEXT : T.muted, fontFamily: displayFont, fontWeight: 700, fontSize: 15, boxShadow: canSubmit ? `0 0 22px ${glow(0.28)}` : "none", opacity: submitting ? 0.6 : 1 }}>
          {submitting ? t("submittingText") : isEdit ? t("saveChanges") : isLogin ? t("loginCta") : t("createAccountShort")}
        </button>
      </div>

      <ImageCropModal file={avatarCropFile} shape="circle" onCancel={() => setAvatarCropFile(null)} onConfirm={handleAvatarCropConfirm} />
    </div>
  );
}

function ProfileView({
  connected, onOpenConnectModal, showToast,
  accountCreated, profile, onOpenCreateProfile, onOpenLogin, onOpenEditProfile, onLogOut,
  onOpenSetting, onGoCreate, onOpenToken, myTokens = [],
  cosmetics: cosmeticsProp = { frame: "none", card: "none" }, onGoShop, onOpenAchievements, insetTop = 0, userId = null,
  // Достижения считаются в корне: их же показывает магазин и отдельная
  // страница достижений, дублировать запрос незачем.
  achievements = [], creatorTier = 0, onVerified, supportUnread = 0,
}) {
  // Подтверждение хранится в профиле, а не только на экране: иначе
  // значок пропадал при первом же обновлении страницы.
  const [verifyStatus, setVerifyStatus] = useState(profile.verified ? "verified" : "none");
  useEffect(() => {
    setVerifyStatus((cur) => (profile.verified ? "verified" : cur === "pending" ? "pending" : "none"));
  }, [profile.verified]);

  // Без аккаунта украшений нет: пустой профиль с чужой рамкой и фоном
  // выглядит как чей-то чужой, хотя войти ещё даже не предлагали.
  // Прошлый выбор хранится и вернётся сам, как только человек войдёт.
  const cosmetics = accountCreated ? cosmeticsProp : { frame: "none", card: "none" };

  const unlocked = accountCreated && connected;
  function requireUnlock(missingMsg) {
    if (!accountCreated) { onOpenCreateProfile(); showToast(t("firstAccountFirst")); return false; }
    if (!connected) { onOpenConnectModal(); showToast(t("connectWalletContinue")); return false; }
    return true;
  }
  function startVerify() {
    if (!requireUnlock()) return;
    setVerifyStatus("pending");
    showToast(t("verifyRequestSent"));
    setTimeout(() => {
      setVerifyStatus("verified");
      showToast(t("profileVerified"));
      if (onVerified) onVerified();
    }, 2200);
  }
  function goCreateToken() {
    if (!requireUnlock()) return;
    onGoCreate();
  }
  function openSettingItem(item) {
    onOpenSetting(item);
  }
  function logOut() {
    setVerifyStatus("none");
    onLogOut();
  }

  return (
    <div className="fx-view" style={{ position: "relative" }}>
      <div className="flex flex-col gap-0 pb-4">
        <div className="flex flex-col items-center text-center gap-2" style={{ marginTop: 10, position: "relative", zIndex: 0 }}>
          {/* bleed выводит подложку за горизонтальные отступы экрана и
              поднимает её выше шапки — так у карточки не остаётся видимых
              обрезанных краёв. */}
          <ProfileCardBg cardId={cosmetics.card} height={320} radius={0} bleed={16} top={PROFILE_CARD_TOP(insetTop)} />
          {/* Отступ сверху — не украшение: вплотную к плашке висят свои
              кнопки Telegram («свернуть» и «ещё»), и без зазора она
              читалась как их кривой сосед, а не как часть профиля.
              Подложка отделяет её от картинки карточки. */}
          {accountCreated && (
            <button onClick={logOut} className="fx-tap flex items-center gap-1.5" style={{ position: "absolute", top: 14, right: 0, zIndex: 2, background: "rgba(10,10,14,0.55)", backdropFilter: "blur(8px)", WebkitBackdropFilter: "blur(8px)", border: `1px solid rgba(140,140,148,0.3)`, borderRadius: 999, padding: "7px 13px", fontFamily: bodyFont, fontSize: 13, lineHeight: 1, color: T.rose }}>
              <LogOut size={13} /> {t("logOutShort")}
            </button>
          )}
          <button
            onClick={onGoShop}
            className="fx-tap"
            style={{ position: "relative", zIndex: 1, background: "transparent", border: "none", padding: 0, lineHeight: 0 }}
          >
            <AvatarFrame frameId={cosmetics.frame} size={100}>
                <div style={{ width: "100%", height: "100%", borderRadius: "50%", background: profile.avatarUrl ? `center/cover no-repeat url(${profile.avatarUrl})` : T.surfaceHi, border: cosmetics.frame === "none" ? (profile.avatarUrl ? `2px solid ${T.lineHi}` : `2px dashed ${T.lineHi}`) : "none", display: "flex", alignItems: "center", justifyContent: "center", fontSize: accountCreated ? 52 : 40 }}>
                  {!profile.avatarUrl && (accountCreated && profile.emoji ? profile.emoji : <User size={40} color={T.muted} />)}
                </div>
            </AvatarFrame>
          </button>
          <div className="flex flex-col items-center text-center gap-2" style={{ position: "relative", zIndex: 1, width: "100%" }}>
          {accountCreated ? (
            <>
              <div className="flex items-center gap-1.5 mt-1">
                <span style={{ fontFamily: displayFont, color: T.ice, fontSize: 20.5, fontWeight: 700 }}>{profile.nickname}</span>
                <CreatorWreathBadge tier={creatorTier} size={19} />
                <VerifiedBadge verified={verifyStatus === "verified"} size={16} />
              </div>
              {/* Описание в две строки: длинное всё равно дочитывают на
                  своей странице токена, а здесь оно раздвигало экран так,
                  что настройки уезжали за нижний край. */}
              <p style={{
                fontFamily: bodyFont, color: T.muted, fontSize: 13.5, maxWidth: 280, lineHeight: 1.45,
                display: "-webkit-box", WebkitLineClamp: 2, WebkitBoxOrient: "vertical", overflow: "hidden",
              }}>
                {profile.bio || t("bioEmptyPlaceholder")}
              </p>
              <div className="flex items-center gap-3" style={{ fontFamily: bodyFont, color: T.muted, fontSize: 12 }}>
                <span className="flex items-center gap-1"><Clock size={12} /> {t("memberSince")}</span>
              </div>
              <button onClick={onOpenEditProfile} className="fx-tap rounded-[18px] px-5 py-2 mt-1" style={{ background: T.surface, border: `1px solid ${T.line}`, fontFamily: bodyFont, fontSize: 14, color: T.ice }}>{t("editProfileBtn")}</button>
            </>
          ) : (
            <>
              <div style={{ fontFamily: displayFont, color: T.ice, fontSize: 18.5, fontWeight: 700, marginTop: 4 }}>{t("accountNotCreated")}</div>
              <p style={{ fontFamily: bodyFont, color: T.muted, fontSize: 14, maxWidth: 260, lineHeight: 1.5 }}>{t("accountNotCreatedBody")}</p>
              <div className="flex items-center gap-2 mt-2" style={{ width: "100%", maxWidth: 300 }}>
                <button onClick={onOpenLogin} className="fx-tap flex-1 flex items-center justify-center gap-1.5 rounded-[20px] px-4 py-3" style={{ background: PRISM, color: PRISM_TEXT, fontFamily: displayFont, fontWeight: 700, fontSize: 14 }}>
                  <Send size={14} /> {t("tgAuthCta")}
                </button>
              </div>
            </>
          )}
          </div>
        </div>

        {/* Всё, что ниже шапки, поднято над её слоем. Подложка карточки
            профиля лежит внутри шапки и заканчивается сплошной чёрной
            растушёвкой; по правилам отрисовки позиционированный слой
            рисуется поверх фонов обычных блоков, и эта растушёвка
            срезала верх виджета кошелька. */}
        <div style={{ position: "relative", zIndex: 1 }}>

        {/* Свои токены, активность и достижения переехали на главную:
            за ними заходят каждый день, и держать их за лишним переходом
            значило прятать самое нужное. Здесь остаётся то, за чем
            приходят изредка, — подтверждение и настройки. */}

        {/* Подтверждённый профиль эту строку не показывает: о том, что он
            подтверждён, уже говорит значок у ника, а целый раздел ради
            повтора съедал экран — из-за него профиль переставал помещаться
            целиком и начинал прокручиваться. */}
        <div className="mt-5" style={{ display: verifyStatus === "verified" ? "none" : undefined }}>
          <SectionTitle>{t("verificationTitle")}</SectionTitle>
          {/* Без подложки: это строка состояния, а не отдельный объект —
              карточка вокруг двух строк текста только добавляла слой. */}
          <div className="flex items-center gap-3" style={{ padding: "4px 0" }}>
            {verifyStatus === "pending" ? (
              <>
                <ShieldAlert size={22} color={T.violet} />
                <div className="flex-1">
                  <div style={{ fontFamily: displayFont, color: T.ice, fontSize: 14.5, fontWeight: 600 }}>{t("pendingStatus")}</div>
                  <div style={{ fontFamily: bodyFont, color: T.muted, fontSize: 12.5 }}>{t("verifyPending")}</div>
                </div>
              </>
            ) : (
              <>
                <ShieldAlert size={22} color={T.muted} />
                <div className="flex-1">
                  <div style={{ fontFamily: displayFont, color: T.ice, fontSize: 14.5, fontWeight: 600 }}>{t("notVerifiedStatus")}</div>
                  <div style={{ fontFamily: bodyFont, color: T.muted, fontSize: 12.5 }}>{t("verifyCta")}</div>
                </div>
                <button onClick={startVerify} className="fx-tap rounded-[16px] px-3 py-2 flex items-center gap-1.5" style={{ background: T.surfaceHi, border: `1px solid ${T.line}`, fontFamily: bodyFont, fontSize: 13, color: T.ice, opacity: unlocked ? 1 : 0.55 }}>
                  {!unlocked && <Lock size={11} color={T.muted} />} {t("verifyAccountBtn")}
                </button>
              </>
            )}
          </div>
        </div>

        <div className="mt-5">
          <SectionTitle>{t("settings")}</SectionTitle>
          {/* Каждый пункт — своя плашка, а не строка внутри общей.
              Раньше список лежал в одной карточке, и нажатие вдавливало
              её целиком: в CSS состояние «нажато» достаётся не только
              самой кнопке, но и всем блокам вокруг неё. Теперь вдавливается
              ровно то, на что нажали. */}
          <div className="flex flex-col gap-2">
            {SETTINGS_ITEMS.map((s, i) => (
              <button
                key={s.key}
                onClick={() => openSettingItem(s)}
                className="fx-card fx-tap w-full flex items-center gap-3 rounded-[20px]"
                style={{
                  background: T.surface, border: "none",
                  padding: "13px 16px", animationDelay: `${i * 40}ms`,
                }}
              >
                <s.icon size={16} color={T.muted} />
                <span style={{ fontFamily: bodyFont, fontSize: 14.5, color: T.ice, flex: 1, textAlign: "left" }}>{t(s.tKey)}</span>
                {/* Ответ поддержки ждёт прочтения. Без метки о нём знает
                    только личка в Telegram, а её человек мог отключить. */}
                {s.key === "support" && supportUnread > 0 && (
                  <span style={{
                    minWidth: 20, height: 20, padding: "0 6px", borderRadius: 999,
                    background: PRISM, color: PRISM_TEXT,
                    fontFamily: monoFont, fontSize: 12, fontWeight: 700,
                    display: "flex", alignItems: "center", justifyContent: "center",
                  }}>
                    {supportUnread > 9 ? "9+" : supportUnread}
                  </span>
                )}
              </button>
            ))}
          </div>
        </div>

        </div>
      </div>
    </div>
  );
}


/* ---------------------------------------------------------
   TELEGRAM MINI APP INTEGRATION
   Loads the official telegram-web-app.js SDK, calls ready()/expand(),
   and tracks the *real* viewport height Telegram reports (window.
   Telegram.WebApp.viewportStableHeight). Telegram's in-app WebView
   does not reliably support 100dvh — especially on iOS, where the
   Telegram chrome (header + home-indicator area) can leave a gap
   at the bottom if we just trust CSS viewport units. Setting an
   explicit pixel height from the SDK's own viewport events is what
   actually eliminates that leftover space.
--------------------------------------------------------- */

// Поправка к системному отступу сверху. Отрицательная — контент
// поднимается выше, ближе к шапке Telegram, чем предписывает safe-area.
// Ниже нуля итог не опускаем: отрицательный padding браузер просто
// проигнорирует, и вёрстка поедет молча.
const CONTENT_TOP_GAP = 0;
const contentTopPad = (insetTop) => Math.max(0, insetTop + CONTENT_TOP_GAP);

// Насколько подложка профиля заходит выше начала контента. Верхние
// insetTop + CONTENT_TOP_GAP + 10 доводят её ровно до верха окна, а
// оставшийся запас нужен на случай, если клиент всё-таки позволит
// оттянуть список — тогда под пальцем окажется карточка, а не пустой фон.
const PROFILE_CARD_TOP = (insetTop) => -(contentTopPad(insetTop) + 10 + 160);

/* Где именно запущено приложение.
   Основной источник — сам Telegram: он сообщает платформу ("ios",
   "android", "tdesktop", "macos", "web", "weba", "webk", "unknown") и
   версию клиента. Это надёжнее разбора строки браузера, но внутри
   Telegram доступно не всегда (например при открытии по обычной ссылке),
   поэтому есть и запасной разбор userAgent.
   Значение считается один раз: между перерисовками устройство не
   меняется, а к строке браузера обращаться на каждый рендер незачем. */
function detectDevice() {
  if (typeof window === "undefined") {
    return { platform: "unknown", inTelegram: false, isIOS: false, isAndroid: false, isDesktop: false, isMobile: false, isTouch: false, version: null };
  }
  const tg = window.Telegram && window.Telegram.WebApp;
  const ua = navigator.userAgent || "";
  const tgPlatform = tg && tg.platform ? String(tg.platform).toLowerCase() : null;

  // iPadOS с 13-й версии представляется макинтошем, отличить можно только
  // по наличию сенсорного ввода.
  const iPadAsMac = /Macintosh/.test(ua) && navigator.maxTouchPoints > 1;
  const uaIOS = /iPad|iPhone|iPod/.test(ua) || iPadAsMac;
  const uaAndroid = /Android/.test(ua);

  const platform = tgPlatform && tgPlatform !== "unknown"
    ? tgPlatform
    : uaIOS ? "ios" : uaAndroid ? "android" : "web";

  const isIOS = platform === "ios" || platform === "macos" || uaIOS;
  const isAndroid = platform === "android" || uaAndroid;
  const isDesktop = platform === "tdesktop" || platform === "macos" || (!isIOS && !isAndroid);

  return {
    platform,
    inTelegram: !!tg,
    version: tg && tg.version ? tg.version : null,
    isIOS,
    isAndroid,
    isDesktop,
    isMobile: !isDesktop,
    isTouch: navigator.maxTouchPoints > 0 || "ontouchstart" in window,
  };
}

const DEVICE = detectDevice();

// Тем, кому устройство нужно внутри разметки. Отдельный хук, а не просто
// константа, — чтобы не тянуть её импортом через полфайла и чтобы позже
// можно было пересчитывать при смене клиента, не трогая вызовы.
function useDevice() {
  return DEVICE;
}

/* Ракета запуска.

   Летит снизу вверх и уходит за верхний край, уменьшаясь и гасая.

   Всё на CSS-анимациях: рисовать её покадрово в JS незачем, а на
   композиции она не даёт нагрузки поверх торгового экрана. */
const ROCKET_FLIGHT_MS = 1900;

// Анимация ракеты — настоящая из Telegram (Lottie). Файл лежит в public
// и подгружается один раз: класть полмегабайта в основной пакет ради
// анимации, которая играет раз в жизни токена, незачем.
let rocketAnimData = null;
let rocketAnimLoading = null;
function loadRocketAnimation(variant = "default") {
  if (rocketAnimData) return Promise.resolve(rocketAnimData);
  if (rocketAnimLoading) return rocketAnimLoading;
  const file = variant === "outline" ? "/rocket-outline.json" : "/rocket.json";
  rocketAnimLoading = fetch(file)
    .then((r) => (r.ok ? r.json() : null))
    .then((data) => { rocketAnimData = data; rocketAnimLoading = null; return data; })
    .catch(() => { rocketAnimLoading = null; return null; });
  return rocketAnimLoading;
}

/* Ракета запуска.

   Летит снизу вверх по центру и уходит за верхний край, уменьшаясь и
   гасая.

   Картинка нарисована носом вверх-вправо, поэтому при вертикальном
   полёте её разворачивают на 45 градусов. */
function LaunchRocket({ targetTop = ROCKET_TOUCH_TOP, variant = "default" }) {
  const holderRef = useRef(null);

  useEffect(() => {
    let cancelled = false;
    let anim = null;
    (async () => {
      const [{ default: lottie }, data] = await Promise.all([
        import("lottie-web/build/player/lottie_light"),
        loadRocketAnimation(variant),
      ]);
      if (cancelled || !data || !holderRef.current) return;
      anim = lottie.loadAnimation({
        container: holderRef.current,
        renderer: "svg",
        loop: true,
        autoplay: true,
        animationData: data,
      });
    })();
    return () => { cancelled = true; if (anim) anim.destroy(); };
  }, [variant]);

  return (
    <div
      aria-hidden
      style={{
        position: "fixed", inset: 0, zIndex: 1900, pointerEvents: "none",
        // Конец пути приходит переменной.
        ["--fly-to"]: `${targetTop}px`,
      }}
    >
      {/* Два слоя: внешний ведёт полёт, внутренний доворачивает картинку
          и сдвигает её так, чтобы центром вращения и точкой прилёта был
          сам корпус. В исходном кадре ракета нарисована не по центру
          холста, а в его верхнем правом углу — без поправки она уходила
          бы мимо, левее и выше. */}
      <div
        style={{
          // По горизонтали центрует translate(-50%) в самой анимации,
          // поэтому отрицательного поля здесь быть не должно: вместе они
          // сдвигали ракету на её же ширину влево. По вертикали поле
          // нужно — чтобы --fly-to означала центр, а не верхний край.
          position: "absolute", left: "50%", top: 0, width: 168, height: 168, marginTop: -84,
          animation: `rocketFly ${ROCKET_FLIGHT_MS}ms cubic-bezier(0.45,0,0.5,1) forwards`,
        }}
      >
        {/* Поправка на то, что в исходном кадре ракета нарисована не по
            центру холста: измерено по отрисовке, смещение около 13 на 11
            точек для этого размера. */}
        <div ref={holderRef} style={{ width: "100%", height: "100%", transform: "translate(13px, -11px)" }} />
      </div>
    </div>
  );
}

/* Лист как иконка. Тот же контур, что падает на фоне приложения, —
   чтобы кнопка запуска была из того же набора, что и всё остальное, а
   не из чужого. Прожилки на такой величине не рисуются: они
   превращаются в грязь. */
// Кленовый по умолчанию: из трёх фоновых пород он единственный, чей
// силуэт остаётся узнаваемым листом на шестнадцати точках. Дубовый на
// такой величине рассыпается в зубчики, мятный читается как капля.
/* Монета магазина — жетон с буквой M. Стопки и горки из плоских монет
   на двенадцати точках, где значок и живёт, превращались в кашу из
   овалов. Ровный кружок с буквой читается при любом размере и сразу
   говорит, что валюта своя, а не чужая. Цвет фирменный оранжевый:
   жёлтого в приложении нет больше нигде. */
function CoinIcon({ size = 14, dim = false, tone }) {
  // tone — когда монета лежит на цветной кнопке: своим оранжевым по
  // оранжевому она сливалась в пятно.
  const color = tone || (dim ? T.muted : T.electric);
  return (
    <svg width={size} height={size} viewBox="0 0 20 20" style={{ flexShrink: 0 }} aria-hidden>
      <circle cx="10" cy="10" r="8.4" fill={color} opacity={dim ? 0.08 : 0.18} />
      <circle cx="10" cy="10" r="8.4" fill="none" stroke={color} strokeWidth="1.5" />
      <path d="M6.6 13.4 V6.6 L10 10.6 L13.4 6.6 v6.8" fill="none" stroke={color} strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}

// Рамка у каждой породы своя: у клёна лист широкий, у мяты вдвое уже.
// Общая рамка оставляла бы мяте пустые поля по бокам, и рядом с текстом
// она выглядела бы мельче остальных значков того же размера.
const LEAF_ICON_BOX = ["-15 -32 30 38", "-11 -30 22 35", "-10.6 -29 21.2 35"];
function LeafIcon({ size = 14, color = T.electric, kind = 0 }) {
  const idx = kind % LEAF_KINDS.length;
  const leaf = LEAF_KINDS[idx];
  const box = LEAF_ICON_BOX[idx].split(" ").map(Number);
  return (
    <svg width={size * (box[2] / box[3])} height={size} viewBox={LEAF_ICON_BOX[idx]} style={{ flexShrink: 0 }} aria-hidden>
      <path d={leaf.stem} stroke={color} strokeWidth={1.6} strokeLinecap="round" fill="none" />
      <path d={leaf.outline} fill={color} />
    </svg>
  );
}

/* Куда летит ракета. Раньше она метила в обрамление — в контур
   «Динамического острова» или в рамку по краю экрана, — и всё это жило
   ровно на время запуска токена. Обрамления больше нет: остаётся сама
   ракета, которая уходит вверх и гаснет за краем. Вынос носа от центра
   картинки нужен, чтобы за край ушла именно ракета, а не её середина. */
const ROCKET_NOSE_OFFSET = 50;
const ROCKET_TOUCH_TOP = -ROCKET_NOSE_OFFSET;

function useTelegramViewport() {
  const [height, setHeight] = useState(
    typeof window !== "undefined" ? window.innerHeight : 720
  );
  const [insetBottom, setInsetBottom] = useState(0);
  const [insetTop, setInsetTop] = useState(0);
  // Отдельно от суммарного отступа: это отступ железа телефона (чёлка
  // или «остров»), без учёта собственной шапки Telegram. По нему видно,
  // какой именно вырез у экрана.
  const [deviceTop, setDeviceTop] = useState(0);
  const [fullscreen, setFullscreen] = useState(false);
  const [ready, setReady] = useState(false);

  useEffect(() => {
    let cancelled = false;

    function applyFromWebApp(tg) {
      if (!tg || cancelled) return;
      try {
        tg.ready();
        tg.expand();
        if (tg.disableVerticalSwipes) tg.disableVerticalSwipes();
        if (tg.setHeaderColor) { try { tg.setHeaderColor(T.bg); } catch (e) {} }
        if (tg.setBackgroundColor) { try { tg.setBackgroundColor(T.bg); } catch (e) {} }
      } catch (e) { /* older client, some methods may be missing */ }

      const update = () => {
        const h = tg.viewportStableHeight || tg.viewportHeight || window.innerHeight;
        setHeight(h);
        // Два разных отступа, и их надо складывать, а не выбирать один:
        // safeAreaInset — это железо телефона (чёлка, статус-бар),
        // contentSafeAreaInset — собственная шапка Telegram над окном
        // приложения. В полноэкранном режиме важен первый, в обычном —
        // второй, и оба могут быть ненулевыми одновременно.
        const device = tg.safeAreaInset || {};
        const content = tg.contentSafeAreaInset || {};
        // Целой страницей (fullscreen) шапки над окном уже нет, но кнопки
        // «закрыть» и «ещё» никуда не деваются — они висят прямо поверх
        // содержимого справа сверху. Клиент не всегда закладывает их в
        // свой отступ, поэтому держим запас сами: без него первая строка
        // экрана оказывается под кнопками.
        const запасПодКнопки = tg.isFullscreen ? 48 : 0;
        setInsetTop((device.top || 0) + Math.max(content.top || 0, запасПодКнопки));
        setInsetBottom((device.bottom || 0) + (content.bottom || 0));
        setDeviceTop(device.top || 0);
        setFullscreen(!!tg.isFullscreen);
        setReady(true);
      };
      update();
      tg.onEvent && tg.onEvent("viewportChanged", update);
      tg.onEvent && tg.onEvent("safeAreaChanged", update);
      tg.onEvent && tg.onEvent("contentSafeAreaChanged", update);
      // Переход на целую страницу приходит отдельным событием: отступы
      // при нём меняются, а viewportChanged может и не сработать.
      tg.onEvent && tg.onEvent("fullscreenChanged", update);
      return () => {
        tg.offEvent && tg.offEvent("viewportChanged", update);
        tg.offEvent && tg.offEvent("safeAreaChanged", update);
        tg.offEvent && tg.offEvent("contentSafeAreaChanged", update);
        tg.offEvent && tg.offEvent("fullscreenChanged", update);
      };
    }

    if (window.Telegram && window.Telegram.WebApp) {
      const cleanup = applyFromWebApp(window.Telegram.WebApp);
      return () => cleanup && cleanup();
    }

    // SDK not present yet (e.g. previewing outside Telegram) — inject it,
    // and fall back gracefully to window.innerHeight if it never loads.
    const script = document.createElement("script");
    script.src = "https://telegram.org/js/telegram-web-app.js";
    script.async = true;
    script.onload = () => { if (!cancelled) applyFromWebApp(window.Telegram && window.Telegram.WebApp); };
    document.head.appendChild(script);

    const onResize = () => { if (!window.Telegram) setHeight(window.innerHeight); };
    window.addEventListener("resize", onResize);
    return () => { cancelled = true; window.removeEventListener("resize", onResize); };
  }, []);

  // Кладём отступы в переменные на <html>. Оттуда их видно всем, включая
  // окна, которые рисуются порталом прямо в body, мимо корня приложения.
  // Берём большее из двух источников: вне Telegram отступы придут нулями,
  // а внутри Telegram браузерный env() часто пустой.
  useEffect(() => {
    const root = document.documentElement;
    root.style.setProperty("--tg-inset-bottom", `max(${insetBottom}px, env(safe-area-inset-bottom, 0px))`);
    root.style.setProperty("--tg-inset-top", `max(${insetTop}px, env(safe-area-inset-top, 0px))`);
  }, [insetBottom, insetTop]);

  return { height, insetBottom, insetTop, deviceTop, fullscreen, ready };
}

/* ---------------------------------------------------------
   ROOT — home / token / create / profile, wired to bottom tabs.
   Wallet-connection state now lives here so the header's own
   "Connect" button and the Profile tab always agree on whether
   a wallet is attached.
   Fullscreen: pinned to the exact Telegram Mini App viewport
   height (see useTelegramViewport above), no fixed card size,
   no outer border/radius — so there is no leftover space below
   the bottom nav inside the Telegram WebView on any device.
--------------------------------------------------------- */

export default function TonLaunchApp() {
  const TREASURY_ADDRESS = addressForNetwork("UQD8ipaRIc2X1zJw0C8S9XfsKQOYiNAEPRUpfNidEZ3pIDdo");
// Кошелёк комиссии площадки. Он зашивается в кривую при запуске токена,
// и контракт сам отправляет туда 1% с каждой покупки и продажи. Смена
// адреса действует только на новые токены: у уже развёрнутых кривых
// получатель поменять нельзя.
// Кошелёк комиссии. Записан в тестовой форме («0Q…»), но счёт тот же —
// приводим к форме текущей сети, чтобы в боевой деньги действительно
// уходили: mainnet-форма этого же счёта — UQClGN5h…usvT.
const FEE_ADDRESS = addressForNetwork("0QClGN5huzz-Z3bwgxr7GOPe5Jyi8PNKbsNnDFKFNGbjunBZ");
const FEE_PERCENT = 0.01; // 1% комиссии
  // Балансовый API (tonapi.io) по умолчанию смотрит в mainnet. Если
  // кошелёк подключён в testnet (например, для проверки покупки на
  // тестовых TON), запрос к mainnet-адресу вернёт пустой/нулевой баланс,
  // и любая покупка будет падать в "недостаточно средств" — это и была
  // причина того, что покупка "не работала" при тесте. Переключатель
  // ниже отправляет запросы в testnet-API вместо mainnet. Важно: сам
  // TonConnectUIProvider (обычно настраивается в index/main файле, не
  // в этом) тоже должен быть сконфигурирован под testnet — иначе
  // подключаемый кошелёк не будет знать, что вы работаете в тестовой сети.
  const TON_TESTNET = TON_TESTNET_NETWORK;
  const TONAPI_HOST = TON_TESTNET ? "testnet.tonapi.io" : "tonapi.io";
  // Бесплатный tonapi.io без ключа сильно лимитирован (мы поймали
  // 429 "rate limit: free tier"). Заведите бесплатный ключ на
  // https://tonconsole.com (Project -> API Keys) и вставьте сюда —
  // лимит вырастет на порядки. С пустой строкой запросы просто
  // продолжат уходить без заголовка Authorization, как сейчас.
  const TONAPI_KEY = "";
  const [view, setView] = useState("home");
  const [tab, setTab] = useState("home");
  const [token, setToken] = useState(null);
  const [connectModalOpen, setConnectModalOpen] = useState(false);
  const { height, insetBottom, insetTop } = useTelegramViewport();
  const device = useDevice();
  const rocketVariant = typeof window !== "undefined" && /[?&]rocket=outline/.test(window.location.search) ? "outline" : "default";
  // Полёт ракеты после удачного запуска токена.
  const [rocketFlying, setRocketFlying] = useState(false);
  const rocketTimers = useRef([]);
  function playLaunchRocket() {
    rocketTimers.current.forEach(clearTimeout);
    setRocketFlying(true);
    // Убираем ракету, когда она уже ушла за верхний край.
    rocketTimers.current = [setTimeout(() => setRocketFlying(false), ROCKET_FLIGHT_MS + 60)];
  }
  useEffect(() => () => rocketTimers.current.forEach(clearTimeout), []);
  // Анимацию тянем заранее, в фоне: к моменту запуска токена она должна
  // быть готова, иначе полёт начнётся с задержкой на загрузку.
  useEffect(() => {
    const to = setTimeout(() => loadRocketAnimation(rocketVariant), 4000);
    return () => clearTimeout(to);
  }, [rocketVariant]);
  // ?rocket=1 — проиграть полёт без запуска токена: чтобы посмотреть и
  // поправить, не тратя TON.
  useEffect(() => {
    if (typeof window === "undefined" || !/[?&]rocket=1/.test(window.location.search)) return;
    // С запасом, чтобы полёт не пришёлся на заставку.
    const to = setTimeout(playLaunchRocket, 7000);
    return () => clearTimeout(to);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Always open on Home — closing and reopening the app (or refreshing)
  // should land the person back on the front page rather than wherever
  // they were before.

  // Real, live TON meme-pool feed — polled every 2.5s. Lives at the root
  // (not inside HomeView) so the currently-open token detail can also stay
  // synced to fresh data below, instead of freezing at whatever price it
  // had the moment it was tapped.
  const [tokens, setTokens] = useState([]);
  const [tokensLoading, setTokensLoading] = useState(true);
  useEffect(() => {
    let cancelled = false;
    let tick = 0;

    // Глубокий проход собирает много страниц — им наполняются «Горячие» и
    // «DEX». Гонять столько запросов каждые 15 секунд нельзя (упрёмся в
    // лимит API), поэтому обычный опрос обновляет только первую страницу,
    // а остальное освежается раз в пару минут.
    async function poll(deep) {
      // Лента бирж читается всегда, даже когда свои контракты в тестовой
      // сети: с появлением выбора сети в мемпаде она перестала мешаться
      // со своими токенами — те лежат под фильтром «Новые», — а без неё
      // раздел TON был пустым рядом с полным разделом Solana.
      // Сначала готовая лента из базы — она приходит за один запрос.
      // В источник идём, только если обход молчит.
      const live = (await fetchFeedFromCache(GT_NETWORK))
        || (deep ? await fetchTonMemePools(FEED_LIMIT, FEED_PAGES) : await fetchTonMemePools(20, 1));
      if (cancelled || !live || !live.length) { setTokensLoading(false); return; }

      setTokens((prev) => {
        if (deep || !prev.length) return live;
        // Свежие цифры по верхушке накладываем на уже собранный список,
        // не теряя пулы с дальних страниц.
        const fresh = new Map(live.map((tok) => [tok.id, tok]));
        const merged = prev.map((tok) => fresh.get(tok.id) || tok);
        const known = new Set(prev.map((tok) => tok.id));
        live.forEach((tok) => { if (!known.has(tok.id)) merged.push(tok); });
        return merged;
      });
      setTokensLoading(false);
    }

    // Сначала быстрый проход по первой странице — он снимает заставку, —
    // и только потом добор остальных страниц в фоне.
    poll(false).then(() => { if (!cancelled) poll(true); });
    const iv = setInterval(() => {
      tick += 1;
      poll(tick % FEED_DEEP_EVERY === 0);
    }, TOKEN_REFRESH_MS);
    return () => { cancelled = true; clearInterval(iv); };
  }, []);
  // Whenever a fresh poll comes in, refresh the currently-viewed token (if
  // any) with its updated row from that same poll — so price, market cap
  // and the header stats on the detail screen move in step with the feed
  // instead of staying pinned to the value at tap-time.
  useEffect(() => {
    if (!token) return;
    const fresh = tokens.find(x => x.id === token.id);
    if (fresh && fresh !== token) setToken(fresh);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [tokens]);


  // Настоящее подключение кошелька через TonConnect. `wallet` — null,
  // пока пользователь не подключил кошелёк; после подключения содержит
  // реальные данные (адрес и т.д.), которые прилетают от Tonkeeper/др.
  const wallet = useTonWallet();
  const [tonConnectUI] = useTonConnectUI();
  const connected = !!wallet;
  const walletAddress = wallet ? Address.parse(wallet.account.address).toString({ bounceable: false }) : "";
  const walletAddressShort = walletAddress ? `${walletAddress.slice(0, 4)}...${walletAddress.slice(-4)}` : "";

  // Реальный баланс TON — подтягиваем с публичного API tonapi.io по
  // адресу подключённого кошелька (не требует ключа для базовых запросов,
  // но без ключа лимит очень низкий — см. TONAPI_KEY выше).
  const [tonBalance, setTonBalance] = useState(0);
  const [tonPriceUsd, setTonPriceUsd] = useState(0);

  // Токен на кривой во внешней ленте не появляется — пары на DEX у него
  // нет, — поэтому его показатели обновляем сами, пока экран открыт.
  // Всё считается по цепочке: цена и капитализация по резервам, объём и
  // изменение по сделкам самой кривой.
  useEffect(() => {
    if (!token?.curveAddress) return;
    const curve = token.curveAddress;
    const jetton = token.tokenAddress;
    let cancelled = false;
    async function load() {
      const m = await fetchCurveMarket(curve, jetton, TON_TESTNET, tonPriceUsd);
      if (cancelled || !m) return;
      setToken((prev) => (prev && prev.curveAddress === curve ? {
        ...prev,
        price: m.priceUsd,
        mcapNum: m.mcapUsd,
        vol: fmtCompact(m.vol24Usd),
        liq: fmtCompact(m.liqUsd),
        change: m.change24,
        tx24h: m.tx24,
      } : prev));
    }
    load();
    const iv = setInterval(load, 15000);
    return () => { cancelled = true; clearInterval(iv); };
  }, [token?.curveAddress, token?.tokenAddress, tonPriceUsd]);

  // Диагностика запроса баланса — больше не рисуется на экране, но
  // остаётся в консоли (console.log/console.error) на случай отладки.
  const [tonDebug, setTonDebug] = useState(null);
  // Раньше баланс перезапрашивался только при смене адреса кошелька —
  // после успешной покупки/продажи он так и оставался старым значением
  // (в вашем случае — 0, потому что первый запрос ни разу не прошёл
  // из-за 429). Инкрементируем этот счётчик из confirmTrade, чтобы
  // эффект ниже перезапустился и подтянул баланс заново.
  const [balanceRefreshTick, setBalanceRefreshTick] = useState(0);
  useEffect(() => {
    if (!walletAddress) { setTonBalance(0); return; }
    // wallet.account.chain — это то, в какой сети реально сидит
    // подключённый кошелёк ("-239" = mainnet, "-3" = testnet). Если он
    // не равен "-3", кошелёк подключён не в testnet, и никакой запрос
    // к testnet.tonapi.io не покажет ваши тестовые TON, потому что
    // TonConnectUIProvider (в index/main файле) настроен на mainnet-
    // манифест.
    const chain = wallet?.account?.chain;
    let cancelled = false;
    // Бесплатный tonapi.io без ключа отдаёт 429 "rate limit: free tier"
    // при частых запросах (типично во время разработки с HMR/перезагрузками).
    // Ретраим с нарастающей паузой вместо того, чтобы сразу сдаваться и
    // показывать баланс 0, будто на кошельке правда пусто.
    async function fetchBalance(attempt = 0) {
      try {
        const headers = TONAPI_KEY ? { Authorization: `Bearer ${TONAPI_KEY}` } : {};
        const r = await fetch(`https://${TONAPI_HOST}/v2/accounts/${walletAddress}`, { headers });
        const body = await r.json().catch(() => null);
        if (cancelled) return;
        if (r.status === 429 && attempt < 3) {
          const delay = 1200 * (attempt + 1);
          console.warn(`[ton-debug] tonapi 429, retry in ${delay}ms (attempt ${attempt + 1}/3)`);
          setTonDebug({ chain, host: TONAPI_HOST, status: r.status, error: `rate limited, retrying (${attempt + 1}/3)` });
          setTimeout(() => fetchBalance(attempt + 1), delay);
          return;
        }
        if (!r.ok) {
          console.error("[ton-debug] tonapi error", r.status, body);
          setTonBalance(0);
          setTonDebug({ chain, host: TONAPI_HOST, status: r.status, error: JSON.stringify(body).slice(0, 160) });
          return;
        }
        console.log("[ton-debug] tonapi response:", body);
        setTonBalance(body && body.balance ? Number(body.balance) / 1e9 : 0);
        setTonDebug({ chain, host: TONAPI_HOST, status: r.status, balanceRaw: body?.balance });
      } catch (err) {
        if (cancelled) return;
        console.error("[ton-debug] tonapi fetch failed:", err);
        setTonBalance(0);
        setTonDebug({ chain, host: TONAPI_HOST, error: String(err).slice(0, 160) });
      }
    }
    console.log("[ton-debug] wallet.account.chain:", chain, "address:", walletAddress);
    fetchBalance();
    return () => { cancelled = true; };
  }, [walletAddress, balanceRefreshTick]);
  const [tonPriceChecked, setTonPriceChecked] = useState(false);
  useEffect(() => {
    // Два источника: если один недоступен (у CoinGecko бывает лимит на
    // адрес), курс всё равно приедет. Без курса приложение не может
    // показать ни цену, ни капитализацию, поэтому запасной источник тут
    // не роскошь.
    async function loadRate() {
      const sources = [
        async () => {
          const r = await fetch("https://api.coingecko.com/api/v3/simple/price?ids=the-open-network&vs_currencies=usd");
          const d = await r.json();
          return (d && d["the-open-network"] && d["the-open-network"].usd) || 0;
        },
        async () => {
          const r = await fetch(`${TONAPI_MAINNET_BASE}/v2/rates?tokens=ton&currencies=usd`);
          const d = await r.json();
          return Number(d?.rates?.TON?.prices?.USD) || 0;
        },
      ];
      for (const load of sources) {
        try {
          const usd = await load();
          if (usd > 0) {
            tonUsdLive = usd;
            setTonPriceUsd(usd);
            return true;
          }
        } catch (e) { /* пробуем следующий источник */ }
      }
      return false;
    }
    // Пока курса нет, в приложении пусто: без него не считаются ни цена,
    // ни капитализация, ни шкала до листинга — и только что запущенный
    // токен не появляется на главной. Оба источника падают редко, но
    // тогда ждать общего пятиминутного круга слишком долго: пробуем
    // снова через несколько секунд, разводя попытки всё дальше.
    let retryTimer = null;
    let stopped = false;
    (async () => {
      const ok = await loadRate();
      setTonPriceChecked(true);
      if (ok || stopped) return;
      let delay = 8000;
      const again = async () => {
        if (stopped || await loadRate()) return;
        delay = Math.min(delay * 2, 60000);
        retryTimer = setTimeout(again, delay);
      };
      retryTimer = setTimeout(again, delay);
    })();
    // Курс живой: за час он успевает уйти, а экран может висеть долго.
    const iv = setInterval(loadRate, 5 * 60 * 1000);
    return () => { stopped = true; clearTimeout(retryTimer); clearInterval(iv); };
  }, []);

  // Global toast — rendered once at the root (not nested inside any
  // scrolling view), so it's never clipped no matter which screen
  // triggered it.
  const [toast, setToast] = useState(null);
  // Отдельный признак ухода: сама подсказка ещё в разметке, но уже
  // проигрывает анимацию вверх. Без него она исчезала мгновенно.
  const [toastLeaving, setToastLeaving] = useState(false);
  // Номер показа: по нему подсказка пересоздаётся, и анимация появления
  // проигрывается заново даже если текст совпал с предыдущим.
  const [toastSeq, setToastSeq] = useState(0);
  const toastTimer = useRef(null);
  const toastHideTimer = useRef(null);
  function showToast(msg) {
    clearTimeout(toastTimer.current);
    clearTimeout(toastHideTimer.current);
    setToast(msg);
    setToastLeaving(false);
    setToastSeq((n) => n + 1);
    haptic();
    toastTimer.current = setTimeout(() => setToastLeaving(true), 2400);
    toastHideTimer.current = setTimeout(() => {
      setToast(null);
      setToastLeaving(false);
    }, 2400 + TOAST_OUT_MS);
  }
  useEffect(() => () => {
    clearTimeout(toastTimer.current);
    clearTimeout(toastHideTimer.current);
  }, []);

  // Profile / account state lives here (not inside ProfileView) so the
  // AuthModal bottom sheet can be rendered as a direct child of
  // the root — exactly like ConnectModal already is — instead of being
  // nested inside ProfileView's own scrollable content, which was
  // clipping it off-screen.
  //
  // Source of truth is now the real Supabase auth session (not
  // localStorage) — this is what makes login persist across reloads and
  // work across devices instead of just faking it client-side.
  const EMPTY_PROFILE = { nickname: "", email: "", bio: "", avatarUrl: null, emoji: null, verified: false };
  const [accountCreated, setAccountCreated] = useState(false);
  const [profile, setProfile] = useState(EMPTY_PROFILE);
  const [authChecked, setAuthChecked] = useState(false);
  const [userId, setUserId] = useState(null);

  // Адрес подключённого кошелька уходит в профиль: по нему бот в
  // переписке показывает баланс и собирает продажу. Ключей это не
  // касается — адрес и так виден в любом обозревателе цепочки. Эффект
  // стоит здесь, а не рядом с самим адресом: userId объявлен только
  // сейчас, и обращение к нему выше валит приложение на загрузке.
  useEffect(() => {
    if (!userId || !walletAddress) return;
    supabase
      .from("profiles")
      .update({ wallet_address: walletAddress })
      .eq("id", userId)
      .then(({ error }) => {
        if (error) console.warn("[mintly] не удалось сохранить кошелёк:", error.message);
      });
  }, [userId, walletAddress]);

  // Сколько человек пришло по своей ссылке. Считается по профилям, где
  // стоит связь с этим пользователем: то есть по тем, кто действительно
  // зашёл и завёл аккаунт, а не по кликам.
  // Что присылать в Telegram и с какой суммы. Живёт в профиле: сообщения
  // шлёт сервер, и на устройстве эти настройки ему недоступны.
  const [notifyPrefs, setNotifyPrefs] = useState({ buys: true, minTon: 0.05, progress: true });
  async function updateNotifyPrefs(patch) {
    const next = { ...notifyPrefs, ...patch };
    setNotifyPrefs(next);
    if (!userId) return;
    const { error } = await supabase
      .from("profiles")
      .update({ notify_buys: next.buys, notify_min_ton: next.minTon, notify_progress: next.progress })
      .eq("id", userId);
    if (error) {
      console.warn("[mintly] notify prefs not saved:", error.message);
      showToast(t("saveFailed"));
    }
  }

  const [inviteCount, setInviteCount] = useState(0);
  const [invitesReady, setInvitesReady] = useState(false);
  useEffect(() => {
    if (!userId) { setInviteCount(0); setInvitesReady(false); return; }
    let cancelled = false;
    (async () => {
      try {
        const { count } = await supabase
          .from("profiles")
          .select("id", { count: "exact", head: true })
          .eq("invited_by", userId);
        if (!cancelled) setInviteCount(count || 0);
      } catch (err) {
        // Колонки ещё нет — показываем ноль, а не ломаем экран.
        console.warn("[mintly] invite count unavailable:", err && err.message);
      } finally {
        if (!cancelled) setInvitesReady(true);
      }
    })();
    return () => { cancelled = true; };
  }, [userId]);

  /* Непрочитанные ответы поддержки. Нужны ради точки на пункте настроек:
     ответ приходит и в личку Telegram, но её человек мог отключить или
     потерять среди чатов, а приложение он открывает сам. */
  const [supportUnread, setSupportUnread] = useState(0);
  useEffect(() => {
    if (!userId) { setSupportUnread(0); return; }
    let cancelled = false;
    async function пересчитать() {
      try {
        // Своя переписка и так единственная, что видна: строки закрыты
        // политикой доступа (см. supabase_support.sql).
        const { count } = await supabase
          .from("support_messages")
          .select("id", { count: "exact", head: true })
          .eq("from_admin", true)
          .eq("seen_by_user", false);
        if (!cancelled) setSupportUnread(count || 0);
      } catch (err) {
        // Таблицы ещё нет — просто не показываем точку.
      }
    }
    пересчитать();
    const t = setInterval(пересчитать, 60000);
    return () => { cancelled = true; clearInterval(t); };
  }, [userId]);

  async function loadProfileForUser(user) {
    setUserId(user ? user.id : null);
    if (!user) { setAccountCreated(false); setProfile(EMPTY_PROFILE); setMyTokens([]); setCoinsGranted(0); return; }
    // Берём строку целиком, а не список колонок. Список ломался при
    // любом расширении: стоило добавить в приложение колонку, которой в
    // базе ещё нет (owned_cosmetics, coins_granted), как весь запрос
    // отвечал ошибкой — и человек оказывался «без аккаунта», хотя вход
    // прошёл. Лишние поля строки нам не мешают, а недостающие просто
    // приходят пустыми.
    const { data: prof, error } = await supabase
      .from("profiles")
      .select("*")
      .eq("id", user.id)
      .single();
    if (error || !prof) { setAccountCreated(false); setProfile(EMPTY_PROFILE); setMyTokens([]); return; }
    setProfile({ nickname: prof.nickname, email: prof.email, bio: prof.bio || "", avatarUrl: prof.avatar_url, emoji: prof.emoji, verified: !!prof.verified });
    // Ступень знака создателя лежит в профиле, а не только на устройстве:
    // её должны видеть другие. Здесь только читаем, повышает её эффект
    // ниже, когда посчитается лучшая капитализация.
    setCreatorTier(Number(prof.creator_tier) || 0);
    setCoinsGranted(Number(prof.coins_granted) || 0);
    // Потраченное. У тех, кто покупал до появления этой колонки, она
    // пустая — заполняем её один раз суммой цен уже купленного, иначе
    // баланс подскочил бы на всё когда-либо потраченное.
    {
      const stored = Number(prof.coins_spent);
      const fromServer = Array.isArray(prof.owned_cosmetics) ? prof.owned_cosmetics : [];
      if (Number.isFinite(stored) && stored > 0) {
        setCoinsSpentTotal(stored);
      } else {
        const guessed = coinsSpent(new Set(fromServer));
        setCoinsSpentTotal(guessed);
        if (guessed > 0) {
          supabase.from("profiles").update({ coins_spent: guessed }).eq("id", user.id)
            .then(({ error }) => { if (error) console.warn("[mintly] coins_spent not saved:", error.message); });
        }
      }
    }
    // Настройки уведомлений. Колонок может не быть, если SQL ещё не
    // выполнен — тогда действуют значения по умолчанию, как и на сервере.
    setNotifyPrefs({
      buys: prof.notify_buys !== false,
      progress: prof.notify_progress !== false,
      minTon: Number(prof.notify_min_ton) >= 0 ? Number(prof.notify_min_ton) : 0.05,
    });
    setAccountCreated(true);
    // Косметика хранится в профиле, а не только на устройстве — иначе её
    // не увидят другие. Но если на сервере пусто, а локально что-то
    // надето (выбор сделан до переезда в базу), локальное не затираем, а
    // наоборот — поднимаем на сервер.
    setCosmetics((local) => {
      const serverFrame = FRAME_BY_ID[prof.frame_id] ? prof.frame_id : "none";
      const serverCard = CARD_BY_ID[prof.card_id] ? prof.card_id : "none";
      const frame = serverFrame === "none" && local.frame !== "none" ? local.frame : serverFrame;
      const card = serverCard === "none" && local.card !== "none" ? local.card : serverCard;

      const patch = {};
      if (frame !== serverFrame) patch.frame_id = frame;
      if (card !== serverCard) patch.card_id = card;
      if (Object.keys(patch).length) {
        supabase.from("profiles").update(patch).eq("id", user.id).then(({ error }) => {
          if (error) console.warn("[mintly] failed to migrate cosmetics:", error.message);
        });
      }
      return { frame, card };
    });
    // Покупки — так же: список с сервера и список с устройства
    // объединяются, чтобы ничего не пропало ни при смене телефона, ни у
    // того, кто покупал ещё до входа в аккаунт.
    setOwned((local) => {
      const fromServer = Array.isArray(prof.owned_cosmetics) ? prof.owned_cosmetics : [];
      const merged = new Set([...local, ...fromServer]);
      if (merged.size !== fromServer.length) {
        supabase.from("profiles").update({ owned_cosmetics: [...merged] }).eq("id", user.id).then(({ error }) => {
          if (error) console.warn("[mintly] failed to sync purchases:", error.message);
        });
      }
      try {
        if (typeof window !== "undefined") window.localStorage.setItem("mintly_owned", JSON.stringify([...merged]));
      } catch (e) { /* localStorage unavailable */ }
      return merged;
    });
    loadMyTokens(user.id);
  }

  // "My Tokens" now live in Supabase (table `tokens`, see
  // "My Tokens" now live in Supabase (table `tokens`, see
  // supabase_tokens_schema.sql) instead of localStorage — this makes them
  // persist across devices/reinstalls and survive a logout/login, tied to
  // the real account (owner_id = auth.uid()) instead of just this browser.
  /* Готовые числа из curve_cache — их складывает серверный обход
     (api/refresh-curves.js). В долларах ничего не храним: курс меняется
     чаще обхода, поэтому цену и объём переводим здесь, а при смене
     курса пересчитываем заново (см. эффект ниже). */
  function применитьКеш(tok, c, rate) {
    if (!c) return tok;
    // Курс берём и из живого значения тоже: список перечитывается по
    // таймеру, а тот держит в замыкании состояние первого кадра, где
    // курса ещё нет. Из-за этого каждое обновление затирало посчитанные
    // цифры нулями — на экране всё стоило «$0».
    // Курс — той монеты, в которой живёт кривая токена. Числа в кеше
    // считаются в родной монете цепочки, и токен Solana, пересчитанный
    // по TON, показывал капитализацию втрое мимо.
    const курс = tok.chain === "solana"
      ? solUsd()
      : (rate > 0 ? rate : tonUsd());
    return {
      ...tok,
      priceTon: c.price_ton,
      vol24Ton: c.vol24_ton,
      // Капитализация — цена за весь выпуск, как и на прочих площадках.
      mcapNum: c.price_ton * курс * (c.supply || 1000000000),
      vol: fmtCompact(c.vol24_ton * курс),
      liq: fmtCompact(c.real_ton * курс),
      change: c.change24,
      tx24h: c.tx24,
      raisedTon: c.real_ton,
      graduationTon: c.graduation_ton,
      graduated: !!c.graduated,
      holders: c.holders,
      logoUrl: tok.logoUrl || c.logo_url || null,
      кешОт: c.updated_at ? new Date(c.updated_at).getTime() : 0,
    };
  }

  /* Цепочка токена: сказанному в базе верим, а пустое поле разбираем по
   адресу. Без этого мемкоин Solana, записанный до появления колонки,
   показывался как TON-овский — с ценой в TON и шкалой до 85 TON. */
function цепочкаПоАдресу(chain, address) {
  if (chain) return chain === "solana" ? "solana" : "ton";
  const адрес = String(address || "").trim();
  return /^[1-9A-HJ-NP-Za-km-z]{32,44}$/.test(адрес) && !/^(EQ|UQ|kQ|0Q)/.test(адрес) ? "solana" : "ton";
}

function mapTokenRow(row) {
    return {
      id: row.id,
      name: row.name,
      ticker: row.ticker,
      emoji: "🚀",
      verified: false,
      mcapNum: 0,
      liq: "0",
      vol: "0",
      change: 0,
      tx24h: 0,
      address: row.address,
      poolAddress: row.pool_address,
      // Пара на бирже, заведённая после закрытия кривой. Отдельно от
      // poolAddress: тот отвечает за токены, пришедшие из ленты биржи, а
      // этот — за свои, у которых кривая уже отторговала.
      dexPoolAddress: row.dex_pool_address || null,
      curveAddress: row.curve_address || null,
      curveJettonWallet: row.curve_jetton_wallet || null,
      creatorWallet: row.creator_wallet || null,
      buyTokens: Number(row.buy_tokens) || 0,
      explorerUrl: row.explorer_url,
      supply: row.supply,
      buyAmount: row.buy_amount,
      logoUrl: row.logo_url,
      // Описание пишется при запуске и больше не меняется — это обещание
      // автора, а не подпись под картинкой. В карточке мемпада по нему
      // видно, что за токен, ещё до того, как его открыли.
      description: row.description || null,
      // Обложка: ею подкладывается карточка «в центре внимания».
      bannerUrl: row.banner_url || null,
      network: row.network || "mainnet",
      // Сеть токена: по ней решается, у какой цепочки спрашивать цену и
      // каким кошельком торговать. Колонка появилась не сразу, и у
      // токенов постарше она пуста — тогда узнаём по самому адресу: у
      // TON это 48 символов base64url с приставкой EQ/UQ/kQ/0Q, у
      // Solana — 32-44 символа base58.
      chain: цепочкаПоАдресу(row.chain, row.address),
      ownerId: row.owner_id || null,
      createdAt: new Date(row.created_at).getTime(),
    };
  }
  async function loadMyTokens(uid) {
    const { data, error } = await supabase
      .from("tokens")
      // Те же готовые числа, что и в ленте: свои токены показываются с
      // ценой и шкалой без единого обращения к цепочке.
      .select("*, curve_cache(price_ton,real_ton,graduation_ton,tokens_sold,supply,fee_bps,graduated,holders,vol24_ton,change24,tx24,logo_url,updated_at)")
      .eq("owner_id", uid)
      .in("network", ВИДИМЫЕ_СЕТИ)
      .order("created_at", { ascending: false });
    if (error) { console.error("[mintly] failed to load tokens from Supabase:", error); return; }
    const rows = (data || []).map((row) => {
      const кеш = Array.isArray(row.curve_cache) ? row.curve_cache[0] : row.curve_cache;
      return применитьКеш(mapTokenRow(row), кеш, tonPriceUsd);
    });
    setMyTokens(rows);
    дополнитьЛоготипы(rows);
  }

  /* Логотипы, которых нет в базе.
   *
   * У токенов, запущенных до того, как приложение стало брать ссылку
   * прямо с запуска, поле пустое — в ленте вместо картинки ракета. В
   * цепочке логотип при этом лежит всегда: метаданные уезжают в
   * хранилище раньше выпуска. Добираем их разом для всего списка и
   * подставляем в оба (лента и «мои»), а своим токенам заодно
   * дописываем ссылку в базу — тогда картинку увидят и остальные, и
   * бот, а не только эта вкладка.
   */
  const логотипыДобраны = useRef(new Set());
  async function дополнитьЛоготипы(rows) {
    const без = (rows || [])
      .filter((tok) => !tok.logoUrl && tok.address && !логотипыДобраны.current.has(tok.id))
      .slice(0, 12);
    if (!без.length) return;
    без.forEach((tok) => логотипыДобраны.current.add(tok.id));
    // Последним в очереди: картинка подождёт, цена — нет.
    const мета = await Promise.all(без.map((tok) => fetchJettonMeta(tok.address, TON_TESTNET, TON_PRIORITY.background)));
    const найдено = new Map();
    без.forEach((tok, i) => {
      const img = мета[i] && мета[i].image;
      if (img) найдено.set(tok.id, img);
    });
    if (!найдено.size) return;
    const подставить = (prev) => prev.map((tok) => (найдено.has(tok.id) ? { ...tok, logoUrl: найдено.get(tok.id) } : tok));
    setCommunityTokens(подставить);
    setMyTokens(подставить);
    if (!userId) return;
    for (const tok of без) {
      const img = найдено.get(tok.id);
      // Править чужую строку не даст политика — пробуем только свои.
      if (img && tok.ownerId === userId) {
        await supabase.from("tokens").update({ logo_url: img }).eq("id", tok.id);
      }
    }
  }

  // Public feed for the mempad's "Новые" tab — every token launched by
  // every user, not just the signed-in one (that's `myTokens`, scoped to
  // owner_id above). RLS on `tokens` allows public select, so this works
  // even for signed-out visitors.
  const [communityTokens, setCommunityTokens] = useState([]);

  const [communityLoaded, setCommunityLoaded] = useState(false);
  // Сколько кеш считается свежим. Обход ходит раз в минуту; три минуты
  // запаса — на случай, если один заход подзадержался. Пока кеш свежий,
  // приложение цепочку не трогает вовсе.
  const КЕШ_СВЕЖ_МС = 3 * 60 * 1000;

  async function loadCommunityTokens() {
    const { data, error } = await supabase
      .from("tokens")
      // Числа кривой приезжают тем же запросом: связь по token_id
      // описана в supabase_curve_cache.sql, и PostgREST подставляет их
      // сам. Это и есть главная экономия — вместо трёх обращений к
      // цепочке на каждый токен один запрос к базе на всю ленту.
      .select("*, curve_cache(price_ton,real_ton,graduation_ton,tokens_sold,supply,fee_bps,graduated,holders,vol24_ton,change24,tx24,logo_url,updated_at)")
      // Токены чужой сети в ленте — мусор: их кривых в этой сети нет,
      // и каждое чтение рынка возвращало бы нули. Отсекаем в запросе, а
      // не после: иначе двести строк тестовых токенов вытеснили бы
      // боевые из выборки.
      .in("network", ВИДИМЫЕ_СЕТИ)
      .order("created_at", { ascending: false })
      .limit(200);
    if (error) { console.error("[mintly] failed to load community tokens from Supabase:", error); setCommunityLoaded(true); return; }
    const rows = (data || []).map((row) => {
      const кеш = Array.isArray(row.curve_cache) ? row.curve_cache[0] : row.curve_cache;
      return применитьКеш(mapTokenRow(row), кеш, tonPriceUsd);
    });
    setCommunityTokens(rows);
    setCommunityLoaded(true);

    // Кеш свежий — цепочку не трогаем совсем: всё уже посчитано на
    // сервере, и лента показана целиком с первого кадра. Дочитываем
    // только то, что обход не успел покрыть, — свежезапущенный токен
    // или заглохшее расписание.
    const свежо = Date.now() - КЕШ_СВЕЖ_МС;
    const устарели = rows.filter((tok) => tok.curveAddress && !(tok.кешОт > свежо));
    if (!устарели.length) return;

    // Двумя волнами: сперва цена и шкала до биржи одним запросом на
    // токен, потом история сделок. Так лента перестаёт быть пустой в
    // три раза раньше, а объём и движение дописываются, когда доедут.
    await enrichCurveMarkets(устарели, { быстро: true });
    enrichCurveMarkets(устарели);
    // Логотипы — в самом конце: пустой кружок на карточке терпит, а
    // отсутствующая цена нет.
    дополнитьЛоготипы(rows);
  }

  /* Курс приехал после ленты — переводим сохранённые числа кривой в
     доллары заново. Сами они лежат в TON: курс меняется чаще, чем идёт
     обход, и пересчитать дешевле, чем ходить в цепочку. */
  useEffect(() => {
    const курс = tonPriceUsd > 0 ? tonPriceUsd : tonUsd();
    if (!(курс > 0)) return;
    const пересчитать = (prev) => {
      let менялось = false;
      const ряд = prev.map((tok) => {
        if (tok.priceTon == null || tok.mcapNum > 0) return tok;
        менялось = true;
        return {
          ...tok,
          mcapNum: tok.priceTon * курс * 1000000000,
          vol: fmtCompact((tok.vol24Ton || 0) * курс),
          liq: fmtCompact((tok.raisedTon || 0) * курс),
        };
      });
      return менялось ? ряд : prev;
    };
    // Оба списка: «Новые» в мемпаде показывают свои токены, и без этого
    // у них оставались нули, пока не перезапустишь приложение.
    setCommunityTokens(пересчитать);
    setMyTokens(пересчитать);
  }, [tonPriceUsd]);

  // Дочитывает у кривых всё, чего нет в базе: цену, капитализацию, объём
  // и — для блока «Почти на бирже» — собранное и цель. Вынесено
  // отдельно, потому что вызывается не только при первой загрузке:
  // рынок читается по курсу TON, а он приходит своим запросом и может
  // опоздать. Раньше в этом случае числа не появлялись вовсе до
  // перезапуска приложения — и только что созданный токен не показывался
  // на главной, хотя в базе и в цепочке был.
  const enriching = useRef(false);
  async function enrichCurveMarkets(rows, { быстро = false } = {}) {
    const withCurve = (rows || []).filter((tok) => tok.curveAddress).slice(0, 12);
    if (!withCurve.length || enriching.current) return;
    enriching.current = true;
    try {
    const markets = await Promise.all(
      withCurve.map((tok) => fetchCurveMarket(tok.curveAddress, tok.address, TON_TESTNET, tonPriceUsd, { быстро })),
    );
    const priced = new Map();
    withCurve.forEach((tok, i) => {
      const m = markets[i];
      if (!m) return;
      priced.set(tok.id, {
        priceTon: m.priceTon,
        // Капитализация — цена за весь выпуск, а не за проданное: так её
        // считают на всех подобных площадках. Выпуск читается с цепочки.
        mcapNum: m.mcapUsd,
        liq: fmtCompact(m.liqUsd),
        // Объём и движение за сутки живут в истории сделок, а её быстрая
        // волна не читает. Ставить нули не годится: на месте уже
        // показанных чисел они выглядели бы обвалом, поэтому в этом
        // режиме поля просто не трогаем.
        ...(быстро ? null : { vol: fmtCompact(m.vol24Usd), change: m.change24, tx24h: m.tx24 }),
        // Для тонкой шкалы в ленте: сколько собрано и сколько нужно.
        raisedTon: Number(m.state.realTon) / 1e9,
        graduationTon: Number(m.state.graduationTon) / 1e9,
        // Закрытая кривая — это «вышел на биржу». Витрине на главной
        // это число нужно живым, а не таким, каким его записал ночной
        // обход.
        graduated: !!m.state.graduated,
      });
    });
    if (!priced.size) return;
    setCommunityTokens((prev) =>
      prev.map((tok) => {
        const p = priced.get(tok.id);
        return p ? { ...tok, ...p } : tok;
      }),
    );
    } finally {
      enriching.current = false;
    }
  }

  // Курс приехал позже ленты — дочитываем рынок тем токенам, которым не
  // досталось. Сюда же попадает только что запущенный токен: он
  // добавляется в ленту сразу, но без чисел кривой.
  useEffect(() => {
    if (!(tonPriceUsd > 0)) return;
    const need = communityTokens.filter((tok) => tok.curveAddress && tok.graduationTon == null);
    if (!need.length) return;
    enrichCurveMarkets(need);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [tonPriceUsd, communityTokens]);

  // Цифры обновляются и сами по себе, иначе застыли бы на том, что было
  // в момент открытия. Перечитываем ленту из базы: там уже лежит всё
  // посчитанное сервером, и это один дешёвый запрос вместо обхода
  // цепочки. Раз в минуту и только на видимой вкладке.
  useEffect(() => {
    const id = setInterval(() => {
      if (document.visibilityState !== "visible") return;
      loadCommunityTokens();
    }, 60000);
    return () => clearInterval(id);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    let active = true;
    (async () => {
      let { data: { session } } = await supabase.auth.getSession();
      // Внутри Telegram повторный вход происходит сам: подпись initData
      // уже есть, спрашивать человека не о чем. А вот первый — нет: там
      // заводится аккаунт, и ник для него человек выбирает сам, поэтому
      // вместо тихого входа открываем окно. Если не вышло — просто
      // открываем приложение без аккаунта, кнопка входа остаётся в профиле.
      let needsSignup = false;
      // Сессия пережила выход — так бывает, когда выход не доехал до
      // сервера или память телефона вернула прошлое значение. Раз человек
      // выходил и с тех пор не входил, доводим выход до конца здесь.
      if (session && isSignedOutByHand()) {
        try { await supabase.auth.signOut(); } catch (e) { /* уже не важно */ }
        session = null;
      }
      if (session) {
        markSeenSession();
        // Пришли по чужой ссылке приглашения, будучи уже внутри —
        // засчитываем её отдельно: вход, который обычно передаёт метку,
        // здесь не понадобится. Не ждём ответа, приложению это не мешает.
        linkReferralIfAny();
      }
      // Молчаливый вход — только при первом знакомстве с приложением на
      // этом телефоне. Дальше сессия живёт сама; если её нет, значит из
      // аккаунта вышли или её срок истёк, и правильно показать кнопку
      // входа, а не заводить сессию за человека. Раньше вход случался при
      // каждом запуске, и выйти было нельзя: подпись Telegram лежит в
      // окне всегда, поэтому обновление страницы возвращало внутрь.
      if (!session && telegramInitData() && storageWorks() && !isSignedOutByHand() && !hasSeenSession()) {
        // Разведка может не ответить — сеть, лимит, перезапуск сервера.
        // Тогда пробуем войти как есть: у того, кто уже заходил, вход
        // пройдёт, а новому сервер ответит «нужен ник», и мы откроем
        // окно. Раньше при неудачной разведке вход просто не начинался,
        // и человек оказывался выкинутым из аккаунта на ровном месте.
        let exists = null;
        try {
          exists = (await probeTelegramAccount()).exists;
        } catch (err) {
          console.warn("[mintly] telegram probe failed:", err && err.message);
        }
        if (exists === false) {
          needsSignup = true;
        } else {
          try {
            await signInWithTelegram();
            session = (await supabase.auth.getSession()).data.session;
          } catch (err) {
            if ((err && err.message) === "nickname_required") needsSignup = true;
            else console.warn("[mintly] telegram auto sign-in failed:", err && err.message);
          }
        }
      }
      if (!active) return;
      await loadProfileForUser(session?.user || null);
      setAuthChecked(true);
      if (needsSignup) {
        setProfileModalMode("create");
        setProfileModalOpen(true);
      }
    })();
    const { data: listener } = supabase.auth.onAuthStateChange((_event, session) => {
      // Человек вышел — запоздалое событие не должно втащить его назад.
      // События приходят и после выхода: подписка сообщает о сессии,
      // которую успела прочитать из памяти телефона, и профиль
      // загружался поверх только что закрытого аккаунта.
      if (session && isSignedOutByHand()) return;
      loadProfileForUser(session?.user || null);
    });
    loadCommunityTokens();

    /* Лента запусков живая: токен, созданный кем-то минуту назад, должен
       появиться сам, без перезахода в приложение. Обновляемся только
       когда экран открыт — фоновому приложению лента не нужна, а запросы
       в базу стоят денег и батареи. */
    const обновление = setInterval(() => {
      if (typeof document === "undefined" || document.visibilityState === "visible") {
        loadCommunityTokens();
      }
    }, СВОИ_ОБНОВЛЕНИЕ_МС);
    const приВозврате = () => {
      if (document.visibilityState === "visible") loadCommunityTokens();
    };
    if (typeof document !== "undefined") document.addEventListener("visibilitychange", приВозврате);

    /* Живая подписка на базу поверх таймера.
     *
     * Таймер — это в среднем полминуты ожидания: человек запустил токен,
     * показывает его другу, а у того в ленте пусто. Подписка приносит
     * новую строку в ту же секунду, когда она появилась в базе.
     *
     * Таймер при этом остаётся: соединение рвётся в метро и на слабой
     * связи, а у площадки может быть не включена репликация таблицы —
     * тогда лента просто продолжает обновляться по-старому, и никто
     * ничего не замечает.
     *
     * Перечитываем список целиком, а не вставляем пришедшую строку:
     * рыночные числа лежат в отдельной таблице, и склеивать их здесь
     * значит держать вторую копию той же логики. */
    let канал = null;
    try {
      канал = supabase
        .channel("лента-запусков")
        .on("postgres_changes", { event: "INSERT", schema: "public", table: "tokens" }, () => {
          if (typeof document === "undefined" || document.visibilityState === "visible") loadCommunityTokens();
        })
        .subscribe();
    } catch (e) {
      console.warn("[mintly] живая лента недоступна, остаётся обновление по таймеру:", e && e.message);
    }

    return () => {
      active = false;
      listener.subscription.unsubscribe();
      clearInterval(обновление);
      if (канал) supabase.removeChannel(канал);
      if (typeof document !== "undefined") document.removeEventListener("visibilitychange", приВозврате);
    };
  }, []);

  const [profileModalOpen, setProfileModalOpen] = useState(false);
  const [profileModalMode, setProfileModalMode] = useState("create");
  // Какую вкладку примерки открыть, когда в профиль пришли из магазина.
  const [lookFocus, setLookFocus] = useState(null);
  const [settingsItem, setSettingsItem] = useState(null);
  const [manageToken_, setManageToken_] = useState(null);
  const [tradeModal, setTradeModal] = useState(null); // { mode: 'buy' | 'sell' }
  // Настоящий баланс открытого токена на кошельке. Пока он не пришёл —
  // null, и окно сделки временно опирается на локальный счётчик.
  const [chainHolding, setChainHolding] = useState(null);
  // Адрес своего кошелька жетона узнаём заранее, при открытии окна
  // сделки. Спрашивать его в момент нажатия нельзя: ожидание ответа
  // разрывает цепочку от жеста пользователя, и Telegram сворачивает окно
  // кошелька раньше, чем по нему успевают нажать.
  const [chainJettonWallet, setChainJettonWallet] = useState(null);
  // Состояние кривой для предпросчёта суммы сделки. Без него окно
  // считало по цене из ленты, а у токенов на кривой её нет — отсюда
  // «вы получите 0».
  const [tradeCurveState, setTradeCurveState] = useState(null);
  const [chainHoldingRaw, setChainHoldingRaw] = useState(null);
  // Настоящий баланс открытого токена спрашиваем у сети — при открытии
  // окна сделки и после каждой сделки. Локальный счётчик остаётся только
  // как запасной вариант, пока ответ не пришёл.
  useEffect(() => {
    const jetton = token?.tokenAddress;
    if (!tradeModal || !jetton || !walletAddress) { setChainHolding(null); setChainJettonWallet(null); setTradeCurveState(null); return; }
    if (token?.curveAddress) {
      fetchCurveState(token.curveAddress, TON_TESTNET, TON_PRIORITY.token).then((state) => {
        if (!cancelled && state) setTradeCurveState(state);
      });
    }
    let cancelled = false;
    fetchJettonAccount(jetton, walletAddress, TON_TESTNET).then((info) => {
      if (cancelled || !info) return;
      if (info.balance != null) setChainHolding(info.balance);
      if (info.raw != null) setChainHoldingRaw(info.raw);
      if (info.wallet) setChainJettonWallet(info.wallet);
    });
    return () => { cancelled = true; };
  }, [tradeModal, token?.tokenAddress, walletAddress, balanceRefreshTick]);
  /* Что лежит на кошельке из запущенного здесь же. Спрашиваем у сети, а
     не у локального счётчика: человек мог купить с другого устройства
     или продать вне приложения. Раньше этого списка не было вовсе —
     продать можно было, только найдя свой токен в ленте и открыв его. */
  const [walletHoldings, setWalletHoldings] = useState([]);
  const [holdingsReady, setHoldingsReady] = useState(false);
  useEffect(() => {
    if (!connected || !walletAddress || !communityTokens.length) {
      setWalletHoldings([]);
      setHoldingsReady(!!walletAddress ? true : false);
      return;
    }
    let cancelled = false;
    (async () => {
      // Больше десятка за раз не спрашиваем: у tonapi без ключа
      // считанные запросы в секунду, а список может быть длинным.
      const list = communityTokens.filter((tok) => tok.address).slice(0, 14);
      const found = [];
      for (const tok of list) {
        if (cancelled) return;
        try {
          const info = await fetchJettonAccount(tok.address, walletAddress, TON_TESTNET);
          if (info && info.balance > 0) found.push({ tok, amount: info.balance });
        } catch (e) { /* один не ответил — остальные всё равно нужны */ }
      }
      if (!cancelled) { setWalletHoldings(found); setHoldingsReady(true); }
    })();
    return () => { cancelled = true; };
  }, [connected, walletAddress, communityTokens, balanceRefreshTick]);

  const [appSettings, setAppSettings] = useState(() => {
    const base = { language: "RU", theme: "Dark", pinEnabled: false };
    try {
      if (typeof window !== "undefined") {
        const savedTheme = window.localStorage.getItem("mintly_theme");
        const savedLang = window.localStorage.getItem("mintly_language");
        if (savedTheme) base.theme = savedTheme;
        if (savedLang) base.language = savedLang;
      }
    } catch (e) { /* localStorage unavailable */ }
    applyTheme(base.theme);
    setLang(base.language);
    return base;
  });
  function updateAppSetting(key, value) {
    if (key === "theme") applyTheme(value);
    if (key === "language") setLang(value);
    setAppSettings((s) => ({ ...s, [key]: value }));
    try {
      if (typeof window !== "undefined") {
        if (key === "theme") window.localStorage.setItem("mintly_theme", value);
        if (key === "language") window.localStorage.setItem("mintly_language", value);
      }
    } catch (e) { /* localStorage unavailable */ }
    showToast(key === "theme" ? (value === "White" ? t("themeChangedWhite") : t("themeChangedDark")) : t("settingsSaved"));
  }

  // Косметика из магазина — рамка аватарки и карточка профиля. Это чисто
  // оформление устройства, серверу о нём знать нечего, поэтому храним в
  // localStorage рядом с темой и языком.
  const [cosmetics, setCosmetics] = useState(() => {
    const base = { frame: "none", card: "none" };
    try {
      if (typeof window !== "undefined") {
        const f = window.localStorage.getItem("mintly_frame");
        const c = window.localStorage.getItem("mintly_card");
        if (f && FRAME_BY_ID[f]) base.frame = f;
        if (c && CARD_BY_ID[c]) base.card = c;
      }
    } catch (e) { /* localStorage unavailable */ }
    return base;
  });
  const COSMETIC_STORAGE = { frame: "mintly_frame", card: "mintly_card" };

  /* Купленные предметы. Баланс монет отдельно нигде не лежит: он
     считается как «заработано достижениями минус потрачено на покупки».
     Значит рассинхронизировать его нечему, а хранить нужно только список
     покупок — на устройстве и в профиле, чтобы он не пропал при смене
     телефона. */
  /* Монеты, выданные вручную из базы (колонка coins_granted). Нужны для
     раздач и проверок: обычный путь — достижения, но иногда монеты надо
     просто начислить, и городить ради этого отдельный экран незачем.
     Правится только в Supabase, приложение колонку не пишет. */
  const [coinsGranted, setCoinsGranted] = useState(0);
  // Сколько монет потрачено за всё время. Раньше это выводилось из
  // списка купленных вещей, но сундук стоит дешевле того, что из него
  // выпадает, а смена ника вещей не добавляет вовсе — теперь считаем по
  // факту списания.
  const [coinsSpentTotal, setCoinsSpentTotal] = useState(0);
  /* Баланс, посчитанный базой. Он и есть настоящий: там же лежат цены и
     там же происходит списание. Местный расчёт ниже остаётся запасным —
     на случай, если серверные функции ещё не выполнены (тогда rpc
     вернёт ошибку, и приложение продолжит считать по-старому). */
  const [serverBalance, setServerBalance] = useState(null);
  function spendCoins(amount) {
    const next = Math.max(0, coinsSpentTotal + Math.max(0, Math.round(amount)));
    setCoinsSpentTotal(next);
    if (userId) {
      supabase.from("profiles").update({ coins_spent: next }).eq("id", userId)
        .then(({ error }) => { if (error) console.warn("[mintly] coins_spent not saved:", error.message); });
    }
    return next;
  }

  const [owned, setOwned] = useState(() => {
    try {
      if (typeof window !== "undefined") {
        const raw = window.localStorage.getItem("mintly_owned");
        if (raw) return new Set(JSON.parse(raw) || []);
      }
    } catch (e) { /* localStorage unavailable */ }
    return new Set();
  });
  // Купленное записывает база: список вещей приходит оттуда же, где
  // происходит списание, и на устройстве его больше не хранят — иначе
  // владение можно было бы дописать себе руками.
  function equipCosmetic(kind, id, silent = false) {
    setCosmetics((c) => ({ ...c, [kind]: id }));
    try {
      if (typeof window !== "undefined") {
        window.localStorage.setItem(COSMETIC_STORAGE[kind] || "mintly_frame", id);
      }
    } catch (e) { /* localStorage unavailable */ }
    // localStorage оставляем для мгновенного отклика и гостей, но выбор
    // вошедшего уходит в профиль — иначе его предметы не увидит никто.
    if (userId) {
      supabase
        .from("profiles")
        .update(kind === "frame" ? { frame_id: id } : { card_id: id })
        .eq("id", userId)
        .then(({ error }) => {
          if (error) console.warn("[mintly] failed to save cosmetics:", error.message);
        });
    }
    if (!silent) showToast(id === "none" ? t("cosmeticRemoved") : t("cosmeticApplied"));
  }

  // PIN-код при входе — код хранится только на устройстве (localStorage),
  // это локальная блокировка приложения, а не серверная авторизация.
  // При включённом PIN экран блокировки перекрывает весь интерфейс,
  // пока не введён верный код.
  const [pinCode, setPinCode] = useState(null);
  const [pinModal, setPinModal] = useState(null); // { mode: "create" | "change" | "disable" } | null
  const [pinLocked, setPinLocked] = useState(false);

  useEffect(() => {
    try {
      const storedEnabled = window.localStorage.getItem("mintly_pin_enabled") === "1";
      const storedPin = window.localStorage.getItem("mintly_pin");
      if (storedEnabled && storedPin) {
        setPinCode(storedPin);
        setAppSettings((s) => ({ ...s, pinEnabled: true }));
        setPinLocked(true);
      }
    } catch (e) { /* localStorage unavailable */ }
  }, []);

  function persistPin(enabled, code) {
    try {
      if (enabled && code) {
        window.localStorage.setItem("mintly_pin", code);
        window.localStorage.setItem("mintly_pin_enabled", "1");
      } else {
        window.localStorage.removeItem("mintly_pin");
        window.localStorage.removeItem("mintly_pin_enabled");
      }
    } catch (e) { /* localStorage unavailable */ }
  }

  // "My Tokens" (create-flow results) — now backed by Supabase (see
  // loadMyTokens/loadProfileForUser above), scoped per-account instead of
  // per-browser. Starts empty and is populated once the session resolves.
  const [myTokens, setMyTokens] = useState([]);

  // Лучшая капитализация среди своих токенов — на ней держатся
  // достижения «довести токен до $1K/$10K/$100K». Это рекорд, а не
  // текущее значение: цена ходит вверх-вниз, и было бы странно отбирать
  // уже полученную рамку из-за просадки. Рекорд лежит рядом с
  // пользователем в браузере — на цепочке его хранить негде.
  const [bestMcapUsd, setBestMcapUsd] = useState(0);
  const [bestMcapReady, setBestMcapReady] = useState(false);
  const mcapPeakKey = userId ? `mintly:mcapPeak:${userId}` : "";
  useEffect(() => {
    if (!mcapPeakKey) { setBestMcapUsd(0); return; }
    try {
      const saved = Number(localStorage.getItem(mcapPeakKey) || 0);
      if (saved > 0) setBestMcapUsd(saved);
    } catch { /* приватный режим — просто начнём с нуля */ }
  }, [mcapPeakKey]);
  const myCurveKey = myTokens.map((tok) => tok.curveAddress || "").filter(Boolean).join(",");
  useEffect(() => {
    // Своих токенов на кривой нет — считать нечего, рекорд равен тому,
    // что уже лежит на устройстве.
    if (!myCurveKey) { setBestMcapReady(true); return; }
    if (!tonPriceUsd) return;
    // Капитализация уже посчитана сервером и приехала вместе со
    // списком: ходить за ней в цепочку заново — три запроса на токен
    // ради одного числа, которое лежит рядом.
    setBestMcapReady(true);
    const top = myTokens.reduce((max, tok) => (tok.mcapNum > max ? tok.mcapNum : max), 0);
    if (top <= 0) return;
    setBestMcapUsd((prev) => {
      if (top <= prev) return prev;
      try { if (mcapPeakKey) localStorage.setItem(mcapPeakKey, String(top)); } catch { /* не критично */ }
      return top;
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [myCurveKey, tonPriceUsd, mcapPeakKey, myTokens]);

  // Подтверждение аккаунта. Тоже в профиле: значок у ника должен
  // переживать перезапуск приложения и быть виден другим.
  function markProfileVerified() {
    setProfile((p) => ({ ...p, verified: true }));
    if (!userId) return;
    supabase.from("profiles").update({ verified: true }).eq("id", userId).then(({ error }) => {
      if (error) console.warn("[mintly] failed to save verification:", error.message);
    });
  }

  // Ступень знака создателя. Живёт в профиле, потому что её видят другие,
  // и только растёт: если токен просядет, знак остаётся.
  const [creatorTier, setCreatorTier] = useState(0);
  useEffect(() => {
    const earned = creatorTierOf(bestMcapUsd);
    if (!userId || earned <= creatorTier) return;
    setCreatorTier(earned);
    supabase.from("profiles").update({ creator_tier: earned }).eq("id", userId).then(({ error }) => {
      if (error) console.warn("[mintly] failed to save creator tier:", error.message);
    });
  }, [bestMcapUsd, creatorTier, userId]);

  // Достижения. Считаются здесь, потому что нужны сразу трём экранам:
  // профилю, отдельной странице и магазину — он по ним запирает предметы.
  // Достижения приносят монеты, а по монетам считается баланс магазина.
  // Пока их слагаемые ещё едут — рекорд капитализации и число
  // приглашённых, — витрину лучше не показывать вовсе: иначе на секунду
  // видно чужой баланс. Гостю ждать нечего: у него монет и быть не может.
  const achievementsReady = !userId || (bestMcapReady && invitesReady);

  const achievements = useMemo(
    () => buildAchievements({
      tokensCount: myTokens.length,
      bestMcapUsd,
      invites: inviteCount,
      connected,
      profile,
      cosmetics,
    }),
    [myTokens.length, bestMcapUsd, inviteCount, connected, profile, cosmetics],
  );

  // Баланс: выданное площадкой, заработанное достижениями и приглашениями,
  // минус потраченное на покупки. Отдельного поля с балансом в базе нет
  // намеренно — всё складывается из того, что и так проверяемо, поэтому
  // подкрутить его запросом из браузера не выйдет.
  /* Закрытые достижения отмечаются в базе: она сама проверяет условие
     (запуски, приглашения, заполненный профиль, надетый наряд) и только
     тогда начисляет. На слово приложения ничего не начисляется. */
  useEffect(() => {
    if (!userId) { setServerBalance(null); return; }
    let cancelled = false;
    supabase.rpc("coins_balance", { uid: userId }).then(({ data, error }) => {
      if (cancelled) return;
      if (error || typeof data !== "number") {
        console.warn("[mintly] серверный баланс недоступен:", error && error.message);
        return;
      }
      setServerBalance(data);
    });
    return () => { cancelled = true; };
  }, [userId, owned, coinsSpentTotal]);

  const claimedRef = useRef(new Set());
  useEffect(() => {
    if (!userId || !achievementsReady) return;
    const done = (achievements || []).filter((a) => a.done && !claimedRef.current.has(a.id));
    if (!done.length) return;
    (async () => {
      for (const a of done) {
        claimedRef.current.add(a.id);
        const { data, error } = await supabase.rpc("claim_achievement", { p_id: a.id });
        if (error) { claimedRef.current.delete(a.id); continue; }
        if (data && typeof data.balance === "number") setServerBalance(data.balance);
      }
    })();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [userId, achievementsReady, achievements]);

  const localCoins = Math.max(
    0,
    coinsGranted + coinsEarned(achievements) + coinsFromInvites(inviteCount) - coinsSpentTotal,
  );
  const coins = serverBalance == null ? localCoins : serverBalance;

  async function buyCosmetic(kind, id) {
    const price = cosmeticPrice(kind, id);
    if (price > coins) {
      showToast(tf("shopNotEnough", { n: price - coins }));
      return;
    }
    // Решает база: она знает цену, считает баланс и списывает. Раньше и
    // счёт, и списание жили в браузере — а значит, правились из него же.
    const { data, error } = await supabase.rpc("shop_buy", { p_kind: kind, p_id: id });
    if (error || !data || data.ok !== true) {
      const code = (data && data.error) || "";
      // «Нет в каталоге» — не сбой сети, а недостающая строка в прайсе
      // базы: цену знает она, и без записи покупка невозможна в принципе.
      // Общее «не удалось сохранить» отправляло искать поломку не там.
      if (code === "no_item") console.warn("[mintly] нет в таблице cosmetics:", kind, id);
      showToast(code === "not_enough" ? tf("shopNotEnough", { n: data.need || price })
        : code === "already_owned" ? t("cosmeticApplied")
        : code === "no_item" ? t("shopNoItem")
        : t("saveFailed"));
      return;
    }
    const next = new Set(owned);
    next.add(ownedKey(kind, id));
    setOwned(next);
    setCoinsSpentTotal((v) => v + price);
    if (typeof data.balance === "number") setServerBalance(data.balance);
    // Надевать сами не лезем: примерка живёт в «Редактировать
    // профиль», и покупка, которая молча меняет вид, — это ровно то
    // разделение, которое здесь и наводится.
    const item = (kind === "frame" ? FRAME_BY_ID : CARD_BY_ID)[id];
    showToast(tf("shopBought", { name: pickLabel(item ? item.label : null) || id }));
  }
  // Смена ника за монеты. Занятость проверяет сама база уникальным
  // индексом: между проверкой и записью имя могли увести, и только отказ
  // от базы говорит об этом наверняка.
  async function changeNickname(next, done) {
    const name = String(next || "").trim();
    if (!NICKNAME_RE.test(name)) return;
    if (name.toLowerCase() === String(profile.nickname || "").toLowerCase()) { done && done(); return; }
    if (coins < NICKNAME_PRICE) {
      showToast(tf("shopNotEnough", { n: NICKNAME_PRICE - coins }));
      return;
    }
    if (!userId) return;
    const { data, error } = await supabase.rpc("change_nickname", { p_name: name, p_price: NICKNAME_PRICE });
    if (error || !data || data.ok !== true) {
      const code = (data && data.error) || "";
      showToast(code === "taken" ? tf("nickTaken", { name })
        : code === "not_enough" ? tf("shopNotEnough", { n: data.need || NICKNAME_PRICE })
        : code === "bad_name" ? t("nicknameError")
        : t("saveFailed"));
      return;
    }
    setCoinsSpentTotal((v) => v + NICKNAME_PRICE);
    if (typeof data.balance === "number") setServerBalance(data.balance);
    setProfile((prev) => ({ ...prev, nickname: name }));
    showToast(tf("nickChanged", { name }));
    done && done();
  }

  // Что выпало из сундука: показывается в отдельном окне с анимацией.
  const [chestPrize, setChestPrize] = useState(null);

  // Открыть сундук: списываем цену и выдаём случайную вещь из тех, что
  // ещё не куплены. Надеть её, как и любую покупку, можно в профиле.
  async function openChest() {
    if (coins < CHEST_PRICE) {
      showToast(tf("shopNotEnough", { n: CHEST_PRICE - coins }));
      return;
    }
    // Что выпадет, тоже решает база: жеребьёвка в браузере означала бы,
    // что её можно переиграть, пока не выпадет нужное.
    const { data, error } = await supabase.rpc("shop_open_chest", { p_price: CHEST_PRICE });
    if (error || !data || data.ok !== true) {
      const code = (data && data.error) || "";
      showToast(code === "empty" ? t("chestEmpty")
        : code === "not_enough" ? tf("shopNotEnough", { n: data.need || CHEST_PRICE })
        : t("saveFailed"));
      return;
    }
    const next = new Set(owned);
    next.add(ownedKey(data.kind, data.id));
    setOwned(next);
    setCoinsSpentTotal((v) => v + CHEST_PRICE);
    if (typeof data.balance === "number") setServerBalance(data.balance);
    const item = (data.kind === "frame" ? FRAME_BY_ID : CARD_BY_ID)[data.id];
    // Вместо строчки внизу экрана — окно с открытием: ради этой секунды
    // сундук и покупают.
    setChestPrize({ kind: data.kind, id: data.id, item });
  }

  async function deleteMyToken(id) {
    // Optimistic local removal, then the real delete — RLS (see
    // supabase_tokens_schema.sql) already guarantees a user can only
    // delete their own rows, so no extra owner check is needed here.
    setMyTokens((prev) => prev.filter((tok) => tok.id !== id));
    setCommunityTokens((prev) => prev.filter((tok) => tok.id !== id));
    setHoldings((prev) => {
      const next = { ...prev };
      delete next[id];
      try { if (typeof window !== "undefined") window.localStorage.setItem("mintly_holdings", JSON.stringify(next)); } catch (e) { /* localStorage unavailable */ }
      return next;
    });
    const { error } = await supabase.from("tokens").delete().eq("id", id);
    if (error) { console.error("[mintly] failed to delete token from Supabase:", error); showToast(t("deleteFailedToast")); if (userId) loadMyTokens(userId); loadCommunityTokens(); }
  }
  // Real per-token holdings — the source of truth for "how much of this
  // token do I actually own", so Sell can never exceed what was actually
  // bought through this app. Purely local (same trust model as myTokens
  // above: this app has no real trading backend), but unlike the old
  // hardcoded 5000-token fallback, it starts every token at 0 and only
  // grows/shrinks from real confirmed buys/sells.
  const [holdings, setHoldings] = useState(() => {
    try {
      if (typeof window !== "undefined") {
        const saved = window.localStorage.getItem("mintly_holdings");
        if (saved) return JSON.parse(saved);
      }
    } catch (e) { /* localStorage unavailable */ }
    return {};
  });
  function adjustHolding(tokenId, delta) {
    setHoldings((prev) => {
      const next = { ...prev, [tokenId]: Math.max(0, (prev[tokenId] || 0) + delta) };
      try { if (typeof window !== "undefined") window.localStorage.setItem("mintly_holdings", JSON.stringify(next)); } catch (e) { /* localStorage unavailable */ }
      return next;
    });
  }

  async function handleTokenCreated(result) {
    // Ракета уходит сразу, не дожидаясь записи в базу: токен уже создан
    // в сети, а полёт длится меньше двух секунд.
    playLaunchRocket();
    if (!userId) {
      // Shouldn't normally happen — launching requires accountCreated —
      // but guard anyway rather than silently dropping the token.
      showToast(t("deleteFailedToast"));
      console.error("[mintly] handleTokenCreated: no authenticated user, can't save to Supabase");
      return;
    }

    const строка = {
      owner_id: userId,
      name: result.name,
      ticker: result.ticker,
      logo_url: result.logoUrl || null,
      supply: result.supply,
      buy_amount: result.buyAmount,
      buy_tokens: result.buyTokens || 0,
      address: result.address,
      pool_address: result.poolAddress || null,
      curve_address: result.curveAddress || null,
      curve_jetton_wallet: result.curveJettonWallet || null,
      dex_pool_address: result.curvePoolAddress || null,
      creator_wallet: result.creatorWallet || null,
      explorer_url: result.explorerUrl || null,
      category: result.category || null,
      description: result.description || null,
      // Обложка токена: необязательна, показывается в «центре внимания».
      banner_url: result.bannerUrl || null,
      network: result.network || (TON_TESTNET ? "testnet" : "mainnet"),
      // Сеть токена: по ней приложение решает, у какой цепочки
      // спрашивать цену и каким кошельком торговать.
      chain: result.chain || "ton",
    };

    // Токен уже в сети — потерять его из-за одной неудачной записи
    // нельзя. Поэтому: попытка, обновление сессии и вторая попытка, а
    // если и она не прошла — кладём в телефон и досохраняем при
    // следующем запуске приложения.
    let { data: row, error } = await supabase.from("tokens").insert(строка).select().single();
    if (error) {
      console.warn("[mintly] первая попытка сохранить токен не прошла:", error.message);
      await supabase.auth.refreshSession().catch(() => {});
      ({ data: row, error } = await supabase.from("tokens").insert(строка).select().single());
    }
    // Колонки описания и обложки появились позже остальных: пока
    // миграции нет, база отбивает всю строку целиком, и токен, уже
    // выпущенный в сети, терялся бы из-за одного текстового поля. Тогда
    // сохраняем без них.
    if (error && (error.code === "42703" || /description|banner_url/i.test(error.message || ""))) {
      const { description, banner_url, ...безЛишнего } = строка;
      ({ data: row, error } = await supabase.from("tokens").insert(безЛишнего).select().single());
    }

    if (error || !row) {
      console.error("[mintly] failed to save token to Supabase:", error);
      сохранитьПотерянный(строка);
      showToast(tf("tokenSaveFailed", { reason: (error && error.message) || "нет ответа базы" }));
      return;
    }

    const entry = {
      id: row.id,
      name: row.name,
      ticker: row.ticker,
      emoji: "🚀",
      verified: false,
      // Ноль, а не введённая сумма: настоящие цифры приедут с кривой
      // через секунду после развёртывания, а до этого показывать оценку
      // — значит рисовать капитализацию, которой ещё нет.
      mcapNum: 0,
      liq: "0",
      vol: "0",
      change: 0,
      tx24h: 0,
      address: row.address,
      poolAddress: row.pool_address,
      // Пара на бирже, заведённая после закрытия кривой. Отдельно от
      // poolAddress: тот отвечает за токены, пришедшие из ленты биржи, а
      // этот — за свои, у которых кривая уже отторговала.
      dexPoolAddress: row.dex_pool_address || null,
      curveAddress: row.curve_address || null,
      curveJettonWallet: row.curve_jetton_wallet || null,
      creatorWallet: row.creator_wallet || null,
      buyTokens: Number(row.buy_tokens) || 0,
      explorerUrl: row.explorer_url,
      supply: row.supply,
      buyAmount: row.buy_amount,
      logoUrl: row.logo_url,
      // Описание пишется при запуске и больше не меняется — это обещание
      // автора, а не подпись под картинкой. В карточке мемпада по нему
      // видно, что за токен, ещё до того, как его открыли.
      description: row.description || null,
      // Обложка: ею подкладывается карточка «в центре внимания».
      bannerUrl: row.banner_url || null,
      network: row.network || "mainnet",
      createdAt: new Date(row.created_at).getTime(),
    };
    setMyTokens((prev) => [entry, ...prev]);
    setCommunityTokens((prev) => [entry, ...prev]);
    // The premint transaction sends the token's initial buy allocation
    // straight to the creator's own wallet on-chain — but the app's
    // own "how much of this do I hold" number (`holdings`, used by
    // TradeModal/balances everywhere) is a purely local counter that
    // only buy/sell in TradeModal ever touched (see adjustHolding
    // calls in confirmTrade). Nothing credited it on a successful
    // launch, so a freshly created token always showed 0 in-app even
    // though the real on-chain balance was correct. Credit it here
    // with the same buyTokens figure the launch overlay itself already
    // promised the user under "Стартовая покупка".
    if (result.buyTokens) adjustHolding(entry.id, result.buyTokens);
  }

  function handleTogglePin(v) { setPinModal({ mode: v ? "create" : "disable" }); }
  // Root-level control for the token-creation simulation overlay. It's
  // rendered here (not inside CreateView) for the same reason every other
  // modal in this app is rendered here: this container is the one with a
  // real, explicit height matching the visible screen (via
  // useTelegramViewport) — a nested scrollable view like CreateView's form
  // has no such guarantee, so a modal positioned relative to it can end up
  // rendered outside the currently visible/scrolled area.
  const [launchRequest, setLaunchRequest] = useState(null); // { form, category, logoUrl, logoFile, buyAmount, onFinish } | null
  const [launchProgress, setLaunchProgress] = useState({ stepIndex: 0, done: false, error: null, result: null });
  const EMPTY_LAUNCH_FORM = { name: "", ticker: "", buyAmount: "", desc: "", tg: "", x: "", site: "" };

  /* Запуск в Solana включается сам, когда программа кривой развёрнута:
     сервер отвечает, есть ли её адрес в настройках. Пока нет — выбора
     сети в форме не появляется, и кнопка запуска в разделе Solana не
     показывается. */
  /* Первый экран: показывается тому, кто ещё не завёл аккаунт. Отметка
     живёт в телефоне — на сервере ей делать нечего.

     Она же снимается при выходе из аккаунта: человек без аккаунта снова
     видит то же, что и новичок. Раньше отметка ставилась навсегда, и
     вышедший попадал сразу в ленту — без единого намёка, где вход и
     зачем вообще заводить аккаунт. */
  const [приветствие, setПриветствие] = useState(() => {
    try { return typeof window !== "undefined" && !window.localStorage.getItem("mintly.welcome"); }
    catch { return false; }
  });
  function закрытьПриветствие() {
    setПриветствие(false);
    try { if (typeof window !== "undefined") window.localStorage.setItem("mintly.welcome", "1"); }
    catch { /* приватный режим */ }
  }
  function вернутьПриветствие() {
    setПриветствие(true);
    try { if (typeof window !== "undefined") window.localStorage.removeItem("mintly.welcome"); }
    catch { /* приватный режим */ }
  }

  const [solЗапуск, setSolЗапуск] = useState(false);
  useEffect(() => {
    let жив = true;
    import("./solLaunch")
      .then((m) => m.запускВSolanaДоступен())
      .then((да) => { if (жив) setSolЗапуск(!!да); })
      .catch(() => {});
    return () => { жив = false; };
  }, []);

  function handleLaunchRequest(req) {
    setLaunchRequest(req);
    runRealLaunch(req);
  }

  // Runs the actual on-chain launch (jetton deploy + STON.fi pool) via
  // TonConnect. Every stage the user sees in TokenLaunchOverlay reflects
  // a real transaction/confirmation, not a timer.
  async function runRealLaunch(req) {
    // Solana — другая сеть целиком: свой кошелёк, своя программа кривой
    // и другая транзакция. Общего с запуском на TON у неё только форма,
    // поэтому дальше идёт отдельная ветка, а не ещё десяток условий
    // внутри этой.
    if (req.chain === "solana") return runSolanaLaunch(req);

    setLaunchProgress({ stepIndex: 0, done: false, error: null, result: null });
    const buyNum = parseFloat(String(req.buyAmount || "0").replace(",", "."));

    // The log shows every low-level check passing (RPC reachable, TonClient4
    // and AssetsSDK both initialized, getAccountLite OK) and the failure
    // happening only inside deployJetton itself with a bare "Exceeded number
    // of retries". That specific combination — connectivity fine, only the
    // wait-for-deploy step failing — is the signature of polling the wrong
    // chain: the app is configured for `network: testnet` (TON_TESTNET
    // above), but the wallet TonConnect actually connected is on mainnet (or
    // vice versa). The deploy message either never lands on the chain being
    // polled, or lands on a chain nobody's watching, so the SDK just polls
    // an address that will never go active until it gives up. Catching that
    // here — before spending a wallet approval + a deploy attempt on it —
    // turns a dead-end retry-exhaustion message into an actionable one.
    const expectedChain = TON_TESTNET ? "-3" : "-239";
    const actualChain = wallet?.account?.chain;
    if (actualChain && actualChain !== expectedChain) {
      const actualNet = actualChain === "-239" ? "mainnet" : actualChain === "-3" ? "testnet" : actualChain;
      const expectedNet = TON_TESTNET ? "testnet" : "mainnet";
      setLaunchProgress({
        stepIndex: 0,
        done: false,
        error: `Кошелёк подключён в сети ${actualNet}, а запуск токена настроен на ${expectedNet}. Переключите сеть в кошельке на ${expectedNet} (или поменяйте TON_TESTNET в коде на противоположное значение) и попробуйте снова — иначе деплой никогда не подтвердится на той сети, которую опрашивает приложение, и упадёт с той же "Exceeded number of retries".`,
        result: null,
      });
      return;
    }

    try {
      const { launchRealToken } = await загрузитьЗапуск();
      const chainResult = await launchRealToken({
        tonConnectUI,
        walletAddress,
        form: req.form,
        logoFile: req.logoFile,
        buyAmountTon: buyNum,
        treasuryAddress: TREASURY_ADDRESS,
        feeAddress: FEE_ADDRESS,
        feePercent: FEE_PERCENT,
        network: TON_TESTNET ? "testnet" : "mainnet",
        onStage: (i) => setLaunchProgress((p) => ({ ...p, stepIndex: i })),
      });
      const { tokens, pct } = tokensForTon(buyNum);
      // BUG FIX: logoUrl here used to be req.logoUrl — a `blob:` object URL
      // created by URL.createObjectURL() purely in this tab's memory (see
      // the logo picker in the create form). It rendered fine immediately
      // because the blob was still alive in memory, but it was never a
      // real file anywhere: after a page refresh (or for any other user,
      // who never had that blob to begin with) the URL just points at
      // nothing. Upload the actual file to Supabase Storage now and use
      // the real public URL everywhere from here on — success screen,
      // Supabase `tokens` row, and everyone else's feed all get the same
      // persistent image.
      // Первым делом — ссылка от самого запуска: логотип уехал в
      // хранилище ещё до выпуска токена, и на неё же ссылаются
      // метаданные в цепочке. Всё остальное ниже — запасные пути на
      // случай, если запуск её почему-то не отдал.
      let persistentLogoUrl = chainResult.logoUrl || null;
      if (!persistentLogoUrl && req.logoFile && userId) {
        try {
          // Путь обязан начинаться с id пользователя: политика хранилища
          // сверяет первую папку с auth.uid(). Раньше здесь был префикс
          // `tokens/`, из-за него загрузка отклонялась, и в базу уезжала
          // мёртвая blob-ссылка — логотипы не открывались ни у кого.
          const path = `${userId}/token-${Date.now()}.${safeImageExt(req.logoFile)}`;
          const { error: logoUploadError } = await supabase.storage
            .from("avatars")
            .upload(path, req.logoFile, { upsert: true });
          if (!logoUploadError) {
            const { data: pub } = supabase.storage.from("avatars").getPublicUrl(path);
            if (pub && pub.publicUrl) persistentLogoUrl = pub.publicUrl;
          } else {
            console.error("[mintly] token logo upload failed:", logoUploadError);
          }
        } catch (e) { console.error("[mintly] token logo upload threw:", e); }
      }
      // Если загрузка не прошла — сохраняем пустоту, а не blob-ссылку:
      // она живёт только в этой вкладке, у всех остальных это битая
      // картинка. Пустое поле хотя бы честно покажет эмодзи.
      if (!persistentLogoUrl && req.logoUrl && !String(req.logoUrl).startsWith("blob:")) {
        persistentLogoUrl = req.logoUrl;
      }
      const баннер = await загрузитьБаннер(req.bannerFile);
      setLaunchProgress({
        stepIndex: LAUNCH_STEPS.length,
        done: true,
        error: null,
        result: {
          name: req.form.name.trim() || t("unnamedToken"),
          ticker: (req.form.ticker.trim() || "TOKEN").toUpperCase(),
          supply: TOKEN_FIXED_SUPPLY_LABEL,
          buyAmount: req.buyAmount && String(req.buyAmount).trim() ? req.buyAmount : "0",
          // chainResult.mintedTokens is the real, on-chain-confirmed
          // balance (tonLaunch.js only resolves once it's verified
          // nonzero) — prefer it over the pre-launch estimate so the
          // success screen and in-app balance always match the wallet.
          buyTokens: chainResult.mintedTokens ?? tokens,
          buyPct: pct,
          category: req.category || null,
          // Описание автора: до сих пор оно уезжало только в
          // метаданные в цепочке, и в приложении его негде было
          // прочитать — карточка в мемпаде стояла безымянной.
          description: req.form.desc.trim(),
          logoUrl: persistentLogoUrl,
          bannerUrl: баннер,
          curveAddress: chainResult.curveAddress,
          curveJettonWallet: chainResult.curveJettonWallet,
          // Свой пул этого токена: развёрнут вместе с кривой и ждёт
          // ликвидность. После закрытия кривой торговля идёт через него.
          curvePoolAddress: chainResult.curvePoolAddress || null,
          creatorWallet: chainResult.creatorWallet || null,
          network: TON_TESTNET ? "testnet" : "mainnet",
          address: chainResult.jettonMasterAddress,
          poolAddress: chainResult.poolAddress,
          explorerUrl: chainResult.explorerUrl,
          createdAt: Date.now(),
        },
      });
    } catch (err) {
      setLaunchProgress({ stepIndex: 0, done: false, error: (err && err.message) || String(err), result: null });
    }
  }

  /* Запуск в Solana. Одна подпись в Phantom создаёт токен, записывает
     метаданные, отдаёт право выпуска кривой и заводит её саму — сборкой
     транзакции занимается сервер (api/solana-launch.js), потому что
     тащить ради этого пол-Solana-SDK в браузер незачем.

     Эмиссия здесь не настраивается: миллиард штук, из них восемьсот
     миллионов продаёт кривая. Это правило площадки, а не выбор
     запускающего — иначе у каждого токена была бы своя математика, и
     сравнивать их было бы нельзя. */
  /* Баннер токена в хранилище. Он необязателен и ни на что в цепочке не
     влияет — это обложка, которой карточка встаёт на витрине, поэтому
     неудача загрузки запуск не рушит: токен выйдет без обложки. */
  async function загрузитьБаннер(файл) {
    if (!файл || !userId) return null;
    try {
      const путь = `${userId}/banner-${Date.now()}.${safeImageExt(файл)}`;
      const { error } = await supabase.storage.from("avatars").upload(путь, файл, { upsert: true });
      if (error) { console.error("[mintly] баннер не загрузился:", error); return null; }
      const { data: pub } = supabase.storage.from("avatars").getPublicUrl(путь);
      return (pub && pub.publicUrl) || null;
    } catch (e) {
      console.error("[mintly] баннер не загрузился:", e);
      return null;
    }
  }

  async function runSolanaLaunch(req) {
    setLaunchProgress({ stepIndex: 0, done: false, error: null, result: null });
    const buyNum = parseFloat(String(req.buyAmount || "0").replace(",", "."));

    try {
      // Логотип уезжает в хранилище до запуска: на него ссылаются
      // метаданные токена, которые пишутся той же транзакцией.
      let logo = null;
      if (req.logoFile && userId) {
        try {
          const path = `${userId}/token-${Date.now()}.${safeImageExt(req.logoFile)}`;
          const { error: ошибка } = await supabase.storage.from("avatars").upload(path, req.logoFile, { upsert: true });
          if (!ошибка) {
            const { data: pub } = supabase.storage.from("avatars").getPublicUrl(path);
            if (pub && pub.publicUrl) logo = pub.publicUrl;
          }
        } catch (e) { console.error("[mintly] логотип не загрузился:", e); }
      }
      if (!logo && req.logoUrl && !String(req.logoUrl).startsWith("blob:")) logo = req.logoUrl;
      const баннер = await загрузитьБаннер(req.bannerFile);

      setLaunchProgress((p) => ({ ...p, stepIndex: 1 }));
      const { запуститьТокенSol } = await import("./solLaunch");
      setLaunchProgress((p) => ({ ...p, stepIndex: 2 }));

      const итог = await запуститьТокенSol({
        имя: req.form.name.trim() || t("unnamedToken"),
        тикер: (req.form.ticker.trim() || "TOKEN").toUpperCase(),
        стартовыйВзносSol: Number.isFinite(buyNum) && buyNum > 0 ? buyNum : 0,
      });

      // Сколько токенов получил создатель, знает сама кривая. Считать это
      // в браузере — значит держать вторую копию формулы, которая живёт в
      // программе; спрашиваем у неё, давая пару секунд на подтверждение.
      let куплено = 0;
      if (Number.isFinite(buyNum) && buyNum > 0) {
        const { состояниеКривойSol } = await import("./solLaunch");
        for (let попытка = 0; попытка < 3 && !куплено; попытка++) {
          if (попытка) await new Promise((r) => setTimeout(r, 1500));
          const состояние = await состояниеКривойSol(итог.mint);
          if (состояние && состояние.продано > 0) куплено = состояние.продано;
        }
      }

      setLaunchProgress({
        stepIndex: LAUNCH_STEPS.length,
        done: true,
        error: null,
        result: {
          name: req.form.name.trim() || t("unnamedToken"),
          ticker: (req.form.ticker.trim() || "TOKEN").toUpperCase(),
          supply: (1_000_000_000).toLocaleString("ru-RU"),
          buyAmount: req.buyAmount && String(req.buyAmount).trim() ? req.buyAmount : "0",
          buyTokens: куплено,
          buyPct: (куплено / 1_000_000_000) * 100,
          category: req.category || null,
          // Описание автора: до сих пор оно уезжало только в
          // метаданные в цепочке, и в приложении его негде было
          // прочитать — карточка в мемпаде стояла безымянной.
          description: req.form.desc.trim(),
          logoUrl: logo,
          bannerUrl: баннер,
          chain: "solana",
          // Сеть той цепочки, в которой токен на самом деле выпущен, а не
          // сеть TON: пока программа в devnet, такой токен обязан
          // отличаться от боевых и в базе, и в ленте.
          network: SOL_NETWORK,
          address: итог.mint,
          curveAddress: итог.curve,
          creatorWallet: итог.creatorWallet,
          explorerUrl: итог.explorerUrl,
          createdAt: Date.now(),
        },
      });
    } catch (err) {
      setLaunchProgress({ stepIndex: 0, done: false, error: (err && err.message) || String(err), result: null });
    }
  }

  function retryLaunch() {
    if (launchRequest) runRealLaunch(launchRequest);
  }

  function closeLaunchOverlay(result) {
    const req = launchRequest;
    setLaunchRequest(null);
    setLaunchProgress({ stepIndex: 0, done: false, error: null, result: null });
    if (result) handleTokenCreated(result);
    if (req && req.onFinish) req.onFinish(result);
    // Стартовая покупка едет внутри транзакции запуска, поэтому окно
    // покупки здесь больше не открывается — иначе создатель купил бы
    // дважды. На страницу токена он попадёт кнопкой с экрана успеха.
    // Токен Solana сюда не идёт: карточка читает состояние у кривой на
    // TON, и открывать её для чужой сети — значит показывать прочерки.
    if (result && result.chain !== "solana") openLaunchBuy(result, { openTradeSheet: false });
  }
  // Создатель покупает первым: кроме него о токене ещё никто не знает,
  // а размер этой покупки и задаёт стартовую цену — кривая сдвигается
  // ровно на внесённую сумму. Открываем окно покупки само, чтобы шаг не
  // выглядел необязательным.
  function openLaunchBuy(result, { openTradeSheet = true } = {}) {
    if (!result || !result.address) return;
    const amount = parseFloat(String(result.buyAmount || "").replace(",", "."));
    const feedToken = localTokenToFeedShape({
      id: result.address,
      address: result.address,
      name: result.name,
      ticker: result.ticker,
      emoji: "🚀",
      logoUrl: result.logoUrl || null,
      mcapNum: 0,
      liq: "0",
      vol: "0",
      verified: false,
      curveAddress: result.curveAddress || null,
      curveJettonWallet: result.curveJettonWallet || null,
      dexPoolAddress: result.curvePoolAddress || null,
      createdAt: result.createdAt || Date.now(),
    });
    openToken(feedToken);
    if (openTradeSheet) {
      setTradeModal({ mode: "buy", prefill: Number.isFinite(amount) && amount > 0 ? amount : undefined });
    }
  }

  function viewLaunchedToken(result) {
    // closeLaunchOverlay сам открывает покупку — здесь только закрываем.
    closeLaunchOverlay(result);
  }
  function requestChangePin() { setPinModal({ mode: "change" }); }
  function completePinSetup(code) {
    const wasChange = pinModal && pinModal.mode === "change";
    setPinCode(code);
    setAppSettings((s) => ({ ...s, pinEnabled: true }));
    persistPin(true, code);
    setPinModal(null);
    showToast(wasChange ? t("pinChanged") : t("pinEnabled"));
  }
  function completePinDisable() {
    setPinCode(null);
    setAppSettings((s) => ({ ...s, pinEnabled: false }));
    persistPin(false, null);
    setPinModal(null);
    showToast(t("pinDisabled"));
  }
  function forgotPin() {
    setPinCode(null);
    setAppSettings((s) => ({ ...s, pinEnabled: false }));
    persistPin(false, null);
    setPinLocked(false);
    showToast(t("pinResetToast"));
  }

  async function openToken(t) {
    if (!t) return;
    // Топ приходит из RPC leaderboard: там только тикер, логотип и
    // собранное — ни адреса жетона, ни кривой. Открытый по такой
    // строке экран токена оставался пустым: читать цену, график и
    // держателей не у чего. Достаём полную запись — сперва из уже
    // загруженной ленты, а если её там нет, то из базы.
    if (!t.tokenAddress && !t.address && t.id) {
      const полный = [...communityTokens, ...myTokens].find((x) => x.id === t.id);
      if (полный) {
        t = полный;
      } else {
        const { data } = await supabase.from("tokens").select("*").eq("id", t.id).maybeSingle();
        if (data) t = mapTokenRow(data);
      }
    }
    // Токены сообщества хранятся в базе строкой, где нет ни цены, ни
    // объёма — их считает кривая, и приходят они отдельно. В таком виде
    // карточка попадала прямо на экран токена, и он падал на первом же
    // обращении к цене. Приводим к общему виду ленты.
    setToken(t.price == null ? localTokenToFeedShape(t) : t);
    setView("token");
  }
  // Пришли из чата прямо за подписью: интерфейс в этот момент не нужен,
  // человек ждёт окно кошелька и ничего больше. Сумма лежит здесь, пока
  // не подтянутся кошелёк и курс — TonConnect восстанавливает сессию
  // асинхронно, и сразу после запуска адреса ещё нет.
  const [сразуВКошелёк, setСразуВКошелёк] = useState(false);
  const [ждётПодписи, setЖдётПодписи] = useState(0);
  // Что именно покупаем — только для надписи на экране ожидания: сама
  // сумма уходит из ждётПодписи и обнуляется, как только подпись ушла.
  const [ждётПокупкиСумма, setЖдётПокупкиСумма] = useState(0);
  const [ждётПокупкиТокен, setЖдётПокупкиТокен] = useState("");

  // Токен, который создался в сети, но не записался в базу. Пробуем
  // дописать его при каждом входе: сессия к этому моменту свежая, и
  // чаще всего со второго раза всё проходит.
  useEffect(() => {
    if (!userId) return;
    const потерянные = потерянныеТокены();
    if (!потерянные.length) return;
    (async () => {
      for (const строка of потерянные) {
        const { data, error } = await supabase
          .from("tokens")
          .insert({ ...строка, owner_id: userId })
          .select()
          .single();
        // Дубликат — значит запись всё-таки прошла в прошлый раз:
        // забываем и молчим, человеку об этом знать незачем.
        if (!error && data) {
          забытьПотерянный(строка.address);
          showToast(tf("tokenSaveRecovered", { ticker: строка.ticker }));
          loadMyTokens(userId);
          loadCommunityTokens();
        } else if (error && error.code === "23505") {
          забытьПотерянный(строка.address);
        }
      }
    })();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [userId]);

  // Ссылка на токен из чата. Карточку из бота открывают двумя путями:
  // прямой ссылкой на приложение с «?token=<id>» и меткой запуска
  // «tok_<id>» — её Telegram отдаёт, когда мини-приложение открыли
  // кнопкой из личной переписки. Без этого человек попадал на главную и
  // искал токен, про который ему только что прислали карточку.
  const открытыйИзСсылки = useRef(false);
  useEffect(() => {
    if (открытыйИзСсылки.current) return;
    let id = "";
    try {
      id = new URLSearchParams(window.location.search).get("token") || "";
    } catch (e) { /* адрес без параметров */ }
    // Токены с биржи своей строки в базе не имеют, поэтому в ссылке
    // едет адрес пула — по нему карточка догружается с той же биржи.
    let пул = "";
    try {
      пул = new URLSearchParams(window.location.search).get("pool") || "";
    } catch (e) { /* адрес без параметров */ }
    const метка = telegramStartParam();
    if (!id && метка.startsWith("tok_")) id = метка.slice(4);
    if (!id && метка.startsWith("buy_")) {
      const m = метка.match(/^buy_(?:x\d+_)?t_([0-9a-f-]{36})$/i);
      if (m) id = m[1];
    }
    if (!пул && метка.startsWith("pool_")) пул = метка.slice(5);

    // Сумма покупки из ссылки — необязательная.
    let сумма = 0;
    try {
      сумма = Number(new URLSearchParams(window.location.search).get("buy")) || 0;
    } catch (e) { /* адрес без параметров */ }
    // Из бота метка приходит без точек и «~»: сумма едет сотыми, вида
    // «buy_x50_t_<id>». Сам бот открывает приложение уже с «?buy=»,
    // поэтому здесь достаточно этого разбора для прямых ссылок.
    if (!сумма && метка.startsWith("buy_x")) {
      const m = метка.match(/^buy_x(\d+)_/);
      if (m) сумма = Number(m[1]) / 100;
    }
    let продажа = false;
    try {
      продажа = new URLSearchParams(window.location.search).get("sell") === "1";
    } catch (e) { /* адрес без параметров */ }

    const свой = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(id);
    if (!свой && !пул) return;
    открытыйИзСсылки.current = true;
    (async () => {
      if (свой) {
        const { data } = await supabase.from("tokens").select("*").eq("id", id).maybeSingle();
        if (!data) return;
        openToken(localTokenToFeedShape(mapTokenRow(data)));
        // Из бота приходят сразу за сделкой: «?token=…&buy=5» открывает
        // покупку с вписанной суммой, «&sell=1» — продажу. Подпись идёт
        // здесь, через подключённый кошелёк: ссылку с телом сообщения
        // кошельки открывают как простой перевод, и контракт его
        // отбивает.
        if (сумма > 0) {
          // «auto=1» — пришли прямо за подписью: окно сделки не
          // показываем, сразу зовём кошелёк. Telegram открывает
          // ton-ссылки во встроенном браузере, и до кошелька они не
          // доходят; TonConnect же вызывает его напрямую, поэтому путь
          // «кнопка в чате → окно кошелька» проходит только так.
          let сразу = false;
          try {
            сразу = new URLSearchParams(window.location.search).get("auto") === "1";
          } catch (e) { /* адрес без параметров */ }
          if (сразу) {
            setСразуВКошелёк(true);
            setЖдётПодписи(сумма);
            setЖдётПокупкиСумма(сумма);
            setЖдётПокупкиТокен(String(data.ticker || "").toUpperCase());
          }
          else setTimeout(() => setTradeModal({ mode: "buy", prefill: сумма }), 400);
        } else if (продажа) setTimeout(() => setTradeModal({ mode: "sell" }), 400);
        return;
      }
      const карточка = await fetchPoolByAddress(пул);
      if (карточка) openToken(карточка);
    })();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  function goTab(name) { setTab(name); setView(name); }
  // Создание — отдельная страница, а не вкладка: пункт из нижнего меню
  // убран, поэтому tab не трогаем — подсветка остаётся на том разделе,
  // откуда пришли, и «назад» возвращает туда же.
  function openCreate() { setView("create"); }
  function backFromToken() { setView(tab); }

  // Открытый токен — из своих? Тогда на его экране появляется управление
  // (ссылка и удаление). Сравниваем по записи из базы, а не по флагу в
  // карточке: на экран токен попадает и из ленты, где такого флага нет.
  const свойТокен = React.useMemo(
    () => (token ? (myTokens || []).find((м) => м.id === token.id) || null : null),
    [token, myTokens]
  );
  // Профиль создателя открывается поверх карточки токена, поэтому «назад»
  // возвращает именно на неё, а не на вкладку.
  const [viewedUserId, setViewedUserId] = useState(null);
  function openUserProfile(id) { if (!id) return; setViewedUserId(id); setView("user"); }
  function backFromUserProfile() { setView(token ? "token" : tab); }

  /* Кнопка «Назад» в шапке Telegram.

     На вложенных экранах — карточка токена, создание, достижения, чужой
     профиль — «Закрыть» не к месту: человек хочет вернуться на шаг, а не
     выйти из приложения. Telegram умеет подменять её своей стрелкой,
     если попросить, поэтому просим ровно там, где есть куда возвращаться.

     Порядок разбора — сверху вниз по тому, что сейчас перекрывает экран:
     сначала окна, потом страницы. Иначе стрелка увела бы с экрана,
     оставив открытым окно поверх него. Окно ввода PIN и ход запуска
     токена намеренно не перехватываются: из них выходить нельзя, пока
     дело не кончится. */
  const backAction = useMemo(() => {
    if (pinLocked || pinModal || launchRequest) return null;
    if (profileModalOpen) return () => setProfileModalOpen(false);
    if (settingsItem) return () => setSettingsItem(null);
    if (tradeModal) return () => setTradeModal(null);
    if (manageToken_) return () => setManageToken_(null);
    if (connectModalOpen) return () => setConnectModalOpen(false);
    if (view === "user") return backFromUserProfile;
    if (view === "token") return backFromToken;
    if (view === "create") return () => setView(tab);
    if (view === "achievements") return () => setView("profile");
    return null;
  }, [pinLocked, pinModal, launchRequest, profileModalOpen, settingsItem, tradeModal, manageToken_, connectModalOpen, view, tab, token]);

  useEffect(() => {
    const tg = typeof window !== "undefined" ? window.Telegram && window.Telegram.WebApp : null;
    const btn = tg && tg.BackButton;
    if (!btn) return;
    if (!backAction) { btn.hide(); return; }
    const handler = () => backAction();
    btn.onClick(handler);
    btn.show();
    return () => {
      btn.offClick(handler);
      btn.hide();
    };
  }, [backAction]);

  function handleHeaderWalletClick() {
    if (connected) { goTab("profile"); }
    else { setConnectModalOpen(true); }
  }

  function openCreateProfile() { setProfileModalMode("create"); setProfileModalOpen(true); }
  function openEditProfile() { setLookFocus(null); setProfileModalMode("edit"); setProfileModalOpen(true); }
  // Из магазина: то же окно, но открытое ради примерки.
  function openLookFromShop(kind) { setLookFocus(kind); setProfileModalMode("edit"); setProfileModalOpen(true); }
  function submitProfile(data) {
    setProfile(data);
    setAccountCreated(true);
    setProfileModalOpen(false);
    showToast(profileModalMode === "edit" ? t("profileUpdated") : profileModalMode === "login" ? t("loggedIn") : t("accountCreatedToast"));
  }
  async function logOutProfile() {
    markSignedOut(true);
    await supabase.auth.signOut();
    setAccountCreated(false);
    setProfile(EMPTY_PROFILE);
    вернутьПриветствие();
    if (connected) tonConnectUI.disconnect();
    showToast(t("loggedOut"));
  }
  async function deleteAccountForever() {
    // Удаляем профиль из таблицы profiles и выходим из сессии.
    // Полное удаление самой auth-записи пользователя требует серверного
    // вызова с service_role ключом (например, через Supabase Edge Function),
    // так как анонимный/публичный ключ на клиенте не имеет прав это делать.
    const { data: sessionData } = await supabase.auth.getUser();
    const userId = sessionData?.user?.id;
    if (userId) {
      // Ответ базы проверяем. Раньше он игнорировался, и при запрете на
      // удаление (в базе может не стоять разрешения удалять свою строку)
      // человек видел «Аккаунт удалён», хотя из аккаунта его просто
      // выкидывало, а профиль оставался на месте. Врать об этом нельзя:
      // человек уходит в уверенности, что его данных больше нет.
      const { error, count } = await supabase
        .from("profiles")
        .delete({ count: "exact" })
        .eq("id", userId);
      if (error || !count) {
        console.warn("[mintly] delete profile failed:", error && error.message);
        showToast(t("accountDeleteFailed"));
        return;
      }
    }
    markSignedOut(true);
    await supabase.auth.signOut();
    setAccountCreated(false);
    setProfile(EMPTY_PROFILE);
    вернутьПриветствие();
    if (connected) tonConnectUI.disconnect();
    showToast(t("accountDeleted"));
  }
  function openLoginProfile() { setProfileModalMode("login"); setProfileModalOpen(true); }
  function requireUnlockRoot() {
    if (!accountCreated) { setProfileModalMode("create"); setProfileModalOpen(true); showToast(t("firstAccountFirst")); return false; }
    // TonConnect нужен только токенам TON: сделка в Solana уходит
    // кошельком приложения, и требовать здесь TON-кошелёк — тупик, из
    // которого человек не выйдет, сколько его ни подключай.
    if (token && token.chain === "solana") return true;
    if (!connected) { setConnectModalOpen(true); showToast(t("connectWalletTrade")); return false; }
    return true;
  }
  function handleBuy() { if (requireUnlockRoot()) setTradeModal({ mode: "buy" }); }
  function handleSell() { if (requireUnlockRoot()) setTradeModal({ mode: "sell" }); }
  // Своя запись о сделке. Цепочка знает о переводе, но не знает, кто
  // его сделал из приложения и по какому курсу — а без этого не
  // посчитать ни портфель, ни прибыль. Пишем после того, как кошелёк
  // подтвердил отправку; ошибку записи глотаем: сделка уже ушла в сеть,
  // и мешать человеку из-за неудачной строки в базе незачем.
  function recordTrade(side, tonAmount, tokenAmount) {
    if (!userId) return;
    supabase.from("trades").insert({
      user_id: userId,
      token_id: token && token.id ? token.id : null,
      token_address: token ? token.address : null,
      ticker: token ? token.ticker : null,
      side,
      ton_amount: Number(tonAmount) || 0,
      token_amount: Number(tokenAmount) || 0,
      ton_price_usd: tonPriceUsd || 0,
    }).then(({ error }) => {
      if (error) console.warn("[mintly] не удалось записать сделку:", error.message);
    });
  }

  /* Покупка одним касанием из чата: сумма уже названа, окно сделки не
     нужно — сразу собираем транзакцию и отдаём её кошельку. Если
     кошелёк не подключён, показываем обычное окно: там есть кнопка
     подключения. */
  /* Ждём, пока приедут кошелёк и курс, и только тогда зовём подпись.
     TonConnect восстанавливает сессию асинхронно: сразу после запуска
     адреса ещё нет, и попытка «сейчас же» падала в обычное окно
     покупки. Если за восемь секунд так ничего и не приехало, показываем
     это окно — там есть и подключение кошелька, и ручной ввод. */
  useEffect(() => {
    if (!ждётПодписи || !token) return;
    if (walletAddress && tonPriceUsd > 0) {
      const сумма = ждётПодписи;
      setЖдётПодписи(0);
      автопокупка(сумма);
      return;
    }
    const сдаться = setTimeout(() => {
      const сумма = ждётПодписи;
      setЖдётПодписи(0);
      setСразуВКошелёк(false);
      setTradeModal({ mode: "buy", prefill: сумма });
    }, 8000);
    return () => clearTimeout(сдаться);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [ждётПодписи, token, walletAddress, tonPriceUsd]);

  async function автопокупка(сумма) {
    if (!walletAddress) { setСразуВКошелёк(false); setTradeModal({ mode: "buy", prefill: сумма }); return; }
    // Оценка нужна только для строчки «куплено ≈ N»: точную цифру всё
    // равно решит кривая в момент исполнения.
    const оценка = (tokensForTon(сумма) || {}).tokens || 0;
    try {
      await confirmTrade("buy", String(сумма), String(оценка), "TON", сумма, оценка);
    } finally {
      setСразуВКошелёк(false);
      // Пришли из чата ровно за подписью — делать в приложении больше
      // нечего, закрываем его и оставляем человека там, откуда он
      // пришёл.
      const wa = typeof window !== "undefined" && window.Telegram && window.Telegram.WebApp;
      if (wa && wa.close) setTimeout(() => wa.close(), 1200);
    }
  }

  /* Сделка в Solana. Кошелёк там свой (Phantom), маршрут считает
     Jupiter, а подпись человек ставит в самом кошельке — приложение
     только собирает и показывает. Ключей мы, как и в TON, не касаемся.

     Модули грузятся по требованию: шифрование сессии и разбор base58
     нужны единицам, а весят прилично — тащить их в общий пакет ради
     раздела, куда заходят не все, незачем. */
  async function свопSolana({ token, amountSol, продажа = false, количество = 0 }) {
    /* eslint-disable-next-line no-param-reassign */
    const { подключить, сохранённаяСессия, подписать } = await import("./phantom");
    const { состояниеВнутреннего, свопВнутренним } = await import("./appWallet");

    const SOL = "So11111111111111111111111111111111111111112";

    /* Сначала внутренний кошелёк: на нём хватило — сделка уходит в сеть
       сразу, без похода в Phantom. Именно этот поход и съедает время, за
       которое цена успевает уехать.

       Через внутренний кошелёк наружу уходит только намерение: какие
       токены и на сколько менять. Собирает маршрут, проверяет и
       подписывает сервер — готовых транзакций браузер больше не
       касается вовсе. */
    const нужно = продажа ? 0.003 : Number(amountSol || 0) + 0.003;
    const внутренний = await состояниеВнутреннего();
    const черезВнутренний = !!(внутренний && внутренний.address && (внутренний.sol || 0) >= нужно);
    let сессия = черезВнутренний ? { wallet: внутренний.address } : сохранённаяСессия();
    if (!сессия) {
      showToast(t("solConnecting"));
      сессия = await подключить();
    }
    // Точность токена у каждого своя, и ошибка здесь — это ошибка в
    // тысячу раз по сумме. Поэтому не угадываем: спрашиваем сеть вместе
    // с балансом, там она приходит вместе со счётом.
    let десятичные = 6;
    if (продажа) {
      const b = await fetch(апи(`/api/solana?action=balances&wallet=${сессия.wallet}&mint=${token.tokenAddress}`))
        .then((r) => r.json())
        .catch(() => null);
      if (b && b.decimals > 0) десятичные = b.decimals;
      if (b && b.token > 0 && количество > b.token) количество = b.token;
    }
    const вход = продажа ? token.tokenAddress : SOL;
    const выход = продажа ? SOL : token.tokenAddress;
    const сумма = продажа
      ? String(Math.round(количество * 10 ** десятичные))
      : String(Math.round(amountSol * 1e9));

    // Внутренним кошельком — одним запросом: маршрут, сборка, подпись и
    // отправка целиком на сервере.
    if (черезВнутренний) return await свопВнутренним({ вход, выход, сумма });

    const параметры = new URLSearchParams({ input: вход, output: выход, amount: сумма, slippage: "150" });
    const кот = await fetch(апи(`/api/solana?action=quote&${параметры}`)).then((r) => r.json());
    if (!кот || кот.error || !кот.quote) throw new Error("маршрут не найден");

    const собранная = await fetch(апи("/api/solana?action=swap"), {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ quote: кот.quote, wallet: сессия.wallet }),
    }).then((r) => r.json());
    if (!собранная || собранная.error || !собранная.transaction) throw new Error("сделка не собралась");

    showToast(t("solSignInWallet"));
    // Кошелёк только подписывает: отправку в сеть Phantom больше не
    // делает, поэтому подписанную сделку доводим до узла сами.
    const подписанная = await подписать(собранная.transaction, сессия);
    const итог = await fetch(апи("/api/solana?action=send"), {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ transaction: подписанная }),
    }).then((r) => r.json());
    if (!итог || итог.error) throw new Error("сеть не приняла сделку");
    return итог.signature;
  }

  async function confirmTrade(mode, payAmount, receiveAmount, unit, rawAmount, rawEstimate) {
    // Токен из ленты Solana торгуется в своей сети и своим кошельком:
    // ни кривой, ни TonConnect тут нет.
    if (token && token.chain === "solana") {
      try {
        const подпись = await свопSolana({
          token,
          amountSol: mode === "buy" ? rawAmount : 0,
          продажа: mode === "sell",
          количество: mode === "sell" ? rawAmount : 0,
        });
        setTradeModal(null);
        showToast(подпись ? t("solDone") : t("solSent"));
      } catch (e) {
        showToast(`${t("solFailed")}: ${String((e && e.message) || e).slice(0, 80)}`);
      }
      return;
    }

    if (mode === "buy") {
      // rawAmount is now the TON amount the person typed directly (the
      // modal is denominated in TON, not USD), so no USD conversion is
      // needed here — we only still require tonPriceUsd to be loaded so
      // the estimated token amount shown to the user was computed correctly.
      if (!(tonPriceUsd > 0)) { showToast(t("rateLoadingRetry")); return; }
      const totalTon = rawAmount;
      const spendableTon = Math.max(0, tonBalance - NETWORK_FEE_TON);
      // Цифрами, а не общими словами: человек должен сразу видеть,
      // сколько не хватает, и не идти проверять кошелёк отдельно.
      if (totalTon > spendableTon) {
        showToast(tf("insufficientTon", {
          have: `${tonBalance.toFixed(3)} TON`,
          need: `${(totalTon + NETWORK_FEE_TON).toFixed(2)} TON`,
        }));
        return;
      }
      const feeTon = totalTon * FEE_PERCENT;
      const mainTon = totalTon - feeTon;

      try {
        // У токенов, запущенных в приложении, есть своя бондинг-кривая —
        // покупка идёт сообщением на неё, и жетоны реально приходят на
        // кошелёк. У токенов из внешней ленты кривой нет: там остаётся
        // прежний перевод, потому что торговать на чужом пуле отсюда
        // пока нечем.
        // Куда идёт сделка: пока кривая торгует — в неё, после закрытия
        // — в собственный пул токена. Оба контракта наши, удерживают
        // одинаковый газ и берут ту же комиссию, отличается только тело
        // сообщения.
        const рынокПул = !!(token.graduated && token.dexPoolAddress);
        const рынок = рынокПул ? token.dexPoolAddress : token.curveAddress;
        const messages = рынок
          ? [{
              address: рынок,
              // Контракт удерживает фиксированную сумму на газ, поэтому
              // отправляем её сверх суммы покупки — иначе на рынок
              // попадёт меньше, чем человек ввёл.
              amount: (toNano(totalTon.toFixed(9)) + CURVE_GAS_BUY_OVERHEAD).toString(),
              payload: (рынокПул
                ? buildPoolBuyBody({ queryId: 0n, minTokensOut: 0n })
                : buildBuyBody({ queryId: 0n, minTokensOut: 0n })).toBoc().toString("base64"),
            }]
          : [
              { address: TREASURY_ADDRESS, amount: toNano(mainTon.toFixed(9)).toString() },
              { address: FEE_ADDRESS, amount: toNano(feeTon.toFixed(9)).toString() },
            ];
        await tonConnectUI.sendTransaction({
          validUntil: Math.floor(Date.now() / 1000) + 300,
          network: TON_TESTNET ? "-3" : "-239",
          messages,
        });
        adjustHolding(token.id, rawEstimate);
        recordTrade("buy", totalTon, rawEstimate);
        setTradeModal(null);
        showToast(tf("boughtToast", { receive: receiveAmount, ticker: token.ticker, pay: payAmount, unit }));
        // Баланс на цепочке обновится не мгновенно — даём блокчейну
        // пару секунд на подтверждение, потом перезапрашиваем его.
        setTimeout(() => setBalanceRefreshTick((n) => n + 1), 4000);
      } catch (err) {
        showToast(t("txCancelled"));
      }
    } else {
      // Can't sell more than is actually held — re-checked here too, not
      // just in the modal, in case the ledger changed since it opened.
      // Баланс берём тот же, что показан в окне, — из сети. Локальный
      // счётчик знает только о сделках через это приложение, поэтому у
      // него ноль, и продажа молча обрывалась здесь же.
      const held = chainHolding;
      if (held == null) { showToast(t("balanceLoading")); return; }
      if (rawAmount > held) { showToast(t("insufficientSellAmount")); return; }
      if (!connected) { showToast(t("connectWalletSell")); return; }
      // Продажа на кривой — это перевод жетонов на её кошелёк: кривая
      // получает уведомление и присылает TON обратно. Нужен свой кошелёк
      // жетона продавца, поэтому адрес спрашиваем у мастера жетона.
      try {
        let messages;
        // Тот же выбор рынка, что и при покупке: закрытая кривая
        // означает, что жетоны нужно переводить уже в пул.
        const рынокПродажи = token.graduated && token.dexPoolAddress
          ? token.dexPoolAddress
          : token.curveAddress;
        if (рынокПродажи && token.tokenAddress && chainJettonWallet) {
          // Адрес уже известен — между нажатием и открытием кошелька не
          // должно быть ни одного await, иначе окно кошелька закроется.
          // tonapi отдаёт адрес в сыром виде (0:abc…), а кошельки ждут
          // привычный EQ…-формат: на сыром часть из них молча отклоняет
          // запрос, и окно подтверждения закрывается само.
          const sellerWallet = Address.parse(chainJettonWallet).toString();
          const wanted = toNano(rawAmount.toFixed(9));
          const sellRaw = chainHoldingRaw != null && wanted > chainHoldingRaw ? chainHoldingRaw : wanted;
          const body = beginCell()
            .storeUint(0xf8a7ea5, 32)
            .storeUint(0, 64)
            // Продаём не больше того, что реально на кошельке: при продаже
            // всего берём точное значение из сети, а не пересчитанное из
            // округлённого числа токенов.
            .storeCoins(sellRaw)
            .storeAddress(Address.parse(рынокПродажи))
            .storeAddress(Address.parse(walletAddress))
            .storeBit(false)
            .storeCoins(CURVE_SELL_FORWARD_TON)
            .storeBit(true)
            .storeRef(buildSellPayload(0n))
            .endCell();
          messages = [{
            address: sellerWallet,
            amount: CURVE_SELL_VALUE.toString(),
            payload: body.toBoc().toString("base64"),
          }];
        } else {
          // У токенов из внешней ленты кривой нет: настоящей продажи
          // здесь не происходит, но комиссия площадки берётся с любой
          // сделки — те же 1%, что удерживает кривая. Считаем их от
          // суммы продажи в TON; совсем маленькая сумма упирается в
          // минимум, иначе сообщение не покрыло бы даже пересылку.
          const usdValue = rawAmount * (token.price > 0 ? token.price : 0);
          const tonValue = tonPriceUsd > 0 ? usdValue / tonPriceUsd : 0;
          const feeTon = Math.max(0.01, tonValue * FEE_PERCENT);
          messages = [{
            address: FEE_ADDRESS,
            amount: toNano(feeTon.toFixed(9)).toString(),
          }];
        }
        await tonConnectUI.sendTransaction({
          validUntil: Math.floor(Date.now() / 1000) + 300,
          network: TON_TESTNET ? "-3" : "-239",
          messages,
        });
        adjustHolding(token.id, -rawAmount);
        // Сколько TON вернулось — это оценка из окна, точную сумму знает
        // только сеть, а ждать её здесь нельзя.
        recordTrade("sell", tonPriceUsd > 0 ? (rawAmount * (token.price > 0 ? token.price : 0)) / tonPriceUsd : 0, rawAmount);
        setTradeModal(null);
        showToast(tf("soldToast", { pay: payAmount, ticker: token.ticker, receive: receiveAmount, unit }));
        setTimeout(() => setBalanceRefreshTick((n) => n + 1), 4000);
      } catch (err) {
        // Текст ошибки показываем целиком: консоли внутри Telegram нет, а
        // отличить отказ пользователя от отклонённого запроса иначе
        // невозможно.
        const detail = (err && (err.message || String(err))) || "";
        console.error("[mintly] продажа не прошла:", err);
        showToast(detail ? `${t("txCancelled")} — ${detail.slice(0, 140)}` : t("txCancelled"));
      }
    }
  }
  // Экран загрузки на старте: держим его, пока не отработали все
  // стартовые запросы — восстановление сессии, лента пулов (из неё же
  // берутся покупки для тикера), токены сообщества и курс TON. Каждый
  // шаг «готов» и по успеху, и по ошибке: если API недоступен, в
  // приложение всё равно надо пустить.
  const bootSteps = [
    { key: "bootStepAuth", done: authChecked },
    { key: "bootStepFeed", done: !tokensLoading },
    { key: "bootStepTokens", done: communityLoaded },
    { key: "bootStepRate", done: tonPriceChecked },
  ];
  const bootDone = bootSteps.every((s) => s.done);
  const [bootHidden, setBootHidden] = useState(false);
  // Страховка: даже если какой-то запрос завис, дольше 9 секунд держать
  // человека на заставке нельзя.
  useEffect(() => {
    const to = setTimeout(() => setBootHidden(true), 9000);
    return () => clearTimeout(to);
  }, []);
  // Небольшая задержка после готовности — чтобы заставка успела доиграть
  // затухание, а не моргнула.
  useEffect(() => {
    if (!bootDone) return;
    const to = setTimeout(() => setBootHidden(true), 520);
    return () => clearTimeout(to);
  }, [bootDone]);

  return (
    <div
      // Устройство проставляется в разметку: по нему можно и стили
      // цеплять, и видеть в инспекторе, где именно открыто приложение,
      // когда проблема воспроизводится только на одном клиенте.
      data-platform={device.platform}
      data-telegram={device.inTelegram ? "1" : "0"}
      style={{
        background: T.bg, height, minHeight: height, width: "100%", maxWidth: 480,
        margin: "0 auto", fontFamily: bodyFont, position: "relative", overflow: "hidden",
      }}
    >
      <GlobalStyle />
      {/* Запуск токена показывает ракету — и только её. Обводки
          «Динамического острова» и контура экрана, которые она
          поджигала, убраны: на разных телефонах они ложились по-разному,
          а на тех, где острова нет, рамка выглядела случайной деталью. */}
      {rocketFlying && <LaunchRocket variant={rocketVariant} />}
      {/* Пришли за подписью — заставка только задерживает: человек ждёт
          кошелёк, а не знакомство с приложением. */}
      {/* Приветствие ждёт, пока догрузится приложение: показывать его
          поверх заставки — значит перебивать одно ожидание другим. */}
      {приветствие && !accountCreated && bootHidden && !сразуВКошелёк && (
        <WelcomeScreen
          insetTop={insetTop}
          onCreate={() => { закрытьПриветствие(); openCreateProfile(); }}
          onLogin={() => { закрытьПриветствие(); openLoginProfile(); }}
          onSkip={закрытьПриветствие}
        />
      )}
      {!bootHidden && !сразуВКошелёк && <BootSplash steps={bootSteps} done={bootDone} insetTop={insetTop} />}
      <Toast key={toastSeq} toast={toast} insetTop={insetTop} leaving={toastLeaving} />

      {/* Проход в кошелёк из чата. Приложение здесь — только мостик к
          TonConnect: показывать за эту секунду ленту и графики незачем,
          человек ждёт окно подписи. */}
      {сразуВКошелёк && (
        <div style={{
          position: "absolute", inset: 0, zIndex: 250, background: T.bg,
          display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center",
          gap: 12, padding: "0 28px",
        }}>
          <RefreshCw size={30} color={T.electric} style={{ animation: "spin360 1.1s linear infinite" }} />
          <span style={{ fontFamily: displayFont, color: T.ice, fontSize: 17, fontWeight: 700 }}>
            {ждётПокупкиТокен ? `${ждётПокупкиСумма} TON · ${ждётПокупкиТокен}` : t("openingWallet")}
          </span>
          <span style={{ fontFamily: bodyFont, color: T.muted, fontSize: 13.5, textAlign: "center", lineHeight: 1.45 }}>
            {t("openingWalletHint")}
          </span>
          {/* Кнопка на случай, если кошелёк не отозвался сам: нажатие
              зовёт его ещё раз. Ждать вслепую человек не должен. */}
          <button
            onClick={() => { const с = ждётПодписи || ждётПокупкиСумма; if (с > 0) { setЖдётПодписи(0); автопокупка(с); } }}
            className="fx-tap w-full rounded-[20px] py-3 mt-2"
            style={{ maxWidth: 320, background: PRISM, color: PRISM_TEXT, fontFamily: displayFont, fontWeight: 700, fontSize: 15 }}
          >
            {t("openWalletCta")}
          </button>
          <button
            onClick={() => { const с = ждётПодписи || ждётПокупкиСумма; setЖдётПодписи(0); setСразуВКошелёк(false); setTradeModal({ mode: "buy", prefill: с || undefined }); }}
            className="fx-tap"
            style={{ fontFamily: bodyFont, color: T.muted, fontSize: 13.5, marginTop: 2 }}
          >
            {t("changeAmountCta")}
          </button>
        </div>
      )}

      {pinLocked && appSettings.pinEnabled && pinCode && (
        <PinLockScreen pin={pinCode} profile={profile} onUnlock={() => setPinLocked(false)} onForgot={forgotPin} />
      )}

      <ConnectModal open={connectModalOpen} onClose={() => setConnectModalOpen(false)} onConnect={() => tonConnectUI.openModal()} />
      <AuthModal open={profileModalOpen} onClose={() => { setProfileModalOpen(false); setLookFocus(null); }} onSubmit={submitProfile} initial={profile} mode={profileModalMode} walletAddress={walletAddress} onChangeNickname={changeNickname} cosmetics={cosmetics} owned={owned} onEquip={equipCosmetic} lookFocus={lookFocus} />
      <SettingsPanel
        item={settingsItem}
        onClose={() => setSettingsItem(null)}
        appSettings={appSettings}
        onUpdateSetting={updateAppSetting}
        insetBottom={insetBottom}
        insetTop={insetTop}
        profile={profile}
        showToast={showToast}
        onTogglePin={handleTogglePin}
        onChangePin={requestChangePin}
        accountCreated={accountCreated}
        onDeleteAccount={deleteAccountForever}
        userId={userId}
        inviteCount={inviteCount}
        notifyPrefs={notifyPrefs}
        onUpdateNotify={updateNotifyPrefs}
        onSupportRead={() => setSupportUnread(0)}
      />
      <PinSetupModal
        mode={pinModal ? pinModal.mode : null}
        currentPin={pinCode}
        onClose={() => setPinModal(null)}
        onComplete={completePinSetup}
        onDisable={completePinDisable}
        showToast={showToast}
      />
      <ChestReveal prize={chestPrize} onClose={() => setChestPrize(null)} />
      <TokenManageSheet token={manageToken_} onClose={() => setManageToken_(null)} showToast={showToast} onDelete={deleteMyToken} />
      <TradeModal t={token} tradeModal={tradeModal} onClose={() => setTradeModal(null)} onConfirm={confirmTrade} walletTonBalance={tonBalance} tonPriceUsd={tonPriceUsd} heldAmount={chainHolding} curveState={tradeCurveState} />
      <TokenLaunchOverlay
        open={!!launchRequest}
        form={launchRequest ? launchRequest.form : EMPTY_LAUNCH_FORM}
        category={launchRequest ? launchRequest.category : null}
        logoUrl={launchRequest ? launchRequest.logoUrl : null}
        buyAmount={launchRequest ? launchRequest.buyAmount : ""}
        stepIndex={launchProgress.stepIndex}
        done={launchProgress.done}
        error={launchProgress.error}
        result={launchProgress.result}
        onClose={closeLaunchOverlay}
        onRetry={retryLaunch}
        onViewToken={viewLaunchedToken}
      />

      <div style={{ position: "relative", zIndex: 1, height: "100%", display: "flex", flexDirection: "column" }}>
        {/* header with logo/wallet removed — content now starts right at the top.
            The bottom nav is an absolutely-positioned overlay (not a flex
            sibling) so the feed actually scrolls underneath it — that's what
            makes the frosted-glass blur show real content/text sliding past
            behind the bar instead of just a flat tinted strip. paddingBottom
            below reserves the nav's own height so the last row of content
            can still scroll clear of it. */}
        <div className="no-scrollbar px-4 подложка" style={{ flex: 1, overflowY: "auto", minHeight: 0, paddingTop: contentTopPad(insetTop), /* Панель разделов стала ниже капсулы: и запас под неё нужен меньше. */
          // Ключа по разделу здесь нет намеренно: он пересоздавал весь
          // контейнер при каждом переходе, а вместе с ним и все вкладки
          // внутри KeepAlive — то есть ровно то, ради чего KeepAlive и
          // стоит. Ленты при этом перезапрашивались с нуля.
          // Запас под капсулу: она висит над прокруткой, и последняя
          // строка списка должна уходить из-под неё целиком.
          paddingBottom: 96 + insetBottom }}>
          <KeepAlive show={view === "home"}>
            <HomeView
              onGoTab={goTab}
              onGoCreate={openCreate}
              curveTokens={communityTokens}
              onOpenToken={openToken}
              onOpenProfile={openUserProfile}
              profile={profile}
              accountCreated={accountCreated}
              myTokens={myTokens}
              achievements={achievements}
              userId={userId}
              onOpenMyProfile={() => goTab("profile")}
              onOpenAchievements={() => setView("achievements")}
            />
          </KeepAlive>
          <KeepAlive show={view === "mempad"}>
            <MempadView tokens={tokens} loading={tokensLoading} myTokensLoading={!communityLoaded} myTokens={communityTokens} onOpen={openToken} onLaunch={openCreate} solДоступен={solЗапуск} />
          </KeepAlive>
          <KeepAlive show={view === "wallet"}>
            <WalletView
              connected={connected}
              walletAddress={walletAddress}
              tonBalance={tonBalance}
              tonPriceUsd={tonPriceUsd}
              onConnect={() => { tonConnectUI.openModal(); }}
              onDisconnect={() => { tonConnectUI.disconnect(); }}
              onCopy={() => {
                if (typeof navigator !== "undefined" && navigator.clipboard) navigator.clipboard.writeText(walletAddress).catch(() => {});
                showToast(t("addressCopied"));
              }}
              holdings={walletHoldings}
              holdingsReady={holdingsReady}
              showToast={showToast}
            />
          </KeepAlive>
          <KeepAlive show={view === "shop"}>
            <ShopView
              cosmetics={cosmetics}
              owned={owned}
              coins={coins}
              onBuy={buyCosmetic}
              onOpenLook={openLookFromShop}
              onOpenChest={openChest}
              achievementsReady={achievementsReady}
              onOpenAchievements={() => setView("achievements")}
              showToast={showToast}
              accountCreated={accountCreated}
              onOpenLogin={openLoginProfile}
            />
          </KeepAlive>
          {view === "achievements" && (
            <AchievementsView achievements={achievements} onGoShop={() => goTab("shop")} onBack={() => setView("profile")} />
          )}
          {view === "user" && (
            <PublicProfileView
              userId={viewedUserId}
              currentUserId={userId}
              onBack={backFromUserProfile}
              onOpenToken={(row) => openToken(localTokenToFeedShape(mapTokenRow(row)))}
              onNeedAuth={openCreateProfile}
              showToast={showToast}
              insetTop={insetTop}
            />
          )}
          {view === "token" && <TokenDetail t={token} onBack={backFromToken} showToast={showToast} onBuy={handleBuy} onSell={handleSell} unlocked={accountCreated && (connected || (token && token.chain === "solana"))} connected={connected} onConnectWallet={() => setConnectModalOpen(true)} themeKey={appSettings.theme} currentUserId={userId} onNeedAuth={openCreateProfile} onOpenProfile={openUserProfile} tonPriceUsd={tonPriceUsd} walletAddress={walletAddress} onManage={свойТокен ? () => setManageToken_(свойТокен) : null} />}
          {view === "create" && (
            <CreateView
              showToast={showToast}
              unlocked={accountCreated && connected}
              accountCreated={accountCreated}
              connected={connected}
              onOpenCreateProfile={openCreateProfile}
              onOpenConnectModal={() => setConnectModalOpen(true)}
              onLaunch={handleLaunchRequest}
              solДоступен={solЗапуск}
            />
          )}
        </div>

        {/* Профиль — отдельная страница поверх главной. Уйти с неё можно
            панелью разделов: она остаётся выше по слою. */}
        <СтраницаПрофиля открыт={view === "profile"} insetTop={insetTop}>
            <ProfileView
              connected={connected}
              onOpenConnectModal={() => setConnectModalOpen(true)}
              showToast={showToast}
              accountCreated={accountCreated}
              profile={profile}
              onOpenCreateProfile={openCreateProfile}
              onOpenLogin={openLoginProfile}
              onOpenEditProfile={openEditProfile}
              onLogOut={logOutProfile}
              supportUnread={supportUnread}
              onOpenSetting={(item) => setSettingsItem(item)}
              onGoCreate={openCreate}
              onOpenToken={openToken}
              myTokens={myTokens}
              cosmetics={cosmetics}
              onGoShop={() => goTab("shop")}
              onOpenAchievements={() => setView("achievements")}
              achievements={achievements}
              insetTop={insetTop}
              userId={userId}
              creatorTier={creatorTier}
              onVerified={markProfileVerified}
            />
        </СтраницаПрофиля>

        {/* Панель разделов — плавающая капсула, как и была: отдельный
            предмет поверх приложения, а не полоса, приросшая к нижнему
            краю. Лента прокручивается под ней, и по просвету по бокам
            видно, что экран продолжается дальше.

            Размытия подложки нет намеренно: панель висит над прокруткой,
            и браузер пересчитывал бы его на каждом кадре списка. Плотная
            заливка выглядит так же и ничего не стоит. */}
        <div
          className="flex items-center justify-around"
          style={{
            position: "absolute", left: "50%", transform: "translateX(-50%)", bottom: insetBottom + 6, zIndex: 5,
            width: "92%", maxWidth: 420,
            padding: "10px 10px",
            borderRadius: 999,
            background: hexA(T.bg, 0.92),
            border: `1px solid ${T.lineHi}`,
            boxShadow: "0 10px 34px rgba(0,0,0,0.4)",
          }}
        >
          {/* Профиля в панели нет: туда ходят за своими делами, а не
              переключаются между ним и рынком. Вход — по аватарке в углу
              главной, как это устроено везде. */}
          {[
            { id: "home", label: t("navHome"), icon: HomeIcon },
            { id: "shop", label: t("navShop"), icon: ShoppingBag },
            { id: "mempad", label: t("navMempad"), icon: Rocket },
            { id: "wallet", label: t("navWallet"), icon: Wallet },
          ].map(({ id, label, icon: Icon, locked }) => {
            const active = tab === id;
            return (
              <button
                key={id}
                // Отклик отдаём сразу, до перерисовки: тяжёлый экран
                // строится десятую долю секунды, и без него кажется, что
                // нажатие не прошло — человек жмёт второй раз.
                onClick={() => { haptic("light"); goTab(id); }}
                className="fx-tap flex flex-col items-center gap-1.5"
                style={{ position: "relative", background: "transparent", border: "none", padding: 0 }}
              >
                <Icon size={22} strokeWidth={1.75} color={active ? T.electric : T.muted} style={{ transition: `color ${EASE}` }} />
                {locked && (
                  <div style={{ position: "absolute", top: -3, right: -3, width: 14, height: 14, borderRadius: "50%", background: T.surface, border: `1px solid ${T.line}`, display: "flex", alignItems: "center", justifyContent: "center" }}>
                    <Lock size={8} color={T.muted} />
                  </div>
                )}
                <span style={{ fontFamily: bodyFont, fontSize: 13, color: active ? T.ice : T.muted, transition: `color ${EASE}` }}>{label}</span>
              </button>
            );
          })}
        </div>
      </div>
    </div>
  );
}
