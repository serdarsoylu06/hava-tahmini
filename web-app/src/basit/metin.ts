/** Basit modun düz dille yazılmış metinleri ve küçük sınıflandırmaları. Bento sayfasındaki (web/hava-bento.html)
 * Sade modun karşılığıdır; eşikler oradakiyle aynıdır. Teknik terim kullanılmaz. */
import { yonAdi } from "../ortak/cografya";
import { GUNLER, haftaGunu } from "../ortak/zaman";
import type { Anlik, Deger, Tablo } from "../veri/tipler";

export type HavaTuru = "acik" | "bulutlu" | "sis" | "yagmur" | "kar" | "firtina";
export type GunEvresi = "gece" | "dogus" | "ogle" | "batim";
export type GunTuru = "acik" | "parcali" | "bulutlu" | "sis" | "hafif" | "yagmur" | "kar" | "firtina";

const KAR_KOD = [71, 73, 75, 77, 85, 86];

/** Manzaradaki hava canlandırması için kaba tür. */
export function havaTuru(kod: Deger): HavaTuru {
  if (kod == null) return "acik";
  if (kod >= 95) return "firtina";
  if (KAR_KOD.includes(kod)) return "kar";
  if (kod >= 51) return "yagmur";
  if (kod === 45 || kod === 48) return "sis";
  if (kod === 3) return "bulutlu";
  return "acik";
}

const dakika = (t: string) => Number(t.slice(11, 13)) * 60 + Number(t.slice(14, 16));

/** Günün evresi: gün doğumundan sonraki ve gün batımından önceki 90 dakika ayrı renklenir. */
export function gunEvresi(simdi: string, dogus: string | null, batis: string | null): GunEvresi {
  if (!dogus || !batis) return "ogle";
  const sm = dakika(simdi), dg = dakika(dogus), bt = dakika(batis);
  if (sm < dg || sm >= bt) return "gece";
  if (sm < dg + 90) return "dogus";
  if (sm >= bt - 90) return "batim";
  return "ogle";
}

/** 10 günlük kartlardaki dairenin türü. */
export function gunTuru(kod: Deger): GunTuru {
  if (kod == null || kod <= 1) return "acik";
  if (kod === 2) return "parcali";
  if (kod === 3) return "bulutlu";
  if (kod === 45 || kod === 48) return "sis";
  if ([51, 53, 55, 56, 57].includes(kod)) return "hafif";
  return havaTuru(kod) as GunTuru;
}

export const DAIRE: Readonly<Record<GunTuru, string>> = {
  acik: "#F1D24E", parcali: "#C6E066", bulutlu: "#AEC0B6", sis: "#AEC0B6", yagmur: "#5E9A6A", hafif: "#8CBF5A",
  kar: "#DCE8F0", firtina: "#5E9A6A",
};

export function ruzgarAdi(w: number): string {
  return w < 6 ? "Sakin" : w < 20 ? "Hafif esinti" : w < 39 ? "Orta rüzgâr" : w < 50 ? "Kuvvetli rüzgâr" : w < 75 ? "Sert rüzgâr" : "Fırtına";
}

/** Bir saatin Basit modda kullanılan değerleri. Eksik ölçüm null kalır; yağış olasılığı yoksa 0 sayılmaz, null'dur. */
export interface Saat {
  zaman: string;
  sicaklik: Deger;
  hissedilen: Deger;
  ciy: Deger;
  olasilik: Deger;
  ruzgar: Deger;
  hamle: Deger;
  basinc: Deger;
  kod: Deger;
  gece: boolean;
}

