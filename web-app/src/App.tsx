/** Uygulama kabuğu: konum seçimi (arama, cihaz konumu, kayıtlı yerler, adres satırı), mod geçişi ve veri yükleme.
 * Basit ve Uzman modlar aynı veri katmanını ve aynı konumu paylaşır. */
import { type FormEvent, type KeyboardEvent, lazy, Suspense, useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Basit } from "./basit/Basit";
import * as kayit from "./kabuk/kayit";
import { Serit } from "./kabuk/Serit";
import { Iskelet } from "./sayfa/ortak";
import { SIRADAKI, TEMA_ADI, temaSec, useTema } from "./kabuk/tema";
import { noktaOku, noktaYaz, type Secim, sonSecimCoz, VARSAYILAN_YER, yerOku, yerYaz } from "./ortak/url";
import { aramaEtiketi, aramaKonumu, konumKaydi, noktaKonumu, oner, type YerlesimDosyasi, type Yerlesimler, yerlesimleriKur } from "./ortak/yerler";
import { depoOlustur } from "./veri/depo";
import { donem, donemEtiketi, tazelik } from "./veri/donem";
import { istemciOlustur, VeriHatasi } from "./veri/istemci";
import { HavaSimgesi } from "./ortak/HavaSimgesi";
import { anlikSicakliklar, type KisaAnlik, tahmin, yerAra } from "./veri/openMeteo";
import type { AramaSonucu, Konum, Tahmin } from "./veri/tipler";

// Harita kitaplıkları (MapLibre ve ızgara okuyucu) yalnızca Uzman mod açılınca iner; Basit mod onları beklemez.
const Uzman = lazy(() => import("./uzman/Uzman").then((m) => ({ default: m.Uzman })));
const Analiz = lazy(() => import("./uzman/AnalizPaneli").then((m) => ({ default: m.Analiz })));
const Iklim = lazy(() => import("./sayfa/Iklim").then((m) => ({ default: m.Iklim })));
const Canli = lazy(() => import("./sayfa/Canli").then((m) => ({ default: m.Canli })));
const Dogrulama = lazy(() => import("./sayfa/Dogrulama").then((m) => ({ default: m.Dogrulama })));
const Profil = lazy(() => import("./sayfa/Profil").then((m) => ({ default: m.Profil })));
const Ogren = lazy(() => import("./sayfa/Ogren").then((m) => ({ default: m.Ogren })));
const Deniz = lazy(() => import("./sayfa/Deniz").then((m) => ({ default: m.Deniz })));

/** Uzman modun sayfaları. İlki harita merkezli analiz ekranıdır; ötekiler tek konuya ayrılmış sayfalardır. */
const SAYFALAR = [["harita", "Harita ve analiz"], ["canli", "Canlı"], ["profil", "Profil"], ["dogrulama", "Doğrulama"], ["iklim", "İklim"], ["deniz", "Deniz"], ["ogren", "Öğren"]] as const;
/** Sayfa simgeleri (24×24 çizgi çizim). Telefonda sayfalar alt gezinme çubuğunda simgeleriyle durur. */
const SAYFA_SIMGESI: Readonly<Record<(typeof SAYFALAR)[number][0], string>> = {
  harita: "M3 6.5l6-2.5 6 2.5 6-2.5v13.5l-6 2.5-6-2.5-6 2.5zM9 4v13.5M15 6.5V20",
  canli: "M4.9 19.1a10 10 0 0 1 0-14.2M7.8 16.2a6 6 0 0 1 0-8.4M16.2 7.8a6 6 0 0 1 0 8.4M19.1 4.9a10 10 0 0 1 0 14.2M12 12h.01",
  profil: "M12 3l9 4.5-9 4.5-9-4.5zM3 12l9 4.5 9-4.5M3 16.5L12 21l9-4.5",
  dogrulama: "M12 21a9 9 0 1 0 0-18 9 9 0 0 0 0 18zM8 12.5l2.8 2.8L16 9.5",
  iklim: "M14 14.8V5a2 2 0 0 0-4 0v9.8a4 4 0 1 0 4 0z",
  deniz: "M3 8c2 0 2 1.5 4.5 1.5S10 8 12 8s2 1.5 4.5 1.5S19 8 21 8M3 13c2 0 2 1.5 4.5 1.5S10 13 12 13s2 1.5 4.5 1.5S19 13 21 13M3 18c2 0 2 1.5 4.5 1.5S10 18 12 18s2 1.5 4.5 1.5S19 18 21 18",
  ogren: "M12 6.5C10 5 7 4.5 3.5 5v13.5c3.5-.5 6.5 0 8.5 1.5 2-1.5 5-2 8.5-1.5V5C17 4.5 14 5 12 6.5zM12 6.5V20",
};
const PAYLAS_SIMGESI = "M12 15V3M8 7l4-4 4 4M5 12v7a2 2 0 0 0 2 2h10a2 2 0 0 0 2-2v-7";
const IPUCU_ANAHTARI = "havalab_ipucu";
type Sayfa = (typeof SAYFALAR)[number][0];
const adrestenSayfa = (): Sayfa => {
  const s = new URLSearchParams(location.search).get("sayfa");
  return SAYFALAR.some(([k]) => k === s) ? (s as Sayfa) : "harita";
};

