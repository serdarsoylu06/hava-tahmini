/** Basit mod: sade, telefon öncelikli hava durumu ekranı. Anlık durum, dört gösterge, 24 saat, uyarılar, 10 gün. */
import { useMemo, useState } from "react";
import { uyarilar } from "../hesap/yorum";
import { simdiden, simdikiSaat } from "../veri/openMeteo";
import type { Konum, Tahmin } from "../veri/tipler";
import { gunBasligi, Gunler } from "./Gunler";
import { Manzara } from "./Manzara";
import { gostergeler, oneri, ozetCumle, saatler } from "./metin";
import { Olcer } from "./Olcer";
import { Saatlik } from "./Saatlik";
import { Uyarilar } from "./Uyarilar";

/** Uyarılar için taranan dönem (saat). */
const UYARI_DONEMI = 120;

export function Basit({ konum, tahmin, kayitli, kaydet }: { konum: Konum; tahmin: Tahmin; kayitli: boolean; kaydet: () => void }) {
  const [seciliGun, setSeciliGun] = useState(0);
  const { saatlik, gunluk, anlik } = tahmin;

  const hesap = useMemo(() => {
    const simdi = simdikiSaat(tahmin.tz);
    const ilk = saatlik.zaman.findIndex((z) => z >= simdi), bas = ilk === -1 ? saatlik.zaman.length : ilk;
    const s24 = saatler(saatlik, bas, 24);
    const ileri = simdiden(saatlik, simdi);
    const donem = { zaman: ileri.zaman.slice(0, UYARI_DONEMI),
                    sutun: Object.fromEntries(Object.entries(ileri.sutun).map(([k, v]) => [k, v.slice(0, UYARI_DONEMI)])) };
    return {
      s24,
      ozet: ozetCumle(saatler(saatlik, bas, 36)),
      oneri: oneri(anlik, s24),
      gostergeler: gostergeler(anlik, s24, saatlik.sutun.pressure_msl?.[bas - 3] ?? null),
      uyarilar: donem.zaman.length ? uyarilar(donem, konum.rakim) : [],
    };
  }, [tahmin, saatlik, anlik, konum.rakim]);

  const gosterilen = useMemo(() => {
    if (seciliGun === 0) return hesap.s24;
    const gun = gunluk.gun[seciliGun];
    return gun ? saatler(saatlik, saatlik.zaman.findIndex((z) => z.startsWith(gun)), 24) : hesap.s24;
  }, [seciliGun, hesap.s24, gunluk.gun, saatlik]);
  const sicakliklar = gosterilen.map((x) => x.sicaklik).filter((x): x is number => x != null);
  const g = (ad: string) => gunluk.sutun[ad]?.[0] ?? null;

  return (
    <>
      {/* Dört gösterge manzara kartının içinde, ormanın üstünde durur. */}
      <Manzara konum={konum} anlik={anlik} enYuksek={g("temperature_2m_max")} enDusuk={g("temperature_2m_min")}
               gunDogumu={gunluk.gunDogumu[0] ?? null} gunBatimi={gunluk.gunBatimi[0] ?? null}
               ozet={hesap.ozet} oneri={hesap.oneri} kayitli={kayitli} kaydet={kaydet}
               alt={<div className="ol">{hesap.gostergeler.map((x) => <Olcer key={x.ad} g={x} />)}</div>} />

      <div className="bl" id="saatlik">
        <h2>{seciliGun === 0 ? "Önümüzdeki 24 saat" : gunBasligi(gunluk.gun[seciliGun]!)}</h2>
        {seciliGun !== 0 && <button type="button" className="cip" onClick={() => setSeciliGun(0)}>← Şimdiye dön</button>}
      </div>
      <section className="ak" aria-label="Sıcaklık ve yağış olasılığı">
        <div className="ak-ust">
          <h3>Sıcaklık ve yağış</h3>
          {sicakliklar.length > 0 && <span className="ak-ozet">{Math.round(Math.min(...sicakliklar))}° – {Math.round(Math.max(...sicakliklar))}°</span>}
        </div>
        <p className="ak-ac">Üstte sıcaklık, altta yağış olasılığı; gölgeli saatler gece. Bir saatin üzerine gel ya da dokun.</p>
        {gosterilen.length >= 2
          ? <Saatlik saatler={gosterilen} ilkSimdi={seciliGun === 0} />
          : <p className="ak-ac">Bu gün için saatlik veri yok.</p>}
      </section>

      <div className="bl"><h2>Nelere dikkat etmeli?</h2><span className="bl-ac">Önümüzdeki 5 günün tahmini otomatik tarandı</span></div>
      <Uyarilar liste={hesap.uyarilar} />

      <div className="bl"><h2>10 günlük tahmin</h2></div>
      <Gunler gunluk={gunluk} secili={seciliGun}
              sec={(i) => { setSeciliGun(i); document.getElementById("saatlik")?.scrollIntoView({ behavior: "smooth", block: "start" }); }} />
    </>
  );
}
