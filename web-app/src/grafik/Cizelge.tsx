/** HavaLabSS'in kendi çizelgesi: hazır bir grafik kitaplığı kullanmadan, SVG ile çizer.
 *
 * Bir çizelge, aynı zaman eksenini paylaşan alt alta panellerden oluşur; her panelin kendi dikey ekseni vardır
 * (iki ayrı ölçek aynı panele sıkıştırılmaz). Üzerine gelince ya da dokununca bütün panellerde aynı an işaretlenir
 * ve tek bir ipucu kutusu o anın bütün değerlerini gösterir. Klavyeyle de gezilir (← → Home End Esc) ve her
 * çizelgenin altında aynı veriyi veren bir tablo görünümü bulunur.
 *
 * Renkler kartın açık zeminine göre seçilmiştir (.ak kartı iki temada da açık renklidir); yazılar seri rengini
 * değil kartın yazı rengini kullanır. Hesap kısmı `olcek.ts` dosyasındadır. */
import { type KeyboardEvent, type PointerEvent, type ReactNode, useEffect, useLayoutEffect, useMemo, useRef, useState } from "react";
import type { Deger } from "../veri/tipler";
import { useKoyuTema } from "../kabuk/tema";
import { ekranRengi } from "./renk";
import { alanYolu, bantYolu, duzYol, eksen, eksenYazisi, enYakinSira, etiketSec, type Nokta, parcalar, xKonum, yumusakYol } from "./olcek";

type Desen = "duz" | "kesik" | "nokta";

export interface CizgiSerisi {
  tur: "cizgi";
  /** Lejantta görünen ad; verilmezse seri lejanta girmez. */
  ad?: string;
  deger: readonly Deger[];
  renk: string;
  kalinlik?: number;
  desen?: Desen;
  /** Çizginin altı soluk bir dolguyla tabana kadar boyanır. */
  dolgu?: boolean;
  /** Noktalar düz çizgiyle birleştirilir (varsayılan: yumuşak, tekdüze eğri). */
  duz?: boolean;
  opaklik?: number;
  /** İmleç bu serinin üstünde nokta göstermez (ör. ansambl üyeleri). */
  sessiz?: boolean;
  /** Çizginin üstüne aralıklı değer etiketi: `enAz` piksel aralıkla. */
  etiket?: { enAz: number; bicim: (v: number) => string };
}
export interface CubukSerisi {
  tur: "cubuk";
  ad?: string;
  deger: readonly Deger[];
  renk: string;
  /** Çubuğun ucuna yazılacak yazı (sığanlar yazılır); `null` dönen çubuğa yazı konmaz. */
  etiket?: (v: number, i: number) => string | null;
  /** Çubuk başına renk (ör. normalden sapmaya göre); verilmeyen sıralar `renk`i kullanır. */
  renkler?: readonly (string | null)[];
  /** Yan yana çubuklar: bu serinin sırası ve toplam seri sayısı (ör. [0, 2] ve [1, 2]). */
  grup?: readonly [number, number];
  /** Soluk çubuk (ör. henüz bitmemiş ay); 0–1. */
  opaklik?: number;
}
/** Her sıranın şeridini panel boyunca tek renkle boyar (ısınma şeritleri). */
export interface SeritSerisi {
  tur: "serit";
  renkler: readonly (string | null)[];
}
/** Tek tek işaretler (çizgiyle birleştirilmez). */
export interface NoktaSerisi {
  tur: "nokta";
  ad?: string;
  deger: readonly Deger[];
  renk: string;
  sekil?: "daire" | "elmas";
}
export interface BantSerisi {
  tur: "bant";
  ad?: string;
  alt: readonly Deger[];
  ust: readonly Deger[];
  renk: string;
}
export type Seri = CizgiSerisi | CubukSerisi | BantSerisi | SeritSerisi | NoktaSerisi;

