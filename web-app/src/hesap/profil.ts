/** Atmosfer profili (skew-T) hesapları: yükselen hava parseli, bulut tabanı (LCL), CAPE/CIN, yağışa dönüşebilir su.
 *
 * Streamlit sürümü bunları MetPy 1.7.1 ile hesaplar (hava/skewt.py). Buradaki işlevler MetPy'nin aynı adlı
 * işlevlerinin birebir karşılığıdır: aynı sabitler, aynı formüller, aynı adım sırası (köşeli parantez içinde
 * MetPy'deki ad yazar). Tek fark nemli adyabatın sayısal çözümüdür: MetPy uyarlamalı LSODA kullanır, burada sabit
 * 0,5 hPa adımlı dördüncü derece Runge–Kutta kullanılır. İki çözüm arasındaki fark `profil.test.ts` içinde MetPy
 * çıktılarıyla ölçülür (parsel sıcaklığında 0,001 °C'nin altında). */
import type { Deger } from "../veri/tipler";
import { SEVIYELER } from "../veri/openMeteo";

// MetPy 1.7.1 sabitleri (metpy.constants.nounit), SI birimleriyle
const RD = 287.04749097718457, RV = 461.52311572606084, CP_D = 1004.6662184201462, CP_V = 1860.078011865639, CP_L = 4219.400000000001;
const LV = 2500840, T0 = 273.16, ES0 = 611.2, SIFIR = 273.15, EPS = 0.6219569100577033, KAPPA = 0.28571428571428564;
const G = 9.80665, RHO_SU = 999.97495;
const KNOT = 1.852;

const yakin = (a: number, b: number) => Math.abs(a - b) <= 1e-8 + 1e-5 * Math.abs(b);          // numpy.isclose
const buyukYaDaYakin = (a: number, b: number) => a > b || yakin(a, b);
const kucukYaDaYakin = (a: number, b: number) => a < b || yakin(a, b);

/** Su üzerinde doyma buhar basıncı (Pa); sıcaklık K. [saturation_vapor_pressure, phase="liquid"; Ambaum 2020] */
export function doymaBuharBasinci(T: number): number {
  const gizliIsi = LV - (CP_L - CP_V) * (T - T0);
  return ES0 * (T0 / T) ** ((CP_L - CP_V) / RV) * Math.exp((LV / T0 - gizliIsi / T) / RV);
}

/** Buhar basıncından (Pa) çiy noktası (K). [dewpoint; Bolton 1980] */
export function ciyNoktasi(e: number): number {
  const v = Math.log(e / ES0);
  return SIFIR + (243.5 * v) / (17.67 - v);
}

/** Doyma karışım oranı (kg/kg); basınç Pa, sıcaklık K. Buhar basıncı toplam basıncı aşarsa tanımsızdır (NaN).
 * [saturation_mixing_ratio] */
export function doymaKarisimOrani(p: number, T: number): number {
  const es = doymaBuharBasinci(T);
  return es >= p ? NaN : (EPS * es) / (p - es);
}

/** Lambert W işlevinin −1 dalı, x ∈ [−1/e, 0). Halley yinelemesi. */
export function lambertWm1(x: number): number {
  if (!(x < 0) || x < -1 / Math.E) return NaN;
  const l = Math.log(-x);
  let w = x > -0.25 ? l - Math.log(-l) : -1 - Math.sqrt(2 * (1 + Math.E * x));
  for (let i = 0; i < 60; i++) {
    const ew = Math.exp(w), f = w * ew - x;
    const adim = f / (ew * (w + 1) - ((w + 2) * f) / (2 * w + 2));
    w -= adim;
    if (Math.abs(adim) <= 1e-15 * Math.abs(w)) break;
  }
  return w;
}

/** Yükselen havanın yoğuşmaya başladığı seviye: [basınç, sıcaklık]. Basınç hangi birimle verilirse o birimle
 * döner; sıcaklıklar K; `pPa` aynı basıncın Pa karşılığıdır (özgül nem için). [lcl; Romps 2017] */
