/** Eksik değerli (null) sayı dizileri için pandas'la aynı davranan özetler.
 *
 * pandas'ta min/max/sum/mean/quantile eksikleri atlar; hiç değer yoksa sonuç NaN'dır ve NaN ile yapılan her
 * karşılaştırma yanlıştır. Buradaki işlevler aynı kuralı izler, böylece Python'daki `if T.min() <= 0:` gibi
 * koşullar birebir taşınabilir. */
import type { Deger } from "../veri/tipler";

export type Dizi = readonly Deger[];

export function enKucuk(v: Dizi): number {
  let m = Number.NaN;
  for (const x of v) if (x != null && !(x >= m)) m = x;
  return m;
}

export function enBuyuk(v: Dizi): number {
  let m = Number.NaN;
  for (const x of v) if (x != null && !(x <= m)) m = x;
  return m;
}

/** En küçük değerin İLK geçtiği sıra (pandas idxmin); hiç değer yoksa -1. */
export function ilkEnKucuk(v: Dizi): number {
  let i = -1, m = Infinity;
  v.forEach((x, k) => { if (x != null && (i === -1 || x < m)) { m = x; i = k; } });
  return i;
}

/** En büyük değerin İLK geçtiği sıra (pandas idxmax); hiç değer yoksa -1. */
export function ilkEnBuyuk(v: Dizi): number {
  let i = -1, m = -Infinity;
  v.forEach((x, k) => { if (x != null && (i === -1 || x > m)) { m = x; i = k; } });
  return i;
}

/** Eksikler atlanarak toplam; hiç değer yoksa 0 (pandas sum). */
export function topla(v: Dizi): number {
  let s = 0;
  for (const x of v) if (x != null) s += x;
  return s;
}

export function say(v: Dizi): number {
  let n = 0;
  for (const x of v) if (x != null) n++;
  return n;
}

/** Eksikler atlanarak ortalama; hiç değer yoksa NaN. */
export function ortalama(v: Dizi): number {
  const n = say(v);
  return n ? topla(v) / n : Number.NaN;
}

/** Doğrusal ara değerli yüzdelik (numpy/pandas'ın varsayılanı); eksikler atlanır, hiç değer yoksa NaN. */
export function ceyrek(v: Dizi, q: number): number {
  const s = v.filter((x): x is number => x != null).sort((a, b) => a - b);
  if (!s.length) return Number.NaN;
  const yer = (s.length - 1) * q, alt = Math.floor(yer), ust = Math.ceil(yer);
  return s[alt]! + (s[ust]! - s[alt]!) * (yer - alt);
}

/** Koşulu sağlayan yerler; eksik değer hiçbir koşulu sağlamaz (pandas'ta NaN karşılaştırması gibi). */
export function maske(v: Dizi, kosul: (x: number) => boolean): boolean[] {
  return v.map((x) => x != null && kosul(x));
}

/** numpy'nin `np.round(x, n)` işlevi: 10ⁿ ile çarpıp en yakın ÇİFT tamsayıya yuvarlar, sonra böler. */
export function npYuvarla(x: number, n = 0): number {
  const olcek = 10 ** n, y = x * olcek, taban = Math.floor(y), fark = y - taban;
  const yuvarlak = fark < 0.5 ? taban : fark > 0.5 ? taban + 1 : taban % 2 === 0 ? taban : taban + 1;
  return yuvarlak / olcek;
}
