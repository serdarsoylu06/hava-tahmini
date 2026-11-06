import pandas as pd
import streamlit as st

from hava import deniz, grafik, kayit, tasarim, zaman_seridi
from hava.arayuz import gun_sayisi, uyari_kartlari
from hava.veri import ansambl, durum, konum, simge, tahmin, yon_adi
from hava.yerler import nokta_konumu
from hava.yorum import GUNLER, SIRA, uyarilar

k = konum()
koyu = st.context.theme.type == "dark"
simdi, saatlik, gunluk = tahmin(k)
an = pd.Timestamp(simdi["time"])
ileri = saatlik[saatlik.index >= an.floor("h")]
donem = ileri[ileri.index < an.floor("h") + pd.Timedelta(days=gun_sayisi())]

# ansambl yayılımı: günlük en yüksek sıcaklıkta %10–%90 aralığı → tahmin güveni
uye = ansambl(k, "ecmwf_ifs025", "temperature_2m", 10)
gmax = uye.resample("D").max()
guven = (gmax.quantile(0.9, axis=1) - gmax.quantile(0.1, axis=1))

# ---------------------------------------------------------------- yeni kullanıcı rehberi (oturumda bir kez)
# Büyük bir kutu yerine ince bir satır: anlatılan bölüm sayfada çerçevelenir ve köşesine numarası konur, böylece
# rehber "nereye bakmalı" sorusunu yerinde gösterir. (ad, açıklama, çerçevelenecek bölümlerin CSS seçicisi)
_SOL = '.st-key-esit_satir_genel [data-testid="stColumn"]'
REHBER = [
    ("Anlık durum", "Manzara şu anki havayı ve günün saatini gösterir; altındaki cümle önümüzdeki saatlerin özetidir.",
     [f"{_SOL}:first-child"]),
    ("Ölçerler", "Nem, hamle, basınç ve UV. Her ölçerin altındaki satır değerin ne anlama geldiğini söyler.",
     [f"{_SOL}:last-child"]),
    ("24 saat grafikleri", "Grafiklerin üstünde gezinince o saatin değerleri görünür; aşağıdaki saat saat şeritte "
     "bir saate dokununca bütün değerler o saate hizalanır.", [".st-key-esit_satir_24_sicaklik", ".st-key-esit_satir_24_ruzgar"]),
    ("Nelere dikkat etmeli?", "Fırtına, dalga, sis, don gibi durumlar tahminden otomatik bulunur. Her uyarıda neden "
     "önemli olduğu ve hangi sayfada izleneceği yazar.", [".st-key-rehber_uyari"]),
]
st.session_state.setdefault("rehber", 1)


def _rehber(adim):
    st.session_state.rehber = adim


adim = st.session_state.rehber
with st.container(key="rehber", horizontal=True, vertical_alignment="center", gap="small",
                  horizontal_alignment="right"):
    if adim:
        b, m, secici = REHBER[adim - 1]
        st.markdown(f":material/lightbulb: **{adim}/{len(REHBER)} · {b}** :gray[— {m}]", width="stretch")
        st.button("", icon=":material/chevron_left:", key="rehber_geri", type="tertiary", help="Önceki",
                  on_click=_rehber, args=(adim - 1,), disabled=adim == 1)
        st.button("", icon=":material/chevron_right:" if adim < len(REHBER) else ":material/check:",
                  key="rehber_ileri", type="tertiary", help="Sonraki" if adim < len(REHBER) else "Bitir",
                  on_click=_rehber, args=(0 if adim == len(REHBER) else adim + 1,))
        st.button("", icon=":material/close:", key="rehber_gizle", type="tertiary", help="Tanıtımı gizle",
                  on_click=_rehber, args=(0,))
        # tüm bölümlere küçük numara; anlatılanı çerçevele
        isaret = "".join(f'{sec[0]}::before {{ content: "{i}"; }}' for i, (_, _, sec) in enumerate(REHBER, 1))
        hepsi = ", ".join(sec[0] for _, _, sec in REHBER)
        etkin = ", ".join(secici)
        etkin_n = ", ".join(f"{x}::before" for x in secici[:1])
        st.html(f"""<style>
{hepsi} {{ position: relative; }}
{", ".join(f"{sec[0]}::before" for _, _, sec in REHBER)} {{
  position: absolute; top: -9px; left: -9px; z-index: 5; width: 22px; height: 22px; border-radius: 50%;
  display: flex; align-items: center; justify-content: center; font: 700 11px/1 'Space Mono', monospace;
  background: var(--kd-yuzey2, #2a3a3a); color: var(--kd-ikinci); border: 1px solid var(--kd-cizgi, #4a5a5a); }}
{isaret}
{etkin} {{ outline: 2px solid var(--kd-vurgu); outline-offset: 5px; border-radius: 20px; transition: outline-color .2s; }}
{etkin_n} {{ background: var(--kd-vurgu); color: #1C2829; border-color: var(--kd-vurgu); }}
</style>""")
    else:
        st.button("Sayfa turu", icon=":material/help:", key="rehber_ac", type="tertiary",
                  help="Bu sayfanın bölümlerini dört adımda tanı", on_click=_rehber, args=(1,))

