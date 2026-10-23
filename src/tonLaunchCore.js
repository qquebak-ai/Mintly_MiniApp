/* Сообщения запуска токена в TON — одни и те же для браузера и сервера.
 *
 * Запуск теперь подписывает кошелёк приложения, а ключ от него лежит
 * только на сервере. Поэтому собирает транзакцию тоже сервер: браузер
 * присылает лишь «вот метаданные, столько купить», а адреса контрактов
 * и тела сообщений вычисляются здесь, из параметров площадки. Подсунуть
 * чужой контракт или перевод на свой адрес снаружи нельзя.
 *
 * Сервер не умеет читать TypeScript, поэтому для него этот файл
 * собирается в api/_tonLaunchCore.js (см. scripts/build-ton-core.mjs).
 */
import { Address, beginCell, toNano } from "@ton/core";
import { JettonMinter } from "@ton-community/assets-sdk/dist/jetton/JettonMinter.js";
import { JettonWallet } from "@ton-community/assets-sdk/dist/jetton/JettonWallet.js";
import {
  curveContract,
  poolContract,
  buildSetCurveBody,
  buildBuyBody,
  buildSetJettonWalletBody,
  CURVE_TOTAL_SUPPLY,
  CURVE_GAS_BUY_OVERHEAD,
} from "./curveConfig";

// Кошелёк площадки, куда кривая и пул шлют комиссию. Ставка нулевая,
// но адрес зашит в контракты и обязан совпадать у всех токенов.
export const АДРЕС_КОМИССИИ = "0QClGN5huzz-Z3bwgxr7GOPe5Jyi8PNKbsNnDFKFNGbjunBZ";

/* Отправитель, который ничего не отправляет: библиотечные sendMint и
   подобные отдают ему готовое сообщение, а мы складываем его в список. */
function копилка(адрес, список) {
  return { address: адрес, async send(args) { список.push(args); } };
}
/* Провайдер нового контракта: он ещё не развёрнут, поэтому каждое
   сообщение несёт его stateInit — первое же развернёт контракт и сразу
   выполнит своё тело. */
function провайдерНового(контракт) {
  return {
    async internal(via, m) {
      await via.send({
        to: контракт.address, value: m.value, bounce: m.bounce ?? true,
        sendMode: m.sendMode, init: контракт.init, body: m.body,
      });
    },
  };
}

/* Возвращает два пакета: первый — жетон, кривая и пул (четыре
   сообщения, больше кошелёк v4 за раз не отправит), второй — стартовая
   покупка, если она есть. Покупку отделяем намеренно: кривая держит
   такие покупки до прихода запаса и при отказе возвращает TON, так что
   порядок доставки на деньги не влияет. */
/* ликвидность — адрес кошелька ликвидности площадки. Если он задан,
   собранное кривой уходит на него, и сервер сам заводит пул на STON.fi
   (api/ton-migrate.js); свой пул-контракт тогда не нужен вовсе. Без
   него — как раньше, в собственный пул токена. */
export async function сообщенияЗапуска({ admin, metadataUrl, buyTon = 0, feeAddress = АДРЕС_КОМИССИИ, ликвидность = null }) {
  const адм = typeof admin === "string" ? Address.parse(admin) : admin;
  const комиссия = typeof feeAddress === "string" ? Address.parse(feeAddress) : feeAddress;
  const содержимое = beginCell().storeUint(0x01, 8).storeStringTail(metadataUrl).endCell();

  const первый = [];
  const отпр = копилка(адм, первый);

  // Жетон: развёртывание и выпуск всего запаса на кривую — одним
  // сообщением. Стоимость с запасом: минтер пересылает выпуск дальше,
  // на кошелёк жетона у кривой, и платит за его создание.
  const минтер = JettonMinter.createFromConfig({ admin: адм, content: содержимое });
  const жетон = минтер.address;

  const пул = ликвидность ? null : await poolContract({ admin: адм, jettonMaster: жетон, feeWallet: комиссия });
  const получатель = ликвидность ? (typeof ликвидность === "string" ? Address.parse(ликвидность) : ликвидность) : пул.address;
  const кривая = await curveContract({ admin: адм, jettonMaster: жетон, feeWallet: комиссия, graduationDestination: получатель });

  await минтер.sendMint(провайдерНового(минтер), отпр, кривая.address, CURVE_TOTAL_SUPPLY, { value: toNano("0.1") });

  const кошелёкКривой = JettonWallet.createFromConfig({ owner: кривая.address, jettonMaster: жетон }).address;
  первый.push({ to: кривая.address, value: toNano("0.05"), init: кривая.init, body: buildSetJettonWalletBody(кошелёкКривой), bounce: false });

  if (пул) {
    const кошелёкПула = JettonWallet.createFromConfig({ owner: пул.address, jettonMaster: жетон }).address;
    первый.push({ to: пул.address, value: toNano("0.06"), init: пул.init, body: buildSetJettonWalletBody(кошелёкПула), bounce: false });
    первый.push({ to: пул.address, value: toNano("0.03"), init: пул.init, body: buildSetCurveBody(кривая.address), bounce: false });
  }

  const второй = [];

  /* Отказ от выпуска. Админ жетона — кошелёк создателя, а фразу от него
     человек может увидеть и унести в любой кошелёк. С правом выпуска это
     значило бы: напечатать сколько угодно токенов и продать их в кривую,
     забрав деньги всех покупателей. Поэтому сразу после выпуска запаса
     админ меняется на «никого» — сообщения одному адресату доходят по
     порядку, и выпуск успевает раньше. Кошелёк v4 шлёт до четырёх
     сообщений за раз: не влезло в первый пакет — уходит первым во второй. */
  const отказ = [];
  await минтер.sendChangeAdmin(провайдерНового(минтер), копилка(адм, отказ), null, { value: toNano("0.05") });
  if (первый.length < 4) первый.push(...отказ);
  else второй.push(...отказ);

  const покупка = Math.max(0, Number(buyTon) || 0);
  if (покупка > 0) {
    второй.push({
      to: кривая.address,
      value: toNano(покупка.toFixed(9)) + CURVE_GAS_BUY_OVERHEAD,
      body: buildBuyBody({ queryId: 0n, minTokensOut: 0n }),
      bounce: true,
    });
  }

  return {
    пакеты: [первый, второй].filter((п) => п.length),
    отказОтВыпуска: true,
    адреса: {
      jettonMaster: жетон.toString(),
      curve: кривая.address.toString(),
      curveJettonWallet: кошелёкКривой.toString(),
      pool: пул ? пул.address.toString() : null,
    },
  };
}

