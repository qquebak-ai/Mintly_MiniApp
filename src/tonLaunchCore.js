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
export async function сообщенияЗапуска({ admin, metadataUrl, buyTon = 0, feeAddress = АДРЕС_КОМИССИИ }) {
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

  const пул = await poolContract({ admin: адм, jettonMaster: жетон, feeWallet: комиссия });
  const кривая = await curveContract({ admin: адм, jettonMaster: жетон, feeWallet: комиссия, graduationDestination: пул.address });

  await минтер.sendMint(провайдерНового(минтер), отпр, кривая.address, CURVE_TOTAL_SUPPLY, { value: toNano("0.1") });

  const кошелёкКривой = JettonWallet.createFromConfig({ owner: кривая.address, jettonMaster: жетон }).address;
  первый.push({ to: кривая.address, value: toNano("0.05"), init: кривая.init, body: buildSetJettonWalletBody(кошелёкКривой), bounce: false });

  const кошелёкПула = JettonWallet.createFromConfig({ owner: пул.address, jettonMaster: жетон }).address;
  первый.push({ to: пул.address, value: toNano("0.06"), init: пул.init, body: buildSetJettonWalletBody(кошелёкПула), bounce: false });
  первый.push({ to: пул.address, value: toNano("0.03"), init: пул.init, body: buildSetCurveBody(кривая.address), bounce: false });

  const второй = [];
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
    адреса: {
      jettonMaster: жетон.toString(),
      curve: кривая.address.toString(),
      curveJettonWallet: кошелёкКривой.toString(),
      pool: пул.address.toString(),
    },
  };
}
