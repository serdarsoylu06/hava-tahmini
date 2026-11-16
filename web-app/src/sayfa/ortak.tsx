/** Sayfaların paylaştığı küçük parçalar: veri yükleme durumu, başlık, ölçüt kartı, okuma rehberi. */
import { type ReactNode, useEffect, useRef, useState } from "react";
import type { Istemci } from "../veri/istemci";
import type { Konum, Tahmin } from "../veri/tipler";

/** Her sayfanın aldığı ortak girdiler. */
export interface SayfaOzellik { istemci: Istemci; konum: Konum; tahmin: Tahmin }

export type Yukleme<T> = { tur: "yukleniyor" } | { tur: "hazir"; veri: T } | { tur: "hata"; mesaj: string };

/** Bir veri isteğini bileşene bağlar; bağımlılıklar değişince yeniden ister, eski yanıt geç gelirse yok sayar. */
export function useVeri<T>(getir: () => Promise<T>, bagimlilik: readonly unknown[]): Yukleme<T> {
  const [d, setD] = useState<Yukleme<T>>({ tur: "yukleniyor" });
  useEffect(() => {
    let gecerli = true;
    setD({ tur: "yukleniyor" });
    getir().then((veri) => { if (gecerli) setD({ tur: "hazir", veri }); })
      .catch((e: unknown) => { if (gecerli) setD({ tur: "hata", mesaj: e instanceof Error ? e.message : String(e) }); });
    return () => { gecerli = false; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, bagimlilik);
  return d;
}

/** İskelet yükleme ekranı: içeriğin gri taslağı. İçerik gelince yerleşim zıplamasın diye taslak, gelecek içeriğin
 * kabaca biçimindedir. Ne beklendiği altta yazıyla da söylenir (uzun süren indirmelerde ve ekran okuyucuda). */
export function Iskelet({ tur, mesaj = "Veri indiriliyor…" }: { tur: "basit" | "sayfa" | "harita" | "panel"; mesaj?: string }) {
  return (
    <div className={`isk isk-${tur}`} role="status">
      {tur === "basit" && <><i className="isk-blok isk-kart" /><i className="isk-blok isk-satir" /><i className="isk-blok isk-grafik" /></>}
      {tur === "sayfa" && <><div className="isk-dortlu"><i className="isk-blok" /><i className="isk-blok" /><i className="isk-blok" /><i className="isk-blok" /></div><i className="isk-blok isk-grafik" /></>}
      {tur === "harita" && <i className="isk-blok isk-harita" />}
      {tur === "panel" && <><i className="isk-blok isk-satir" /><i className="isk-blok isk-grafik" /></>}
      <p>{mesaj}</p>
    </div>
  );
}

export function Durum<T>({ d, bekleme = "Veri indiriliyor…", iskelet = "sayfa", children }: { d: Yukleme<T>; bekleme?: string; iskelet?: "sayfa" | "panel"; children: (veri: T) => ReactNode }) {
  if (d.tur === "yukleniyor") return <Iskelet tur={iskelet} mesaj={bekleme} />;
  if (d.tur === "hata") return <p className="an-not an-hata" role="alert">Veri alınamadı. {d.mesaj}</p>;
  return <>{children(d.veri)}</>;
}

/** Metindeki **kalın** işaretlerini <strong> yapar. */
export const kalin = (m: string): ReactNode[] => m.split("**").map((p, i) => (i % 2 ? <strong key={i}>{p}</strong> : p));

/** Ondalık virgüllü sayı; eksikse "—". */
export const sayi = (x: number | null | undefined, n = 0) => {
  if (x == null || !Number.isFinite(x)) return "—";
  const yazi = x.toFixed(n);
  // −0,4 sıfır haneyle "-0" olur; eksi işareti yalnızca yazılan sayı sıfırdan farklıysa kalır
  return (Number(yazi) === 0 ? yazi.replace("-", "") : yazi).replace(".", ",").replace("-", "−");
};
/** İşaretli sayı (+1,2 / −0,4). */
export const isaretli = (x: number | null | undefined, n = 1) => (x == null || !Number.isFinite(x) ? "—" : `${x >= 0 ? "+" : "−"}${Math.abs(x).toFixed(n).replace(".", ",")}`);

/** Sayfa başlığı. `yer` başlığın yanında (telefonda altında, küçük) yazılır; `sag` dönem seçimi gibi denetimler
 * içindir. Tanıtım telefonda tek satıra kısalır ve "devamı" ile açılır: içerik ekranın üstünde başlasın. */
export function SayfaBasligi({ baslik, yer, sag, children }: { baslik: string; yer?: ReactNode; sag?: ReactNode; children?: ReactNode }) {
  const [acik, setAcik] = useState(false);
  return (
    <header className="sy-bas">
      <div className="sy-bas-ust">
        <h2>{baslik}{yer && <span className="sy-yer"><i aria-hidden="true"> · </i>{yer}</span>}</h2>
        {sag}
      </div>
      {children && (
        <div className={acik ? "sy-tanitim" : "sy-tanitim kisa"}>
          <p>{children}</p>
          <button type="button" aria-expanded={acik} onClick={() => setAcik((a) => !a)}>{acik ? "kısalt" : "devamı"}</button>
        </div>
      )}
    </header>
  );
}

/** Bölüm başlığı. `kisa`, telefondaki bölüm çubuğunda görünen addır. */
export function Bolum({ baslik, aciklama, kisa }: { baslik: string; aciklama?: string; kisa?: string }) {
  return <div className="bl" data-bolum={kisa ?? baslik}><h2>{baslik}</h2>{aciklama && <span className="bl-ac">{aciklama}</span>}</div>;
}

/** Uzun sayfalar için bölüm çubuğu (yalnızca telefonda görünür): sayfadaki `Bolum` başlıklarını listeler, dokununca
 * o bölüme kayar, kaydırırken bulunulan bölümü işaretler. Bölümler veri gelince oluştuğu için sayfa izlenir. */
export function BolumCubugu() {
  const kok = useRef<HTMLElement>(null);
  const [bolumler, setBolumler] = useState<readonly string[]>([]);
  const [etkin, setEtkin] = useState(0);
  const basliklar = () => [...(kok.current?.closest(".sy")?.querySelectorAll<HTMLElement>("[data-bolum]") ?? [])];
  useEffect(() => {
    const sy = kok.current?.closest(".sy");
    if (!sy) return;
    const tara = () => setBolumler((eski) => { const yeni = basliklar().map((b) => b.dataset.bolum!); return yeni.join("|") === eski.join("|") ? eski : yeni; });
    const kaydir = () => { let i = 0; basliklar().forEach((b, k) => { if (b.getBoundingClientRect().top < 130) i = k; }); setEtkin(i); };
    tara(); kaydir();
    const gozcu = new MutationObserver(tara);
    gozcu.observe(sy, { childList: true, subtree: true });
    addEventListener("scroll", kaydir, { passive: true });
    return () => { gozcu.disconnect(); removeEventListener("scroll", kaydir); };
  }, []);
  // işaretli bölüm çubukta görünür kalsın (çubuk yana kayar)
  useEffect(() => { const d = kok.current?.children[etkin] as HTMLElement | undefined; if (d && kok.current) kok.current.scrollTo({ left: d.offsetLeft - 16 }); }, [etkin]);
  const git = (i: number) => basliklar()[i]?.scrollIntoView({ behavior: matchMedia("(prefers-reduced-motion: reduce)").matches ? "auto" : "smooth", block: "start" });
  return (
    <nav ref={kok} className="sy-bolumler" aria-label="Sayfa bölümleri" hidden={bolumler.length < 2}>
      {bolumler.map((b, i) => <button key={b} type="button" aria-current={i === etkin ? "true" : undefined} onClick={() => git(i)}>{b}</button>)}
    </nav>
  );
}

/** Tek sayılık özet kartı: başlık, büyük değer, altında kısa ek ve isteğe bağlı açıklama. */
export function Olcut({ baslik, deger, ek, aciklama }: { baslik: string; deger: ReactNode; ek?: ReactNode; aciklama?: string }) {
  return (
    <div className="yz olcut">
      <dt>{baslik}</dt>
      <dd>{deger}</dd>
      {ek && <p>{ek}</p>}
      {aciklama && <details><summary>Açıklama</summary><p>{aciklama}</p></details>}
    </div>
  );
}

/** Numaralı okuma rehberi (Streamlit'teki `okuma_rehberi`). */
export function Rehber({ baslik = "Bu grafik nasıl okunur?", adimlar }: { baslik?: string; adimlar: readonly (readonly [string, string])[] }) {
  return (
    <details className="yz rehber">
      <summary>{baslik}</summary>
      <ol>{adimlar.map(([b, m]) => <li key={b}><strong>{b}</strong> — {kalin(m)}</li>)}</ol>
    </details>
  );
}

/** Bilgi, uyarı ya da iyi haber kutusu. */
export function Not({ tur = "bilgi", baslik, children }: { tur?: "bilgi" | "dikkat" | "tehlike" | "iyi"; baslik?: string; children: ReactNode }) {
  return <div className={`uy ${tur} sy-not`}>{baslik && <h3>{baslik}</h3>}<p>{children}</p></div>;
}
