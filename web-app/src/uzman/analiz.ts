/** Uzman modun analiz panelindeki hesaplar: seçili modelin meteogramı, modellerin karşılaştırması ve ansambl.
 * Streamlit sürümündeki sayfa kodlarının (app_pages/meteogram.py, modeller.py, ansambl.py) karşılığıdır; eşikler
 * ve cümleler aynıdır, referans/analiz.json ile sınanır. */
import { ceyrek, enBuyuk, enKucuk, ilkEnBuyuk, ortalama, say, topla } from "../ortak/dizi";
import { pyBicim } from "../ortak/sayi";
import { gunYaz, saatFarki, zamanYaz } from "../ortak/zaman";
import { apiHatasiMi, nesneMi, tabloDogrula } from "../veri/dogrula";
import type { Istemci } from "../veri/istemci";
import { FC, GUN_EN_COK, SAATLIK, simdiden, simdikiSaat } from "../veri/openMeteo";
import type { Deger, Konum, Tablo } from "../veri/tipler";

/** Model karşılaştırmasındaki modeller (app_pages/modeller.py → MODELLER), çizim renkleriyle. */
export const KARSILASTIRMA_MODELLERI: readonly { ad: string; kod: string; renk: string }[] = [
  { ad: "ECMWF IFS (Avrupa, 9 km)", kod: "ecmwf_ifs", renk: "#2E6B3A" },
  { ad: "ECMWF AIFS (yapay zekâ)", kod: "ecmwf_aifs025_single", renk: "#1C2829" },
  { ad: "GFS (ABD)", kod: "gfs_seamless", renk: "#2A6FB0" },
  { ad: "ICON (Almanya)", kod: "icon_seamless", renk: "#B2602A" },
  { ad: "ARPEGE (Fransa)", kod: "meteofrance_seamless", renk: "#6B4FA0" },
  { ad: "UKMO (İngiltere)", kod: "ukmo_seamless", renk: "#B5352B" },
];

/** değişken: API adı, birim, "uyumlu" ve "belirsiz" eşikleri (app_pages/modeller.py → DEGISKENLER) */
export const KARSILASTIRMA_DEGISKENLERI: Readonly<Record<string, { degisken: string; birim: string; esik: readonly [number, number] }>> = {
  "Sıcaklık": { degisken: "temperature_2m", birim: "°C", esik: [2, 4] },
  "Birikimli yağış": { degisken: "precipitation", birim: "mm", esik: [5, 15] },
  "Rüzgâr": { degisken: "wind_speed_10m", birim: "km/s", esik: [8, 15] },
  "Basınç": { degisken: "pressure_msl", birim: "hPa", esik: [3, 6] },
  "Bulutluluk": { degisken: "cloud_cover", birim: "%", esik: [30, 60] },
};

/** Ansambl modelleri ve değişkenleri (app_pages/ansambl.py). */
export const ANSAMBL_MODELLERI: Readonly<Record<string, string>> = {
  "ECMWF (51 üye)": "ecmwf_ifs025", "ECMWF AIFS yapay zekâ (51 üye)": "ecmwf_aifs025",
  "GFS (31 üye)": "gfs_seamless", "ICON (40 üye)": "icon_seamless",
};
export const ANSAMBL_DEGISKENLERI: Readonly<Record<string, { degisken: string; birim: string }>> = {
  "Sıcaklık": { degisken: "temperature_2m", birim: "°C" }, "Yağış": { degisken: "precipitation", birim: "mm" },
  "Rüzgâr": { degisken: "wind_speed_10m", birim: "km/s" },
};

/** Tablonun ilk `saat` satırı. */
export function ilkSaatler(t: Tablo, saat: number): Tablo {
  return { zaman: t.zaman.slice(0, saat), sutun: Object.fromEntries(Object.entries(t.sutun).map(([k, v]) => [k, v.slice(0, saat)])) };
}

/** Seçili modelin saatlik tahminini ortak tahminin zaman eksenine oturtur; modelin vermediği değişkenler (ör. yağış
 * olasılığı) ortak tahminden alınır. app_pages/meteogram.py'deki model seçimi. */
