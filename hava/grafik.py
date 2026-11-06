"""Etkileşimli Altair grafikleri. Hepsinde fareyle üzerine gelince değerler okunur;
model ve ansambl grafiklerinde fare tekerleği/sürükleme ile yakınlaştırılır, çift tıklama sıfırlar."""
import altair as alt
import numpy as np
import pandas as pd
import streamlit as st

from hava.veri import simge, durum, yon_adi
from hava.yorum import GUNLER

# Karadeniz paleti: açık ve koyu temada okunur, renk körlüğü için birbirinden ayrışan tonlar
KIRMIZI, YESIL, TURUNCU = "#E07A3F", "#5FAE5A", "#D9A53A"
MAVI, MOR, GRI, CAMGOBEGI, KAHVE, LACIVERT = "#4B8FD1", "#9B7FD1", "#8A9A92", "#3FA7A0", "#B98A45", "#7E8FD8"
SAAT = "%d.%m %H:%M"
YUK = 150   # meteogram panel yüksekliği
EKSEN = 42  # meteogram y eksenlerinin sabit genişliği (px)


def _hazirla(df):
    d = df.reset_index()
    d["son"] = d["time"] + pd.Timedelta(hours=1)
    return d


def _x(etiket=True):
    return alt.X("time:T", title=None,
                 axis=alt.Axis(format="%d.%m", labels=etiket, tickCount="day", labelFlush=False,
                               gridOpacity=0.5))


def _eksen_saatli(zamanlar):
    """Gün etiketi gece yarısında (kalın), araya 6 saatte bir daha küçük ve ince saat etiketi.
    Saydamlık kullanılmaz: koyu zeminde okunurluk (kontrast) düşmesin."""
    gun = "hours(datum.value) == 0"
    # İlk işaret bir gece yarısı: dar ekranda çakışan etiketler "parity" ile ayıklanırken (her ikinciden biri
    # kalır) gün etiketleri hep çift sıraya düşer ve korunur, saatler önce düşer.
    zt = pd.DatetimeIndex(zamanlar)
    ilk = zt.min().ceil("D")
    degerler = [alt.DateTime(year=t.year, month=t.month, date=t.day, hours=t.hour)
                for t in pd.date_range(ilk, zt.max(), freq="6h")]
    return alt.Axis(values=degerler, labelOverlap="parity", labelFlush=False,
                    labelExpr=f"{gun} ? timeFormat(datum.value, '%d.%m') : timeFormat(datum.value, '%H:%M')",
                    labelFontSize=alt.condition(gun, alt.value(11), alt.value(10)),
                    labelFontWeight=alt.condition(gun, alt.value("bold"), alt.value("normal")))


def yazi_rengi(koyu):
    """Metin işaretleri temanın yazı rengini almıyor; açık/koyu temaya göre elle verilir."""
    return "#E8EFE6" if koyu else "#1C2829"


def _murekkep():
    """Gerçek ölçüm ve eğilim gibi "siyah" çizgilerin rengi: koyu temada siyah görünmez, açık renge döner."""
    try:
        koyu = st.context.theme.type == "dark"
    except Exception:                      # betik bağlamı dışında (ör. testler) açık tema varsayılır
        koyu = False
    return yazi_rengi(koyu)


def gece(df):
    """is_day == 0 olan ardışık saatleri gölgelenecek aralıklara çevirir."""
    g = df.is_day == 0
    blok = (g != g.shift()).cumsum()
    return pd.DataFrame([{"bas": s.index[0], "son": s.index[-1] + pd.Timedelta(hours=1)}
                         for _, s in df[g].groupby(blok[g])])


def _gece_katmani(g):
    if g.empty:
        return []
    return [alt.Chart(g).mark_rect(color="#8A9A92", opacity=0.10).encode(x="bas:T", x2="son:T")]


def _imlec(d, hover, ipucu):
    """Panelin üstünde fareyi izleyen dikey çizgi + o saatin değerleri."""
    sec = alt.Chart(d).mark_point(opacity=0).encode(x="time:T").add_params(hover)
    cizgi = alt.Chart(d).mark_rule(color=GRI, strokeDash=[3, 3]).encode(
        x="time:T", tooltip=[alt.Tooltip("time:T", title="Zaman", format=SAAT)] + ipucu
    ).transform_filter(hover)
    return [sec, cizgi]


def _baslik(metin, alt_metin=None):
    return alt.TitleParams(metin, subtitle=alt_metin or "", anchor="start", fontSize=14,
                           subtitleFontSize=11, subtitleColor=GRI, offset=6)


def _uzun(d, sutunlar):
    return d.melt(id_vars=["time"], value_vars=list(sutunlar), var_name="kod", value_name="deger") \
            .assign(seri=lambda x: x.kod.map(sutunlar))


