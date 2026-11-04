import pandas as pd
import streamlit as st

from hava import grafik
from hava.arayuz import okuma_rehberi
from hava.olcum import en_yakin_olcum
from hava.veri import getir, konum, tablo

ONCEKI = "https://previous-runs-api.open-meteo.com/v1/forecast"
# değişken: (API adı, birim, "isabetli" sayılacak en büyük hata)
DEGISKENLER = {"Sıcaklık": ("temperature_2m", "°C", 2.0), "Rüzgâr": ("wind_speed_10m", "km/s", 8.0),
               "Yağış": ("precipitation", "mm", None), "Basınç": ("pressure_msl", "hPa", 2.0)}
GUNLER = range(1, 8)

k = konum()
st.header("Tahmin ne kadar tuttu?", anchor=False)
st.caption("Son bir haftada gerçekleşen değerleri, aynı saatler için 1–7 gün önce yapılmış tahminlerle karşılaştırır. "
           "Tahminin ne kadar ileriye güvenilebileceğini en iyi bu öğretir.")

c1, c2 = st.columns([1.3, 1], vertical_alignment="bottom")
ad = c1.segmented_control("Değişken", list(DEGISKENLER), default="Sıcaklık", key="dog_deg") or "Sıcaklık"
kaynak = c2.segmented_control("Neyle karşılaştırılsın?", ["İstasyon ölçümü", "Model analizi"],
                              default="İstasyon ölçümü", key="dog_kaynak",
                              help="İstasyon ölçümü: en yakın havalimanı meteoroloji istasyonunun gerçek ölçümleri "
                                   "(METAR). Model analizi: modelin gözlemlerle düzeltilmiş en iyi tahmini.") \
         or "İstasyon ölçümü"
var, birim, tolerans = DEGISKENLER[ad]

istasyon = olc = None
if kaynak == "İstasyon ölçümü":
    if var == "precipitation":
        st.info("Havalimanı raporları (METAR) yağış miktarı içermez; yağış için model analiziyle karşılaştırılıyor.",
                icon=":material/info:")
    else:
        istasyon, olc = en_yakin_olcum(k["lat"], k["lon"], k["tz"])
        if istasyon is None or olc[var].dropna().empty:
            st.warning("120 km içinde ölçümüne ulaşılabilen bir havalimanı istasyonu yok; model analiziyle "
                       "karşılaştırılıyor.", icon=":material/location_off:")
            istasyon = None

# tahminler istasyon varsa istasyonun konumu için istenir (karşılaştırılan nokta aynı olsun)
nokta = istasyon or k
js = getir(ONCEKI, {"latitude": nokta["lat"], "longitude": nokta["lon"], "past_days": 7, "forecast_days": 1,
                    "timezone": k["tz"],
                    "hourly": ",".join([var] + [f"{var}_previous_day{g}" for g in GUNLER])})
df = tablo(js["hourly"])
simdi = pd.Timestamp.now(tz=None if k["tz"] == "auto" else k["tz"]).tz_localize(None).floor("h")
df = df[df.index < simdi]
gercek_ad = "Gerçekleşen (model analizi)"
if istasyon:
    df["analiz"] = df[var]
    df[var] = olc[var].reindex(df.index)
    kod = istasyon["icao"].split(":")[0]               # örnek veri modunda kimlik koordinat da taşır
    gercek_ad = f"Ölçüm: {kod}"
    st.success(f"**{istasyon['ad']}** ({kod}) istasyonunun ölçümleri kullanılıyor: konumuna "
               f"{istasyon['km']:.0f} km, rakımı {istasyon['rakim'] or '?'} m. Tahminler de bu istasyonun koordinatı için "
               "alındı.", icon=":material/sensors:")
df = df.dropna(subset=[var])

if var == "precipitation":
    # saatlik yağışı karşılaştırmak yanıltıcı (zamanlama kayması "çifte hata" sayılır): günlük toplamlara bakılır
    df = df.resample("D").sum(min_count=1).iloc[1:]

# ---------------------------------------------------------------- hata özeti
satir = []
for g in GUNLER:
    hata = (df[f"{var}_previous_day{g}"] - df[var]).dropna()
    if hata.empty:
        continue
    esik = tolerans if tolerans is not None else 2.0 + 0.25 * df[var].abs().mean()
    satir.append({"gun": g, "mae": hata.abs().mean(), "sapma": hata.mean(), "isabet": (hata.abs() <= esik).mean() * 100})
ozet = pd.DataFrame(satir).set_index("gun")

m = st.columns(4 if istasyon else 3)
m[0].metric("1 gün önceki tahminin hatası", f"± {ozet.mae.iloc[0]:.1f} {birim}", border=True,
            help="Ortalama mutlak hata: tahmin ile gerçekleşen arasındaki farkın ortalama büyüklüğü.")
m[1].metric("7 gün önceki tahminin hatası", f"± {ozet.mae.iloc[-1]:.1f} {birim}",
            f"{ozet.mae.iloc[-1] / max(ozet.mae.iloc[0], 0.01):.1f} kat", delta_color="inverse", border=True)
s1 = ozet.sapma.iloc[0]
m[2].metric("Sistematik sapma (1 gün)", f"{s1:+.1f} {birim}", border=True,
            help="Hataların ortalaması. Artı: model gerçekleşenden yüksek tahmin etmiş; eksi: düşük.")