export function modelleBirlestir(ortak: Tablo, model: Tablo, kod: string): Tablo {
  const ek = `_${kod}`;
  const yer = new Map(model.zaman.map((z, i) => [z, i]));
  const modelSutun = new Map(Object.entries(model.sutun).map(([ad, v]) => [ad.endsWith(ek) ? ad.slice(0, -ek.length) : ad, v]));
  const sutun: Record<string, Deger[]> = {};
  for (const [ad, ortakDeger] of Object.entries(ortak.sutun)) {
    const m = modelSutun.get(ad);
    const hizali = m ? ortak.zaman.map((z) => { const i = yer.get(z); return i === undefined ? null : m[i] ?? null; }) : null;
    sutun[ad] = hizali && hizali.some((x) => x != null) ? hizali : ortakDeger;
  }
  return { zaman: ortak.zaman, sutun };
}

/** Seçili modelin (ECMWF, ICON, GFS) nokta tahmini, şu andan başlayarak. İstek Streamlit meteogramındakiyle aynıdır. */
export async function modelTahmini(istemci: Istemci, k: Konum, kod: string, an: Date = new Date()): Promise<Tablo> {
  const { veri } = await istemci.getir(FC, { latitude: k.lat, longitude: k.lon, hourly: SAATLIK, models: kod, forecast_days: GUN_EN_COK, timezone: k.tz });
  apiHatasiMi(veri);
  const js = nesneMi(veri) ? veri : {};
  return simdiden(tabloDogrula(js.hourly), simdikiSaat(typeof js.timezone === "string" ? js.timezone : k.tz, an));
}

export interface MeteogramOzeti {
  enYuksek: string; enDusuk: string; toplamYagis: string; toplamKar: string; enKuvvetliHamle: string; basincDegisimi: string;
}

/** Meteogramın üstündeki özet kartları (app_pages/meteogram.py). */
export function meteogramOzeti(t: Tablo): MeteogramOzeti {
  const s = (ad: string) => t.sutun[ad] ?? [];
  const p = s("pressure_msl"), dp = (p[p.length - 1] ?? Number.NaN) - (p[0] ?? Number.NaN);
  return {
    enYuksek: `${pyBicim(enBuyuk(s("temperature_2m")))}°`, enDusuk: `${pyBicim(enKucuk(s("temperature_2m")))}°`,
    toplamYagis: `${pyBicim(topla(s("precipitation")), 1)} mm`, toplamKar: `${pyBicim(topla(s("snowfall")), 1)} cm`,
    enKuvvetliHamle: `${pyBicim(enBuyuk(s("wind_gusts_10m")))} km/s`,
    // dönemin başında ya da sonunda basınç yoksa (model erken bitiyor) Python "+nan hPa" yazar; burada "—"
    basincDegisimi: Number.isNaN(dp) ? "—" : `${dp >= 0 ? "+" : ""}${pyBicim(dp)} hPa`,
  };
}

/** pandas `interpolate(limit=sinir)`: aradaki boşluklar doğrusal doldurulur, ama her boşluğun yalnızca ilk `sinir`
 * değeri; son geçerli değerden sonraki boşluk o değerle (yine en çok `sinir` adım) sürdürülür; baştaki boşluk kalır. */
export function araDeger(v: readonly Deger[], sinir = 6): Deger[] {
  const out = [...v];
  let onceki = -1;
  v.forEach((x, i) => {
    if (x == null) return;
    if (onceki >= 0) for (let k = 1; k < i - onceki && k <= sinir; k++) out[onceki + k] = v[onceki]! + ((x - v[onceki]!) * k) / (i - onceki);
    onceki = i;
  });
  if (onceki >= 0) for (let k = 1; k <= sinir && onceki + k < v.length; k++) out[onceki + k] = v[onceki]!;
  return out;
}

export interface ModelSerisi {
  ad: string;
  kod: string;
  renk: string;
  deger: Deger[];
}

/** Karşılaştırma grafiğinin serileri: yağış birikimli gösterilir ve modelin tahmin süresi bitince çizgi kesilir;
 * diğer değişkenlerde 6 saate kadar boşluklar doldurulur (3 ya da 6 saatlik adımlı modeller çizgi olarak görünsün). */
