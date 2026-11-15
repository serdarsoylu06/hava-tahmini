/** 24 saatlik çizelge: üstte sıcaklık çizgisi, altta yağış olasılığı çubukları; gölgeli şeritler gece.
 * İki ölçü aynı zaman eksenini paylaşan iki ayrı panelde durur, böylece her birinin kendi ekseni okunur. */
import { useMemo } from "react";
import { Cizelge, IpucuBasligi, IpucuSatiri, type Panel } from "../grafik/Cizelge";
import { araliklar } from "../grafik/olcek";
import type { Saat } from "./metin";

const YESIL = "#2E6B3A", MAVI = "#2A6FB0";
const derece = (v: number | null) => (v == null ? "—" : `${Math.round(v)}°`);
const yuzde = (v: number | null) => (v == null ? "—" : `%${Math.round(v)}`);

export function Saatlik({ saatler, ilkSimdi }: { saatler: readonly Saat[]; ilkSimdi: boolean }) {
  const c = useMemo(() => {
    const paneller: Panel[] = [
      { baslik: "Sıcaklık (°C)", boy: 118, ustBosluk: 24, hedef: 3, bicim: (v) => `${v}°`,
        seriler: [{ tur: "cizgi", deger: saatler.map((x) => x.sicaklik), renk: YESIL, kalinlik: 3, etiket: { enAz: 48, bicim: (v) => `${Math.round(v)}°` } }] },
      { baslik: "Yağış olasılığı", boy: 52, taban: 0, tavan: 100, cizgiler: [0, 50, 100], bicim: (v) => `%${v}`,
        seriler: [{ tur: "cubuk", deger: saatler.map((x) => x.olasilik), renk: MAVI }] },
    ];
    const saat = (i: number) => (i === 0 && ilkSimdi ? "Şimdi" : saatler[i]!.zaman.slice(11, 16));
    return {
      paneller,
      golge: araliklar(saatler.map((x) => x.gece)),
      xEtiket: (i: number) => (i === 0 ? (ilkSimdi ? "Şimdi" : saatler[0]!.zaman.slice(11, 13)) : Number(saatler[i]!.zaman.slice(11, 13)) % 3 === 0 && i > 1 ? saatler[i]!.zaman.slice(11, 13) : null),
      ipucu: (i: number) => (
        <>
          <IpucuBasligi>{saat(i)}{saatler[i]!.gece ? " · gece" : ""}</IpucuBasligi>
          <IpucuSatiri renk={YESIL} ad="Sıcaklık" deger={derece(saatler[i]!.sicaklik)} />
          <IpucuSatiri ad="Hissedilen" deger={derece(saatler[i]!.hissedilen)} />
          <IpucuSatiri renk={MAVI} ad="Yağış olasılığı" deger={yuzde(saatler[i]!.olasilik)} />
        </>
      ),
      tablo: { basliklar: ["Saat", "Sıcaklık", "Hissedilen", "Yağış olasılığı"],
               satir: (i: number) => [saat(i), derece(saatler[i]!.sicaklik), derece(saatler[i]!.hissedilen), yuzde(saatler[i]!.olasilik)] },
    };
  }, [saatler, ilkSimdi]);

  return <Cizelge n={saatler.length} bant paneller={c.paneller} golge={c.golge} xEtiket={c.xEtiket} ipucu={c.ipucu} tablo={c.tablo}
                  etiket="Sıcaklık ve yağış olasılığı çizelgesi" />;
}
