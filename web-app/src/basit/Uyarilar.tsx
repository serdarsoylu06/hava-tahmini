import type { Uyari } from "../hesap/yorum";

/** "Nelere dikkat etmeli?" kartları. Basit modda yalnızca ne olacağı ve neden önemli olduğu gösterilir;
 * hangi grafikte izleneceği (Uzman sayfaları) burada yer almaz. */
export function Uyarilar({ liste }: { liste: readonly Uyari[] }) {
  return (
    <div className="uyarilar">
      {liste.map((u) => (
        <article key={u.baslik} className={`uy ${u.seviye}`}>
          <h3>{u.baslik}</h3>
          <p>{u.ozet}</p>
          <details><summary>Neden önemli?</summary><p>{u.neden}</p></details>
        </article>
      ))}
    </div>
  );
}
