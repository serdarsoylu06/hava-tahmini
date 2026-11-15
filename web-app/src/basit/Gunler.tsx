import { durum } from "../ortak/hava";
import { GUNLER, haftaGunu } from "../ortak/zaman";
import type { GunlukTablo } from "../veri/tipler";
import { DAIRE, gunTuru } from "./metin";

const GUN_UZUN = ["Pazartesi", "Salı", "Çarşamba", "Perşembe", "Cuma", "Cumartesi", "Pazar"];
const yuv = (x: number | null | undefined) => (x == null ? "—" : String(Math.round(x)));
const LEJANT: [string, string][] = [["Açık", DAIRE.acik], ["Parçalı bulutlu", DAIRE.parcali], ["Hafif yağış", DAIRE.hafif],
                                    ["Yağışlı", DAIRE.yagmur], ["Kapalı / sis", DAIRE.bulutlu]];

export function gunBasligi(gun: string): string {
  return `${GUN_UZUN[haftaGunu(gun)]} ${gun.slice(8, 10)}.${gun.slice(5, 7)}`;
}

/** 10 günlük kartlar. Bir güne dokununca o günün saatleri yukarıdaki grafikte açılır. */
export function Gunler({ gunluk, secili, sec }: { gunluk: GunlukTablo; secili: number; sec: (i: number) => void }) {
  const s = (ad: string, i: number) => gunluk.sutun[ad]?.[i] ?? null;
  return (
    <>
      <ol className="gk">
        {gunluk.gun.map((g, i) => {
          const kod = s("weather_code", i), pp = s("precipitation_probability_max", i) ?? 0, dr = durum(kod);
          const ad = i === 0 ? "Bugün" : GUNLER[haftaGunu(g)]!;
          return (
            <li key={g}>
              <button type="button" className="yz" aria-pressed={secili === i} onClick={() => sec(i)}
                      aria-label={`${i === 0 ? "Bugün" : GUN_UZUN[haftaGunu(g)]}: ${dr}, en yüksek ${yuv(s("temperature_2m_max", i))}, en düşük ${yuv(s("temperature_2m_min", i))} derece. Saatlerini göster.`}>
                <span className="gk-ad">{ad}<small>{g.slice(8, 10)}.{g.slice(5, 7)}</small></span>
                <span className="gk-daire" style={{ background: DAIRE[gunTuru(kod)] }}>{yuv(s("temperature_2m_max", i))}°</span>
                <span className="gk-alt">en düşük <b>{yuv(s("temperature_2m_min", i))}°</b></span>
                <span className="gk-durum">{pp >= 20 ? `${dr} %${Math.round(pp)}` : dr}</span>
              </button>
            </li>
          );
        })}
      </ol>
      <div className="yz gl">
        <div className="lejant">{LEJANT.map(([ad, renk]) => <span key={ad}><i style={{ background: renk }} />{ad}</span>)}</div>
        <span>Dairedeki sayı en yüksek sıcaklık · bir güne dokun: saatleri yukarıda açılır</span>
      </div>
    </>
  );
}
