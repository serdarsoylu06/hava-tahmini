/** Canlı gözlem katmanları: RainViewer yağış radarı ve EUMETSAT Meteosat uydu görüntüsü (hava/canli.py karşılığı).
 * İkisi de gerçek gözlemdir ve doğrudan tarayıcıdan, karo olarak okunur. */
import { nesneMi } from "../veri/dogrula";
import { type Istemci, VeriHatasi } from "../veri/istemci";

export const RAINVIEWER = "https://api.rainviewer.com/public/weather-maps.json";
export const EUMETSAT = "https://view.eumetsat.int/geoserver";
export const UYDU_KATMAN: Readonly<Record<string, string>> = {
  "Doğal renk (gündüz) / kızılötesi (gece)": "mtg_fd:rgb_geocolour",
  "Kızılötesi (bulut tepesi sıcaklığı)": "mtg_fd:ir105_hrfi",
};
/** RainViewer karoları en çok bu yakınlığa kadar yayımlanır; daha yakında aynı karo büyütülür. */
export const RADAR_EN_YAKIN = 7;

/** Bir animasyon karesi: görüntünün zamanı (Unix saniyesi) ve harita karolarının adres kalıbı. */
export interface Kare { zaman: number; karo: string }

/** RainViewer yanıtından son ~2 saatin radar kareleri (10 dakikada bir) ve kapsama katmanı. */
export function radarAyikla(js: unknown): { kareler: Kare[]; kapsama: string | null } {
  if (!nesneMi(js) || typeof js.host !== "string" || !nesneMi(js.radar) || !Array.isArray(js.radar.past)) return { kareler: [], kapsama: null };
  const host = js.host;
  const kareler = js.radar.past.flatMap((k: unknown): Kare[] =>
    (nesneMi(k) && typeof k.time === "number" && typeof k.path === "string" ? [{ zaman: k.time, karo: `${host}${k.path}/256/{z}/{x}/{y}/2/1_1.png` }] : []));
  return { kareler: kareler.sort((a, b) => a.zaman - b.zaman), kapsama: kareler.length ? `${host}/v2/coverage/0/256/{z}/{x}/{y}/0/0_0.png` : null };
}

/** EUMETView'un bir katman için yayımladığı son görüntü zamanı (WMS yetenek belgesinden); bulunamazsa null. */
export function sonUyduZamani(xml: string): number | null {
  const m = /name="time"\s+default="([^"]+)"/.exec(xml);
  const ms = m ? Date.parse(m[1]!) : NaN;
  return Number.isFinite(ms) ? Math.floor(ms / 1000) : null;
}

/** Son ~2 saatin uydu kareleri (Meteosat, 15 dakikada bir), eskiden yeniye. */
export function uyduKareleri(katman: string, son: number, adet = 8): Kare[] {
  // "image/vnd.jpeg-png": sunucu karo tümüyle doluysa JPEG, saydam yeri varsa PNG verir. Aynı karo PNG olarak
  // ~500 kB, JPEG olarak ~40 kB; sekiz karelik animasyon telefonda ancak böyle indirilebilir boyutta kalır.
  const temel = `${EUMETSAT}/ows?service=WMS&request=GetMap&version=1.3.0&layers=${katman}&styles=&format=image/vnd.jpeg-png` +
                "&transparent=true&crs=EPSG:3857&bbox={bbox-epsg-3857}&width=512&height=512";
  return Array.from({ length: adet }, (_, i) => son - 900 * (adet - 1 - i))
    .map((zaman) => ({ zaman, karo: `${temel}&time=${new Date(zaman * 1000).toISOString().slice(0, 19)}Z` }));
}

/** Verilen ana en yakın karenin sırası; kare yoksa −1. */
export function kareSec(kareler: readonly Kare[], zaman: number): number {
  let en = -1, fark = Infinity;
  kareler.forEach((k, i) => { const f = Math.abs(k.zaman - zaman); if (f < fark) { fark = f; en = i; } });
  return en;
}

/** `dakika` dakikalık dilimin adı: kare listeleri bu süre boyunca yeniden indirilmez. */
const dilim = (dakika: number, an: Date) => `${dakika}dk-${Math.floor(an.getTime() / (dakika * 60_000))}`;

/** Radar kareleri (5 dakikada bir yenilenir). Alınamazsa boş liste. */
export async function radarKareleri(istemci: Istemci, an: Date = new Date()): Promise<{ kareler: Kare[]; kapsama: string | null }> {
  try {
    const { veri } = await istemci.getir(RAINVIEWER, {}, { donem: dilim(5, an), omurGun: 1 });
    return radarAyikla(veri);
  } catch (e) {
    if (e instanceof VeriHatasi) return { kareler: [], kapsama: null };
    throw e;
  }
}

/** Uydu kareleri (son görüntü zamanı 10 dakikada bir sorulur). Alınamazsa boş liste. */
export async function uyduKareleriGetir(istemci: Istemci, katman: string, an: Date = new Date()): Promise<Kare[]> {
  try {
    // katmana özel yetenek belgesi (birkaç kB); bütün katmanların belgesi megabaytlarcadır
    const { veri } = await istemci.getir<string>(`${EUMETSAT}/${katman.replace(":", "/")}/ows`, { service: "WMS", request: "GetCapabilities", version: "1.3.0" },
                                                 { metin: true, donem: dilim(10, an), omurGun: 1 });
    const son = veri == null ? null : sonUyduZamani(veri);
    return son == null ? [] : uyduKareleri(katman, son);
  } catch (e) {
    if (e instanceof VeriHatasi) return [];
    throw e;
  }
}
