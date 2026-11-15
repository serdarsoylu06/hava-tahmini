/** Mevsim normalleri ve geçmiş: Open-Meteo arşivindeki ERA5 yeniden analizinden (1991'den bugüne, günlük).
 * Normal dönemi WMO'nun güncel standardı olan 1991–2020'dir. hava/iklim.py'nin karşılığı; referans/iklim.json
 * ile sınanır. */
import { ceyrek, ortalama, say, topla } from "../ortak/dizi";
import { pyBicim } from "../ortak/sayi";
import { yerelSaat } from "../ortak/zaman";
import { apiHatasiMi, nesneMi, sayiyaCevir } from "../veri/dogrula";
import { TZ } from "../veri/donem";
import { type Istemci, VeriHatasi } from "../veri/istemci";
import { FC } from "../veri/openMeteo";
import type { Deger, Konum } from "../veri/tipler";

export const ARSIV = "https://archive-api.open-meteo.com/v1/archive";
export const BASLANGIC = 1991;
export const NORMAL = [1991, 2020] as const;
/** Open-Meteo uzun ve çok değişkenli istekleri birden çok istek sayar: değişken sayısı en azda tutulur,
 * günlük ortalama en yüksek ile en düşükten hesaplanır. */
export const GUNLUK = "temperature_2m_max,temperature_2m_min,precipitation_sum";

/** Günlük iklim tablosu. `gun`: "YYYY-AA-GG". */
export interface GunlukIklim {
  gun: string[];
  max: Deger[];
  min: Deger[];
  yagis: Deger[];
  /** (en yüksek + en düşük) / 2 */
  ort: Deger[];
}

const GUN_MS = 86_400_000;
const yil = (g: string) => Number(g.slice(0, 4));
const ay = (g: string) => Number(g.slice(5, 7));
const gunNo = (g: string) => Number(g.slice(8, 10));
const sira = (g: string) => Date.UTC(yil(g), ay(g) - 1, gunNo(g)) / GUN_MS;                    // gün sayacı
const tarih = (n: number) => new Date(n * GUN_MS).toISOString().slice(0, 10);
const yilinGunu = (g: string) => sira(g) - Date.UTC(yil(g), 0, 1) / GUN_MS + 1;
const nan = (x: number): Deger => (Number.isNaN(x) ? null : x);

/** API'nin günlük bloğu → tablo. hava/iklim.py → _tablo */
export function iklimTablosu(daily: unknown): GunlukIklim {
  if (!nesneMi(daily) || !Array.isArray(daily.time)) throw new VeriHatasi("bicim", "Yanıt beklenen biçimde değil", "günlük iklim bloğu yok");
  const gun = daily.time.map(String);
  const sutun = (ad: string): Deger[] => {
    const v = daily[ad];
    if (!Array.isArray(v) || v.length !== gun.length) throw new VeriHatasi("bicim", "Yanıt beklenen biçimde değil", `günlük iklim: "${ad}" yok`);
    return v.map(sayiyaCevir);
  };
  const max = sutun("temperature_2m_max"), min = sutun("temperature_2m_min");
  return { gun, max, min, yagis: sutun("precipitation_sum"),
           ort: max.map((x, i) => (x == null || min[i] == null ? null : (x + min[i]!) / 2)) };
}

/** Yılın her günü için normal değerler; `anahtar` ay-gün ("11-04"), 365 satır. */
export interface Normaller {
  anahtar: string[];
  max_ort: Deger[]; max_p10: Deger[]; max_p90: Deger[];
  min_ort: Deger[]; min_p10: Deger[]; min_p90: Deger[];
  ort: Deger[]; yagis: Deger[];
}

/** Yılın her günü için 1991–2020 normali: ortalama, %10 ve %90 değerleri (±7 günlük pencereyle yumuşatılmış,
 * çünkü tek bir takvim gününün 30 değeri gürültülüdür). hava/iklim.py → normaller */
