/** Çizelgenin hesap kısmı: eksen aralığı ve çizgileri, yatay konumlar, eğri yolları, etiket seçimi.
 * Hiçbiri tarayıcıya ya da React'e bağlı değildir; `olcek.test.ts` ile sınanır. */
import type { Deger } from "../veri/tipler";

/** Aralığı yaklaşık `hedef` parçaya bölen "yuvarlak" adım: 1, 2 ya da 5'in onluk katı. */
export function guzelAdim(aralik: number, hedef: number): number {
  if (!(aralik > 0)) return 1;
  const ham = aralik / Math.max(hedef, 1), us = 10 ** Math.floor(Math.log10(ham)), k = ham / us;
  return (k <= 1 ? 1 : k <= 2 ? 2 : k <= 5 ? 5 : 10) * us;
}

export interface Eksen { alt: number; ust: number; cizgiler: number[]; adim: number }
export interface EksenSecenek {
  /** Eksenin sabit alt sınırı (ör. yağışta 0). */
  taban?: number;
  /** Eksenin sabit üst sınırı (ör. olasılıkta 100). */
  tavan?: number;
  /** Yaklaşık kaç aralık olsun. */
  hedef?: number;
  /** Elle verilen eksen çizgileri; verilirse `taban` ve `tavan` ile birlikte kullanılır. */
  cizgiler?: readonly number[];
}

const temiz = (x: number) => Number(x.toPrecision(12));

/** Değerleri kapsayan, yuvarlak sayılarda başlayıp biten eksen. Boş veride 0–1 döner. */
export function eksen(degerler: Iterable<Deger>, sec: EksenSecenek = {}): Eksen {
  let enAz = Infinity, enCok = -Infinity;
  for (const v of degerler) if (v != null && Number.isFinite(v)) { if (v < enAz) enAz = v; if (v > enCok) enCok = v; }
  if (enAz === Infinity) { enAz = sec.taban ?? 0; enCok = sec.tavan ?? enAz + 1; }
  if (sec.taban != null) enAz = sec.taban;
  if (sec.tavan != null) enCok = sec.tavan;
  if (enCok <= enAz) enCok = enAz + 1;
  if (sec.cizgiler?.length) {
    const c = [...sec.cizgiler];
    return { alt: Math.min(enAz, c[0]!), ust: Math.max(enCok, c[c.length - 1]!), cizgiler: c, adim: c.length > 1 ? c[1]! - c[0]! : 1 };
  }
  const adim = guzelAdim(enCok - enAz, sec.hedef ?? 3);
  const alt = sec.taban ?? temiz(Math.floor(enAz / adim + 1e-9) * adim);
  let ust = sec.tavan ?? temiz(Math.ceil(enCok / adim - 1e-9) * adim);
  if (ust <= alt) ust = temiz(alt + adim);
  const cizgiler: number[] = [];
  for (let v = alt; v <= ust + adim * 1e-6; v = temiz(v + adim)) cizgiler.push(v);
  return { alt, ust, cizgiler, adim };
}

/** Eksen yazısı: adım tam sayıysa tam sayı, değilse adımın ondalık hanesi kadar; ondalık ayırıcı virgül. */
export function eksenYazisi(v: number, adim: number): string {
  const hane = adim >= 1 ? 0 : Math.min(3, Math.ceil(-Math.log10(adim) - 1e-9));
  return v.toFixed(hane).replace(".", ",").replace("-", "−");
}

/** `i`. değerin yatay konumu. Bantlı düzende her değer kendi şeridinin ortasındadır (çubuklar için);
 * bantsız düzende ilk değer sol, son değer sağ kenardadır. */
export function xKonum(i: number, n: number, sol: number, genislik: number, bant: boolean): number {
  if (bant) return sol + ((i + 0.5) * genislik) / Math.max(n, 1);
  return n <= 1 ? sol + genislik / 2 : sol + (i * genislik) / (n - 1);
}

/** Yatay piksel konumuna en yakın değerin sırası. */
export function enYakinSira(px: number, n: number, sol: number, genislik: number, bant: boolean): number {
  if (n <= 1 || genislik <= 0) return 0;
  const oran = (px - sol) / genislik;
  const i = bant ? Math.floor(oran * n) : Math.round(oran * (n - 1));
  return Math.min(Math.max(i, 0), n - 1);
}

export type Nokta = readonly [number, number];

/** Eksik değerlerde kırılan, ardışık noktalardan oluşan parçalar. */
export function parcalar(deger: readonly Deger[], x: (i: number) => number, y: (v: number) => number): Nokta[][] {
  const hepsi: Nokta[][] = [];
  let p: Nokta[] = [];
  deger.forEach((v, i) => {
    if (v == null || !Number.isFinite(v)) { if (p.length) hepsi.push(p); p = []; }
    else p.push([x(i), y(v)]);
  });
  if (p.length) hepsi.push(p);
  return hepsi;
}

const s = (v: number) => (Math.round(v * 10) / 10).toString();

/** Noktaları düz çizgilerle birleştiren yol. */
export function duzYol(p: readonly Nokta[]): string {
  return p.map(([x, y], i) => `${i ? "L" : "M"}${s(x)} ${s(y)}`).join("");
}

/** Tekdüze (monoton) kübik eğrinin her noktadaki eğimi (Fritsch–Carlson). Eğri iki nokta arasında o iki değerin
 * dışına taşmaz: sıcaklık eğrisi ölçülmemiş bir tepe ya da çukur uydurmaz. */
