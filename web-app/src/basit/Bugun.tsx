/** "Bugün" şeridi: güneşin doğuşu, batışı ve gökteki yeri; UV; görüş; ay evresi. Hepsi zaten indirilmiş
 * tahminden hesaplanır, ek istek gitmez. */
import { ay, SINODIK } from "../hesap/deniz";
import type { GunlukTablo, Tablo } from "../veri/tipler";
import { gorusAdi, gunesKonumu, sureYaz, uvDuzeyi } from "./metin";

const saat = (t: string | null) => (t ? t.slice(11, 16) : "—");

/** Güneşin günlük yayı: doğuştan batışa yarım elips; güneş, günün geçen kısmı kadar ilerlemiş çizilir. */
function GunesYayi({ konum }: { konum: number | null }) {
  const a = konum == null ? null : Math.PI * (1 - konum);                      // soldan (doğuş) sağa (batış)
  return (
    <svg className="bg-yay" viewBox="0 0 120 56" aria-hidden="true">
      <path d="M8 50A52 44 0 0 1 112 50" className="bg-yol" />
      <path d="M2 50h116" className="bg-ufuk" />
      {a != null && <circle cx={60 + 52 * Math.cos(a)} cy={50 - 44 * Math.sin(a)} r="6" className="bg-gunes" />}
    </svg>
  );
}

/** Ayın görünen yüzü: aydınlık kısım ay yaşına göre çizilir (büyürken sağdan, küçülürken soldan dolar). */
function AySimgesi({ yas }: { yas: number }) {
  const p = yas / SINODIK, r = 15, kenar = r * Math.abs(Math.cos(2 * Math.PI * p));
  const buyuyor = p < 0.5, hilal = buyuyor ? p < 0.25 : p > 0.75;
  // sağ yarım daire + aydınlık sınırı (yarım elips); küçülen ayda çizim yatay çevrilir
  const yol = `M20 ${20 - r}A${r} ${r} 0 0 1 20 ${20 + r}A${kenar.toFixed(1)} ${r} 0 0 ${hilal ? 0 : 1} 20 ${20 - r}Z`;
  return (
    <svg className="bg-ay" viewBox="0 0 40 40" aria-hidden="true">
      <circle cx="20" cy="20" r={r} className="bg-ay-karanlik" />
      <path d={yol} className="bg-ay-aydinlik" transform={buyuyor ? undefined : "translate(40 0) scale(-1 1)"} />
    </svg>
  );
}

export function Bugun({ simdi, saatlik, gunluk }: { simdi: string; saatlik: Tablo; gunluk: GunlukTablo }) {
  const gi = Math.max(gunluk.gun.indexOf(simdi.slice(0, 10)), 0);
  const dogus = gunluk.gunDogumu[gi] ?? null, batis = gunluk.gunBatimi[gi] ?? null;
  const si = saatlik.zaman.findIndex((z) => z >= `${simdi.slice(0, 13)}:00`);
  const uvDizi = saatlik.sutun.uv_index ?? [], gorusDizi = saatlik.sutun.visibility ?? [];
  const uv = si >= 0 ? uvDizi[si] ?? null : null, gorus = si >= 0 ? gorusDizi[si] ?? null : null;
  // bugünün en yüksek UV değeri ve saati
  const bugun = saatlik.zaman.map((z, i) => ({ z, v: uvDizi[i] ?? null })).filter((x) => x.z.startsWith(simdi.slice(0, 10)) && x.v != null);
  const tepe = bugun.reduce<{ z: string; v: number } | null>((en, x) => (en == null || x.v! > en.v ? { z: x.z, v: x.v! } : en), null);
  const a = ay(simdi), uzunluk = dogus && batis ? sureYaz(dogus, batis) : null;
  const konum = gunesKonumu(simdi, dogus, batis);

  return (
    <dl className="bg">
      <div className="yz bg-kart">
        <dt>Güneş</dt>
        <dd className="bg-gorsel"><GunesYayi konum={konum} /></dd>
        <dd><b>{saat(dogus)}</b> doğuş · <b>{saat(batis)}</b> batış</dd>
        <dd className="bg-ek">{uzunluk ? `Gün ${uzunluk}` : "Güneş bugün doğmuyor ya da batmıyor"}{konum == null && uzunluk ? " · şu an gece" : ""}</dd>
      </div>
      <div className="yz bg-kart">
        <dt>UV</dt>
        <dd className="bg-buyuk">{uv == null ? "—" : Math.round(uv)}<small>{uv == null ? "" : uvDuzeyi(uv)}</small></dd>
        <dd className="bg-ek">{tepe && tepe.v >= 1 ? `Bugün en çok ${Math.round(tepe.v)} (${tepe.z.slice(11, 16)})` : "Bugün UV çok düşük"}</dd>
        {tepe && tepe.v >= 6 && <dd className="bg-ek">Öğle saatlerinde güneş kremi ve şapka iyi olur.</dd>}
      </div>
      <div className="yz bg-kart">
        <dt>Görüş</dt>
        <dd className="bg-buyuk">{gorus == null ? "—" : gorus >= 10000 ? Math.round(gorus / 1000) : (gorus / 1000).toFixed(1).replace(".", ",")}<small>km</small></dd>
        <dd className="bg-ek">{gorus == null ? "Veri yok" : gorusAdi(gorus)}</dd>
      </div>
      <div className="yz bg-kart">
        <dt>Ay</dt>
        <dd className="bg-gorsel"><AySimgesi yas={a.yas} /></dd>
        <dd><b>{a.ad}</b></dd>
        <dd className="bg-ek">%{Math.round(a.aydinlanma)} aydınlık</dd>
      </div>
    </dl>
  );
}
