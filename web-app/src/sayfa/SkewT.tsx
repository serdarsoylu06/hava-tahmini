/** Skew-T log-P diyagramı (SVG). Dikey eksen basıncın logaritması, sıcaklık çizgileri 45° sağa eğiktir.
 * Streamlit sürümü bunu MetPy + matplotlib ile resim olarak çizer; burada aynı öğeler tarayıcıda vektör olarak
 * çizilir: sıcaklık, çiy noktası, yükselen parsel, CAPE/CIN gölgeleri, bulut tabanı, 0 °C çizgisi, kuru ve nemli
 * adyabatlar, karışım oranı çizgileri ve rüzgâr bayrakları. */
import { useId, useMemo } from "react";
import { ekranRengi } from "../grafik/renk";
import { useKoyuTema } from "../kabuk/tema";
import { dengeSeviyesi, karisimCizgisi, kuruAdyabat, nemliAdyabat, parselProfili, type Profil, type ProfilOzeti } from "../hesap/profil";

const P_ALT = 1050, P_UST = 200, T_SOL = -40, T_SAG = 40;
const SOL = 46, UST = 12, EN = 462, BOY = 520, TABAN = UST + BOY, GENISLIK = 590, YUKSEKLIK = TABAN + 34;
const ISOBARLAR = [1000, 850, 700, 500, 400, 300, 250, 200];
const KARISIM = [0.4, 1, 2, 4, 7, 10, 16, 24, 32];
const RENK = { kirmizi: "#B5352B", yesil: "#2E6B3A", mavi: "#2A6FB0", murekkep: "#1C2829" } as const;

const y = (p: number) => UST + (BOY * (Math.log(p) - Math.log(P_UST))) / (Math.log(P_ALT) - Math.log(P_UST));
const x = (T: number, p: number) => SOL + ((T - T_SOL) / (T_SAG - T_SOL)) * EN + (TABAN - y(p));
const n1 = (v: number) => Math.round(v * 10) / 10;
const yol = (noktalar: readonly (readonly [number, number])[]) => noktalar.map(([T, p], i) => `${i ? "L" : "M"}${n1(x(T, p))} ${n1(y(p))}`).join("");
/** `a`dan `b`ye eşit logaritmik aralıklı basınçlar. */
const basinclar = (a: number, b: number, adet: number) => Array.from({ length: adet }, (_, i) => a * (b / a) ** (i / (adet - 1)));

/** Değişmeyen arka plan çizgileri (bir kez hesaplanır). */
function arkaPlan() {
  const ps = basinclar(P_ALT, P_UST, 40);
  const kuru: string[] = [], nemli: string[] = [], karisim: string[] = [], izoterm: string[] = [];
  for (let T = -120; T <= 40; T += 10) if (T !== 0) izoterm.push(yol([[T, P_ALT], [T, P_UST]]));
  for (let th = -30; th <= 210; th += 20) kuru.push(yol(ps.map((p) => [kuruAdyabat(p, th + 273.15, 1000) - 273.15, p] as const)));
  const yukari = basinclar(1000, P_UST, 36).slice(1);
  for (const T of [-30, -20, -10, 0, 5, 10, 15, 20, 25, 30, 35]) {
    const asagi = nemliAdyabat(1000, T + 273.15, [P_ALT])[0]! - 273.15;
    nemli.push(yol([[asagi, P_ALT], [T, 1000], ...nemliAdyabat(1000, T + 273.15, yukari).map((t, i) => [t - 273.15, yukari[i]!] as const)]));
  }
  const kp = basinclar(P_ALT, 600, 8);
  for (const w of KARISIM) karisim.push(yol(kp.map((p) => [karisimCizgisi(w, p), p] as const)));
  return { kuru: kuru.join(""), nemli: nemli.join(""), karisim: karisim.join(""), izoterm: izoterm.join("") };
}