# ---------------------------------------------------------------- manzara ve ölçerler
bugun = gunluk.iloc[0]
evre = tasarim.gun_evresi(an, pd.Timestamp(bugun.sunrise), pd.Timestamp(bugun.sunset))
son3 = saatlik.pressure_msl.loc[:an].tail(4)
egilim = son3.iloc[-1] - son3.iloc[0] if len(son3) > 1 else 0
fark = simdi["temperature_2m"] - simdi["dew_point_2m"]
ozet = zaman_seridi.ozet(ileri.iloc[:zaman_seridi.SAAT])

# esit_satir anahtarı: manzara kartı ile ölçer sütunu aynı yükseklikte (CSS: tasarim.py)
sol, sag = st.container(key="esit_satir_genel").columns([2.1, 1], gap="medium")
with sol:
    tasarim.manzara(
        ", ".join(x for x in (k["ad"], k["bolge"]) if x) + f" · {GUNLER[an.weekday()]} {an:%d.%m}, saat {an:%H:%M}",
        simdi["temperature_2m"], durum(simdi["weather_code"]),
        f"Hissedilen {simdi['apparent_temperature']:.0f}° · en yüksek {bugun.temperature_2m_max:.0f}°, "
        f"en düşük {bugun.temperature_2m_min:.0f}° · görüş {simdi['visibility'] / 1000:.0f} km",
        ozet, simdi["weather_code"], evre, tohum=round(k["lat"] * 100 + k["lon"] * 7))
with sag:
    oran = simdi["wind_gusts_10m"] / max(simdi["wind_speed_10m"], 1)
    tasarim.olcerler([
        ("Nem", f"Çiy noktası {simdi['dew_point_2m']:.0f}°; doymaya {fark:.0f}° var" if fark > 0.5 else
         "Hava doymuş: sis ya da alçak bulut", f"Nem yüzde {simdi['relative_humidity_2m']:.0f}", "halka",
         simdi["relative_humidity_2m"] / 100, "#C6E066", f"%{simdi['relative_humidity_2m']:.0f}"),
        ("Hamle", f"km/s · ortalama {simdi['wind_speed_10m']:.0f}, {yon_adi(simdi['wind_direction_10m'])} yönünden "
         f"({oran:.1f} kat)", f"Hamle saatte {simdi['wind_gusts_10m']:.0f} kilometre", "yarim",
         simdi["wind_gusts_10m"] / 80, "#F1D24E", f"{simdi['wind_gusts_10m']:.0f}"),
        ("Basınç", f"hPa · 3 saatte {egilim:+.1f}; {'düşüyor, hava bozabilir' if egilim <= -1 else 'yükseliyor' if egilim >= 1 else 'durağan'}",
         f"Basınç {simdi['pressure_msl']:.0f} hektopaskal", "yarim",
         (simdi["pressure_msl"] - 980) / 60, "#8CBF5A", f"{simdi['pressure_msl']:.0f}"),
        ("UV indeksi", f"Bugün en fazla {bugun.uv_index_max:.0f}; 3 ve üstünde öğle güneşinden korun",
         f"UV indeksi {simdi['uv_index']:.0f}", "yarim", simdi["uv_index"] / 11, "#F0A060", f"{simdi['uv_index']:.0f}"),
    ], koyu)

