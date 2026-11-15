/** Model sıralaması: geçmişte gerçekten yayımlanmış tahminleri, bir havalimanı istasyonunun ölçümleriyle karşılaştırır
 * (hava/siralama.py'nin karşılığı; referans/siralama.json ile sınanır).
 *
 * Kurallar (sıralamanın dürüst olması için):
 * - Gerçekleşen değer yalnızca istasyon ölçümüdür (METAR). Ölçüm olmayan saatler doldurulmaz, atlanır.
 * - Tahminler Open-Meteo'nun geçmiş tahmin arşivinden gelir: o gün gerçekten yayımlanmış koşular, yeniden analiz değil.
 * - Her tahmin ufku (+24/+48/+72 sa) ayrı sıralanır. Bütün modeller aynı saatler üzerinden karşılaştırılır. */
import { ceyrek, npYuvarla } from "../ortak/dizi";
import { saatEkle, sayac, sayactan } from "../ortak/zaman";
import { apiHatasiMi, nesneMi, tabloDogrula } from "../veri/dogrula";
import { type Istemci, VeriHatasi } from "../veri/istemci";
import { iemGetir } from "./iem";
import type { Deger, Tablo } from "../veri/tipler";

export { IEM } from "./iem";
export const ONCEKI = "https://previous-runs-api.open-meteo.com/v1/forecast";
export const MODELLER: Readonly<Record<string, string>> = {
  ecmwf_ifs025: "ECMWF IFS", icon_seamless: "DWD ICON", gfs_seamless: "NOAA GFS",
  meteofrance_seamless: "Météo-France", ukmo_seamless: "UK Met Office", jma_seamless: "JMA",
  gem_seamless: "Kanada GEM", cma_grapes_global: "Çin CMA",
};
/** gün önce: +24, +48, +72 saat */
export const UFUKLAR = [1, 2, 3] as const;
/** gün */
export const EN_UZUN = 90;
/** gözlem saatlerinin en az %80'inde arşivi dolu olmayan model sıralamaya alınmaz */
export const KAPSAM = 0.8;
/** bootstrap tekrarı */
export const TEKRAR = 1000;

const GUN_MS = 86_400_000;

/** Saatlik ölçüm serisi (UTC). Ölçüm olmayan saatler seride hiç yer almaz. */
export interface Seri {
  zaman: string[];
  deger: number[];
}

/** Dönemin başı ve sonu (UTC günleri, bugün hariç: bugünün ölçümleri henüz tamamlanmadı). → _gunler */
export function gunler(gunSayisi: number, an: Date = new Date()): { bas: string; son: string } {
  const son = Math.floor(an.getTime() / GUN_MS) * GUN_MS;
  const gun = (ms: number) => new Date(ms).toISOString().slice(0, 10);
  return { bas: gun(son - gunSayisi * GUN_MS), son: gun(son) };
}

/** IEM'in CSV çıktısından saatlik sıcaklık ölçümleri (°C, UTC). Yalnızca tam saate 15 dakikadan yakın raporlar
 * alınır; aynı saate iki rapor düşerse sonuncusu kalır. Veri yoksa null. → gozlemler (ayrıştırma kısmı) */
export function gozlemAyikla(csv: string): Seri | null {
  const satirlar = csv.split(/\r?\n/).filter((s) => s.trim());
  const baslik = (satirlar.shift() ?? "").split(",");
  const zi = baslik.indexOf("valid"), ti = baslik.indexOf("tmpf");
  if (!satirlar.length || ti === -1 || zi === -1) return null;
  const saatlik = new Map<string, number>();
  for (const satir of satirlar) {
    const h = satir.split(",");
    const t = (h[zi] ?? "").trim().replace(" ", "T"), ham = (h[ti] ?? "").trim();
    if (!/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}/.test(t) || ham === "" || ham === "M") continue;
    const f = Number(ham);
    if (!Number.isFinite(f)) continue;
    const dk = Number(t.slice(14, 16));
    if (dk > 15 && dk < 45) continue;                                          // tam saate 15 dakikadan uzak
    const saat = dk >= 45 ? saatEkle(`${t.slice(0, 13)}:00`, 1) : `${t.slice(0, 13)}:00`;
    saatlik.delete(saat);                                                      // sonuncusu kalır
    saatlik.set(saat, npYuvarla(((f - 32) * 5) / 9, 1));
  }
  const zaman = [...saatlik.keys()].sort();
  return { zaman, deger: zaman.map((z) => saatlik.get(z)!) };
}