const istemci = istemciOlustur({ depo: depoOlustur() });
const depo = kayit.yerelDepo();
const MOD_ANAHTARI = "havalab_mod";
type Mod = "basit" | "uzman";

const SON_YER_ANAHTARI = "havalab_son";

type Durum =
  | { tur: "yukleniyor" }
  | { tur: "hazir"; konum: Konum; tahmin: Tahmin }
  | { tur: "hata"; baslik: string; ayrinti: string };

function adrestenSecim(): Secim {
  const nokta = noktaOku(location.search);
  if (nokta) return { tur: "nokta", ...nokta };
  const yer = yerOku(location.search);
  if (yer) return { tur: "yer", etiket: yer };
  // adreste yer yoksa (ör. ana ekrandaki kısayol) bu tarayıcıda son bakılan yer açılır
  return sonSecimCoz(depo?.getItem(SON_YER_ANAHTARI)) ?? { tur: "yer", etiket: VARSAYILAN_YER };
}

/** Açılıştaki mod: adreste `?mod=basit|uzman` varsa o (paylaşılan bağlantı), yoksa bu tarayıcıda son seçilen. */
function ilkMod(): Mod {
  const adresteki = new URLSearchParams(location.search).get("mod");
  if (adresteki === "basit" || adresteki === "uzman") return adresteki;
  if (adrestenSayfa() !== "harita") return "uzman";                 // paylaşılan sayfa bağlantısı Uzman modda açılır
  return depo?.getItem(MOD_ANAHTARI) === "uzman" ? "uzman" : "basit";
}

function hataMetni(e: unknown): { baslik: string; ayrinti: string } {
  if (e instanceof VeriHatasi) {
    if (e.tur === "sinir") return { baslik: "İstek sınırı aşıldı", ayrinti: "Veri sağlayıcının ücretsiz kullanım sınırı doldu. Bir süre sonra (genellikle bir saat içinde) tekrar dene." };
    if (e.tur === "ag") return { baslik: "Veri alınamadı", ayrinti: "İnternet bağlantını kontrol edip tekrar dene." };
    return { baslik: "Veri alınamadı", ayrinti: e.neden || e.message };
  }
  return { baslik: "Bir şeyler ters gitti", ayrinti: e instanceof Error ? e.message : String(e) };
}