export function modelSerileri(t: Tablo, degisken: string): ModelSerisi[] {
  const seriler: ModelSerisi[] = [];
  for (const m of KARSILASTIRMA_MODELLERI) {
    const v = t.sutun[`${degisken}_${m.kod}`];
    if (!v || !say(v)) continue;
    let deger: Deger[];
    if (degisken === "precipitation") {
      const son = v.reduce<number>((en, x, i) => (x != null ? i : en), -1);
      let toplam = 0;
      deger = v.map((x, i) => { toplam += x ?? 0; return i <= son ? toplam : null; });
    } else deger = araDeger(v, 6);
    seriler.push({ ...m, deger });
  }
  return seriler;
}

export interface ModelUyumu {
  /** Modeller arası fark (en yüksek − en düşük), en az üç modelin değeri olan saatlerde. */
  fark: { zaman: string[]; deger: number[] };
  durum: "uyumlu" | "bozuluyor" | "yetersiz";
  /** Açıklama; **kalın** işaretleri Markdown'dır. */
  metin: string;
}

/** Modeller ne kadar uyumlu? (app_pages/modeller.py) */
export function modelUyumu(zaman: readonly string[], seriler: readonly ModelSerisi[], birim: string, esik: readonly [number, number]): ModelUyumu {
  const fz: string[] = [], fd: number[] = [];
  zaman.forEach((z, i) => {
    const satir = seriler.map((s) => s.deger[i] ?? null);
    if (say(satir) >= 3) { fz.push(z); fd.push(enBuyuk(satir) - enKucuk(satir)); }
  });
  const fark = { zaman: fz, deger: fd };
  if (!fd.length) return { fark, durum: "yetersiz", metin: "Karşılaştırma için bu konumda en az üç modelin verisi gerekiyor." };
  const ilkAsim = fd.findIndex((x) => x > esik[0]);
  if (ilkAsim === -1) {
    return { fark, durum: "uyumlu", metin: `Tüm dönem boyunca modeller arasındaki fark ${esik[0]} ${birim}'in altında. Bu tahmine güvenebilirsin.` };
  }
  const saat = saatFarki(fz[ilkAsim]!, fz[0]!);
  const enBuyukFark = `en büyük fark ${pyBicim(enBuyuk(fd), 1)} ${birim} (${zamanYaz(fz[ilkEnBuyuk(fd)]!)})`;
  const metin = saat < 1
    ? `Modeller en baştan ayrışıyor: farklar şimdiden ${esik[0]} ${birim}'i aşıyor; ${enBuyukFark}.`
    : `İlk **${pyBicim(saat)} saat** modeller uyumlu. ${zamanYaz(fz[ilkAsim]!)} itibarıyla farklar ${esik[0]} ${birim}'i aşıyor; ${enBuyukFark}.`;
  return { fark, durum: "bozuluyor", metin };
}

/** Altı modelin aynı değişken için nokta tahmini (tek istek), şu andan başlayarak. */
export async function modelKarsilastirmasi(istemci: Istemci, k: Konum, degisken: string, gun: number, an: Date = new Date()): Promise<Tablo> {
  const { veri } = await istemci.getir(FC, { latitude: k.lat, longitude: k.lon, hourly: degisken,
                                             models: KARSILASTIRMA_MODELLERI.map((m) => m.kod).join(","), forecast_days: gun, timezone: k.tz });
  apiHatasiMi(veri);
  const js = nesneMi(veri) ? veri : {};
  return simdiden(tabloDogrula(js.hourly), simdikiSaat(typeof js.timezone === "string" ? js.timezone : k.tz, an));
}

export interface AnsamblOzeti {
  zaman: string[];
  p10: Deger[];
  ortanca: Deger[];
  p90: Deger[];
  uyeSayisi: number;
  /** "8 – 15 °C" */
  ortancaAraligi: string;
  /** "± 0.7 °C": ilk günün %10–%90 aralığının yarısı */
  ilkGun: string;
  sonGun: string;
  /** "2.9 kat": son günün belirsizliği ilk günün kaç katı */
  kat: string;
}

