/** Balıkçılık ve deniz: en yakın deniz noktası, denize çıkış güvenliği, ay evresi ve balıkçı göstergesi
 * (hava/deniz.py'nin karşılığı). Güvenlik eşikleri küçük tekneler (~7 m altı) için Douglas deniz ve Beaufort
 * rüzgâr ölçeklerine göre seçildi; Python sürümüyle aynıdır ve referans/deniz.json ile sınanır. */
import { kerteriz, mesafeKm } from "../ortak/cografya";
import { enBuyuk, enKucuk, ilkEnBuyuk, maske } from "../ortak/dizi";
import { pyBicim } from "../ortak/sayi";
import { saatEkle, saatFarki, sayac, zamanYaz } from "../ortak/zaman";
import { apiHatasiMi, nesneMi, tabloDogrula } from "../veri/dogrula";
import type { Istemci } from "../veri/istemci";
import { DENIZ, simdiden, simdikiSaat } from "../veri/openMeteo";
import type { Deger, GunlukTablo, Tablo, YanitBilgisi } from "../veri/tipler";
import { aralik, type Uyari } from "./yorum";

export const DENIZ_SAATLIK = "wave_height,wave_direction,wave_period,wind_wave_height,wind_wave_period,swell_wave_height," +
  "swell_wave_period,swell_wave_direction,sea_surface_temperature,ocean_current_velocity," +
  "sea_level_height_msl";
export const SEVIYE_AD = ["Uygun", "Dikkat", "Riskli", "Tehlikeli"] as const;
export const SEVIYE_RENK = ["#8CBF5A", "#F1D24E", "#F0A060", "#E05545"] as const;
const AY_EVRE: readonly (readonly [number, string, string])[] = [
  [1.0, "🌑", "Yeni ay"], [6.4, "🌒", "Büyüyen hilal"], [8.4, "🌓", "İlk dördün"],
  [13.8, "🌔", "Büyüyen ay"], [15.8, "🌕", "Dolunay"], [21.1, "🌖", "Küçülen ay"], [23.1, "🌗", "Son dördün"],
  [28.5, "🌘", "Küçülen hilal"], [29.6, "🌑", "Yeni ay"]];
export const SINODIK = 29.530588853;

const RAD = Math.PI / 180;
/** Python/numpy'nin `%` işleci gibi: sonuç [0, m) aralığındadır. */
const mod = (x: number, m: number) => ((x % m) + m) % m;
const NAN = Number.NaN;
/** null → NaN: NaN'la yapılan karşılaştırmalar yanlış çıkar, pandas'taki gibi. */
const say_ = (x: Deger | undefined) => x ?? NAN;

/** Başka bir tablonun sütununu bu zaman eksenine hizalar (pandas `reindex`): karşılığı olmayan saat NaN. */
function hizala(kaynak: Tablo, ad: string, zaman: readonly string[], kaydir = 0): number[] {
  const yer = new Map(kaynak.zaman.map((z, i) => [z, i]));
  const v = kaynak.sutun[ad];
  return zaman.map((z) => {
    const i = yer.get(z);
    return i === undefined || !v ? NAN : say_(v[i - kaydir]);
  });
}

/** Ay yaşı (gün), evre simgesi/adı ve aydınlanma yüzdesi. Bilinen bir yeni aydan (6 Ocak 2000 18:14 UT)
 * sinodik ay uzunluğuyla ileri sayar; birkaç saatlik hata balıkçılık için önemsizdir. hava/deniz.py → ay */
export function ay(t: string): { yas: number; simge: string; ad: string; aydinlanma: number } {
  const yas = mod((sayac(t) - Date.UTC(2000, 0, 6, 18, 14)) / 86_400_000, SINODIK);
  const [, simge, ad] = AY_EVRE.find(([sinir]) => yas < sinir)!;
  return { yas, simge, ad, aydinlanma: 50 * (1 - Math.cos((2 * Math.PI * yas) / SINODIK)) };
}

export interface Guvenlik {
  zaman: string[];
  dalga: number[];
  ruzgar: number[];
  gorus: number[];
  firtina: number[];
  kara_ruzgari: boolean[];
  /** 0 uygun … 3 tehlikeli: dört bileşenin en kötüsü. */
  genel: number[];
}