export function normaller(a: GunlukIklim): Normaller {
  // her takvim günü (1..365, artık yıl hizalanmış) için o güne düşen değerler
  const kova = Array.from({ length: 366 }, () => ({ max: [] as Deger[], min: [] as Deger[], ort: [] as Deger[], yagis: [] as Deger[] }));
  a.gun.forEach((g, i) => {
    const y = yil(g);
    if (y < NORMAL[0] || y > NORMAL[1] || (ay(g) === 2 && gunNo(g) === 29)) return;
    const k = kova[yilinGunu(g) - (y % 4 === 0 && ay(g) > 2 ? 1 : 0)]!;
    k.max.push(a.max[i]!); k.min.push(a.min[i]!); k.ort.push(a.ort[i]!); k.yagis.push(a.yagis[i]!);
  });
  const n: Normaller = { anahtar: [], max_ort: [], max_p10: [], max_p90: [], min_ort: [], min_p10: [], min_p90: [], ort: [], yagis: [] };
  const mod = (x: number, m: number) => ((x % m) + m) % m;
  for (let gun = 1; gun <= 365; gun++) {
    const p = { max: [] as Deger[], min: [] as Deger[], ort: [] as Deger[], yagis: [] as Deger[] };
    for (let g2 = 1; g2 <= 365; g2++) {
      if (Math.abs(mod(g2 - gun + 182, 365) - 182) > 7) continue;                             // yıl sonunu saran ±7 gün
      const k = kova[g2]!;
      p.max.push(...k.max); p.min.push(...k.min); p.ort.push(...k.ort); p.yagis.push(...k.yagis);
    }
    n.anahtar.push(tarih(sira("2001-01-01") + gun - 1).slice(5));                             // artık olmayan bir yıl
    n.max_ort.push(nan(ortalama(p.max))); n.max_p10.push(nan(ceyrek(p.max, 0.1))); n.max_p90.push(nan(ceyrek(p.max, 0.9)));
    n.min_ort.push(nan(ortalama(p.min))); n.min_p10.push(nan(ceyrek(p.min, 0.1))); n.min_p90.push(nan(ceyrek(p.min, 0.9)));
    n.ort.push(nan(ortalama(p.ort))); n.yagis.push(nan(ortalama(p.yagis)));
  }
  return n;
}

/** Verilen tarihlerin normal satırlarının sırası (29 Şubat, 28 Şubat'ınkini kullanır). hava/iklim.py → normal_al */
export function normalAl(nrm: Normaller, tarihler: readonly string[]): number[] {
  const yer = new Map(nrm.anahtar.map((k, i) => [k, i]));
  return tarihler.map((t) => {
    const i = yer.get(t.slice(5, 10) === "02-29" ? "02-28" : t.slice(5, 10));
    if (i === undefined) throw new Error(`normal bulunamadı: ${t}`);
    return i;
  });
}

/** Her yıl için verilen takvim gününün (±pencere gün) ortalama en yüksek/en düşük sıcaklığı.
 * hava/iklim.py → ayni_gun_gecmisi */
export function ayniGunGecmisi(a: GunlukIklim, t: string, pencere = 3): { yil: number; max: Deger; min: Deger }[] {
  const ayi = ay(t), gunu = Math.min(gunNo(t), ayi === 2 ? 28 : 31);
  const yer = new Map(a.gun.map((g, i) => [g, i]));
  const yillar = [...new Set(a.gun.map(yil))].sort((x, y) => x - y);
  const satir: { yil: number; max: Deger; min: Deger }[] = [];
  for (const y of yillar) {
    const merkez = Date.UTC(y, ayi - 1, gunu);
    if (new Date(merkez).getUTCMonth() !== ayi - 1) continue;                                 // o yıl öyle bir gün yok
    const max: Deger[] = [], min: Deger[] = [];
    for (let k = -pencere; k <= pencere; k++) {
      const i = yer.get(tarih(merkez / GUN_MS + k));
      if (i !== undefined) { max.push(a.max[i]!); min.push(a.min[i]!); }
    }
    if (max.length >= pencere) satir.push({ yil: y, max: nan(ortalama(max)), min: nan(ortalama(min)) });
  }
  return satir;
}

export interface Yillik {
  yil: number[];
  ort: number[];
  /** 1991–2020 normaline göre sapma (°C) */
  sapma: number[];
  /** Isınma eğilimi (°C / 10 yıl) */
  egim: number;
  normal: number;
}

/** Tam yılların ortalama sıcaklığı ve 1991–2020 normaline göre sapması (ısınma şeritleri için).
 * hava/iklim.py → yillik */
export function yillik(a: GunlukIklim): Yillik {
  const grup = new Map<number, Deger[]>();
  a.gun.forEach((g, i) => { const y = yil(g); (grup.get(y) ?? grup.set(y, []).get(y)!).push(a.ort[i]!); });
  const yillar: number[] = [], ort: number[] = [];
  for (const [y, v] of [...grup].sort((p, q) => p[0] - q[0])) {
    if (say(v) >= 360) { yillar.push(y); ort.push(ortalama(v)); }
  }
  const normal = ortalama(ort.filter((_, i) => yillar[i]! >= NORMAL[0] && yillar[i]! <= NORMAL[1]));
  // en küçük kareler doğrusu (numpy.polyfit(x, y, 1) eğimi)
  const xo = ortalama(yillar), yo = ortalama(ort);
  const egim = (yillar.reduce((s, x, i) => s + (x - xo) * (ort[i]! - yo), 0) / yillar.reduce((s, x) => s + (x - xo) ** 2, 0)) * 10;
  return { yil: yillar, ort, sapma: ort.map((x) => x - normal), egim, normal };
}