def meteogram(df, rakim=None, imlec=None):
    """Meteogram panelleri: her biri ayrı, tam genişlikte bir grafik. Her panelin ipucu, o saatin
    ana değerlerinin tümünü gösterir; böylece hangi panelde gezilirse gezilsin tablo eksiksizdir."""
    d = _hazirla(df)
    d["yon"] = d.wind_direction_10m.map(yon_adi)
    d["gidis"] = (d.wind_direction_10m + 180) % 360
    g = gece(df)
    T = lambda c, b, f=".1f": alt.Tooltip(f"{c}:Q", title=b, format=f)
    ortak = [T("temperature_2m", "Sıcaklık °C"), T("dew_point_2m", "Çiy noktası °C"),
             T("precipitation", "Yağış mm"), T("precipitation_probability", "Yağış olasılığı %", ".0f"),
             T("wind_speed_10m", "Rüzgâr km/s", ".0f"), T("wind_gusts_10m", "Hamle km/s", ".0f"),
             alt.Tooltip("yon:N", title="Geldiği yön"), T("cloud_cover", "Bulut %", ".0f"),
             T("pressure_msl", "Basınç hPa")]

    def panel(ad, katmanlar, ek_ipucu=(), bagimsiz=False, yukseklik=YUK, alt_metin=None):
        hover = alt.selection_point(fields=["time"], nearest=True, on="pointerover", empty=False,
                                    clear="pointerout")
        sabit = [] if imlec is None else [alt.Chart(pd.DataFrame({"t": [imlec]})).mark_rule(
            color=_murekkep(), strokeWidth=1.5, strokeDash=[4, 3]).encode(x="t:T")]
        c = alt.layer(*_gece_katmani(g), *katmanlar, *sabit, *_imlec(d, hover, ortak + list(ek_ipucu)),
                      title=_baslik(ad, alt_metin))
        if bagimsiz:
            c = c.resolve_scale(y="independent")
        else:
            # sağ ekseni olmayan panellere sağ eksen kadar boşluk: tüm panellerin zaman ekseni hizalı kalsın
            c = c.properties(padding={"left": 5, "right": 5 + EKSEN + 18, "top": 5, "bottom": 5})
        return c.properties(height=yukseklik).configure_axisY(minExtent=EKSEN, maxExtent=EKSEN), yukseklik + 80

    paneller = []
    # 1) sıcaklık
    ser = {"temperature_2m": "Sıcaklık", "apparent_temperature": "Hissedilen", "dew_point_2m": "Çiy noktası"}
    k = [alt.Chart(d).mark_area(color=KIRMIZI, opacity=0.1).encode(_x(), y="dew_point_2m:Q", y2="temperature_2m:Q"),
         alt.Chart(_uzun(d, ser)).mark_line(strokeWidth=2).encode(
             _x(), alt.Y("deger:Q", title="°C", scale=alt.Scale(zero=False)),
             alt.Color("seri:N", title=None, legend=alt.Legend(orient="top-right", direction="horizontal"),
                       scale=alt.Scale(domain=list(ser.values()), range=[KIRMIZI, TURUNCU, YESIL])),
             strokeDash=alt.StrokeDash("seri:N", legend=None, scale=alt.Scale(
                 domain=list(ser.values()), range=[[1, 0], [4, 3], [1, 0]])))]
    if df.temperature_2m.min() < 3:
        k.append(alt.Chart(pd.DataFrame({"y": [0]})).mark_rule(color=LACIVERT, strokeDash=[6, 3]).encode(y="y:Q"))
    paneller.append(panel("Sıcaklık", k, [T("apparent_temperature", "Hissedilen °C")], yukseklik=210,
                          alt_metin="Gölgeli alan daraldıkça hava nemlenir; çizgiler birleşince sis/bulut. "
                                    "Mavi kesikli çizgi 0 °C"))

    # 2) yağış
    yagan = alt.Chart(d).transform_filter("datum.precipitation > 0")
    paneller.append(panel("Yağış", [
        yagan.mark_bar(color=MAVI, opacity=0.85).encode(
            _x(), x2="son:T", y=alt.Y("precipitation:Q", title="mm/saat", scale=alt.Scale(domain=[0, max(2, df.precipitation.max() * 1.1)])),
            y2=alt.Y2Datum(0)),
        alt.Chart(d).mark_line(color=MOR, strokeWidth=1.5, opacity=0.7, interpolate="step-after").encode(
            _x(), y=alt.Y("precipitation_probability:Q", title="Olasılık %", scale=alt.Scale(domain=[0, 100]),
                          axis=alt.Axis(titleColor=MOR, orient="right")))],
        bagimsiz=True, yukseklik=130, alt_metin="Çubuk: saatlik miktar · mor çizgi: ansambl olasılığı"))

    # 3) rüzgâr
    ser = {"wind_speed_10m": "Ortalama", "wind_gusts_10m": "Hamle"}
    paneller.append(panel("Rüzgâr", [
        alt.Chart(_uzun(d, ser)).mark_line(strokeWidth=2).encode(
            _x(), alt.Y("deger:Q", title="km/s", scale=alt.Scale(domainMin=0)),
            alt.Color("seri:N", title=None, legend=alt.Legend(orient="top-right", direction="horizontal"),
                      scale=alt.Scale(domain=list(ser.values()), range=[GRI, "#ADB5BD"])),
            strokeDash=alt.StrokeDash("seri:N", legend=None, scale=alt.Scale(
                domain=list(ser.values()), range=[[1, 0], [4, 3]]))),
        alt.Chart(d.iloc[::3]).mark_point(shape="arrow", filled=True, size=110, color=TURUNCU).encode(
            _x(), y="wind_speed_10m:Q",
            angle=alt.Angle("gidis:Q", scale=alt.Scale(domain=[0, 360], range=[0, 360])))],
        alt_metin="Turuncu oklar rüzgârın gittiği yönü gösterir (yukarı = kuzey)"))

    # 4) bulut (ısı haritası: alçak / orta / yüksek katman)
    ser = {"cloud_cover_high": "Yüksek", "cloud_cover_mid": "Orta", "cloud_cover_low": "Alçak"}
    b = _uzun(d, ser).merge(d[["time", "son"]], on="time")
    paneller.append(panel("Bulutluluk", [alt.Chart(b).mark_rect(color="#7C93AA").encode(
        _x(), x2="son:T", y=alt.Y("seri:N", title=None, sort=list(ser.values())),
        opacity=alt.Opacity("deger:Q", scale=alt.Scale(domain=[0, 100], range=[0, 1]), legend=None))],
        [T("cloud_cover_low", "Alçak bulut %", ".0f"), T("cloud_cover_mid", "Orta bulut %", ".0f"),
         T("cloud_cover_high", "Yüksek bulut %", ".0f")], yukseklik=90,
        alt_metin="Koyu = kapalı. Alçak bulut yağış ve sis, yüksek bulut yaklaşan sistemin habercisi olabilir"))

    # 5) basınç + nem
    paneller.append(panel("Basınç ve nem", [
        alt.Chart(d).mark_line(color=KAHVE, strokeWidth=2).encode(
            _x(), y=alt.Y("pressure_msl:Q", title="Basınç hPa", scale=alt.Scale(zero=False),
                          axis=alt.Axis(titleColor=KAHVE))),
        alt.Chart(d).mark_line(color=CAMGOBEGI, strokeWidth=1.5, opacity=0.7).encode(
            _x(), y=alt.Y("relative_humidity_2m:Q", title="Nem %", scale=alt.Scale(domain=[0, 100]),
                          axis=alt.Axis(titleColor=CAMGOBEGI, orient="right")))],
        [T("relative_humidity_2m", "Nem %", ".0f")], bagimsiz=True,
        alt_metin="Düşen basınç: sistem yaklaşıyor · yükselen: hava açıyor"))

    # 6) donma seviyesi + kar
    k = [alt.Chart(d).mark_line(color=LACIVERT, strokeWidth=2).encode(
        _x(), y=alt.Y("freezing_level_height:Q", title="Donma seviyesi m", scale=alt.Scale(domainMin=0),
                      axis=alt.Axis(titleColor=LACIVERT)))]
    if rakim is not None:
        k.append(alt.Chart(pd.DataFrame({"y": [rakim]})).mark_rule(color=KAHVE, strokeDash=[6, 3]).encode(y="y:Q"))
    kar = alt.Chart(d).transform_filter("datum.snowfall > 0").mark_bar(color="#74C0FC", opacity=0.8).encode(
        _x(), x2="son:T", y=alt.Y("snowfall:Q", title="Kar cm/saat",
                                  scale=alt.Scale(domain=[0, max(1, df.snowfall.max() * 1.1)]),
                                  axis=alt.Axis(orient="right", titleColor="#74C0FC")), y2=alt.Y2Datum(0))
    paneller.append(panel("Donma seviyesi ve kar", [alt.layer(*k), kar],
                          [T("freezing_level_height", "Donma seviyesi m", ".0f"), T("snowfall", "Kar cm")],
                          bagimsiz=True,
                          alt_metin=(f"Kahverengi kesikli çizgi rakımın ({rakim:.0f} m). " if rakim is not None else "")
                          + "Mavi çizgi ona yaklaştıkça yağış kara döner"))
    return paneller


def gunluk_etiket(t, bugun):
    return "Bugün" if t.date() == bugun else f"{GUNLER[t.weekday()]} {t:%d.%m}"


def yirmidort_saat(df, koyu=False):
    """Önümüzdeki 24 saat: sıcaklık eğrisi, saat başı simgeler, altta yağış olasılığı çubukları."""
    d = _hazirla(df)
    d["simge"] = [simge(c, bool(g)) for c, g in zip(d.weather_code, d.is_day)]
    d["durum"] = d.weather_code.map(durum)
    d["etiket"] = d.temperature_2m.round().astype(int).astype(str) + "°"
    d["olas_e"] = np.where(d.precipitation_probability >= 20,
                           d.precipitation_probability.fillna(0).astype(int).astype(str) + "%", "")
    x = alt.X("time:T", title=None, axis=alt.Axis(format="%H:%M", tickCount=6, grid=False, labelAngle=0,
                                                                   labelFlush=True, labelOverlap=True))
    lo, hi = d.temperature_2m.min(), d.temperature_2m.max()
    aralik = max(hi - lo, 4)
    # sıcaklık eğrisi grafiğin orta bandında, simgeler üstte, yağış çubukları altta kalacak biçimde ölçek
    sy = alt.Scale(domain=[lo - aralik * 0.9, hi + aralik * 0.75])
    d["ust"] = hi + aralik * 0.55
    hover = alt.selection_point(fields=["time"], nearest=True, on="pointerover", empty=False, clear="pointerout")
    ipucu = [alt.Tooltip("time:T", title="Saat", format="%H:%M"), alt.Tooltip("durum:N", title="Durum"),
             alt.Tooltip("temperature_2m:Q", title="Sıcaklık °C", format=".1f"),
             alt.Tooltip("apparent_temperature:Q", title="Hissedilen °C", format=".1f"),
             alt.Tooltip("precipitation_probability:Q", title="Yağış olasılığı %"),
             alt.Tooltip("precipitation:Q", title="Yağış mm", format=".1f"),
             alt.Tooltip("wind_gusts_10m:Q", title="Hamle km/s", format=".0f")]
    iki = d.iloc[::3]          # etiket, simge ve yüzdeler 3 saatte bir: dar ekranda birbirine girmesin
    sicak = alt.layer(
        alt.Chart(d).mark_area(opacity=0.13, color=TURUNCU, line={"color": TURUNCU, "strokeWidth": 2.5},
                               interpolate="monotone").encode(
            x, y=alt.Y("temperature_2m:Q", axis=None, scale=sy), y2=alt.Y2Datum(lo - aralik * 0.3)),
        alt.Chart(iki).mark_text(dy=-13, fontSize=12, fontWeight=600, color=yazi_rengi(koyu)).encode(x, alt.Y("temperature_2m:Q", scale=sy),
                                                                           text="etiket:N"),
        alt.Chart(iki).mark_text(fontSize=20).encode(x, alt.Y("ust:Q", scale=sy), text="simge:N"),
    )
    yag = alt.layer(
        alt.Chart(d).mark_rect(color=MAVI, opacity=0.55).encode(
            x, x2="son:T", y=alt.Y("precipitation_probability:Q", axis=None, scale=alt.Scale(domain=[0, 420])),
            y2=alt.Y2Datum(0)),
        alt.Chart(iki).mark_text(dy=-7, fontSize=10, color=MAVI).encode(
            x, alt.Y("precipitation_probability:Q", scale=alt.Scale(domain=[0, 420])), text="olas_e:N"),
    )
    imlec = alt.layer(
        alt.Chart(d).mark_rule(color=GRI, strokeDash=[3, 3]).encode(x, tooltip=ipucu).transform_filter(hover),
        alt.Chart(d).mark_point(opacity=0).encode(x).add_params(hover),
    )
    # sağ dolgu: son saat etiketi ("18:00") grafiğin kenarında kesilmesin
    return alt.layer(sicak, yag, imlec).resolve_scale(y="independent").properties(
        height=300, padding={"left": 6, "right": 22, "top": 6, "bottom": 4})


