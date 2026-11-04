"""Görsel tasarım ("AURA", Stitch referansı): atmosferik arka plan, cam kartlar, Space Grotesk başlıklar, Space Mono
ölçüm etiketleri; koyu temada elektrik camgöbeği, açık temada şafak paleti.
Renkler ve yazı tipleri .streamlit/config.toml'da; burada yalnızca temanın veremediği kart, başlık, kahraman kartı ve
mobil düzen stilleri var. Seçiciler mümkün olduğunca bizim verdiğimiz anahtarlara (.st-key-…) bağlanır."""
import html
import re

import streamlit as st

MONO = "'Space Mono', ui-monospace, monospace"
BASLIK = "'Space Grotesk', 'Inter', sans-serif"

# WMO hava kodu → Material Symbols simge adı (gündüz, gece)
_SIMGE = [((0,), "clear_day", "bedtime"), ((1, 2), "partly_cloudy_day", "partly_cloudy_night"),
          ((3,), "cloud", "cloud"), ((45, 48), "foggy", "foggy"), ((51, 53, 55, 56, 57), "rainy_light", "rainy_light"),
          ((61, 63, 66), "rainy", "rainy"), ((65, 67, 80, 81, 82), "rainy_heavy", "rainy_heavy"),
          ((71, 73, 75, 77, 85, 86), "weather_snowy", "weather_snowy"), ((95, 96, 99), "thunderstorm", "thunderstorm")]


def _renkler(koyu):
    """Koyu: AURA Weather. Açık: Sky-Sync Dawn. Yüzeyler yarı saydam (cam), arkalarındaki atmosferik zemin görünür."""
    if koyu:
        return {"zemin": "#0A0E18", "yuzey": "rgba(23, 27, 38, 0.72)", "yuzey2": "rgba(38, 42, 53, 0.6)",
                "cizgi": "rgba(255, 255, 255, 0.09)", "ince": "rgba(255, 255, 255, 0.06)",
                "isik": "inset 0 1px 0 0 rgba(255, 255, 255, 0.08)", "golge": "0 18px 40px -24px rgba(0, 0, 0, 0.7)",
                "soluk": "#9AA6AD", "ikinci": "#BCC9CD", "metin": "#DFE2F1",
                "vurgu": "#4CD7F6", "vurgu2": "#06B6D4", "sicak": "#FFB95F", "mavi": "#4CD7F6", "kuyu": "rgba(0, 0, 0, 0.28)",
                "sayi": "linear-gradient(135deg, #F0FBFF 0%, #A5EEFF 40%, #4CD7F6 75%, #06B6D4 100%)",
                "arka": ("radial-gradient(1100px 600px at 18% -8%, rgba(6, 182, 212, 0.16), transparent 60%),"
                         "radial-gradient(900px 520px at 92% 8%, rgba(99, 102, 241, 0.14), transparent 60%),"
                         "radial-gradient(800px 600px at 60% 105%, rgba(255, 185, 95, 0.07), transparent 60%),"
                         "linear-gradient(160deg, #0A0E1A 0%, #101A2E 45%, #0C1424 75%, #090D16 100%)")}
    return {"zemin": "#F8FAFC", "yuzey": "rgba(255, 255, 255, 0.72)", "yuzey2": "rgba(255, 255, 255, 0.55)",
            "cizgi": "rgba(255, 255, 255, 0.65)", "ince": "rgba(15, 23, 42, 0.07)",
            "isik": "inset 0 1px 1px 0 rgba(255, 255, 255, 0.9)",
            "golge": "0 8px 32px -4px rgba(106, 130, 251, 0.10), 0 2px 8px -2px rgba(253, 160, 133, 0.10)",
            "soluk": "#55657A", "ikinci": "#334155", "metin": "#0F172A",
            "vurgu": "#0284C7", "vurgu2": "#0EA5E9", "sicak": "#C2410C", "mavi": "#0284C7", "kuyu": "rgba(15, 23, 42, 0.04)",
            "sayi": "linear-gradient(135deg, #0C4A6E 0%, #0369A1 45%, #0EA5E9 80%, #FB7185 120%)",
            "arka": ("radial-gradient(900px 560px at 12% -6%, rgba(224, 242, 254, 0.95), transparent 62%),"
                     "radial-gradient(800px 520px at 95% 4%, rgba(251, 194, 235, 0.45), transparent 60%),"
                     "radial-gradient(900px 640px at 70% 110%, rgba(255, 237, 213, 0.9), transparent 62%),"
                     "linear-gradient(170deg, #F8FAFC 0%, #F5F8FF 50%, #FFF7ED 100%)")}


