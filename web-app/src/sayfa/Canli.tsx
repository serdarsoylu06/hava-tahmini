/** Canlı radar ve uydu: son iki saatin yağış radarı ve Meteosat uydu görüntüsü, üstünde modelin şu anki rüzgârı.
 * Streamlit'teki `app_pages/canli.py` sayfasının karşılığı.
 *
 * Bilinçli fark: Streamlit sürümü rüzgârı, seyrek bir nokta ızgarasından (2,5° aralıklı nokta tahminleri) ara
 * değerle üretilen akış çizgileriyle gösterir. Burada nokta tahminlerinden alan üretilmez; rüzgâr, ECMWF'in kendi
 * ızgara dosyasından okunan oklarla çizilir. */
import * as maplibregl from "maplibre-gl";
import "maplibre-gl/dist/maplibre-gl.css";
import { useEffect, useMemo, useRef, useState } from "react";
import { type Kare, kareSec, RADAR_EN_YAKIN, radarKareleri, UYDU_KATMAN, uyduKareleriGetir } from "../hesap/canli";
import { yerelSaat, zamanYaz } from "../ortak/zaman";
import { ALTLIK_STILI, protokoluKur } from "../uzman/Harita";
import { alanMeta, degiskenVar, enYakinZaman, MODELLER, omAdresi } from "../uzman/katmanlar";
import { useKoyuTema } from "../kabuk/tema";
import { Not, type SayfaOzellik, SayfaBasligi, useVeri } from "./ortak";

type Katman = "radar" | "uydu" | "ruzgar";
const KATMAN_AD: Readonly<Record<Katman, string>> = { radar: "Radar", uydu: "Uydu", ruzgar: "Rüzgâr okları" };
const KARE_MS = 650;

const BILGI: readonly { baslik: string; ozet: string; maddeler: readonly (readonly [string, string])[] }[] = [
  { baslik: "Radar neyi gösterir?", ozet: "Yağmur damlası ve kar tanelerinden geri yansıyan sinyal. Renk ne kadar sıcaksa (sarı → kırmızı → mor) yağış o kadar yoğun.",
    maddeler: [["Hızlı büyüyen kırmızı hücreler", "Gök gürültülü sağanaktır."], ["Geniş, düzgün mavi alanlar", "Cephesel, uzun süren yağıştır."],
               ["Yağışın yönü ve hızı", "Animasyonda nereye ilerlediğine bak: bir saat sonra nerede olacağını kendin kestirebilirsin (meteorologların “nowcasting” dediği şey)."]] },
  { baslik: "Uydu neyi gösterir?", ozet: "Meteosat, 36.000 km yükseklikten 15 dakikada bir görüntü alır. Gündüz doğal renk, gece kızılötesi.",
    maddeler: [["Parlak beyaz", "Kızılötesinde beyaz = soğuk = yüksek bulut tepesi; en parlakları kuleleşmiş fırtına bulutları."], ["Virgül biçimli bantlar", "Gelişmiş alçak basınç sistemleri; kuyruğu soğuk cepheyi gösterir."],
               ["Radarla birlikte oku", "Uydu denizleri ve sınır ötesini de görür; bulutun yağış verip vermediğini ise radar söyler."]] },
  { baslik: "Rüzgâr okları neyi gösterir?", ozet: "Oklar ECMWF modelinin bu saat için hesapladığı 10 m rüzgârıdır (gözlem değil); modelin kendi ızgarasından okunur.",
    maddeler: [["Dönen akış", "Basınç merkezleri: alçak basınç etrafında saat yönünün tersine dönüş."], ["Karşılaşan akışlar", "Yakınsama hatlarında hava yükselir; radarda yağış bandını çoğu zaman tam bu hatta görürsün."],
               ["Dağlar ve boğazlar", "Rüzgârın yerel engellerle nasıl yön değiştirdiğine bak."]] },
];