# ---------------------------------------------------------------- noktalarım
noktalar = kayit.oku()[:4]
if noktalar:
    tasarim.bolum("", "Noktalarım", "Kayıtlı yerlerin şu anki durumu")

    def _sec(n):
        st.session_state.harita_nokta = {"lat": n["lat"], "lon": n["lon"], "ad": n["ad"], "kayitli": True}

    kol = st.columns(len(noktalar), gap="small")
    for c, n in zip(kol, noktalar):
        with c:
            nk = nokta_konumu(n["lat"], n["lon"], n["ad"], "Kayıtlı nokta")
            ns, nh, _ = tahmin(nk)
            nu = sorted(uyarilar(nh[nh.index >= an.floor("h")].iloc[:48], nk.get("rakim")), key=lambda u: SIRA[u.seviye])
            nu = [u for u in nu if u.seviye in ("tehlike", "dikkat")]
            secili = abs(n["lat"] - k["lat"]) < 1e-4 and abs(n["lon"] - k["lon"]) < 1e-4
            rakim = nk.get("rakim")
            tasarim.nokta_karti(n["ad"], f"{rakim:.0f} m" if isinstance(rakim, (int, float)) else "Kayıtlı nokta",
                                f"{ns['temperature_2m']:.0f}°", durum(ns["weather_code"]),
                                nu[0].baslik if nu else None, bool(nu) and nu[0].seviye == "tehlike", secili)
            st.button("Seçili" if secili else "Bu noktaya geç", key=f"nk_{n['ad']}", on_click=_sec, args=(n,),
                      disabled=secili, width="stretch", type="tertiary")

# ---------------------------------------------------------------- önümüzdeki 24 saat
with st.container(horizontal=True, vertical_alignment="bottom"):
    tasarim.bolum("", "Önümüzdeki 24 saat", "Grafiklerin üstünde gezin, o saatin değerleri görünür")
    tablo_24 = st.toggle("Tablo olarak göster", key="tablo_24")
g = grafik.saatlik_dortlu(ileri, GUNLER)
ACIKLAMA = {
    "sicaklik": ("Sıcaklık", "Sarı şeritler sıcaklıkla çiy noktası arasında 2° ya da daha az fark olan saatler: sis ve alçak bulut ihtimali."),
    "yagis": ("Yağış", "Çubuklar saatlik miktar: 0,5 mm altı çisenti, 4 mm üstü sağanaktır. Alttaki şerit yağış olasılığı; koyulaştıkça artar."),
    "ruzgar": ("Rüzgâr", "Oklar rüzgârın estiği yönü gösterir. Hamle ortalamanın iki katına yaklaşıyorsa hava türbülanslıdır."),
    "basinc": ("Basınç", "3 saatte 3 hPa'dan fazla düşüş kötüleşen havanın, dipten sonra hızlı yükseliş sistemin geçtiğinin işaretidir."),
}
d24 = g["veri"]
OZET = {
    "sicaklik": f"{d24.temperature_2m.min():.0f}° – {d24.temperature_2m.max():.0f}°",
    "yagis": f"toplam {d24.precipitation.sum():.1f} mm".replace(".", ","),
    "ruzgar": f"hamle en çok {d24.wind_gusts_10m.max():.0f} km/s",
    "basinc": f"{d24.pressure_msl.iloc[-1] - d24.pressure_msl.iloc[0]:+.1f} hPa / 24 saat".replace(".", ","),
}
for satir in (("sicaklik", "yagis"), ("ruzgar", "basinc")):
    kol = st.container(key=f"esit_satir_24_{satir[0]}").columns(2, gap="medium")  # aynı satırdaki kartlar eşit yükseklikte
    for c, ad in zip(kol, satir):
        with c, st.container(key=f"kart_{ad}"):
            b, a = ACIKLAMA[ad]
            st.markdown(f"### {b} <span style='float:right;font-family:Space Mono,monospace;font-size:13px;font-weight:700'>{OZET[ad]}</span>",
                        unsafe_allow_html=True)
            st.caption(a)
            st.altair_chart(g[ad], theme=None, width="stretch")

