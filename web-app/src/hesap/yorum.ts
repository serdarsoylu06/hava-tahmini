/** Tahmin verisinden "nelere dikkat etmeli?" uyarıları üretir (hava/yorum.py'nin birebir karşılığı).
 * Her uyarı ne olacağını, ne zaman olacağını, neden önemli olduğunu ve hangi sayfada izleneceğini söyler;
 * eşikler MGM ve WMO'nun halka yönelik uyarı eşiklerine yakın seçildi. Eşikler ve metinler Python sürümüyle
 * aynıdır; referans/uyarilar.json ile sınanır. */
import { ceyrek, enBuyuk, enKucuk, ilkEnBuyuk, ilkEnKucuk, maske, topla } from "../ortak/dizi";
import { pyBicim } from "../ortak/sayi";
import { gunYaz, saatEkle, zamanYaz } from "../ortak/zaman";
import type { Deger, Tablo } from "../veri/tipler";

export type Seviye = "tehlike" | "dikkat" | "bilgi" | "iyi";
export const SIRA: Readonly<Record<Seviye, number>> = { tehlike: 0, dikkat: 1, bilgi: 2, iyi: 3 };

export interface Uyari {
  seviye: Seviye;
  /** Streamlit'teki simge adı (":material/ac_unit:"); arayüz kendi simgesine çevirir. */
  ikon: string;
  baslik: string;
  /** ne, ne zaman, ne kadar */
  ozet: string;
  /** öğretici açıklama: neden önemli, nasıl oluşur */
  neden: string;
  /** bu olayı izlemek için hangi sayfa (Streamlit'teki sayfa yolu) */
  bak: string;
  /** o sayfada neye bakmalı */
  bak_ne: string;
}

/** Günlük seri (ör. ansambl yayılımı): `gun` "YYYY-AA-GG". */
export interface GunlukSeri {
  gun: string[];
  deger: Deger[];
}

/** True olan saatleri ardışık bloklara ayırıp ilkini ve toplam blok sayısını yazar. hava/yorum.py → aralik */
export function aralik(zaman: readonly string[], m: readonly boolean[]): string {
  let ilk: [number, number] | null = null, n = 0;
  for (let i = 0; i < m.length; i++) {
    if (!m[i] || (i > 0 && m[i - 1])) continue;
    n++;
    if (!ilk) {
      let j = i;
      while (j + 1 < m.length && m[j + 1]) j++;
      ilk = [i, j];
    }
  }
  if (!ilk) return "";
  const bas = zaman[ilk[0]]!, son = zaman[ilk[1]]!;
  const metin = ilk[0] === ilk[1] ? zamanYaz(bas) : `${zamanYaz(bas)} – ${son.slice(11, 16)}`;
  return metin + (n > 1 ? ` (ve ${n - 1} dönem daha)` : "");
}

/** Saatlik değerlerin takvim gününe göre toplamı (pandas `resample("D").sum()`). */
export function gunlukToplam(zaman: readonly string[], v: readonly Deger[]): GunlukSeri {
  const gun: string[] = [], deger: number[] = [];
  zaman.forEach((z, i) => {
    const g = z.slice(0, 10);
    if (gun[gun.length - 1] !== g) { gun.push(g); deger.push(0); }
    deger[deger.length - 1]! += v[i] ?? 0;
  });
  return { gun, deger };
}

const veya = (a: readonly boolean[], b: readonly boolean[]) => a.map((x, i) => x || b[i]!);
const ve = (...m: (readonly boolean[])[]) => m[0]!.map((_, i) => m.every((x) => x[i]));
const fark = (a: readonly Deger[], b: readonly Deger[]): Deger[] => a.map((x, i) => (x == null || b[i] == null ? null : x - b[i]!));

