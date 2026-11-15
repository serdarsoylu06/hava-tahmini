/** Sayfaların paylaştığı küçük parçalar: veri yükleme durumu, başlık, ölçüt kartı, okuma rehberi. */
import { type ReactNode, useEffect, useState } from "react";
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

export function Durum<T>({ d, bekleme = "Veri indiriliyor…", children }: { d: Yukleme<T>; bekleme?: string; children: (veri: T) => ReactNode }) {
  if (d.tur === "yukleniyor") return <p className="an-not" role="status">{bekleme}</p>;
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

export function SayfaBasligi({ baslik, children }: { baslik: string; children?: ReactNode }) {
  return <header className="sy-bas"><h2>{baslik}</h2>{children && <p>{children}</p>}</header>;
}

export function Bolum({ baslik, aciklama }: { baslik: string; aciklama?: string }) {
  return <div className="bl"><h2>{baslik}</h2>{aciklama && <span className="bl-ac">{aciklama}</span>}</div>;
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
