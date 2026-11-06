import html

import streamlit as st

from hava import tasarim
from hava.canli import UYDU_KATMAN, canli_harita
from hava.veri import konum

k = konum()
tasarim.baslik("Canlı gözlem", "Canlı radar ve uydu",
               "Gerçek gözlemler: son iki saatin yağış radarı ve Meteosat uydu görüntüsü, üstünde modelin şu anki rüzgâr "
               "akışı. Animasyon tarayıcında döner. Haritaya tıklarsan orası uygulamanın konumu olur.", "canli")

c1, c2 = st.columns([1.4, 1], vertical_alignment="bottom")
secili = c1.pills("Katmanlar", ["Radar", "Uydu", "Rüzgâr akışı"], selection_mode="multi",
                  default=["Radar", "Rüzgâr akışı"], key="canli_katman")
# Uydu kapalıyken seçim kutusu gösterilmez (telefonda boşuna yer kaplıyordu); seçim oturumda korunur
uydu_ad = (c2.selectbox("Uydu görüntüsü", list(UYDU_KATMAN), key="canli_uydu") if "Uydu" in secili
           else st.session_state.get("canli_uydu", list(UYDU_KATMAN)[0]))

tik = canli_harita(k, {"radar": "Radar" in secili, "uydu": "Uydu" in secili, "ruzgar": "Rüzgâr akışı" in secili},
                   UYDU_KATMAN[uydu_ad], koyu=st.context.theme.type == "dark")
if tik:
    st.session_state.harita_nokta = {"lat": round(tik["lat"], 3), "lon": round(tik["lon"], 3)}
    st.rerun()

# Kompakt bilgi kartları: tek cümlelik özet; "nelere bakmalı?" maddeleri istenince açılır (Meteogram rehberiyle aynı).
BILGI = [
    (":material/radar:", "Radar neyi gösterir?",
     "Yağmur damlası ve kar tanelerinden geri yansıyan sinyal. Renk ne kadar sıcaksa (sarı → kırmızı → mor) yağış o kadar yoğun.",
     [("Hızlı büyüyen kırmızı hücreler", "Gök gürültülü sağanaktır."),
      ("Geniş, düzgün mavi alanlar", "Cephesel, uzun süren yağıştır."),
      ("Yağışın yönü ve hızı", "Animasyonda nereye ilerlediğine bak: bir saat sonra nerede olacağını kendin kestirebilirsin "
       "(meteorologların \"nowcasting\" dediği şey).")]),
    (":material/satellite_alt:", "Uydu neyi gösterir?",
     "Meteosat, 36.000 km yükseklikten 15 dakikada bir görüntü alır. Gündüz doğal renk, gece kızılötesi.",
     [("Parlak beyaz", "Kızılötesinde beyaz = soğuk = yüksek bulut tepesi; en parlakları kuleleşmiş fırtına bulutları."),
      ("Virgül biçimli bantlar", "Gelişmiş alçak basınç sistemleri; kuyruğu soğuk cepheyi gösterir."),
      ("Radarla birlikte oku", "Uydu denizleri ve sınır ötesini de görür; bulutun yağış verip vermediğini ise radar söyler.")]),
    (":material/air:", "Rüzgâr akışı neyi gösterir?",
     "Akan çizgiler modelin bu saat için hesapladığı 10 m rüzgârı (gözlem değil). Renk hızı gösterir.",
     [("Dönen akış", "Basınç merkezleri: alçak basınç etrafında saat yönünün tersine dönüş."),
      ("Karşılaşan akışlar", "Yakınsama hatlarında hava yükselir; radarda yağış bandını çoğu zaman tam bu hatta görürsün."),
      ("Dağlar ve boğazlar", "Rüzgârın yerel engellerle nasıl yön değiştirdiğine bak.")]),
]
for kol, (ikon, baslik_, ozet_, maddeler) in zip(st.columns(3, gap="medium"), BILGI):
    with kol.container(border=True, height="stretch"):
        st.markdown(f"**{ikon} {baslik_}**  \n:gray[{ozet_}]")
        st.html('<div class="okuma-liste okuma-kart">' + "".join(
            f'<details class="okuma"><summary><b>{i}</b>{html.escape(b)}</summary><p>{html.escape(m)}</p></details>'
            for i, (b, m) in enumerate(maddeler, 1)) + "</div>")

st.caption("Kaynaklar: radar [RainViewer](https://www.rainviewer.com) (gri gölgeli alanlarda radar kapsaması yok), uydu "
           "[EUMETSAT](https://view.eumetsat.int) Meteosat MTG (yaklaşık 30–45 dk gecikmeli), rüzgâr Open-Meteo "
           "modelleri, altlık harita © OpenStreetMap katkıcıları, © CARTO.")