const gunlereBol = (zaman: readonly string[]) => {
  const gun: string[] = [], sira: number[][] = [];
  zaman.forEach((z, i) => { const g = z.slice(0, 10); if (gun[gun.length - 1] !== g) { gun.push(g); sira.push([]); } sira[sira.length - 1]!.push(i); });
  return { gun, sira };
};
const nan = (x: number): Deger => (Number.isNaN(x) ? null : x);

/** Spagetti grafiğinin bandı ve özet kartları (app_pages/ansambl.py, yağış dışındaki değişkenler). */
export function ansamblOzeti(u: Tablo, birim: string): AnsamblOzeti {
  const uyeler = Object.values(u.sutun);
  const satir = (i: number) => uyeler.map((v) => v[i] ?? null);
  const p10 = u.zaman.map((_, i) => ceyrek(satir(i), 0.1)), p90 = u.zaman.map((_, i) => ceyrek(satir(i), 0.9));
  const ortanca = u.zaman.map((_, i) => ceyrek(satir(i), 0.5));
  const genislik = p90.map((x, i) => nan(x - p10[i]!));
  const { sira } = gunlereBol(u.zaman);
  const bant = sira.map((s) => ortalama(s.map((i) => genislik[i]!)));
  const ilk = bant[0] ?? Number.NaN, son = bant[bant.length - 1] ?? Number.NaN;
  return {
    zaman: [...u.zaman], p10: p10.map(nan), ortanca: ortanca.map(nan), p90: p90.map(nan), uyeSayisi: uyeler.length,
    ortancaAraligi: `${pyBicim(enKucuk(ortanca.map(nan)))} – ${pyBicim(enBuyuk(ortanca.map(nan)))} ${birim}`,
    ilkGun: `± ${pyBicim(ilk / 2, 1)} ${birim}`, sonGun: `± ${pyBicim(son / 2, 1)} ${birim}`,
    kat: `${pyBicim(son / Math.max(ilk, 0.1), 1)} kat`,
  };
}

export interface YagisOlasiligi {
  gun: string[];
  /** Üyelerin yüzde kaçı o gün eşiği aşıyor (0–100). */
  olasilik: number[];
  /** Günlük toplamların üyeler arasındaki dağılımı. */
  dagilim: { enAz: number; q1: number; ortanca: number; q3: number; enCok: number }[];
  /** Açıklama; **kalın** işaretleri Markdown'dır. */
  metin: string;
}

/** Günlük yağışın eşiği aşma olasılığı (app_pages/ansambl.py, yağış). Veri olmayan üyeler/günler "yağış yok"
 * sayılmaz: olasılık yalnızca verisi olan üyeler üzerinden hesaplanır. */
export function yagisOlasiligi(u: Tablo, esik: number): YagisOlasiligi {
  const uyeler = Object.values(u.sutun);
  const { gun, sira } = gunlereBol(u.zaman);
  const sonuc: YagisOlasiligi = { gun: [], olasilik: [], dagilim: [], metin: "" };
  gun.forEach((g, k) => {
    // her üyenin o günkü toplamı; o gün hiç verisi olmayan üye sayılmaz (pandas sum(min_count=1))
    const toplamlar = uyeler.map((v) => { const d = sira[k]!.map((i) => v[i] ?? null); return say(d) ? topla(d) : null; });
    const dolu = toplamlar.filter((x): x is number => x != null);
    if (!dolu.length) return;
    sonuc.gun.push(g);
    sonuc.olasilik.push((dolu.filter((x) => x >= esik).length / dolu.length) * 100);
    sonuc.dagilim.push({ enAz: Math.min(...dolu), q1: ceyrek(dolu, 0.25), ortanca: ceyrek(dolu, 0.5), q3: ceyrek(dolu, 0.75), enCok: Math.max(...dolu) });
  });
  const en = ilkEnBuyuk(sonuc.olasilik);
  if (en !== -1) {
    const d = sonuc.dagilim[en]!;
    sonuc.metin = `En olası yağışlı gün **${gunYaz(sonuc.gun[en]!)}**: üyelerin %${pyBicim(sonuc.olasilik[en]!)}'i ${esik} mm üstü yağış veriyor. ` +
      `O gün ortanca tahmin ${pyBicim(d.ortanca, 1)} mm, en ıslak senaryo ${pyBicim(d.enCok)} mm.`;
  }
  return sonuc;
}
