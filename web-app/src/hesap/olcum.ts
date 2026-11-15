/** Gerçek istasyon ölçümleri: havalimanı meteoroloji istasyonlarının METAR raporları (hava/olcum.py karşılığı).
 *
 * Streamlit sürümü NOAA Aviation Weather Center'ı kullanır; o servis tarayıcıdan çağrılamaz (CORS yok). Burada
 * aynı raporlar Iowa Environmental Mesonet (IEM) arşivinden alınır: tarayıcıdan çağrılabilir, anahtar istemez ve
 * model sıralaması da (hesap/siralama.ts) zaten bu arşivi kullanır. Bilinçli farklar:
 *  - İstasyon listesi depodaki `istasyonlar.json` dosyasıdır: Streamlit sürümünün de kullandığı NOAA istasyon
 *    bilgisinden `araclar/istasyon_listesi.py` ile üretilir (Türkiye ve yakın çevresi). IEM'in kendi Türkiye listesi
 *    kullanılmaz: bazı koordinatları yanlıştır (Ordu-Giresun ile Hakkari yer değiştirmiş, Şırnak Ankara'nın yanında
 *    görünür); o listeyle Giresun'da Hakkari'nin ölçümleri Giresun tahminiyle karşılaştırılıyordu.
 *  - Rapor tam saate en çok 15 dakika uzaksa o saate yazılır (siralama.py'deki kural). Streamlit'in yarım saatlik
 *    raporların saat içi ortalamasını alması, IEM'in saatte tek rutin rapor verdiği durumda ölçümü 50 dakika
 *    öncesine kaydırırdı.
 *  - Basınç IEM'de inHg (altimetre ayarı, QNH) gelir ve hPa'ya çevrilir; çevrim ±0,2 hPa yuvarlama payı taşır. */
import { mesafeKm } from "../ortak/cografya";
import { npYuvarla } from "../ortak/dizi";
import { saatEkle, sayac, sayactan, yerelSaat } from "../ortak/zaman";
import { type Istemci, VeriHatasi } from "../veri/istemci";
import type { Deger, Tablo } from "../veri/tipler";
import { iemGetir } from "./iem";
import ISTASYON_LISTESI from "./istasyonlar.json";

export const KNOT = 1.852;
export const INHG = 33.8639;
/** Bir istasyonun kullanılabilmesi için gereken en az saatlik ölçüm (yaklaşık bir gün). */
export const EN_AZ_OLCUM = 24;

export interface OlcumIstasyonu {
  icao: string;
  ad: string;
  lat: number;
  lon: number;
  /** Metre; bilinmiyorsa null. */
  rakim: number | null;
  /** Seçili konuma uzaklık. */
  km: number;
}

/** Listedeki bir METAR istasyonu (konumu ve rakımı NOAA istasyon bilgisinden). */
export interface IstasyonKaydi { icao: string; ad: string; lat: number; lon: number; rakim: number | null }

/** Konuma `enFazlaKm` içindeki istasyonlar, yakından uzağa. (hava/olcum.py → _adaylar) */
export function yakinIstasyonlar(lat: number, lon: number, enFazlaKm = 120, liste: readonly IstasyonKaydi[] = ISTASYON_LISTESI): OlcumIstasyonu[] {
  return liste.map((s) => ({ ...s, km: mesafeKm(lat, lon, s.lat, s.lon) })).filter((s) => s.km <= enFazlaKm).sort((a, b) => a.km - b.km);
}

const SUTUNLAR: readonly (readonly [string, string, (x: number) => number])[] = [
  ["tmpf", "temperature_2m", (f) => npYuvarla(((f - 32) * 5) / 9, 1)],
  ["dwpf", "dew_point_2m", (f) => npYuvarla(((f - 32) * 5) / 9, 1)],
  ["sknt", "wind_speed_10m", (k) => npYuvarla(k * KNOT, 1)],
  ["gust", "wind_gusts_10m", (k) => npYuvarla(k * KNOT, 1)],
  ["alti", "pressure_msl", (i) => npYuvarla(i * INHG, 1)],
];