function lclHam(p: number, pPa: number, T: number, Td: number): [number, number] {
  const r = doymaKarisimOrani(pPa, Td), q = r / (1 + r);
  const isiOrani = (CP_D + q * (CP_V - CP_D)) / (RD + q * (RV - RD));
  const fark = CP_L - CP_V;
  const a = isiOrani + fark / RV, c = -(LV + fark * T0) / (RV * T) / a;
  const bagilNem = doymaBuharBasinci(Td) / doymaBuharBasinci(T);
  const tLcl = (c / lambertWm1(bagilNem ** (1 / a) * c * Math.exp(c))) * T;
  return [p * (tLcl / T) ** isiOrani, tLcl];
}

/** Bulut tabanı (LCL): basınç hPa, sıcaklık °C. Girdiler hPa ve °C. */
export function lcl(p: number, T: number, Td: number): { p: number; T: number } {
  const [pl, tl] = lclHam(p, p * 100, T + SIFIR, Td + SIFIR);
  return { p: pl, T: tl - SIFIR };
}

/** Nemli (doymuş) adyabat boyunca sıcaklığın basınca göre türevi (K/Pa). [moist_lapse → dt] */
function nemliEgim(p: number, T: number): number {
  const rs = doymaKarisimOrani(p, T);
  return (RD * T + LV * rs) / (CP_D + (LV * LV * rs * EPS) / (RD * T * T)) / p;
}

/** Doymuş bir parselin, `pBas` basıncında `TBas` sıcaklığından başlayıp `hedefler` basınçlarına taşındığındaki
 * sıcaklığı. Basınçlar hPa, sıcaklıklar K; hedefler başlangıçtan uzaklaşan sırada olmalıdır. [moist_lapse] */
export function nemliAdyabat(pBas: number, TBas: number, hedefler: readonly number[]): number[] {
  const ADIM = 50;                                                              // Pa (0,5 hPa)
  let p = pBas * 100, T = TBas;
  return hedefler.map((hedef) => {
    const son = hedef * 100, n = Math.max(1, Math.ceil(Math.abs(son - p) / ADIM)), h = (son - p) / n;
    for (let i = 0; i < n; i++) {
      const k1 = nemliEgim(p, T), k2 = nemliEgim(p + h / 2, T + (h / 2) * k1), k3 = nemliEgim(p + h / 2, T + (h / 2) * k2), k4 = nemliEgim(p + h, T + h * k3);
      T += (h / 6) * (k1 + 2 * k2 + 2 * k3 + k4);
      p += h;
    }
    return T;
  });
}

/** Kuru adyabat: `pBas`taki `TBas` sıcaklığının (K) `p` basıncındaki karşılığı. [dry_lapse] */
export const kuruAdyabat = (p: number, TBas: number, pBas: number) => TBas * (p / pBas) ** KAPPA;

/** Yerden yükseltilen parselin her basınç seviyesindeki sıcaklığı (°C). `p` hPa, yerden yukarı (azalan);
 * `T0c`, `Td0c` yerdeki sıcaklık ve çiy noktası (°C). LCL'ye kadar kuru, üstünde nemli adyabat. [parcel_profile] */
export function parselProfili(p: readonly number[], T0c: number, Td0c: number): number[] {
  const Tk = T0c + SIFIR, p0 = p[0]!;
  const [pLcl] = lclHam(p0, p0 * 100, Tk, Td0c + SIFIR);
  const alt = p.filter((x) => x >= pLcl), ust = p.filter((x) => x < pLcl);
  const kuru = alt.map((x) => kuruAdyabat(x, Tk, p0));
  if (buyukYaDaYakin(Math.min(...p), pLcl) || !ust.length) return kuru.map((x) => x - SIFIR);
  // nemli adyabat, kuru adyabatın LCL basıncındaki sıcaklığından başlar (MetPy'deki gibi)
  return [...kuru, ...nemliAdyabat(pLcl, kuruAdyabat(pLcl, Tk, p0), ust)].map((x) => x - SIFIR);
}

type Yon = "artan" | "azalan" | "hepsi";

/** İki eğrinin (a ve b) kesiştiği noktalar: [x, y] çiftleri. `logX`: ara değer x'in logaritmasında bulunur.
 * `artan`: a, b'nin altından üstüne geçiyor. [find_intersections] */
