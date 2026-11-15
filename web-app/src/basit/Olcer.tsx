import type { Gosterge } from "./metin";

const sinirla = (v: number) => Math.min(Math.max(v, 0.002), 1);

/** Halka ya da yarım daire gösterge. Yay uzunluğu `stroke-dasharray` ile verilir; ikinci sayı yayın tamamından
 * uzun tutulur ki yolun sonunda fazladan bir nokta çizilmesin. */
export function Olcer({ g }: { g: Gosterge }) {
  const oran = sinirla(g.oran);
  const cevre = 2 * Math.PI * 38, yay = Math.PI * 40;
  return (
    <section className="yz ol-kart" aria-label={g.sesli}>
      <div className={`ol-gosterge ${g.tur}`}>
        {g.tur === "halka" ? (
          <svg viewBox="0 0 100 100" aria-hidden="true">
            <circle cx="50" cy="50" r="38" fill="none" className="ol-iz" strokeWidth="10" />
            <circle cx="50" cy="50" r="38" fill="none" stroke={g.renk} strokeWidth="10" strokeLinecap="round"
                    strokeDasharray={`${(oran * cevre).toFixed(1)} ${(cevre * 2).toFixed(1)}`} transform="rotate(-90 50 50)" />
          </svg>
        ) : (
          <svg viewBox="0 0 100 60" aria-hidden="true">
            <path d="M10 52 A40 40 0 0 1 90 52" fill="none" className="ol-iz" strokeWidth="10" strokeLinecap="round" />
            <path d="M10 52 A40 40 0 0 1 90 52" fill="none" stroke={g.renk} strokeWidth="10" strokeLinecap="round"
                  strokeDasharray={`${(oran * yay).toFixed(1)} ${(yay * 2).toFixed(1)}`} />
          </svg>
        )}
        <span>{g.deger}</span>
      </div>
      <div><h3>{g.ad}</h3><p>{g.aciklama}</p></div>
    </section>
  );
}
