import pandas as pd
import streamlit as st

from hava import grafik
from hava.arayuz import okuma_rehberi
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

ad = st.segmented_control("Değişken", list(DEGISKENLER), default="Sıcaklık", key="dog_deg") or "Sıcaklık"
var, birim, tolerans = DEGISKENLER[ad]
js = getir(ONCEKI, {"latitude": k["lat"], "longitude": k["lon"], "past_days": 7, "forecast_days": 1,
                    "timezone": k["tz"],
                    "hourly": ",".join([var] + [f"{var}_previous_day{g}" for g in GUNLER])})
df = tablo(js["hourly"])
simdi = pd.Timestamp.now(tz=None if k["tz"] == "auto" else k["tz"]).tz_localize(None).floor("h")
df = df[df.index < simdi].dropna(subset=[var])

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

m = st.columns(3)
m[0].metric("1 gün önceki tahminin hatası", f"± {ozet.mae.iloc[0]:.1f} {birim}", border=True,
            help="Ortalama mutlak hata: tahmin ile gerçekleşen arasındaki farkın ortalama büyüklüğü.")
m[1].metric("7 gün önceki tahminin hatası", f"± {ozet.mae.iloc[-1]:.1f} {birim}",
            f"{ozet.mae.iloc[-1] / max(ozet.mae.iloc[0], 0.01):.1f} kat", delta_color="inverse", border=True)
s1 = ozet.sapma.iloc[0]
m[2].metric("Sistematik sapma (1 gün)", f"{s1:+.1f} {birim}", border=True,
            help="Hataların ortalaması. Artı: model gerçekleşenden yüksek tahmin etmiş; eksi: düşük.")

sol, sag = st.columns([1.6, 1], gap="large")
with sol:
    st.markdown("**Gerçekleşen ve önceden yapılan tahminler**")
    secim = st.pills("Gösterilecek tahminler", [f"{g} gün önce" for g in GUNLER], selection_mode="multi",
                     default=["1 gün önce", "3 gün önce", "6 gün önce"], key="dog_gun",
                     label_visibility="collapsed")
    tahminler = {f"{var}_previous_day{int(s.split()[0])}": f"{s} yapılan" for s in secim}
    st.altair_chart(grafik.dogrulama_cizgisi(df, var, tahminler, f"{ad} ({birim})", bar=var == "precipitation"),
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
    ("Gerçekleşen değer nereden geliyor?", "Burada \"gerçekleşen\", modelin o saat için yaptığı en güncel analizdir: "
     "gözlemlerle düzeltilmiş en iyi tahmin. İstasyon ölçümü değildir; vadiler, kıyılar ve şehir içi gibi yerel "
     "etkiler nedeniyle termometrenin gösterdiği değer birkaç derece farklı olabilir."),
    ("Ortalama mutlak hata", "Hataların büyüklüğünün ortalamasıdır (işaretine bakmadan). Sıcaklıkta 1 günlük tahmin için "
     "1–2 °C iyi bir değerdir."),
    ("Sistematik sapma", "Hataların işaretli ortalaması. Sıfırdan uzaksa model bu konumda sürekli aynı yönde yanılıyordur; "
     "örneğin dağlık bir yerde modelin arazisi gerçekten alçak olduğu için sıcaklığı hep yüksek tahmin etmesi."),
    ("Yağış neden günlük?", "Bir sağanağı doğru tahmin edip bir saat geç gösteren model, saatlik karşılaştırmada iki kez "
     "hata yapmış sayılır. Bu yüzden yağış günlük toplamlarla karşılaştırılır."),
    ("Neden her hafta farklı?", "Kararlı yüksek basınç günlerinde 7 günlük tahmin bile tutar; hızlı geçen cepheler ve "
     "sağanaklarda 2 günlük tahmin bile ıskalayabilir. Bu yüzden Ansambl sayfasındaki belirsizlik bandı önemlidir."),
], baslik="Bu karşılaştırma nasıl okunur?")