if istasyon:
    temsil = (df.analiz - df[var]).dropna()
    m[3].metric("Model analizi ile ölçüm farkı", f"± {temsil.abs().mean():.1f} {birim}", f"sapma {temsil.mean():+.1f}",
                delta_color="off", delta_arrow="off", border=True,
                help="Modelin \"şimdi\" için en iyi tahmini bile istasyondan farklıdır: model bir ızgara karesinin "
                     "ortalamasını, termometre tek bir noktayı ölçer. Buna temsil hatası denir; tahmin hatasının "
                     "inebileceği bir alt sınır gibidir.")

sol, sag = st.columns([1.6, 1], gap="large")
with sol:
    st.markdown("**Gerçekleşen ve önceden yapılan tahminler**")
    secim = st.pills("Gösterilecek tahminler", [f"{g} gün önce" for g in GUNLER], selection_mode="multi",
                     default=["1 gün önce", "3 gün önce", "6 gün önce"], key="dog_gun",
                     label_visibility="collapsed")
    tahminler = {f"{var}_previous_day{int(s.split()[0])}": f"{s} yapılan" for s in secim}
    if istasyon:
        tahminler = {"analiz": "Model analizi"} | tahminler
    st.altair_chart(grafik.dogrulama_cizgisi(df, var, tahminler, f"{ad} ({birim})", bar=var == "precipitation",
                                             gercek_ad=gercek_ad),
                    alt="Gerçekleşen ve tahmin edilen değerler")
with sag:
    st.markdown("**Tahmin ne kadar önceden yapılırsa hata o kadar büyür**")
    st.altair_chart(grafik.hata_cubugu(ozet, birim), alt="Gün önceye göre tahmin hatası")
    if ozet.mae.iloc[-1] > ozet.mae.iloc[0] * 1.3:
        st.caption(f"Bu hafta {k['ad']} için hata, 1 günlük tahminden 7 günlüğe **{ozet.mae.iloc[-1] / ozet.mae.iloc[0]:.1f} "
                   "kat** büyüdü: atmosferin kaotik doğasının somut bir örneği.")
    else:
        st.caption("Bu hafta hava oldukça kararlı geçmiş: uzun vadeli tahminler bile iyi tutmuş. Her hafta böyle "
                   "değildir; sistem geçişlerinde fark belirgin açılır.")

# ---------------------------------------------------------------- en büyük ıska
iska = (df["{}_previous_day1".format(var)] - df[var]).abs()
if not iska.dropna().empty and iska.max() > 0:
    t = iska.idxmax()
    st.info(f"Son bir haftanın en büyük ıskası: **{t:%d.%m %H:%M}** için bir gün önce "
            f"{df.loc[t, f'{var}_previous_day1']:.1f} {birim} tahmin edilmiş, {df.loc[t, var]:.1f} {birim} "
            "gerçekleşmiş. Meteogram ve haritalarda o günlerde bir cephe ya da sağanak geçip geçmediğine bakmak, "
            "hatanın nedenini anlamanın en iyi yoludur.", icon=":material/target:")

okuma_rehberi([
    ("Gerçekleşen değer nereden geliyor?", "**İstasyon ölçümü**, en yakın havalimanının meteoroloji istasyonunun "
     "yarım saatte bir yayımladığı METAR raporlarıdır (NOAA Aviation Weather Center üzerinden): gerçek termometre, "
     "anemometre ve barometre ölçümü. Sıcaklık tam sayı derece raporlanır, yani ±0,5 °C yuvarlama içerir. **Model "
     "analizi** ise modelin o saat için gözlemlerle düzeltilmiş en iyi tahminidir; bir ızgara karesinin ortalamasıdır."),
    ("İstasyon ile model neden hiç tam tutmaz?", "Model 9–25 km'lik bir karenin ortalamasını hesaplar; istasyon tek bir "
     "noktayı ölçer. Havalimanları çoğunlukla düz, açık yerlerdedir; kıyıda, vadide ya da şehrin içinde fark büyür. "
     "\"Model analizi ile ölçüm farkı\" bu temsil hatasıdır: en iyi tahmin bile bunun altına inemez."),
    ("Ortalama mutlak hata", "Hataların büyüklüğünün ortalamasıdır (işaretine bakmadan). Sıcaklıkta 1 günlük tahmin için "
     "1–2 °C iyi bir değerdir."),
    ("Sistematik sapma", "Hataların işaretli ortalaması. Sıfırdan uzaksa model bu konumda sürekli aynı yönde yanılıyordur; "
     "örneğin dağlık bir yerde modelin arazisi gerçekten alçak olduğu için sıcaklığı hep yüksek tahmin etmesi."),
    ("Yağış neden günlük?", "Bir sağanağı doğru tahmin edip bir saat geç gösteren model, saatlik karşılaştırmada iki kez "
     "hata yapmış sayılır. Bu yüzden yağış günlük toplamlarla karşılaştırılır."),
    ("Neden her hafta farklı?", "Kararlı yüksek basınç günlerinde 7 günlük tahmin bile tutar; hızlı geçen cepheler ve "
     "sağanaklarda 2 günlük tahmin bile ıskalayabilir. Bu yüzden Ansambl sayfasındaki belirsizlik bandı önemlidir."),
], baslik="Bu karşılaştırma nasıl okunur?")
