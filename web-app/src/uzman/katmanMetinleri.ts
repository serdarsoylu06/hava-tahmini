/** Harita katmanları ve "neye bakmalı?" açıklamaları: hava/harita.py'deki KATMANLAR sözlüğünden ÜRETİLMİŞTİR
 * (metinler birebir aynıdır; referans/harita_katmanlari.json ile sınanır). Deniz katmanları (dalga, deniz suyu
 * sıcaklığı) Streamlit sürümünde yoktur; bu dosyanın sonunda ayrı bir listede durur. */
export interface Katman {
  kod: string;
  ad: string;
  /** Renkli alanın değişkeni (Open-Meteo adı). */
  degisken: string;
  birim: string;
  /** Eş değer çizgileri (izobar ya da eş yükseklik): hangi değişken, kaç birimde bir. */
  izo: { degisken: string; aralik: number; ad: string } | null;
  /** Rüzgâr okları çizilsin mi? */
  oklar: boolean;
  /** "Neye bakmalı?" maddeleri (Markdown'daki **kalın** işaretleriyle). */
  bak: string[];
  /** Deniz katmanı: hava modelinin değil, deniz modellerinin ızgara alanlarından okunur. */
  deniz?: boolean;
}

export const KATMANLAR: readonly Katman[] = [
  { kod: "sicaklik", ad: "Sıcaklık + basınç", degisken: "temperature_2m", birim: "°C", izo: { degisken: "pressure_msl", aralik: 4, ad: "Basınç (hPa)" }, oklar: false,
    bak: [
      "**Renkler** yerden 2 m yükseklikteki sıcaklıktır. Kara ile deniz, gündüz ile gece arasındaki farkı zamanı oynatarak izle.",
      "**İnce çizgiler (izobarlar)** eşit basınçlı noktaları birleştirir. Rüzgâr bu çizgilere neredeyse paralel eser: Kuzey Yarımküre'de alçak basınç (A) saat yönünün tersine, yüksek basınç (Y) saat yönünde dolanılır.",
      "**Çizgilerin sıklaştığı yerler** kuvvetli rüzgâr bölgeleridir.",
      "**A merkezleri** bulut ve yağış, **Y merkezleri** açık ve durgun hava getirir.",
    ] },
  { kod: "yagis", ad: "Yağış + basınç", degisken: "precipitation", birim: "mm/saat", izo: { degisken: "pressure_msl", aralik: 4, ad: "Basınç (hPa)" }, oklar: false,
    bak: [
      "**Yağış alanları** genellikle A merkezlerinin doğusunda ve cephe boyunca uzanan bantlar hâlinde görülür.",
      "**Zamanı oynat**: yağış bandının batıdan doğuya ilerleyişi, cephenin hızını gösterir.",
      "**Küçük, dağınık ve yoğun lekeler** konvektif (sağanak/gök gürültülü) yağışı, **geniş ve düzgün bantlar** cephesel yağışı anlatır.",
    ] },
  { kod: "hamle", ad: "Rüzgâr hamleleri", degisken: "wind_gusts_10m", birim: "km/s", izo: { degisken: "pressure_msl", aralik: 4, ad: "Basınç (hPa)" }, oklar: true,
    bak: [
      "**Renkler** hamle hızıdır; 50 km/s üstü ağaç dalı, 75 km/s üstü çatı hasarı riski taşır.",
      "**Oklar** ortalama rüzgârın yönünü ve göreli kuvvetini gösterir; izobarlara neredeyse paralel olduklarına dikkat et.",
      "Boğazlar, vadiler ve dağ geçitleri rüzgârı kanalize eder (ör. Çanakkale, İzmit Körfezi); model çözünürlüğü bunları tam yakalayamaz.",
    ] },
  { kod: "bulut", ad: "Bulutluluk", degisken: "cloud_cover", birim: "%", izo: { degisken: "pressure_msl", aralik: 4, ad: "Basınç (hPa)" }, oklar: false,
    bak: [
      "Bir tür **sentetik uydu görüntüsü**: modelin toplam bulut örtüsü.",
      "**Spiral biçimli bulut alanları** gelişmiş alçak basınç sistemlerinin işaretidir.",
      "Y merkezleri altında bulutsuz alanlar, gece **don ve sis**, gündüz güneşli hava demektir.",
    ] },
  { kod: "t850", ad: "850 hPa sıcaklık (~1,5 km)", degisken: "temperature_850hPa", birim: "°C", izo: { degisken: "geopotential_height_850hPa", aralik: 30, ad: "850 hPa yüksekliği (m)" }, oklar: false,
    bak: [
      "Bu seviye yer yüzeyinin gündüz ısınmasından etkilenmez; **hava kütlesini** doğrudan gösterir.",
      "**Renk kuşaklarının sıklaştığı yerler cephelerdir**: soğuk havanın sıcak havayı ittiği hat.",
      "Kar için pratik kural: **850 hPa sıcaklığı −2/−4 °C'nin altındaysa** yağış alçak kotlarda bile kar olabilir.",
      "Mavi tonların güneye doğru uzanması **soğuk hava girişi** (soğuk adveksiyon) demektir.",
    ] },
  { kod: "z500", ad: "500 hPa yükseklik (~5,5 km)", degisken: "temperature_500hPa", birim: "°C", izo: { degisken: "geopotential_height_500hPa", aralik: 60, ad: "500 hPa yüksekliği (m)" }, oklar: false,
    bak: [
      "Çizgiler 500 hPa basıncının kaç metrede olduğunu gösterir; bu akış **yerdeki sistemleri yönlendirir**.",
      "Çizgilerin güneye **çukurlaştığı** yerler **oluk**tur: soğuk, kararsız hava ve sağanak.",
      "Kuzeye **kabardığı** yerler **sırt**tır: sıcak ve sakin hava.",
      "Akıştan kopmuş kapalı alçak merkezler (**cut-off low**) günlerce aynı bölgede kalıp kalıcı yağış ve sel üretebilir.",
    ] },
];

