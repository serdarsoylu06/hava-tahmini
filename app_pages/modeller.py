import pandas as pd
import streamlit as st

from hava import grafik
from hava.arayuz import gun_sayisi, okuma_rehberi
from hava.veri import FC, getir, konum, simdiden, tablo
from hava.yorum import zaman

MODELLER = {"ECMWF IFS (Avrupa, 9 km)": "ecmwf_ifs", "ECMWF AIFS (yapay zekâ)": "ecmwf_aifs025_single",
            "GFS (ABD)": "gfs_seamless", "ICON (Almanya)": "icon_seamless",
            "ARPEGE (Fransa)": "meteofrance_seamless", "UKMO (İngiltere)": "ukmo_seamless"}
# değişken: (API adı, birim, "uyumlu" ve "belirsiz" eşikleri)
DEGISKENLER = {"Sıcaklık": ("temperature_2m", "°C", (2, 4)),
               "Birikimli yağış": ("precipitation", "mm", (5, 15)),
               "Rüzgâr": ("wind_speed_10m", "km/s", (8, 15)),
               "Basınç": ("pressure_msl", "hPa", (3, 6)),
               "Bulutluluk": ("cloud_cover", "%", (30, 60))}

k = konum()
st.header("Modeller ne diyor?", anchor=False)
st.caption("Dünyanın önde gelen hava tahmin merkezlerinin modelleri aynı yer için yan yana. "
           "Lejanttaki bir modele tıklayarak onu vurgula; fareyle gezerek o saatteki tüm modelleri oku.")

ad = st.segmented_control("Değişken", list(DEGISKENLER), default="Sıcaklık", key="model_deg")
var, birim, esik = DEGISKENLER[ad or "Sıcaklık"]
df = tablo(getir(FC, {"latitude": k["lat"], "longitude": k["lon"], "hourly": var,
                      "models": ",".join(MODELLER.values()), "forecast_days": gun_sayisi(),
                      "timezone": k["tz"]})["hourly"])
df = simdiden(df, k)

seriler = {}
for etiket, kod in MODELLER.items():
    col = f"{var}_{kod}"
    if col not in df or df[col].isna().all():
        continue
    if var == "precipitation":
        # model tahmin süresi bitince çizgi düz devam etmesin
        seriler[etiket] = df[col].fillna(0).cumsum().where(df.index <= df[col].last_valid_index())
    else:
        seriler[etiket] = df[col].interpolate(limit=6)
S = pd.DataFrame(seriler)

st.altair_chart(grafik.model_karsilastirma(S, f"{ad} ({birim})"), alt=f"Modellerin {ad.lower()} tahmini")

# modeller arası fark
fark = (S.max(axis=1) - S.min(axis=1)).where(S.notna().sum(axis=1) >= 3).dropna()
st.subheader("Modeller ne kadar uyumlu?", anchor=False)
sol, sag = st.columns([2, 1], gap="large")
with sol:
    st.altair_chart(grafik.yayilim(fark, birim, esik), alt="Modeller arası farkın zamanla değişimi")
with sag:
    asim = fark[fark > esik[0]]
    if asim.empty:
        st.success(f"Tüm dönem boyunca modeller arasındaki fark {esik[0]} {birim}'in altında. "
                   "Bu tahmine güvenebilirsin.", title="Modeller uyumlu", icon=":material/verified:")
    else:
        saat = (asim.index[0] - fark.index[0]).total_seconds() / 3600
        st.warning(f"İlk **{saat:.0f} saat** modeller uyumlu. {zaman(asim.index[0])} itibarıyla farklar "
                   f"{esik[0]} {birim}'i aşıyor; en büyük fark {fark.max():.1f} {birim} "
                   f"({zaman(fark.idxmax())}).", title="Uyum bozuluyor", icon=":material/call_split:")
    st.caption("Fark tek başına \"hangisi doğru\"yu söylemez; tahminin **ne kadar emin** olduğunu söyler. "
               "Modeller ayrıştığında olası senaryoları görmek için Ansambl sayfasına geç.")
    st.page_link("app_pages/ansambl.py", label="Ansambl sayfasına git", icon=":material/arrow_forward:")

with st.expander("Model özet tablosu", icon=":material/table_view:"):
    ozet = pd.DataFrame({"En düşük": S.min(), "En yüksek": S.max(),
                         "Son değer" if var == "precipitation" else "Ortalama":
                             S.ffill().iloc[-1] if var == "precipitation" else S.mean(),
                         "Tahmin süresi (gün)": S.apply(lambda s: (s.last_valid_index() - S.index[0]).days + 1)})
    st.dataframe(ozet.round(1), alt="Modellerin özet değerleri")

okuma_rehberi([
    ("Neden farklılar?", "Her merkez atmosferi farklı çözünürlükte bir ızgaraya böler, bulut ve yağış gibi küçük "
     "ölçekli süreçleri farklı formüllerle temsil eder ve başlangıç durumunu farklı yöntemlerle kurar."),
    ("Gri bant", "Modellerin en düşüğü ile en yükseği arasındaki alandır. İlk günlerde dardır; zamanla küçük "
     "farklar büyür ve bant genişler. Atmosferin bu kaotik davranışı tahmini ~2 hafta ile sınırlar."),
    ("Çoğunluğa değil, fiziğe bak", "Bir model ötekilerden çok ayrıysa ya o model bir şeyi yakalamıştır ya da "
     "yanılıyordur. Ardışık model çalıştırmalarında aynı sonucu tekrar edip etmediğine bakmak gerekir."),
    ("AIFS farklıdır", "Fizik denklemlerini çözmez; ECMWF'nin onlarca yıllık geçmiş verisinden öğrenen bir yapay "
     "zekâ modelidir. Fizik tabanlı IFS ile ne kadar örtüştüğünü izle."),
    ("Biten çizgiler", "Modellerin tahmin süreleri farklıdır; çizgisi erken biten model o saatten sonrasını "
     "tahmin etmiyordur."),
], baslik="Model karşılaştırması nasıl okunur?")
