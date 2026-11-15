/** Uzman modun harita verisi: modeller, ızgara dosyalarının adresleri ve koşu bilgisi.
 *
 * Harita katmanları, modellerin kendi ızgara çıktılarından çizilir (Open-Meteo'nun herkese açık "data_spatial"
 * dosyaları). Noktasal tahminlerden alan üretilmez. Her dosya tek bir koşunun tek bir geçerlilik zamanıdır; koşu
 * zamanı ile geçerlilik zamanı burada ayrı ayrı taşınır. Zamanların hepsi UTC'dir; ekranda konumun yerel saatine
 * çevrilir. */
import { nesneMi } from "../veri/dogrula";
import { type Istemci, VeriHatasi } from "../veri/istemci";

export const KOK = "https://openmeteo.s3.amazonaws.com/data_spatial";

export type ModelKodu = "ecmwf" | "icon" | "gfs";

export interface HaritaModeli {
  ad: string;
  kurum: string;
  /** Izgara dosyalarının alan adları, tercih sırasıyla. Bir değişken ilk bulunduğu alandan okunur (GFS yüzey
   * değişkenlerini 0,13°'lik, basınç ve üst seviyeleri 0,25°'lik alanda yayımlar). */
  alanlar: readonly string[];
  /** Nokta tahmini isteklerinde (meteogram) `models=` değeri; Streamlit sürümündeki meteogramla aynı. */
  api: string;
  /** Izgara aralığı (bilgi için). */
  cozunurluk: string;
  /** Renkli alan için birleşik ("seamless") alan: temel alanın adı → birleşik alanın adı. Harita paketi birleşik
   * alanda, her noktada o yakınlıkta verisi olan en ince ızgaralı modeli çizer, olmayan yerde temel modele düşer;
   * koşu ve zaman adımı temel alanınkidir. */
  birlesik?: Readonly<Record<string, string>>;
  /** İsteğe bağlı ince ızgara: yüzey değişkenleri bu alandan okunur. Dosyaları çok daha büyük olduğu için
   * varsayılan olarak kapalıdır; kullanıcı açar. */
  ince?: { alan: string; cozunurluk: string };
}

export const MODELLER: Readonly<Record<ModelKodu, HaritaModeli>> = {
  // ECMWF'in 9 km'lik alanı yalnızca yüzey değişkenlerini içerir ve dosyaları değişken başına yaklaşık on kat
  // büyüktür: genel görünümde bir zaman adımı 0,25°'lik alanda ~4 sn, bu alanda 16–40 sn sürdü (15.11.2026 ölçümleri)
  ecmwf: { ad: "ECMWF IFS", kurum: "Avrupa", alanlar: ["ecmwf_ifs025"], api: "ecmwf_ifs", cozunurluk: "0,25° (≈25 km)",
           ince: { alan: "ecmwf_ifs", cozunurluk: "≈9 km" } },
  // ICON'un renkli alanı Avrupa ve Türkiye üzerinde ICON-EU'dan (≈7 km, 120 saate kadar), Orta Avrupa'da ICON-D2'den
  // (≈2 km, 48 saate kadar), başka her yerde küresel ICON'dan (≈13 km) çizilir
  icon: { ad: "ICON", kurum: "Almanya (DWD)", alanlar: ["dwd_icon"], api: "icon_seamless", cozunurluk: "≈13 km, Avrupa ve Türkiye'de ≈7 km",
          birlesik: { dwd_icon: "dwd_icon_seamless" } },
  gfs: { ad: "GFS", kurum: "ABD (NOAA)", alanlar: ["ncep_gfs013", "ncep_gfs025"], api: "gfs_seamless", cozunurluk: "0,13° / 0,25°" },
};

/** Deniz katmanlarının ızgara alanları. Dalga, seçili hava modelini yayımlayan merkezin kendi dalga modelinden
 * okunur; deniz suyu sıcaklığının tek kaynağı vardır (Mercator Océan), hangi model seçili olursa olsun aynıdır.
 * DWD'nin Avrupa dalga modeli (dwd_ewam, 0,05°) kullanılmıyor: yalnızca Avrupa denizlerini kapsar, harita başka
 * bir bölgeye kaydırılınca boş kalırdı. */