/* Проверка кривой перед сделкой. Строку токена пишет браузер создателя,
   и адрес кривой в ней мог бы указывать куда угодно — хоть на свой
   кошелёк. Настоящая кривая площадки — та, чей адрес получается из кода
   кривой и параметров площадки: админ — кошелёк создателя в приложении,
   жетон — из строки, комиссия и получатель ликвидности — наши. Подделать
   такой адрес нельзя: он и есть отпечаток кода вместе с данными. */
export async function адресаКривойПлощадки({ admin, jettonMaster, ликвидность = null }) {
  const адм = typeof admin === "string" ? Address.parse(admin) : admin;
  const жетон = typeof jettonMaster === "string" ? Address.parse(jettonMaster) : jettonMaster;
  const комиссия = Address.parse(АДРЕС_КОМИССИИ);
  const адреса = [];
  if (ликвидность) {
    const получатель = typeof ликвидность === "string" ? Address.parse(ликвидность) : ликвидность;
    адреса.push((await curveContract({ admin: адм, jettonMaster: жетон, feeWallet: комиссия, graduationDestination: получатель })).address);
  }
  const пул = await poolContract({ admin: адм, jettonMaster: жетон, feeWallet: комиссия });
  адреса.push((await curveContract({ admin: адм, jettonMaster: жетон, feeWallet: комиссия, graduationDestination: пул.address })).address);
  return адреса.map((а) => а.toRawString());
}

/* Отказ от выпуска у уже запущенного жетона: для токенов, запущенных до
   того, как отказ вошёл в сам запуск, и для запусков, оборвавшихся до
   пакета с отказом (см. api/wallet-ton.js, отказатьсяОтВыпуска). */
export async function сообщениеОтказа({ admin, jettonMaster }) {
  const адм = typeof admin === "string" ? Address.parse(admin) : admin;
  const жетон = typeof jettonMaster === "string" ? Address.parse(jettonMaster) : jettonMaster;
  const список = [];
  const провайдер = {
    async internal(via, m) {
      await via.send({ to: жетон, value: m.value, bounce: m.bounce ?? true, sendMode: m.sendMode, body: m.body });
    },
  };
  await JettonMinter.createFromAddress(жетон).sendChangeAdmin(провайдер, копилка(адм, список), null, { value: toNano("0.03") });
  return список[0];
}

/* Кошелёк жетона у кривой — тот, что привязывает запуск. Админ кривой
   может привязать любой адрес, и привязка у кривой одна: собранная по
   фразе создателя кривая с подставным кошельком брала бы TON за жетоны,
   которых не отдаёт, и платила бы за «продажи» из подставного кошелька. */
export function кошелёкЖетонаКривой({ curve, jettonMaster }) {
  const кривая = typeof curve === "string" ? Address.parse(curve) : curve;
  const жетон = typeof jettonMaster === "string" ? Address.parse(jettonMaster) : jettonMaster;
  return JettonWallet.createFromConfig({ owner: кривая, jettonMaster: жетон }).address.toRawString();
}

// Отпечаток кода стандартного минтера жетона, которым запускает площадка.
export function отпечатокМинтера() {
  return JettonMinter.createFromConfig({ admin: Address.parse(АДРЕС_КОМИССИИ), content: beginCell().endCell() }).init.code.hash().toString("hex");
}