/** Saatlik güvenlik seviyeleri (0 uygun … 3 tehlikeli) ve nedenleri. `d`: deniz tablosu, `hava`: saatlik tahmin,
 * `denizYonu`: kıyıdan açık denize bakış yönü (derece). hava/deniz.py → guvenlik */
export function guvenlik(d: Tablo, hava: Tablo, denizYonu: number | null = null): Guvenlik {
  const z = d.zaman;
  const h = (d.sutun.wave_height ?? []).map(say_);
  const g = hizala(hava, "wind_gusts_10m", z), gor = hizala(hava, "visibility", z);
  const kod = hizala(hava, "weather_code", z), gelis = hizala(hava, "wind_direction_10m", z);
  const dalga = z.map((_, i) => (h[i]! >= 2 ? 3 : h[i]! >= 1 ? 2 : h[i]! >= 0.5 ? 1 : 0));
  let ruzgar: number[] = g.map((x) => (x >= 50 ? 3 : x >= 38 ? 2 : x >= 25 ? 1 : 0));
  const gorus = gor.map((x) => (x < 1000 ? 2 : x < 4000 ? 1 : 0));
  const firtina = kod.map((x) => (x >= 95 ? 3 : 0));
  let kara_ruzgari = z.map(() => false);
  if (denizYonu !== null) {
    // rüzgâr karadan denize esiyorsa (geldiği yön ≈ kıyıdan denize bakışın tersi) tekne açığa sürüklenir
    kara_ruzgari = gelis.map((x, i) => Math.abs(mod(x - (denizYonu + 180) + 180, 360) - 180) < 60 && g[i]! >= 20);
    ruzgar = ruzgar.map((x, i) => (kara_ruzgari[i] ? Math.max(x, 1) : x));
  }
  return { zaman: [...z], dalga, ruzgar, gorus, firtina, kara_ruzgari,
           genel: z.map((_, i) => Math.max(dalga[i]!, ruzgar[i]!, gorus[i]!, firtina[i]!)) };
}

/** True olan ardışık saat bloklarını [başlangıç, bitiş] olarak döndürür; bitiş son saatin sonudur (+1 saat).
 * hava/deniz.py → pencereler */
export function pencereler(zaman: readonly string[], m: readonly boolean[], enAzSaat = 2): [string, string][] {
  const sonuc: [string, string][] = [];
  for (let i = 0; i < m.length; i++) {
    if (!m[i]) continue;
    let j = i;
    while (j + 1 < m.length && m[j + 1]) j++;
    if (j - i + 1 >= enAzSaat) sonuc.push([zaman[i]!, saatEkle(zaman[j]!, 1)]);
    i = j;
  }
  return sonuc;
}

export interface BalikGostergesi {
  zaman: string[];
  alacakaranlik: Deger[];
  ay_konumu: number[];
  ay_evresi: number[];
  basinc: number[];
  ruzgar: number[];
  /** 0–100 */
  toplam: number[];
  /** 3 saatlik basınç değişimi (hPa) */
  dp: Deger[];
}

/** Balıkçıların yaygın gözlemlerine dayanan 0–100 arası gösterge ve bileşenleri.
 * Bilimsel olarak kanıtlanmış bir model DEĞİLDİR; sayfada da böyle sunulur. hava/deniz.py → balik_gostergesi */
