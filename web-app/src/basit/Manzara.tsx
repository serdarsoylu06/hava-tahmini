/** Anlık durumu gösteren manzara kartı: gökyüzü günün saatine ve havaya göre renklenir; yağmur, kar, sis ve
 * şimşek canlandırılır. Streamlit sürümündeki `tasarim.manzara`nın ve Bento sayfasındakinin karşılığı. */
import { type CSSProperties, type ReactNode, useMemo } from "react";
import { durum } from "../ortak/hava";
import { GUNLER, haftaGunu } from "../ortak/zaman";
import type { Anlik, Konum } from "../veri/tipler";
import { type GunEvresi, gunEvresi, havaTuru } from "./metin";

const GOK: Record<"acik" | "kapali" | "sis", Record<GunEvresi, [string, string, string]>> = {
  acik: { gece: ["#0E1A26", "#1B2E3A", "#2C4646"], dogus: ["#34465E", "#B9806A", "#E7B487"], ogle: ["#3F7EA0", "#86B7C4", "#C4DCCB"], batim: ["#2B3858", "#9C5E5C", "#E09C6A"] },
  kapali: { gece: ["#10181B", "#1A2628", "#263533"], dogus: ["#3E4A4D", "#6E706A", "#8C887C"], ogle: ["#566764", "#7A8C86", "#9AAAA0"], batim: ["#343E44", "#655D5A", "#857869"] },
  sis: { gece: ["#1A2427", "#2B3838", "#3C4B48"], dogus: ["#59625F", "#8A8A80", "#A8A596"], ogle: ["#7D8E88", "#A3B2AA", "#BAC6BD"], batim: ["#4E5555", "#7E7570", "#998D80"] },
};
const GOK_CISIM: Record<GunEvresi, [number, number, number, string]> = {
  gece: [930, 90, 24, "#E8EEF0"], dogus: [180, 240, 40, "#F4B76A"], ogle: [930, 90, 44, "#F1D24E"], batim: [1020, 240, 40, "#F08A5A"],
};
const KARANLIK: Record<GunEvresi, number> = { gece: 0.45, dogus: 0.18, ogle: 0, batim: 0.18 };