/** Rüzgâr bayrağı: gövde rüzgârın geldiği yönü gösterir; kısa çizgi 5, uzun çizgi 10, üçgen 50 knot. */
function Bayrak({ cx, cy, u, v, renk: MUREKKEP }: { cx: number; cy: number; u: number; v: number; renk: string }) {
  const hiz = Math.round(Math.hypot(u, v) / 5) * 5;
  if (hiz < 5) return <circle cx={cx} cy={cy} r={3} fill="none" stroke={MUREKKEP} strokeWidth={1.1} />;
  const yon = (Math.atan2(-u, -v) * 180) / Math.PI, BOYU = 26;
  let kalan = hiz, konum = BOYU, d = "M0 0V" + -BOYU;
  const ucgenler: string[] = [];
  while (kalan >= 50) { ucgenler.push(`M0 ${-konum}L10 ${-konum + 3}L0 ${-konum + 6}Z`); konum -= 7.5; kalan -= 50; }
  while (kalan >= 10) { d += `M0 ${-konum}L10 ${-konum - 4}`; konum -= 4.5; kalan -= 10; }
  if (kalan >= 5) { if (konum === BOYU) konum -= 4.5; d += `M0 ${-konum}L5 ${-konum - 2}`; }
  return (
    <g transform={`translate(${cx} ${cy}) rotate(${n1(yon)})`}>
      <path d={d} fill="none" stroke={MUREKKEP} strokeWidth={1.2} strokeLinecap="round" />
      {ucgenler.map((u2) => <path key={u2} d={u2} fill={MUREKKEP} />)}
    </g>
  );
}