export interface Panel {
  baslik?: string;
  /** Çizim alanının yüksekliği (piksel). */
  boy: number;
  seriler: readonly Seri[];
  taban?: number;
  tavan?: number;
  /** Yaklaşık eksen aralığı sayısı. */
  hedef?: number;
  /** Elle verilen eksen çizgileri. */
  cizgiler?: readonly number[];
  /** Eksen yazısı. */
  bicim?: (v: number) => string;
  /** Çizim alanının üstünde bırakılacak boşluk (değer etiketleri için). */
  ustBosluk?: number;
  /** Dikey işaret çizgileri (ör. bugün): sıra numaraları. */
  isaret?: readonly number[];
  /** Dikey eksen ve ızgara çizilmez (ör. şeritler). */
  eksensiz?: boolean;
  /** Panelin en üstünde, aralıklı çizilen küçük simgeler (ör. hava durumu): `ciz` 24×24 birimlik bir SVG çizimi
   * döndürür. `ustBosluk` simgelere ve altlarındaki etiketlere yer bırakacak kadar olmalıdır. */
  simge?: { enAz: number; ciz: (i: number) => ReactNode };
  /** Yatay eşik çizgileri (ör. "1 m riskli"); adı çizginin sol ucunun üstüne yazılır. */
  esik?: readonly { deger: number; renk: string; ad?: string }[];
}

export interface CizelgeOzellik {
  /** Zaman adımı sayısı; bütün seriler bu uzunluktadır. */
  n: number;
  paneller: readonly Panel[];
  /** Her değer kendi şeridinin ortasında durur (çubuklu çizelgeler). */
  bant?: boolean;
  /** Yatay eksen yazısı; `null` dönen sıralara yazı konmaz. Üst üste binenler kendiliğinden elenir. */
  xEtiket: (i: number) => string | null;
  /** Dikey ayırıcı çizgi (ör. gün başı); bu sıraların yazısı önceliklidir. */
  dikey?: (i: number) => boolean;
  /** Gölgelenecek sıra aralıkları (ör. gece saatleri). */
  golge?: readonly (readonly [number, number])[];
  /** Seçili an için ipucu içeriği. */
  ipucu: (i: number) => ReactNode;
  /** Ekran okuyucu için çizelgenin adı. */
  etiket: string;
  /** Bir ana dokununca (ya da klavyede Enter/boşlukla) çağrılır: çizelgeden bir an seçtirmek için. */
  sec?: (i: number) => void;
  /** Tablo görünümü: sütun başlıkları ve her sıranın hücreleri. */
  tablo?: { basliklar: readonly string[]; satir: (i: number) => readonly string[] };
}

const HARF = 6.7;                       // 11,5 px Inter'de (eşit genişlikli rakamlar) bir karakterin yaklaşık genişliği
const DESEN: Record<Desen, string | undefined> = { duz: undefined, kesik: "6 4", nokta: "1 4.5" };
const yuv = (v: number) => Math.round(v * 10) / 10;

function panelDegerleri(p: Panel): Deger[] {
  const hepsi: Deger[] = [];
  for (const s of p.seriler) {
    if (s.tur === "bant") hepsi.push(...s.alt, ...s.ust); else if (s.tur !== "serit") hepsi.push(...s.deger);
  }
  for (const e of p.esik ?? []) hepsi.push(e.deger);
  return hepsi;
}

/** Tek çubuğun yolu: ucu yuvarlak, tabanı düz. */
function tekCubuk(v: Deger | undefined, cx: number, y: (v: number) => number, taban: number, en: number): string {
  if (v == null || !Number.isFinite(v)) return "";
  const ust = y(v), boy = taban - ust;
  if (boy <= 0.2) return "";
  const sol = cx - en / 2, r = en >= 6 ? Math.min(4, en / 2, boy) : 0;
  return r
    ? `M${yuv(sol)} ${yuv(taban)}V${yuv(ust + r)}Q${yuv(sol)} ${yuv(ust)} ${yuv(sol + r)} ${yuv(ust)}H${yuv(sol + en - r)}Q${yuv(sol + en)} ${yuv(ust)} ${yuv(sol + en)} ${yuv(ust + r)}V${yuv(taban)}Z`
    : `M${yuv(sol)} ${yuv(taban)}V${yuv(ust)}H${yuv(sol + en)}V${yuv(taban)}Z`;
}