export const DENIZ_SICAKLIGI_ALANI = "meteofrance_sea_surface_temperature";
export const DENIZ_ALANLARI: Readonly<Record<ModelKodu, readonly string[]>> = {
  ecmwf: ["ecmwf_wam025", DENIZ_SICAKLIGI_ALANI],
  icon: ["dwd_gwam", DENIZ_SICAKLIGI_ALANI],
  gfs: ["ncep_gfswave016", "ncep_gfswave025", DENIZ_SICAKLIGI_ALANI],
};

/** Deniz alanlarının kaynağı ve ızgara aralığı (ekranda gösterilir). */
export const DENIZ_KAYNAGI: Readonly<Record<string, { ad: string; cozunurluk: string }>> = {
  ecmwf_wam025: { ad: "ECMWF WAM", cozunurluk: "0,25°" },
  dwd_gwam: { ad: "DWD GWAM", cozunurluk: "0,25°" },
  ncep_gfswave016: { ad: "NOAA GFS Wave", cozunurluk: "0,16°" },
  ncep_gfswave025: { ad: "NOAA GFS Wave", cozunurluk: "0,25°" },
  [DENIZ_SICAKLIGI_ALANI]: { ad: "Mercator Océan (Météo-France)", cozunurluk: "≈0,08°" },
};

/** Bir alanın son tamamlanmış koşusu. */
export interface AlanMeta {
  alan: string;
  /** Koşunun başlangıç (analiz) zamanı, UTC: "2026-11-14T12:00:00Z". */
  kosu: string;
  /** Bu koşunun geçerlilik zamanları, UTC, artan sırada: "2026-11-14T15:00Z". */
  gecerlilik: string[];
  degiskenler: string[];
}

const UTC = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}(:\d{2})?Z$/;

export function metaDogrula(alan: string, js: unknown): AlanMeta {
  const hata = (neden: string) => new VeriHatasi("bicim", "Yanıt beklenen biçimde değil", `harita bilgisi (${alan}): ${neden}`);
  if (!nesneMi(js)) throw hata("nesne değil");
  const { reference_time: kosu, valid_times: gecerlilik, variables: degiskenler } = js;
  if (typeof kosu !== "string" || !UTC.test(kosu)) throw hata("koşu zamanı yok");
  if (!Array.isArray(gecerlilik) || !gecerlilik.length || !gecerlilik.every((t): t is string => typeof t === "string" && UTC.test(t))) throw hata("geçerlilik zamanları yok");
  if (!Array.isArray(degiskenler) || !degiskenler.every((v): v is string => typeof v === "string")) throw hata("değişken listesi yok");
  return { alan, kosu, gecerlilik: [...gecerlilik].sort(), degiskenler };
}

/** Bir alanın son koşu bilgisi. Saatlik dönem önbelleğinden geçer: aynı saatte bir kez indirilir. */
export async function alanMeta(istemci: Istemci, alan: string): Promise<AlanMeta> {
  const { veri } = await istemci.getir(`${KOK}/${alan}/latest.json`, {});
  return metaDogrula(alan, veri);
}

/** Paketin dosyada saklanmayan ama bileşenlerinden türettiği değişkenler ve gereken kaynakları. */
const TURETILEN: Readonly<Record<string, readonly string[]>> = {
  wind_speed_10m: ["wind_u_component_10m", "wind_v_component_10m"],
};

export function degiskenVar(meta: AlanMeta, degisken: string): boolean {
  return meta.degiskenler.includes(degisken) || (TURETILEN[degisken]?.every((k) => meta.degiskenler.includes(k)) ?? false);
}

/** Değişkenin okunacağı alan: modelin alanlarından onu yayımlayan ilki; hiçbirinde yoksa null. */
export function alanSec(metalar: readonly AlanMeta[], degisken: string): AlanMeta | null {
  return metalar.find((m) => degiskenVar(m, degisken)) ?? null;
}

const p2 = (n: number) => String(n).padStart(2, "0");

export interface OmSecenek {
  koyu?: boolean;
  /** Eş değer çizgileri: kaç birimde bir. */
  kontur?: number;
  oklar?: boolean;
  /** Renkler eşikler arasında yumuşak geçsin (paketin `color_blend` seçeneği). Kapalıyken her eşik aralığı tek
   * renktir ve ızgara hücreleri köşeli bloklar gibi görünür. */
  yumusak?: boolean;
  /** Yoldaki alan adı `meta.alan` yerine bu olsun (birleşik alanlar: koşu bilgisi temel alandan, dosya birleşikten). */
  alanAdi?: string;
}

