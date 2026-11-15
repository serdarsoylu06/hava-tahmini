/** Yana kaydırılan düğme şeridi: sığmayan düğmeler alt satıra inmez, şerit kaydırılır. Kaydırılacak yer olduğunu
 * o kenardaki solma ve ok düğmesi gösterir (ok, şeridi o yöne kaydırır); sona gelince kaybolur. */
import { type ReactNode, useEffect, useRef, useState } from "react";

export interface SeritOzellik {
  children: ReactNode;
  /** Ekran okuyucu için şeridin adı. */
  etiket: string;
  /** Sayfa gezinmesi için "nav", seçenek grubu için "group". */
  tur?: "nav" | "group";
  className?: string;
  /** Bu değer değişince seçili düğme (aria-current="page" ya da tek seçili aria-pressed) görünür alana getirilir. */
  secili?: unknown;
}

export function Serit({ children, etiket, tur = "group", className, secili }: SeritOzellik) {
  const ic = useRef<HTMLDivElement>(null);
  const [tasma, setTasma] = useState({ sol: false, sag: false });
  const olc = () => {
    const el = ic.current;
    if (!el) return;
    const sol = el.scrollLeft > 4, sag = el.scrollLeft + el.clientWidth < el.scrollWidth - 4;
    setTasma((t) => (t.sol === sol && t.sag === sag ? t : { sol, sag }));
  };
  useEffect(() => {
    const el = ic.current;
    if (!el) return;
    el.addEventListener("scroll", olc, { passive: true });
    const gozcu = new ResizeObserver(olc);
    gozcu.observe(el);
    return () => { el.removeEventListener("scroll", olc); gozcu.disconnect(); };
  }, []);
  useEffect(olc);                                           // içerik değişince (düğme sayısı, adlar) yeniden ölçülür
  useEffect(() => {
    const el = ic.current;
    if (!el || secili === undefined) return;
    const hedef = el.querySelector<HTMLElement>('[aria-current="page"]') ?? (el.querySelectorAll('[aria-pressed="true"]').length === 1 ? el.querySelector<HTMLElement>('[aria-pressed="true"]') : null);
    if (!hedef) return;
    // seçili düğme solan kenarın (72 px) dışında kalsın; sayfanın kendisi kaymasın diye scrollIntoView kullanılmaz
    const sol = hedef.offsetLeft - 72, sag = hedef.offsetLeft + hedef.offsetWidth + 72;
    if (sol < el.scrollLeft) el.scrollTo({ left: Math.max(sol, 0) });
    else if (sag > el.scrollLeft + el.clientWidth) el.scrollTo({ left: sag - el.clientWidth });
  }, [secili]);
  const kaydir = (yon: 1 | -1) => ic.current?.scrollBy({ left: yon * ic.current.clientWidth * 0.7, behavior: "smooth" });
  const Kap = tur === "nav" ? "nav" : "div";
  return (
    <Kap className={className ? `serit ${className}` : "serit"} role={tur === "group" ? "group" : undefined} aria-label={etiket}
         data-sol={tasma.sol || undefined} data-sag={tasma.sag || undefined}>
      <div ref={ic} className="serit-ic">{children}</div>
      {/* oklar yalnızca görsel ipucudur ve fareyle kolaylık sağlar; klavye ve ekran okuyucu düğmelere doğrudan ulaşır */}
      {tasma.sol && <button type="button" className="serit-ok sol" tabIndex={-1} aria-hidden="true" onClick={() => kaydir(-1)}>‹</button>}
      {tasma.sag && <button type="button" className="serit-ok sag" tabIndex={-1} aria-hidden="true" onClick={() => kaydir(1)}>›</button>}
    </Kap>
  );
}