/** IEM'in CSV çıktısı → saatlik tablo, uygulamanın değişken adları ve birimleriyle. Zamanlar istekteki saat
 * dilimindedir. Tam saate 15 dakikadan uzak raporlar atlanır; aynı saate iki rapor düşerse sonuncusu kalır.
 * `istasyon` verilirse yalnızca o istasyonun satırları alınır (çok istasyonlu yanıt). Hiç ölçüm yoksa null. */
export function olcumAyikla(csv: string, istasyon?: string): Tablo | null {
  const satirlar = csv.split(/\r?\n/).filter((s) => s.trim());
  const baslik = (satirlar.shift() ?? "").split(",").map((b) => b.trim());
  const zi = baslik.indexOf("valid"), si = baslik.indexOf("station");
  if (zi === -1 || !satirlar.length) return null;
  const kol = SUTUNLAR.map(([ham]) => baslik.indexOf(ham));
  const saatlik = new Map<string, Deger[]>();
  for (const satir of satirlar) {
    const h = satir.split(",");
    if (istasyon !== undefined && (h[si] ?? "").trim() !== istasyon) continue;
    const t = (h[zi] ?? "").trim().replace(" ", "T");
    if (!/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}/.test(t)) continue;
    const dk = Number(t.slice(14, 16));
    if (dk > 15 && dk < 45) continue;
    const saat = dk >= 45 ? saatEkle(`${t.slice(0, 13)}:00`, 1) : `${t.slice(0, 13)}:00`;
    const deger = SUTUNLAR.map(([, , cevir], k) => {
      const ham = kol[k]! === -1 ? "" : (h[kol[k]!] ?? "").trim();
      const x = ham === "" || ham === "M" ? NaN : Number(ham);
      return Number.isFinite(x) ? cevir(x) : null;
    });
    if (deger.every((x) => x == null)) continue;
    saatlik.delete(saat);
    saatlik.set(saat, deger);
  }
  if (!saatlik.size) return null;
  const zaman = [...saatlik.keys()].sort();
  return { zaman, sutun: Object.fromEntries(SUTUNLAR.map(([, ad], k) => [ad, zaman.map((z) => saatlik.get(z)![k] ?? null)])) };
}

/** Son 8 günde ölçümü olan en yakın istasyon ve saatlik ölçümleri (konumun yerel saatiyle); yoksa null.
 * Bazı istasyonlar listede görünür ama rapor yayımlamaz (ör. askerî meydanlar); bu yüzden en yakın beş aday tek
 * istekte sorulur ve verisi olan en yakını seçilir (IEM art arda gelen istekleri geri çevirir; bkz. iem.ts). */
export async function enYakinOlcum(istemci: Istemci, lat: number, lon: number, tz: string, an: Date = new Date()):
    Promise<{ istasyon: OlcumIstasyonu; tablo: Tablo } | null> {
  const adaylar = yakinIstasyonlar(lat, lon).slice(0, 5);
  if (!adaylar.length) return null;
  const bugun = `${yerelSaat(an, tz).slice(0, 10)}T00:00`;
  const parca = (g: string) => [Number(g.slice(0, 4)), Number(g.slice(5, 7)), Number(g.slice(8, 10))] as const;
  const [y1, a1, g1] = parca(sayactan(sayac(bugun) - 8 * 86_400_000)), [y2, a2, g2] = parca(saatEkle(bugun, 24));
  try {
    const { veri } = await iemGetir(istemci, {
      station: adaylar.map((a) => a.icao).join(","), data: "tmpf,dwpf,sknt,gust,alti", tz, format: "onlycomma", missing: "M", report_type: 3,
      year1: y1, month1: a1, day1: g1, year2: y2, month2: a2, day2: g2,
    });
    if (veri == null) return null;
    for (const istasyon of adaylar) {
      const tablo = olcumAyikla(veri, istasyon.icao);
      if (tablo && tablo.zaman.length >= EN_AZ_OLCUM) return { istasyon, tablo };
    }
    return null;
  } catch (e) {
    if (e instanceof VeriHatasi) return null;
    throw e;
  }
}
