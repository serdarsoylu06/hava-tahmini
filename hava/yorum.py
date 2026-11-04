"""Tahmin verisinden "nelere dikkat etmeli?" uyarıları üretir.
Her uyarı ne olacağını, ne zaman olacağını, neden önemli olduğunu ve hangi grafikte
izleneceğini söyler; eşikler MGM ve WMO'nun halka yönelik uyarı eşiklerine yakın seçildi."""
from dataclasses import dataclass

import pandas as pd

GUNLER = ["Pzt", "Sal", "Çar", "Per", "Cum", "Cmt", "Paz"]
SIRA = {"tehlike": 0, "dikkat": 1, "bilgi": 2, "iyi": 3}


@dataclass
class Uyari:
    seviye: str      # tehlike | dikkat | bilgi | iyi
    ikon: str        # :material/...:
    baslik: str
    ozet: str        # ne, ne zaman, ne kadar
    neden: str       # öğretici açıklama: neden önemli, nasıl oluşur
    bak: str         # bu olayı izlemek için hangi sayfa
    bak_ne: str      # o sayfada neye bakmalı


def zaman(t):
    return f"{GUNLER[t.weekday()]} {t:%d.%m %H:%M}"


def gun(t):
    return f"{GUNLER[t.weekday()]} {t:%d.%m}"


def aralik(maske: pd.Series):
    """True olan saatleri ardışık bloklara ayırıp ilkini ve toplam blok sayısını yazar."""
    if not maske.any():
        return ""
    blok = (maske != maske.shift()).cumsum()[maske]
    ilk = maske[maske].groupby(blok).apply(lambda s: (s.index[0], s.index[-1])).iloc[0]
    n = blok.nunique()
    metin = zaman(ilk[0]) if ilk[0] == ilk[1] else f"{zaman(ilk[0])} – {ilk[1]:%H:%M}"
    return metin + (f" (ve {n - 1} dönem daha)" if n > 1 else "")