/** Bir koşunun bir geçerlilik zamanına ait ızgara dosyasının adresi (harita kaynağına verilen biçimde, başında
 * "om://" olmadan). Yol: <alan>/YYYY/AA/GG/SSDDZ/YYYY-AA-GGTSSDD.om */
export function omAdresi(meta: AlanMeta, gecerli: string, degisken: string, secenek: OmSecenek = {}): string {
  const k = new Date(meta.kosu), g = new Date(gecerli);
  const yol = `${k.getUTCFullYear()}/${p2(k.getUTCMonth() + 1)}/${p2(k.getUTCDate())}/${p2(k.getUTCHours())}${p2(k.getUTCMinutes())}Z`;
  const dosya = `${g.getUTCFullYear()}-${p2(g.getUTCMonth() + 1)}-${p2(g.getUTCDate())}T${p2(g.getUTCHours())}${p2(g.getUTCMinutes())}.om`;
  const p = new URLSearchParams({ variable: degisken });
  if (secenek.koyu) p.set("dark", "true");
  if (secenek.kontur) { p.set("contours", "true"); p.set("intervals", String(secenek.kontur)); }
  if (secenek.oklar) p.set("arrows", "true");
  if (secenek.yumusak) p.set("color_blend", "true");
  // birikimli değişkenler (yağış) saatlik orana çevrilsin diye adımın uzunluğu verilir
  const adim = adimSaati(meta, gecerli);
  if (adim !== null && degisken === "precipitation") p.set("delta_time_hours", String(adim));
  return `${KOK}/${secenek.alanAdi ?? meta.alan}/${yol}/${dosya}?${p.toString()}`;
}

/** `gecerli` zamanında biten tahmin adımının uzunluğu (saat): bir önceki geçerlilik zamanına uzaklık; ilk adımda
 * bir sonrakine. Listede yoksa ya da tek zaman varsa null. */
export function adimSaati(meta: AlanMeta, gecerli: string): number | null {
  const i = meta.gecerlilik.indexOf(gecerli);
  if (i === -1 || meta.gecerlilik.length < 2) return null;
  const [a, b] = i === 0 ? [meta.gecerlilik[0]!, meta.gecerlilik[1]!] : [meta.gecerlilik[i - 1]!, meta.gecerlilik[i]!];
  return (Date.parse(b) - Date.parse(a)) / 3_600_000;
}

/** Tahmin ufku: geçerlilik zamanının koşu başlangıcına uzaklığı (saat). */
export function ufukSaati(meta: AlanMeta, gecerli: string): number {
  return Math.round((Date.parse(gecerli) - Date.parse(meta.kosu)) / 3_600_000);
}

/** Verilen ana en yakın geçerlilik zamanının sırası. */
export function enYakinZaman(meta: AlanMeta, an: Date): number {
  let en = 0, fark = Infinity;
  meta.gecerlilik.forEach((t, i) => { const f = Math.abs(Date.parse(t) - an.getTime()); if (f < fark) { fark = f; en = i; } });
  return en;
}

/** `gecerli`ye (UTC) denk gelen zaman `meta`da var mı; yoksa en yakını (en çok `tolerans` saat uzakta), o da yoksa null.
 * Renkli alan ile çizgiler farklı alanlardan geldiğinde (GFS) aynı ana ait dosyaları eşlemek için. */
export function ayniZaman(meta: AlanMeta, gecerli: string, toleransSaat = 1.5): string | null {
  const hedef = Date.parse(gecerli);
  let en: string | null = null, fark = Infinity;
  for (const t of meta.gecerlilik) { const f = Math.abs(Date.parse(t) - hedef); if (f < fark) { fark = f; en = t; } }
  return fark <= toleransSaat * 3_600_000 ? en : null;
}

/** "14.11 12Z" — koşu zamanının kısa yazımı (meteorolojide koşular UTC saatiyle anılır). */
export function kosuYaz(kosu: string): string {
  return `${kosu.slice(8, 10)}.${kosu.slice(5, 7)} ${kosu.slice(11, 13)}Z`;
}
