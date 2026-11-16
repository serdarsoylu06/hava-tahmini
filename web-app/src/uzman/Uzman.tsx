/** Uzman mod: harita merkezli analiz ekranı. Masaüstünde sol kontrol paneli, ortada harita, sağda analiz paneli;
 * telefonda tam genişlikte harita ve sürüklenebilir alt panel. */
import { Fragment, type ReactNode, useEffect, useMemo, useRef, useState } from "react";
import { useKoyuTema } from "../kabuk/tema";
import { GUNLER, haftaGunu, yerelSaat } from "../ortak/zaman";
import type { Istemci } from "../veri/istemci";
import type { Konum, Tahmin } from "../veri/tipler";
import { Harita, type HaritaKaynaklari } from "./Harita";
import { type AlanMeta, alanMeta, alanSec, ayniZaman, DENIZ_ALANLARI, DENIZ_KAYNAGI, enYakinZaman, kosuYaz, MODELLER, type ModelKodu, omAdresi, ufukSaati } from "./katmanlar";
import { TUM_KATMANLAR as KATMANLAR } from "./katmanMetinleri";
import { gosterim, Lejant, olcekBirimi } from "./Lejant";

const MODEL_ANAHTARI = "havalab_model", KATMAN_ANAHTARI = "havalab_katman", INCE_ANAHTARI = "havalab_ince";
const ILK_DENIZ = KATMANLAR.find((k) => k.deniz)?.kod;
const oku = (k: string) => { try { return localStorage.getItem(k); } catch { return null; } };
const sakla = (k: string, v: string) => { try { localStorage.setItem(k, v); } catch { /* depo kapalı: seçim bu oturumda kalır */ } };

/** Bir değeri, değişmesi durduktan `ms` sonra iletir: zaman çubuğu sürüklenirken her adım için dosya indirilmesin. */
function useGecikmeli<T>(deger: T, ms: number): T {
  const [g, setG] = useState(deger);
  useEffect(() => { const s = setTimeout(() => setG(deger), ms); return () => clearTimeout(s); }, [deger, ms]);
  return g;
}

/** "**kalın** düz" → <strong> (katman açıklamaları Streamlit'teki Markdown metinleridir). */
function kalin(metin: string): ReactNode[] {
  return metin.split("**").map((p, i) => (i % 2 ? <strong key={i}>{p}</strong> : p));
}

const yerelYaz = (utc: string, tz: string) => {
  const t = yerelSaat(new Date(utc), tz);
  return `${GUNLER[haftaGunu(t)]} ${t.slice(8, 10)}.${t.slice(5, 7)} ${t.slice(11, 16)}`;
};

export interface UzmanOzellik {
  istemci: Istemci;
  konum: Konum;
  tahmin: Tahmin;
  /** Haritadan bir nokta seçildiğinde: uygulamanın konumu o nokta olur. */
  noktaSec: (lat: number, lon: number) => void;
  /** Sağ paneldeki analiz (meteogram, modeller, ansambl). */
  analiz: (model: ModelKodu) => ReactNode;
}

type AlanDurumu = { tur: "yukleniyor" } | { tur: "hazir"; metalar: AlanMeta[] } | { tur: "hata"; mesaj: string };
const YUKSEKLIKLER = ["kapali", "yarim", "tam"] as const;

