import metpy.calc as mpcalc
import numpy as np
import streamlit as st
from metpy.units import units

from hava import grafik, tasarim
from hava.arayuz import gun_sayisi, okuma_rehberi
from hava.skewt import profil, skewt_fig
from hava.veri import FC, SEVIYELER, getir, konum, simdiden, tablo
from hava.yorum import zaman

k = konum()
tasarim.baslik("Atmosfer", f"Atmosfer profili · {k['ad']}",
               "Bulunduğun noktanın üzerindeki atmosferin yerden ~12 km'ye kadar dikey kesiti. "
               "Gök gürültülü sağanak, kar–yağmur sınırı ve bulut tabanı bu grafikten okunur.", "atmosfer")

deg = ["surface_pressure", "temperature_2m", "dew_point_2m", "wind_speed_10m", "wind_direction_10m", "cape",
       "precipitation_probability"] + [f"{x}_{p}hPa" for p in SEVIYELER
                                       for x in ("temperature", "relative_humidity", "wind_speed", "wind_direction")]
df = tablo(getir(FC, {"latitude": k["lat"], "longitude": k["lon"], "hourly": ",".join(deg),
                      "forecast_days": gun_sayisi(), "timezone": k["tz"]})["hourly"])
df = simdiden(df, k)
secenek = list(range(0, len(df), 3))

if "profil_i" not in st.session_state or st.session_state.profil_i not in secenek:
    # açılışta en kararsız saati göster (anlamlı bir kararsızlık yoksa ilk saati)
    tepe = int(np.argmax(df.cape.values[::3])) * 3
    st.session_state.profil_i = tepe if df.cape.iloc[tepe] >= 100 else 0


def grafikten_sec():
    s = st.session_state.cape_sec.selection.get("saat") or []
    if s:
        i = int(s[0]["i"]) // 3 * 3
        st.session_state.profil_i = i


st.markdown("**Kararsızlık zaman çizelgesi** · bir noktaya tıklayarak o saatin profilini aç")
kd = df.assign(i=range(len(df)))
st.altair_chart(grafik.cape_serisi(kd, df.index[st.session_state.profil_i]), key="cape_sec",
                on_select=grafikten_sec, selection_mode="saat", alt="CAPE zaman serisi")
i = st.select_slider("Zaman", options=secenek, key="profil_i", format_func=lambda j: zaman(df.index[j]))

p, T, Td, u, v = profil(df.iloc[i])
fig, s = skewt_fig(p, T, Td, u, v, f"{k['ad']} — {zaman(df.index[i])}", koyu=st.context.theme.type == "dark")

sol, sag = st.columns([1.6, 1], gap="large")
sol.pyplot(fig, alt="Skew-T log-P diyagramı")