def on_gun(gunluk, guven=None, koyu=False):
    """iOS tarzı günlük liste: en düşük–en yüksek çubuğu, simge, yağış olasılığı."""
    d = gunluk.reset_index().copy()
    bugun = d.time.iloc[0].date()
    d["gun"] = [gunluk_etiket(t, bugun) for t in d.time]
    d["simge"] = d.weather_code.map(simge)
    d["durum"] = d.weather_code.map(durum)
    d["min_e"] = d.temperature_2m_min.round().astype(int).astype(str) + "°"
    d["max_e"] = d.temperature_2m_max.round().astype(int).astype(str) + "°"
    d["olas"] = np.where(d.precipitation_probability_max >= 20,
                         "💧" + d.precipitation_probability_max.fillna(0).astype(int).astype(str) + "%", "")
    d["ort"] = (d.temperature_2m_min + d.temperature_2m_max) / 2
    d["yon"] = d.wind_direction_10m_dominant.map(yon_adi)
    if guven is not None:
        g = guven.reindex(d.time.dt.normalize()).values
        d["guven"] = np.select([g < 2, g < 4, g >= 4], ["Yüksek", "Orta", "Düşük"], "—")
    else:
        d["guven"] = "—"
    lo, hi = d.temperature_2m_min.min(), d.temperature_2m_max.max()
    d["lo"], d["hi"], d["simge_x"], d["olas_x"] = lo, hi, lo - 6, hi + 4
    y = alt.Y("gun:N", sort=None, title=None, axis=alt.Axis(labelFontSize=13, ticks=False, domain=False,
                                                             labelFontWeight=500, labelPadding=8, grid=False))
    sx = alt.Scale(domain=[lo - 8, hi + 9], nice=False)
    ipucu = [alt.Tooltip("gun:N", title="Gün"), alt.Tooltip("durum:N", title="Durum"),
             alt.Tooltip("temperature_2m_max:Q", title="En yüksek °C", format=".1f"),
             alt.Tooltip("temperature_2m_min:Q", title="En düşük °C", format=".1f"),
             alt.Tooltip("precipitation_sum:Q", title="Yağış mm", format=".1f"),
             alt.Tooltip("precipitation_probability_max:Q", title="Yağış olasılığı %"),
             alt.Tooltip("snowfall_sum:Q", title="Kar cm", format=".1f"),
             alt.Tooltip("wind_gusts_10m_max:Q", title="En kuvvetli hamle km/s", format=".0f"),
             alt.Tooltip("yon:N", title="Hâkim rüzgâr"),
             alt.Tooltip("uv_index_max:Q", title="UV indeksi", format=".0f"),
             alt.Tooltip("guven:N", title="Tahmin güveni")]
    taban = alt.Chart(d).encode(y=y, tooltip=ipucu)
    X = lambda c: alt.X(f"{c}:Q", scale=sx, axis=None, title=None)
    return alt.layer(
        taban.mark_rule(strokeWidth=7, strokeCap="round", opacity=0.13, color=GRI).encode(X("lo"), x2="hi:Q"),
        taban.mark_rule(strokeWidth=7, strokeCap="round").encode(
            X("temperature_2m_min"), x2="temperature_2m_max:Q",
            color=alt.Color("ort:Q", legend=None, scale=alt.Scale(
                domain=[-10, 0, 10, 20, 30], range=["#4C6EF5", "#22B8CF", "#82C91E", "#FAB005", "#F03E3E"],
                clamp=True))),
        taban.mark_text(align="right", dx=-10, fontSize=13, color=GRI).encode(X("temperature_2m_min"), text="min_e:N"),
        taban.mark_text(align="left", dx=10, fontSize=13, fontWeight=600, color=yazi_rengi(koyu)).encode(X("temperature_2m_max"), text="max_e:N"),
        taban.mark_text(fontSize=20).encode(X("simge_x"), text="simge:N"),
        taban.mark_text(align="left", fontSize=12, color=MAVI).encode(X("olas_x"), text="olas:N"),
    ).properties(height=len(d) * 40).configure_view(stroke=None)


def model_karsilastirma(seriler: pd.DataFrame, birim):
    """seriler: index zaman, sütunlar model adları. Lejanda tıklayarak model gizlenir/vurgulanır."""
    d = seriler.reset_index().melt(id_vars="time", var_name="model", value_name="deger").dropna()
    bant = pd.DataFrame({"time": seriler.index, "en_az": seriler.min(axis=1), "en_cok": seriler.max(axis=1)})
    sec = alt.selection_point(fields=["model"], bind="legend")
    hover = alt.selection_point(fields=["time"], nearest=True, on="pointerover", empty=False, clear="pointerout")
    zoom = alt.selection_interval(bind="scales", encodings=["x"])
    x = alt.X("time:T", title=None, axis=_eksen_saatli(seriler.index))
    genis = seriler.reset_index()
    genis.columns = ["time"] + [f"m{i}" for i in range(seriler.shape[1])]
    ipucu = [alt.Tooltip("time:T", title="Zaman", format=SAAT)] + [
        alt.Tooltip(f"m{i}:Q", title=ad, format=".1f") for i, ad in enumerate(seriler.columns)]
    return alt.layer(
        alt.Chart(bant).mark_area(color=GRI, opacity=0.18).encode(x, y="en_az:Q", y2="en_cok:Q"),
        alt.Chart(d).mark_line(strokeWidth=2).encode(
            x, alt.Y("deger:Q", title=birim, scale=alt.Scale(zero=False)),
            alt.Color("model:N", title="Model (tıkla: vurgula)", legend=alt.Legend(orient="bottom", columns=3, labelLimit=260,
                                                                         columnPadding=28)),
            opacity=alt.condition(sec, alt.value(1), alt.value(0.12))).add_params(sec),
        alt.Chart(genis).mark_rule(color=GRI, strokeDash=[3, 3]).encode(x, tooltip=ipucu).transform_filter(hover),
        alt.Chart(genis).mark_point(opacity=0).encode(x).add_params(hover, zoom),
    ).properties(height=380)


def yayilim(s: pd.Series, birim, esikler):
    """Modeller arası fark (en büyük − en küçük) ve yorum bantları."""
    d = s.rename("fark").reset_index()
    a, b = esikler
    bolge = pd.DataFrame({"y0": [0, a, b], "y1": [a, b, max(b * 1.6, s.max() * 1.05)],
                          "ad": ["Uyumlu", "Kısmen uyumlu", "Belirsiz"]})
    return alt.layer(
        alt.Chart(bolge).mark_rect(opacity=0.12).encode(
            y="y0:Q", y2="y1:Q",
            color=alt.Color("ad:N", title=None, legend=alt.Legend(orient="top"),
                            scale=alt.Scale(domain=list(bolge.ad), range=[YESIL, "#FAB005", KIRMIZI]))),
        alt.Chart(d).mark_area(color=GRI, opacity=0.5, line={"color": GRI}).encode(
            alt.X("time:T", title=None, axis=_eksen_saatli(s.index)),
            alt.Y("fark:Q", title=f"Fark ({birim})"),
            tooltip=[alt.Tooltip("time:T", title="Zaman", format=SAAT),
                     alt.Tooltip("fark:Q", title="Modeller arası fark", format=".1f")]),
    ).properties(height=170)


