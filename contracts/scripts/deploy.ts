// Развёртывание кривой в тестнете или мейннете.
//
//   npm run build
//   TON_MNEMONIC="слово слово ..." \
//   JETTON_MASTER=EQ... \
//   FEE_WALLET=EQ... \
//   GRADUATION_DESTINATION=EQ... \
//   NETWORK=testnet \
//   npx tsx scripts/deploy.ts
//
// Скрипт только разворачивает контракт. Жетон разворачивается отдельно
// (этим занимается приложение), после чего его кошелёк у кривой
// привязывается сообщением SetJettonWallet — см. README.

import { mnemonicToPrivateKey } from "@ton/crypto";
import { Address, toNano, TonClient, WalletContractV4, internal } from "@ton/ton";
import { BondingCurve } from "../build/bonding_curve_BondingCurve";

// Параметры кривой. Значения по умолчанию рассчитаны так, чтобы порог
// выпуска был достижим: при полностью распроданном tokensForSale кривая
// собирает больше, чем graduationTon (контракт проверяет это сам и не
// развернётся, если условие нарушено).
const VIRTUAL_TON = toNano(process.env.VIRTUAL_TON ?? "291.217");
const VIRTUAL_TOKENS = toNano(process.env.VIRTUAL_TOKENS ?? "1073000000");
const TOKENS_FOR_SALE = toNano(process.env.TOKENS_FOR_SALE ?? "900000000");
const GRADUATION_TON = toNano(process.env.GRADUATION_TON ?? "1500");
const FEE_BPS = BigInt(process.env.FEE_BPS ?? "0"); // 0% — площадка комиссию не берёт

function requireEnv(name: string): string {
  const value = process.env[name];
  if (!value) throw new Error(`Не задана переменная ${name}`);
  return value;
}

async function main() {
  const network = process.env.NETWORK === "mainnet" ? "mainnet" : "testnet";
  const mnemonic = requireEnv("TON_MNEMONIC").trim().split(/\s+/);
  const jettonMaster = Address.parse(requireEnv("JETTON_MASTER"));
  const feeWallet = Address.parse(requireEnv("FEE_WALLET"));
  const graduationDestination = Address.parse(requireEnv("GRADUATION_DESTINATION"));

  const endpoint = network === "mainnet"
    ? "https://toncenter.com/api/v2/jsonRPC"
    : "https://testnet.toncenter.com/api/v2/jsonRPC";
  const client = new TonClient({ endpoint, apiKey: process.env.TONCENTER_API_KEY });

  const key = await mnemonicToPrivateKey(mnemonic);
  const wallet = client.open(
    WalletContractV4.create({ workchain: 0, publicKey: key.publicKey }),
  );
  const sender = wallet.sender(key.secretKey);

  const curve = client.open(
    await BondingCurve.fromInit(
      wallet.address,          // admin — только привязка кошелька жетона
      jettonMaster,
      feeWallet,
      graduationDestination,
      VIRTUAL_TON,
      VIRTUAL_TOKENS,
      TOKENS_FOR_SALE,
      GRADUATION_TON,
      FEE_BPS,
    ),
  );

  console.log(`сеть:        ${network}`);
  console.log(`кошелёк:     ${wallet.address.toString()}`);
  console.log(`жетон:       ${jettonMaster.toString()}`);
  console.log(`адрес кривой ${curve.address.toString()}`);

  await curve.send(sender, { value: toNano("0.2") }, { $$type: "Deploy", queryId: 0n });
  console.log("сообщение развёртывания отправлено");
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
