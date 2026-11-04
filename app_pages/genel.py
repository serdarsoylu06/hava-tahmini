import pandas as pd
import streamlit as st

from hava import deniz, grafik, tasarim, zaman_seridi
from hava.arayuz import gun_sayisi, uyari_kartlari
from hava.veri import ansambl, durum, konum, simge, tahmin, yon_adi
from hava.yorum import SIRA, uyarilar

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

# ---------------------------------------------------------------- anlık durum
bugun = gunluk.iloc[0]
sol, sag = st.columns([1.1, 1], gap="medium")
with sol:
    tasarim.kahraman(
        " · ".join(x for x in (k["ad"], k["bolge"], f"{an:%d.%m %H:%M} yerel") if x), simdi["temperature_2m"],
        durum(simdi["weather_code"]), f"hissedilen {simdi['apparent_temperature']:.0f}°",
        [("Yüksek/düşük", f"{bugun.temperature_2m_max:.0f}° / {bugun.temperature_2m_min:.0f}°"),
         ("Yağış", f"%{bugun.precipitation_probability_max:.0f}"),
         ("Gün doğumu", f"{bugun.sunrise:%H:%M}"), ("Gün batımı", f"{bugun.sunset:%H:%M}")],
        int(simdi["weather_code"]), bool(simdi["is_day"]))
    st.page_link("app_pages/iklim.py", label="Mevsim normaliyle karşılaştır", icon=":material/history:")

with sag, st.container(key="kartlar_genel"):
    son3 = saatlik.pressure_msl.loc[:an].tail(4)
    egilim = son3.iloc[-1] - son3.iloc[0] if len(son3) > 1 else 0
    fark = simdi["temperature_2m"] - simdi["dew_point_2m"]
    m = st.columns(6)          # tek satır: CSS üçerli ya da ikişerli sarar
    m[0].metric("Rüzgâr", f"{simdi['wind_speed_10m']:.0f} km/s", f"{yon_adi(simdi['wind_direction_10m'])} yönünden",
                delta_color="off", delta_arrow="off",
                help="Rüzgâr adı, **geldiği** yöne göre verilir: poyraz kuzeydoğudan, lodos güneybatıdan eser.")
    m[1].metric("Hamle", f"{simdi['wind_gusts_10m']:.0f} km/s",
                f"ortalamanın {simdi['wind_gusts_10m'] / max(simdi['wind_speed_10m'], 1):.1f} katı",
                delta_color="off", delta_arrow="off",
                help="Hamle birkaç saniyelik en kuvvetli esintidir. Ortalamanın 2 katından fazlaysa hava "
                     "türbülanslıdır (sağanak, dağ etkisi).")
    m[2].metric("Nem", f"%{simdi['relative_humidity_2m']:.0f}", f"çiy noktası {simdi['dew_point_2m']:.0f}°",
                delta_color="off", delta_arrow="off",
                help=f"Sıcaklık ile çiy noktası arasındaki fark {fark:.1f}°. Fark 2°'nin altına inerse "
                     "hava doymaya yakındır: sis, çisenti veya alçak bulut beklenir. Konfor için çiy noktası "
                     "daha iyi ölçüttür; 18° üstü bunaltıcıdır.")
    m[3].metric("Basınç", f"{simdi['pressure_msl']:.0f} hPa", f"{egilim:+.1f} hPa / 3 saat", delta_color="off",
                chart_data=saatlik.pressure_msl.loc[an - pd.Timedelta(hours=12): an + pd.Timedelta(hours=24)].round(1).tolist(),
                chart_type="line",
                help="Deniz seviyesine indirgenmiş basınç. Tek başına değeri değil **eğilimi** önemlidir: "
                     "3 saatte 3 hPa'dan fazla düşüş kötüleşen havanın en güvenilir habercisidir. Çizgi: son 12 ve "
                     "önümüzdeki 24 saat.")
    m[4].metric("UV indeksi", f"{simdi['uv_index']:.0f}", f"bugün en fazla {bugun.uv_index_max:.0f}",
                delta_color="off", delta_arrow="off",
                help="0–2 düşük, 3–5 orta, 6–7 yüksek, 8–10 çok yüksek, 11+ aşırı. 3 ve üstünde öğle "
                     "saatlerinde güneş koruması önerilir.")
    m[5].metric("Görüş", f"{simdi['visibility'] / 1000:.0f} km", f"bulut %{simdi['cloud_cover']:.0f}",
                delta_color="off", delta_arrow="off",
                help="1 km altı sis, 1–5 km pus/puslu hava sayılır. Model görüşü kaba bir tahmindir.")

