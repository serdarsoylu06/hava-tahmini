import { durum } from "../ortak/hava";
import { GUNLER, haftaGunu } from "../ortak/zaman";
import type { GunlukTablo } from "../veri/tipler";
import { HavaSimgesi } from "../ortak/HavaSimgesi";

const GUN_UZUN = ["Pazartesi", "Salı", "Çarşamba", "Perşembe", "Cuma", "Cumartesi", "Pazar"];
const yuv = (x: number | null | undefined) => (x == null ? "—" : String(Math.round(x)));

export function gunBasligi(gun: string): string {
  return `${GUN_UZUN[haftaGunu(gun)]} ${gun.slice(8, 10)}.${gun.slice(5, 7)}`;
}

/** 10 günlük tahmin: geniş ekranda yan yana kartlar, telefonda dikey liste (yerleşim stil.css'te). Listede her günün
 * en düşük–en yüksek aralığı, on günün ortak ölçeğinde bir çubukla gösterilir. Bir güne dokununca saatleri yukarıda açılır. */
export function Gunler({ gunluk, secili, sec }: { gunluk: GunlukTablo; secili: number; sec: (i: number) => void }) {
  const s = (ad: string, i: number) => gunluk.sutun[ad]?.[i] ?? null;
  const sayilar = (ad: string) => (gunluk.sutun[ad] ?? []).filter((x): x is number => x != null);
  const taban = Math.min(...sayilar("temperature_2m_min")), tavan = Math.max(...sayilar("temperature_2m_max"));
  const yuzde = (x: number) => (tavan > taban ? ((x - taban) / (tavan - taban)) * 100 : 0);
  return (
    <>
      <ol className="gk">
        {gunluk.gun.map((g, i) => {
          const kod = s("weather_code", i), pp = s("precipitation_probability_max", i) ?? 0, dr = durum(kod);
          const mn = s("temperature_2m_min", i), mx = s("temperature_2m_max", i);
          const ad = i === 0 ? "Bugün" : GUNLER[haftaGunu(g)]!;
          return (
            <li key={g}>
              <button type="button" className="yz" aria-pressed={secili === i} onClick={() => sec(i)}
                      aria-label={`${i === 0 ? "Bugün" : GUN_UZUN[haftaGunu(g)]}: ${dr}, en yüksek ${yuv(s("temperature_2m_max", i))}, en düşük ${yuv(s("temperature_2m_min", i))} derece. Saatlerini göster.`}>
                <span className="gk-ad">{ad}<small>{g.slice(8, 10)}.{g.slice(5, 7)}</small></span>
                <HavaSimgesi kod={kod} boy={34} />
                <span className="gk-yagis">{pp >= 20 ? `%${Math.round(pp)}` : ""}</span>
                <span className="gk-derece">
                  <small>{yuv(mn)}°</small>
                  <span className="gk-cubuk" aria-hidden="true">
                    {mn != null && mx != null && <i style={{ left: `${yuzde(mn).toFixed(1)}%`, width: `${(yuzde(mx) - yuzde(mn)).toFixed(1)}%` }} />}
                  </span>
                  <b>{yuv(mx)}°</b>
                </span>
                <span className="gk-durum">{pp >= 20 ? `${dr} %${Math.round(pp)}` : dr}</span>
              </button>
            </li>
          );
        })}
      </ol>
      <p className="gl">Kalın sayı günün en yüksek, soluk sayı en düşük sıcaklığı. Bir güne dokun: saatleri yukarıda açılır.</p>
    </>
  );
}
