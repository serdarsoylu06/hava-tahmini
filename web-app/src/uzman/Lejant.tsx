import { getColorScale } from "@openmeteo/weather-map-layer";
import { useMemo } from "react";

/** Haritadaki bir değeri ekranda gösterilecek birime çevirir. Izgara dosyalarında rüzgâr m/s'dir; uygulamanın geri
 * kalanı (ve katman açıklamaları) km/s kullandığı için rüzgâr km/s'e çevrilir. Diğer birimler olduğu gibi kalır. */
export function gosterim(deger: number, olcekBirimi: string): { deger: number; birim: string } {
  return olcekBirimi === "m/s" ? { deger: deger * 3.6, birim: "km/s" } : { deger, birim: olcekBirimi };
}

/** Haritayı çizen paketin bu değişken için kullandığı birim (ör. "°C", "m/s"); bilinmiyorsa boş. */
export function olcekBirimi(degisken: string, koyu: boolean): string {
  try {
    return getColorScale(degisken, koyu).unit;
  } catch {
    return "";
  }
}

/** Renkli alanın renk cetveli. Renkler ve eşikler haritayı çizen paketin kendi ölçeğinden okunur; böylece cetvel
 * her zaman haritadaki renklerle aynıdır. */
export function Lejant({ degisken, koyu, birim }: { degisken: string; koyu: boolean; birim: string }) {
  const cetvel = useMemo(() => {
    try {
      const o = getColorScale(degisken, koyu);
      const renk = (c: readonly number[]) => `rgba(${c[0]},${c[1]},${c[2]},${Math.max(c[3] ?? 1, 0.25)})`;
      if (o.type === "breakpoint") {
        const n = o.breakpoints.length;
        // her eşik eşit aralıkla dizilir (eşiklerin sık olduğu yerde renkler de sık değişir); renkler haritadaki gibi
        // eşikler arasında yumuşak geçer
        const dilimler = o.colors.slice(0, n).map((c, i) => `${renk(c)} ${(i / n) * 100}%`);
        const adim = Math.max(1, Math.ceil(n / 7));
        return { zemin: `linear-gradient(90deg, ${dilimler.join(", ")})`,
                 isaretler: o.breakpoints.map((v, i) => ({ v, yer: (i / n) * 100 })).filter((_, i) => i % adim === 0), birim: o.unit };
      }
      const n = o.colors.length;
      return { zemin: `linear-gradient(90deg, ${o.colors.map((c, i) => `${renk(c)} ${(i / (n - 1)) * 100}%`).join(", ")})`,
               isaretler: [0, 0.25, 0.5, 0.75, 1].map((p) => ({ v: o.min + (o.max - o.min) * p, yer: p * 100 })), birim: o.unit };
    } catch {
      return null;
    }
  }, [degisken, koyu]);
  if (!cetvel) return null;
  const gosterilenBirim = gosterim(0, cetvel.birim).birim || birim;
  const yaz = (ham: number) => {
    const v = gosterim(ham, cetvel.birim).deger;
    return Math.abs(v) >= 100 || Number.isInteger(Math.round(v * 10) / 10) ? String(Math.round(v)) : v.toFixed(1).replace(".", ",");
  };
  return (
    <div className="lj" role="img" aria-label={`Renk cetveli, ${cetvel.isaretler[0] ? yaz(cetvel.isaretler[0].v) : ""} ile ${cetvel.isaretler.length ? yaz(cetvel.isaretler[cetvel.isaretler.length - 1]!.v) : ""} ${gosterilenBirim} arası`}>
      <div className="lj-olcek">
        <div className="lj-cubuk" style={{ background: cetvel.zemin }} />
        <div className="lj-isaretler" aria-hidden="true">
          {cetvel.isaretler.map((x) => <span key={x.yer} style={{ left: `${x.yer}%` }}>{yaz(x.v)}</span>)}
        </div>
      </div>
      <div className="lj-birim" aria-hidden="true">{gosterilenBirim}</div>
    </div>
  );
}