def buyuk(s):
    """Türkçe büyük harf: i → İ, ı → I (CSS text-transform sayfa dili İngilizce olduğu için yanlış çevirir)."""
    return s.replace("i", "İ").replace("ı", "I").upper()


def _metin(s):
    """Güvenli HTML: önce kaçışla, sonra yalnızca **kalın** işaretini çevir."""
    return re.sub(r"\*\*(.+?)\*\*", r"<strong>\1</strong>", html.escape(s))


def stil(koyu):
    r = _renkler(koyu)
    cam = (f"background: {r['yuzey']}; backdrop-filter: blur(20px) saturate(140%); "
           f"-webkit-backdrop-filter: blur(20px) saturate(140%); border: 1px solid {r['cizgi']}; "
           f"box-shadow: {r['isik']}, {r['golge']}; border-radius: 12px;")
    st.html(f"""<style>
@import url('https://fonts.googleapis.com/css2?family=Space+Mono:wght@400;700&family=Space+Grotesk:wght@500;600;700&display=swap');
@import url('https://fonts.googleapis.com/css2?family=Material+Symbols+Outlined:opsz,wght,FILL,GRAD@48,300,0,0&display=block');

/* atmosferik arka plan (Layer 0): sabit; içerik üstünde cam paneller kayar */
[data-testid="stApp"] {{ background: {r['arka']} !important; background-attachment: fixed !important; }}
[data-testid="stHeader"] {{ background: transparent !important; backdrop-filter: blur(16px); -webkit-backdrop-filter: blur(16px); }}
[data-testid="stSidebar"] > div:first-child {{ background: {r['yuzey']}; backdrop-filter: blur(24px); -webkit-backdrop-filter: blur(24px); }}
[data-testid="stBottomBlockContainer"], [data-testid="stMain"] {{ background: transparent !important; }}

/* sayfa başlığı ve bölüm başlıkları */
.pb {{ {cam} padding: clamp(16px, 2.6vw, 26px) clamp(18px, 3vw, 30px); }}
.pb-etiket, .bl-no, .k-etiket, .k-okuma-ad {{ font-family: {MONO}; letter-spacing: .08em; }}
.pb-etiket {{ font-size: 11.5px; color: {r['vurgu']}; font-weight: 700; }}
.pb h1 {{ font-family: {BASLIK}; font-weight: 700; margin: .3em 0 .25em; padding: 0; font-size: clamp(24px, 3.2vw, 34px);
          line-height: 1.15; letter-spacing: -.03em; color: {r['metin']}; }}
.pb p {{ margin: 0; max-width: 860px; color: {r['ikinci']}; font-size: clamp(13px, 1.5vw, 15px); line-height: 1.55; }}

.bl {{ display: flex; align-items: baseline; flex-wrap: wrap; gap: 4px 14px; border-bottom: 1px solid {r['ince']};
       padding-bottom: 10px; margin-top: 8px; }}
.bl-no {{ font-size: 12px; color: {r['vurgu']}; letter-spacing: .04em; font-weight: 700; }}
.bl h2 {{ font-family: {BASLIK}; margin: 0; padding: 0; font-size: 22px; font-weight: 600; letter-spacing: -.02em;
          color: {r['metin']}; }}
.bl span.bl-ac {{ font-family: {MONO}; font-size: 11px; letter-spacing: .04em; color: {r['soluk']}; }}
[data-testid="stHeading"] h1, [data-testid="stHeading"] h2, [data-testid="stHeading"] h3 {{ font-family: {BASLIK};
    letter-spacing: -.02em; }}

/* kahraman kartı: anlık durum */
.kahraman {{ {cam} padding: clamp(18px, 3vw, 30px); color: {r['metin']}; container-type: inline-size;
             position: relative; overflow: hidden; }}
.kahraman::before {{ content: ""; position: absolute; inset: auto -20% -60% 30%; height: 120%; pointer-events: none;
                     background: radial-gradient(closest-side, {r['vurgu2']}22, transparent 70%); }}
.k-etiket {{ display: inline-flex; align-items: center; gap: 8px; font-size: 11px; color: {r['ikinci']};
             background: {r['yuzey2']}; border: 1px solid {r['ince']}; border-radius: 999px; padding: 5px 12px; }}
.k-etiket::before {{ content: ""; width: 7px; height: 7px; border-radius: 50%; background: {r['vurgu']};
                     box-shadow: 0 0 0 3px {r['vurgu']}33; }}
.k-ust {{ position: relative; display: flex; align-items: flex-end; justify-content: space-between; gap: 16px; margin-top: 14px; }}
.k-sicak {{ font-family: {BASLIK}; font-weight: 700; font-size: clamp(76px, 13vw, 128px); line-height: .9;
            letter-spacing: -.06em; background: {r['sayi']}; -webkit-background-clip: text; background-clip: text;
            color: transparent; padding-right: .05em; }}
.k-durum {{ font-family: {BASLIK}; font-size: clamp(15px, 1.9vw, 19px); font-weight: 600; margin-top: 14px; }}
.k-durum span {{ font-family: {MONO}; font-size: .78em; font-weight: 400; letter-spacing: .03em; color: {r['sicak']}; }}
.k-ikon {{ font-family: 'Material Symbols Outlined'; font-size: clamp(64px, 10vw, 96px); line-height: 1;
           color: {r['sicak']}; font-variation-settings: 'wght' 300, 'opsz' 48; user-select: none;
           filter: drop-shadow(0 6px 18px {r['sicak']}55); }}
.k-okuma {{ position: relative; display: grid; grid-template-columns: repeat(4, minmax(0, 1fr)); gap: 1px; margin-top: 22px;
            background: {r['ince']}; border: 1px solid {r['ince']}; border-radius: 8px; overflow: hidden; }}
.k-okuma > div {{ padding: 10px 12px; background: {r['kuyu']}; min-width: 0; }}
.k-okuma-ad {{ font-size: 10.5px; white-space: nowrap; color: {r['soluk']}; }}
.k-okuma-deger {{ font-family: {MONO}; font-weight: 700; font-size: 15px; margin-top: 3px; white-space: nowrap; }}
/* 4 hücre sığmıyorsa 2×2: auto-fit 3+1 dizip sağda boş alan bırakıyordu */
@container (max-width: 470px) {{ .k-okuma {{ grid-template-columns: repeat(2, minmax(0, 1fr)); }} }}

/* metrik kartları: cam yüzey, Space Mono değer */
[data-testid="stMetric"] {{ {cam} padding: 14px 16px !important; container-type: inline-size; }}
[data-testid="stMetricLabel"] p {{ font-family: {MONO}; font-size: 11px !important; letter-spacing: .05em;
                                   color: {r['soluk']}; }}
/* Değer kart genişliğine göre küçülür (cqi = kartın genişliği): dar kartta kelime ortasından bölünmesin, kesilmesin. */
[data-testid="stMetricValue"] {{ font-family: {MONO}; font-weight: 700; letter-spacing: -.03em;
                                 font-size: clamp(.95rem, 12cqi, 1.3rem); }}
/* etiket ve değer kesilmesin ("1 gün önc…", "Sistemati…"), gerekirse alt satıra geçsin */
[data-testid="stMetricValue"] > div, [data-testid="stMetricValue"] p,
[data-testid="stMetricLabel"] > div, [data-testid="stMetricLabel"] p {{
    white-space: normal !important; overflow: visible !important; text-overflow: clip !important;
    height: auto !important; line-height: 1.2 !important; word-break: normal !important;
    overflow-wrap: normal !important; }}
[data-testid="stMetricDelta"] {{ color: {r['ikinci']}; }}

/* metrik satırları: masaüstünde yan yana, telefonda ikişerli sarılır */
[class*="st-key-kartlar"] [data-testid="stHorizontalBlock"] {{ flex-wrap: wrap; gap: .6rem; }}
[class*="st-key-kartlar"] [data-testid="stColumn"] {{ flex: 1 1 120px !important; min-width: 112px !important; }}
/* Genel bakış: altı kart üçerli ya da ikişerli; satırda tek kart kalmaz */
.st-key-kartlar_genel [data-testid="stColumn"] {{ flex: 1 1 calc(33.33% - .6rem) !important; min-width: 128px !important; }}

/* Aynı satırdaki kartlar eşit yükseklikte */
[data-testid="stHorizontalBlock"]:has([data-testid="stMetric"]) {{ align-items: stretch !important; }}
[data-testid="stColumn"]:has([data-testid="stMetric"]) > [data-testid="stVerticalBlock"] {{ height: 100%; }}
[data-testid="stColumn"] [data-testid="stElementContainer"]:has(> [data-testid="stMetric"]),
[data-testid="stColumn"] [data-testid="stElementContainer"]:has(> div > [data-testid="stMetric"]) {{ flex: 1 1 auto; }}
[data-testid="stColumn"] [data-testid="stMetric"] {{ height: 100%; box-sizing: border-box; }}

/* Uyarı kartları: satır satır; aynı satırdaki kutular eşit yükseklikte */
[class*="st-key-uyari_satir"] [data-testid="stHorizontalBlock"] {{ align-items: stretch !important; }}
[class*="st-key-uyari_satir"] [data-testid="stColumn"] > [data-testid="stVerticalBlock"] {{ height: 100%; }}
[class*="st-key-uyari_satir"] [data-testid="stElementContainer"]:has([data-testid="stAlert"]) {{ flex: 1 1 auto; }}
[class*="st-key-uyari_satir"] [data-testid="stAlert"], [class*="st-key-uyari_satir"] [data-testid="stAlertContainer"] {{
    height: 100%; box-sizing: border-box; }}

[data-testid="stHeading"] h3 {{ font-size: 1.3rem; font-weight: 600; }}

/* üst arama çubuğu: yüzen kontrol (Layer 2) */
.st-key-ust_cubuk {{ {cam} padding: 8px 10px; }}

/* uyarılar, açılır kutular, kenarlıklı kaplar, açılır paneller */
[data-testid="stAlertContainer"] {{ {cam} color: {r['metin']}; }}
[data-testid="stExpander"] details {{ {cam} }}
div[data-baseweb="popover"] > div {{ backdrop-filter: blur(28px); -webkit-backdrop-filter: blur(28px); }}
/* Grafik çizimleri saydam: Streamlit sayfa zemin rengini veriyordu, cam yüzeyde ayrı kutu gibi duruyordu. */
[data-testid="stVegaLiteChart"] svg.marks, [data-testid="stVegaLiteChart"] canvas,
[data-testid="stMetric"] svg.marks, [data-testid="stMetric"] canvas {{ background: transparent !important; }}

/* 10 günlük liste ("termal spektrum"): en düşük→en yüksek sıcaklık rengine giden çubuklar */
.og {{ list-style: none; margin: 0; padding: 4px 12px; {cam} color: {r['metin']}; box-sizing: border-box; width: 100%;
       container-type: inline-size; }}
.og li {{ display: grid; grid-template-columns: minmax(44px, auto) 24px 34px 32px minmax(24px, 1fr) 32px;
          align-items: center; gap: 8px; padding: 10px 0; border-top: 1px solid {r['ince']}; font-size: 14px; }}
.og li:first-child {{ border-top: 0; }}
.og-gun {{ font-family: {BASLIK}; font-weight: 600; white-space: nowrap; }}
.og li:first-child .og-gun {{ color: {r['vurgu']}; }}
.og-gun small {{ font-family: {MONO}; font-weight: 400; font-size: 11px; color: {r['soluk']}; margin-left: 5px; }}
/* dar sütunda tarih düşer, gün adı kalır */
@container (max-width: 330px) {{ .og-gun small {{ display: none; }} }}
@container (max-width: 300px) {{
  .og li {{ grid-template-columns: minmax(34px, auto) 22px 30px 28px minmax(16px, 1fr) 28px; gap: 6px; font-size: 13px; }}
  .og-ikon {{ font-size: 21px; }}
  .og-olas {{ font-size: 10.5px; }}
}}
.og-ikon {{ font-family: 'Material Symbols Outlined'; font-size: 24px; line-height: 1; color: {r['ikinci']};
            font-variation-settings: 'wght' 300, 'opsz' 24; user-select: none; }}
.og-olas {{ font-family: {MONO}; font-size: 11.5px; color: {r['mavi']}; }}
.og-min {{ font-family: {MONO}; color: {r['vurgu']}; text-align: right; font-size: 13px; }}
.og-max {{ font-family: {MONO}; font-weight: 700; color: {r['sicak']}; font-size: 13px; }}
.og-cubuk {{ position: relative; height: 8px; border-radius: 999px; background: {r['kuyu']}; border: 1px solid {r['ince']}; }}
.og-cubuk span {{ position: absolute; top: -1px; bottom: -1px; border-radius: 999px; }}

@media (max-width: 640px) {{
  [data-testid="stMetric"] {{ padding: 10px 12px !important; }}
  [data-testid="stMetricValue"] {{ font-size: 1.25rem !important; }}
  /* telefonda ikişerli; tek kalan kart da yarım genişlikte kalsın, satırı doldurmasın */
  [class*="st-key-kartlar"] [data-testid="stColumn"] {{ flex: 0 0 calc(50% - .3rem) !important; min-width: 0 !important; }}
}}
</style>""")