const elmas = (cx: number, cy: number, r: number) => `M${yuv(cx)} ${yuv(cy - r)}L${yuv(cx + r)} ${yuv(cy)}L${yuv(cx)} ${yuv(cy + r)}L${yuv(cx - r)} ${yuv(cy)}Z`;

function Anahtar({ s }: { s: Seri }) {
  if (s.tur === "cizgi")
    return <svg width="18" height="8" aria-hidden="true"><line x1="1" y1="4" x2="17" y2="4" stroke={s.renk} strokeWidth={Math.max(s.kalinlik ?? 2, 1.5)}
                strokeDasharray={DESEN[s.desen ?? "duz"]} strokeLinecap="round" opacity={s.opaklik != null ? Math.max(s.opaklik, 0.5) : 1} /></svg>;
  if (s.tur === "nokta")
    return <svg width="12" height="12" aria-hidden="true">{s.sekil === "elmas" ? <path d={elmas(6, 6, 5)} fill={s.renk} /> : <circle cx="6" cy="6" r="4" fill={s.renk} />}</svg>;
  if (s.tur === "serit") return null;
  return <svg width="12" height="10" aria-hidden="true"><rect width="12" height="10" rx="2" fill={s.renk} opacity={s.tur === "bant" ? 0.3 : s.opaklik ?? 1} /></svg>;
}

