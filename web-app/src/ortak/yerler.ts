/** Yer listesi, arama önerileri ve haritadan seçilen noktayı adlandırma (hava/yerler.py).
 * Liste GeoNames'ten üretilmiştir (CC BY 4.0) ve Streamlit sürümüyle aynı dosyadır: hava/yerlesimler.json. */
import type { AramaSonucu, Konum } from "../veri/tipler";
import { kerteriz, mesafeKm, YON8 } from "./cografya";
import { pyBicim } from "./sayi";

export interface Yerlesim {
  etiket: string;
  ad: string;
  enlem: number;
  boylam: number;
  rakim: number | null;
  saat_dilimi: string;
  nufus: number;
  turkiye: boolean;
}

/** hava/yerlesimler.json'un biçimi: alan adları bir kez, kayıtlar dizi olarak. */
export interface YerlesimDosyasi {
  kaynak: string;
  alanlar: string[];
  yerler: unknown[][];
}

/** Etiket → kayıt. Aynı etiket iki kez geçerse sonraki kazanır, sıra ilk geçtiği yerde kalır (Python dict gibi). */
export type Yerlesimler = Map<string, Yerlesim>;

export function yerlesimleriKur(dosya: YerlesimDosyasi): Yerlesimler {
  const sozluk: Yerlesimler = new Map();
  for (const satir of dosya.yerler) {
    const y = Object.fromEntries(dosya.alanlar.map((alan, i) => [alan, satir[i]])) as unknown as Yerlesim;
    sozluk.set(y.etiket, y);
  }
  return sozluk;
}

/** Öneri listesindeki bir kaydı uygulamanın konum kaydına çevirir. hava/yerler.py → konum_kaydi */
export function konumKaydi(y: Yerlesim): Konum {
  const ayrac = y.etiket.indexOf(", ");
  let bolge = ayrac === -1 ? "" : y.etiket.slice(ayrac + 2);
  if (y.turkiye) bolge = bolge ? `${bolge}, Türkiye` : "Türkiye";
  return { ad: y.ad, lat: y.enlem, lon: y.boylam, tz: y.saat_dilimi, rakim: y.rakim, bolge };
}

/** Haritadan ya da kayıttan gelen bir nokta için konum kaydı; ağa çıkmaz. Ad en yakın yerleşime göre verilir
 * ("Tirebolu yakını (6 km KD)"), saat dilimi de o yerleşimden alınır. hava/yerler.py → nokta_konumu */
export function noktaKonumu(yerlesimler: Yerlesimler, lat: number, lon: number, ad?: string,
                            bolge = "Haritadan seçilen nokta"): Konum {
  let yakin: Yerlesim | undefined;
  let km = Infinity;
  for (const y of yerlesimler.values()) {
    const d = mesafeKm(lat, lon, y.enlem, y.boylam);
    if (d < km) { km = d; yakin = y; }               // eşitlikte ilk kayıt kalır (numpy argmin gibi)
  }
  if (!yakin) return { ad: ad ?? `${pyBicim(lat, 2)}° K, ${pyBicim(lon, 2)}° D`, lat, lon, tz: "auto", rakim: null, bolge };
  let secilen = ad;
  if (secilen === undefined) {
    if (km < 3) secilen = yakin.ad;
    else if (km < 150) {
      const yon = YON8[Math.trunc(kerteriz(yakin.enlem, yakin.boylam, lat, lon) / 45 + 0.5) % 8];
      secilen = `${yakin.ad} yakını (${pyBicim(km, 0)} km ${yon})`;
    } else secilen = `${pyBicim(lat, 2)}° K, ${pyBicim(lon, 2)}° D`;
  }
  return { ad: secilen, lat, lon, tz: km < 1500 ? yakin.saat_dilimi : "auto", rakim: null, bolge };
}

/** Yer adı servisinden gelen sonucu konum kaydına çevirir (hava_lab.py'deki arama dalı). */
export function aramaKonumu(s: AramaSonucu): Konum {
  return { ad: s.name, lat: s.latitude, lon: s.longitude, tz: s.timezone || "auto", rakim: s.elevation ?? null,
           bolge: [s.admin1, s.country].filter(Boolean).join(", ") };
}

/** Arama sonucunun listede görünen adı: "Giresun, Giresun, Türkiye". */
export function aramaEtiketi(s: AramaSonucu): string {
  return [s.name, s.admin1, s.country].filter(Boolean).join(", ");
}

const sade = (s: string) => s.toLocaleLowerCase("tr").normalize("NFD").replace(/[̀-ͯ]/g, "").replace(/ı/g, "i");

/** Yazdıkça süzülen öneriler; ağa çıkmaz. Adın başıyla eşleşenler öne alınır, liste sırası (nüfus) korunur. */
export function oner(yerlesimler: Yerlesimler, sorgu: string, enFazla = 8): Yerlesim[] {
  const q = sade(sorgu.trim());
  if (!q) return [];
  const bastan: Yerlesim[] = [], icinde: Yerlesim[] = [];
  for (const y of yerlesimler.values()) {
    const e = sade(y.etiket);
    if (e.startsWith(q)) bastan.push(y);
    else if (e.includes(q)) icinde.push(y);
    if (bastan.length >= enFazla) break;
  }
  return [...bastan, ...icinde].slice(0, enFazla);
}