export function Uzman({ istemci, konum, tahmin, noktaSec, analiz }: UzmanOzellik) {
  const koyu = useKoyuTema();
  const [model, setModel] = useState<ModelKodu>(() => { const m = oku(MODEL_ANAHTARI); return m === "icon" || m === "gfs" ? m : "ecmwf"; });
  const [katmanKodu, setKatmanKodu] = useState(() => { const k = oku(KATMAN_ANAHTARI); return KATMANLAR.some((x) => x.kod === k) ? k! : KATMANLAR[0]!.kod; });
  /** İnce ızgara (varsa) açık mı? Kapalı başlar: ince ızgara belirgin biçimde yavaş yüklenir. */
  const [ince, setInce] = useState(() => oku(INCE_ANAHTARI) === "1");
  const [alanlar, setAlanlar] = useState<AlanDurumu>({ tur: "yukleniyor" });
  /** Seçili geçerlilik zamanı (UTC). null: "şu an"a en yakın adım. Model değişince aynı an korunur. */
  const [seciliZaman, setSeciliZaman] = useState<string | null>(null);
  const [yukleniyor, setYukleniyor] = useState(false);
  const [haritaHatasi, setHaritaHatasi] = useState("");
  const [dokunulan, setDokunulan] = useState<{ lat: number; lon: number; deger: number | null } | null>(null);
  const [yukseklik, setYukseklik] = useState<(typeof YUKSEKLIKLER)[number]>("kapali");

  const katman = KATMANLAR.find((k) => k.kod === katmanKodu) ?? KATMANLAR[0]!;
  const deniz = Boolean(katman.deniz);
  // hava katmanları modelin kendi alanlarından, deniz katmanları deniz modellerinin alanlarından okunur; yalnızca
  // seçili türün alan bilgisi indirilir
  const inceAlan = !deniz && ince ? MODELLER[model].ince?.alan : undefined;
  useEffect(() => {
    let gecerli = true;
    setAlanlar({ tur: "yukleniyor" });
    // ince ızgara açıksa listenin başına geçer: yayımladığı (yüzey) değişkenler ondan, kalanı kaba ızgaradan okunur
    Promise.all((deniz ? DENIZ_ALANLARI[model] : [...(inceAlan ? [inceAlan] : []), ...MODELLER[model].alanlar]).map((a) => alanMeta(istemci, a)))
      .then((metalar) => { if (gecerli) setAlanlar({ tur: "hazir", metalar }); })
      .catch((e: unknown) => { if (gecerli) setAlanlar({ tur: "hata", mesaj: e instanceof Error ? e.message : String(e) }); });
    return () => { gecerli = false; };
  }, [istemci, model, deniz, inceAlan]);

  const metalar = alanlar.tur === "hazir" ? alanlar.metalar : [];
  const alan = alanSec(metalar, katman.degisken);
  const zamanlar = alan?.gecerlilik ?? [];
  const sira = useMemo(() => {
    if (!alan) return 0;
    if (seciliZaman === null) return enYakinZaman(alan, new Date());
    return enYakinZaman(alan, new Date(seciliZaman));
  }, [alan, seciliZaman]);
  const gecerli = zamanlar[sira] ?? null;
  const haritaZamani = useGecikmeli(gecerli, 280);

  const kaynak = useMemo<HaritaKaynaklari>(() => {
    if (!alan || !haritaZamani || !alan.gecerlilik.includes(haritaZamani)) return { alan: null, cizgi: null, ok: null };
    // çizgiler ve oklar hep kaba ızgaradan okunur: ince ızgarada görünür bir fark yaratmazlar, yükü ise katlarlar
    const kaba = metalar.filter((x) => x.alan !== inceAlan);
    const cizgiAlani = katman.izo ? alanSec(kaba, katman.izo.degisken) : null;
    const cizgiZamani = cizgiAlani ? ayniZaman(cizgiAlani, haritaZamani) : null;
    const okAlani = katman.oklar ? alanSec(kaba, "wind_speed_10m") : null;
    const okZamani = okAlani ? ayniZaman(okAlani, haritaZamani) : null;
    return {
      alan: omAdresi(alan, haritaZamani, katman.degisken, { koyu, yumusak: true, alanAdi: MODELLER[model].birlesik?.[alan.alan] }),
      cizgi: cizgiAlani && cizgiZamani && katman.izo ? omAdresi(cizgiAlani, cizgiZamani, katman.izo.degisken, { kontur: katman.izo.aralik }) : null,
      ok: okAlani && okZamani ? omAdresi(okAlani, okZamani, "wind_speed_10m", { oklar: true }) : null,
    };
    // metalar her render'da yeni bir dizi olabilir; alan durumu değişince yeniden hesaplanması yeterli
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [alanlar, alan, haritaZamani, katman, koyu, model, inceAlan]);

  const inceSec = (acik: boolean) => { setInce(acik); sakla(INCE_ANAHTARI, acik ? "1" : "0"); setHaritaHatasi(""); };
  const modelSec = (m: ModelKodu) => { setModel(m); sakla(MODEL_ANAHTARI, m); setHaritaHatasi(""); setOynuyor(false); };
  const katmanSec = (k: string) => { setKatmanKodu(k); sakla(KATMAN_ANAHTARI, k); setHaritaHatasi(""); setDokunulan(null); setOynuyor(false); };
  const adimAt = (fark: number) => { const yeni = zamanlar[Math.min(Math.max(sira + fark, 0), zamanlar.length - 1)]; if (yeni) setSeciliZaman(yeni); };

  // Oynatma: her adım, haritası yüklendikten kısa bir süre sonra bir sonrakine geçer. Adımlar ayrı ayrı indirildiği
  // için hız bağlantıya bağlıdır (adım başına birkaç saniye); kullanıcı zamanı, katmanı ya da modeli elle değiştirince durur.
  const [oynuyor, setOynuyor] = useState(false);
  useEffect(() => {
    if (!oynuyor) return;
    if (!alan || alanlar.tur === "hata" || haritaHatasi) { setOynuyor(false); return; }
    if (yukleniyor || haritaZamani !== gecerli) return;                      // bu adımın haritası gelene kadar beklenir
    if (sira >= zamanlar.length - 1) { setOynuyor(false); return; }
    const sayac = setTimeout(() => adimAt(1), 900);
    return () => clearTimeout(sayac);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [oynuyor, yukleniyor, haritaZamani, gecerli, sira, zamanlar.length, haritaHatasi]);

  // Tam ekran: harita bütün pencereyi kaplar (tarayıcının tam ekran özelliği iPhone'da öğe için çalışmadığından CSS ile)
  const [tamEkran, setTamEkran] = useState(false);
  useEffect(() => {
    if (!tamEkran) return;
    const tus = (e: KeyboardEvent) => { if (e.key === "Escape") setTamEkran(false); };
    document.addEventListener("keydown", tus);
    document.body.style.overflow = "hidden";                                // arkadaki sayfa kaymasın
    return () => { document.removeEventListener("keydown", tus); document.body.style.overflow = ""; };
  }, [tamEkran]);

  // alt panel (telefon): tutamaç sürüklenir ya da dokunulur
  const surukleme = useRef<{ y: number; tasindi: boolean } | null>(null);
  const tutamac = {
    onPointerDown: (e: React.PointerEvent) => { surukleme.current = { y: e.clientY, tasindi: false }; (e.target as Element).setPointerCapture(e.pointerId); },
    onPointerMove: (e: React.PointerEvent) => {
      const s = surukleme.current;
      if (!s || Math.abs(e.clientY - s.y) < 36) return;
      const i = YUKSEKLIKLER.indexOf(yukseklik) + (e.clientY < s.y ? 1 : -1);
      if (YUKSEKLIKLER[i]) { setYukseklik(YUKSEKLIKLER[i]); surukleme.current = { y: e.clientY, tasindi: true }; }
    },
    onPointerUp: () => { const s = surukleme.current; surukleme.current = null; if (s && !s.tasindi) setYukseklik((y) => (y === "kapali" ? "yarim" : y === "yarim" ? "tam" : "kapali")); },
  };

  const m = MODELLER[model];
  const yokMu = alanlar.tur === "hazir" && !alan;
  // ekranda gösterilen kaynak: deniz katmanında deniz modelinin adı, hava katmanında seçili model
  const kaynakBilgisi = (deniz && alan && DENIZ_KAYNAGI[alan.alan]) || null;
  const kaynakAdi = kaynakBilgisi?.ad ?? m.ad;
  const inceKullaniliyor = Boolean(inceAlan && alan?.alan === inceAlan);
  /** İnce ızgara seçeneği gösterilsin mi: modelde varsa ve katman bir yüzey katmanıysa (üst seviyeler onda yok). */
  const inceSecenegi = Boolean(m.ince) && !deniz && !katman.degisken.endsWith("hPa");
  /** Katman şu an yüklü alanlarda var mı? Öteki türün (hava/deniz) alanları yüklü olmadığından onlar seçilebilir sayılır. */
  const katmanVar = (k: (typeof KATMANLAR)[number]) => alanlar.tur !== "hazir" || Boolean(k.deniz) !== deniz || alanSec(metalar, k.degisken) !== null;
  return (
    <div className="uz">
      <aside className="yz uz-sol" aria-label="Harita ayarları">
        <h2>Model</h2>
        <div className="anahtar tam uz-secim" role="group" aria-label="Tahmin modeli">
          {(Object.keys(MODELLER) as ModelKodu[]).map((k) => (
            <button key={k} type="button" aria-pressed={model === k} onClick={() => modelSec(k)}>{MODELLER[k].ad}</button>
          ))}
        </div>
        <p className="uz-not">{kaynakBilgisi ? <>Bu katmanın kaynağı: <b>{kaynakBilgisi.ad}</b> · ızgara {kaynakBilgisi.cozunurluk}</>
          : <>{m.kurum} · ızgara {inceKullaniliyor ? m.ince!.cozunurluk : m.cozunurluk}</>}{alan && <> · koşu <b>{kosuYaz(alan.kosu)}</b></>}</p>
        {inceSecenegi && m.ince && (
          <label className="uz-ince">
            <input type="checkbox" checked={ince} onChange={(e) => inceSec(e.target.checked)} />
            <span>Ayrıntılı ızgara ({m.ince.cozunurluk})<small>Yalnızca yüzey katmanlarında. Her zaman adımının yüklenmesi 15–40 saniye sürer.</small></span>
          </label>
        )}

        <h2>Katman</h2>
        <div className="uz-katmanlar" role="group" aria-label="Harita katmanı">
          {KATMANLAR.map((k) => {
            const var_ = katmanVar(k);
            return (
              <Fragment key={k.kod}>
                {k.kod === ILK_DENIZ && <span className="uz-grup">Deniz</span>}
                <button type="button" aria-pressed={katman.kod === k.kod} disabled={!var_} onClick={() => katmanSec(k.kod)}
                        title={var_ ? undefined : `${m.ad} bu katmanı yayımlamıyor`}>{k.ad}</button>
              </Fragment>
            );
          })}
        </div>
        <Lejant degisken={katman.degisken} koyu={koyu} birim={katman.birim} />
        {katman.izo && <p className="uz-not">Çizgiler: {katman.izo.ad}, {katman.izo.aralik} birimde bir.{katman.oklar && " Oklar: 10 m rüzgârı."}</p>}

        <details className="uz-bak" open>
          <summary>Neye bakmalı?</summary>
          <ul>{katman.bak.map((b) => <li key={b}>{kalin(b)}</li>)}</ul>
        </details>
      </aside>

      <div className={tamEkran ? "uz-orta uz-tam" : "uz-orta"}>
        <button type="button" className="uz-tam-dugme" onClick={() => setTamEkran((t) => !t)} aria-pressed={tamEkran}
                title={tamEkran ? "Tam ekrandan çık (Esc)" : "Haritayı tam ekran yap"} aria-label={tamEkran ? "Tam ekrandan çık" : "Haritayı tam ekran yap"}>
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
            {tamEkran ? <path d="M9 4v5H4M15 4v5h5M9 20v-5H4M15 20v-5h5" /> : <path d="M4 9V4h5M20 9V4h-5M4 15v5h5M20 15v5h-5" />}
          </svg>
        </button>
        <div className="uz-ust-secim">
          <label><span className="gizli">Model</span>
            {/* ayrıntılı ızgara ayrı düğme değil, modelin ikinci seçeneği: katman adına yer kalır */}
            <select value={inceSecenegi && ince ? `${model}+ince` : model}
                    onChange={(e) => {
                      const [k, ek] = e.target.value.split("+") as [ModelKodu, string | undefined];
                      if (k !== model) modelSec(k);
                      if (ek === "ince") inceSec(true); else if (MODELLER[k].ince && ince) inceSec(false);
                    }}>
              {(Object.keys(MODELLER) as ModelKodu[]).map((k) => {
                const i = MODELLER[k].ince;
                return (
                  <Fragment key={k}>
                    <option value={k}>{MODELLER[k].ad}</option>
                    {i && !deniz && !katman.degisken.endsWith("hPa") && <option value={`${k}+ince`}>{MODELLER[k].ad.split(" ")[0]} · {i.cozunurluk.replace("≈", "")}</option>}
                  </Fragment>
                );
              })}
            </select>
          </label>
          <label><span className="gizli">Katman</span>
            <select value={katman.kod} onChange={(e) => katmanSec(e.target.value)}>
              <optgroup label="Hava">{KATMANLAR.filter((k) => !k.deniz).map((k) => <option key={k.kod} value={k.kod} disabled={!katmanVar(k)}>{k.ad}</option>)}</optgroup>
              <optgroup label="Deniz">{KATMANLAR.filter((k) => k.deniz).map((k) => <option key={k.kod} value={k.kod} disabled={!katmanVar(k)}>{k.ad}</option>)}</optgroup>
            </select>
          </label>
        </div>

        <Harita koyu={koyu} konum={konum} kaynak={kaynak} yukleniyor={setYukleniyor} hata={setHaritaHatasi}
                nokta={(lat, lon, deger) => { setDokunulan({ lat, lon, deger }); noktaSec(lat, lon); }} />

        <div className="uz-bilgi" role="status">
          {alanlar.tur === "yukleniyor" && <span>Model bilgisi alınıyor…</span>}
          {alanlar.tur === "hata" && <span className="uz-uyari">Harita verisi alınamadı. {alanlar.mesaj}</span>}
          {yokMu && <span className="uz-uyari">{m.ad} bu katmanı yayımlamıyor; başka bir katman ya da model seç.</span>}
          {haritaHatasi && alan && <span className="uz-uyari">Harita katmanı yüklenemedi; zamanı ya da katmanı değiştirip yeniden dene.</span>}
          {alan && yukleniyor && !haritaHatasi && <span>Izgara verisi yükleniyor…</span>}
          {dokunulan?.deger != null && !yukleniyor && (() => {
            const g = gosterim(dokunulan.deger, olcekBirimi(katman.degisken, koyu));
            return <span>Seçilen noktada: <b>{g.deger.toFixed(1).replace(".", ",")} {g.birim || katman.birim}</b></span>;
          })()}
        </div>

        <div className="uz-alt">
          <div className="uz-lejant-dar"><Lejant degisken={katman.degisken} koyu={koyu} birim={katman.birim} /></div>
          <div className="uz-zaman" role="group" aria-label="Tahmin zamanı">
            <button type="button" className="dugme uz-oynat" onClick={() => {
                      // başlarken eski hata mesajı silinir (yoksa oynatma hemen dururdu); sondaysa baştan başlar
                      if (!oynuyor) { setHaritaHatasi(""); if (sira >= zamanlar.length - 1 && zamanlar[0]) setSeciliZaman(zamanlar[0]); }
                      setOynuyor((o) => !o);
                    }}
                    disabled={!alan || zamanlar.length < 2} aria-pressed={oynuyor} aria-label={oynuyor ? "Oynatmayı durdur" : "Zamanı oynat"} title={oynuyor ? "Durdur" : "Oynat: adımlar sırayla yüklenir"}>
              <svg width="14" height="14" viewBox="0 0 14 14" aria-hidden="true">{oynuyor ? <path d="M2 1h3.5v12H2zM8.5 1H12v12H8.5z" fill="currentColor" /> : <path d="M3 1l10 6-10 6z" fill="currentColor" />}</svg>
            </button>
            <button type="button" className="dugme" onClick={() => { setOynuyor(false); adimAt(-1); }} disabled={!alan || sira <= 0} aria-label="Önceki zaman adımı">‹</button>
            <div className="uz-zaman-orta">
              <div className="uz-zaman-yazi">
                {alan && gecerli
                  ? <><b>{yerelYaz(gecerli, tahmin.tz)}</b><span> · {ufukSaati(alan, gecerli) >= 0 ? "+" : ""}{ufukSaati(alan, gecerli)} sa · {kaynakAdi} koşusu {kosuYaz(alan.kosu)}</span></>
                  : <span>Zaman çizelgesi hazırlanıyor…</span>}
              </div>
              <input type="range" min={0} max={Math.max(zamanlar.length - 1, 0)} value={sira} disabled={!alan}
                     onChange={(e) => { setOynuyor(false); const t = zamanlar[Number(e.target.value)]; if (t) setSeciliZaman(t); }}
                     aria-label="Tahmin zamanı" aria-valuetext={gecerli ? yerelYaz(gecerli, tahmin.tz) : undefined} />
            </div>
            <button type="button" className="dugme" onClick={() => { setOynuyor(false); adimAt(1); }} disabled={!alan || sira >= zamanlar.length - 1} aria-label="Sonraki zaman adımı">›</button>
            <button type="button" className="cip" onClick={() => { setOynuyor(false); setSeciliZaman(null); }} disabled={seciliZaman === null}>Şimdi</button>
          </div>
        </div>
      </div>

      <aside className="yz uz-sag" data-yukseklik={yukseklik} aria-label="Seçili konumun analizi">
        <button type="button" className="uz-tutamac" {...tutamac} aria-label="Analiz panelini büyüt ya da küçült" aria-expanded={yukseklik !== "kapali"}>
          <i aria-hidden="true" /><span>{konum.ad} · analiz</span>
        </button>
        <div className="uz-sag-ic">{analiz(model)}</div>
      </aside>
    </div>
  );
}
