/* Сайт для компьютера — то же приложение, что и в Telegram.
 *
 * Раньше у монитора была своя витрина с другим дизайном и половиной
 * функций. Теперь на большом экране открывается само приложение — с
 * теми же кнопками, цветами и всеми разделами, — только разложенное под
 * монитор: меню слева, содержимое на всю ширину (App.tsx смотрит на
 * признак ПК). Вход — без Telegram: Google, почта или Phantom.
 */
import React, { useEffect, useState } from "react";
import { supabase } from "./supabaseClient";
import DesktopAuth, { профильЕсть } from "./DesktopAuth";
import TonLaunchApp from "./App";

export default function PC() {
  // null — ещё проверяем; false — нужен вход; true — можно в приложение.
  const [вошёл, setВошёл] = useState(null);
  useEffect(() => {
    let жив = true;
    const проверить = async () => {
      const { data } = await supabase.auth.getSession();
      const есть = !!(data && data.session) && (await профильЕсть());
      if (жив) setВошёл(есть);
    };
    проверить();
    const { data: подписка } = supabase.auth.onAuthStateChange(() => { проверить(); });
    return () => { жив = false; подписка && подписка.subscription && подписка.subscription.unsubscribe(); };
  }, []);
  if (вошёл === null) return <div style={{ position: "fixed", inset: 0, background: "#000" }} />;
  if (!вошёл) {
    return (
      <div style={{ minHeight: "100vh", background: "#000", display: "flex", alignItems: "center", justifyContent: "center", padding: 24 }}>
        <div style={{ width: "100%", maxWidth: 440 }}>
          <DesktopAuth наВход={() => setВошёл(true)} />
        </div>
      </div>
    );
  }
  return <TonLaunchApp />;
}
