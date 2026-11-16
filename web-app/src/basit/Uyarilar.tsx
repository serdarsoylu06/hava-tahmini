import type { Uyari } from "../hesap/yorum";

/** "Nelere dikkat etmeli?" kartları. Kartın tamamı açılır kapanır: özet hep görünür, nedeni dokununca açılır. Basit modda yalnızca ne olacağı ve neden önemli olduğu gösterilir;
 * hangi grafikte izleneceği (Uzman sayfaları) burada yer almaz. */
export function Uyarilar({ liste }: { liste: readonly Uyari[] }) {
  return (
    <div className="uyarilar">
      {liste.map((u) => (
        <details key={u.baslik} className={`uy ${u.seviye}`}>
          <summary><h3>{u.baslik}</h3><span className="uy-ozet">{u.ozet}</span></summary>
          <p className="uy-neden"><b>Neden önemli?</b> {u.neden}</p>
        </details>
      ))}
    </div>
  );
}