export function kesisimler(x: readonly number[], a: readonly number[], b: readonly number[], yon: Yon, logX: boolean): [number, number][] {
  const xs = logX ? x.map(Math.log) : x;
  const ham: { x: number; y: number; isaret: number }[] = [];
  for (let i = 0; i + 1 < a.length; i++) {
    const d0 = a[i]! - b[i]!, d1 = a[i + 1]! - b[i + 1]!;
    if (Math.sign(d0) === Math.sign(d1)) continue;
    const kx = (d1 * xs[i]! - d0 * xs[i + 1]!) / (d1 - d0);
    const ky = ((kx - xs[i]!) / (xs[i + 1]! - xs[i]!)) * (a[i + 1]! - a[i]!) + a[i]!;
    ham.push({ x: logX ? Math.exp(kx) : kx, y: ky, isaret: Math.sign(d1) });
  }
  // aynı noktayı iki kez veren ardışık kesişimlerden (eğri tam sıfıra değdiğinde) sonuncusu kalır
  return ham.filter((k, i) => (i === ham.length - 1 ? true : ham[i + 1]!.x - k.x !== 0))
    .filter((k) => yon === "hepsi" || (yon === "artan" ? k.isaret > 0 : k.isaret < 0))
    .map((k) => [k.x, k.y]);
}

const sanal = (T: number, r: number) => (T * (r + EPS)) / (EPS * (1 + r));       // [virtual_temperature]

/** Serbest konveksiyon seviyesinin basıncı (hPa); yoksa NaN. [lfc, which="bottom"] */
function lfcBasinci(p: readonly number[], Tv: readonly number[], parsel: readonly number[], Td0: number): number {
  const kes = yakin(parsel[0]!, Tv[0]!) ? kesisimler(p.slice(1), parsel.slice(1), Tv.slice(1), "artan", true) : kesisimler(p, parsel, Tv, "artan", true);
  const [pLcl] = lclHam(p[0]!, p[0]! * 100, parsel[0]!, Td0);
  if (!kes.length) {
    const ustunde = p.map((_, i) => i).filter((i) => p[i]! < pLcl);
    return ustunde.every((i) => kucukYaDaYakin(parsel[i]!, Tv[i]!)) ? NaN : pLcl;
  }
  const altinda = kes.filter(([x]) => x < pLcl);
  if (!altinda.length) {
    const el = kesisimler(p.slice(1), parsel.slice(1), Tv.slice(1), "azalan", true);
    return el.length && Math.min(...el.map(([x]) => x)) > pLcl ? NaN : pLcl;
  }
  return altinda[0]![0];
}

/** Denge seviyesinin basıncı (hPa); yoksa NaN. [el, which="top"] */
function elBasinci(p: readonly number[], Tv: readonly number[], parsel: readonly number[], Td0: number): number {
  const son = p.length - 1;
  if (parsel[son]! > Tv[son]!) return NaN;
  const kes = kesisimler(p.slice(1), parsel.slice(1), Tv.slice(1), "azalan", true);
  const [pLcl] = lclHam(p[0]!, p[0]! * 100, Tv[0]!, Td0);
  if (!kes.length || !(kes[kes.length - 1]![0] < pLcl)) return NaN;
  const ustunde = kes.filter(([x]) => x < pLcl);
  return ustunde[ustunde.length - 1]![0];
}

const yamuk = (y: readonly number[], x: readonly number[]) => y.slice(1).reduce((t, yi, i) => t + ((yi + y[i]!) / 2) * (x[i + 1]! - x[i]!), 0);

/** Yüzey parseli için CAPE ve CIN (J/kg). `p` hPa (azalan), sıcaklıklar °C; `parsel`: `parselProfili` çıktısı.
 * Sanal sıcaklık düzeltmesi uygulanır. Serbest konveksiyon seviyesi yoksa ikisi de 0. [cape_cin] */
