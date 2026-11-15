/** Hava durumu simgeleri: WMO koduna ve gündüz/gece durumuna göre güneş, ay, bulut, sis, çisenti, yağmur, kar ve
 * fırtına. 24×24 birimlik çizgi çizimlerdir; renkleri temaya göre stil.css'teki değişkenlerden gelir (güneş sarı,
 * su mavi, bulut yazı renginde). `simgeCizimi` yalnızca çizimi verir: hem tek başına (HavaSimgesi) hem de bir
 * grafiğin içinde (Cizelge) kullanılabilsin diye. */
import type { ReactNode } from "react";
import { type GunTuru, gunTuru } from "../basit/metin";
import type { Deger } from "../veri/tipler";

const BULUT = "M6.5 17.5h10.5a3.5 3.5 0 0 0 .5-6.96A5 5 0 0 0 7.9 9.6 4 4 0 0 0 6.5 17.5z";
const AY = "M19 14.5A7.5 7.5 0 0 1 9.5 5a7.5 7.5 0 1 0 9.5 9.5z";
const isinlar = (cx: number, cy: number, ic: number, dis: number) =>
  Array.from({ length: 8 }, (_, i) => { const a = (i * Math.PI) / 4, c = Math.cos(a), s = Math.sin(a); return `M${(cx + ic * c).toFixed(1)} ${(cy + ic * s).toFixed(1)}L${(cx + dis * c).toFixed(1)} ${(cy + dis * s).toFixed(1)}`; }).join("");

/** Yağış türlerinde bulut biraz yukarıda durur, altına damla, tane ya da şimşek gelir. */
const yukariBulut = <path className="hs-bulut" d={BULUT} transform="translate(0 -3.5)" />;

export function simgeCizimi(tur: GunTuru, gece = false): ReactNode {
  switch (tur) {
    case "acik":
      return gece ? <path className="hs-ay" d={AY} /> : <><circle className="hs-gunes" cx="12" cy="12" r="4" /><path className="hs-gunes" d={isinlar(12, 12, 6.6, 9)} /></>;
    case "parcali":
      return (
        <>
          {gece ? <path className="hs-ay" d={AY} transform="translate(-2.5 -3) scale(.62)" style={{ transformOrigin: "12px 12px" }} />
                : <><circle className="hs-gunes" cx="8" cy="8" r="2.8" /><path className="hs-gunes" d={isinlar(8, 8, 4.6, 6.2)} /></>}
          <path className="hs-bulut hs-on" d={BULUT} transform="translate(1.5 1.5)" />
        </>
      );
    case "bulutlu":
      return <path className="hs-bulut" d={BULUT} transform="translate(0 -1)" />;
    case "sis":
      return <><path className="hs-bulut" d={BULUT} transform="translate(0 -4.5)" /><path className="hs-bulut" d="M5 17h14M7 20.5h10" /></>;
    case "hafif":
      return <>{yukariBulut}<path className="hs-su" d="M9 17.5v1.6M12.5 17.5v1.6M16 17.5v1.6" /></>;
    case "yagmur":
      return <>{yukariBulut}<path className="hs-su" d="M9.5 17l-1.4 3.6M13 17l-1.4 3.6M16.5 17l-1.4 3.6" /></>;
    case "kar":
      return <>{yukariBulut}<path className="hs-kar" d="M8.5 18.2h.01M12 20.4h.01M15.5 18.2h.01M10.2 21h.01M13.8 17.6h.01" /></>;
    case "firtina":
      return <>{yukariBulut}<path className="hs-simsek" d="M12.8 15.6l-2.6 3.4h2.6l-1.3 3" /></>;
  }
}

/** Tek başına hava simgesi. Süs olarak kullanılır (yanında durum yazısı vardır), ekran okuyucuya okunmaz. */
export function HavaSimgesi({ kod, gece = false, boy = 24 }: { kod: Deger | undefined; gece?: boolean; boy?: number }) {
  return <svg className="hs" width={boy} height={boy} viewBox="0 0 24 24" aria-hidden="true" focusable="false">{simgeCizimi(gunTuru(kod ?? null), gece)}</svg>;
}
