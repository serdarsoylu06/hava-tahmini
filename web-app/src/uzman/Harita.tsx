/** Uzman modun haritası (MapLibre). Renkli alan, eş değer çizgileri ve rüzgâr okları modelin kendi ızgara
 * dosyasından çizilir; altlık haritanın sınırları ve yer adları bunların üstünde kalır. */
import { getValueFromLatLong, omProtocol } from "@openmeteo/weather-map-layer";
import * as maplibregl from "maplibre-gl";
import "maplibre-gl/dist/maplibre-gl.css";
// MapLibre 6 işçi betiğini kendi dosyasının yanında arar; paketleyici dosyaları birleştirdiği için adres açıkça verilir.
import isciAdresi from "maplibre-gl/dist/maplibre-gl-worker.mjs?worker&url";
import { useEffect, useRef } from "react";

const ALTLIK = { koyu: "https://basemaps.cartocdn.com/gl/dark-matter-gl-style/style.json",
                 acik: "https://basemaps.cartocdn.com/gl/positron-gl-style/style.json" };
let protokolKuruldu = false;

/** MapLibre'nin işçi betiğini ve ızgara dosyası ("om://") protokolünü bir kez kurar. */
export function protokoluKur(): void {
  if (protokolKuruldu) return;
  maplibregl.setWorkerUrl(isciAdresi);
  maplibregl.addProtocol("om", omProtocol);
  protokolKuruldu = true;
}
export const ALTLIK_STILI = (koyu: boolean) => (koyu ? ALTLIK.koyu : ALTLIK.acik);

export interface HaritaKaynaklari {
  /** Renkli alanın ızgara dosyası; yoksa (model bu değişkeni yayımlamıyor) null. */
  alan: string | null;
  /** Eş değer çizgilerinin dosyası. */
  cizgi: string | null;
  /** Rüzgâr oklarının dosyası. */
  ok: string | null;
}

export interface HaritaOzellik {
  koyu: boolean;
  /** Renkli alanın örtücülüğü (0–1): düşükse alttaki harita, kıyılar ve yer adları daha iyi görünür. */
  ortme: number;
  /** Seçili konum: harita ilk açılışta buraya ortalanır, işaret burada durur. */
  konum: { lat: number; lon: number };
  kaynak: HaritaKaynaklari;
  /** Haritada bir noktaya dokunulduğunda: o noktanın koordinatı ve (okunabildiyse) renkli alanın oradaki değeri. */
  nokta: (lat: number, lon: number, deger: number | null) => void;
  yukleniyor: (durum: boolean) => void;
  hata: (mesaj: string) => void;
}

const KATMAN = { alan: "hava-alan", cizgi: "hava-cizgi", etiket: "hava-cizgi-etiket", ok: "hava-ok", kiyi: "hava-kiyi" } as const;

/** Altlığın sınır ve yer adları koyu zemin için çok soluktur; renkli alanın üstünde okunmaz. Kıyı çizgisi de
 * yalnızca su dolgusunun kenarı olduğu için renkli alanın altında kalır. Bu yüzden: kıyılar alanın üstüne ince bir
 * çizgi olarak yeniden çizilir, ülke sınırları açılır, ülke/şehir/deniz adlarına belirgin bir hale verilir. */
function altligiBelirginlestir(h: maplibregl.Map, karanlik: boolean, yaziOncesi: string | undefined): void {
  const katmanlar = h.getStyle().layers;
  const su = katmanlar.find((l): l is maplibregl.FillLayerSpecification => l.type === "fill" && l["source-layer"] === "water");
  const cizgi = karanlik ? "#E8EFE6" : "#1C2829";
  // ilk sınır çizgisinden (yoksa ilk yazıdan) önce: renkli alanın üstünde, adların altında. Hava katmanları sonradan
  // eklenince araya girebildiği için her seferinde yeniden yerine taşınır.
  const once = katmanlar.find((l) => l.id.startsWith("boundary_country"))?.id ?? yaziOncesi;
  if (h.getLayer(KATMAN.kiyi)) h.moveLayer(KATMAN.kiyi, once);
  else if (su) {
    h.addLayer({ id: KATMAN.kiyi, type: "line", source: su.source, "source-layer": "water",
                 paint: { "line-color": cizgi, "line-opacity": 0.55, "line-width": ["interpolate", ["linear"], ["zoom"], 2, 0.5, 6, 1] } }, once);
  }
  for (const l of katmanlar) {
    if (l.type === "line" && l.id.startsWith("boundary_country_inner")) {
      h.setPaintProperty(l.id, "line-color", karanlik ? "#C9D3CC" : "#3B4A4B");
      h.setPaintProperty(l.id, "line-opacity", 0.75);
    } else if (l.type === "line" && l.id === "boundary_country_outline") {
      h.setPaintProperty(l.id, "line-opacity", 0.25);
    } else if (l.type === "symbol" && /^(place_(country|state|city|capital|town)|watername_(ocean|sea))/.test(l.id)) {
      if (karanlik) h.setPaintProperty(l.id, "text-color", l.id.startsWith("watername") ? "#B9CFE0" : "#E8EFE6");
      h.setPaintProperty(l.id, "text-halo-color", karanlik ? "rgba(16, 24, 25, 0.9)" : "rgba(255, 255, 255, 0.92)");
      h.setPaintProperty(l.id, "text-halo-width", 1.6);
    }
  }
}

