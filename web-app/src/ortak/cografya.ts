/** Coğrafi yardımcılar: hava/yerler.py ve hava/veri.py'deki formüllerin birebir karşılığı. */
const RAD = Math.PI / 180;

/** 16'lı pusula: rüzgârın GELDİĞİ yön (meteorolojik). */
export const YON16 = ["K", "KKD", "KD", "DKD", "D", "DGD", "GD", "GGD", "G", "GGB", "GB", "BGB", "B", "BKB", "KB", "KKB"] as const;
/** 8'li pusula: "… yakını (6 km KD)" yazımında kullanılır. */
export const YON8 = ["K", "KD", "D", "GD", "G", "GB", "B", "KB"] as const;

/** Python'un `%` işleci gibi: sonuç her zaman [0, m) aralığındadır. */
const mod = (x: number, m: number) => ((x % m) + m) % m;

/** hava/veri.py → yon_adi */
export function yonAdi(derece: number): string {
  return YON16[Math.trunc(mod(derece, 360) / 22.5 + 0.5) % 16]!;
}

/** İki nokta arası büyük daire mesafesi (km, haversine; yarıçap 6371 km). hava/yerler.py → mesafe_km */
export function mesafeKm(lat1: number, lon1: number, lat2: number, lon2: number): number {
  const p1 = lat1 * RAD, p2 = lat2 * RAD;
  const a = Math.sin((p2 - p1) / 2) ** 2 + Math.cos(p1) * Math.cos(p2) * Math.sin(((lon2 - lon1) * RAD) / 2) ** 2;
  return 6371 * 2 * Math.asin(Math.sqrt(a));
}

/** 1. noktadan 2. noktaya pusula yönü (derece, kuzeyden saat yönünde). hava/yerler.py → kerteriz */
export function kerteriz(lat1: number, lon1: number, lat2: number, lon2: number): number {
  const p1 = lat1 * RAD, p2 = lat2 * RAD, dl = (lon2 - lon1) * RAD;
  const x = Math.sin(dl) * Math.cos(p2);
  const y = Math.cos(p1) * Math.sin(p2) - Math.sin(p1) * Math.cos(p2) * Math.cos(dl);
  return (Math.atan2(x, y) / RAD + 360) % 360;
}