/** Tablonun `bas` sırasından başlayan `adet` saati. */
export function saatler(t: Tablo, bas: number, adet: number): Saat[] {
  const s = (ad: string, i: number): Deger => t.sutun[ad]?.[i] ?? null;
  const sonuc: Saat[] = [];
  for (let i = Math.max(bas, 0); i < Math.min(bas + adet, t.zaman.length); i++) {
    sonuc.push({ zaman: t.zaman[i]!, sicaklik: s("temperature_2m", i), hissedilen: s("apparent_temperature", i), ciy: s("dew_point_2m", i),
                 olasilik: s("precipitation_probability", i), ruzgar: s("wind_speed_10m", i), hamle: s("wind_gusts_10m", i),
                 basinc: s("pressure_msl", i), kod: s("weather_code", i), gece: s("is_day", i) === 0 });
  }
  return sonuc;
}

const enBuyuk = (v: readonly Deger[]) => v.reduce<number | null>((m, x) => (x != null && (m === null || x > m) ? x : m), null);
const gunSaat = (z: string) => `${GUNLER[haftaGunu(z)]} ${z.slice(11, 16)}`;
const yuv = (x: number) => Math.round(x);

/** Manzara kartındaki bir-iki cümlelik özet: yağış, gece sıcaklığı, sis ve sert rüzgâr (en çok üç cümle). */
export function ozetCumle(s: readonly Saat[]): string {
  const c: string[] = [];
  const yag = s.findIndex((x) => (x.olasilik ?? 0) >= 50);
  if (yag < 0) {
    const pMax = enBuyuk(s.slice(0, 12).map((x) => x.olasilik)), tMax = enBuyuk(s.slice(0, 12).map((x) => x.sicaklik));
    c.push(`Önümüzdeki saatler ${(pMax ?? 0) < 20 ? "kuru" : "yer yer yağış olasılıklı"}${tMax === null ? "" : `; en yüksek ${yuv(tMax)}°`}.`);
  } else {
    c.push(`${gunSaat(s[yag]!.zaman)} civarında yağış olasılığı %${yuv(enBuyuk(s.map((x) => x.olasilik))!)}’e çıkıyor.`);
  }
  const ilkGece = s.findIndex((x) => x.gece);
  let enSoguk: Saat | null = null;
  for (let i = ilkGece; i >= 0 && i < s.length && s[i]!.gece; i++) {
    const x = s[i]!;
    if (x.sicaklik != null && (enSoguk === null || x.sicaklik < enSoguk.sicaklik!)) enSoguk = x;
  }
  if (enSoguk) c.push(`Gece sıcaklık ${yuv(enSoguk.sicaklik!)}°’ye iniyor (${gunSaat(enSoguk.zaman)}).`);
  const sis = s.find((x) => x.kod === 45 || x.kod === 48 ||
    (x.sicaklik != null && x.ciy != null && x.ruzgar != null && x.sicaklik - x.ciy <= 1 && x.ruzgar < 6));
  if (sis) c.push(`${gunSaat(sis.zaman)}’ten itibaren sis olabilir.`);
  const sert = s.find((x) => (x.hamle ?? 0) >= 40);
  if (sert && c.length < 3) c.push(`${gunSaat(sert.zaman)}’ten sonra rüzgâr sertleşiyor (hamle ${yuv(enBuyuk(s.map((x) => x.hamle))!)} km/s).`);
  return c.slice(0, 3).join(" ");
}

/** Giyim ve şemsiye önerisi. */
export function oneri(a: Anlik, s: readonly Saat[]): string {
  const d = a.deger, p: string[] = [];
  const pMax = enBuyuk(s.slice(0, 12).map((x) => x.olasilik)) ?? 0, his = d.apparent_temperature;
  if (d.weather_code != null && KAR_KOD.includes(d.weather_code)) p.push("kar yağıyor; kaymayan ayakkabı giy");
  else if (pMax >= 50) p.push("şemsiye al");
  if (his != null) {
    p.push(his < 5 ? "kalın mont gerekir" : his < 12 ? "mont ya da kalın ceket iyi olur" : his < 19 ? "ince bir ceket yeter"
      : his >= 28 ? "hafif giyin, yanına su al" : "hava giyim açısından rahat");
  }
  if (d.is_day === 1 && (d.uv_index ?? 0) >= 6) p.push("güneş kremi sür");
  if ((d.wind_gusts_10m ?? 0) >= 50) p.push("rüzgâr sert, açık alanda dikkat");
  if (!p.length) return "";
  const m = p.join("; ");
  return `${m.charAt(0).toLocaleUpperCase("tr")}${m.slice(1)}.`;
}