export function balikGostergesi(d: Tablo, hava: Tablo, gunluk: GunlukTablo): BalikGostergesi {
  const t = d.zaman;
  const gunYeri = new Map(gunluk.gun.map((g, i) => [g, i]));
  const gunun = (dizi: (string | null)[], z: string) => { const i = gunYeri.get(z.slice(0, 10)); return i === undefined ? null : dizi[i] ?? null; };
  const yaslar = t.map((z) => ay(z).yas);

  const alacakaranlik: Deger[] = [], ay_konumu: number[] = [];
  t.forEach((z, i) => {
    const dogus = gunun(gunluk.gunDogumu, z), batis = gunun(gunluk.gunBatimi, z);
    if (dogus === null || batis === null) { alacakaranlik.push(null); ay_konumu.push(0); return; }
    const yakin = Math.min(Math.abs(saatFarki(z, dogus)), Math.abs(saatFarki(z, batis)));
    alacakaranlik.push(Math.min(30, Math.max(0, 30 * (1 - yakin / 1.5))));
    // Ay, güneşten her gün ~50 dk geç meridyenden geçer: geçiş ≈ güneş öğlesi + ay yaşı × 24/29.53 saat.
    // Ana dönemler geçiş ve 12 saat sonrası (ay "tepede" ve "ayak altında"), ara dönemler ay doğuşu/batışı (≈ ±6 sa).
    const ogleFarki = (sayac(z) - (sayac(dogus) + (sayac(batis) - sayac(dogus)) / 2)) / 3_600_000;
    const fark = ogleFarki - (yaslar[i]! * 24) / SINODIK;            // şimdiki saatin ay geçişine uzaklığı
    const uzak = (kayma: number) => Math.abs(mod(fark - kayma + 6, 12) - 6);
    ay_konumu.push(uzak(0) <= 1 ? 20 : Math.min(uzak(6.2), uzak(-6.2)) <= 0.5 ? 10 : 0);
  });
  const ay_evresi = yaslar.map((yas) => (yas < 3 || yas > SINODIK - 3 || Math.abs(yas - SINODIK / 2) < 3 ? 10 : 0));

  const p = hizala(hava, "pressure_msl", t), onceki = hizala(hava, "pressure_msl", t, 3);
  const dpHam = p.map((x, i) => x - onceki[i]!);
  const basinc = dpHam.map((x) => (x < -2 ? 0 : x < -0.7 ? 20 : Math.abs(x) <= 0.7 ? 15 : x > 0.7 ? 5 : 0));
  const ruzgar = hizala(hava, "wind_speed_10m", t).map((w) => (w < 5 ? 8 : w < 20 ? 15 : w < 30 ? 5 : 0));
  const toplam = t.map((_, i) =>
    Math.min(100, Math.max(0, (alacakaranlik[i] ?? 0) + ay_konumu[i]! + ay_evresi[i]! + basinc[i]! + ruzgar[i]!)));
  return { zaman: [...t], alacakaranlik, ay_konumu, ay_evresi, basinc, ruzgar, toplam,
           dp: dpHam.map((x) => (Number.isNaN(x) ? null : x)) };
}

export interface DenizNoktasi {
  lat: number;
  lon: number;
  km: number;
  /** Açık denizin yönü (derece); konum her yanı denizle çevriliyse (açık deniz) null. */
  yon: number | null;
}

/** Konumun kendisi denizde değilse çevresinde (≈110 km'ye kadar) deniz verisi olan en yakın noktayı arar.
 * İstek sınırını korumak için iki aşama: önce yakın çevre, deniz çıkmazsa daha uzak halkalar.
 * hava/deniz.py → en_yakin_deniz */
export async function enYakinDeniz(istemci: Istemci, lat: number, lon: number): Promise<DenizNoktasi | null> {
  const halka = (r: number): [number, number][] => Array.from({ length: 12 }, (_, k) => {
    const a = k * 30 * RAD;
    return [lat + r * Math.cos(a), lon + (r * Math.sin(a)) / Math.cos(lat * RAD)];
  });
  for (const noktalar of [[[lat, lon] as [number, number], ...halka(0.3), ...halka(0.6)], [...halka(0.9), ...halka(1.2)]]) {
    const { veri } = await istemci.getir(DENIZ, {
      latitude: noktalar.map(([a]) => pyBicim(a, 3)).join(","), longitude: noktalar.map(([, b]) => pyBicim(b, 3)).join(","),
      hourly: "wave_height", forecast_days: 1,
    });
    apiHatasiMi(veri);
    const liste: unknown[] = Array.isArray(veri) ? veri : [veri];
    const adaylar: [number, number, number][] = [];
    noktalar.forEach(([a, b], i) => {
      const r = liste[i];
      const dalga = nesneMi(r) && nesneMi(r.hourly) && Array.isArray(r.hourly.wave_height) ? r.hourly.wave_height : [];
      if (dalga.some((x) => x != null)) adaylar.push([mesafeKm(lat, lon, a, b), a, b]);
    });
    if (!adaylar.length) continue;
    const [km, a, b] = adaylar.reduce((en, x) => (x[0] < en[0] || (x[0] === en[0] && (x[1] < en[1] || (x[1] === en[1] && x[2] < en[2]))) ? x : en));
    const yonler = adaylar.filter(([d]) => d > 1).map(([, x, y]) => kerteriz(lat, lon, x, y) * RAD);
    let yon: number | null = null;
    if (yonler.length && yonler.length < noktalar.length - 1) {
      const sinOrt = yonler.reduce((s, x) => s + Math.sin(x), 0) / yonler.length;
      const cosOrt = yonler.reduce((s, x) => s + Math.cos(x), 0) / yonler.length;
      if (Math.hypot(sinOrt, cosOrt) > 0.3) yon = mod(Math.atan2(sinOrt, cosOrt) / RAD, 360);   // deniz belirgin biçimde bir yanda
    }
    return { lat: a, lon: b, km, yon };
  }
  return null;
}