/** Bu yılın aylık yağış toplamı (arşiv + son günler) ile 1991–2020 aylık normali. `bugun`: "YYYY-AA-GG"; son
 * günlerden yalnızca bugüne kadar olanlar (tahmin günleri değil) toplanır. hava/iklim.py → aylik_yagis */
export function aylikYagis(a: GunlukIklim, son: GunlukIklim | null, yili: number, bugun: string): { ay: number[]; normal: Deger[]; bu_yil: Deger[] } {
  const yilAy = new Map<string, Deger[]>();
  a.gun.forEach((g, i) => {
    if (yil(g) < NORMAL[0] || yil(g) > NORMAL[1]) return;
    const k = g.slice(0, 7);
    (yilAy.get(k) ?? yilAy.set(k, []).get(k)!).push(a.yagis[i]!);
  });
  const ayToplamlari = new Map<number, number[]>();
  for (const [k, v] of yilAy) { const m = Number(k.slice(5, 7)); (ayToplamlari.get(m) ?? ayToplamlari.set(m, []).get(m)!).push(topla(v)); }

  const buYil = new Map<number, Deger[]>();
  let sonGun = "";
  const ekle = (g: string, v: Deger) => { const m = ay(g); (buYil.get(m) ?? buYil.set(m, []).get(m)!).push(v); };
  a.gun.forEach((g, i) => { if (yil(g) === yili) { ekle(g, a.yagis[i]!); if (g > sonGun) sonGun = g; } });
  if (son) son.gun.forEach((g, i) => { if (yil(g) === yili && g > sonGun && g <= bugun) ekle(g, son.yagis[i]!); });

  const aylar = [...new Set([...ayToplamlari.keys(), ...buYil.keys()])].sort((x, y) => x - y);
  return { ay: aylar, normal: aylar.map((m) => (ayToplamlari.has(m) ? ortalama(ayToplamlari.get(m)!) : null)),
           bu_yil: aylar.map((m) => (buYil.has(m) ? topla(buYil.get(m)!) : null)) };
}

/** Günlük ERA5 tablosu (1991'den geçen aya kadar). Alınamazsa null. Arşiv konum başına ayda bir indirilir ve
 * tarayıcıda saklanır: normaller her gün değişmez, 35 yıllık istek de kotadan çok yer. hava/iklim.py → arsiv */
export async function arsiv(istemci: Istemci, k: Pick<Konum, "lat" | "lon">, an: Date = new Date()): Promise<GunlukIklim | null> {
  // 0,1° yuvarlama: yakın konumlar (ör. aynı ilçe) aynı arşivi paylaşır; ERA5 ızgarası zaten ~25 km
  const lat = Number(pyBicim(k.lat, 1)), lon = Number(pyBicim(k.lon, 1));
  const buAy = yerelSaat(an, TZ).slice(0, 7);
  const bitis = tarih(sira(`${buAy}-01`) - 1);
  try {
    const { veri } = await istemci.getir(ARSIV, { latitude: lat, longitude: lon, start_date: `${BASLANGIC}-01-01`, end_date: bitis,
                                                  daily: GUNLUK, timezone: "auto" },
                                         { donem: buAy, omurGun: 62, zamanAsimiMs: 120_000 });
    apiHatasiMi(veri);
    return iklimTablosu(nesneMi(veri) ? veri.daily : null);
  } catch (e) {
    if (e instanceof VeriHatasi) return null;
    throw e;
  }
}

/** Arşivin bittiği yerden bugüne ve önümüzdeki 10 güne günlük değerler (tahmin servisi; 1 istek).
 * hava/iklim.py → son_gunler */
export async function sonGunler(istemci: Istemci, k: Konum): Promise<GunlukIklim | null> {
  try {
    const { veri } = await istemci.getir(FC, { latitude: k.lat, longitude: k.lon, daily: GUNLUK, past_days: 31, forecast_days: 10, timezone: k.tz });
    apiHatasiMi(veri);
    return iklimTablosu(nesneMi(veri) ? veri.daily : null);
  } catch (e) {
    if (e instanceof VeriHatasi) return null;
    throw e;
  }
}

/** En küçük kareler doğrusu (numpy.polyfit(x, y, 1)): `egim` ve `kesim`. Eksik değerli çiftler atlanır;
 * ikiden az nokta varsa ya da x'ler aynıysa null. */
export function dogrusalEgilim(x: readonly number[], y: readonly Deger[]): { egim: number; kesim: number } | null {
  const cift = x.flatMap((xi, i) => (y[i] == null ? [] : [[xi, y[i]!] as const]));
  if (cift.length < 2) return null;
  const xo = ortalama(cift.map((c) => c[0])), yo = ortalama(cift.map((c) => c[1]));
  const payda = cift.reduce((t, [xi]) => t + (xi - xo) ** 2, 0);
  if (!payda) return null;
  const egim = cift.reduce((t, [xi, yi]) => t + (xi - xo) * (yi - yo), 0) / payda;
  return { egim, kesim: yo - egim * xo };
}
