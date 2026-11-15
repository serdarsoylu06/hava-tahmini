/** Kayıtlı noktalar (sık bakılan yerler: av noktası, yayla, kamp yeri…). hava/kayit.py'nin karşılığı.
 *
 * Her ziyaretçinin noktaları kendi tarayıcısında saklanır; başkası göremez. Streamlit sürümü bunun için çerez
 * kullanıyordu (sunucu okuyabilsin diye); burada sunucu olmadığı için tarayıcının yerel deposu kullanılır.
 * Sınırlar aynıdır: en çok 15 nokta, ad en çok 40 karakter. */

export interface KayitliNokta {
  ad: string;
  lat: number;
  lon: number;
}

export const ANAHTAR = "havalab_noktalar";
export const EN_FAZLA = 15;
export const AD_UZUNLUK = 40;

/** Deponun kullanılan kısmı; testlerde sahte bir nesne verilir. */
export type Depolama = Pick<Storage, "getItem" | "setItem">;

function gecerli(n: unknown): n is KayitliNokta {
  if (typeof n !== "object" || n === null) return false;
  const { ad, lat, lon } = n as Record<string, unknown>;
  return typeof ad === "string" && ad.trim() !== "" && typeof lat === "number" && typeof lon === "number" &&
    Math.abs(lat) <= 90 && Math.abs(lon) <= 180;
}

/** Kayıtlı noktalar; depo okunamazsa ya da içerik bozuksa boş liste. */
export function oku(depo: Depolama | null): KayitliNokta[] {
  try {
    const ham: unknown = JSON.parse(depo?.getItem(ANAHTAR) ?? "[]");
    return Array.isArray(ham) ? ham.filter(gecerli).slice(0, EN_FAZLA) : [];
  } catch {
    return [];
  }
}

function yaz(depo: Depolama | null, liste: KayitliNokta[]): KayitliNokta[] {
  try {
    depo?.setItem(ANAHTAR, JSON.stringify(liste));
  } catch { /* depo dolu ya da kapalı (gizli sekme): liste yalnızca bu oturumda kalır */ }
  return liste;
}

/** Nokta ekler; aynı adla kayıt varsa onun yerini alır. Yeni kayıt başa gelir, liste 15'i geçerse en eski düşer. */
export function ekle(depo: Depolama | null, liste: readonly KayitliNokta[], ad: string, lat: number, lon: number): KayitliNokta[] {
  const temiz = ad.trim().slice(0, AD_UZUNLUK);
  if (!temiz) return [...liste];
  return yaz(depo, [{ ad: temiz, lat, lon }, ...liste.filter((n) => n.ad !== temiz)].slice(0, EN_FAZLA));
}

export function sil(depo: Depolama | null, liste: readonly KayitliNokta[], ad: string): KayitliNokta[] {
  return yaz(depo, liste.filter((n) => n.ad !== ad));
}

/** Verilen koordinata (≈1 km içinde) denk gelen kayıt. */
export function bul(liste: readonly KayitliNokta[], lat: number, lon: number): KayitliNokta | undefined {
  return liste.find((n) => Math.abs(n.lat - lat) < 0.01 && Math.abs(n.lon - lon) < 0.01);
}

/** Tarayıcının yerel deposu; erişilemiyorsa (ör. çerezler kapalı) null. */
export function yerelDepo(): Depolama | null {
  try {
    return typeof localStorage === "undefined" ? null : localStorage;
  } catch {
    return null;
  }
}
