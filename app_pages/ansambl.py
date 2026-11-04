import streamlit as st

from hava import grafik, tasarim
from hava.arayuz import gun_sayisi, okuma_rehberi
from hava.veri import ansambl, konum
from hava.yorum import gun

MODELLER = {"ECMWF (51 üye)": "ecmwf_ifs025", "ECMWF AIFS yapay zekâ (51 üye)": "ecmwf_aifs025",
            "GFS (31 üye)": "gfs_seamless", "ICON (40 üye)": "icon_seamless"}
DEGISKENLER = {"Sıcaklık": ("temperature_2m", "°C"), "Yağış": ("precipitation", "mm"),
               "Rüzgâr": ("wind_speed_10m", "km/s")}

k = konum()
tasarim.baslik("Tahmin", "Ansambl: olası gelecekler",
               "Tek bir tahmin yerine onlarca olası senaryo. \"Yarın %60 yağmur\" ifadesi tam olarak buradan gelir: "
               "üyelerin %60'ı yağış veriyor demektir.", "tahmin")

c1, c2 = st.columns([2, 1.3], vertical_alignment="bottom")
model = MODELLER[c1.selectbox("Ansambl modeli", list(MODELLER), key="ens_model")]
ad = c2.segmented_control("Değişken", list(DEGISKENLER), default="Sıcaklık", key="ens_deg") or "Sıcaklık"
var, birim = DEGISKENLER[ad]
U = ansambl(k, model, var, gun_sayisi())

if var == "precipitation":
    esik = st.segmented_control("Eşik: günlük yağış en az", [1, 5, 10, 20], default=1, key="ens_esik",
                                format_func=lambda x: f"{x} mm") or 1
    # veri olmayan üyeler/günler "yağış yok" sayılmasın
    gunluk = U.resample("D").sum(min_count=1).dropna(how="all")
    olas = (gunluk >= esik).where(gunluk.notna()).mean(axis=1) * 100
    sol, sag = st.columns(2, gap="large")
    with sol:
        st.markdown(f"**Günlük {esik} mm'den fazla yağış olasılığı**")
        st.altair_chart(grafik.olasilik_cubuk(olas, esik), alt="Günlük yağış olasılığı")
    with sag:
        st.markdown("**Üyelere göre günlük yağış dağılımı**")
        st.altair_chart(grafik.kutu(gunluk), alt="Ansambl üyelerinin günlük yağış dağılımı")
    en = olas.idxmax()
    st.info(f"En olası yağışlı gün **{gun(en)}**: üyelerin %{olas.max():.0f}'i {esik} mm üstü yağış veriyor. "
            f"O gün ortanca tahmin {gunluk.loc[en].median():.1f} mm, en ıslak senaryo "
            f"{gunluk.loc[en].max():.0f} mm.", icon=":material/water_drop:")
    okuma_rehberi([
        ("Eşiği değiştir", "1 mm \"ıslanır mıyım?\", 10 mm \"ciddi yağış\", 20 mm \"su baskını olabilir mi?\" "
         "sorusudur. Eşik yükseldikçe olasılığın nasıl düştüğüne bak."),
        ("Kutu grafiği", "Kutu üyelerin ortadaki yarısını, çizgi ortancayı, uçlar en kurak ve en ıslak senaryoyu "
         "gösterir. Uzun bıyıklı ama ortancası düşük kutular: çoğu üye az yağış veriyor, birkaçı çok."),
        ("Yağış en zor değişkendir", "Yağış küçük ölçekli süreçlere bağlıdır; özellikle yaz sağanaklarında yerini "
         "ve miktarını tutturmak zordur. Olasılık bu yüzden tek sayıdan daha dürüsttür."),
    ], baslik="Yağış ansamblı nasıl okunur?")
else:
    st.altair_chart(grafik.spagetti(U, f"{ad} ({birim})"), alt=f"Ansambl {ad.lower()} tahmini")
    bant = (U.quantile(0.9, axis=1) - U.quantile(0.1, axis=1)).resample("D").mean()
    m = st.container(key="kartlar_ansambl_1").columns(3)
    m[0].metric("Kullanılan üye", f"{U.shape[1]}", border=True)
    m[1].metric("İlk gün belirsizlik", f"± {bant.iloc[0] / 2:.1f} {birim}", border=True,
                help="%10–%90 aralığının yarısı.")
    m[2].metric("Son gün belirsizlik", f"± {bant.iloc[-1] / 2:.1f} {birim}", border=True,
                delta=f"{bant.iloc[-1] / max(bant.iloc[0], 0.1):.1f} kat", delta_color="inverse",
                chart_data=bant.round(2).tolist(), chart_type="area")
    okuma_rehberi([
        ("Gri çizgiler", "Her biri bir ansambl üyesi, yani olası bir gelecek. Başlangıç gözlemleri ölçüm "
         "hataları kadar hafifçe değiştirilip model yeniden çalıştırılmıştır."),
        ("Mavi bant", "Üyelerin %80'inin kaldığı aralık. Gerçekleşen değerin bu bandın içinde kalması beklenir."),
        ("Bandın genişlediği an", "Tahminin güvenilirliğinin düştüğü andır. O tarihten sonra tek bir sayıya "
         "değil eğilime bak (\"soğuyor mu, ısınıyor mu?\")."),
        ("İkiye ayrılan spagetti", "Çizgiler iki demete ayrılıyorsa atmosfer iki farklı senaryo arasında "
         "kararsızdır (ör. bir sistemin kuzeyden mi güneyden mi geçeceği). Ortanca bu durumda iki senaryonun "
         "hiçbirini temsil etmeyebilir!"),
    ], baslik="Spagetti grafiği nasıl okunur?")