/** Son 90 günün saatlik sıcaklık ölçümleri. Günde bir indirilir, iki gün saklanır. Alınamazsa null. → gozlemler */
export async function gozlemler(istemci: Istemci, icao: string, an: Date = new Date()): Promise<Seri | null> {
  const { bas, son } = gunler(EN_UZUN, an);
  const p = (g: string) => [Number(g.slice(0, 4)), Number(g.slice(5, 7)), Number(g.slice(8, 10))] as const;
  const [y1, a1, g1] = p(bas), [y2, a2, g2] = p(son);
  try {
    const { veri } = await iemGetir(istemci, {
      station: icao, data: "tmpf", tz: "Etc/UTC", format: "onlycomma", missing: "M", report_type: 3,   // yalnızca rutin saatlik raporlar
      year1: y1, month1: a1, day1: g1, year2: y2, month2: a2, day2: g2,
    }, { gunluk: true, omurGun: 2 });
    return veri === null ? null : gozlemAyikla(veri);
  } catch (e) {
    if (e instanceof VeriHatasi) return null;
    throw e;
  }
}

export interface Istasyon {
  lat: number;
  lon: number;
  rakim?: number | null;
}

/** Her model ve ufuk için arşivdeki tahminler (UTC). Tahmin istasyonun kendi koordinatı ve rakımı için istenir:
 * rakım verilmezse model kendi arazi yüksekliğini kullanır ve sıcaklıkta yapay bir sapma doğar. → tahminler */
export async function tahminler(istemci: Istemci, istasyon: Istasyon, an: Date = new Date()): Promise<Tablo | null> {
  const { bas, son } = gunler(EN_UZUN, an);
  const params: Record<string, string | number> = {
    latitude: istasyon.lat, longitude: istasyon.lon, timezone: "GMT",
    hourly: UFUKLAR.map((g) => `temperature_2m_previous_day${g}`).join(","), models: Object.keys(MODELLER).join(","),
    start_date: bas, end_date: new Date(Date.parse(`${son}T00:00:00Z`) - GUN_MS).toISOString().slice(0, 10),
  };
  if (istasyon.rakim != null) params.elevation = istasyon.rakim;
  try {
    const { veri } = await istemci.getir(ONCEKI, params, { gunluk: true });
    if (veri === null) return null;
    apiHatasiMi(veri);
    return tabloDogrula(nesneMi(veri) ? veri.hourly : null);
  } catch (e) {
    if (e instanceof VeriHatasi) return null;
    throw e;
  }
}

/** Bir ufkun tahminleri: sütunlar model kodları (MODELLER sırasıyla, yalnızca yanıtta olanlar). → ufuk */
export function ufuk(t: Tablo, gun: number): Tablo {
  const sutun: Record<string, Deger[]> = {};
  for (const m of Object.keys(MODELLER)) {
    const v = t.sutun[`temperature_2m_previous_day${gun}_${m}`];
    if (v) sutun[m] = v;
  }
  return { zaman: t.zaman, sutun };
}

export interface SiraSatiri {
  /** model kodu, ör. "ecmwf_ifs025" */
  kod: string;
  model: string;
  MAE: number;
  RMSE: number;
  Bias: number;
  N: number;
  /** MAE'nin %90 güven aralığı (gün bloklu bootstrap) */
  alt: number;
  ust: number;
  /** 1: en iyi modelden ayırt edilemeyenler; 2: kalanların en iyisinden ayırt edilemeyenler; … */
  grup: number;
}

export interface SiraBilgisi {
  /** ortak örneklemdeki saat sayısı */
  N: number;
  gun: number;
  /** arşiv kapsamı yetersiz olduğu için sıralamaya alınmayan modeller */
  disarida: string[];
}