def spagetti(U: pd.DataFrame, birim):
    """Ansambl: her üye ince çizgi, %10–%90 bandı ve ortanca."""
    d = U.reset_index().melt(id_vars="time", var_name="uye", value_name="deger")
    ist = pd.DataFrame({"time": U.index, "p10": U.quantile(0.1, axis=1), "p50": U.median(axis=1),
                        "p90": U.quantile(0.9, axis=1)})
    ist["bant"] = ist.p90 - ist.p10
    hover = alt.selection_point(fields=["time"], nearest=True, on="pointerover", empty=False, clear="pointerout")
    zoom = alt.selection_interval(bind="scales", encodings=["x"])
    x = alt.X("time:T", title=None, axis=alt.Axis(format="%d.%m", tickCount="day"))
    ipucu = [alt.Tooltip("time:T", title="Zaman", format=SAAT), alt.Tooltip("p50:Q", title="Ortanca", format=".1f"),
             alt.Tooltip("p10:Q", title="%10 (düşük senaryo)", format=".1f"),
             alt.Tooltip("p90:Q", title="%90 (yüksek senaryo)", format=".1f"),
             alt.Tooltip("bant:Q", title="Belirsizlik aralığı", format=".1f")]
    return alt.layer(
        alt.Chart(d).mark_line(strokeWidth=0.6, opacity=0.25, color=GRI).encode(
            x, alt.Y("deger:Q", title=birim, scale=alt.Scale(zero=False)), detail="uye:N"),
        alt.Chart(ist).mark_area(color=MAVI, opacity=0.22).encode(x, y="p10:Q", y2="p90:Q"),
        alt.Chart(ist).mark_line(color=MAVI, strokeWidth=2.5).encode(x, y="p50:Q"),
        alt.Chart(ist).mark_rule(color=GRI, strokeDash=[3, 3]).encode(x, tooltip=ipucu).transform_filter(hover),
        alt.Chart(ist).mark_point(opacity=0).encode(x, y="p50:Q").add_params(hover, zoom),
    ).properties(height=380)


def olasilik_cubuk(olas: pd.Series, esik):
    d = olas.rename("p").reset_index()
    d["gun"] = [f"{GUNLER[t.weekday()]} {t:%d.%m}" for t in d.time]
    return alt.Chart(d).mark_bar(cornerRadiusTopLeft=4, cornerRadiusTopRight=4).encode(
        alt.X("gun:N", sort=None, title=None, axis=alt.Axis(labelAngle=0)),
        alt.Y("p:Q", title="Olasılık %", scale=alt.Scale(domain=[0, 100])),
        color=alt.Color("p:Q", legend=None, scale=alt.Scale(domain=[0, 100], range=["#D0EBFF", "#1864AB"])),
        tooltip=[alt.Tooltip("gun:N", title="Gün"),
                 alt.Tooltip("p:Q", title=f"{esik} mm üstü yağış olasılığı %", format=".0f")],
    ).properties(height=260)


def kutu(gunluk: pd.DataFrame):
    d = gunluk.reset_index().melt(id_vars="time", var_name="uye", value_name="mm").dropna()
    d["gun"] = [f"{GUNLER[t.weekday()]} {t:%d.%m}" for t in d.time]
    return alt.Chart(d).mark_boxplot(color=MAVI, extent="min-max", size=22).encode(
        alt.X("gun:N", sort=None, title=None, axis=alt.Axis(labelAngle=0)),
        alt.Y("mm:Q", title="Günlük yağış (mm)")).properties(height=260)


def cape_serisi(df, secili):
    """Atmosfer profili sayfası: CAPE zaman serisi; tıklanan saat profili seçer."""
    d = df[["cape", "precipitation_probability", "i"]].reset_index()
    sec = alt.selection_point(fields=["i"], nearest=True, on="click", name="saat")
    x = alt.X("time:T", title=None, axis=alt.Axis(format="%d.%m", tickCount="day"))
    bolge = pd.DataFrame({"y0": [0, 100, 1000, 2500], "y1": [100, 1000, 2500, max(3500, d.cape.max())],
                          "ad": ["Kararlı", "Zayıf", "Orta", "Güçlü"]})
    ust = max(1200, d.cape.max() * 1.15)
    return alt.layer(
        alt.Chart(bolge).mark_rect(opacity=0.1).encode(
            y=alt.Y("y0:Q", scale=alt.Scale(domain=[0, ust], clamp=True)), y2="y1:Q",
            color=alt.Color("ad:N", title="Kararsızlık", legend=alt.Legend(orient="top"),
                            scale=alt.Scale(domain=list(bolge.ad), range=[YESIL, "#FAB005", TURUNCU, KIRMIZI]))),
        alt.Chart(d).mark_area(color=TURUNCU, opacity=0.35, line={"color": TURUNCU}).encode(
            x, alt.Y("cape:Q", title="CAPE (J/kg)", scale=alt.Scale(domain=[0, ust], clamp=True))),
        alt.Chart(pd.DataFrame({"time": [secili]})).mark_rule(color=MAVI, strokeWidth=2).encode(x),
        alt.Chart(d).mark_point(opacity=0, size=200).encode(
            x, y="cape:Q", tooltip=[alt.Tooltip("time:T", title="Zaman", format=SAAT),
                                    alt.Tooltip("cape:Q", title="CAPE J/kg", format=".0f"),
                                    alt.Tooltip("precipitation_probability:Q", title="Yağış olasılığı %")]
        ).add_params(sec),
    ).properties(height=200)


# ----------------------------------------------------------------- deniz ve balıkçılık
def _x_gun():
    return alt.X("time:T", title=None, axis=alt.Axis(format="%d.%m", tickCount="day", labelFlush=False))


def guvenlik_seridi(s, d, hava, adlar, renkler):
    """Saat saat denize çıkış durumu: genel + dalga + rüzgâr + görüş satırları."""
    satirlar = {"genel": "Genel", "dalga": "Dalga", "ruzgar": "Rüzgâr", "gorus": "Görüş"}
    b = s[list(satirlar)].reset_index().melt(id_vars="time", var_name="kod", value_name="seviye")
    b["satir"] = b.kod.map(satirlar)
    b["durum"] = b.seviye.map(dict(enumerate(adlar)))
    b["son"] = b.time + pd.Timedelta(hours=1)
    ek = pd.DataFrame({"time": d.index, "dalga_m": d.wave_height.values, "periyot": d.wave_period.values,
                       "hamle": hava.wind_gusts_10m.reindex(d.index).values,
                       "yon": hava.wind_direction_10m.reindex(d.index).map(yon_adi).values,
                       "gorus_km": hava.visibility.reindex(d.index).values / 1000,
                       "kara": np.where(s.kara_ruzgari.values, "Evet: tekneyi açığa iter", "Hayır")})
    b = b.merge(ek, on="time")
    return alt.Chart(b).mark_rect(stroke="white", strokeWidth=0.4).encode(
        _x_gun(), x2="son:T",
        y=alt.Y("satir:N", title=None, sort=list(satirlar.values()), axis=alt.Axis(labelFontWeight=500)),
        color=alt.Color("durum:N", title=None, legend=alt.Legend(orient="top"),
                        scale=alt.Scale(domain=adlar, range=renkler)),
        opacity=alt.condition(alt.datum.satir == "Genel", alt.value(1), alt.value(0.75)),
        tooltip=[alt.Tooltip("time:T", title="Saat", format=SAAT), alt.Tooltip("satir:N", title="Ölçüt"),
                 alt.Tooltip("durum:N", title="Durum"), alt.Tooltip("dalga_m:Q", title="Dalga m", format=".1f"),
                 alt.Tooltip("periyot:Q", title="Periyot sn", format=".1f"),
                 alt.Tooltip("hamle:Q", title="Hamle km/s", format=".0f"), alt.Tooltip("yon:N", title="Rüzgâr yönü"),
                 alt.Tooltip("gorus_km:Q", title="Görüş km", format=".1f"),
                 alt.Tooltip("kara:N", title="Kara rüzgârı")],
    ).properties(height=150)