def uyarilar(df: pd.DataFrame, rakim: float | None = None, guven: pd.Series | None = None):
    """df: saatlik tahmin (veri.tahmin), rakim: m, guven: günlük ansambl yayılımı (°C)."""
    u: list[Uyari] = []
    T, Td = df.temperature_2m, df.dew_point_2m

    # --- don
    if T.min() <= 0:
        seviye = "tehlike" if T.min() <= -5 else "dikkat"
        u.append(Uyari(seviye, ":material/ac_unit:", "Don ve buzlanma",
                       f"Sıcaklık {T.min():.0f} °C'ye iniyor ({zaman(T.idxmin())}). "
                       f"0 °C altı: {aralik(T <= 0)}.",
                       "Açık ve rüzgârsız gecelerde yer, ışınımla ısısını uzaya hızla kaybeder; en düşük "
                       "sıcaklık genellikle gün doğumundan hemen önce görülür. Yollarda gizli buz, "
                       "tesisat ve tarım için risktir.",
                       "app_pages/meteogram.py",
                       "Sıcaklık çizgisi 0 °C'nin altına indiği gecelerde bulut paneline bak: "
                       "bulutsuz gece daha soğuk geçer."))

    # --- rüzgâr
    g = df.wind_gusts_10m
    if g.max() >= 50:
        seviye = "tehlike" if g.max() >= 75 else "dikkat"
        u.append(Uyari(seviye, ":material/air:", "Kuvvetli rüzgâr",
                       f"Hamleler {g.max():.0f} km/s'e ulaşıyor ({zaman(g.idxmax())}). "
                       f"50 km/s üstü: {aralik(g >= 50)}.",
                       "Hamle, birkaç saniyelik en kuvvetli esintidir ve hasarı ortalama rüzgâr değil "
                       "hamle verir. 50 km/s'te dallar kırılabilir, 75 km/s'te çatı ve ağaç hasarı "
                       "başlar. Rüzgârın kaynağı genellikle sıkışmış izobarlardır.",
                       "app_pages/haritalar.py",
                       "Basınç haritasında izobarların birbirine yaklaştığı yerler kuvvetli rüzgâr "
                       "bölgeleridir."))

    # --- yağış
    p = df.precipitation
    gunluk = p.resample("D").sum()
    if p.max() >= 7.6 or gunluk.max() >= 20:
        seviye = "tehlike" if gunluk.max() >= 50 else "dikkat"
        u.append(Uyari(seviye, ":material/water_drop:", "Kuvvetli yağış",
                       f"En yağışlı gün {gun(gunluk.idxmax())}: {gunluk.max():.0f} mm. "
                       f"Saatlik en fazla {p.max():.1f} mm ({zaman(p.idxmax())}).",
                       "1 mm yağış, metrekareye 1 litre su demektir. Saatte 7–8 mm'yi aşan yağış "
                       "'kuvvetli' sayılır; kısa sürede düşen 20 mm ve üstü yağış kentlerde su "
                       "baskını, eğimli arazide sel riski doğurur.",
                       "app_pages/ansambl.py",
                       "Ansambl sayfasında eşiği 10 mm'ye çekip kaç üyenin bu yağışı verdiğine bak; "
                       "tek bir modelin çıktısı yanıltıcı olabilir."))

    # --- donan yağmur
    donan = df.weather_code.isin([56, 57, 66, 67])
    if donan.any():
        u.append(Uyari("tehlike", ":material/severe_cold:", "Donan yağmur",
                       f"Donan yağmur/çisenti bekleniyor: {aralik(donan)}.",
                       "Üstteki sıcak katmanda eriyen kar, donma noktasının altındaki yere düşünce "
                       "anında buz tabakasına döner. Kardan çok daha tehlikelidir.",
                       "app_pages/profil.py",
                       "Atmosfer profilinde sıcaklık çizgisinin yerin hemen üstünde 0 °C'yi aşıp "
                       "yere yakın yeniden altına indiği 'sıcak burun'u ara."))

    # --- kar
    kar = df.snowfall.sum()
    if kar >= 0.5:
        seviye = "tehlike" if kar >= 10 else "dikkat"
        u.append(Uyari(seviye, ":material/weather_snowy:", "Kar yağışı",
                       f"Toplam {kar:.0f} cm kar bekleniyor. Kar yağan saatler: {aralik(df.snowfall > 0)}.",
                       "Kar birikimi yağışın yaklaşık 10 katıdır (1 mm su ≈ 1 cm kar). Yağışın kar mı "
                       "yağmur mu olacağını donma seviyesi belirler: kar, donma seviyesinin birkaç "
                       "yüz metre altına kadar erimeden iner.",
                       "app_pages/meteogram.py",
                       "En alttaki panelde mavi donma seviyesi çizgisinin kesikli rakım çizgisine "
                       "ne kadar yaklaştığına bak."))
    elif rakim is not None:
        sinirda = (df.precipitation > 0.2) & (df.freezing_level_height - rakim < 400)
        if sinirda.any():
            u.append(Uyari("bilgi", ":material/weather_mix:", "Karla karışık yağmur olasılığı",
                           f"Yağış sırasında donma seviyesi bulunduğun yere 400 m'den fazla yaklaşıyor: "
                           f"{aralik(sinirda)}.",
                           "Donma seviyesi ile yer arasındaki mesafe kısaldığında düşen kar tamamen "
                           "erimeye vakit bulamaz. Birkaç yüz metrelik fark, aynı şehrin yüksek "
                           "semtlerinde kar, alçak semtlerinde yağmur görülmesine yol açar.",
                           "app_pages/meteogram.py",
                           "En alttaki panelde donma seviyesi ile rakım çizgisinin arasını izle."))

    # --- sis
    sis = ((T - Td <= 1) & (df.wind_speed_10m < 8) & (df.visibility < 1000)) | df.weather_code.isin([45, 48])
    if sis.sum() >= 2:
        u.append(Uyari("dikkat", ":material/foggy:", "Sis",
                       f"Görüş 1 km'nin altına düşebilir: {aralik(sis)}. "
                       f"En düşük görüş {df.visibility.min() / 1000:.1f} km.",
                       "Hava soğuyup sıcaklığı çiy noktasına indiğinde nem yoğuşur. Sis en çok açık, "
                       "rüzgârsız ve nemli gecelerin sabahında oluşur; güneş yükselip yer ısındıkça "
                       "dağılır.",
                       "app_pages/meteogram.py",
                       "Sıcaklık ile çiy noktası çizgilerinin birleştiği saatlere bak."))

    # --- gök gürültülü sağanak
    firtina = df.weather_code >= 95
    kararsiz = (df.cape >= 1000) & (df.precipitation_probability >= 30)
    if firtina.any() or kararsiz.any():
        seviye = "tehlike" if df.cape.max() >= 2500 else "dikkat"
        u.append(Uyari(seviye, ":material/thunderstorm:", "Gök gürültülü sağanak",
                       f"Kararsızlık enerjisi (CAPE) {df.cape.max():.0f} J/kg'a çıkıyor "
                       f"({zaman(df.cape.idxmax())}). Riskli saatler: {aralik(firtina | kararsiz)}.",
                       "CAPE, yükselen havanın kazanabileceği enerjidir. 1000 J/kg üstü cumulonimbus "
                       "bulutlarına, 2500 üstü dolu ve ani kuvvetli rüzgâra yetecek enerjidir. Bu "
                       "olaylar küçük ölçeklidir; tam yeri ve saati önceden kestirilemez.",
                       "app_pages/profil.py",
                       "Atmosfer profilinde kırmızı gölgeli (CAPE) alanın büyüklüğüne ve yükselen "
                       "parselin önündeki mavi 'kapak'a (CIN) bak."))

    # --- basınç düşüşü
    dp = (df.pressure_msl - df.pressure_msl.shift(24)).dropna()
    if not dp.empty and dp.min() <= -6:
        seviye = "dikkat" if dp.min() <= -10 else "bilgi"
        bitis = dp.idxmin()
        u.append(Uyari(seviye, ":material/trending_down:", "Hızlı basınç düşüşü",
                       f"24 saatte {dp.min():.0f} hPa düşüş ({zaman(bitis - pd.Timedelta(hours=24))} → "
                       f"{zaman(bitis)}).",
                       "Basıncın hızla düşmesi bir alçak basınç sisteminin yaklaştığını ya da "
                       "derinleştiğini gösterir; ardından rüzgâr, bulut ve yağış gelir. 24 saatte "
                       "~20 hPa'dan fazla düşüş 'patlayıcı' (bomba) siklon olarak adlandırılır.",
                       "app_pages/haritalar.py",
                       "Basınç haritasında zamanı ilerletip 'A' merkezinin sana doğru gelişini izle."))

    # --- sıcak
    h = df.apparent_temperature
    if h.max() >= 32:
        seviye = "tehlike" if h.max() >= 38 else "dikkat"
        u.append(Uyari(seviye, ":material/thermostat:", "Sıcak çarpması riski",
                       f"Hissedilen sıcaklık {h.max():.0f} °C ({zaman(h.idxmax())}).",
                       "Hissedilen sıcaklık nemi ve rüzgârı hesaba katar. Nem yüksekken ter "
                       "buharlaşamaz ve vücut serinleyemez; bu yüzden 32 °C nemli hava, 36 °C kuru "
                       "havadan daha yorucu olabilir.",
                       "app_pages/meteogram.py",
                       "Hissedilen sıcaklık çizgisinin gerçek sıcaklıktan ne kadar ayrıldığına bak."))

    # --- UV
    uv = df.uv_index
    if uv.max() >= 6:
        u.append(Uyari("dikkat" if uv.max() >= 8 else "bilgi", ":material/wb_sunny:", "Yüksek UV",
                       f"UV indeksi {uv.max():.0f}'a çıkıyor ({gun(uv.idxmax())} öğle saatleri).",
                       "UV 6–7 yüksek, 8–10 çok yüksektir; korumasız ciltte 15–25 dakikada yanık "
                       "oluşabilir. Bulutlu havada bile UV'nin büyük kısmı yere ulaşır.",
                       "app_pages/genel.py", "Günlük tablodaki UV sütununa bak."))

    # --- tahmin güveni
    if guven is not None and (guven >= 5).any():
        ilk = guven[guven >= 5].index[0]
        u.append(Uyari("bilgi", ":material/blur_on:", "Belirsizlik artıyor",
                       f"{gun(ilk)} itibarıyla ansambl üyeleri en yüksek sıcaklıkta "
                       f"{guven[ilk]:.0f} °C'den fazla ayrışıyor.",
                       "Atmosfer kaotiktir: başlangıçtaki küçük ölçüm hataları zamanla büyür. Model "
                       "çıktıları ayrıştığında tek bir sayıya değil, olası aralığa güvenmek gerekir.",
                       "app_pages/ansambl.py",
                       "Spagetti çizgilerinin dağılmaya başladığı tarihe ve mavi bandın genişliğine bak."))

    if not any(x.seviye in ("tehlike", "dikkat") for x in u):
        u.append(Uyari("iyi", ":material/check_circle:", "Önemli bir hava olayı beklenmiyor",
                       "Seçilen dönemde uyarı eşiklerini aşan bir değer yok.",
                       "Yine de birkaç günden uzun tahminlerde ansambl sayfasına göz atmak, "
                       "tahminin ne kadar güvenilir olduğunu gösterir.",
                       "app_pages/ansambl.py", "Bandın genişliğine bak."))
    return sorted(u, key=lambda x: SIRA[x.seviye])
