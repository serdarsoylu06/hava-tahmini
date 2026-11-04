"""Görsel tasarım ("Alet paneli"): sade beyaz yüzeyler, ince çizgiler, tek vurgu rengi, sayılar eş aralıklı yazıyla.
Renkler ve yazı tipleri .streamlit/config.toml'da; burada yalnızca temanın veremediği kart, başlık, kahraman kartı ve
mobil düzen stilleri var. Seçiciler mümkün olduğunca bizim verdiğimiz anahtarlara (.st-key-…) bağlanır."""
import html
import re

import streamlit as st

MONO = "'IBM Plex Mono', ui-monospace, monospace"

# WMO hava kodu → Material Symbols simge adı (gündüz, gece)
_SIMGE = [((0,), "clear_day", "bedtime"), ((1, 2), "partly_cloudy_day", "partly_cloudy_night"),
          ((3,), "cloud", "cloud"), ((45, 48), "foggy", "foggy"), ((51, 53, 55, 56, 57), "rainy_light", "rainy_light"),
          ((61, 63, 66), "rainy", "rainy"), ((65, 67, 80, 81, 82), "rainy_heavy", "rainy_heavy"),
          ((71, 73, 75, 77, 85, 86), "weather_snowy", "weather_snowy"), ((95, 96, 99), "thunderstorm", "thunderstorm")]


def _renkler(koyu):
    if koyu:
        return {"yuzey": "#171B20", "cizgi": "#2A3038", "ince": "#20252C", "soluk": "#9BA4AE", "ikinci": "#C3CAD2",
                "vurgu": "#FB923C", "metin": "#E8EBEE", "mavi": "#60A5FA", "golge": "0 1px 0 rgba(0,0,0,.4)"}
    return {"yuzey": "#FFFFFF", "cizgi": "#D9DDE2", "ince": "#EEF0F2", "soluk": "#5F6873", "ikinci": "#3D4651",
            "vurgu": "#C2410C", "metin": "#111418", "mavi": "#1D4ED8", "golge": "0 1px 0 rgba(17,20,24,.04)"}


def buyuk(s):
    """Türkçe büyük harf: i → İ, ı → I (CSS text-transform sayfa dili İngilizce olduğu için yanlış çevirir)."""
    return s.replace("i", "İ").replace("ı", "I").upper()


def _metin(s):
    """Güvenli HTML: önce kaçışla, sonra yalnızca **kalın** işaretini çevir."""
    return re.sub(r"\*\*(.+?)\*\*", r"<strong>\1</strong>", html.escape(s))