def dalga_grafigi(d):
    x = _x_gun()
    ser = {"wave_height": "Toplam (belirgin)", "wind_wave_height": "Rüzgâr dalgası", "swell_wave_height": "Soluğan"}
    u = d[list(ser)].reset_index().melt(id_vars="time", var_name="kod", value_name="m")
    u["seri"] = u.kod.map(ser)
    ok = d.iloc[::4].reset_index()
    ok["gidis"] = (ok.wave_direction + 180) % 360
    esik = pd.DataFrame({"y": [0.5, 1, 2], "e": ["0,5 m: dikkat", "1 m: küçük tekne için riskli", "2 m: tehlikeli"]})
    hover = alt.selection_point(fields=["time"], nearest=True, on="pointerover", empty=False, clear="pointerout")
    genis = d.reset_index()
    genis["yon"] = genis.wave_direction.map(yon_adi)
    genis["en_buyuk"] = genis.wave_height * 1.9
    ipucu = [alt.Tooltip("time:T", title="Zaman", format=SAAT),
             alt.Tooltip("wave_height:Q", title="Belirgin dalga m", format=".2f"),
             alt.Tooltip("en_buyuk:Q", title="Olası en büyük tek dalga m", format=".1f"),
             alt.Tooltip("wave_period:Q", title="Periyot sn", format=".1f"),
             alt.Tooltip("wind_wave_height:Q", title="Rüzgâr dalgası m", format=".2f"),
             alt.Tooltip("swell_wave_height:Q", title="Soluğan m", format=".2f"),
             alt.Tooltip("yon:N", title="Dalgaların geldiği yön")]
    return alt.layer(
        alt.Chart(esik).mark_rule(strokeDash=[4, 4], opacity=0.6).encode(
            y="y:Q", color=alt.Color("e:N", title=None, legend=alt.Legend(orient="bottom"),
                                     scale=alt.Scale(range=["#FAB005", "#F76707", "#E03131"]))),
        alt.Chart(u).mark_line(strokeWidth=2).encode(
            x, alt.Y("m:Q", title="Dalga yüksekliği (m)", scale=alt.Scale(domainMin=0)),
            strokeDash=alt.StrokeDash("seri:N", title=None, legend=alt.Legend(orient="top"),
                                      scale=alt.Scale(domain=list(ser.values()), range=[[1, 0], [5, 3], [1, 3]])),
            color=alt.value(MAVI), detail="seri:N",
            strokeWidth=alt.condition(alt.datum.seri == "Toplam (belirgin)", alt.value(3), alt.value(1.5))),
        alt.Chart(ok).mark_point(shape="arrow", filled=True, size=90, color=TURUNCU).encode(
            x, y="wave_height:Q", angle=alt.Angle("gidis:Q", scale=alt.Scale(domain=[0, 360], range=[0, 360]))),
        alt.Chart(genis).mark_rule(color=GRI, strokeDash=[3, 3]).encode(x, tooltip=ipucu).transform_filter(hover),
        alt.Chart(genis).mark_point(opacity=0).encode(x).add_params(hover),
    ).resolve_scale(color="independent").properties(height=280)


def balik_grafigi(g, guvenli, gunluk):
    """Balıkçı göstergesi; güvenli olmayan saatler gri, gün doğumu/batımı dikey çizgi."""
    d = g.reset_index()
    d["son"] = d.time + pd.Timedelta(hours=1)
    d["durum"] = np.where(guvenli.reindex(g.index).values, "Denize çıkılabilir", "Deniz uygun değil")
    gb = gunluk.reset_index()
    olay = pd.concat([pd.DataFrame({"t": gb.sunrise, "e": "Gün doğumu"}),
                      pd.DataFrame({"t": gb.sunset, "e": "Gün batımı"})])
    olay = olay[(olay.t >= g.index[0]) & (olay.t <= g.index[-1])]
    ipucu = [alt.Tooltip("time:T", title="Saat", format=SAAT), alt.Tooltip("toplam:Q", title="Gösterge", format=".0f"),
             alt.Tooltip("alacakaranlik:Q", title="Alacakaranlık", format=".0f"),
             alt.Tooltip("ay_konumu:Q", title="Ay konumu", format=".0f"),
             alt.Tooltip("ay_evresi:Q", title="Ay evresi", format=".0f"),
             alt.Tooltip("basinc:Q", title="Basınç eğilimi", format=".0f"),
             alt.Tooltip("dp:Q", title="3 saatlik basınç değişimi hPa", format="+.1f"),
             alt.Tooltip("ruzgar:Q", title="Rüzgâr", format=".0f"), alt.Tooltip("durum:N", title="Deniz")]
    return alt.layer(
        alt.Chart(d).mark_rect().encode(
            _x_gun(), x2="son:T", y=alt.Y("toplam:Q", title="Gösterge (0–100)", scale=alt.Scale(domain=[0, 100])),
            y2=alt.Y2Datum(0),
            color=alt.Color("durum:N", title=None, legend=alt.Legend(orient="top"),
                            scale=alt.Scale(domain=["Denize çıkılabilir", "Deniz uygun değil"],
                                            range=["#12B886", "#ADB5BD"])),
            opacity=alt.Opacity("toplam:Q", legend=None, scale=alt.Scale(domain=[0, 100], range=[0.25, 1])),
            tooltip=ipucu),
        alt.Chart(olay).mark_rule(strokeDash=[2, 3], color=TURUNCU, opacity=0.8).encode(
            x="t:T", tooltip=[alt.Tooltip("e:N", title=""), alt.Tooltip("t:T", title="Saat", format=SAAT)]),
    ).properties(height=230)


def basit_seri(s: pd.Series, baslik, birim, renk, sifir=False):
    d = s.rename("v").reset_index()
    return alt.Chart(d).mark_area(color=renk, opacity=0.15, line={"color": renk, "strokeWidth": 2}).encode(
        _x_gun(), alt.Y("v:Q", title=f"{baslik} ({birim})", scale=alt.Scale(zero=sifir)),
        tooltip=[alt.Tooltip("time:T", title="Zaman", format=SAAT), alt.Tooltip("v:Q", title=baslik, format=".2f")],
    ).properties(height=200)


# ----------------------------------------------------------------- tahmin doğrulaması
def dogrulama_cizgisi(df, gercek, tahminler, birim, bar=False, gercek_ad="Gerçekleşen"):
    """Gerçekleşen (kalın) ve farklı günler önce yapılmış tahminler (ince) aynı grafikte."""
    sutunlar = {gercek: gercek_ad} | tahminler
    d = df[list(sutunlar)].reset_index().melt(id_vars="time", var_name="kod", value_name="deger")
    d["seri"] = d.kod.map(sutunlar)
    adlar = list(sutunlar.values())
    renkler = [_murekkep(), "#1C7ED6", "#F08C00", "#E03131", "#7048E8", "#12B886", "#868E96", "#E64980"][:len(adlar)]
    hover = alt.selection_point(fields=["time"], nearest=True, on="pointerover", empty=False, clear="pointerout")
    genis = df[list(sutunlar)].rename(columns=sutunlar).reset_index()
    genis.columns = ["time"] + [f"s{i}" for i in range(len(adlar))]
    ipucu = [alt.Tooltip("time:T", title="Zaman", format=SAAT)] + [
        alt.Tooltip(f"s{i}:Q", title=a, format=".1f") for i, a in enumerate(adlar)]
    secim = alt.selection_point(fields=["seri"], bind="legend")
    x = alt.X("time:T", title=None, axis=alt.Axis(format="%d.%m", tickCount="day"))
    cizgi = alt.Chart(d).mark_line(interpolate="monotone").encode(
        x, alt.Y("deger:Q", title=birim, scale=alt.Scale(zero=bar)),
        alt.Color("seri:N", title="Tıkla: vurgula", scale=alt.Scale(domain=adlar, range=renkler),
                  # tek satır gösterge dar sütunda taşıp kesiliyordu ("1 gün önce y…"): iki sütuna sarılır
                  legend=alt.Legend(orient="top", columns=2, labelLimit=150)),
        strokeWidth=alt.condition(alt.datum.seri == gercek_ad, alt.value(3), alt.value(1.6)),
        opacity=alt.condition(secim, alt.value(1), alt.value(0.12)),
    ).add_params(secim)
    return alt.layer(
        cizgi,
        alt.Chart(genis).mark_rule(color=GRI, strokeDash=[3, 3]).encode(x, tooltip=ipucu).transform_filter(hover),
        alt.Chart(genis).mark_point(opacity=0).encode(x).add_params(hover),
    ).properties(height=340)