if tablo_24:
    t = d24.assign(saat=d24.saat_ad, yon=d24.yon_ad)
    st.dataframe(
        t[["saat", "temperature_2m", "apparent_temperature", "dew_point_2m", "precipitation", "olas",
           "wind_speed_10m", "wind_gusts_10m", "yon", "pressure_msl", "visibility"]],
        hide_index=True, alt="Önümüzdeki 24 saatin saatlik değerleri",
        column_config={
            "saat": "Saat",
            "temperature_2m": st.column_config.NumberColumn("Sıcaklık", format="%.0f °C"),
            "apparent_temperature": st.column_config.NumberColumn("Hissedilen", format="%.0f °C"),
            "dew_point_2m": st.column_config.NumberColumn("Çiy noktası", format="%.0f °C"),
            "precipitation": st.column_config.NumberColumn("Yağış", format="%.1f mm"),
            "olas": st.column_config.ProgressColumn("Olasılık", format="%d%%", min_value=0, max_value=100),
            "wind_speed_10m": st.column_config.NumberColumn("Rüzgâr", format="%.0f km/s"),
            "wind_gusts_10m": st.column_config.NumberColumn("Hamle", format="%.0f km/s"),
            "yon": "Yön",
            "pressure_msl": st.column_config.NumberColumn("Basınç", format="%.1f hPa"),
            "visibility": st.column_config.NumberColumn("Görüş", format="%.0f m"),
        })

# ---------------------------------------------------------------- saat saat zaman şeridi
tasarim.bolum("", "Saat saat", f"Önümüzdeki {zaman_seridi.SAAT} saat; bir saate dokun, bütün değerler hizalansın")
zaman_seridi.zaman_seridi(ileri, k["ad"], koyu, ozet_goster=False)

# ---------------------------------------------------------------- uyarılar ve denize çıkış
liste = uyarilar(donem, k["rakim"], guven.loc[guven.index < donem.index[-1]]) + deniz.uyarilar(k, gun_sayisi())
if any(u.seviye in ("tehlike", "dikkat") for u in liste):          # deniz uyarısı geldiyse "sakin" kartı düşer
    liste = [u for u in liste if u.seviye != "iyi"]
liste = sorted(liste, key=lambda u: SIRA[u.seviye])

deniz_bilgi = None
if deniz.kiyida_mi(k["lat"], k["lon"]):
    bulunan = deniz.en_yakin_deniz(k["lat"], k["lon"])
    if bulunan is not None:
        dlat, dlon, km, deniz_yonu = bulunan
        dv = deniz.deniz_verisi(dlat, dlon, dict(k, lat=dlat, lon=dlon), 3).dropna(subset=["wave_height"])
        s = deniz.guvenlik(dv, saatlik, deniz_yonu).genel
        s = s[s.index >= an.floor("h")].iloc[:24]
        if len(s) >= 12:
            deniz_bilgi = (s, dv, km)

if deniz_bilgi:
    sol, sag = st.columns([7, 5], gap="medium")
else:
    sol, sag = st.container(), None
with sol, st.container(key="rehber_uyari"):
    tasarim.bolum("", "Nelere dikkat etmeli?", f"Önümüzdeki {gun_sayisi()} günün tahmini otomatik tarandı")
    uyari_kartlari(liste, sutun=1 if deniz_bilgi else 2)