# ---------------------------------------------------------------- saat saat zaman şeridi
# Sıcaklık, yağış, rüzgâr, basınç ve uyarılar aynı saat ekseninde; telefonda mini şerit + saat listesine döner.
tasarim.bolum("01", "Saat saat", f"Önümüzdeki {zaman_seridi.SAAT} saat")
zaman_seridi.zaman_seridi(ileri, k["ad"], koyu)

# ---------------------------------------------------------------- uyarılar
tasarim.bolum("02", "Nelere dikkat etmeli?", f"Önümüzdeki {gun_sayisi()} günün tahmini otomatik tarandı")
st.caption("Her kartın altında olayın neden önemli olduğunu ve hangi grafikte izleneceğini bulabilirsin.")
liste = uyarilar(donem, k["rakim"], guven.loc[guven.index < donem.index[-1]]) + deniz.uyarilar(k, gun_sayisi())
if any(u.seviye in ("tehlike", "dikkat") for u in liste):          # deniz uyarısı geldiyse "sakin" kartı düşer
    liste = [u for u in liste if u.seviye != "iyi"]
uyari_kartlari(sorted(liste, key=lambda u: SIRA[u.seviye]))

# ---------------------------------------------------------------- 10 gün
st.space("small")
tasarim.bolum("03", "10 günlük tahmin")
sol, sag = st.columns([1.4, 1], gap="large")
with sol:
    tasarim.on_gun_listesi(gunluk, guven)
with sag:
    st.caption("Çubuk o günün en düşük–en yüksek sıcaklık aralığıdır; renk sıcaklığa göre maviden kırmızıya "
               "döner. Mavi yüzde, %20 ve üstü yağış olasılığıdır. Bir güne gel: rüzgâr, UV ve **tahmin güveni** "
               "görünür; tümü aşağıdaki tabloda.")

with st.expander("Günlük ayrıntı tablosu", icon=":material/table_view:"):
    t = gunluk.reset_index()
    t["gun"] = [grafik.gunluk_etiket(x, t.time.iloc[0].date()) for x in t.time]
    t["durum"] = [f"{simge(c)} {durum(c)}" for c in t.weather_code]
    t["guven"] = guven.reindex(t.time).values
    st.dataframe(
        t[["gun", "durum", "temperature_2m_min", "temperature_2m_max", "precipitation_probability_max",
           "precipitation_sum", "snowfall_sum", "wind_gusts_10m_max", "uv_index_max", "guven"]],
        hide_index=True, alt="Günlük tahmin tablosu",
        column_config={
            "gun": "Gün", "durum": "Durum",
            "temperature_2m_min": st.column_config.NumberColumn("En düşük", format="%.0f °C"),
            "temperature_2m_max": st.column_config.NumberColumn("En yüksek", format="%.0f °C"),
            "precipitation_probability_max": st.column_config.ProgressColumn(
                "Yağış olasılığı", format="%d%%", min_value=0, max_value=100),
            "precipitation_sum": st.column_config.NumberColumn("Yağış", format="%.1f mm"),
            "snowfall_sum": st.column_config.NumberColumn("Kar", format="%.1f cm"),
            "wind_gusts_10m_max": st.column_config.NumberColumn("En kuvvetli hamle", format="%.0f km/s"),
            "uv_index_max": st.column_config.NumberColumn("UV", format="%.0f"),
            "guven": st.column_config.NumberColumn(
                "Belirsizlik", format="± %.1f °C",
                help="ECMWF ansamblının 51 üyesinden en yüksek sıcaklığın %10–%90 aralığı. "
                     "2 °C altı yüksek, 2–4 °C orta, 4 °C üstü düşük güven."),
        })
    st.caption("**Tahmin güveni nasıl hesaplanıyor?** ECMWF aynı tahmini 51 kez, başlangıç koşullarını hafifçe "
               "değiştirerek çalıştırır. Üyeler aynı sonucu veriyorsa güven yüksektir; birbirinden "
               "uzaklaşıyorsa o gün için tek bir sayıya değil aralığa bakmak gerekir.")