export function Harita({ koyu, ortme, konum, kaynak, nokta, yukleniyor, hata }: HaritaOzellik) {
  const kutu = useRef<HTMLDivElement>(null);
  const harita = useRef<maplibregl.Map | null>(null);
  const isaret = useRef<maplibregl.Marker | null>(null);
  // olay dinleyicileri hep en güncel değerleri görsün diye
  const guncel = useRef({ kaynak, koyu, ortme, nokta, yukleniyor, hata });
  guncel.current = { kaynak, koyu, ortme, nokta, yukleniyor, hata };

  const stilHazir = useRef(false);
  /** Hava katmanlarını şu anki kaynaklara göre kurar ya da günceller. Stil her yüklendiğinde yeniden çağrılır. */
  const katmanlar = useRef(() => {
    const h = harita.current;
    // `isStyleLoaded()` karolar yüklenirken de "hayır" der; katman eklemek için stilin kendisinin gelmiş olması yeter
    if (!h || !stilHazir.current) return;
    const { kaynak: k, koyu: karanlik, ortme: o } = guncel.current;
    const stil = h.getStyle().layers;
    // Hava katmanları altlığın dolgu katmanlarının (kara, su) ÜSTÜNE, çizgi ve yazılarının (kıyı, sınır, yer adı)
    // ALTINA girer: deniz üstündeki değerler de görünür, sınırlar ve adlar okunur kalır.
    const altlik = stil.filter((l) => !l.id.startsWith("hava-"));
    const sonDolgu = altlik.reduce((en, l, i) => (l.type === "fill" || l.type === "background" ? i : en), -1);
    const oncesi = altlik[sonDolgu + 1]?.id;
    const yaziKatmani = stil.find((l): l is maplibregl.SymbolLayerSpecification => l.type === "symbol" && !l.id.startsWith("hava-"));
    const yazi = yaziKatmani?.layout?.["text-font"] as string[] | undefined;
    const murekkep = karanlik ? "#E8EFE6" : "#1C2829";

    const kur = (id: string, tur: "raster" | "vector", adres: string | null, ekle: () => void, sil: string[]) => {
      const mevcut = h.getSource(id) as (maplibregl.RasterTileSource | maplibregl.VectorTileSource) | undefined;
      if (!adres) {
        for (const l of sil) if (h.getLayer(l)) h.removeLayer(l);
        if (mevcut) h.removeSource(id);
        return;
      }
      const url = `om://${adres}`;
      if (mevcut) { if (mevcut.url !== url) mevcut.setUrl(url); return; }
      h.addSource(id, tur === "raster" ? { type: "raster", url, tileSize: 256 } : { type: "vector", url });
      ekle();
    };

    kur("hava-alan-kaynak", "raster", k.alan, () =>
      h.addLayer({ id: KATMAN.alan, type: "raster", source: "hava-alan-kaynak", paint: { "raster-opacity": o, "raster-fade-duration": 150 } }, oncesi), [KATMAN.alan]);
    kur("hava-cizgi-kaynak", "vector", k.cizgi, () => {
      h.addLayer({ id: KATMAN.cizgi, type: "line", source: "hava-cizgi-kaynak", "source-layer": "contours",
                   paint: { "line-color": murekkep, "line-width": 1.1, "line-opacity": 0.8 } }, oncesi);
      if (yazi) {
        h.addLayer({ id: KATMAN.etiket, type: "symbol", source: "hava-cizgi-kaynak", "source-layer": "contours",
                     layout: { "symbol-placement": "line", "symbol-spacing": 320, "text-field": ["to-string", ["get", "value"]], "text-font": yazi, "text-size": 11 },
                     paint: { "text-color": murekkep, "text-halo-color": karanlik ? "#1C2829" : "#FFFFFF", "text-halo-width": 1.4 } });
      }
    }, [KATMAN.cizgi, KATMAN.etiket]);
    kur("hava-ok-kaynak", "vector", k.ok, () =>
      h.addLayer({ id: KATMAN.ok, type: "line", source: "hava-ok-kaynak", "source-layer": "wind-arrows",
                   paint: { "line-color": murekkep, "line-width": 1.3, "line-opacity": 0.85 } }, oncesi), [KATMAN.ok]);
    if (h.getLayer(KATMAN.cizgi)) h.setPaintProperty(KATMAN.cizgi, "line-color", murekkep);
    if (h.getLayer(KATMAN.ok)) h.setPaintProperty(KATMAN.ok, "line-color", murekkep);
    altligiBelirginlestir(h, karanlik, yaziKatmani?.id);
  });

  // harita bir kez kurulur
  useEffect(() => {
    protokoluKur();
    const h = new maplibregl.Map({
      container: kutu.current!, style: guncel.current.koyu ? ALTLIK.koyu : ALTLIK.acik,
      center: [konum.lon, konum.lat], zoom: 4.3, minZoom: 1.5, maxZoom: 9, attributionControl: { compact: true },
      dragRotate: false, pitchWithRotate: false,
    });
    harita.current = h;
    if (import.meta.env.DEV) (window as unknown as { __harita?: maplibregl.Map }).__harita = h;   // geliştirirken konsoldan incelemek için
    h.touchZoomRotate.disableRotation();
    h.addControl(new maplibregl.NavigationControl({ showCompass: false }), "top-right");
    h.on("style.load", () => { stilHazir.current = true; katmanlar.current(); });
    h.on("dataloading", () => guncel.current.yukleniyor(true));
    h.on("idle", () => guncel.current.yukleniyor(false));
    h.on("error", (e) => {
      const m = e.error?.message ?? "";
      if (m && !/aborted|AbortError/i.test(m)) guncel.current.hata(m);
    });
    h.on("click", (e) => {
      const { lat, lng } = e.lngLat, adres = guncel.current.kaynak.alan;
      const bildir = (deger: number | null) => guncel.current.nokta(lat, lng, deger);
      if (!adres) { bildir(null); return; }
      // paket, değeri haritaya verilen kaynak adresiyle (başında "om://") eşler
      getValueFromLatLong(lat, lng, `om://${adres}`, h.getZoom())
        .catch(() => getValueFromLatLong(lat, lng, adres, h.getZoom()))
        .then((v) => bildir(Number.isFinite(v.value) ? v.value : null))
        .catch(() => bildir(null));
    });
    const gozcu = new ResizeObserver(() => h.resize());
    gozcu.observe(kutu.current!);
    return () => { gozcu.disconnect(); isaret.current?.remove(); isaret.current = null; stilHazir.current = false; h.remove(); harita.current = null; };
    // konum yalnızca ilk ortalamada kullanılır; sonraki değişiklikler aşağıda ele alınır
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // tema: altlık değişir, hava katmanları yeni stile yeniden eklenir
  const ilkTema = useRef(koyu);
  useEffect(() => {
    if (ilkTema.current === koyu) return;
    ilkTema.current = koyu;
    stilHazir.current = false;
    harita.current?.setStyle(koyu ? ALTLIK.koyu : ALTLIK.acik);
  }, [koyu]);

  useEffect(() => { katmanlar.current(); }, [kaynak.alan, kaynak.cizgi, kaynak.ok]);
  useEffect(() => { const h = harita.current; if (h?.getLayer(KATMAN.alan)) h.setPaintProperty(KATMAN.alan, "raster-opacity", ortme); }, [ortme]);

  // seçili konumun işareti; konum görünen alanın dışındaysa harita oraya kayar
  useEffect(() => {
    const h = harita.current;
    if (!h) return;
    isaret.current ??= new maplibregl.Marker({ color: "#C6E066" });
    isaret.current.setLngLat([konum.lon, konum.lat]).addTo(h);
    if (!h.getBounds().contains([konum.lon, konum.lat])) h.easeTo({ center: [konum.lon, konum.lat], duration: 600 });
  }, [konum.lat, konum.lon]);

  return <div ref={kutu} className="uz-harita-kutu" role="application" aria-label="Hava haritası. Bir noktaya dokunarak o yeri seçebilirsin." />;
}