with sag:
    cape, cin = s["cape"], s["cin"]
    seviye, renk = (("Kararlı", "green") if cape < 100 else ("Zayıf kararsız", "orange") if cape < 1000 else
                    ("Orta kararsız", "orange") if cape < 2500 else ("Güçlü kararsız", "red"))
    st.markdown(f"**Atmosfer durumu** :{renk}-badge[{seviye}]")
    lcl_m = mpcalc.pressure_to_height_std(s["lcl"] * units.hPa).m_as("m") - \
        mpcalc.pressure_to_height_std(p[0]).m_as("m")
    m = st.container(key="kartlar_profil_1").columns(2)
    m[0].metric("CAPE", f"{cape:.0f} J/kg", border=True,
                help="Yükselen havanın kazanabileceği enerji. <100 kararlı, 100–1000 zayıf, 1000–2500 orta, "
                     ">2500 güçlü kararsızlık. Diyagramdaki kırmızı alanın büyüklüğüdür.")
    m[1].metric("CIN", f"{cin:.0f} J/kg", border=True,
                help="Yükselmeyi engelleyen \"kapak\". −50'den daha negatifse fırtınaların başlaması için güçlü "
                     "bir tetik (cephe, dağ, gündüz ısınması) gerekir. Mavi alan.")
    m = st.container(key="kartlar_profil_2").columns(2)
    m[0].metric("Bulut tabanı", f"{lcl_m:.0f} m", border=True,
                help="Yerden yükselen havanın yoğuşmaya başladığı yükseklik (LCL). Alçak taban: nemli hava, "
                     "alçak bulutlar.")
    m[1].metric("Yağışa dönüşebilir su", f"{s['pw']:.0f} mm", border=True,
                help="Sütundaki tüm su buharı yoğuşsaydı oluşacak su. 30 mm üstü yoğun sağanak potansiyelidir.")
    if s["donma"] is not None:
        dz = mpcalc.pressure_to_height_std(s["donma"] * units.hPa).m_as("m")
        st.caption(f":material/ac_unit: 0 °C seviyesi ≈ {s['donma']:.0f} hPa (~{dz:.0f} m deniz seviyesinden)")

    if cape < 100:
        yorum = "Yükselen hava kısa sürede çevresinden soğuk kalıp geri iniyor. Dikey bulut gelişimi beklenmez."
    elif cin < -50:
        yorum = ("Enerji var ama güçlü bir \"kapak\" da var. Kapak bir tetikle (cephe, dağ yamacı, öğleden sonra "
                 "ısınması) kırılırsa ani ve kuvvetli sağanaklar gelişebilir.")
    elif cape < 1000:
        yorum = "Küçük kümülüs bulutları ve kısa süreli sağanaklar olabilir."
    elif cape < 2500:
        yorum = "Gök gürültülü sağanak için yeterli enerji var; öğleden sonra saatleri en riskli dönemdir."
    else:
        yorum = "Dolu, ani kuvvetli rüzgâr ve şiddetli fırtına potansiyeli taşıyan çok enerjik bir atmosfer."
    st.info(yorum, icon=":material/lightbulb:")

okuma_rehberi([
    ("Eksenler", "Dikey eksen basınçtır; yukarı çıktıkça azalır (850 hPa ≈ 1,5 km, 500 hPa ≈ 5,5 km). "
     "Sıcaklık çizgileri 45° sağa eğik çizilir, bu yüzden adı \"skew-T\"dir."),
    ("Kırmızı ve yeşil çizgi", "Kırmızı havanın sıcaklığı, yeşil çiy noktasıdır. İkisinin birbirine değdiği "
     "katmanlarda hava doymuştur, yani bulut vardır. Aralarının açık olduğu katmanlar kurudur."),
    ("Kesikli çizgi: yükselen parsel", "Yerden yükseltilen bir hava kabarcığının sıcaklığıdır. Parsel "
     "çevresinden sıcaksa (kesikli çizgi kırmızının sağında) kaldırma kuvvetiyle yükselmeye devam eder. "
     "Bu alan kırmızıyla gölgelenir ve büyüklüğü **CAPE**'tir."),
    ("Mavi gölge: CIN", "Parselin çevresinden soğuk kaldığı, yükselmenin engellendiği \"kapak\" katmanıdır."),
    ("Mavi noktalı dikey çizgi", "0 °C çizgisi. Kırmızı çizginin bunu kestiği yükseklik donma seviyesidir. "
     "Yere yakın bir yerde kırmızı çizgi 0 °C'nin sağına geçip sonra yeniden soluna dönüyorsa (sıcak burun) "
     "donan yağmur riski vardır."),
    ("Rüzgâr bayrakları", "Sağdaki bayraklar her seviyedeki rüzgârı gösterir (kısa çizgi 5, uzun 10, üçgen 50 "
     "knot). Yükseklikle yönü dönen ve hızlanan rüzgâr (rüzgâr kesmesi) fırtınaların daha organize ve "
     "uzun ömürlü olmasına yol açar."),
], baslik="Skew-T diyagramı adım adım nasıl okunur?")
st.caption("Not: Model verisi 10 basınç seviyesinden geldiği için gerçek radyosonde (balon) ölçümü kadar "
           "ayrıntılı değildir.")