/** Bir göstergenin ekranda ve ekran okuyucuda görünen hâli. */
export interface Gosterge {
  ad: string;
  aciklama: string;
  /** Göstergenin ortasındaki kısa değer. */
  deger: string;
  /** Ekran okuyucu için tam cümle. */
  sesli: string;
  tur: "halka" | "yarim";
  /** 0–1 */
  oran: number;
  renk: string;
}

const yaz = (x: Deger | undefined) => (x == null ? "—" : String(yuv(x)));

/** Basit modun dört göstergesi: yağış, rüzgâr, nem, basınç. `s`: şu andan başlayan saatler,
 * `basinc3SaatOnce`: üç saat önceki basınç (eğilim için). */
export function gostergeler(a: Anlik, s: readonly Saat[], basinc3SaatOnce: Deger): Gosterge[] {
  const d = a.deger;
  const pMax = enBuyuk(s.map((x) => x.olasilik)), pSaat = s.find((x) => x.olasilik === pMax);
  const w = d.wind_speed_10m, nem = d.relative_humidity_2m, basinc = d.pressure_msl;
  const fark = d.temperature_2m != null && d.dew_point_2m != null ? d.temperature_2m - d.dew_point_2m : null;
  const egilim = basinc != null && basinc3SaatOnce != null ? basinc - basinc3SaatOnce : null;
  return [
    { ad: "Yağış", tur: "halka", renk: "#8FC1E8", oran: (pMax ?? 0) / 100, deger: pMax === null ? "—" : `%${yuv(pMax)}`,
      aciklama: pMax === null ? "Yağış olasılığı verisi yok" : pMax < 20 ? "Önümüzdeki 24 saat kuru görünüyor"
        : `En yüksek olasılık saat ${pSaat!.zaman.slice(11, 16)} civarında`,
      sesli: pMax === null ? "Yağış olasılığı bilinmiyor" : `Önümüzdeki 24 saatte yağış olasılığı en çok yüzde ${yuv(pMax)}` },
    { ad: "Rüzgâr", tur: "yarim", renk: "#F1D24E", oran: (w ?? 0) / 60, deger: yaz(w),
      aciklama: w == null ? "Rüzgâr verisi yok" : `km/s · ${ruzgarAdi(w)}${d.wind_direction_10m == null ? "" : `, ${yonAdi(d.wind_direction_10m)} yönünden`}`,
      sesli: w == null ? "Rüzgâr bilinmiyor" : `Rüzgâr saatte ${yuv(w)} kilometre` },
    { ad: "Nem", tur: "halka", renk: "#C6E066", oran: (nem ?? 0) / 100, deger: nem == null ? "—" : `%${yuv(nem)}`,
      aciklama: nem == null ? "Nem verisi yok" : fark !== null && fark <= 2 ? "Hava çok nemli; sis olabilir" : nem >= 70 ? "Nemli" : nem <= 35 ? "Kuru" : "Rahat",
      sesli: nem == null ? "Nem bilinmiyor" : `Nem yüzde ${yuv(nem)}` },
    { ad: "Basınç", tur: "yarim", renk: "#8CBF5A", oran: basinc == null ? 0 : (basinc - 980) / 60, deger: yaz(basinc),
      aciklama: basinc == null ? "Basınç verisi yok" : egilim === null ? "hPa"
        : `hPa · ${egilim <= -1 ? "düşüyor, hava bozabilir" : egilim >= 1 ? "yükseliyor, hava açabilir" : "durağan"}`,
      sesli: basinc == null ? "Basınç bilinmiyor" : `Basınç ${yuv(basinc)} hektopaskal` },
  ];
}