def stil(koyu):
    r = _renkler(koyu)
    st.html(f"""<style>
@import url('https://fonts.googleapis.com/css2?family=IBM+Plex+Mono:wght@400;500;600&display=swap');
@import url('https://fonts.googleapis.com/css2?family=Material+Symbols+Outlined:opsz,wght,FILL,GRAD@48,300,0,0&display=block');

/* sayfa başlığı ve bölüm başlıkları */
.pb {{ background: {r['yuzey']}; border: 1px solid {r['cizgi']}; border-radius: 8px; box-shadow: {r['golge']};
       padding: clamp(16px, 2.6vw, 24px) clamp(18px, 3vw, 28px); }}
.pb-etiket, .bl-no, .k-etiket, .k-okuma-ad {{ font-family: {MONO}; letter-spacing: .1em; }}
.pb-etiket {{ font-size: 12px; color: {r['vurgu']}; font-weight: 500; }}
.pb h1 {{ font-weight: 600; margin: .3em 0 .25em; padding: 0; font-size: clamp(22px, 3vw, 30px); line-height: 1.2;
          letter-spacing: -.01em; color: {r['metin']}; }}
.pb p {{ margin: 0; max-width: 860px; color: {r['ikinci']}; font-size: clamp(13px, 1.5vw, 15px); line-height: 1.55; }}

.bl {{ display: flex; align-items: baseline; flex-wrap: wrap; gap: 4px 14px; border-bottom: 1px solid {r['cizgi']};
       padding-bottom: 10px; margin-top: 8px; }}
.bl-no {{ font-size: 13px; color: {r['vurgu']}; letter-spacing: 0; }}
.bl h2 {{ margin: 0; padding: 0; font-size: 21px; font-weight: 600; color: {r['metin']}; }}
.bl span.bl-ac {{ font-size: 13px; color: {r['soluk']}; }}

/* kahraman kartı: anlık durum */
.kahraman {{ background: {r['yuzey']}; border: 1px solid {r['cizgi']}; border-radius: 8px; box-shadow: {r['golge']};
             padding: clamp(18px, 3vw, 28px); color: {r['metin']}; container-type: inline-size; }}
.k-etiket {{ font-size: 12px; color: {r['soluk']}; }}
.k-ust {{ display: flex; align-items: flex-end; justify-content: space-between; gap: 16px; margin-top: 12px; }}
.k-sicak {{ font-family: {MONO}; font-weight: 500; font-size: clamp(72px, 12vw, 112px); line-height: .9;
            letter-spacing: -.06em; }}
.k-durum {{ font-size: clamp(15px, 1.9vw, 18px); font-weight: 600; margin-top: 14px; }}
.k-durum span {{ font-weight: 400; color: {r['soluk']}; }}
.k-ikon {{ font-family: 'Material Symbols Outlined'; font-size: clamp(64px, 10vw, 96px); line-height: 1;
           color: {r['vurgu']}; font-variation-settings: 'wght' 300, 'opsz' 48; user-select: none; }}
.k-okuma {{ display: grid; grid-template-columns: repeat(4, minmax(0, 1fr)); gap: 1px; margin-top: 22px;
            background: {r['cizgi']}; border: 1px solid {r['cizgi']}; border-radius: 6px; overflow: hidden; }}
.k-okuma > div {{ padding: 10px 12px; background: {r['yuzey']}; min-width: 0; }}
.k-okuma-ad {{ font-size: 11px; white-space: nowrap; color: {r['soluk']}; }}
.k-okuma-deger {{ font-family: {MONO}; font-weight: 500; font-size: 16px; margin-top: 3px; white-space: nowrap; }}
/* 4 hücre sığmıyorsa 2×2: auto-fit 3+1 dizip sağda boş gri alan bırakıyordu */
@container (max-width: 470px) {{ .k-okuma {{ grid-template-columns: repeat(2, minmax(0, 1fr)); }} }}

/* metrik kartları: beyaz yüzey, ince çerçeve, eş aralıklı değer */
[data-testid="stMetric"] {{ background: {r['yuzey']} !important; border: 1px solid {r['cizgi']} !important;
                            border-radius: 8px !important; box-shadow: {r['golge']}; padding: 14px 16px !important;
                            container-type: inline-size; }}
[data-testid="stMetricLabel"] p {{ font-size: 12.5px !important; color: {r['soluk']}; font-weight: 500; }}
/* Değer eş aralıklı ve kart genişliğine göre küçülür (cqi = kartın genişliği): dar kartta "Dikka t" gibi kelime
   ortasından bölünmesin, "1006 h…" diye kesilmesin. */
[data-testid="stMetricValue"] {{ font-family: {MONO}; letter-spacing: -.04em; font-size: clamp(.95rem, 13cqi, 1.3rem); }}
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

/* üst arama çubuğu */
.st-key-ust_cubuk {{ background: {r['yuzey']}; border: 1px solid {r['cizgi']}; border-radius: 8px; padding: 8px 10px;
                     box-shadow: {r['golge']}; }}

/* uyarılar, açılır kutular, grafik kapları */
[data-testid="stAlertContainer"] {{ background: {r['yuzey']} !important; border: 1px solid {r['cizgi']};
                                    border-radius: 8px; color: {r['metin']}; }}
[data-testid="stExpander"] details {{ border-radius: 8px; background: {r['yuzey']}; }}
/* Grafiklere çerçeve/dolgu verilmez: Vega genişliği kaptan ölçer, kap kırpınca gösterge ("1 gün önce y…") ve eksen
   başlıkları kesiliyordu. */
/* Streamlit grafik çizimine sayfanın zemin rengini veriyor; kartların içinde (özellikle koyu temada) ayrı bir koyu
   kutu gibi duruyordu. Çizim saydam olsun, altındaki kartın rengi görünsün. */
[data-testid="stVegaLiteChart"] svg.marks, [data-testid="stVegaLiteChart"] canvas,
[data-testid="stMetric"] svg.marks, [data-testid="stMetric"] canvas {{ background: transparent !important; }}

/* 10 günlük liste */
.og {{ list-style: none; margin: 0; padding: 4px 10px; background: {r['yuzey']}; border: 1px solid {r['cizgi']};
       border-radius: 8px; color: {r['metin']}; box-sizing: border-box; width: 100%; container-type: inline-size; }}
.og li {{ display: grid; grid-template-columns: minmax(44px, auto) 24px 34px 30px minmax(24px, 1fr) 30px;
          align-items: center; gap: 8px; padding: 9px 0; border-top: 1px solid {r['ince']}; font-size: 14px; }}
.og li:first-child {{ border-top: 0; }}
.og-gun {{ font-weight: 600; white-space: nowrap; }}
.og-gun small {{ font-weight: 400; font-size: 12px; color: {r['soluk']}; margin-left: 4px; }}
/* dar sütunda tarih düşer, gün adı kalır */
@container (max-width: 330px) {{ .og-gun small {{ display: none; }} }}
/* çok dar sütun (ör. 700 px'lik pencerede iki sütun yan yana): sıkı ızgara */
@container (max-width: 300px) {{
  .og li {{ grid-template-columns: minmax(34px, auto) 22px 30px 26px minmax(16px, 1fr) 26px; gap: 6px;
            font-size: 13px; }}
  .og-ikon {{ font-size: 21px; }}
  .og-olas {{ font-size: 11px; }}
}}
.og-ikon {{ font-family: 'Material Symbols Outlined'; font-size: 24px; line-height: 1; color: {r['ikinci']};
            font-variation-settings: 'wght' 300, 'opsz' 24; user-select: none; }}
.og-olas {{ font-family: {MONO}; font-size: 12px; color: {r['mavi']}; }}
.og-min {{ font-family: {MONO}; color: {r['soluk']}; text-align: right; }}
.og-max {{ font-family: {MONO}; font-weight: 500; }}
.og-cubuk {{ position: relative; height: 6px; border-radius: 3px; background: {r['ince']}; }}
.og-cubuk span {{ position: absolute; top: 0; bottom: 0; border-radius: 3px; }}

@media (max-width: 640px) {{
  [data-testid="stMetric"] {{ padding: 10px 12px !important; }}
  [data-testid="stMetricValue"] {{ font-size: 1.35rem !important; }}
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


_ISI = [(-10, (76, 110, 245)), (0, (34, 184, 207)), (10, (130, 201, 30)), (20, (250, 176, 5)), (30, (240, 62, 62))]


def _isi_rengi(t):
    """Ortalama sıcaklığa göre maviden kırmızıya çubuk rengi (eski Altair ölçeğiyle aynı duraklar)."""
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
  <span class="og-cubuk"><span style="left: {sol:.1f}%; width: {gen:.1f}%; background: {_isi_rengi((tmin + tmax) / 2)}"></span></span>
  <span class="og-max">{tmax:.0f}°</span>
</li>""")
    st.html(f'<ol class="og">{"".join(satirlar)}</ol>')