def hata_cubugu(ozet, birim):
    """Kaç gün önceden yapılan tahminin ortalama mutlak hatası ve sapması."""
    d = ozet.reset_index()
    return alt.layer(
        alt.Chart(d).mark_bar(cornerRadiusTopLeft=4, cornerRadiusTopRight=4).encode(
            alt.X("gun:O", title="Kaç gün önce", axis=alt.Axis(labelAngle=0)),
            alt.Y("mae:Q", title=f"Ortalama mutlak hata ({birim})"),
            color=alt.Color("mae:Q", legend=None, scale=alt.Scale(range=["#B2F2BB", "#E03131"])),
            tooltip=[alt.Tooltip("gun:O", title="Gün önce"), alt.Tooltip("mae:Q", title="Ortalama hata", format=".2f"),
                     alt.Tooltip("sapma:Q", title="Sapma (+: fazla tahmin)", format="+.2f"),
                     alt.Tooltip("isabet:Q", title=f"İsabet oranı %", format=".0f")]),
        alt.Chart(d).mark_text(dy=-8, fontSize=12, fontWeight=600, color=GRI).encode(
            x="gun:O", y="mae:Q", text=alt.Text("mae:Q", format=".1f")),
    ).properties(height=260)



def siralama_grafigi(t, birim="°C"):
    """Modellerin ortalama mutlak hatası ve %90 güven aralığı; renk, birbirinden ayırt edilemeyen grupları gösterir."""
    d = t.reset_index(names="kod")
    d["grup_ad"] = np.where(d.grup == 1, "En iyi grup", "Grup " + d.grup.astype(str))
    d["aralik"] = d.alt.map("{:.2f}".format) + "–" + d.ust.map("{:.2f}".format)
    gruplar = list(dict.fromkeys(d.grup_ad))
    renkler = [YESIL, MAVI, LACIVERT, MOR, TURUNCU, KIRMIZI, GRI, KAHVE][:len(gruplar)]
    y = alt.Y("model:N", sort=list(d.model), title=None, axis=alt.Axis(labelFontSize=12.5, labelFontWeight=600))
    renk = alt.Color("grup_ad:N", title=None, scale=alt.Scale(domain=gruplar, range=renkler),
                     legend=alt.Legend(orient="top"))
    ipucu = [alt.Tooltip("model:N", title="Model"), alt.Tooltip("grup_ad:N", title="Grup"),
             alt.Tooltip("MAE:Q", title=f"Ortalama mutlak hata ({birim})", format=".2f"),
             alt.Tooltip("aralik:N", title="%90 güven aralığı"),
             alt.Tooltip("RMSE:Q", format=".2f"), alt.Tooltip("Bias:Q", title="Sapma", format="+.2f"),
             alt.Tooltip("N:Q", title="Karşılaştırılan saat")]
    return alt.layer(
        alt.Chart(d).mark_rule(strokeWidth=5, opacity=0.35, strokeCap="round").encode(
            alt.X("alt:Q", title=f"Ortalama mutlak hata ({birim}) · çizgi: %90 güven aralığı",
                  scale=alt.Scale(zero=False, nice=True)), x2="ust:Q", y=y, color=renk, tooltip=ipucu),
        alt.Chart(d).mark_point(filled=True, size=140, opacity=1).encode(x="MAE:Q", y=y, color=renk, tooltip=ipucu),
        alt.Chart(d).mark_text(dx=0, dy=-13, fontSize=11.5, fontWeight=600, color=GRI).encode(
            x="MAE:Q", y=y, text=alt.Text("MAE:Q", format=".2f")),
    ).properties(height=46 * len(d) + 40)

# ----------------------------------------------------------------- iklim ve geçmiş
SERIT = ["#08306B", "#08519C", "#2171B5", "#4292C6", "#6BAED6", "#9ECAE1", "#C6DBEF", "#DEEBF7",
         "#FEE0D2", "#FCBBA1", "#FC9272", "#FB6A4A", "#EF3B2C", "#CB181D", "#A50F15", "#67000D"]


def normal_bandi(d, bugun):
    """Son günler ve önümüzdeki 10 gün: gerçekleşen/tahmin en yüksek sıcaklık, 1991–2020 normal bandı içinde."""
    d = d.reset_index()
    d["tur"] = np.where(d.time > bugun, "Tahmin", "Gerçekleşen")
    d["sapma"] = d.temperature_2m_max - d.max_ort
    x = alt.X("time:T", title=None, axis=alt.Axis(format="%d.%m", tickCount=10))
    ipucu = [alt.Tooltip("time:T", title="Gün", format="%d.%m.%Y"), alt.Tooltip("tur:N", title=""),
             alt.Tooltip("temperature_2m_max:Q", title="En yüksek °C", format=".1f"),
             alt.Tooltip("max_ort:Q", title="Normali °C", format=".1f"),
             alt.Tooltip("sapma:Q", title="Normalden fark °C", format="+.1f"),
             alt.Tooltip("max_p10:Q", title="Normal aralık alt (%10)", format=".1f"),
             alt.Tooltip("max_p90:Q", title="Normal aralık üst (%90)", format=".1f")]
    return alt.layer(
        alt.Chart(d).mark_area(color=GRI, opacity=0.2).encode(x, y=alt.Y("max_p10:Q", title="En yüksek sıcaklık (°C)",
                                                                           scale=alt.Scale(zero=False)), y2="max_p90:Q"),
        alt.Chart(d).mark_line(color=GRI, strokeDash=[4, 3]).encode(x, y="max_ort:Q"),
        alt.Chart(d).mark_rule(color=GRI, opacity=0.6).encode(x, y="max_ort:Q", y2="temperature_2m_max:Q"),
        alt.Chart(d).mark_line(color=KIRMIZI, strokeWidth=2.5, point=alt.OverlayMarkDef(size=36, filled=True, color=KIRMIZI)).encode(
            x, y="temperature_2m_max:Q",
            strokeDash=alt.StrokeDash("tur:N", title=None, legend=alt.Legend(orient="top"),
                                      scale=alt.Scale(domain=["Gerçekleşen", "Tahmin"], range=[[1, 0], [5, 3]])),
            tooltip=ipucu),
        alt.Chart(pd.DataFrame({"t": [bugun]})).mark_rule(color=MAVI, strokeWidth=1.5).encode(x="t:T"),
    ).properties(height=320)


def ayni_gun_grafigi(g, bu_yil_deger, tarih_metni):
    """Her yıl aynı takvim gününün en yüksek sıcaklığı; eğilim çizgisi ve bu yılın değeri."""
    egim, kesim = np.polyfit(g.yil, g["max"], 1)
    g = g.assign(egilim=kesim + egim * g.yil, sapma=g["max"] - g["max"].mean())
    rekor = g.loc[g["max"].idxmax()]
    x = alt.X("yil:O", title=None, axis=alt.Axis(labelAngle=-90, values=[y for y in g.yil if y % 5 == 0]))
    katman = [
        alt.Chart(g).mark_bar(cornerRadiusTopLeft=2, cornerRadiusTopRight=2).encode(
            x, alt.Y("max:Q", title=f"{tarih_metni} en yüksek (°C)", scale=alt.Scale(zero=False)),
            color=alt.Color("sapma:Q", legend=None, scale=alt.Scale(scheme="redblue", reverse=True, domainMid=0)),
            tooltip=[alt.Tooltip("yil:O", title="Yıl"), alt.Tooltip("max:Q", title="En yüksek °C", format=".1f"),
                     alt.Tooltip("min:Q", title="En düşük °C", format=".1f")]),
        alt.Chart(g).mark_line(color=_murekkep(), strokeDash=[5, 3], strokeWidth=1.5).encode(x, y="egilim:Q"),
        alt.Chart(pd.DataFrame([rekor])).mark_text(dy=-10, fontSize=11, fontWeight=600, color=KIRMIZI).encode(
            x, y="max:Q", text=alt.value("rekor")),
    ]
    if bu_yil_deger is not None:
        b = pd.DataFrame({"yil": [g.yil.max() + 1], "max": [bu_yil_deger]})
        katman.append(alt.Chart(b).mark_point(shape="diamond", size=140, filled=True, color=TURUNCU).encode(
            alt.X("yil:O"), y="max:Q", tooltip=[alt.Tooltip("max:Q", title="Bu yıl (tahmin) °C", format=".1f")]))
    return alt.layer(*katman).properties(height=280), egim * 10


