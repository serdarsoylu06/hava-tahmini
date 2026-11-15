/** WMO hava kodları: hava/veri.py'deki tablonun birebir kopyası (kod → gündüz simgesi, gece simgesi, açıklama). */
export const WMO: Readonly<Record<number, readonly [gunduz: string, gece: string, durum: string]>> = {
  0: ["☀️", "🌙", "Açık"],
  1: ["🌤️", "🌙", "Az bulutlu"],
  2: ["⛅", "☁️", "Parçalı bulutlu"],
  3: ["☁️", "☁️", "Kapalı"],
  45: ["🌫️", "🌫️", "Sis"],
  48: ["🌫️", "🌫️", "Kırağılı sis"],
  51: ["🌦️", "🌧️", "Hafif çisenti"],
  53: ["🌦️", "🌧️", "Çisenti"],
  55: ["🌧️", "🌧️", "Yoğun çisenti"],
  56: ["🌧️", "🌧️", "Donan çisenti"],
  57: ["🌧️", "🌧️", "Yoğun donan çisenti"],
  61: ["🌦️", "🌧️", "Hafif yağmur"],
  63: ["🌧️", "🌧️", "Yağmur"],
  65: ["🌧️", "🌧️", "Kuvvetli yağmur"],
  66: ["🌧️", "🌧️", "Donan yağmur"],
  67: ["🌧️", "🌧️", "Kuvvetli donan yağmur"],
  71: ["🌨️", "🌨️", "Hafif kar"],
  73: ["🌨️", "🌨️", "Kar"],
  75: ["❄️", "❄️", "Yoğun kar"],
  77: ["🌨️", "🌨️", "Kar taneleri"],
  80: ["🌦️", "🌧️", "Hafif sağanak"],
  81: ["🌧️", "🌧️", "Sağanak"],
  82: ["⛈️", "⛈️", "Şiddetli sağanak"],
  85: ["🌨️", "🌨️", "Kar sağanağı"],
  86: ["❄️", "❄️", "Yoğun kar sağanağı"],
  95: ["⛈️", "⛈️", "Gök gürültülü sağanak"],
  96: ["⛈️", "⛈️", "Dolu ile fırtına"],
  99: ["⛈️", "⛈️", "Şiddetli dolu ile fırtına"],
};

/** pandas'taki `int(kod) if pd.notna(kod) else -1` karşılığı: sayı değilse tabloda olmayan bir kod. */
const tamKod = (kod: number | null | undefined) => (kod == null || Number.isNaN(kod) ? -1 : Math.trunc(kod));

/** hava/veri.py → simge */
export function simge(kod: number | null | undefined, gunduz = true): string {
  const k = WMO[tamKod(kod)];
  return k ? (gunduz ? k[0] : k[1]) : "❔";
}

/** hava/veri.py → durum */
export function durum(kod: number | null | undefined): string {
  return WMO[tamKod(kod)]?.[2] ?? "Bilinmiyor";
}