export function Cizelge({ n, paneller: hamPaneller, bant = false, xEtiket, dikey, golge, ipucu, etiket, sec: secildi, tablo }: CizelgeOzellik) {
  // Seri renkleri açık karta göre tanımlıdır; koyu temada (kart da koyu) her biri karşılığıyla çizilir.
  const koyu = useKoyuTema();
  const paneller = useMemo<readonly Panel[]>(() => (koyu ? hamPaneller.map((p) => ({
    ...p,
    esik: p.esik?.map((e) => ({ ...e, renk: ekranRengi(e.renk, true) })),
    seriler: p.seriler.map((s): Seri => (s.tur === "serit" ? s : { ...s, renk: ekranRengi(s.renk, true) })),
  })) : hamPaneller), [hamPaneller, koyu]);
  const alan = useRef<HTMLDivElement>(null), kok = useRef<HTMLDivElement>(null), kutu = useRef<HTMLDivElement>(null);
  const [genislik, setGenislik] = useState(0);
  const [imlec, setImlec] = useState<{ sira: number; y: number | null } | null>(null);
  const [tabloAcik, setTabloAcik] = useState(false);

  useLayoutEffect(() => {
    const el = alan.current;
    if (!el) return;
    const olc = () => setGenislik(Math.round(el.clientWidth));
    olc();
    const gozcu = new ResizeObserver(olc);
    gozcu.observe(el);
    return () => gozcu.disconnect();
  }, []);

  // ---- yerleşim: eksenler, sol boşluk, çizim genişliği
  const duzen = useMemo(() => {
    const eksenler = paneller.map((p) => eksen(panelDegerleri(p), p));
    const yazilar = eksenler.map((e, i) => e.cizgiler.map((v) => (paneller[i]!.bicim ?? ((x: number) => eksenYazisi(x, e.adim)))(v)));
    const sol = Math.max(26, Math.ceil(Math.max(0, ...yazilar.flat().map((y) => y.length)) * HARF + 10));
    const sag = 10, ic = Math.max(genislik - sol - sag, 10);
    return { eksenler, yazilar, sol, sag, ic, x: (i: number) => xKonum(i, n, sol, ic, bant), serit: ic / Math.max(n, 1) };
  }, [paneller, genislik, n, bant]);

  // ---- değişmeyen çizim (imleç oynadıkça yeniden hesaplanmaz)
  const cizimler = useMemo(() => {
    const { eksenler, yazilar, sol, ic, x, serit } = duzen;
    const adimPx = bant ? serit : ic / Math.max(n - 1, 1);
    return paneller.map((p, pi) => {
      const e = eksenler[pi]!, ust = p.ustBosluk ?? 6, son = pi === paneller.length - 1;
      const y = (v: number) => ust + p.boy - ((v - e.alt) / (e.ust - e.alt)) * p.boy;
      const taban = ust + p.boy;
      const ogeler: ReactNode[] = [];

      (golge ?? []).forEach(([a, b], k) => {
        const x0 = bant ? sol + a * serit : Math.max(x(a) - adimPx / 2, sol), x1 = bant ? sol + (b + 1) * serit : Math.min(x(b) + adimPx / 2, sol + ic);
        if (x1 > x0) ogeler.push(<rect key={`g${k}`} className="cz-golge" x={yuv(x0)} y={ust} width={yuv(x1 - x0)} height={p.boy} />);
      });
      if (!p.eksensiz) e.cizgiler.forEach((v, k) => {
        ogeler.push(<line key={`i${k}`} className={v === e.alt ? "cz-taban" : "cz-izgara"} x1={sol} x2={sol + ic} y1={yuv(y(v))} y2={yuv(y(v))} />);
        ogeler.push(<text key={`y${k}`} className="cz-yazi" x={sol - 6} y={yuv(y(v))} dy=".32em" textAnchor="end">{yazilar[pi]![k]}</text>);
      });
      if (dikey) for (let i = 1; i < n; i++) if (dikey(i)) {
        const xi = yuv(bant ? sol + i * serit : x(i));
        ogeler.push(<line key={`d${i}`} className="cz-gun" x1={xi} x2={xi} y1={ust} y2={taban} />);
      }

      p.seriler.forEach((s, si) => {
        if (s.tur === "bant") {
          const var_ = (i: number) => s.alt[i] != null && s.ust[i] != null;
          const ustP = parcalar(s.ust.map((v, i) => (var_(i) ? v : null)), x, y), altP = parcalar(s.alt.map((v, i) => (var_(i) ? v : null)), x, y);
          ogeler.push(<path key={`s${si}`} d={ustP.map((u, k) => bantYolu(u, altP[k]!)).join("")} fill={s.renk} opacity={0.22} />);
        } else if (s.tur === "serit") {
          s.renkler.forEach((r, i) => { if (r) ogeler.push(<rect key={`s${si}-${i}`} x={yuv(sol + i * serit)} y={ust} width={yuv(serit + 0.6)} height={p.boy} fill={r} />); });
        } else if (s.tur === "nokta") {
          s.deger.forEach((v, i) => {
            if (v == null) return;
            ogeler.push(s.sekil === "elmas"
              ? <path key={`s${si}-${i}`} className="cz-halka" d={elmas(x(i), y(v), 7)} fill={s.renk} />
              : <circle key={`s${si}-${i}`} className="cz-halka" cx={yuv(x(i))} cy={yuv(y(v))} r={4.5} fill={s.renk} />);
          });
        } else if (s.tur === "cubuk") {
          const [gs, gn] = s.grup ?? [0, 1];
          const en = gn > 1 ? Math.min(24, Math.max((serit - 4 - 2 * (gn - 1)) / gn, 1)) : Math.min(24, serit > 5 ? serit - 2 : serit * 0.8);
          const xc = (i: number) => x(i) + (gs - (gn - 1) / 2) * (en + 2);
          if (s.renkler) s.deger.forEach((v, i) => { const d = tekCubuk(v, xc(i), y, taban, en); if (d) ogeler.push(<path key={`s${si}-${i}`} d={d} fill={s.renkler![i] ?? s.renk} />); });
          else ogeler.push(<path key={`s${si}`} d={s.deger.map((v, i) => tekCubuk(v, xc(i), y, taban, en)).join("")} fill={s.renk} opacity={s.opaklik} />);
          if (s.etiket) {
            const yazi = s.deger.map((v, i) => (v == null ? null : s.etiket!(v, i)));
            const sigan = new Set(etiketSec(yazi.flatMap((t, i) => (t == null ? [] : [{ sira: i, x: xc(i), genislik: t.length * 7.3, oncelik: false }])), 2));
            yazi.forEach((t, i) => { if (t != null && sigan.has(i)) ogeler.push(<text key={`e${si}-${i}`} className="cz-deger" x={yuv(xc(i))} y={yuv(y(s.deger[i]!) - 6)} textAnchor="middle">{t}</text>); });
          }
        } else {
          const p2 = parcalar(s.deger, x, y), yol = (q: Nokta[]) => (s.duz ? duzYol(q) : yumusakYol(q));
          if (s.dolgu) ogeler.push(<path key={`a${si}`} d={p2.map((q) => alanYolu(q, taban, !s.duz)).join("")} fill={s.renk} opacity={0.13} />);
          ogeler.push(<path key={`s${si}`} d={p2.filter((q) => q.length > 1).map(yol).join("")} fill="none" stroke={s.renk} strokeWidth={s.kalinlik ?? 2}
                            strokeDasharray={DESEN[s.desen ?? "duz"]} strokeLinecap="round" strokeLinejoin="round" opacity={s.opaklik} />);
          p2.filter((q) => q.length === 1).forEach((q, k) => ogeler.push(<circle key={`t${si}-${k}`} cx={yuv(q[0]![0])} cy={yuv(q[0]![1])} r={(s.kalinlik ?? 2) * 0.9} fill={s.renk} opacity={s.opaklik} />));
          if (s.etiket) {
            const adim = Math.max(1, Math.ceil(s.etiket.enAz / Math.max(adimPx, 0.1)));
            s.deger.forEach((v, i) => {
              if (v == null || i % adim) return;
              ogeler.push(<circle key={`n${si}-${i}`} className="cz-halka" cx={yuv(x(i))} cy={yuv(y(v))} r={4} fill={s.renk} />);
              // etiket çizim alanının içinde kalır: soldaki eksen yazısına ya da sağ kenara taşmaz
              const yazi = s.etiket!.bicim(v), yari = (yazi.length * 7.3) / 2 + 2;
              const xe = Math.min(Math.max(x(i), sol + yari + 6), Math.max(sol + ic - yari, sol + yari + 6));
              ogeler.push(<text key={`e${si}-${i}`} className="cz-deger" x={yuv(xe)} y={yuv(y(v) - 10)} textAnchor="middle">{yazi}</text>);
            });
          }
        }
      });

      if (p.simge) {
        const adim = Math.max(1, Math.ceil(p.simge.enAz / Math.max(adimPx, 0.1)));
        for (let i = 0; i < n; i += adim) {
          const icerik = p.simge.ciz(i);
          const xs = Math.min(Math.max(x(i), sol + 11), Math.max(sol + ic - 11, sol + 11));
          if (icerik) ogeler.push(<g key={`h${i}`} className="hs" transform={`translate(${yuv(xs - 11)} 0) scale(${22 / 24})`}>{icerik}</g>);
        }
      }
      (p.esik ?? []).forEach((es, k) => {
        ogeler.push(<line key={`k${k}`} x1={sol} x2={sol + ic} y1={yuv(y(es.deger))} y2={yuv(y(es.deger))} stroke={es.renk} strokeWidth={1.5} strokeDasharray="5 4" />);
        // adı lejant yerine çizginin üstünde: lejant kısalır, hangi çizginin ne olduğu çizgiye bakınca okunur
        if (es.ad) ogeler.push(<text key={`ke${k}`} className="cz-esik" x={sol + 4} y={yuv(y(es.deger) - 4)} fill={es.renk}>{es.ad}</text>);
      });
      (p.isaret ?? []).forEach((i) => { if (i >= 0 && i < n) ogeler.push(<line key={`m${i}`} className="cz-isaret" x1={yuv(x(i))} x2={yuv(x(i))} y1={ust} y2={taban} />); });

      if (son) {
        const adaylar = [];
        // yazı çizim alanının sol kenarından (eksen yazılarının sağından) başlar, sağ kenarı aşmaz; üst üste binme
        // denetimi de bu kaydırılmış konumla yapılır
        const yerlestir = (xi: number, en: number) => Math.min(Math.max(xi, sol - 2 + en / 2), Math.max(genislik - en / 2, sol - 2 + en / 2));
        for (let i = 0; i < n; i++) { const t = xEtiket(i); if (t != null) { const en = t.length * HARF; adaylar.push({ sira: i, x: yerlestir(x(i), en), genislik: en, oncelik: dikey?.(i) ?? false, yazi: t }); } }
        const secilen = new Set(etiketSec(adaylar));
        for (const a of adaylar) if (secilen.has(a.sira)) {
          ogeler.push(<text key={`x${a.sira}`} className="cz-yazi" x={yuv(a.x)} y={taban + 15} textAnchor="middle">{a.yazi}</text>);
        }
      }
      return { ogeler, ust, taban, y, yukseklik: taban + (son ? 22 : 4) };
    });
  }, [duzen, paneller, n, bant, golge, dikey, xEtiket, genislik]);

  // ---- imleç
  const sec = (e: PointerEvent<HTMLDivElement>) => {
    const r = alan.current!.getBoundingClientRect();
    const i = enYakinSira(e.clientX - r.left, n, duzen.sol, duzen.ic, bant);
    setImlec({ sira: i, y: e.clientY - r.top });
    if (e.type === "pointerdown") secildi?.(i);
  };
  const tus = (e: KeyboardEvent<HTMLDivElement>) => {
    if (e.key === "Escape") { setImlec(null); return; }
    if ((e.key === "Enter" || e.key === " ") && secildi && imlec) { e.preventDefault(); secildi(imlec.sira); return; }
    if (!["ArrowRight", "ArrowLeft", "Home", "End"].includes(e.key)) return;
    e.preventDefault();
    setImlec((onceki) => {
      const simdi = onceki?.sira ?? -1;
      const yeni = e.key === "ArrowRight" ? simdi + 1 : e.key === "ArrowLeft" ? (simdi < 0 ? n - 1 : simdi - 1) : e.key === "Home" ? 0 : n - 1;
      return { sira: Math.min(Math.max(yeni, 0), n - 1), y: null };
    });
  };
  // dokunmatik ekranda ipucu parmak kalkınca da durur; çizelgenin dışına dokununca kapanır
  const acik = imlec != null;
  useEffect(() => {
    if (!acik) return;
    const disari = (e: Event) => { if (kok.current && !kok.current.contains(e.target as Node)) setImlec(null); };
    document.addEventListener("pointerdown", disari);
    return () => document.removeEventListener("pointerdown", disari);
  }, [acik]);
  useEffect(() => { setImlec(null); }, [n, paneller]);

  // ipucu kutusunu imlecin yanına, çizelgenin içinde kalacak biçimde yerleştir
  useLayoutEffect(() => {
    const el = kutu.current;
    if (!el || !imlec || !alan.current) return;
    const xi = duzen.x(imlec.sira), en = el.offsetWidth, boy = el.offsetHeight, toplam = alan.current.clientHeight;
    let sol = xi + 14;
    if (sol + en > genislik) sol = xi - 14 - en;
    sol = Math.min(Math.max(sol, 0), Math.max(genislik - en, 0));
    let ust = imlec.y == null ? 4 : imlec.y - boy - 16;
    if (ust < 0) ust = imlec.y == null ? 4 : Math.min(imlec.y + 20, Math.max(toplam - boy, 0));
    el.style.transform = `translate(${Math.round(sol)}px, ${Math.round(ust)}px)`;
  }, [imlec, duzen, genislik]);

  const sira = imlec && imlec.sira < n ? imlec.sira : null;
  return (
    <div ref={kok} className="cz" role="group" aria-label={`${etiket}. Ok tuşlarıyla saatler arasında gezilir.`} tabIndex={0} onKeyDown={tus}>
      <div ref={alan} className={secildi ? "cz-alan cz-secilir" : "cz-alan"} onPointerDown={sec} onPointerMove={sec} onPointerLeave={(e) => { if (e.pointerType === "mouse") setImlec(null); }}>
        {paneller.map((p, pi) => {
          const c = cizimler[pi]!, adli = p.seriler.filter((s): s is Exclude<Seri, SeritSerisi> => s.tur !== "serit" && Boolean(s.ad));
          const xi = sira == null ? 0 : duzen.x(sira);
          return (
            <div key={pi} className="cz-panel">
              {(p.baslik || adli.length > 1) && (
                <div className="cz-bas">
                  {p.baslik && <b>{p.baslik}</b>}
                  {adli.length > 1 && (
                    <ul className="cz-lejant">
                      {adli.map((s) => <li key={s.ad}><Anahtar s={s} />{s.ad}</li>)}
                    </ul>
                  )}
                </div>
              )}
              <svg width={genislik || undefined} height={c.yukseklik} aria-hidden="true" focusable="false">
                {genislik > 0 && c.ogeler}
                {genislik > 0 && sira != null && (
                  <g>
                    {bant && duzen.serit >= 6
                      ? <rect className="cz-sutun" x={yuv(duzen.sol + sira * duzen.serit)} y={c.ust} width={yuv(duzen.serit)} height={c.taban - c.ust} />
                      : <line className="cz-imlec" x1={yuv(xi)} x2={yuv(xi)} y1={c.ust} y2={c.taban} />}
                    {p.seriler.map((s, si) => (s.tur === "cizgi" && !s.sessiz && s.deger[sira] != null
                      ? <circle key={si} className="cz-halka" cx={yuv(xi)} cy={yuv(c.y(s.deger[sira]!))} r={4.5} fill={s.renk} /> : null))}
                  </g>
                )}
              </svg>
            </div>
          );
        })}
        <div ref={kutu} className="cz-ipucu" aria-live="polite" hidden={sira == null}>{sira != null && ipucu(sira)}</div>
      </div>
      {tablo && (
        <details className="cz-tablo" onToggle={(e) => setTabloAcik(e.currentTarget.open)}>
          <summary>Veriyi tablo olarak göster</summary>
          {tabloAcik && (
            <div className="cz-tablo-ic" tabIndex={0} role="region" aria-label={`${etiket}, tablo`}>
              <table>
                <thead><tr>{tablo.basliklar.map((b) => <th key={b} scope="col">{b}</th>)}</tr></thead>
                <tbody>{Array.from({ length: n }, (_, i) => <tr key={i}>{tablo.satir(i).map((h, k) => (k ? <td key={k}>{h}</td> : <th key={k} scope="row">{h}</th>))}</tr>)}</tbody>
              </table>
            </div>
          )}
        </details>
      )}
    </div>
  );
}

/** İpucu kutusunun başlığı (seçili an). */
export function IpucuBasligi({ children }: { children: ReactNode }) {
  return <div className="cz-ip-bas">{children}</div>;
}

/** İpucu satırı: serinin çizgi anahtarı, adı ve (öne çıkan) değeri. */
export function IpucuSatiri({ renk, desen, ad, deger }: { renk?: string; desen?: Desen; ad: string; deger: string }) {
  return (
    <div className="cz-ip-satir">
      {renk ? <svg width="14" height="8" aria-hidden="true"><line x1="1" y1="4" x2="13" y2="4" stroke={renk} strokeWidth="2.5" strokeDasharray={DESEN[desen ?? "duz"]} strokeLinecap="round" /></svg> : <span className="cz-ip-bos" />}
      <span className="cz-ip-ad">{ad}</span><strong>{deger}</strong>
    </div>
  );
}