def isinma_seritleri(y):
    """Isınma şeritleri: her yıl bir şerit, renk o yılın ortalamasının 1991–2020 normalinden farkı."""
    d = y.reset_index().rename(columns={"time": "yil", "index": "yil"})
    d.columns = ["yil"] + list(d.columns[1:])
    sinir = max(1.0, d.sapma.abs().max())
    return alt.Chart(d).mark_rect().encode(
        alt.X("yil:O", title=None, axis=alt.Axis(labelAngle=0, values=[d.yil.min(), d.yil.max()], ticks=False,
                                                  domain=False)),
        color=alt.Color("sapma:Q", legend=None, scale=alt.Scale(domain=[-sinir, sinir], range=SERIT)),
        tooltip=[alt.Tooltip("yil:O", title="Yıl"), alt.Tooltip("ort:Q", title="Yıllık ortalama °C", format=".2f"),
                 alt.Tooltip("sapma:Q", title="Normalden fark °C", format="+.2f")],
    ).properties(height=110)


def aylik_yagis_grafigi(a, ay_adlari):
    d = a.reset_index().melt(id_vars="ay", var_name="seri", value_name="mm")
    d["seri"] = d.seri.map({"normal": "Normal (1991–2020)", "bu_yil": "Bu yıl"})
    d["ay_ad"] = d.ay.map(dict(enumerate(ay_adlari, 1)))
    return alt.Chart(d).mark_bar(cornerRadiusTopLeft=3, cornerRadiusTopRight=3).encode(
        alt.X("ay_ad:N", sort=ay_adlari, title=None, axis=alt.Axis(labelAngle=0)),
        alt.Y("mm:Q", title="Aylık yağış (mm)"), xOffset=alt.XOffset("seri:N", sort=["Normal (1991–2020)", "Bu yıl"]),
        color=alt.Color("seri:N", title=None, legend=alt.Legend(orient="top"),
                        scale=alt.Scale(domain=["Normal (1991–2020)", "Bu yıl"], range=["#ADB5BD", MAVI])),
        tooltip=[alt.Tooltip("ay_ad:N", title="Ay"), alt.Tooltip("seri:N", title=""),
                 alt.Tooltip("mm:Q", title="mm", format=".0f")],
    ).properties(height=260)


# ----------------------------------------------------------------- Genel bakış: önümüzdeki 24 saat (4 grafik)
# Açık yeşil kart zemini üzerinde çizilir (her iki temada aynı); renkler renk körlüğü denetiminden geçti.
_K_ZEMIN, _K_METIN, _K_IKINCI = "#DCE7C7", "#1C2829", "#3F5547"
_S1, _S2, _S3, _K_ESIK = "#2E6B3A", "#2A6FB0", "#B2602A", "#B5352B"


def _kart_ayar(c, yukseklik=210):
    ozellik = {"height": yukseklik, "width": "container"} if yukseklik else {}
    return c.properties(background="transparent", **ozellik).configure_view(
        stroke=None).configure_axis(
        labelColor=_K_IKINCI, titleColor=_K_IKINCI, labelFont="Space Mono, monospace", labelFontSize=11, titleFontSize=11,
        titleFont="Inter, sans-serif", titleFontWeight=500, gridColor="#1C2829", gridOpacity=0.13, domainColor="#1C2829",
        domainOpacity=0.25, tickColor="#1C2829", tickOpacity=0.25).configure_legend(
        labelColor=_K_METIN, labelFont="Inter, sans-serif", labelFontSize=12, orient="top", direction="horizontal",
        title=None, symbolStrokeWidth=2.5, padding=0, offset=6).configure_text(font="Space Mono, monospace").configure_title(font="Inter, sans-serif")


_X24_DEGERLER = []      # saatlik_dortlu doldurur: 3 saatte bir işaret (alt.DateTime)


def _x24(etiket=True):
    return alt.X("time:T", title=None, axis=alt.Axis(format="%H", labels=etiket, values=_X24_DEGERLER or alt.Undefined,
                                                     grid=False, labelFlush=False))


def _gece24(d):
    g = gece(d.set_index("time"))
    if g.empty:
        return []
    return [alt.Chart(g).mark_rect(color="#1C2829", opacity=0.07).encode(x="bas:T", x2="son:T")]


def _hover24(d, ipucu):
    """Fareyle gezinince en yakın saatte dikey çizgi ve o saatin değerleri."""
    h = alt.selection_point(nearest=True, on="pointerover", fields=["time"], empty=False, clear="pointerout")
    sec = alt.Chart(d).mark_rule(opacity=0, strokeWidth=18).encode(x="time:T").add_params(h)
    cizgi = alt.Chart(d).mark_rule(color=_K_METIN, strokeWidth=1.5).encode(
        x="time:T", tooltip=[alt.Tooltip("saat_ad:N", title="Saat")] + ipucu).transform_filter(h)
    return [sec, cizgi]


def _uc_etiket(d, alan, y, metin, dy=-12):
    return [alt.Chart(d).mark_point(filled=True, size=70, color=y, stroke=_K_ZEMIN, strokeWidth=2).encode(x="time:T", y=f"{alan}:Q"),
            alt.Chart(d).mark_text(dy=dy, fontSize=11, fontWeight="bold", color=_K_METIN).encode(
                x="time:T", y=f"{alan}:Q", text=metin)]