/** Tohumlu üreteç: aynı yer hep aynı ormanı çizer. */
function rastgele(tohum: number): () => number {
  let a = tohum >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

function camYolu(r: () => number, taban: number, boy: number, adim: number, sap: number): string {
  let yol = "";
  for (let x = -10; x < 1220; x += adim) {
    const h = boy * (0.7 + r() * 0.6), w = h * 0.42, y = taban + r() * sap;
    yol += `M${x.toFixed(0)} ${y.toFixed(0)}L${(x + w / 2).toFixed(0)} ${(y - h).toFixed(0)}L${(x + w).toFixed(0)} ${y.toFixed(0)}Z`;
  }
  return `${yol}M0 ${taban + sap}H1200V440H0Z`;
}

const yuv = (x: number | null | undefined) => (x == null ? "—" : String(Math.round(x)));

export interface ManzaraOzellik {
  konum: Konum;
  anlik: Anlik;
  enYuksek: number | null;
  enDusuk: number | null;
  gunDogumu: string | null;
  gunBatimi: string | null;
  ozet: string;
  oneri: string;
  kayitli: boolean;
  kaydet: () => void;
  /** Kartın altında, ormanın üstünde gösterilecek içerik (göstergeler buraya gelir). */
  alt?: ReactNode;
}

export function Manzara({ konum, anlik, enYuksek, enDusuk, gunDogumu, gunBatimi, ozet, oneri, kayitli, kaydet, alt }: ManzaraOzellik) {
  const d = anlik.deger, t0 = anlik.zaman;
  const tur = havaTuru(d.weather_code ?? null);
  const evre = gunEvresi(t0, gunDogumu, gunBatimi);

  const sahne = useMemo(() => {
    const gokTur = tur === "acik" ? "acik" : tur === "sis" ? "sis" : "kapali";
    const r = rastgele(Math.round(konum.lat * 100 + konum.lon * 7));
    let yildiz = "";
    if (gokTur === "acik" && evre === "gece") for (let i = 0; i < 70; i++) yildiz += `M${(r() * 1200).toFixed(0)} ${(r() * 200).toFixed(0)}h1.5v1.5h-1.5Z`;
    const [dag1, dag2] = gokTur === "acik" ? ["#5E8673", "#46705A"] : ["#6C857B", "#55736A"];
    const cam2 = camYolu(r, 372, 60, 17, 14), cam1 = camYolu(r, 420, 95, 26, 16);
    const parca: ReactNode[] = [];
    const stil = (s: CSSProperties) => s;
    if (tur === "yagmur" || tur === "firtina") {
      for (let i = 0; i < (tur === "firtina" ? 110 : 70); i++) {
        const sure = (tur === "firtina" ? 0.45 : 0.55) + r() * 0.35;
        parca.push(<div key={`d${i}`} className="mz-damla" style={stil({ left: `${(r() * 120).toFixed(1)}%`, height: `${(40 + r() * 40).toFixed(0)}px`,
          opacity: Number((0.45 + r() * 0.55).toFixed(2)), animationDuration: `${sure.toFixed(2)}s`, animationDelay: `${(-r() * sure).toFixed(2)}s` })} />);
      }
      parca.push(<div key="s" className="mz-sis" style={{ top: "48%", height: 110, animationDuration: "26s" }} />);
    } else if (tur === "kar") {
      for (let i = 0; i < 60; i++) {
        const sure = 7 + r() * 6, boy = 2.5 + r() * 3;
        parca.push(<div key={`k${i}`} className="mz-tane" style={stil({ left: `${(r() * 100).toFixed(1)}%`, width: boy, height: boy,
          animationDuration: `${sure.toFixed(2)}s`, animationDelay: `${(-r() * sure).toFixed(2)}s` })} />);
      }
    } else if (tur === "sis") {
      [35, 55, 72].forEach((u) => parca.push(<div key={`s${u}`} className="mz-sis" style={{ top: `${u}%`, height: 110 + r() * 70, animationDuration: `${(20 + r() * 15).toFixed(1)}s` }} />));
    }
    if (tur === "firtina") parca.push(<div key="simsek" className="mz-simsek" />);
    return { gok: GOK[gokTur][evre], cisim: gokTur === "acik" ? GOK_CISIM[evre] : null, yildiz, dag1, dag2, cam1, cam2, parca };
  }, [konum.lat, konum.lon, tur, evre]);

  const [g1, g2, g3] = sahne.gok;
  return (
    <section className="mz" aria-label="Şu anki hava" style={{ background: `linear-gradient(180deg, ${g1} 0%, ${g2} 55%, ${g3} 100%)` }}>
      <svg className="mz-sahne" viewBox="0 0 1200 440" preserveAspectRatio="xMidYMax slice" aria-hidden="true">
        {sahne.yildiz && <path d={sahne.yildiz} fill="#EEF4F0" opacity=".8" />}
        {sahne.cisim && <circle cx={sahne.cisim[0]} cy={sahne.cisim[1]} r={sahne.cisim[2]} fill={sahne.cisim[3]} opacity=".95" />}
        <path d="M0 250 L90 190 L170 225 L270 150 L360 205 L470 130 L560 190 L650 160 L760 210 L850 140 L960 200 L1060 165 L1200 215 L1200 440 L0 440Z" fill={sahne.dag1} />
        <path d="M0 300 L120 235 L210 270 L330 205 L440 262 L540 222 L640 275 L760 215 L880 268 L990 230 L1100 270 L1200 245 L1200 440 L0 440Z" fill={sahne.dag2} />
        <path d="M0 345 L140 300 L280 330 L420 290 L560 335 L700 300 L840 340 L980 305 L1120 335 L1200 320 L1200 440 L0 440Z" fill="#3E654E" />
        <path d={sahne.cam2} fill="#2F5B3E" /><path d={sahne.cam1} fill="#1F4230" />
        <rect x="0" y="0" width="1200" height="440" fill="#0A1418" opacity={KARANLIK[evre]} />
      </svg>
      <div className="mz-katman" aria-hidden="true">{sahne.parca}<div className="mz-ortu" /></div>
      <button type="button" className="mz-kaydet" aria-pressed={kayitli} onClick={kaydet}
              title={kayitli ? "Kayıtlı yerlerden çıkar" : "Bu yeri kaydet"} aria-label={kayitli ? "Kayıtlı yerlerden çıkar" : "Bu yeri kaydet"}>
        <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinejoin="round" aria-hidden="true">
          <path d="m12 3 2.8 5.7 6.2.9-4.5 4.4 1.1 6.2L12 17.3 6.4 20.2l1.1-6.2L3 9.6l6.2-.9z" />
        </svg>
      </button>
      <div className="mz-icerik">
        <p className="mz-yer">{[konum.ad, konum.bolge].filter(Boolean).join(", ")} · {GUNLER[haftaGunu(t0)]} {t0.slice(8, 10)}.{t0.slice(5, 7)}, saat {t0.slice(11, 16)}</p>
        <div className="mz-ust">
          <div className="mz-sicak">{yuv(d.temperature_2m)}°</div>
          <div className="mz-yan">
            <div className="mz-durum">{durum(d.weather_code)}</div>
            <div className="mz-ek">Hissedilen {yuv(d.apparent_temperature)}° · en yüksek {yuv(enYuksek)}°, en düşük {yuv(enDusuk)}°</div>
          </div>
        </div>
        {ozet && <p className="mz-not">{ozet}</p>}
        {oneri && <p className="mz-oneri"><b>Öneri:</b> {oneri}</p>}
      </div>
      {alt && <div className="mz-alt">{alt}</div>}
    </section>
  );
}