export function Canli({ istemci, konum, tahmin, noktaSec }: SayfaOzellik & { noktaSec: (lat: number, lon: number) => void }) {
  const koyu = useKoyuTema();
  const [acik, setAcik] = useState<Readonly<Record<Katman, boolean>>>({ radar: true, uydu: false, ruzgar: true });
  const [uyduAd, setUyduAd] = useState(Object.keys(UYDU_KATMAN)[0]!);
  const [oynuyor, setOynuyor] = useState(() => !matchMedia("(prefers-reduced-motion: reduce)").matches);
  const [sira, setSira] = useState(-1);                                   // −1: en son kare

  const radar = useVeri(async () => (acik.radar ? radarKareleri(istemci) : null), [istemci, acik.radar]);
  const uydu = useVeri(async () => (acik.uydu ? uyduKareleriGetir(istemci, UYDU_KATMAN[uyduAd]!) : null), [istemci, acik.uydu, uyduAd]);
  const ruzgar = useVeri(async () => {
    if (!acik.ruzgar) return null;
    const meta = await alanMeta(istemci, MODELLER.ecmwf.alanlar[0]!);
    if (!degiskenVar(meta, "wind_speed_10m")) return null;
    const zaman = meta.gecerlilik[enYakinZaman(meta, new Date())]!;
    return { adres: omAdresi(meta, zaman, "wind_speed_10m", { oklar: true }), zaman };
  }, [istemci, acik.ruzgar]);

  const radarKare = radar.tur === "hazir" && radar.veri ? radar.veri.kareler : [];
  const kapsama = radar.tur === "hazir" && radar.veri ? radar.veri.kapsama : null;
  const uyduKare = uydu.tur === "hazir" && uydu.veri ? uydu.veri : [];
  // zaman çizelgesi: radar açıksa onun kareleri (10 dk), değilse uydunun (15 dk); öteki katman en yakın karesini gösterir
  const cizelge: readonly Kare[] = radarKare.length ? radarKare : uyduKare;
  const gosterilen = cizelge.length ? Math.min(sira < 0 ? cizelge.length - 1 : sira, cizelge.length - 1) : -1;
  const zaman = gosterilen >= 0 ? cizelge[gosterilen]!.zaman : null;

  useEffect(() => {
    if (!oynuyor || cizelge.length < 2) return;
    let bekle = 0;
    const sayac = setInterval(() => setSira((s) => {
      const simdi = s < 0 ? cizelge.length - 1 : s;
      if (simdi >= cizelge.length - 1) { if (bekle++ < 3) return simdi; bekle = 0; return 0; }   // son karede kısa bir duraklama
      return simdi + 1;
    }), KARE_MS);
    return () => clearInterval(sayac);
  }, [oynuyor, cizelge.length]);

  const kaynak = useMemo(() => ({
    radar: acik.radar ? radarKare : [], kapsama: acik.radar ? kapsama : null, uydu: acik.uydu ? uyduKare : [],
    ok: acik.ruzgar && ruzgar.tur === "hazir" && ruzgar.veri ? ruzgar.veri.adres : null,
  }), [acik, radarKare, kapsama, uyduKare, ruzgar]);

  const sorunlar = [
    acik.radar && radar.tur !== "yukleniyor" && !radarKare.length && "Radar kareleri şu an alınamadı.",
    acik.uydu && uydu.tur !== "yukleniyor" && !uyduKare.length && "Uydu görüntüsü şu an alınamadı.",
    acik.ruzgar && ruzgar.tur !== "yukleniyor" && !(ruzgar.tur === "hazir" && ruzgar.veri) && "Rüzgâr ızgarası şu an alınamadı.",
  ].filter((x): x is string => Boolean(x));
  const yerel = (saniye: number) => zamanYaz(yerelSaat(new Date(saniye * 1000), tahmin.tz));

  return (
    <div className="sy">
      <SayfaBasligi baslik="Canlı radar ve uydu">
        Gerçek gözlemler: son iki saatin yağış radarı ve Meteosat uydu görüntüsü, üstünde modelin şu anki rüzgârı. Animasyon tarayıcında döner. Haritaya dokunursan orası uygulamanın konumu olur.
      </SayfaBasligi>
      <div className="sy-secimler">
        <div className="an-cipler" role="group" aria-label="Katmanlar">
          {(Object.keys(KATMAN_AD) as Katman[]).map((k) => <button key={k} type="button" className="cip" aria-pressed={acik[k]} onClick={() => setAcik((a) => ({ ...a, [k]: !a[k] }))}>{KATMAN_AD[k]}</button>)}
        </div>
        {acik.uydu && (
          <label className="an-secim cn-secim"><span className="gizli">Uydu görüntüsü</span>
            <select value={uyduAd} onChange={(e) => setUyduAd(e.target.value)}>{Object.keys(UYDU_KATMAN).map((k) => <option key={k}>{k}</option>)}</select>
          </label>
        )}
      </div>
      {sorunlar.map((m) => <Not key={m} tur="dikkat">{m}</Not>)}

      <div className="cn-harita">
        <CanliHarita koyu={koyu} konum={konum} kaynak={kaynak} zaman={zaman} nokta={noktaSec} />
        {acik.radar && radarKare.length > 0 && <div className="cn-lejant" aria-label="Radar renkleri"><span>Hafif</span><i /><span>Şiddetli yağış</span></div>}
        {acik.ruzgar && ruzgar.tur === "hazir" && ruzgar.veri && <div className="cn-not">Rüzgâr: ECMWF, {yerel(Date.parse(ruzgar.veri.zaman) / 1000)} tahmini</div>}
        {cizelge.length > 0 && zaman != null && (
          <div className="cn-cubuk">
            <button type="button" className="cn-oynat" onClick={() => setOynuyor((o) => !o)} aria-label={oynuyor ? "Duraklat" : "Oynat"} aria-pressed={oynuyor}>
              <svg width="14" height="14" viewBox="0 0 14 14" aria-hidden="true">{oynuyor ? <path d="M2 1h3.5v12H2zM8.5 1H12v12H8.5z" fill="currentColor" /> : <path d="M3 1l10 6-10 6z" fill="currentColor" />}</svg>
            </button>
            <input type="range" min={0} max={cizelge.length - 1} value={gosterilen} aria-label="Zaman" aria-valuetext={yerel(zaman)}
                   onChange={(e) => { setOynuyor(false); setSira(Number(e.target.value)); }} />
            <span className="cn-zaman">{yerel(zaman)}</span>
          </div>
        )}
      </div>

      <div className="sy-uc cn-bilgi">
        {BILGI.map((b) => (
          <section key={b.baslik} className="yz sy-kart">
            <h3>{b.baslik}</h3>
            <p>{b.ozet}</p>
            {b.maddeler.map(([ad, metin]) => <details key={ad}><summary>{ad}</summary><p>{metin}</p></details>)}
          </section>
        ))}
      </div>
      <p className="sy-acil">Kaynaklar: radar <a href="https://www.rainviewer.com" target="_blank" rel="noreferrer">RainViewer</a> (gri gölgeli alanlarda radar kapsaması yok), uydu <a href="https://view.eumetsat.int" target="_blank" rel="noreferrer">EUMETSAT</a> Meteosat MTG (yaklaşık 30–45 dk gecikmeli), rüzgâr ECMWF IFS (Open-Meteo ızgara dosyaları), altlık harita © OpenStreetMap katkıcıları, © CARTO.</p>
    </div>
  );
}