export function egimler(p: readonly Nokta[]): number[] {
  const n = p.length, d: number[] = [], m: number[] = new Array<number>(n).fill(0);
  for (let i = 0; i < n - 1; i++) d.push((p[i + 1]![1] - p[i]![1]) / (p[i + 1]![0] - p[i]![0] || 1));
  if (n < 2) return m;
  m[0] = d[0]!; m[n - 1] = d[n - 2]!;
  for (let i = 1; i < n - 1; i++) m[i] = d[i - 1]! * d[i]! <= 0 ? 0 : (d[i - 1]! + d[i]!) / 2;
  for (let i = 0; i < n - 1; i++) {
    if (d[i] === 0) { m[i] = 0; m[i + 1] = 0; continue; }
    const a = m[i]! / d[i]!, b = m[i + 1]! / d[i]!, kare = a * a + b * b;
    if (kare > 9) { const t = 3 / Math.sqrt(kare); m[i] = t * a * d[i]!; m[i + 1] = t * b * d[i]!; }
  }
  return m;
}

/** Noktalardan geçen yumuşak (tekdüze kübik) yol. `devam` verilirse yol "M" yerine "L" ile başlar. */
export function yumusakYol(p: readonly Nokta[], devam = false): string {
  if (p.length < 3) return devam ? p.map(([x, y]) => `L${s(x)} ${s(y)}`).join("") : duzYol(p);
  const m = egimler(p);
  let yol = `${devam ? "L" : "M"}${s(p[0]![0])} ${s(p[0]![1])}`;
  for (let i = 0; i < p.length - 1; i++) {
    const [x0, y0] = p[i]!, [x1, y1] = p[i + 1]!, dx = (x1 - x0) / 3;
    yol += `C${s(x0 + dx)} ${s(y0 + m[i]! * dx)} ${s(x1 - dx)} ${s(y1 - m[i + 1]! * dx)} ${s(x1)} ${s(y1)}`;
  }
  return yol;
}

/** Çizginin altını tabana kadar dolduran kapalı yol. */
export function alanYolu(p: readonly Nokta[], taban: number, yumusak: boolean): string {
  if (!p.length) return "";
  return `${yumusak ? yumusakYol(p) : duzYol(p)}L${s(p[p.length - 1]![0])} ${s(taban)}L${s(p[0]![0])} ${s(taban)}Z`;
}

/** Alt ve üst sınır arasındaki bandın kapalı yolu (ör. ansamblın %10–%90 aralığı). */
export function bantYolu(ust: readonly Nokta[], alt: readonly Nokta[]): string {
  if (!ust.length || !alt.length) return "";
  return `${duzYol(ust)}${[...alt].reverse().map(([x, y]) => `L${s(x)} ${s(y)}`).join("")}Z`;
}

export interface EtiketAdayi { sira: number; x: number; genislik: number; oncelik: boolean }

/** Üst üste binmeyecek etiketleri seçer: önce öncelikliler (gün başları), sonra araya sığanlar.
 * Seçilen sıraları artan düzende döndürür. */
export function etiketSec(adaylar: readonly EtiketAdayi[], bosluk = 6): number[] {
  const secilen: EtiketAdayi[] = [];
  const sigar = (a: EtiketAdayi) => secilen.every((b) => Math.abs(a.x - b.x) >= (a.genislik + b.genislik) / 2 + bosluk);
  for (const tur of [true, false]) for (const a of adaylar) if (a.oncelik === tur && sigar(a)) secilen.push(a);
  return secilen.map((a) => a.sira).sort((a, b) => a - b);
}

/** Ardışık `true` değerlerini [başlangıç, bitiş] sıra aralıklarına çevirir (ör. gölgelenecek gece saatleri). */
export function araliklar(isaret: readonly boolean[]): [number, number][] {
  const a: [number, number][] = [];
  isaret.forEach((v, i) => {
    if (!v) return;
    const son = a[a.length - 1];
    if (son && son[1] === i - 1) son[1] = i; else a.push([i, i]);
  });
  return a;
}

/** İki renk arasında doğrusal geçiş (#RRGGBB); `t` 0–1. */
export function renkAra(a: string, b: string, t: number): string {
  const k = Math.min(Math.max(t, 0), 1), parca = (r: string, i: number) => parseInt(r.slice(1 + i * 2, 3 + i * 2), 16);
  return `#${[0, 1, 2].map((i) => Math.round(parca(a, i) + (parca(b, i) - parca(a, i)) * k).toString(16).padStart(2, "0")).join("")}`;
}

/** Ayrışan renk ölçeği: sıfırda nötr orta renk, eksi uçta `soguk`, artı uçta `sicak`. `sinir` iki ucun mutlak değeri. */
export function sapmaRengi(v: number, sinir: number, soguk: string, orta: string, sicak: string): string {
  const t = sinir > 0 ? Math.min(Math.abs(v) / sinir, 1) : 0;
  return renkAra(orta, v < 0 ? soguk : sicak, t);
}

/** Verinin ortasına yerleşen, en az `enAz` genişliğinde taban–tavan; `enAz` yoksa ya da veri zaten genişse eksen kendiliğinden seçilir. */
export function eksenAraligi(deger: readonly (number | null)[], enAz?: number): { taban?: number; tavan?: number } {
  const v = deger.filter((x): x is number => x != null && Number.isFinite(x));
  if (!enAz || !v.length) return {};
  const alt = Math.min(...v), ust = Math.max(...v);
  if (ust - alt >= enAz) return {};
  const orta = (alt + ust) / 2;
  return { taban: Math.floor(orta - enAz / 2), tavan: Math.ceil(orta + enAz / 2) };
}