def saatlik_dortlu(df, gun_adlari):
    """24 saatlik sıcaklık, yağış, rüzgâr ve basınç grafikleri (her biri tek y ekseni). df: saatlik, ilk satır şimdi."""
    d = df.iloc[:24].reset_index()
    d["son"] = d["time"] + pd.Timedelta(hours=1)
    _X24_DEGERLER[:] = [alt.DateTime(year=t.year, month=t.month, date=t.day, hours=t.hour)
                        for t in d.time if t.hour % 3 == 0]
    d["saat_ad"] = [f"{gun_adlari[t.weekday()]} {t:%H}:00" for t in d.time]
    d["fark"] = d.temperature_2m - d.dew_point_2m
    d["yon_ad"] = [yon_adi(x) for x in d.wind_direction_10m]
    d["oran"] = d.wind_gusts_10m / d.wind_speed_10m.clip(lower=1)
    d["dp3"] = d.pressure_msl.diff(3)
    d["olas"] = d.precipitation_probability.fillna(0)
    d["tur"] = np.select([d.precipitation <= 0, d.precipitation < 0.5, d.precipitation < 4],
                         ["yağış yok", "çisenti", "hafif–orta"], "sağanak")
    gece_k = _gece24(d)

    # sıcaklık: üç çizgi + sis riski şeritleri + en yüksek/en düşük
    uzun = d.melt(id_vars=["time"], value_vars=["temperature_2m", "dew_point_2m", "apparent_temperature"],
                  var_name="kod", value_name="deger")
    uzun["seri"] = uzun.kod.map({"temperature_2m": "Sıcaklık", "dew_point_2m": "Çiy noktası",
                                 "apparent_temperature": "Hissedilen"})
    sira = ["Sıcaklık", "Çiy noktası", "Hissedilen"]
    lo = float(np.floor(min(d.dew_point_2m.min(), d.apparent_temperature.min())) - 1)
    hi = float(np.ceil(max(d.temperature_2m.max(), d.apparent_temperature.max())) + 1)
    y = alt.Y("deger:Q", title="°C", scale=alt.Scale(domain=[lo, hi], nice=False))
    sis = d[d.fark <= 2]
    sis_k = [alt.Chart(sis).mark_rect(color="#F1D24E", opacity=0.45).encode(x="time:T", x2="son:T")] if not sis.empty else []
    cizgiler = alt.Chart(uzun).mark_line(strokeWidth=2.2, strokeCap="round").encode(
        x=_x24(), y=y,
        color=alt.Color("seri:N", scale=alt.Scale(domain=sira, range=[_S1, _S2, _S3]), sort=sira, legend=alt.Legend(symbolType="stroke")),
        strokeDash=alt.StrokeDash("seri:N", scale=alt.Scale(domain=sira, range=[[1, 0], [1, 5], [6, 4]]), sort=sira, legend=None))
    uc = d.loc[[d.temperature_2m.idxmax(), d.temperature_2m.idxmin()]].assign(
        yazi=lambda x: [f"en yüksek {x.temperature_2m.iloc[0]:.0f}°", f"en düşük {x.temperature_2m.iloc[1]:.0f}°"])
    sicaklik = _kart_ayar(alt.layer(*gece_k, *sis_k, cizgiler,
                                    alt.Chart(uc).mark_point(filled=True, size=70, color=_S1, stroke=_K_ZEMIN, strokeWidth=2).encode(x="time:T", y=alt.Y("temperature_2m:Q", scale=alt.Scale(domain=[lo, hi]))),
                                    alt.Chart(uc).mark_text(dy=-13, fontSize=11, fontWeight="bold", color=_K_METIN).encode(x="time:T", y="temperature_2m:Q", text="yazi:N"),
                                    *_hover24(d, [alt.Tooltip("temperature_2m:Q", title="Sıcaklık (°C)", format=".0f"),
                                                  alt.Tooltip("apparent_temperature:Q", title="Hissedilen (°C)", format=".0f"),
                                                  alt.Tooltip("dew_point_2m:Q", title="Çiy noktası (°C)", format=".0f"),
                                                  alt.Tooltip("fark:Q", title="Doymaya (°C)", format=".1f")])))

    # yağış: saatlik miktar çubukları; altta aynı grafiğin içinde olasılık şeridi (sıfırın altındaki bant)
    rmax = max(4.0, float(d.precipitation.max()) * 1.15)
    bant = rmax * 0.16                                   # şeridin yüksekliği (mm biriminde, eksende gösterilmez)
    yr = alt.Y("precipitation:Q", title="mm", scale=alt.Scale(domain=[-bant * 1.25, rmax], nice=False),
               axis=alt.Axis(values=list(range(0, int(rmax) + 1))))
    cubuk = alt.Chart(d[d.precipitation > 0]).mark_rect(color=_S1, cornerRadiusTopLeft=3, cornerRadiusTopRight=3,
                                                         stroke=_K_ZEMIN, strokeWidth=2).encode(x=_x24(), x2="son:T", y=yr, y2=alt.datum(0))
    en = d.loc[[d.precipitation.idxmax()]].assign(yazi=lambda x: [f"{x.precipitation.iloc[0]:.1f} mm".replace(".", ",")])
    d["olas_yazi"] = [f"%{o:.0f}" if i % 3 == 0 else "" for i, o in enumerate(d.olas)]
    d["koyu_mu"] = d.olas >= 55
    d["b_ust"], d["b_alt"], d["b_orta"] = -bant * 0.2, -bant * 1.2, -bant * 0.7
    d["orta"] = d.time + pd.Timedelta(minutes=30)
    yagis = _kart_ayar(alt.layer(
        *gece_k,
        alt.Chart(pd.DataFrame({"y": [0]})).mark_rule(color=_K_METIN, opacity=0.3).encode(y="y:Q"),
        cubuk,
        alt.Chart(en[en.precipitation > 0]).mark_text(dy=-8, fontSize=11, fontWeight="bold", color=_K_METIN).encode(
            x="orta:T", y="precipitation:Q", text="yazi:N"),
        alt.Chart(d).mark_rect(stroke=_K_ZEMIN, strokeWidth=2, cornerRadius=3).encode(
            x="time:T", x2="son:T", y=alt.Y("b_alt:Q"), y2="b_ust:Q",
            color=alt.Color("olas:Q", scale=alt.Scale(domain=[0, 100], range=["#EEF3E3", _S1]),
                            legend=alt.Legend(title="Yağış olasılığı (%)", orient="top", gradientLength=120, gradientThickness=8,
                                              titleFontSize=11, titleColor=_K_IKINCI, titleFont="Inter, sans-serif",
                                              direction="horizontal", titleOrient="left"))),
        alt.Chart(d).mark_text(fontSize=9).encode(
            x="orta:T", y="b_orta:Q", text="olas_yazi:N",
            color=alt.condition("datum.koyu_mu", alt.value("#F3F7EF"), alt.value(_K_METIN))),
        *_hover24(d, [alt.Tooltip("precipitation:Q", title="Miktar (mm)", format=".1f"),
                      alt.Tooltip("olas:Q", title="Olasılık (%)", format=".0f"),
                      alt.Tooltip("tur:N", title="Tür")])), 230)

    # rüzgâr: ortalama (alan + çizgi), hamle, 45 km/s eşiği, 3 saatte bir yön oku
    wmax = max(60.0, float(d.wind_gusts_10m.max()) * 1.1)
    yw = alt.Y("deger:Q", title="km/s", scale=alt.Scale(domain=[0, wmax], nice=False))
    wu = d.melt(id_vars=["time"], value_vars=["wind_speed_10m", "wind_gusts_10m"], var_name="kod", value_name="deger")
    wu["seri"] = wu.kod.map({"wind_speed_10m": "Ortalama", "wind_gusts_10m": "Hamle"})
    wsira = ["Ortalama", "Hamle"]
    oklar = d.iloc[::3].assign(aci=lambda x: (x.wind_direction_10m + 180) % 360, ust=wmax * 0.93)
    iH = d.wind_gusts_10m.idxmax()
    hm = d.loc[[iH]].assign(yazi=lambda x: [f"hamle {x.wind_gusts_10m.iloc[0]:.0f}"])
    ruzgar = _kart_ayar(alt.layer(
        *gece_k,
        alt.Chart(d).mark_area(color=_S1, opacity=0.22).encode(x=_x24(), y=alt.Y("wind_speed_10m:Q", scale=alt.Scale(domain=[0, wmax]), title="km/s")),
        alt.Chart(wu).mark_line(strokeWidth=2.2).encode(
            x=_x24(), y=yw, color=alt.Color("seri:N", scale=alt.Scale(domain=wsira, range=[_S1, _S2]), sort=wsira)),
        alt.Chart(pd.DataFrame({"y": [45]})).mark_rule(color=_K_ESIK, strokeDash=[6, 4], strokeWidth=1.5).encode(y="y:Q"),
        alt.Chart(pd.DataFrame({"y": [45], "t": [d.time.iloc[0]], "yazi": ["45 km/s: küçük tekne sınırı"]})).mark_text(
            align="left", dy=-7, fontSize=10, color=_K_ESIK, fontWeight="bold").encode(x="t:T", y="y:Q", text="yazi:N"),
        alt.Chart(oklar).mark_point(shape="wedge", size=150, filled=True, color=_K_METIN, opacity=0.85).encode(
            x="time:T", y="ust:Q", angle=alt.Angle("aci:Q", scale=None)),
        alt.Chart(hm).mark_point(filled=True, size=70, color=_S2, stroke=_K_ZEMIN, strokeWidth=2).encode(x="time:T", y="wind_gusts_10m:Q"),
        alt.Chart(hm).mark_text(dy=-12, fontSize=11, fontWeight="bold", color=_K_METIN).encode(x="time:T", y="wind_gusts_10m:Q", text="yazi:N"),
        *_hover24(d, [alt.Tooltip("wind_speed_10m:Q", title="Ortalama (km/s)", format=".0f"),
                      alt.Tooltip("wind_gusts_10m:Q", title="Hamle (km/s)", format=".0f"),
                      alt.Tooltip("yon_ad:N", title="Geldiği yön"),
                      alt.Tooltip("oran:Q", title="Hamle / ortalama", format=".1f")])))

    # basınç: alan + çizgi, dip ve son değer
    plo, phi = float(np.floor(d.pressure_msl.min() - 1.5)), float(np.ceil(d.pressure_msl.max() + 1.5))
    yp = alt.Y("pressure_msl:Q", title="hPa", scale=alt.Scale(domain=[plo, phi], nice=False), axis=alt.Axis(format=".0f"))
    uclar = d.loc[[d.pressure_msl.idxmin(), d.index[-1]]].assign(
        yazi=lambda x: [f"dip {x.pressure_msl.iloc[0]:.1f}".replace(".", ","), f"{x.pressure_msl.iloc[1]:.1f}".replace(".", ",")])
    basinc = _kart_ayar(alt.layer(
        *gece_k,
        alt.Chart(d).mark_area(color=_S1, opacity=0.12).encode(x=_x24(), y=yp, y2=alt.datum(plo)),
        alt.Chart(d).mark_line(color=_S1, strokeWidth=2.5).encode(x=_x24(), y=yp),
        alt.Chart(uclar).mark_point(filled=True, size=70, color=_S1, stroke=_K_ZEMIN, strokeWidth=2).encode(x="time:T", y="pressure_msl:Q"),
        alt.Chart(uclar).mark_text(dy=-12, fontSize=11, fontWeight="bold", color=_K_METIN, align="right", dx=4).encode(
            x="time:T", y="pressure_msl:Q", text="yazi:N"),
        *_hover24(d, [alt.Tooltip("pressure_msl:Q", title="Basınç (hPa)", format=".1f"),
                      alt.Tooltip("dp3:Q", title="3 saatte değişim (hPa)", format="+.1f")])))
    return {"sicaklik": sicaklik, "yagis": yagis, "ruzgar": ruzgar, "basinc": basinc, "veri": d}
