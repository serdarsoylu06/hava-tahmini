import html
from functools import partial

import pandas as pd
import streamlit as st

from hava import grafik, tasarim
from hava.arayuz import gun_sayisi, uyari_kartlari
from hava.veri import FC, GUN_EN_COK, SAATLIK, getir, konum, simdiden, tablo, tahmin, yon_adi
from hava.yorum import GUNLER, uyarilar, zaman

MODELLER = {"En iyi eşleşme": None, "ECMWF": "ecmwf_ifs", "ICON": "icon_seamless", "GFS": "gfs_seamless"}

k = konum()
simdi, saatlik, _ = tahmin(k)
bas = pd.Timestamp(simdi["time"]).floor("h")
df = saatlik[(saatlik.index >= bas) & (saatlik.index < bas + pd.Timedelta(days=gun_sayisi()))]

tasarim.baslik("Tahmin", f"Meteogram · {k['ad']}",
               "Meteorologların bir noktanın tahminine ilk baktıkları grafik: tüm değişkenler aynı zaman ekseninde. "
               "Herhangi bir panelde fareyle gezdiğinde o saatin tüm değerleri görünür. Gölgeli şeritler geceyi "
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

# ---------------------------------------------------------------- model, saat seçimi ve o saatin değerleri
with st.container(horizontal=True, vertical_alignment="bottom", gap="medium"):
    model_ad = st.segmented_control("Tahmin modeli", list(MODELLER), default="En iyi eşleşme", key="mg_model",
                                    help="Farklı modeller aynı sonucu veriyorsa tahmine daha çok güvenebilirsin. "
                                         "\"En iyi eşleşme\" konuma göre en uygun modelleri birleştirir.")
    aralik = st.slider("Zaman aralığı (tüm panelleri birlikte yakınlaştırır)", df.index[0].to_pydatetime(),
                       df.index[-1].to_pydatetime(), (df.index[0].to_pydatetime(), df.index[-1].to_pydatetime()),
                       step=pd.Timedelta(hours=3), format="DD.MM HH:mm", key=f"mg_aralik_{k['ad']}_{gun_sayisi()}")
kod = MODELLER.get(model_ad or "En iyi eşleşme")
if kod:
    mdf = simdiden(tablo(getir(FC, {"latitude": k["lat"], "longitude": k["lon"], "hourly": SAATLIK, "models": kod,
                                    "forecast_days": GUN_EN_COK, "timezone": k["tz"]})["hourly"]), k)
    mdf = mdf.rename(columns=lambda c: c.removesuffix(f"_{kod}")).reindex(df.index)
    eksik = [c for c in df.columns if c not in mdf or mdf[c].isna().all()]
    mdf[eksik] = df[eksik]                      # modelin vermediği değişkenler (ör. yağış olasılığı) ortak tahminden
    df = mdf
gorunen = df.loc[aralik[0]:aralik[1]]

SAAT_ANAHTAR = f"mg_saat_{k['ad']}_{aralik[0]:%m%d%H}_{aralik[1]:%m%d%H}"


def panelden_sec(anahtar):
    """Ortak imleç: hangi panele tıklanırsa o saat seçilir; kesikli çizgi tüm panellerde ve saat kartında aynı yere gelir."""
    s = st.session_state[anahtar].selection.get("saat") or []
    if s:
        st.session_state[SAAT_ANAHTAR] = gorunen.index[min(int(s[0]["i"]), len(gorunen) - 1)]


saat = st.select_slider("Saat seç (ya da aşağıdaki herhangi bir panele tıkla)", options=list(gorunen.index),
                        key=SAAT_ANAHTAR, format_func=lambda t: f"{GUNLER[t.weekday()]} {t:%d.%m %H:%M}")
r = gorunen.loc[saat]
yorum = "Sakin bir saat: yağış yok, rüzgâr ortalamanın üstüne çıkmıyor."
if r.temperature_2m - r.dew_point_2m <= 2:
    yorum = "Çiy noktası sıcaklığa çok yakın: sis, çisenti ya da alçak bulut beklenir."
if r.precipitation >= 0.5:
    yorum = (f"Yağış sürüyor: saatte {r.precipitation:.1f} mm. " +
             ("Bu miktar sağanaktır." if r.precipitation >= 4 else "Hafif–orta yağış."))
if r.wind_gusts_10m >= 40:
    yorum = f"Hamleler sert: {r.wind_gusts_10m:.0f} km/s, {yon_adi(r.wind_direction_10m)} yönünden."
with st.container(key="yuzey_mg_saat"):
    st.markdown(f"**{GUNLER[saat.weekday()]} {saat:%d.%m %H:%M}** · {model_ad or 'En iyi eşleşme'}  \n:gray[{yorum}]")
    m = st.container(key="kartlar_meteogram_saat").columns(6)
    m[0].metric("Sıcaklık", f"{r.temperature_2m:.1f}°")
    m[1].metric("Çiy noktası", f"{r.dew_point_2m:.1f}°")
    m[2].metric("Yağış", f"{r.precipitation:.1f} mm")
    m[3].metric("Rüzgâr", f"{r.wind_speed_10m:.0f} km/s")
    m[4].metric("Hamle", f"{r.wind_gusts_10m:.0f} km/s")
    m[5].metric("Basınç", f"{r.pressure_msl:.0f} hPa")

# Okuma rehberi yan sütunda yer kaplamaz: grafik kartının başlığındaki açılır pencerede, adımlar tek satır;
# ayrıntı istenince açılır. Grafikler tam genişliğe yayılır.
OKUMA = [
    ("Önce basınca bak", "Düşen basınç yaklaşan sistemi, yükselen basınç durulan havayı gösterir. Dip, alçak basıncın "
     "geçtiği andır; yağış ve rüzgâr çoğu zaman bu dibin çevresinde toplanır."),
    ("Sıcaklık ile çiy noktasını karşılaştır", "İki çizgi 2°'den fazla yaklaşırsa sis ya da alçak bulut beklenir."),
    ("Yağışta miktara bak", "Saatte 0,5 mm altı çisenti, 4 mm üstü sağanaktır. Yüksek olasılık + az miktar = hafif ama "
     "kesin yağış."),
    ("Hamleyi ortalamayla kıyasla", "Hamle ortalamanın iki katına yaklaşıyorsa hava türbülanslıdır; okların yön "
     "değiştirdiği an çoğu zaman cephenin geçtiği andır."),
    ("Kar mı yağmur mu?", "Donma seviyesi çizgisi rakım çizgisine 300–400 m yaklaşmışsa yağış kara dönebilir."),
]
with st.container(border=True):
    with st.container(key="mg_baslik", horizontal=True, vertical_alignment="center"):
        st.caption("Kesikli dikey çizgi seçtiğin saattir; bir panele tıklayınca tüm panellerde o saate taşınır.",
                   width="stretch")
        with st.popover("Nasıl okunur?", icon=":material/menu_book:", key="mg_okuma"):
            adimlar = "".join(f'<details class="okuma"><summary><b>{i}</b>{html.escape(b)}</summary>'
                              f'<p>{html.escape(m)}</p></details>' for i, (b, m) in enumerate(OKUMA, 1))
            st.html(f'<div class="okuma-liste">{adimlar}</div>')
            st.caption("Modelleri karşılaştırmak için **Modeller** sayfasına bak.")
    for n, (panel, boy) in enumerate(grafik.meteogram(gorunen, k["rakim"], imlec=saat)):
        st.altair_chart(panel, height=boy, alt="Meteogram paneli", key=f"mg_panel_{n}", selection_mode="saat",
                        on_select=partial(panelden_sec, f"mg_panel_{n}"))