/** Deniz katmanları: Streamlit sürümünde karşılığı yoktur. Değerler dalga ve okyanus modellerinin kendi ızgara
 * dosyalarından okunur; eşikler Deniz sayfasındaki (hesap/deniz.ts) güvenlik eşikleriyle aynıdır. */
export const DENIZ_KATMANLARI: readonly Katman[] = [
  { kod: "dalga", ad: "Dalga yüksekliği", degisken: "wave_height", birim: "m", izo: null, oklar: false, deniz: true,
    bak: [
      "**Renkler** belirgin dalga yüksekliğidir: en yüksek üçte bir dalganın ortalaması. Tek tek dalgalar bunun iki katına çıkabilir.",
      "Küçük tekneler için **0,5 m üstü** dikkat, **1 m üstü** riskli, **2 m üstü** tehlikelidir (Deniz sayfasındaki eşikler).",
      "**Zamanı oynat**: dalga alanı rüzgârın estiği yöne ilerler; rüzgâr dindikten sonra da soluğan olarak saatlerce sürer.",
      "Model ızgarası koyları, limanları ve sığlıkları çözemez; kıyıdaki dalga açıktakinden farklı olabilir.",
    ] },
  { kod: "deniz_sicakligi", ad: "Deniz suyu sıcaklığı", degisken: "sea_surface_temperature", birim: "°C", izo: null, oklar: false, deniz: true,
    bak: [
      "**Renkler** denizin en üst katmanının sıcaklığıdır; karalar boş kalır.",
      "Deniz karadan çok daha yavaş ısınır ve soğur. Sonbaharda sıcak deniz üzerinden geçen soğuk hava kıyıya sağanak ve kar getirir (deniz etkisi).",
      "**Keskin renk geçişleri** akıntı sınırlarını ve dipten soğuk suyun yüzeye çıktığı yerleri gösterir.",
      "Bu katman Mercator Océan'ın analiz ve tahminidir; hangi hava modeli seçili olursa olsun aynıdır.",
    ] },
];

export const TUM_KATMANLAR: readonly Katman[] = [...KATMANLAR, ...DENIZ_KATMANLARI];