def baslik(etiket, metin, aciklama="", palet=None):
    """Sayfanın başlık paneli. `palet` eski gradyanlı tasarımdan kaldı; artık tek vurgu rengi kullanılıyor."""
    st.html(f"""<div class="pb">
  <div class="pb-etiket">{html.escape(buyuk(etiket))}</div>
  <h1>{html.escape(metin)}</h1>
  {f"<p>{_metin(aciklama)}</p>" if aciklama else ""}
</div>""")


def bolum(no, metin, aciklama=""):
    """Numaralı bölüm başlığı: "01  Nelere dikkat etmeli?  açıklama"."""
    st.html(f"""<div class="bl"><span class="bl-no">{html.escape(no)}</span><h2>{html.escape(metin)}</h2>
  {f'<span class="bl-ac">{_metin(aciklama)}</span>' if aciklama else ""}</div>""")


def simge_adi(kod, gunduz=True):
    """WMO koduna göre Material Symbols simge adı."""
    for kodlar, g, c in _SIMGE:
        if kod in kodlar:
            return g if gunduz else c
    return "help"


def kahraman(etiket, sicaklik, durum, ek, okumalar, kod, gunduz):
    """Anlık durum kartı. `okumalar`: [(ad, değer), …] — altta dört hücreli okuma şeridi."""
    hucreler = "".join(f'<div><div class="k-okuma-ad">{html.escape(buyuk(a))}</div>'
                       f'<div class="k-okuma-deger">{html.escape(d)}</div></div>' for a, d in okumalar)
    st.html(f"""<div class="kahraman">
  <div class="k-etiket">{html.escape(buyuk(etiket))}</div>
  <div class="k-ust">
    <div><div class="k-sicak">{sicaklik:.0f}°</div>
         <div class="k-durum">{html.escape(durum)} <span>· {html.escape(ek)}</span></div></div>
    <div class="k-ikon" role="img" aria-label="{html.escape(durum)}">{simge_adi(kod, gunduz)}</div>
  </div>
  <div class="k-okuma">{hucreler}</div>
</div>""")


