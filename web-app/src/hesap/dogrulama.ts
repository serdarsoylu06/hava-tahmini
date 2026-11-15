/** Tahmin doğrulaması: gerçekleşen değerler ile 1–7 gün önce yapılmış tahminlerin karşılaştırması.
 * Streamlit'teki `app_pages/dogrulama.py` sayfasının hesap kısmı. */
import { ortalama, say, topla } from "../ortak/dizi";
import type { Deger, Tablo } from "../veri/tipler";

/** Değişken adı → API adı, birim ve "isabetli" sayılacak en büyük hata (yağışta değere göre hesaplanır). */
export const DEGISKENLER: Readonly<Record<string, { degisken: string; birim: string; tolerans: number | null }>> = {
  "Sıcaklık": { degisken: "temperature_2m", birim: "°C", tolerans: 2 },
  "Rüzgâr": { degisken: "wind_speed_10m", birim: "km/s", tolerans: 8 },
  "Yağış": { degisken: "precipitation", birim: "mm", tolerans: null },
  "Basınç": { degisken: "pressure_msl", birim: "hPa", tolerans: 2 },
};
export const GUN_ONCE = [1, 2, 3, 4, 5, 6, 7] as const;
export const onceki = (degisken: string, gun: number) => `${degisken}_previous_day${gun}`;

/** Koşulu sağlayan satırlar. */
export function satirSec(t: Tablo, kosul: (i: number) => boolean): Tablo {
  const sira = t.zaman.map((_, i) => i).filter(kosul);
  return { zaman: sira.map((i) => t.zaman[i]!), sutun: Object.fromEntries(Object.entries(t.sutun).map(([k, v]) => [k, sira.map((i) => v[i] ?? null)])) };
}

/** Saatlik tabloyu günlük toplamlara çevirir (pandas `resample("D").sum(min_count=1)`), ilk günü atar: ilk gün
 * çoğunlukla yarımdır. Bir günün bütün değerleri eksikse toplam da eksiktir (0 değil). */
export function gunlukToplam(t: Tablo): Tablo {
  const gunler = [...new Set(t.zaman.map((z) => z.slice(0, 10)))].sort().slice(1);
  const sira = new Map<string, number[]>();
  t.zaman.forEach((z, i) => { const g = z.slice(0, 10); (sira.get(g) ?? sira.set(g, []).get(g)!).push(i); });
  return { zaman: gunler.map((g) => `${g}T00:00`),
           sutun: Object.fromEntries(Object.entries(t.sutun).map(([k, v]) => [k, gunler.map((g) => { const d = sira.get(g)!.map((i) => v[i] ?? null); return say(d) ? topla(d) : null; })])) };
}

export interface HataSatiri {
  /** Tahmin kaç gün önce yapılmış. */
  gun: number;
  /** Ortalama mutlak hata. */
  mae: number;
  /** Hataların işaretli ortalaması (+: fazla tahmin). */
  sapma: number;
  /** Hatası eşiğin içinde kalan saatlerin yüzdesi. */
  isabet: number;
}

/** Her "gün önce" için hata özeti. Gerçekleşeni ya da tahmini eksik olan satırlar atlanır; hiç çifti olmayan
 * gün özete girmez. */
export function hataOzeti(t: Tablo, degisken: string, tolerans: number | null): HataSatiri[] {
  const gercek = t.sutun[degisken] ?? [];
  const esik = tolerans ?? 2 + 0.25 * ortalama(gercek.map((x) => (x == null ? null : Math.abs(x))));
  const satirlar: HataSatiri[] = [];
  for (const gun of GUN_ONCE) {
    const tahmin = t.sutun[onceki(degisken, gun)] ?? [];
    const hata = gercek.flatMap((g, i) => (g == null || tahmin[i] == null ? [] : [tahmin[i]! - g]));
    if (!hata.length) continue;
    satirlar.push({ gun, mae: ortalama(hata.map(Math.abs)), sapma: ortalama(hata), isabet: (hata.filter((h) => Math.abs(h) <= esik).length / hata.length) * 100 });
  }
  return satirlar;
}

/** Bir gün önceki tahminin en çok yanıldığı an; hiç hata yoksa null. */
export function enBuyukIska(t: Tablo, degisken: string): { zaman: string; tahmin: number; gercek: number } | null {
  const gercek = t.sutun[degisken] ?? [], tahmin = t.sutun[onceki(degisken, 1)] ?? [];
  let en = -1, buyuk = 0;
  gercek.forEach((g, i) => { const h: Deger = g == null || tahmin[i] == null ? null : Math.abs(tahmin[i]! - g); if (h != null && h > buyuk) { buyuk = h; en = i; } });
  return en === -1 ? null : { zaman: t.zaman[en]!, tahmin: tahmin[en]!, gercek: gercek[en]! };
}

/** Model analizinin ölçümden farkı (temsil hatası): ortalama büyüklük ve işaretli ortalama. */
export function temsilHatasi(analiz: readonly Deger[], olcum: readonly Deger[]): { mae: number; sapma: number } | null {
  const fark = analiz.flatMap((a, i) => (a == null || olcum[i] == null ? [] : [a - olcum[i]!]));
  return fark.length ? { mae: ortalama(fark.map(Math.abs)), sapma: ortalama(fark) } : null;
}