/** `t`: saatlik tahmin (şu andan başlayan dönem), `rakim`: m, `guven`: günlük ansambl yayılımı (°C). */
export function uyarilar(t: Tablo, rakim: number | null = null, guven: GunlukSeri | null = null): Uyari[] {
  const u: Uyari[] = [];
  const z = t.zaman;
  const s = (ad: string): readonly Deger[] => t.sutun[ad] ?? z.map(() => null);
  const T = s("temperature_2m"), Td = s("dew_point_2m"), kod = s("weather_code");

  // --- don
  const Tmin = enKucuk(T);
  if (Tmin <= 0) {
    u.push({ seviye: Tmin <= -5 ? "tehlike" : "dikkat", ikon: ":material/ac_unit:", baslik: "Don ve buzlanma",
      ozet: `Sıcaklık ${pyBicim(Tmin)} °C'ye iniyor (${zamanYaz(z[ilkEnKucuk(T)]!)}). ` +
            `0 °C altı: ${aralik(z, maske(T, (x) => x <= 0))}.`,
      neden: "Açık ve rüzgârsız gecelerde yer, ışınımla ısısını uzaya hızla kaybeder; en düşük " +
             "sıcaklık genellikle gün doğumundan hemen önce görülür. Yollarda gizli buz, " +
             "tesisat ve tarım için risktir.",
      bak: "app_pages/meteogram.py",
      bak_ne: "Sıcaklık çizgisi 0 °C'nin altına indiği gecelerde bulut paneline bak: " +
              "bulutsuz gece daha soğuk geçer." });
  }

  // --- rüzgâr
  const g = s("wind_gusts_10m"), gmax = enBuyuk(g);
  if (gmax >= 50) {
    u.push({ seviye: gmax >= 75 ? "tehlike" : "dikkat", ikon: ":material/air:", baslik: "Kuvvetli rüzgâr",
      ozet: `Hamleler ${pyBicim(gmax)} km/s'e ulaşıyor (${zamanYaz(z[ilkEnBuyuk(g)]!)}). ` +
            `50 km/s üstü: ${aralik(z, maske(g, (x) => x >= 50))}.`,
      neden: "Hamle, birkaç saniyelik en kuvvetli esintidir ve hasarı ortalama rüzgâr değil " +
             "hamle verir. 50 km/s'te dallar kırılabilir, 75 km/s'te çatı ve ağaç hasarı " +
             "başlar. Rüzgârın kaynağı genellikle sıkışmış izobarlardır.",
      bak: "app_pages/haritalar.py",
      bak_ne: "Basınç haritasında izobarların birbirine yaklaştığı yerler kuvvetli rüzgâr " +
              "bölgeleridir." });
  }

  // --- yağış
  const p = s("precipitation"), pmax = enBuyuk(p);
  const gunluk = gunlukToplam(z, p), gunlukMax = enBuyuk(gunluk.deger);
  if (pmax >= 7.6 || gunlukMax >= 20) {
    u.push({ seviye: gunlukMax >= 50 ? "tehlike" : "dikkat", ikon: ":material/water_drop:", baslik: "Kuvvetli yağış",
      ozet: `En yağışlı gün ${gunYaz(gunluk.gun[ilkEnBuyuk(gunluk.deger)]!)}: ${pyBicim(gunlukMax)} mm. ` +
            `Saatlik en fazla ${pyBicim(pmax, 1)} mm (${zamanYaz(z[ilkEnBuyuk(p)]!)}).`,
      neden: "1 mm yağış, metrekareye 1 litre su demektir. Saatte 7–8 mm'yi aşan yağış " +
             "'kuvvetli' sayılır; kısa sürede düşen 20 mm ve üstü yağış kentlerde su " +
             "baskını, eğimli arazide sel riski doğurur.",
      bak: "app_pages/ansambl.py",
      bak_ne: "Ansambl sayfasında eşiği 10 mm'ye çekip kaç üyenin bu yağışı verdiğine bak; " +
              "tek bir modelin çıktısı yanıltıcı olabilir." });
  }

  // --- donan yağmur
  const donan = maske(kod, (x) => x === 56 || x === 57 || x === 66 || x === 67);
  if (donan.some(Boolean)) {
    u.push({ seviye: "tehlike", ikon: ":material/severe_cold:", baslik: "Donan yağmur",
      ozet: `Donan yağmur/çisenti bekleniyor: ${aralik(z, donan)}.`,
      neden: "Üstteki sıcak katmanda eriyen kar, donma noktasının altındaki yere düşünce " +
             "anında buz tabakasına döner. Kardan çok daha tehlikelidir.",
      bak: "app_pages/profil.py",
      bak_ne: "Atmosfer profilinde sıcaklık çizgisinin yerin hemen üstünde 0 °C'yi aşıp " +
              "yere yakın yeniden altına indiği 'sıcak burun'u ara." });
  }

  // --- kar
  const karDizi = s("snowfall"), kar = topla(karDizi);
  if (kar >= 0.5) {
    u.push({ seviye: kar >= 10 ? "tehlike" : "dikkat", ikon: ":material/weather_snowy:", baslik: "Kar yağışı",
      ozet: `Toplam ${pyBicim(kar)} cm kar bekleniyor. Kar yağan saatler: ${aralik(z, maske(karDizi, (x) => x > 0))}.`,
      neden: "Kar birikimi yağışın yaklaşık 10 katıdır (1 mm su ≈ 1 cm kar). Yağışın kar mı " +
             "yağmur mu olacağını donma seviyesi belirler: kar, donma seviyesinin birkaç " +
             "yüz metre altına kadar erimeden iner.",
      bak: "app_pages/meteogram.py",
      bak_ne: "En alttaki panelde mavi donma seviyesi çizgisinin kesikli rakım çizgisine " +
              "ne kadar yaklaştığına bak." });
  } else if (rakim !== null) {
    const sinirda = ve(maske(p, (x) => x > 0.2), maske(s("freezing_level_height"), (x) => x - rakim < 400));
    if (sinirda.some(Boolean)) {
      u.push({ seviye: "bilgi", ikon: ":material/weather_mix:", baslik: "Karla karışık yağmur olasılığı",
        ozet: "Yağış sırasında donma seviyesi bulunduğun yere 400 m'den fazla yaklaşıyor: " +
              `${aralik(z, sinirda)}.`,
        neden: "Donma seviyesi ile yer arasındaki mesafe kısaldığında düşen kar tamamen " +
               "erimeye vakit bulamaz. Birkaç yüz metrelik fark, aynı şehrin yüksek " +
               "semtlerinde kar, alçak semtlerinde yağmur görülmesine yol açar.",
        bak: "app_pages/meteogram.py",
        bak_ne: "En alttaki panelde donma seviyesi ile rakım çizgisinin arasını izle." });
    }
  }

  // --- sis
  const gorus = s("visibility");
  const sis = veya(ve(maske(fark(T, Td), (x) => x <= 1), maske(s("wind_speed_10m"), (x) => x < 8), maske(gorus, (x) => x < 1000)),
                   maske(kod, (x) => x === 45 || x === 48));
  if (sis.filter(Boolean).length >= 2) {
    u.push({ seviye: "dikkat", ikon: ":material/foggy:", baslik: "Sis",
      ozet: `Görüş 1 km'nin altına düşebilir: ${aralik(z, sis)}. ` +
            `En düşük görüş ${pyBicim(enKucuk(gorus) / 1000, 1)} km.`,
      neden: "Hava soğuyup sıcaklığı çiy noktasına indiğinde nem yoğuşur. Sis en çok açık, " +
             "rüzgârsız ve nemli gecelerin sabahında oluşur; güneş yükselip yer ısındıkça " +
             "dağılır.",
      bak: "app_pages/meteogram.py",
      bak_ne: "Sıcaklık ile çiy noktası çizgilerinin birleştiği saatlere bak." });
  }

  // --- gök gürültülü sağanak
  const cape = s("cape"), capeMax = enBuyuk(cape);
  const firtina = maske(kod, (x) => x >= 95);
  const kararsiz = ve(maske(cape, (x) => x >= 1000), maske(s("precipitation_probability"), (x) => x >= 30));
  if (firtina.some(Boolean) || kararsiz.some(Boolean)) {
    const tepe = ilkEnBuyuk(cape);
    u.push({ seviye: capeMax >= 2500 ? "tehlike" : "dikkat", ikon: ":material/thunderstorm:", baslik: "Gök gürültülü sağanak",
      ozet: `Kararsızlık enerjisi (CAPE) ${pyBicim(capeMax)} J/kg'a çıkıyor ` +
            `(${tepe === -1 ? "—" : zamanYaz(z[tepe]!)}). Riskli saatler: ${aralik(z, veya(firtina, kararsiz))}.`,
      neden: "CAPE, yükselen havanın kazanabileceği enerjidir. 1000 J/kg üstü cumulonimbus " +
             "bulutlarına, 2500 üstü dolu ve ani kuvvetli rüzgâra yetecek enerjidir. Bu " +
             "olaylar küçük ölçeklidir; tam yeri ve saati önceden kestirilemez.",
      bak: "app_pages/profil.py",
      bak_ne: "Atmosfer profilinde kırmızı gölgeli (CAPE) alanın büyüklüğüne ve yükselen " +
              "parselin önündeki mavi 'kapak'a (CIN) bak." });
  }

  // --- basınç düşüşü (24 saat önceki değere göre)
  const basinc = s("pressure_msl");
  const dp: Deger[] = basinc.map((x, i) => (i < 24 || x == null || basinc[i - 24] == null ? null : x - basinc[i - 24]!));
  const dpMin = enKucuk(dp);
  if (dpMin <= -6) {
    const bitis = z[ilkEnKucuk(dp)]!;
    u.push({ seviye: dpMin <= -10 ? "dikkat" : "bilgi", ikon: ":material/trending_down:", baslik: "Hızlı basınç düşüşü",
      ozet: `24 saatte ${pyBicim(dpMin)} hPa düşüş (${zamanYaz(saatEkle(bitis, -24))} → ` +
            `${zamanYaz(bitis)}).`,
      neden: "Basıncın hızla düşmesi bir alçak basınç sisteminin yaklaştığını ya da " +
             "derinleştiğini gösterir; ardından rüzgâr, bulut ve yağış gelir. 24 saatte " +
             "~20 hPa'dan fazla düşüş 'patlayıcı' (bomba) siklon olarak adlandırılır.",
      bak: "app_pages/haritalar.py",
      bak_ne: "Basınç haritasında zamanı ilerletip 'A' merkezinin sana doğru gelişini izle." });
  }

  // --- sıcak
  const h = s("apparent_temperature"), hmax = enBuyuk(h);
  if (hmax >= 32) {
    u.push({ seviye: hmax >= 38 ? "tehlike" : "dikkat", ikon: ":material/thermostat:", baslik: "Sıcak çarpması riski",
      ozet: `Hissedilen sıcaklık ${pyBicim(hmax)} °C (${zamanYaz(z[ilkEnBuyuk(h)]!)}).`,
      neden: "Hissedilen sıcaklık nemi ve rüzgârı hesaba katar. Nem yüksekken ter " +
             "buharlaşamaz ve vücut serinleyemez; bu yüzden 32 °C nemli hava, 36 °C kuru " +
             "havadan daha yorucu olabilir.",
      bak: "app_pages/meteogram.py",
      bak_ne: "Hissedilen sıcaklık çizgisinin gerçek sıcaklıktan ne kadar ayrıldığına bak." });
  }

  // --- UV
  const uv = s("uv_index"), uvMax = enBuyuk(uv);
  if (uvMax >= 6) {
    u.push({ seviye: uvMax >= 8 ? "dikkat" : "bilgi", ikon: ":material/wb_sunny:", baslik: "Yüksek UV",
      ozet: `UV indeksi ${pyBicim(uvMax)}'a çıkıyor (${gunYaz(z[ilkEnBuyuk(uv)]!)} öğle saatleri).`,
      neden: "UV 6–7 yüksek, 8–10 çok yüksektir; korumasız ciltte 15–25 dakikada yanık " +
             "oluşabilir. Bulutlu havada bile UV'nin büyük kısmı yere ulaşır.",
      bak: "app_pages/genel.py", bak_ne: "Günlük tablodaki UV sütununa bak." });
  }

  // --- tahmin güveni
  const ilk = guven ? guven.deger.findIndex((x) => x != null && x >= 5) : -1;
  if (guven && ilk !== -1) {
    u.push({ seviye: "bilgi", ikon: ":material/blur_on:", baslik: "Belirsizlik artıyor",
      ozet: `${gunYaz(guven.gun[ilk]!)} itibarıyla ansambl üyeleri en yüksek sıcaklıkta ` +
            `${pyBicim(guven.deger[ilk]!)} °C'den fazla ayrışıyor.`,
      neden: "Atmosfer kaotiktir: başlangıçtaki küçük ölçüm hataları zamanla büyür. Model " +
             "çıktıları ayrıştığında tek bir sayıya değil, olası aralığa güvenmek gerekir.",
      bak: "app_pages/ansambl.py",
      bak_ne: "Spagetti çizgilerinin dağılmaya başladığı tarihe ve mavi bandın genişliğine bak." });
  }

  if (!u.some((x) => x.seviye === "tehlike" || x.seviye === "dikkat")) {
    u.push({ seviye: "iyi", ikon: ":material/check_circle:", baslik: "Önemli bir hava olayı beklenmiyor",
      ozet: "Seçilen dönemde uyarı eşiklerini aşan bir değer yok.",
      neden: "Yine de birkaç günden uzun tahminlerde ansambl sayfasına göz atmak, " +
             "tahminin ne kadar güvenilir olduğunu gösterir.",
      bak: "app_pages/ansambl.py", bak_ne: "Bandın genişliğine bak." });
  }
  return u.map((x, i) => [x, i] as const).sort((a, b) => SIRA[a[0].seviye] - SIRA[b[0].seviye] || a[1] - b[1]).map(([x]) => x);
}

/** Ansambl üyelerinden tahmin güveni: günlük en yüksek sıcaklıkta %10–%90 aralığı (app_pages/genel.py). */
export function ansamblGuveni(uyeler: Tablo): GunlukSeri {
  const gun: string[] = [];
  const gunMax: Record<string, number[]> = {};
  uyeler.zaman.forEach((z) => { const g = z.slice(0, 10); if (gun[gun.length - 1] !== g) gun.push(g); });
  for (const [ad, v] of Object.entries(uyeler.sutun)) {
    const m: number[] = gun.map(() => Number.NaN);
    uyeler.zaman.forEach((z, i) => {
      const k = gun.indexOf(z.slice(0, 10)), x = v[i];
      if (x != null && !(x <= m[k]!)) m[k] = x;
    });
    gunMax[ad] = m;
  }
  const sutunlar = Object.values(gunMax);
  return { gun, deger: gun.map((_, k) => {
    const satir = sutunlar.map((m) => (Number.isNaN(m[k]!) ? null : m[k]!));
    const d = ceyrek(satir, 0.9) - ceyrek(satir, 0.1);
    return Number.isNaN(d) ? null : d;
  }) };
}