# termal spektrum (AURA): soğukta camgöbeği, ılıkta kehribar, sıcakta mercan
_ISI = [(-10, (99, 102, 241)), (0, (6, 182, 212)), (10, (76, 215, 246)), (18, (255, 185, 95)), (28, (251, 113, 133))]


def _isi_rengi(t):
    """Sıcaklığa göre termal spektrum rengi."""
    if t <= _ISI[0][0]:
        return "rgb{}".format(_ISI[0][1])
    for (t0, c0), (t1, c1) in zip(_ISI, _ISI[1:]):
        if t <= t1:
            f = (t - t0) / (t1 - t0)
            return "rgb({}, {}, {})".format(*(round(a + (b - a) * f) for a, b in zip(c0, c1)))
    return "rgb{}".format(_ISI[-1][1])


def on_gun_listesi(gunluk, guven=None):
    """10 günlük tahmin: gün, simge, yağış olasılığı, en düşük–en yüksek çubuğu. HTML olduğu için dar ekranda
    öğeler birbirine girmez; satırın üzerine gelince rüzgâr, UV ve tahmin güveni görünür."""
    from hava.grafik import gunluk_etiket          # döngüsel içe aktarmayı önlemek için burada
    from hava.veri import durum, yon_adi

    lo, hi = gunluk.temperature_2m_min.min(), gunluk.temperature_2m_max.max()
    aralik = max(hi - lo, 1)
    bugun = gunluk.index[0].date()
    satirlar = []
    for t, g in gunluk.iterrows():
        tmin, tmax = g.temperature_2m_min, g.temperature_2m_max
        olas = g.precipitation_probability_max
        gv = guven.get(t.normalize()) if guven is not None else None
        gv_ad = "—" if gv is None or gv != gv else ("yüksek" if gv < 2 else "orta" if gv < 4 else "düşük")
        ipucu = (f"{durum(g.weather_code)} · yağış {g.precipitation_sum:.1f} mm · en kuvvetli hamle "
                 f"{g.wind_gusts_10m_max:.0f} km/s ({yon_adi(g.wind_direction_10m_dominant)}) · UV "
                 f"{g.uv_index_max:.0f} · tahmin güveni {gv_ad}")
        ad = gunluk_etiket(t, bugun)
        gun = html.escape(ad) if ad == "Bugün" else f"{html.escape(ad.split()[0])}<small>{t:%d.%m}</small>"
        sol, gen = (tmin - lo) / aralik * 100, max((tmax - tmin) / aralik * 100, 2)
        satirlar.append(f"""<li title="{html.escape(ipucu)}">
  <span class="og-gun">{gun}</span>
  <span class="og-ikon" role="img" aria-label="{html.escape(durum(g.weather_code))}">{simge_adi(int(g.weather_code))}</span>
  <span class="og-olas">{f"%{olas:.0f}" if olas == olas and olas >= 20 else ""}</span>
  <span class="og-min">{tmin:.0f}°</span>
  <span class="og-cubuk"><span style="left: {sol:.1f}%; width: {gen:.1f}%; background: linear-gradient(90deg, {_isi_rengi(tmin)}, {_isi_rengi(tmax)})"></span></span>
  <span class="og-max">{tmax:.0f}°</span>
</li>""")
    st.html(f'<ol class="og">{"".join(satirlar)}</ol>')
