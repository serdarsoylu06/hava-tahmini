/** Veri dönemi: yanıtların saat dilimlerine bağlanması (hava/veri.py → donem, tazelik).
 *
 * 13:10–14:09 arasında yapılan her istek aynı yanıtı kullanır; ana kaynağa yeni istek ancak 14:10'da gider.
 * 10 dakikalık pay, sağlayıcının saat başı güncellemesinin yayılmasına zaman tanır. Dönem, kullanıcının
 * cihazının saat diliminden bağımsız olsun diye Türkiye saatiyle hesaplanır (Streamlit sürümüyle aynı). */
import { yerelSaat } from "../ortak/zaman";

export const TZ = "Europe/Istanbul";
export const GECIKME_MS = 10 * 60 * 1000;

/** Şu anki veri dönemi, ör. 13:10–14:09 arası için "2026-11-04T13". */
export function donem(an: Date = new Date()): string {
  return yerelSaat(new Date(an.getTime() - GECIKME_MS), TZ).slice(0, 13);
}

/** Gün içinde değişmeyen istekler (ör. geçmiş arşivi) için günlük dönem: "2026-11-04". */
export function gunDonemi(an: Date = new Date()): string {
  return donem(an).slice(0, 10);
}

/** Verinin alındığı ve bir sonraki yenilemenin yapılacağı saat (Türkiye saati, "SS:DD"). */
export function tazelik(an: Date = new Date()): { alindi: string; sonraki: string } {
  const saat = Number(donem(an).slice(11, 13));
  const iki = (n: number) => String(n).padStart(2, "0");
  return { alindi: `${iki(saat)}:10`, sonraki: `${iki((saat + 1) % 24)}:10` };
}

/** Eski döneme düşüldüğünde kullanıcıya gösterilen etiket: "2026-11-04T13" → "2026-11-04 13:10". */
export function donemEtiketi(d: string): string {
  return d.includes("T") ? `${d.replace("T", " ")}:10` : d;
}
