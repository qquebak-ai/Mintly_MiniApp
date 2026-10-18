/* Запуск токена в сети EVM — сторона браузера.
 *
 * Отдельно от tonLaunch.js: тот тянет за собой библиотеки TON на
 * четверть мегабайта, а здесь браузеру нужно только положить логотип и
 * описание в хранилище и назвать серверу намерение. Транзакцию собирает
 * и подписывает сервер кошельком приложения (api/wallet-evm.js).
 */
import { supabase } from "./supabaseClient";
import { запуститьEVM } from "./appWallet";

const РАСШИРЕНИЯ = { "image/png": "png", "image/jpeg": "jpg", "image/webp": "webp", "image/gif": "gif", "image/svg+xml": "png" };

/* Логотип и metadata.json — в свою папку пользователя, без перезаписи:
   политика хранилища сверяет первый сегмент пути с его id, и чужой
   metadata.json подменить нельзя. Тот же порядок, что у запуска в TON. */
async function положитьВХранилище({ logoFile, name, symbol, description }) {
  const { data: вход } = await supabase.auth.getUser();
  const uid = вход && вход.user && вход.user.id;
  if (!uid) throw new Error("Нужно войти в аккаунт, чтобы загрузить логотип токена");
  const метка = Date.now();
  let imageUrl = null;
  if (logoFile) {
    const тип = logoFile.type || "image/png";
    const путь = `${uid}/${метка}/logo.${РАСШИРЕНИЯ[тип] || "png"}`;
    // Байтами, а не файлом: WebKit в Telegram молча роняет загрузку
    // потокового тела («Load failed»).
    const { error } = await supabase.storage.from("token-assets").upload(путь, await logoFile.arrayBuffer(), { upsert: false, contentType: тип });
    if (error) throw new Error(`Логотип не загрузился: ${error.message}`);
    imageUrl = supabase.storage.from("token-assets").getPublicUrl(путь).data.publicUrl;
  }
  const метаданные = { name, symbol, description: description || "", image: imageUrl, decimals: 18 };
  const путьМеты = `${uid}/${метка}/metadata.json`;
  const { error: ошибкаМеты } = await supabase.storage.from("token-assets")
    .upload(путьМеты, new TextEncoder().encode(JSON.stringify(метаданные)), { upsert: false, contentType: "application/json" });
  if (ошибкаМеты) throw new Error(`Описание токена не загрузилось: ${ошибкаМеты.message}`);
  return { imageUrl, metadataUrl: supabase.storage.from("token-assets").getPublicUrl(путьМеты).data.publicUrl };
}

const ОБОЗРЕВАТЕЛИ = { bsc: "https://bscscan.com", base: "https://basescan.org", eth: "https://etherscan.io" };

export async function запуститьТокенEVM({ сеть, имя, тикер, описание, logoFile, взнос = 0, onStage = () => {} }) {
  onStage(0);
  const { imageUrl, metadataUrl } = await положитьВХранилище({ logoFile, name: имя, symbol: тикер, description: описание });
  onStage(1);
  onStage(2);
  const итог = await запуститьEVM({ сеть, имя, тикер, metadataUrl, взнос });
  if (!итог || !итог.token) {
    // Повтор того же нажатия: токен уже запущен первым запросом.
    if (итог && итог.repeat) throw new Error("Запуск уже отправлен — токен появится в мемпаде через минуту");
    throw new Error("Сеть не подтвердила запуск");
  }
  return {
    token: итог.token,
    factory: итог.factory,
    wallet: итог.wallet,
    bought: Number(итог.bought) || 0,
    logoUrl: imageUrl,
    explorerUrl: `${ОБОЗРЕВАТЕЛИ[сеть] || ОБОЗРЕВАТЕЛИ.eth}/tx/${итог.tx}`,
  };
}