export function SkewT({ profil, ozet, baslik }: { profil: Profil; ozet: ProfilOzeti; baslik: string }) {
  const kimlik = useId().replace(/:/g, "");
  // çizgi renkleri açık karta göre tanımlıdır; koyu temada karşılıklarıyla çizilir
  const koyu = useKoyuTema();
  const KIRMIZI = ekranRengi(RENK.kirmizi, koyu), YESIL = ekranRengi(RENK.yesil, koyu), MAVI = ekranRengi(RENK.mavi, koyu), MUREKKEP = ekranRengi(RENK.murekkep, koyu);
  const arka = useMemo(arkaPlan, []);
  const c = useMemo(() => {
    const { p, T, Td } = profil;
    // parsel eğrisi ince aralıkla (10 hPa) hesaplanır ki LCL'deki kırılma ve nemli adyabatın eğriliği görünsün
    const ince = [p[0]!, ...Array.from({ length: Math.floor((p[0]! - P_UST) / 10) }, (_, i) => Math.ceil(p[0]! / 10) * 10 - 10 * (i + 1)).filter((q) => q < p[0]! && q >= p[p.length - 1]!)];
    const parsel = parselProfili(ince, T[0]!, Td[0]!);
    const sicaklik = p.map((q, i) => [T[i]!, q] as const), ciy = p.map((q, i) => [Td[i]!, q] as const), yukselen = ince.map((q, i) => [parsel[i]!, q] as const);
    const el = dengeSeviyesi(p, T, Td, ozet.parsel);
    return {
      sicaklik: yol(sicaklik), ciy: yol(ciy), yukselen: yol(yukselen),
      // parsel ile sıcaklık arasındaki alan; kırmızısı sıcaklık eğrisinin sağına, mavisi soluna kırpılarak boyanır
      arasi: `${yol(yukselen)}${[...sicaklik].reverse().map(([t, q]) => `L${n1(x(t, q))} ${n1(y(q))}`).join("")}Z`,
      sagi: `${yol(sicaklik)}L2000 ${n1(y(p[p.length - 1]!))}L2000 ${n1(y(p[0]!))}Z`,
      solu: `${yol(sicaklik)}L-2000 ${n1(y(p[p.length - 1]!))}L-2000 ${n1(y(p[0]!))}Z`,
      cin: el == null ? null : { ust: y(el), alt: y(ozet.lclP) },
    };
  }, [profil, ozet]);

  return (
    <figure className="skewt">
      <svg viewBox={`0 0 ${GENISLIK} ${YUKSEKLIK}`} role="img"
           aria-label={`${baslik}: skew-T diyagramı. CAPE ${Math.round(ozet.cape)} J/kg, CIN ${Math.round(ozet.cin)} J/kg, bulut tabanı ${Math.round(ozet.lclP)} hPa.`}>
        <defs>
          <clipPath id={`${kimlik}-alan`}><rect x={SOL} y={UST} width={EN} height={BOY} /></clipPath>
          <clipPath id={`${kimlik}-sag`}><path d={c.sagi} /></clipPath>
          <clipPath id={`${kimlik}-sol`}><path d={c.solu} /></clipPath>
          {c.cin && <clipPath id={`${kimlik}-cin`}><rect x={-2000} y={c.cin.ust} width={4000} height={Math.max(c.cin.alt - c.cin.ust, 0)} /></clipPath>}
        </defs>
        <g clipPath={`url(#${kimlik}-alan)`}>
          <path d={arka.izoterm} className="sk-izoterm" />
          <path d={arka.kuru} className="sk-kuru" />
          <path d={arka.nemli} className="sk-nemli" />
          <path d={arka.karisim} className="sk-karisim" />
          {ISOBARLAR.map((p) => <line key={p} className="sk-izobar" x1={SOL} x2={SOL + EN} y1={n1(y(p))} y2={n1(y(p))} />)}
          <path d={yol([[0, P_ALT], [0, P_UST]])} stroke={MAVI} strokeWidth={1.4} strokeDasharray="2 4" fill="none" />
          <g clipPath={`url(#${kimlik}-sag)`}><path d={c.arasi} fill={KIRMIZI} opacity={0.25} /></g>
          {c.cin && <g clipPath={`url(#${kimlik}-cin)`}><g clipPath={`url(#${kimlik}-sol)`}><path d={c.arasi} fill={MAVI} opacity={0.25} /></g></g>}
          <path d={c.yukselen} fill="none" stroke={MUREKKEP} strokeWidth={1.6} strokeDasharray="6 4" />
          <path d={c.ciy} fill="none" stroke={YESIL} strokeWidth={2.6} strokeLinejoin="round" />
          <path d={c.sicaklik} fill="none" stroke={KIRMIZI} strokeWidth={2.6} strokeLinejoin="round" />
          <circle cx={n1(x(ozet.lclT, ozet.lclP))} cy={n1(y(ozet.lclP))} r={4.5} fill={MUREKKEP} stroke="var(--kart)" strokeWidth={2} />
        </g>
        <rect x={SOL} y={UST} width={EN} height={BOY} fill="none" className="sk-cerceve" />
        {ISOBARLAR.map((p) => <text key={p} className="cz-yazi" x={SOL - 6} y={n1(y(p))} dy=".32em" textAnchor="end">{p}</text>)}
        {[-40, -30, -20, -10, 0, 10, 20, 30, 40].map((T) => <text key={T} className="cz-yazi" x={n1(x(T, P_ALT))} y={TABAN + 14} textAnchor="middle">{T}</text>)}
        <text className="cz-yazi sk-eksen-adi" x={SOL + EN / 2} y={TABAN + 29} textAnchor="middle">Sıcaklık (°C)</text>
        <text className="cz-yazi sk-eksen-adi" transform={`translate(11 ${UST + BOY / 2}) rotate(-90)`} textAnchor="middle">Basınç (hPa)</text>
        {profil.p.map((p, i) => <Bayrak key={p} cx={SOL + EN + 42} cy={n1(y(p))} u={profil.u[i]!} v={profil.v[i]!} renk={MUREKKEP} />)}
      </svg>
      <figcaption>
        <ul className="cz-lejant">
          <li><svg width="18" height="8" aria-hidden="true"><line x1="1" y1="4" x2="17" y2="4" stroke={KIRMIZI} strokeWidth="2.6" /></svg>Sıcaklık</li>
          <li><svg width="18" height="8" aria-hidden="true"><line x1="1" y1="4" x2="17" y2="4" stroke={YESIL} strokeWidth="2.6" /></svg>Çiy noktası</li>
          <li><svg width="18" height="8" aria-hidden="true"><line x1="1" y1="4" x2="17" y2="4" stroke={MUREKKEP} strokeWidth="1.6" strokeDasharray="6 4" /></svg>Yükselen hava parseli</li>
          <li><svg width="12" height="12" aria-hidden="true"><circle cx="6" cy="6" r="4" fill={MUREKKEP} /></svg>Bulut tabanı (LCL)</li>
          <li><svg width="12" height="10" aria-hidden="true"><rect width="12" height="10" rx="2" fill={KIRMIZI} opacity=".3" /></svg>CAPE</li>
          <li><svg width="12" height="10" aria-hidden="true"><rect width="12" height="10" rx="2" fill={MAVI} opacity=".3" /></svg>CIN</li>
          <li><svg width="18" height="8" aria-hidden="true"><line x1="1" y1="4" x2="17" y2="4" stroke={MAVI} strokeWidth="1.4" strokeDasharray="2 4" /></svg>0 °C</li>
        </ul>
        <p>Yatay eksen sıcaklık (°C), dikey eksen basınç (hPa). İnce çizgiler: düz, sola yatık olanlar kuru adyabat; kesikli olanlar nemli adyabat; noktalı olanlar karışım oranı (g/kg). Sağdaki bayraklar rüzgârdır.</p>
      </figcaption>
    </figure>
  );
}
