/** Basit ve Uzman modlarının paylaştığı veri tipleri. */

/** Uygulamanın konum kaydı; alanlar Streamlit sürümündeki konum sözlüğüyle aynıdır. */
export interface Konum {
  ad: string;
  lat: number;
  lon: number;
  /** IANA saat dilimi ("Europe/Istanbul") ya da "auto": o zaman tahmin yanıtındaki saat dilimi kullanılır. */
  tz: string;
  /** Metre; bilinmiyorsa null (haritadan seçilen nokta). Sayfalar gerekirse yanıttaki model rakımını kullanır. */
  rakim: number | null;
  bolge: string;
}

/** Eksik ölçüm null'dur (pandas'taki NaN karşılığı). Eksik veri asla 0 ile doldurulmaz. */
export type Deger = number | null;

/** Saatlik tablo. `zaman`, tahminin GEÇERLİLİK zamanlarıdır: konumun yerel duvar saati, "YYYY-AA-GGTSS:DD".
 * Modelin koşu (başlangıç) zamanı burada değil, ModelKosusu'ndadır; ikisi birbirine karıştırılmaz. */
export interface Tablo {
  zaman: string[];
  sutun: Record<string, Deger[]>;
}

export interface Anlik {
  zaman: string;
  deger: Record<string, Deger>;
}

export interface GunlukTablo {
  /** "YYYY-AA-GG" */
  gun: string[];
  sutun: Record<string, Deger[]>;
  /** Yerel saat, "YYYY-AA-GGTSS:DD"; kutup gecesi/gündüzünde null olabilir. */
  gunDogumu: (string | null)[];
  gunBatimi: (string | null)[];
}

/** Bir yanıtın nereden geldiği: arayüz "eski veri" rozetini buna göre gösterir. */
export interface YanitBilgisi {
  /** Verinin ait olduğu dönem: "2026-11-14T22" (saatlik) ya da "2026-11-14" (günlük). */
  donem: string;
  /** ag: az önce indirildi · onbellek: bu dönemde daha önce indirilmişti · eski: bu dönemin verisi alınamadı,
   * önceki bir dönemin kaydı gösteriliyor */
  kaynak: "ag" | "onbellek" | "eski";
}

export interface Tahmin {
  anlik: Anlik;
  saatlik: Tablo;
  gunluk: GunlukTablo;
  /** Yanıtın saat dilimi (konum "auto" ise gerçek ad buradan öğrenilir). */
  tz: string;
  utcFarkiSn: number;
  /** Model ızgarasının rakımı (m). */
  rakim: number | null;
  bilgi: YanitBilgisi;
}

/** Bir modelin son koşusu. Zamanlar UTC anlarıdır (geçerlilik zamanlarının tersine yerel saat değildir). */
export interface ModelKosusu {
  model: string;
  /** Koşunun başlangıç (analiz) zamanı, ör. 12Z. */
  baslangic: Date;
  /** Bu koşunun API'de yayımlandığı an. */
  yayin: Date;
  /** Verinin kapsadığı son geçerlilik zamanı. */
  veriSonu: Date;
  /** Modelin kaç saniyede bir yeniden çalıştığı. */
  guncellemeSn: number;
  /** Tahmin adımı (saniye). */
  adimSn: number;
}

/** Yer adı servisinden gelen tek sonuç (Open-Meteo geocoding). */
export interface AramaSonucu {
  name: string;
  latitude: number;
  longitude: number;
  elevation?: number;
  timezone?: string;
  admin1?: string;
  country?: string;
}
