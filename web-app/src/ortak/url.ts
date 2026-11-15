/** Adres satırındaki konum: `?yer=Giresun`.
 *
 * Streamlit sürümündeki davranış korunur: değer yer listesindeki etiketin kendisidir ("Tirebolu, Giresun");
 * parametre yoksa Ankara açılır; listede olmayan bir ad yer adı servisinde aranır. Böylece eski bağlantılar
 * yeni uygulamada da aynı yeri açar. */
import type { AramaSonucu, Konum } from "../veri/tipler";
import { aramaKonumu, konumKaydi, type Yerlesimler } from "./yerler";

export const VARSAYILAN_YER = "Ankara";

export class YerBulunamadi extends Error {
  constructor(readonly yer: string) {
    super(`"${yer}" adında bir yer bulunamadı. Farklı yazmayı dene.`);
    this.name = "YerBulunamadi";
  }
}

/** Adresteki `yer` değeri; yoksa ya da boşsa null. */
export function yerOku(sorgu: string): string | null {
  return new URLSearchParams(sorgu).get("yer")?.trim() || null;
}

/** `yer` değeri güncellenmiş sorgu metni; diğer parametreler korunur, varsa `nokta` kaldırılır. */
export function yerYaz(sorgu: string, etiket: string): string {
  const p = new URLSearchParams(sorgu);
  p.delete("nokta");
  p.set("yer", etiket);
  return `?${p.toString()}`;
}

/** Adresteki koordinat: `?nokta=41.02,38.81` (cihaz konumu, haritadan seçilen ya da kayıtlı nokta).
 * Streamlit sürümünde bu noktalar adrese yazılmıyordu ve sayfa yenilenince kayboluyordu; burada korunur. */
export function noktaOku(sorgu: string): { lat: number; lon: number } | null {
  const m = /^(-?\d+(?:\.\d+)?),(-?\d+(?:\.\d+)?)$/.exec(new URLSearchParams(sorgu).get("nokta")?.trim() ?? "");
  if (!m) return null;
  const lat = Number(m[1]), lon = Number(m[2]);
  return Math.abs(lat) <= 90 && Math.abs(lon) <= 180 ? { lat, lon } : null;
}

/** `nokta` değeri güncellenmiş sorgu metni (4 ondalık ≈ 10 m); `yer` kaldırılır. */
export function noktaYaz(sorgu: string, lat: number, lon: number): string {
  const p = new URLSearchParams(sorgu);
  p.delete("yer");
  p.set("nokta", `${lat.toFixed(4)},${lon.toFixed(4)}`);
  return `?${p.toString().replace("%2C", ",")}`;
}

export interface CozulenKonum {
  /** Adrese yazılacak değer. */
  etiket: string;
  konum: Konum;
  /** liste: yer listesinden (ağa çıkılmadı) · arama: yer adı servisinden */
  kaynak: "liste" | "arama";
  /** Aramada birden çok sonuç varsa hepsi; arayüz kullanıcıya seçtirir. İlk sonuç seçili gelir. */
  secenekler: AramaSonucu[];
}

/** `?yer=` değerini konuma çevirir. Yalnızca listede olmayan adlar için yer adı servisine tek bir istek gider. */
export async function konumCoz(yer: string | null, yerlesimler: Yerlesimler,
                               ara: (ad: string) => Promise<AramaSonucu[]>): Promise<CozulenKonum> {
  const etiket = yer ?? VARSAYILAN_YER;
  const kayit = yerlesimler.get(etiket);
  if (kayit) return { etiket, konum: konumKaydi(kayit), kaynak: "liste", secenekler: [] };
  const sonuc = await ara(etiket);
  if (!sonuc[0]) throw new YerBulunamadi(etiket);
  return { etiket, konum: aramaKonumu(sonuc[0]), kaynak: "arama", secenekler: sonuc };
}

/** Seçili yerin nereden geldiği: listeden/aramadan bir ad ya da bir koordinat. */
export type Secim = { tur: "yer"; etiket: string } | { tur: "nokta"; lat: number; lon: number; bolge?: string };

/** Saklanmış son seçimi (JSON metni) çözer; bozuk ya da eksikse null. Adreste yer yokken (ör. ana ekran kısayolu
 * `/` adresini açar) uygulama bu tarayıcıda son bakılan yerle açılsın diye saklanır. */
export function sonSecimCoz(metin: string | null | undefined): Secim | null {
  if (!metin) return null;
  try {
    const v: unknown = JSON.parse(metin);
    if (typeof v !== "object" || v === null) return null;
    const o = v as Record<string, unknown>;
    if (o.tur === "yer" && typeof o.etiket === "string" && o.etiket.trim()) return { tur: "yer", etiket: o.etiket.trim() };
    if (o.tur === "nokta" && typeof o.lat === "number" && typeof o.lon === "number" && Math.abs(o.lat) <= 90 && Math.abs(o.lon) <= 180)
      return { tur: "nokta", lat: o.lat, lon: o.lon, ...(typeof o.bolge === "string" ? { bolge: o.bolge } : {}) };
    return null;
  } catch {
    return null;
  }
}
