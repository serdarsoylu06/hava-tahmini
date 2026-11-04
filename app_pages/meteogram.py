import pandas as pd
import streamlit as st

from hava import grafik, tasarim
from hava.arayuz import gun_sayisi, okuma_rehberi, uyari_kartlari
from hava.veri import konum, tahmin
from hava.yorum import uyarilar, zaman

k = konum()
simdi, saatlik, _ = tahmin(k)
bas = pd.Timestamp(simdi["time"]).floor("h")
df = saatlik[(saatlik.index >= bas) & (saatlik.index < bas + pd.Timedelta(days=gun_sayisi()))]

tasarim.baslik("Tahmin", f"Meteogram · {k['ad']}",
               "Meteorologların bir noktanın tahminine ilk baktıkları grafik: tüm değişkenler aynı zaman ekseninde. "
               "Herhangi bir panelde fareyle gezdiğinde o saatin tüm değerleri görünür. Mavi gölgeli şeritler geceyi "
               "gösterir.", "tahmin")

dp = df.pressure_msl.iloc[-1] - df.pressure_msl.iloc[0]
m = st.container(key="kartlar_meteogram_1").columns(5)
m[0].metric("En yüksek / en düşük", f"{df.temperature_2m.max():.0f}° / {df.temperature_2m.min():.0f}°",
            border=True, chart_data=df.temperature_2m.iloc[::3].round(1).tolist(), chart_type="line",
            help=f"En düşük: {zaman(df.temperature_2m.idxmin())}, en yüksek: {zaman(df.temperature_2m.idxmax())}")
m[1].metric("Toplam yağış", f"{df.precipitation.sum():.1f} mm", border=True,
            chart_data=df.precipitation.resample("6h").sum().round(1).tolist(), chart_type="bar",
            help="1 mm = metrekareye 1 litre su. Grafik 6 saatlik toplamları gösterir.")
m[2].metric("Toplam kar", f"{df.snowfall.sum():.1f} cm", border=True,
            chart_data=df.snowfall.resample("6h").sum().round(1).tolist(), chart_type="bar")
m[3].metric("En kuvvetli hamle", f"{df.wind_gusts_10m.max():.0f} km/s", border=True,
            chart_data=df.wind_gusts_10m.iloc[::3].round().tolist(), chart_type="area",
            help=f"{zaman(df.wind_gusts_10m.idxmax())}")
m[4].metric("Basınç değişimi", f"{dp:+.0f} hPa", border=True, delta_color="off",
            chart_data=df.pressure_msl.iloc[::3].round(1).tolist(), chart_type="line",
            help="Dönem başından sonuna. Grafikteki dip noktası alçak basınç sisteminin geçtiği zamandır.")

uyari_kartlari(uyarilar(df, k["rakim"]), sayfa="app_pages/meteogram.py", sutun=3)

aralik = st.slider("Zaman aralığı (tüm panelleri birlikte yakınlaştırır)", df.index[0].to_pydatetime(),
                   df.index[-1].to_pydatetime(), (df.index[0].to_pydatetime(), df.index[-1].to_pydatetime()),
                   step=pd.Timedelta(hours=3), format="DD.MM HH:mm", key=f"mg_aralik_{k['ad']}_{gun_sayisi()}")
gorunen = df.loc[aralik[0]:aralik[1]]
with st.container(border=True):
    for panel, boy in grafik.meteogram(gorunen, k["rakim"]):
        st.altair_chart(panel, height=boy, alt="Meteogram paneli")

okuma_rehberi([
    ("Önce büyük resme bak", "Basınç panelinde belirgin bir dip var mı? Dip, bir alçak basınç sisteminin geçişidir; "
     "yağış, bulut ve rüzgâr genellikle bu dibin çevresinde toplanır."),
    ("Sıcaklık–çiy noktası farkı", "Kırmızı gölgeli alan ne kadar darsa hava o kadar nemlidir. İki çizgi "
     "birleştiğinde hava doymuştur: sis, çisenti ya da alçak bulut beklenir."),
    ("Gündüz–gece döngüsü", "Açık gecelerde (bulut paneli boş) sıcaklık çok düşer; kapalı gecelerde bulut bir "
     "yorgan gibi ısıyı tutar. Don ve sis riski açık, rüzgârsız gecelerde en yüksektir."),
    ("Yağış miktarı ve olasılığı", "Mor çizgi ansambl olasılığıdır. Yüksek olasılık + az miktar = hafif ama "
     "kesin yağış; düşük olasılık + yüksek miktar = belirsiz, sağanak tipi yağış."),
    ("Rüzgâr: ortalama ve hamle", "Kesikli hamle çizgisi ortalamadan çok uzaklaşıyorsa hava türbülanslıdır; "
     "sağanak ya da cephe geçişi olabilir. Okların yön değiştirdiği an çoğu zaman cephenin geçtiği andır."),
    ("Kar mı yağmur mu?", "Yağış sırasında mavi donma seviyesi çizgisi kesikli rakım çizgisine 300–400 m kadar "
     "yaklaşmışsa yağış kara dönebilir."),
], baslik="Meteogram adım adım nasıl okunur?")