interface Kaynak { radar: readonly Kare[]; kapsama: string | null; uydu: readonly Kare[]; ok: string | null }

/** Canlı katmanların haritası. Animasyonun bütün kareleri haritaya baştan eklenir ve yalnızca gösterilen karenin
 * opaklığı açılır: kareler arasında geçerken yeni istek gitmez, görüntü takılmaz. */
function CanliHarita({ koyu, konum, kaynak, zaman, nokta }: { koyu: boolean; konum: { lat: number; lon: number }; kaynak: Kaynak; zaman: number | null; nokta: (lat: number, lon: number) => void }) {
  const kutu = useRef<HTMLDivElement>(null);
  const harita = useRef<maplibregl.Map | null>(null);
  const isaret = useRef<maplibregl.Marker | null>(null);
  const stilHazir = useRef(false);
  const guncel = useRef({ kaynak, zaman, koyu, nokta });
  guncel.current = { kaynak, zaman, koyu, nokta };

  /** Haritadaki katmanları istenen duruma getirir (eksikleri ekler, fazlaları siler, opaklıkları ayarlar). */
  const esitle = useRef(() => {
    const h = harita.current;
    if (!h || !stilHazir.current) return;
    const { kaynak: k, zaman: t, koyu: karanlik } = guncel.current;
    const altlik = h.getStyle().layers.filter((l) => !l.id.startsWith("c-"));
    const sonDolgu = altlik.reduce((en, l, i) => (l.type === "fill" || l.type === "background" ? i : en), -1);
    const oncesi = altlik[sonDolgu + 1]?.id;                       // sınırlar ve yer adları katmanların üstünde kalır

    const istenen = new Map<string, { tur: "uydu" | "kapsama" | "radar" | "ok"; adres: string }>();
    k.uydu.forEach((x) => istenen.set(`c-uydu-${x.zaman}`, { tur: "uydu", adres: x.karo }));
    if (k.kapsama) istenen.set("c-kapsama", { tur: "kapsama", adres: k.kapsama });
    k.radar.forEach((x) => istenen.set(`c-radar-${x.zaman}`, { tur: "radar", adres: x.karo }));
    if (k.ok) istenen.set("c-ok", { tur: "ok", adres: `om://${k.ok}` });

    for (const l of h.getStyle().layers) if (l.id.startsWith("c-") && !istenen.has(l.id)) { h.removeLayer(l.id); h.removeSource(l.id); }
    // katman sırası (alttan üste): uydu, kapsama, radar, oklar
    const ilk = (onek: string[]) => h.getStyle().layers.find((l) => onek.some((o) => l.id.startsWith(o)))?.id ?? oncesi;
    for (const [id, { tur, adres }] of istenen) {
      if (h.getLayer(id)) continue;
      if (tur === "ok") {
        h.addSource(id, { type: "vector", url: adres });
        h.addLayer({ id, type: "line", source: id, "source-layer": "wind-arrows", paint: { "line-color": karanlik ? "#E8EFE6" : "#1C2829", "line-width": 1.1, "line-opacity": karanlik ? 0.8 : 0.5 } }, oncesi);
      } else {
        h.addSource(id, { type: "raster", tiles: [adres], tileSize: tur === "uydu" ? 512 : 256, ...(tur === "uydu" ? {} : { maxzoom: RADAR_EN_YAKIN }),
                          attribution: tur === "uydu" ? "© EUMETSAT" : "RainViewer" });
        h.addLayer({ id, type: "raster", source: id, paint: { "raster-opacity": 0, "raster-fade-duration": 0 } },
                   tur === "uydu" ? ilk(["c-kapsama", "c-radar-", "c-ok"]) : ilk(["c-ok"]));
      }
    }
    if (h.getLayer("c-ok")) { h.setPaintProperty("c-ok", "line-color", karanlik ? "#E8EFE6" : "#1C2829"); h.setPaintProperty("c-ok", "line-opacity", karanlik ? 0.8 : 0.5); }
    if (h.getLayer("c-kapsama")) h.setPaintProperty("c-kapsama", "raster-opacity", 0.35);
    const goster = (kareler: readonly Kare[], onek: string, opaklik: number) => {
      const secili = t == null ? kareler.length - 1 : kareSec(kareler, t);
      kareler.forEach((x, i) => { if (h.getLayer(`${onek}${x.zaman}`)) h.setPaintProperty(`${onek}${x.zaman}`, "raster-opacity", i === secili ? opaklik : 0); });
    };
    goster(k.uydu, "c-uydu-", 0.92);
    goster(k.radar, "c-radar-", 0.8);
  });

  useEffect(() => {
    protokoluKur();
    const h = new maplibregl.Map({
      container: kutu.current!, style: ALTLIK_STILI(guncel.current.koyu), center: [konum.lon, konum.lat], zoom: 5.2, minZoom: 2, maxZoom: 9,
      attributionControl: { compact: true }, dragRotate: false, pitchWithRotate: false,
    });
    harita.current = h;
    h.touchZoomRotate.disableRotation();
    h.addControl(new maplibregl.NavigationControl({ showCompass: false }), "top-right");
    h.on("style.load", () => { stilHazir.current = true; esitle.current(); });
    // kaynak yazısı kapalı başlar ("i" düğmesiyle açılır): dar ekranda iki satıra yayılıp zaman çubuğunu örtüyordu
    h.once("load", () => kutu.current?.querySelector(".maplibregl-ctrl-attrib")?.classList.remove("maplibregl-compact-show"));
    h.on("click", (e) => guncel.current.nokta(e.lngLat.lat, e.lngLat.lng));
    const gozcu = new ResizeObserver(() => h.resize());
    gozcu.observe(kutu.current!);
    return () => { gozcu.disconnect(); isaret.current?.remove(); isaret.current = null; stilHazir.current = false; h.remove(); harita.current = null; };
    // konum yalnızca ilk ortalamada kullanılır
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const ilkTema = useRef(koyu);
  useEffect(() => {
    if (ilkTema.current === koyu) return;
    ilkTema.current = koyu;
    stilHazir.current = false;
    harita.current?.setStyle(ALTLIK_STILI(koyu));
  }, [koyu]);

  useEffect(() => { esitle.current(); }, [kaynak, zaman]);

  useEffect(() => {
    const h = harita.current;
    if (!h) return;
    isaret.current ??= new maplibregl.Marker({ color: "#C6E066" });
    isaret.current.setLngLat([konum.lon, konum.lat]).addTo(h);
    if (!h.getBounds().contains([konum.lon, konum.lat])) h.easeTo({ center: [konum.lon, konum.lat], duration: 600 });
  }, [konum.lat, konum.lon]);

  return <div ref={kutu} className="uz-harita-kutu" role="application" aria-label="Canlı radar ve uydu haritası. Bir noktaya dokunarak o yeri seçebilirsin." />;
}