export function capeCin(p: readonly number[], T: readonly number[], Td: readonly number[], parsel: readonly number[]): { cape: number; cin: number } {
  const Tk = T.map((x) => x + SIFIR), Tdk = Td.map((x) => x + SIFIR), Pk = parsel.map((x) => x + SIFIR);
  const [pLcl] = lclHam(p[0]!, p[0]! * 100, Tk[0]!, Tdk[0]!);
  const r0 = doymaKarisimOrani(p[0]! * 100, Tdk[0]!);
  const cevre = Tk.map((t, i) => sanal(t, doymaKarisimOrani(p[i]! * 100, Tdk[i]!)));
  const yukselen = Pk.map((t, i) => sanal(t, p[i]! > pLcl ? r0 : doymaKarisimOrani(p[i]! * 100, t)));
  const lfc = lfcBasinci(p, cevre, yukselen, Tdk[0]!);
  if (Number.isNaN(lfc)) return { cape: 0, cin: 0 };
  const elHam = elBasinci(p, cevre, yukselen, Tdk[0]!), el = Number.isNaN(elHam) ? p[p.length - 1]! : elHam;

  // parsel − çevre farkı; sıfır geçişleri eklenir ve basınca göre artan sıraya konur [_find_append_zero_crossings]
  const fark = yukselen.map((t, i) => t - cevre[i]!);
  const gecis = kesisimler(p.slice(1), fark.slice(1), fark.slice(1).map(() => 0), "hepsi", true);
  const nokta = [...p.map((x, i) => [x, fark[i]!] as [number, number]), ...gecis].sort((m, n) => m[0] - n[0]);
  const tek = nokta.filter((n, i) => (i === nokta.length - 1 ? true : nokta[i + 1]![0] - n[0] > 1e-6));
  const alan = (kosul: (x: number) => boolean) => { const s = tek.filter(([x]) => kosul(x)); return RD * yamuk(s.map(([, y]) => y), s.map(([x]) => Math.log(x))); };
  const cape = alan((x) => kucukYaDaYakin(x, lfc) && buyukYaDaYakin(x, el));
  const cin = alan((x) => buyukYaDaYakin(x, lfc));
  return { cape, cin: cin > 0 ? 0 : cin };
}

/** Parselin çevreyle yeniden aynı sıcaklığa geldiği denge seviyesi (hPa), sanal sıcaklık düzeltmesi olmadan;
 * yoksa null. Diyagramdaki CIN gölgesinin üst sınırı için (MetPy'nin `shade_cin` işlevindeki gibi). */
export function dengeSeviyesi(p: readonly number[], T: readonly number[], Td: readonly number[], parsel: readonly number[]): number | null {
  const el = elBasinci(p, T.map((x) => x + SIFIR), parsel.map((x) => x + SIFIR), Td[0]! + SIFIR);
  return Number.isNaN(el) ? null : el;
}

/** Sütundaki toplam su buharı (mm). `p` hPa, `Td` °C. [precipitable_water] */
export function yagisaDonusebilirSu(p: readonly number[], Td: readonly number[]): number {
  const sira = p.map((_, i) => i).sort((a, b) => p[b]! - p[a]!);
  const pa = sira.map((i) => p[i]! * 100);
  const w = sira.map((i, k) => { const e = doymaBuharBasinci(Td[i]! + SIFIR); return (EPS * e) / (pa[k]! - e); });
  return (-yamuk(w, pa) / (G * RHO_SU)) * 1000;
}

/** Standart atmosferde basıncın (hPa) yüksekliği (m). [pressure_to_height_std] */
export const standartYukseklik = (hPa: number) => (288 / 0.0065) * (1 - (hPa / 1013.25) ** ((RD * 0.0065) / G));

/** Sıcaklığın 0 °C'ye indiği basınç (hPa): yer 0 °C'nin üstündeyse ve yukarıda donma varsa, ilk donan seviye ile
 * altındaki arasında doğrusal ara değer; yoksa null. (hava/skewt.py → skewt_fig içindeki `donma`) */
export function donmaSeviyesi(p: readonly number[], T: readonly number[]): number | null {
  if (!(T[0]! > 0)) return null;
  const k = T.findIndex((t) => t <= 0);
  if (k < 1) return null;
  return p[k]! + ((0 - T[k]!) / (T[k - 1]! - T[k]!)) * (p[k - 1]! - p[k]!);
}

