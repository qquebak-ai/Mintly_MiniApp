/* Тариф человека — для наценки за скорость в обработчиках кошелька.
 * Читается из user_tariffs и помнится минуту: сделки идут часто, а тариф
 * меняется раз в месяц. Оплаченный срок прошёл — снова free. */
const память = new Map(); // user_id -> { план, до, t }
const ПОМНИМ_МС = 60_000;

export async function тарифЧеловека(db, userId) {
  if (!db || !userId) return "free";
  const з = память.get(userId);
  if (з && Date.now() - з.t < ПОМНИМ_МС) return з.до > Date.now() ? з.план : "free";
  let план = "free", до = 0;
  try {
    const { data } = await db.from("user_tariffs").select("plan, until").eq("user_id", userId).maybeSingle();
    if (data && data.until) { план = data.plan || "free"; до = new Date(data.until).getTime(); }
  } catch { /* нет таблицы — все на free */ }
  if (память.size > 20000) память.clear();
  память.set(userId, { план, до, t: Date.now() });
  return до > Date.now() ? план : "free";
}

export function забытьТариф(userId) { память.delete(userId); }