export function App() {
  const [yerlesimler, setYerlesimler] = useState<Yerlesimler | null>(null);
  const [secim, setSecim] = useState<Secim>(adrestenSecim);
  const [durumu, setDurumu] = useState<Durum>({ tur: "yukleniyor" });
  const [secenekler, setSecenekler] = useState<AramaSonucu[]>([]);
  const [secenekSirasi, setSecenekSirasi] = useState(0);
  const [noktalar, setNoktalar] = useState(() => kayit.oku(depo));
  const [mod, setMod] = useState<Mod>(ilkMod);
  const tema = useTema();
  /** Kısa süre görünen bildirim (ör. "Bağlantı kopyalandı"). */
  const [tost, setTost] = useState("");
  useEffect(() => { if (!tost) return; const s = setTimeout(() => setTost(""), 2600); return () => clearTimeout(s); }, [tost]);
  /** İlk açılışta simgeli düğmelerin anlamını gösteren kısa not; "Anladım" denince bir daha çıkmaz. */
  const [ipucuAcik, setIpucuAcik] = useState(() => depo?.getItem(IPUCU_ANAHTARI) !== "1");
  const ipucuKapat = () => { setIpucuAcik(false); try { depo?.setItem(IPUCU_ANAHTARI, "1"); } catch { /* depo kapalı: not bu oturumda kapanır */ } };
  /** Bu yerin bağlantısını paylaşır: telefonda sistemin paylaşım penceresi, yoksa panoya kopyalama. */
  const paylas = async () => {
    const veri = { title: document.title, url: location.href };
    try {
      if (navigator.share) await navigator.share(veri);
      else { await navigator.clipboard.writeText(veri.url); setTost("Bağlantı kopyalandı."); }
    } catch (e) {
      if (!(e instanceof DOMException && e.name === "AbortError")) setTost("Bağlantı paylaşılamadı; adres çubuğundan kopyalayabilirsin.");
    }
  };
  const [sayfa, setSayfa] = useState<Sayfa>(adrestenSayfa);
  const [veriDonemi, setVeriDonemi] = useState(donem);
  const [yenile, setYenile] = useState(0);
  const [konumDurumu, setKonumDurumu] = useState("");
  /** Yeni bir konumun verisi beklenirken true: eski ekran yerinde kalır (harita baştan kurulmaz), küçük bir not çıkar. */
  const [gecis, setGecis] = useState(false);

  // yer listesi: bir kez iner, öneriler tarayıcıda süzülür
  useEffect(() => {
    fetch(`${import.meta.env.BASE_URL}yerlesimler.json`)
      .then((r) => { if (!r.ok) throw new Error(`yer listesi alınamadı (${r.status})`); return r.json() as Promise<YerlesimDosyasi>; })
      .then((d) => setYerlesimler(yerlesimleriKur(d)))
      .catch((e: unknown) => setDurumu({ tur: "hata", ...hataMetni(e) }));
  }, []);

  // veri dönemi değişince (saat başını 10 geçe) ya da sekmeye dönülünce tahmin yenilenir
  useEffect(() => {
    const denetle = () => setVeriDonemi(donem());
    const sayac = setInterval(denetle, 60_000);
    document.addEventListener("visibilitychange", denetle);
    return () => { clearInterval(sayac); document.removeEventListener("visibilitychange", denetle); };
  }, []);

  // geri/ileri düğmeleri
  useEffect(() => {
    const geri = () => { setSecim(adrestenSecim()); setSayfa(adrestenSayfa()); };
    addEventListener("popstate", geri);
    return () => removeEventListener("popstate", geri);
  }, []);

  // seçim → konum → tahmin
  useEffect(() => {
    if (!yerlesimler) return;
    let gecerli = true;
    setDurumu((d) => (d.tur === "hazir" ? d : { tur: "yukleniyor" }));
    (async () => {
      let konum: Konum;
      if (secim.tur === "nokta") {
        const kayitli = kayit.bul(kayit.oku(depo), secim.lat, secim.lon);
        konum = noktaKonumu(yerlesimler, secim.lat, secim.lon, kayitli?.ad, kayitli ? "Kayıtlı nokta" : secim.bolge ?? "Seçilen nokta");
        if (gecerli) setSecenekler([]);
      } else {
        const listede = yerlesimler.get(secim.etiket);
        if (listede) {
          konum = konumKaydi(listede);
          if (gecerli) setSecenekler([]);
        } else {
          // listede olmayan ad: yalnızca bu durumda yer adı servisine tek bir istek gider
          const sonuc = await yerAra(istemci, secim.etiket);
          if (!gecerli) return;
          const secilen = sonuc[Math.min(secenekSirasi, sonuc.length - 1)];
          if (!secilen) {
            setSecenekler([]);
            setGecis(false);
            setDurumu({ tur: "hata", baslik: "Yer bulunamadı", ayrinti: `"${secim.etiket}" adında bir yer bulunamadı. Farklı yazmayı dene.` });
            return;
          }
          setSecenekler(sonuc);
          konum = aramaKonumu(secilen);
        }
      }
      const t = await tahmin(istemci, konum);
      if (gecerli) {
        setDurumu({ tur: "hazir", konum, tahmin: t });
        setGecis(false);
        try { depo?.setItem(SON_YER_ANAHTARI, JSON.stringify(secim)); } catch { /* depo kapalı: bir sonraki açılış varsayılan yerle olur */ }
      }
    })().catch((e: unknown) => { if (gecerli) { setDurumu({ tur: "hata", ...hataMetni(e) }); setGecis(false); } });
    return () => { gecerli = false; };
  }, [secim, secenekSirasi, yerlesimler, veriDonemi, yenile]);

  const sec = useCallback((yeni: Secim) => {
    const sorgu = yeni.tur === "yer" ? yerYaz(location.search, yeni.etiket) : noktaYaz(location.search, yeni.lat, yeni.lon);
    history.pushState(null, "", sorgu);                       // bağlantı paylaşılabilsin, yenileyince korunsun
    setSecenekSirasi(0);
    setGecis(true);
    setSecim(yeni);
  }, []);

  const konumum = () => {
    if (!navigator.geolocation) { setKonumDurumu("Bu tarayıcı konum paylaşımını desteklemiyor."); return; }
    setKonumDurumu("Konum alınıyor…");
    navigator.geolocation.getCurrentPosition(
      (p) => { setKonumDurumu(""); sec({ tur: "nokta", lat: p.coords.latitude, lon: p.coords.longitude, bolge: "Bulunduğun konum" }); },
      (h) => setKonumDurumu(h.code === h.PERMISSION_DENIED ? "Konum izni verilmedi. Yeri arama kutusundan seçebilirsin." : "Konum alınamadı. Yeri arama kutusundan seçebilirsin."),
      { timeout: 10_000, maximumAge: 300_000 });
  };

  const modSec = (m: Mod) => {
    setMod(m);
    try { depo?.setItem(MOD_ANAHTARI, m); } catch { /* depo kapalı: seçim yalnızca bu oturumda kalır */ }
    const p = new URLSearchParams(location.search);
    if (p.has("mod")) p.set("mod", m);
    // Basit modda sayfa yoktur: adresteki sayfa silinir ki yenileyince Uzman moda dönülmesin
    if (m === "basit") { p.delete("sayfa"); setSayfa("harita"); }
    history.replaceState(null, "", `?${p.toString().replace("%2C", ",")}`);
  };

  const sayfaSec = (yeni: Sayfa) => {
    const p = new URLSearchParams(location.search);
    if (yeni === "harita") p.delete("sayfa"); else p.set("sayfa", yeni);
    history.pushState(null, "", `?${p.toString().replace("%2C", ",")}`);
    setSayfa(yeni);
  };

  const hazir = durumu.tur === "hazir" ? durumu : null;
  const kayitli = hazir ? kayit.bul(noktalar, hazir.konum.lat, hazir.konum.lon) : undefined;
  const kaydet = () => {
    if (!hazir) return;
    setNoktalar(kayitli ? kayit.sil(depo, noktalar, kayitli.ad) : kayit.ekle(depo, noktalar, hazir.konum.ad, hazir.konum.lat, hazir.konum.lon));
  };

  useEffect(() => {
    document.title = hazir ? `${hazir.tahmin.anlik.deger.temperature_2m == null ? "—" : Math.round(hazir.tahmin.anlik.deger.temperature_2m)}° ${hazir.konum.ad} · HavaLabSS` : "HavaLabSS";
  }, [hazir]);

  const eski = hazir?.tahmin.bilgi.kaynak === "eski";
  const { alindi, sonraki } = tazelik();
  return (
    <div className={["sar", mod === "uzman" && sayfa === "harita" && "uzman-acik", mod === "uzman" && "alt-cubuklu"].filter(Boolean).join(" ")}>
      <header className="ust">
        <h1 className="logo">
          <i aria-hidden="true"><svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round"><path d="M17.5 19a4.5 4.5 0 1 0-1.4-8.8A6 6 0 1 0 6.5 19z" /></svg></i>
          <span>Hava<b>Lab</b><em>SS</em></span>
        </h1>
        <div className="arac">
          <KonumArama yerlesimler={yerlesimler} sec={(etiket) => sec({ tur: "yer", etiket })} />
          <button type="button" className="dugme" onClick={konumum} title="Bulunduğum konum" aria-label="Bulunduğum konumu kullan">
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" aria-hidden="true"><circle cx="12" cy="12" r="3" /><path d="M12 2v3M12 19v3M2 12h3M19 12h3" /><circle cx="12" cy="12" r="7" /></svg>
          </button>
          <KayitliYerler noktalar={noktalar} konumAdi={hazir?.konum.ad ?? null} kayitliAd={kayitli?.ad ?? null} kaydet={kaydet}
                         git={(n) => sec({ tur: "nokta", lat: n.lat, lon: n.lon })} cikar={(ad) => setNoktalar(kayit.sil(depo, noktalar, ad))} />
          {hazir && (
            <span className="konum-bilgi">
              {Math.abs(hazir.konum.lat).toFixed(2).replace(".", ",")}° {hazir.konum.lat >= 0 ? "K" : "G"}, {Math.abs(hazir.konum.lon).toFixed(2).replace(".", ",")}° {hazir.konum.lon >= 0 ? "D" : "B"}
              {hazir.tahmin.rakim != null && ` · ${Math.round(hazir.tahmin.rakim)} m`} · {hazir.tahmin.tz}
            </span>
          )}
          {hazir && (
            <span className={eski ? "rozet eski" : "rozet"}
                  title={eski ? `Bu saatin verisi alınamadı; ${donemEtiketi(hazir.tahmin.bilgi.donem)} dönemine ait önceki veri gösteriliyor. Bir sonraki deneme ${sonraki}.`
                              : `Tahmin verisi saat başını 10 geçe yenilenir (Türkiye saati). Son yenileme ${alindi}, sonraki ${sonraki}.`}>
              <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><path d="M21 12a9 9 0 1 1-3-6.7" /><path d="M21 4v5h-5" /></svg>
              <span className="gizli">Veri saati: </span>{eski ? `${donemEtiketi(hazir.tahmin.bilgi.donem).slice(-5)} verisi` : alindi}
            </span>
          )}
        </div>
        <div className="ust-sag">
        <div className="mod" role="group" aria-label="Görünüm">
          {/* simgeler: Basit = özet kartı, Uzman = harita; adları ipucunda ve ekran okuyucuda okunur */}
          <button type="button" aria-pressed={mod === "basit"} onClick={() => modSec("basit")} title="Basit görünüm" aria-label="Basit görünüm">
            <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
              <rect x="4" y="3.5" width="16" height="17" rx="3.5" /><path d="M8.5 9h7M8.5 13h7M8.5 17h3.5" />
            </svg>
          </button>
          <button type="button" aria-pressed={mod === "uzman"} onClick={() => modSec("uzman")} title="Uzman görünüm" aria-label="Uzman görünüm">
            <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
              <path d="M3 6.5l6-2.5 6 2.5 6-2.5v13.5l-6 2.5-6-2.5-6 2.5z" /><path d="M9 4v13.5M15 6.5V20" />
            </svg>
          </button>
        </div>
        <button type="button" className="tema-dugme" onClick={paylas} title="Bu yerin bağlantısını paylaş" aria-label="Bu yerin bağlantısını paylaş">
          <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><path d={PAYLAS_SIMGESI} /></svg>
        </button>
        <button type="button" className="tema-dugme" onClick={() => temaSec(SIRADAKI[tema.secim])}
                title={`Tema: ${TEMA_ADI[tema.secim]}. Değiştirmek için dokun.`} aria-label={`Tema: ${TEMA_ADI[tema.secim]}. Değiştir: ${TEMA_ADI[SIRADAKI[tema.secim]]}.`}>
          <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
            {tema.secim === "acik" && <><circle cx="12" cy="12" r="4" /><path d="M12 2v2M12 20v2M4.9 4.9l1.4 1.4M17.7 17.7l1.4 1.4M2 12h2M20 12h2M4.9 19.1l1.4-1.4M17.7 6.3l1.4-1.4" /></>}
            {tema.secim === "koyu" && <path d="M20.5 14.5A8.5 8.5 0 0 1 9.5 3.5a8.5 8.5 0 1 0 11 11z" />}
            {tema.secim === "oto" && <><circle cx="12" cy="12" r="9" /><path d="M12 3a9 9 0 0 1 0 18z" fill="currentColor" /></>}
          </svg>
        </button>
        </div>
      </header>
      {tost && <p className="tost" role="status">{tost}</p>}
      {ipucuAcik && (
        <aside className="yz ipucu" aria-label="Simgelerin anlamı">
          <ul>
            <li><svg width="18" height="18" viewBox="0 0 24 24" aria-hidden="true"><rect x="4" y="3.5" width="16" height="17" rx="3.5" /><path d="M8.5 9h7M8.5 13h7M8.5 17h3.5" /></svg>Basit görünüm: özet</li>
            <li><svg width="18" height="18" viewBox="0 0 24 24" aria-hidden="true"><path d={SAYFA_SIMGESI.harita} /></svg>Uzman görünüm: harita ve ayrıntılar</li>
            <li><svg width="18" height="18" viewBox="0 0 24 24" aria-hidden="true"><path d="M6 3h12v18l-6-4.5L6 21z" /></svg>Kayıtlı yerler</li>
            <li><svg width="18" height="18" viewBox="0 0 24 24" aria-hidden="true"><path d={PAYLAS_SIMGESI} /></svg>Bu yerin bağlantısını paylaş</li>
            <li><svg width="18" height="18" viewBox="0 0 24 24" aria-hidden="true"><circle cx="12" cy="12" r="9" /><path d="M12 3a9 9 0 0 1 0 18z" /></svg>Açık / koyu tema</li>
          </ul>
          <button type="button" className="cip" onClick={ipucuKapat}>Anladım</button>
        </aside>
      )}

      {mod === "uzman" && (
        <Serit tur="nav" etiket="Uzman sayfaları" className="sayfalar" secili={sayfa}>
          {SAYFALAR.map(([k, ad]) => (
            <button key={k} type="button" className="cip" aria-current={sayfa === k ? "page" : undefined} onClick={() => sayfaSec(k)} aria-label={ad}>
              <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><path d={SAYFA_SIMGESI[k]} /></svg>
              <span aria-hidden="true">{k === "harita" ? <>Harita<i> ve analiz</i></> : ad}</span>
            </button>
          ))}
        </Serit>
      )}
      {konumDurumu && <p className="cipler" role="status">{konumDurumu}</p>}
      {secenekler.length > 1 && (
        <div className="cipler" role="group" aria-label="Arama sonuçları">
          <span>Bu adla birden çok yer var:</span>
          {secenekler.map((s, i) => (
            <button key={`${s.latitude},${s.longitude}`} type="button" className="cip" aria-pressed={i === secenekSirasi} onClick={() => setSecenekSirasi(i)}>{aramaEtiketi(s)}</button>
          ))}
        </div>
      )}

      <main aria-busy={durumu.tur === "yukleniyor" || gecis}>
        {gecis && hazir && <p className="cipler" role="status">Yeni konumun verisi indiriliyor…</p>}
        {durumu.tur === "yukleniyor" && <Iskelet tur={mod === "basit" ? "basit" : "harita"} />}
        {durumu.tur === "hata" && (
          <div className="yz bildirim hata" role="alert">
            <strong>{durumu.baslik}</strong>
            <p>{durumu.ayrinti}</p>
            <p><button type="button" className="cip" onClick={() => { setDurumu({ tur: "yukleniyor" }); setYenile((x) => x + 1); }}>Tekrar dene</button></p>
          </div>
        )}
        {hazir && eski && (
          <div className="yz bildirim" role="status">
            <strong>Önceki veri gösteriliyor</strong>
            <p>Bu saatin verisi alınamadı; {donemEtiketi(hazir.tahmin.bilgi.donem)} dönemine ait tahmin gösteriliyor. Bir sonraki deneme {sonraki}.</p>
          </div>
        )}
        {hazir && mod === "basit" && (
          <Basit key={`${hazir.konum.lat},${hazir.konum.lon}`} konum={hazir.konum} tahmin={hazir.tahmin} kayitli={Boolean(kayitli)} kaydet={kaydet} />
        )}
        {hazir && mod === "uzman" && sayfa !== "harita" && (
          <Suspense fallback={<Iskelet tur="sayfa" mesaj="Sayfa yükleniyor…" />}>
            {sayfa === "canli" && <Canli istemci={istemci} konum={hazir.konum} tahmin={hazir.tahmin}
                                         noktaSec={(lat, lon) => sec({ tur: "nokta", lat, lon, bolge: "Haritadan seçilen nokta" })} />}
            {sayfa === "profil" && <Profil istemci={istemci} konum={hazir.konum} tahmin={hazir.tahmin} />}
            {sayfa === "dogrulama" && <Dogrulama istemci={istemci} konum={hazir.konum} tahmin={hazir.tahmin} />}
            {sayfa === "iklim" && <Iklim istemci={istemci} konum={hazir.konum} tahmin={hazir.tahmin} />}
            {sayfa === "deniz" && <Deniz istemci={istemci} konum={hazir.konum} tahmin={hazir.tahmin} />}
            {sayfa === "ogren" && <Ogren git={(hedef) => { if (hedef === "basit") modSec("basit"); else sayfaSec(hedef); scrollTo({ top: 0 }); }} />}
          </Suspense>
        )}
        {hazir && mod === "uzman" && sayfa === "harita" && (
          <Suspense fallback={<Iskelet tur="harita" mesaj="Harita yükleniyor…" />}>
            <Uzman istemci={istemci} konum={hazir.konum} tahmin={hazir.tahmin}
                   noktaSec={(lat, lon) => sec({ tur: "nokta", lat, lon, bolge: "Haritadan seçilen nokta" })}
                   analiz={(model) => <Analiz istemci={istemci} konum={hazir.konum} tahmin={hazir.tahmin} model={model} />} />
          </Suspense>
        )}
      </main>

      <footer className="alt">
        Veri: <a href="https://open-meteo.com" target="_blank" rel="noreferrer">Open-Meteo</a> (CC BY 4.0) · Yer adları: <a href="https://www.geonames.org" target="_blank" rel="noreferrer">GeoNames</a> (CC BY 4.0)
        <br />İstasyon ölçümleri: <a href="https://mesonet.agron.iastate.edu" target="_blank" rel="noreferrer">Iowa Environmental Mesonet</a> · Radar: <a href="https://www.rainviewer.com" target="_blank" rel="noreferrer">RainViewer</a> · Uydu: <a href="https://view.eumetsat.int" target="_blank" rel="noreferrer">EUMETSAT</a>
        <br />Saatler seçili konumun yerel saatidir.{hazir && <> Veri saati {alindi}; saat başını 10 geçe yenilenir.</>}
        <br />Özgür yazılım (GPL-2.0), hiçbir garanti verilmez ·{" "}
        <a href="https://github.com/serdarsoylu06/hava-tahmini" target="_blank" rel="noreferrer">kaynak kodu</a>
      </footer>
    </div>
  );
}