export interface Profil {
  /** Basınç (hPa): ilk değer yer, sonra yerin üstünde kalan seviyeler. */
  p: number[];
  /** Sıcaklık ve çiy noktası (°C). */
  T: number[];
  Td: number[];
  /** Rüzgâr bileşenleri (knot): u doğuya, v kuzeye. */
  u: number[];
  v: number[];
}

/** Bir saatin tahmin değerlerinden yerden başlayan dikey profil kurar: en altta yer seviyesi (2 m / 10 m),
 * üstünde yerin üstünde kalan basınç seviyeleri. Üst seviyelerin çiy noktası bağıl nemden hesaplanır (nem %1–100
 * aralığına sıkıştırılır). Yer değerlerinden biri eksikse null; değeri eksik olan seviye profile alınmaz.
 * (hava/skewt.py → profil) */
export function profilKur(deger: (ad: string) => Deger | undefined): Profil | null {
  const yer = ["surface_pressure", "temperature_2m", "dew_point_2m", "wind_speed_10m", "wind_direction_10m"].map((ad) => deger(ad));
  if (yer.some((x) => x == null)) return null;
  const [ps, t2, td2, hiz10, yon10] = yer as number[];
  const prof: Profil = { p: [ps!], T: [t2!], Td: [td2!], u: [], v: [] };
  const ruzgar = (hiz: number, yon: number) => { const a = (yon * Math.PI) / 180; prof.u.push((-hiz * Math.sin(a)) / KNOT); prof.v.push((-hiz * Math.cos(a)) / KNOT); };
  ruzgar(hiz10!, yon10!);
  for (const sev of SEVIYELER) {
    if (!(sev < ps! - 1)) continue;
    const [T, nem, hiz, yon] = ["temperature", "relative_humidity", "wind_speed", "wind_direction"].map((ad) => deger(`${ad}_${sev}hPa`));
    if (T == null || nem == null || hiz == null || yon == null) continue;
    prof.p.push(sev); prof.T.push(T);
    prof.Td.push(ciyNoktasi((Math.min(Math.max(nem, 1), 100) / 100) * doymaBuharBasinci(T + SIFIR)) - SIFIR);
    ruzgar(hiz, yon);
  }
  return prof;
}

export interface ProfilOzeti {
  /** Yükselen parselin sıcaklığı (°C), profilin seviyelerinde. */
  parsel: number[];
  cape: number;
  cin: number;
  /** Bulut tabanı: basınç (hPa), sıcaklık (°C), yerden yükseklik (m; standart atmosferle). */
  lclP: number;
  lclT: number;
  lclM: number;
  /** Yağışa dönüşebilir su (mm). */
  pw: number;
  /** 0 °C seviyesi: basınç (hPa) ve deniz seviyesinden yükseklik (m); yoksa null. */
  donma: number | null;
  donmaM: number | null;
}

/** Skew-T'nin yanında gösterilen sayılar. (hava/skewt.py → skewt_fig, app_pages/profil.py) */
export function profilOzeti(pr: Profil): ProfilOzeti {
  const parsel = parselProfili(pr.p, pr.T[0]!, pr.Td[0]!), b = lcl(pr.p[0]!, pr.T[0]!, pr.Td[0]!);
  const donma = donmaSeviyesi(pr.p, pr.T);
  return { parsel, ...capeCin(pr.p, pr.T, pr.Td, parsel), lclP: b.p, lclT: b.T, lclM: standartYukseklik(b.p) - standartYukseklik(pr.p[0]!),
           pw: yagisaDonusebilirSu(pr.p, pr.Td), donma, donmaM: donma == null ? null : standartYukseklik(donma) };
}

/** Verilen karışım oranında (g/kg) doymuş havanın `p` (hPa) basıncındaki sıcaklığı (°C): diyagramdaki karışım
 * oranı çizgileri. */
export function karisimCizgisi(gKg: number, p: number): number {
  const w = gKg / 1000;
  return ciyNoktasi((w * p * 100) / (EPS + w)) - SIFIR;
}