/** Bir deniz noktasının saatlik verisi, konumun yerel saatiyle şu andan başlayarak. hava/deniz.py → deniz_verisi */
export async function denizVerisi(istemci: Istemci, lat: number, lon: number, tz: string, gun: number,
                                  an: Date = new Date()): Promise<{ tablo: Tablo; bilgi: YanitBilgisi }> {
  const { veri, bilgi } = await istemci.getir(DENIZ, { latitude: lat, longitude: lon, hourly: DENIZ_SAATLIK, forecast_days: gun, timezone: tz });
  apiHatasiMi(veri);
  const js = nesneMi(veri) ? veri : {};
  const tablo = tabloDogrula(js.hourly, DENIZ_SAATLIK.split(","));
  return { tablo: simdiden(tablo, simdikiSaat(typeof js.timezone === "string" ? js.timezone : tz, an)), bilgi };
}

/** Kıyıdaki konumlar için "Nelere dikkat etmeli?" kartlarına eklenecek deniz uyarıları. `d`: şu andan başlayan
 * deniz tablosu, `gun`: bakılacak gün sayısı. hava/deniz.py → uyarilar (veri indirildikten sonraki kısmı) */
export function denizUyarilari(d: Tablo, gun: number): Uyari[] {
  const dalgaHam = d.sutun.wave_height ?? [];
  const dolu = d.zaman.map((_, i) => dalgaHam[i] != null);
  const ilk = d.zaman.find((_, i) => dolu[i]);
  if (ilk === undefined) return [];
  const sinir = saatEkle(ilk, 24 * gun);
  const sec = d.zaman.map((z, i) => dolu[i]! && z < sinir);
  const z = d.zaman.filter((_, i) => sec[i]);
  const sutun = (ad: string): Deger[] => (d.sutun[ad] ?? d.zaman.map(() => null)).filter((_, i) => sec[i]);
  const h = sutun("wave_height"), s = sutun("sea_level_height_msl");
  const out: Uyari[] = [];
  const hmax = enBuyuk(h);
  if (hmax >= 1) {
    out.push({ seviye: hmax >= 2.5 ? "tehlike" : "dikkat", ikon: ":material/tsunami:", baslik: "Dalgalı deniz",
      ozet: `Belirgin dalga yüksekliği ${pyBicim(hmax, 1)} m'ye çıkıyor (${zamanYaz(z[ilkEnBuyuk(h)]!)}). ` +
            `1 m üstü: ${aralik(z, maske(h, (x) => x >= 1))}.`,
      neden: "Belirgin dalga yüksekliği en yüksek üçte bir dalganın ortalamasıdır; tek tek dalgalar bunun " +
             "iki katına ulaşabilir. Küçük tekneler için 1 m üstü riskli, 2 m üstü tehlikelidir; dalgalar " +
             "dalgakıranları, sahil yollarını ve iskeleleri de aşabilir.",
      bak: "app_pages/balikcilik.py",
      bak_ne: "Balıkçılık ve deniz sayfasında saat saat denize çıkış çizelgesine ve dalga periyoduna bak." });
  }
  const oynama = enBuyuk(s) - enKucuk(s);
  if (oynama >= 0.4) {
    out.push({ seviye: "bilgi", ikon: ":material/water:", baslik: "Deniz seviyesi değişimi",
      ozet: `Deniz seviyesi dönem içinde ${pyBicim(oynama, 1)} m oynuyor; en yüksek ${zamanYaz(z[ilkEnBuyuk(s)]!)}.`,
      neden: "Türkiye kıyılarında gelgit birkaç santimetredir; büyük seviye değişimlerini kıyıya doğru " +
             "esen kuvvetli rüzgâr ve alçak basınç (fırtına kabarması) yaratır.",
      bak: "app_pages/balikcilik.py", bak_ne: "Balıkçılık ve deniz sayfasındaki deniz seviyesi grafiğine bak." });
  }
  return out;
}