if deniz_bilgi:
    s, dv, km = deniz_bilgi
    seviye = [0 if x == 0 else 1 if x == 1 else 2 for x in s]
    uygun = deniz.pencereler(s == 0, en_az_saat=2)
    kotu = s[s >= 2]
    g_ = lambda t: f"{GUNLER[t.weekday()]} {t:%H:%M}"
    dalga_simdi = dv.wave_height.reindex(s.index).iloc[0]
    if s.iloc[0] >= 2:
        cumle = "Şu an küçük tekneler için **uygun değil**" + (f" (dalga {dalga_simdi:.1f} m).".replace(".", ",", 1) if dalga_simdi == dalga_simdi else ".")
    elif s.iloc[0] == 1:
        cumle = "Şu an denize **dikkatli** çıkılabilir."
    else:
        cumle = "Şu an denize çıkılabilir."
    if uygun and not (s.iloc[0] == 0 and uygun[0][0] == s.index[0]):
        cumle += f" En yakın uygun aralık **{g_(uygun[0][0])}–{uygun[0][1]:%H:%M}**."
    elif uygun:
        cumle += f" Uygun aralığın sonu: **{uygun[0][1]:%H:%M}**."
    else:
        cumle += " Önümüzdeki 24 saatte uygun bir aralık yok."
    sonra = kotu[kotu.index > s.index[0]] if s.iloc[0] < 2 else kotu.iloc[0:0]
    if not sonra.empty:
        cumle += f" **{g_(sonra.index[0])}** itibarıyla koşullar kötüleşiyor, kıyıda kal."
    with sag:
        tasarim.bolum("", "Denize çıkılır mı?", f"En yakın deniz noktası, {km:.0f} km")
        with st.container(key="yuzey_deniz"):
            tasarim.deniz_seridi(
                seviye, ["Şimdi" if i == 0 else f"{t:%H}" if i % 3 == 0 else "" for i, t in enumerate(s.index)],
                [f"{g_(t)}: {['uygun', 'dikkatli ol', 'uygun değil'][v]} (dalga {dv.wave_height.get(t, float('nan')):.1f} m)"
                 for t, v in zip(s.index, seviye)], cumle, koyu)
            st.page_link("app_pages/balikcilik.py", label="Üç günlük deniz tahmini", icon=":material/sailing:")

# ---------------------------------------------------------------- 10 gün
with st.container(horizontal=True, vertical_alignment="bottom"):
    tasarim.bolum("", "10 günlük tahmin")
    gorunum = st.segmented_control("Görünüm", ["Kartlar", "Tablo"], default="Kartlar", key="gun_gorunum",
                                   label_visibility="collapsed")
if gorunum == "Tablo":
    t = gunluk.reset_index()
    t["gun"] = [grafik.gunluk_etiket(x, t.time.iloc[0].date()) for x in t.time]
    t["durum"] = [f"{simge(c)} {durum(c)}" for c in t.weather_code]
    t["yon"] = [yon_adi(x) for x in t.wind_direction_10m_dominant]
    t["guven"] = guven.reindex(t.time).values
    st.dataframe(
        t[["gun", "durum", "temperature_2m_min", "temperature_2m_max", "precipitation_sum",
           "precipitation_probability_max", "snowfall_sum", "wind_gusts_10m_max", "yon", "uv_index_max", "guven"]],
        hide_index=True, alt="Günlük tahmin tablosu",
        column_config={
            "gun": "Gün", "durum": "Gökyüzü",
            "temperature_2m_min": st.column_config.NumberColumn("En düşük", format="%.0f °C"),
            "temperature_2m_max": st.column_config.NumberColumn("En yüksek", format="%.0f °C"),
            "precipitation_sum": st.column_config.NumberColumn("Yağış", format="%.1f mm"),
            "precipitation_probability_max": st.column_config.ProgressColumn(
                "Olasılık", format="%d%%", min_value=0, max_value=100),
            "snowfall_sum": st.column_config.NumberColumn("Kar", format="%.1f cm"),
            "wind_gusts_10m_max": st.column_config.NumberColumn("En kuvvetli hamle", format="%.0f km/s"),
            "yon": "Hâkim yön",
            "uv_index_max": st.column_config.NumberColumn("UV", format="%.0f"),
            "guven": st.column_config.NumberColumn(
                "Belirsizlik", format="± %.1f °C",
                help="ECMWF ansamblının 51 üyesinden en yüksek sıcaklığın %10–%90 aralığı. "
                     "2 °C altı yüksek, 2–4 °C orta, 4 °C üstü düşük güven."),
        })
else:
    tasarim.gun_kartlari(gunluk, guven)
st.caption("Daire rengi gökyüzünü gösterir: sarı açık, açık yeşil parçalı bulutlu, koyu yeşil yağışlı, gri kapalı ya da "
           "sisli; içindeki sayı en yüksek sıcaklık. Soluk daireler tahmin güveninin düşük olduğu günler: ECMWF'nin 51 "
           "ansambl üyesi o gün için 4 °C'den fazla ayrışıyor.")