/** Tohumlu, tekrarlanabilir rastgele sayı üreteci (mulberry32). Bootstrap her açılışta aynı sonucu versin diye. */
function rastgele(tohum: number): () => number {
  let a = tohum >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/** MAE, RMSE, sapma, N ve gün bloklu bootstrap ile güven aralığı ve gruplar.
 *
 * Ardışık saatlerin hataları birbirine bağlıdır (bir model bütün gün aynı yönde yanılır). Bu yüzden bootstrap
 * saatleri değil günleri yeniden örnekler. Grup: en iyi modelden ayırt edilemeyen modeller (MAE farkının tek
 * yönlü %95 alt sınırı sıfırın altında). Sonra kalanların en iyisiyle aynı işlem tekrarlanır.
 *
 * `ornekler`: bootstrap'in gün sıraları (TEKRAR × gün). Verilmezse sabit tohumlu üreteçle çekilir. Python sürümü
 * numpy'nin üretecini kullanır; rastgele çekilişler bu yüzden birebir aynı olmaz, hesap ise aynıdır (testler
 * numpy'nin çekilişlerini buradan vererek hesabı birebir karşılaştırır). → siralama */
export function siralama(F: Tablo, O: Seri, gunSayisi: number, ornekler?: readonly (readonly number[])[]):
    { tablo: SiraSatiri[] | null; bilgi: SiraBilgisi } {
  const modeller = Object.keys(F.sutun);
  const bos = (disarida: string[]) => ({ tablo: null, bilgi: { N: 0, gun: 0, disarida } });
  if (!O.zaman.length) return bos(modeller);
  // dönem: son ölçümün gününün sonundan geriye (23:50 raporu ertesi 00:00'a yuvarlanır)
  const sonOlcum = O.zaman.reduce((a, b) => (a > b ? a : b));
  const tavan = sonOlcum.endsWith("T00:00") ? sonOlcum : saatEkle(`${sonOlcum.slice(0, 10)}T00:00`, 24);
  const bas = sayactan(sayac(tavan) - gunSayisi * GUN_MS);
  const gozlem = new Map<string, number>();
  O.zaman.forEach((z, i) => { if (z >= bas) gozlem.set(z, O.deger[i]!); });

  const yer = new Map(F.zaman.map((z, i) => [z, i]));
  const kapsam = (m: string) => {
    let dolu = 0;
    for (const z of gozlem.keys()) { const i = yer.get(z); if (i !== undefined && F.sutun[m]![i] != null) dolu++; }
    return gozlem.size ? dolu / gozlem.size : Number.NaN;
  };
  const yeterli = modeller.filter((m) => kapsam(m) >= KAPSAM);
  const disarida = modeller.filter((m) => !yeterli.includes(m));
  if (!yeterli.length) return bos(disarida);

  // ortak örneklem: ölçümü olan ve bütün yeterli modellerin tahmini bulunan saatler
  const gunHata: number[][] = [];                                             // gün × model: mutlak hata toplamı
  const gunAdet: number[] = [];
  const E: number[][] = yeterli.map(() => []);
  let sonGun = "";
  F.zaman.forEach((z, i) => {
    const o = gozlem.get(z);
    if (o === undefined) return;
    const hata = yeterli.map((m) => F.sutun[m]![i]);
    if (hata.some((x) => x == null)) return;
    const g = z.slice(0, 10);
    if (g !== sonGun) { gunHata.push(yeterli.map(() => 0)); gunAdet.push(0); sonGun = g; }
    hata.forEach((x, k) => { const e = x! - o; E[k]!.push(e); gunHata[gunHata.length - 1]![k]! += Math.abs(e); });
    gunAdet[gunAdet.length - 1]!++;
  });
  const N = E[0]!.length, D = gunAdet.length;
  if (!N) return bos(disarida);

  let cekilis = ornekler;
  if (!cekilis) {
    const r = rastgele(0);
    cekilis = Array.from({ length: TEKRAR }, () => Array.from({ length: D }, () => Math.floor(r() * D)));
  }
  const boot = yeterli.map(() => new Array<number>(cekilis.length));          // model × tekrar
  cekilis.forEach((gunSirasi, t) => {
    let adet = 0;
    const toplam = yeterli.map(() => 0);
    for (const g of gunSirasi) { adet += gunAdet[g]!; gunHata[g]!.forEach((x, k) => { toplam[k]! += x; }); }
    toplam.forEach((x, k) => { boot[k]![t] = x / adet; });
  });

  const satirlar: SiraSatiri[] = yeterli.map((m, k) => {
    const e = E[k]!;
    return { kod: m, model: MODELLER[m] ?? m, MAE: e.reduce((s, x) => s + Math.abs(x), 0) / N,
             RMSE: Math.sqrt(e.reduce((s, x) => s + x * x, 0) / N), Bias: e.reduce((s, x) => s + x, 0) / N, N,
             alt: ceyrek(boot[k]!, 0.05), ust: ceyrek(boot[k]!, 0.95), grup: 0 };
  });
  const kol = new Map(yeterli.map((m, k) => [m, k]));
  let sira = [...satirlar].sort((a, b) => a.MAE - b.MAE).map((s) => s.kod);
  for (let g = 1; sira.length; g++) {
    const lider = boot[kol.get(sira[0]!)!]!;
    const ayni = sira.filter((m) => { const b = boot[kol.get(m)!]!; return ceyrek(b.map((x, t) => x - lider[t]!), 0.05) <= 0; });
    for (const m of ayni) satirlar[kol.get(m)!]!.grup = g;
    sira = sira.filter((m) => !ayni.includes(m));
  }
  return { tablo: satirlar.sort((a, b) => a.grup - b.grup || a.MAE - b.MAE), bilgi: { N, gun: D, disarida } };
}
