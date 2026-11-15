/** Open-Meteo istekleri (hava/veri.py → tahmin, ansambl, simdiden). Uç noktalar ve değişken listeleri Streamlit
 * sürümüyle birebir aynıdır; referans/sabitler.json ile sınanır. */
import { saatBasi } from "../ortak/zaman";
import { anlikDogrula, apiHatasiMi, gunlukDogrula, nesneMi, tabloDogrula } from "./dogrula";
import { type Istemci, VeriHatasi } from "./istemci";
import type { AramaSonucu, Konum, ModelKosusu, Tablo, Tahmin, YanitBilgisi } from "./tipler";

export const FC = "https://api.open-meteo.com/v1/forecast";
export const ENS = "https://ensemble-api.open-meteo.com/v1/ensemble";
export const GEO = "https://geocoding-api.open-meteo.com/v1/search";
export const DENIZ = "https://marine-api.open-meteo.com/v1/marine";
const META = (model: string) => `https://api.open-meteo.com/data/${model}/static/meta.json`;

export const SEVIYELER = [1000, 925, 850, 700, 600, 500, 400, 300, 250, 200] as const;
/** Ortak tahmin isteği hep bu kadar gün çeker; sayfalar kendi aralığını keser (tek istek, tek önbellek kaydı). */
export const GUN_EN_COK = 10;

export const SAATLIK = "temperature_2m,dew_point_2m,apparent_temperature,precipitation,precipitation_probability," +
  "weather_code,is_day,wind_speed_10m,wind_gusts_10m,wind_direction_10m,cloud_cover," +
  "cloud_cover_low,cloud_cover_mid,cloud_cover_high,pressure_msl,relative_humidity_2m," +
  "snowfall,freezing_level_height,visibility,uv_index,cape";
export const GUNLUK = "weather_code,temperature_2m_max,temperature_2m_min,precipitation_sum," +
  "precipitation_probability_max,snowfall_sum,wind_gusts_10m_max,wind_direction_10m_dominant," +
  "sunrise,sunset,uv_index_max";
export const ANLIK = "temperature_2m,apparent_temperature,relative_humidity_2m,dew_point_2m,weather_code,is_day," +
  "wind_speed_10m,wind_direction_10m,wind_gusts_10m,pressure_msl,cloud_cover,precipitation," +
  "visibility,uv_index";

function bosDegil<T>(veri: T | null): T {
  if (veri === null) throw new VeriHatasi("bicim", "Yanıt boş", "Sunucu boş yanıt döndürdü");
  apiHatasiMi(veri);
  return veri;
}

/** Seçili konum için anlık durum, saatlik ve günlük tahmin. Bütün sayfalar bu tek isteği paylaşır. */
export async function tahmin(istemci: Istemci, k: Konum): Promise<Tahmin> {
  const { veri, bilgi } = await istemci.getir(FC, {
    latitude: k.lat, longitude: k.lon, current: ANLIK, hourly: SAATLIK, daily: GUNLUK,
    forecast_days: GUN_EN_COK, timezone: k.tz,
  });
  const js = bosDegil(veri);
  if (!nesneMi(js)) throw new VeriHatasi("bicim", "Yanıt beklenen biçimde değil", "tahmin yanıtı nesne değil");
  return {
    anlik: anlikDogrula(js.current, ANLIK.split(",")),
    saatlik: tabloDogrula(js.hourly, SAATLIK.split(",")),
    gunluk: gunlukDogrula(js.daily, GUNLUK.split(",")),
    tz: typeof js.timezone === "string" ? js.timezone : k.tz,
    utcFarkiSn: typeof js.utc_offset_seconds === "number" ? js.utc_offset_seconds : 0,
    rakim: typeof js.elevation === "number" ? js.elevation : null,
    bilgi,
  };
}

/** Saatlik tabloyu `simdi` saatinden ("YYYY-AA-GGTSS:00", konumun yerel saati) başlatır; API gece yarısından başlar. */
export function simdiden(t: Tablo, simdi: string): Tablo {
  const i = t.zaman.findIndex((z) => z >= simdi);
  const bas = i === -1 ? t.zaman.length : i;
  return { zaman: t.zaman.slice(bas),
           sutun: Object.fromEntries(Object.entries(t.sutun).map(([k, v]) => [k, v.slice(bas)])) };
}

/** Konumun yerel saatiyle içinde bulunulan saatin başı. `tz` gerçek bir saat dilimi olmalıdır: konum "auto" ise
 * tahmin yanıtındaki `tz` verilir. (Streamlit sürümü "auto"da sunucunun saatini kullanıyordu; sunucu UTC'de
 * çalıştığında bu, yerel saatten sapıyordu. Burada her zaman konumun kendi saati kullanılır.) */
export function simdikiSaat(tz: string, an: Date = new Date()): string {
  return saatBasi(an, tz);
}

/** Ansambl üyeleri: sütunlar `degisken` (kontrol koşusu) ve `degisken_memberNN`. */
export async function ansambl(istemci: Istemci, k: Konum, model: string, degisken: string, gun: number,
                              an: Date = new Date()): Promise<{ tablo: Tablo; bilgi: YanitBilgisi }> {
  const { veri, bilgi } = await istemci.getir(ENS, {
    latitude: k.lat, longitude: k.lon, hourly: degisken, models: model, forecast_days: gun, timezone: k.tz,
  });
  const js = bosDegil(veri);
  if (!nesneMi(js)) throw new VeriHatasi("bicim", "Yanıt beklenen biçimde değil", "ansambl yanıtı nesne değil");
  const tum = simdiden(tabloDogrula(js.hourly), simdikiSaat(typeof js.timezone === "string" ? js.timezone : k.tz, an));
  const sutun = Object.fromEntries(Object.entries(tum.sutun)
    .filter(([ad]) => ad === degisken || ad.startsWith(`${degisken}_member`)));
  return { tablo: { zaman: tum.zaman, sutun }, bilgi };
}

/** Listede olmayan bir yer adı için yer adı servisi (en çok 6 sonuç, Türkçe adlarla). */
export async function yerAra(istemci: Istemci, ad: string): Promise<AramaSonucu[]> {
  const { veri } = await istemci.getir(GEO, { name: ad, count: 6, language: "tr" });
  const js = bosDegil(veri);
  const sonuc = nesneMi(js) && Array.isArray(js.results) ? js.results : [];
  return sonuc.filter((s): s is AramaSonucu =>
    nesneMi(s) && typeof s.name === "string" && typeof s.latitude === "number" && typeof s.longitude === "number");
}

/** Bir modelin son koşusunun zamanları. Model adları Open-Meteo veri klasörlerinin adıdır: "ecmwf_ifs025",
 * "dwd_icon", "ncep_gfs013" (üçü de 14.11.2026'da denendi). */
export async function modelKosusu(istemci: Istemci, model: string): Promise<ModelKosusu> {
  const { veri } = await istemci.getir(META(model), {});
  const js = bosDegil(veri);
  const sn = (ad: string) => {
    const v = nesneMi(js) ? js[ad] : undefined;
    if (typeof v !== "number") throw new VeriHatasi("bicim", "Yanıt beklenen biçimde değil", `model bilgisi: "${ad}" yok`);
    return v;
  };
  return {
    model,
    baslangic: new Date(sn("last_run_initialisation_time") * 1000),
    yayin: new Date(sn("last_run_availability_time") * 1000),
    veriSonu: new Date(sn("data_end_time") * 1000),
    guncellemeSn: sn("update_interval_seconds"),
    adimSn: sn("temporal_resolution_seconds"),
  };
}