/** Kayıtlı yerler: araç çubuğunda tek bir düğme; basınca açılan pencerede baktığın yeri kaydetme/çıkarma ve
 * kayıtlı yerlerin listesi (her birinin yanında çıkarma düğmesi) durur. Ayrı bir satır kaplamaz. */
function KayitliYerler({ noktalar, konumAdi, kayitliAd, kaydet, git, cikar }: {
  noktalar: readonly kayit.KayitliNokta[]; konumAdi: string | null; kayitliAd: string | null;
  kaydet: () => void; git: (n: kayit.KayitliNokta) => void; cikar: (ad: string) => void;
}) {
  const [acik, setAcik] = useState(false);
  const kutu = useRef<HTMLDivElement>(null);
  // pencere açılınca kayıtlı yerlerin o anki sıcaklığı tek istekte alınır (alınamazsa liste sıcaklıksız kalır)
  const [anlik, setAnlik] = useState<ReadonlyMap<string, KisaAnlik>>(new Map());
  const anahtar = noktalar.map((n) => `${n.lat},${n.lon}`).join(";");
  useEffect(() => {
    if (!acik || !noktalar.length) return;
    let gecerli = true;
    anlikSicakliklar(istemci, noktalar)
      .then((liste) => { if (gecerli) setAnlik(new Map(noktalar.flatMap((n, i) => (liste[i] ? [[n.ad, liste[i]!] as const] : [])))); })
      .catch(() => { /* sıcaklık süs bilgisidir: alınamazsa liste yine çalışır */ });
    return () => { gecerli = false; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [acik, anahtar]);
  useEffect(() => {
    if (!acik) return;
    const disari = (e: Event) => { if (!kutu.current?.contains(e.target as Node)) setAcik(false); };
    const tus = (e: globalThis.KeyboardEvent) => { if (e.key === "Escape") setAcik(false); };
    document.addEventListener("pointerdown", disari);
    document.addEventListener("keydown", tus);
    return () => { document.removeEventListener("pointerdown", disari); document.removeEventListener("keydown", tus); };
  }, [acik]);
  return (
    <div className="ky" ref={kutu}>
      <button type="button" className="dugme" aria-expanded={acik} aria-controls="kayitli-yerler" onClick={() => setAcik((a) => !a)}
              title="Kayıtlı yerler" aria-label={`Kayıtlı yerler (${noktalar.length})`}>
        <svg width="18" height="18" viewBox="0 0 24 24" fill={kayitliAd ? "currentColor" : "none"} stroke="currentColor" strokeWidth="2" strokeLinejoin="round" aria-hidden="true"><path d="M6 3h12v18l-6-4.5L6 21z" /></svg>
        {noktalar.length > 0 && <span className="ky-sayi" aria-hidden="true">{noktalar.length}</span>}
      </button>
      {acik && (
        <div className="ky-pencere" id="kayitli-yerler" role="dialog" aria-label="Kayıtlı yerler">
          {konumAdi && (
            <button type="button" className="ky-kaydet" onClick={kaydet}>
              {kayitliAd ? <><b>{kayitliAd}</b> kayıtlı · listeden çıkar</> : <>+ <b>{konumAdi}</b> yerini kaydet</>}
            </button>
          )}
          {noktalar.length > 0 ? (
            <ul>
              {noktalar.map((n) => (
                <li key={n.ad}>
                  <button type="button" className="ky-yer" aria-current={n.ad === kayitliAd ? "true" : undefined} onClick={() => { git(n); setAcik(false); }}>
                    <span>{n.ad}</span>
                    {anlik.get(n.ad)?.sicaklik != null && (
                      <span className="ky-anlik"><HavaSimgesi kod={anlik.get(n.ad)!.kod} gece={anlik.get(n.ad)!.gece} boy={20} />{Math.round(anlik.get(n.ad)!.sicaklik!).toString().replace("-", "−")}°</span>
                    )}
                  </button>
                  <button type="button" className="ky-cikar" aria-label={`${n.ad}: kayıtlı yerlerden çıkar`} title="Listeden çıkar" onClick={() => cikar(n.ad)}>×</button>
                </li>
              ))}
            </ul>
          ) : <p>Henüz kayıtlı yer yok. Sık baktığın yerleri kaydedersen buradan tek dokunuşla açarsın.</p>}
        </div>
      )}
    </div>
  );
}

/** Yer arama kutusu: yazdıkça yerel listeden öneri (ağa çıkmaz); listede olmayan ad Enter ile internette aranır. */
function KonumArama({ yerlesimler, sec }: { yerlesimler: Yerlesimler | null; sec: (etiket: string) => void }) {
  const [sorgu, setSorgu] = useState("");
  const [acik, setAcik] = useState(false);
  const [vurgulu, setVurgulu] = useState(-1);
  const kutu = useRef<HTMLFormElement>(null);
  const oneriler = useMemo(() => (yerlesimler ? oner(yerlesimler, sorgu) : []), [yerlesimler, sorgu]);

  useEffect(() => {
    const disari = (e: MouseEvent) => { if (!kutu.current?.contains(e.target as Node)) setAcik(false); };
    document.addEventListener("mousedown", disari);
    return () => document.removeEventListener("mousedown", disari);
  }, []);

  const sectir = (etiket: string) => { sec(etiket); setSorgu(""); setAcik(false); setVurgulu(-1); };
  const gonder = (e: FormEvent) => {
    e.preventDefault();
    const hedef = oneriler[vurgulu]?.etiket ?? oneriler[0]?.etiket ?? sorgu.trim();
    if (hedef) sectir(hedef);
  };
  const tus = (e: KeyboardEvent) => {
    if (e.key === "ArrowDown") { e.preventDefault(); setAcik(true); setVurgulu((v) => Math.min(v + 1, oneriler.length - 1)); }
    else if (e.key === "ArrowUp") { e.preventDefault(); setVurgulu((v) => Math.max(v - 1, -1)); }
    else if (e.key === "Escape") { setAcik(false); setVurgulu(-1); }
  };
  const listeAcik = acik && oneriler.length > 0;

  return (
    <form className="arama" ref={kutu} onSubmit={gonder} role="search">
      <input value={sorgu} placeholder="Şehir ya da ilçe ara…" aria-label="Konum ara" autoComplete="off" enterKeyHint="search"
             role="combobox" aria-expanded={listeAcik} aria-controls="oneriler" aria-autocomplete="list"
             aria-activedescendant={vurgulu >= 0 ? `oneri-${vurgulu}` : undefined}
             onChange={(e) => { setSorgu(e.target.value); setAcik(true); setVurgulu(-1); }} onFocus={() => setAcik(true)} onKeyDown={tus} />
      {listeAcik && (
        <ul className="oneriler" id="oneriler" role="listbox" aria-label="Öneriler">
          {oneriler.map((y, i) => (
            <li key={y.etiket} id={`oneri-${i}`} role="option" aria-selected={i === vurgulu} onMouseDown={(e) => { e.preventDefault(); sectir(y.etiket); }}>{y.etiket}</li>
          ))}
        </ul>
      )}
    </form>
  );
}
