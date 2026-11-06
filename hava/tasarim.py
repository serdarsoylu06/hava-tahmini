"""Görsel tasarım ("Karadeniz"): arduvaz yeşili zemin, fıstık yeşili ve sarı vurgular, hava durumuna ve günün saatine göre
değişen dağ-orman manzarası, ölçerler, açık yeşil grafik kartları.
Renkler ve yazı tipleri .streamlit/config.toml'da; burada yalnızca temanın veremediği bileşenler ve stiller var.
Seçiciler mümkün olduğunca bizim verdiğimiz anahtarlara (.st-key-…) bağlanır."""
import base64
import html
import math
import random
import re

import pandas as pd
import streamlit as st

MONO = "'Space Mono', ui-monospace, monospace"
BASLIK = "'Space Grotesk', 'Inter', sans-serif"

# Grafik kartlarının zemini ve üzerindeki renkler (her iki temada aynı; renk körlüğü denetiminden geçti)
KART = "#DCE7C7"
KART_METIN = "#1C2829"
KART_IKINCI = "#3F5547"
SERI = ("#2E6B3A", "#2A6FB0", "#B2602A")        # 1. seri yeşil, 2. mavi, 3. turuncu
ESIK = "#B5352B"

# WMO hava kodu → Material Symbols simge adı (gündüz, gece)
_SIMGE = [((0,), "clear_day", "bedtime"), ((1, 2), "partly_cloudy_day", "partly_cloudy_night"),
          ((3,), "cloud", "cloud"), ((45, 48), "foggy", "foggy"), ((51, 53, 55, 56, 57), "rainy_light", "rainy_light"),
          ((61, 63, 66), "rainy", "rainy"), ((65, 67, 80, 81, 82), "rainy_heavy", "rainy_heavy"),
          ((71, 73, 75, 77, 85, 86), "weather_snowy", "weather_snowy"), ((95, 96, 99), "thunderstorm", "thunderstorm")]


def _renkler(koyu):
    if koyu:
        return {"zemin": "#1C2829", "yuzey": "#243537", "yuzey2": "#2C4143", "cizgi": "#38504F", "metin": "#E8EFE6",
                "ikinci": "#AEC0B6", "soluk": "#93A69C", "vurgu": "#C6E066", "baglanti": "#C6E066",
                "sari_metin": "#F1D24E", "tehlike": "#FF8F7E", "secili": "rgba(198,224,102,.14)"}
    return {"zemin": "#E8EEE2", "yuzey": "#FFFFFF", "yuzey2": "#EEF3E8", "cizgi": "#CAD6C4", "metin": "#1C2829",
            "ikinci": "#3F5547", "soluk": "#56695D", "vurgu": "#C6E066", "baglanti": "#476F17",
            "sari_metin": "#8A6200", "tehlike": "#B5352B", "secili": "rgba(79,138,76,.12)"}


def buyuk(s):
    """Türkçe büyük harf: i → İ, ı → I (CSS text-transform sayfa dili İngilizce olduğu için yanlış çevirir)."""
    return s.replace("i", "İ").replace("ı", "I").upper()


def _svg(icerik, kutu, gen, yuk, aria=None):
    """SVG'yi <img> olarak yerleştirir: st.html <svg> öğelerini temizlediği için veri adresi (data URI) kullanılır."""
    svg = f'<svg xmlns="http://www.w3.org/2000/svg" viewBox="{kutu}" width="{gen}" height="{yuk}">{icerik}</svg>'
    url = "data:image/svg+xml;base64," + base64.b64encode(svg.encode()).decode()
    alt = f'alt="{html.escape(aria)}" role="img"' if aria else 'alt="" aria-hidden="true"'
    return f'<img src="{url}" width="{gen}" height="{yuk}" {alt} style="display:block">'


def _metin(s):
    """Güvenli HTML: önce kaçışla, sonra yalnızca **kalın** işaretini çevir."""
    return re.sub(r"\*\*(.+?)\*\*", r"<strong>\1</strong>", html.escape(s))


def stil(koyu, bolum=None):
    r = _renkler(koyu)
    # Katmanlı gölge: üst kenarda ince ışık + yakın temas gölgesi + yumuşak, geniş gölge. Açık temada daha hafif.
    if koyu:
        isik, yakin, uzak, uzak_ust = ".05", "rgba(0,0,0,.22)", "rgba(0,0,0,.4)", "rgba(0,0,0,.5)"
    else:
        isik, yakin, uzak, uzak_ust = ".7", "rgba(28,40,41,.06)", "rgba(28,40,41,.12)", "rgba(28,40,41,.16)"
    golge = f"inset 0 1px 0 rgba(255,255,255,{isik}), 0 2px 4px {yakin}, 0 10px 24px -6px {uzak}"
    golge_ust = f"inset 0 1px 0 rgba(255,255,255,{isik}), 0 4px 8px {yakin}, 0 16px 32px -8px {uzak_ust}"
    golge_acik = f"inset 0 1px 0 rgba(255,255,255,.5), 0 2px 4px {yakin}, 0 10px 24px -6px {uzak}"  # açık yeşil kart
    kart = f"background: {r['yuzey']}; border: 1px solid {r['cizgi']}; border-radius: 16px; box-shadow: {golge};"
    st.html(f"""<style>
@import url('https://fonts.googleapis.com/css2?family=Space+Mono:wght@400;700&family=Space+Grotesk:wght@500;600;700&display=swap');
@import url('https://fonts.googleapis.com/css2?family=Material+Symbols+Outlined:opsz,wght,FILL,GRAD@48,300,0,0&display=block');
:root {{ --ara-1: 4px; --ara-2: 8px; --ara-3: 12px; --ara-4: 16px; --ara-5: 24px; --ara-6: 32px;
        --kd-zemin: {r['zemin']}; --kd-yuzey: {r['yuzey']}; --kd-yuzey2: {r['yuzey2']}; --kd-cizgi: {r['cizgi']};
        --kd-metin: {r['metin']}; --kd-ikinci: {r['ikinci']}; --kd-soluk: {r['soluk']}; --kd-vurgu: {r['vurgu']};
        --kd-baglanti: {r['baglanti']}; --kd-sari: #F1D24E; --kd-sari-metin: {r['sari_metin']}; --kd-tehlike: {r['tehlike']};
        --kd-secili: {r['secili']}; --kd-kart: {KART}; --kd-kart-metin: {KART_METIN}; --kd-kart-ikinci: {KART_IKINCI}; }}
[data-testid="stHeader"] {{ background: {r['zemin']}E6 !important; backdrop-filter: blur(10px); -webkit-backdrop-filter: blur(10px); }}
.mono {{ font-family: {MONO}; }}

/* sayfa başlığı ve bölüm başlıkları */
.pb {{ {kart} padding: clamp(16px, 2.6vw, 24px) clamp(18px, 3vw, 28px); }}
.pb-etiket {{ font-size: 13px; color: {r['ikinci']}; font-weight: 500; }}
.pb h1 {{ font-family: {BASLIK}; font-weight: 700; margin: .25em 0 .25em; padding: 0; font-size: clamp(24px, 3.2vw, 32px);
          line-height: 1.15; letter-spacing: -.02em; color: {r['metin']}; }}
.pb p {{ margin: 0; max-width: 860px; color: {r['ikinci']}; font-size: clamp(13px, 1.5vw, 15px); line-height: 1.55; }}
.bl {{ display: flex; align-items: baseline; flex-wrap: wrap; gap: 4px 16px; margin-top: 10px; }}
.bl h2 {{ font-family: {BASLIK}; margin: 0; padding: 0; font-size: 21px; font-weight: 600; letter-spacing: -.015em;
          color: {r['metin']}; }}
.bl span.bl-ac {{ font-size: 14px; color: {r['ikinci']}; }}
[data-testid="stHeading"] h1, [data-testid="stHeading"] h2, [data-testid="stHeading"] h3 {{ font-family: {BASLIK};
    letter-spacing: -.015em; }}
[data-testid="stHeading"] h3 {{ font-size: 1.25rem; font-weight: 600; }}

/* metrik kartları */
[data-testid="stMetric"] {{ {kart} padding: var(--ara-3) var(--ara-4) !important; container-type: inline-size; }}
[data-testid="stMetricLabel"] p {{ font-size: 13px !important; color: {r['ikinci']}; }}
[data-testid="stMetricValue"] {{ font-family: {MONO}; font-weight: 700; letter-spacing: -.03em;
                                 font-size: clamp(.95rem, 12cqi, 1.3rem); }}
[data-testid="stMetricValue"] > div, [data-testid="stMetricValue"] p,
[data-testid="stMetricLabel"] > div, [data-testid="stMetricLabel"] p {{
    white-space: normal !important; overflow: visible !important; text-overflow: clip !important;
    height: auto !important; line-height: 1.2 !important; word-break: normal !important; overflow-wrap: normal !important; }}
[data-testid="stMetricDelta"] {{ color: {r['ikinci']}; }}
[class*="st-key-kartlar"] [data-testid="stHorizontalBlock"] {{ flex-wrap: wrap; gap: var(--ara-3); }}
[class*="st-key-kartlar"] [data-testid="stColumn"] {{ flex: 1 1 120px !important; min-width: 112px !important; }}
[data-testid="stHorizontalBlock"]:has([data-testid="stMetric"]) {{ align-items: stretch !important; }}
[data-testid="stColumn"]:has([data-testid="stMetric"]) > [data-testid="stVerticalBlock"] {{ height: 100%; }}
[data-testid="stColumn"] [data-testid="stElementContainer"]:has(> [data-testid="stMetric"]),
[data-testid="stColumn"] [data-testid="stElementContainer"]:has(> div > [data-testid="stMetric"]) {{ flex: 1 1 auto; }}
[data-testid="stColumn"] [data-testid="stMetric"] {{ height: 100%; box-sizing: border-box; }}

/* uyarı kartları: satır satır, aynı satırdakiler eşit yükseklikte */
[class*="st-key-uyari_satir"] [data-testid="stHorizontalBlock"] {{ align-items: stretch !important; }}
[class*="st-key-uyari_satir"] [data-testid="stColumn"] > [data-testid="stVerticalBlock"] {{ height: 100%; }}
[class*="st-key-uyari_satir"] [data-testid="stElementContainer"]:has([data-testid="stAlert"]), [class*="st-key-uyari_satir"] [class*="st-key-uk_"] {{ flex: 1 1 auto; }}
[class*="st-key-uyari_satir"] [data-testid="stAlert"], [class*="st-key-uyari_satir"] [data-testid="stAlertContainer"] {{
    height: 100%; box-sizing: border-box; }}
[data-testid="stAlertContainer"] {{ border-radius: 14px; box-shadow: {golge}; }}
/* üzerine gelince hafif kalkma (yalnızca bilgi kartları; açılır bölümler ve araç çubuğu sabit) */
[class*="st-key-yuzey_"], [class*="st-key-kart_"], [data-testid="stMetric"], .ol-kart, .nk, .gk li, .mz {{
    transition: transform .2s ease, box-shadow .2s ease; }}
[class*="st-key-yuzey_"]:hover, [data-testid="stMetric"]:hover, .ol-kart:hover, .nk:hover, .gk li:hover {{
    transform: translateY(-2px); box-shadow: {golge_ust}; }}
[class*="st-key-kart_"]:hover {{ transform: translateY(-2px); box-shadow: inset 0 1px 0 rgba(255,255,255,.5), 0 4px 8px {yakin}, 0 16px 32px -8px {uzak_ust}; }}
@media (prefers-reduced-motion: reduce) {{ [class*="st-key-yuzey_"], [class*="st-key-kart_"], [data-testid="stMetric"], .ol-kart, .nk, .gk li {{ transition: none; transform: none !important; }} }}
[data-testid="stExpander"] details {{ {kart} }}

/* üst arama çubuğu ve yüzey kapları */
.st-key-ust_cubuk {{ padding: 0 0 var(--ara-3); margin-bottom: var(--ara-1); border-bottom: 1px solid {r['cizgi']}; }}
.st-key-ust_cubuk [data-testid="stCaptionContainer"] p {{ font: 12px/1.4 'Space Mono', monospace; color: {r['ikinci']}; margin: 0; }}
/* üst gezinme şeridi: hafif buzlu zemin ve ince alt çizgi */
header[data-testid="stHeader"] {{ border-bottom: 1px solid {r['cizgi']}; }}
[data-testid="stTopNav"] button, [data-testid="stTopNavLink"] {{ border-radius: 8px; }}
{"" if bolum is None else f'''[data-testid="stTopNav"] > div:nth-child({bolum + 1}) [data-testid="stTopNavSection"] {{
    background: color-mix(in srgb, {r['vurgu']} 24%, transparent); font-weight: 600; }}
[data-testid="stTopNav"] > div:nth-child({bolum + 1}) [data-testid="stTopNavSection"] p {{ font-weight: 600; }}
.st-key-alt_menu > div:nth-child({bolum + 1}) a {{ color: {r['vurgu']}; background: color-mix(in srgb, {r['vurgu']} 16%, transparent); }}'''}
/* ayarlar dişlisi: betik gezinme çubuğunun son menüsünün yanına sabitler; konumlanana dek görünmez */
.st-key-ayarlar {{ position: fixed !important; z-index: 1000001; width: auto !important; visibility: hidden; top: 10px; right: 56px; }}
.st-key-ayarlar.ayar-hazir {{ visibility: visible; }}
/* Noktalarım: yalnızca simge (açıklama üzerine gelince) */
.st-key-noktalarim button {{ padding-left: 10px; padding-right: 10px; }}
.st-key-ayarlar button {{ min-height: 34px; height: 34px; padding: 0 8px; border: 0; background: transparent; }}
.st-key-ayarlar button:hover {{ background: color-mix(in srgb, {r['metin']} 8%, transparent); }}
.st-key-ayarlar button [data-testid="stIconMaterial"] {{ font-size: 20px; }}
.st-key-ayarlar button > div > div[aria-hidden="true"] {{ display: none; }}
[class*="st-key-yuzey_"] {{ {kart} padding: var(--ara-4) var(--ara-5); }}
.st-key-rehber {{ font-size: 13px; }}
/* 24 saat destesi: masaüstünde 2×2 */
.st-key-esit_satir_deste [data-testid="stHorizontalBlock"] {{ flex-wrap: wrap !important; row-gap: var(--ara-4); }}
.st-key-esit_satir_deste [data-testid="stHorizontalBlock"] > [data-testid="stColumn"] {{ flex: 1 1 calc(50% - 1rem) !important; min-width: calc(50% - 1rem) !important; }}
.deste-sekme {{ display: none; }}
/* alt menü yalnızca telefonda */
.st-key-alt_menu {{ display: none !important; }}
/* 10 günlük lejant: tek satırlık bilgi şeridi */
.gl {{ display: flex; flex-wrap: wrap; align-items: center; gap: var(--ara-2) var(--ara-5); padding: var(--ara-2) var(--ara-4);
    border: 1px solid {r['cizgi']}; border-radius: 12px; background: {r['yuzey']}; font-size: 12.5px; color: {r['ikinci']}; }}
.gl .lejant {{ margin: 0; }}
.gl-not {{ display: inline-flex; align-items: center; gap: 6px; }}
.gl-not i {{ display: inline-block; width: 10px; height: 10px; border-radius: 50%; }}
.gl-not span {{ cursor: help; }}
/* kayıtlı noktalar: kompakt kart, geçiş bağlantısı kartın altına yapışık */
[class*="st-key-nokta_"] .nk {{ min-height: 0; padding: var(--ara-3); gap: 2px; }}
[class*="st-key-nokta_"] button {{ min-height: 28px; font-size: 13px; justify-content: flex-start; padding-left: var(--ara-3); }}
/* uyarılar ile deniz kartı aynı boyda: uyarı kartları sütunu doldurur */
.st-key-esit_satir_uyari_deniz [data-testid="stHorizontalBlock"] {{ align-items: stretch !important; }}
.st-key-esit_satir_uyari_deniz [data-testid="stColumn"] > [data-testid="stVerticalBlock"] {{ height: 100%; }}
.st-key-esit_satir_uyari_deniz .st-key-rehber_uyari {{ flex: 1 1 auto; }}
.st-key-esit_satir_uyari_deniz .st-key-rehber_uyari > [data-testid="stLayoutWrapper"]:has([class*="st-key-uyari_satir"]) {{ flex: 1 1 auto; display: flex; flex-direction: column; }}
.st-key-esit_satir_uyari_deniz [class*="st-key-uyari_satir"] {{ flex: 1 1 auto; }}
.st-key-esit_satir_uyari_deniz [class*="st-key-uyari_satir"] > [data-testid="stLayoutWrapper"] {{ flex: 1 1 auto; display: flex; flex-direction: column; }}
.st-key-esit_satir_uyari_deniz [class*="st-key-uyari_satir"] [data-testid="stHorizontalBlock"] {{ flex: 1 1 auto; }}
.st-key-esit_satir_uyari_deniz [class*="st-key-uyari_satir"] [data-testid="stColumn"] > [data-testid="stVerticalBlock"] {{ display: flex; flex-direction: column; height: 100%; }}
.st-key-esit_satir_uyari_deniz .st-key-yuzey_deniz {{ flex: 1 1 auto; }}
.st-key-adimlar {{ flex-wrap: wrap; }}
.st-key-adimlar > div {{ flex: 1 1 200px; }}
.st-key-adimlar button {{ min-height: 48px; justify-content: flex-start; text-align: left; }}
/* kompakt uyarı kartları */
[class*="st-key-uk_"] {{ border-radius: 14px; padding: var(--ara-3) var(--ara-3) var(--ara-3) var(--ara-4);
    border: 1px solid transparent; flex-wrap: nowrap !important; }}
[class*="st-key-uk_"] > div:first-child {{ min-width: 0; flex: 1 1 auto; }}
[class*="st-key-uk_"] [data-testid="stMarkdownContainer"] p {{ font-size: 14px; line-height: 1.5; margin: 0; }}
[class*="st-key-uk_"] [data-testid="stPopover"] button {{ min-height: 32px; padding: 0 8px; background: transparent; }}
[class*="st-key-uk_tehlike"] {{ background: color-mix(in srgb, {r['tehlike']} 14%, transparent); border-color: color-mix(in srgb, {r['tehlike']} 35%, transparent); }}
[class*="st-key-uk_dikkat"] {{ background: color-mix(in srgb, #F1D24E 20%, transparent); border-color: color-mix(in srgb, #D9A53A 40%, transparent); }}
[class*="st-key-uk_bilgi"] {{ background: color-mix(in srgb, #4B8FD1 13%, transparent); border-color: color-mix(in srgb, #4B8FD1 30%, transparent); }}
[class*="st-key-uk_iyi"] {{ background: color-mix(in srgb, #5FAE5A 15%, transparent); border-color: color-mix(in srgb, #5FAE5A 35%, transparent); }}
[class*="st-key-uk_"] [data-testid="stMarkdownContainer"] strong {{ font-weight: 700; }}
[class*="st-key-uk_tehlike"] strong {{ color: {r['tehlike']}; }}
[class*="st-key-uk_dikkat"] strong {{ color: {r['sari_metin']}; }}
[class*="st-key-uk_bilgi"] strong {{ color: #4B8FD1; }}
[class*="st-key-uk_iyi"] strong {{ color: #5FAE5A; }}
/* harita renk ölçeği */
.cetvel {{ max-width: 680px; padding: var(--ara-1) var(--ara-2) var(--ara-4); }}
.cetvel-ust {{ display: flex; gap: var(--ara-2); align-items: baseline; font-size: 13px; margin-bottom: var(--ara-1); }}
.cetvel-ust b {{ color: {r['metin']}; font-weight: 600; }}
.cetvel-ust span {{ color: {r['ikinci']}; }}
.cetvel-renk {{ display: grid; height: 12px; border-radius: 6px; overflow: hidden; }}
.cetvel-etiket {{ position: relative; height: 18px; margin-top: 4px; font: 11px/1 'Space Mono', monospace; color: {r['ikinci']}; }}
.cetvel-etiket span {{ position: absolute; top: 0; transform: translateX(-50%); white-space: nowrap; }}
.cetvel-etiket span:first-child {{ transform: none; }}
.cetvel-etiket span:last-child {{ transform: translateX(-100%); }}
/* grafik araç çubuğu üzerine gelince başlıktaki düğmenin üstüne binmesin */
.st-key-mg_baslik {{ margin-bottom: var(--ara-5); }}
/* katlanır okuma adımları (Meteogram "Nasıl okunur?") */
.okuma-liste {{ min-width: min(360px, 80vw); max-width: 420px; }}
.okuma-liste.okuma-kart {{ min-width: 0; max-width: none; border-top: 1px solid {r['cizgi']}; }}
.okuma-kart .okuma summary {{ font-size: 13px; }}
.okuma {{ border-top: 1px solid {r['cizgi']}; }}
.okuma:first-child {{ border-top: 0; }}
.okuma summary {{ list-style: none; cursor: pointer; display: flex; align-items: center; gap: var(--ara-2);
    padding: var(--ara-2) 0; font-size: 14px; font-weight: 600; color: {r['metin']}; }}
.okuma summary::-webkit-details-marker {{ display: none; }}
.okuma summary::after {{ content: "+"; margin-left: auto; color: {r['ikinci']}; font-weight: 400; }}
.okuma[open] summary::after {{ content: "–"; }}
.okuma summary b {{ flex: 0 0 22px; height: 22px; border-radius: 50%; display: inline-flex; align-items: center;
    justify-content: center; font: 700 11px/1 'Space Mono', monospace; background: {r['vurgu']}; color: #1C2829; }}
.okuma p {{ margin: 0 0 var(--ara-2) 30px; font-size: 13px; line-height: 1.5; color: {r['ikinci']}; }}
.st-key-rehber:has([data-testid="stMarkdown"]) {{ background: {r['yuzey']}; border: 1px solid {r['cizgi']}; border-radius: 14px;
    padding: 2px var(--ara-2) 2px var(--ara-4); }}
.st-key-rehber [data-testid="stMarkdownContainer"] p {{ font-size: 13px; margin: 0; }}
.st-key-rehber button {{ min-height: 30px; padding: 0 6px; }}

/* açık yeşil grafik kartları: her iki temada aynı zemin, yazılar koyu */
[class*="st-key-kart_"] {{ background: {KART}; border-radius: 18px; padding: var(--ara-4) var(--ara-4) var(--ara-2); color: {KART_METIN}; box-shadow: {golge_acik}; }}
[class*="st-key-kart_"] p, [class*="st-key-kart_"] h3, [class*="st-key-kart_"] h4, [class*="st-key-kart_"] li, [class*="st-key-kart_"] strong, [class*="st-key-kart_"] span, [class*="st-key-kart_"] label {{ color: {KART_METIN}; }}
[class*="st-key-kart_"] [data-testid="stCaptionContainer"] p {{ color: {KART_IKINCI}; }}
/* esit_satir: yan yana kartlar aynı yükseklikte */
[class*="st-key-esit_satir"] [data-testid="stHorizontalBlock"] {{ align-items: stretch !important; }}
[class*="st-key-esit_satir"] [data-testid="stColumn"] > [data-testid="stVerticalBlock"] {{ height: 100%; }}
[class*="st-key-esit_satir"] [data-testid="stColumn"] > [data-testid="stVerticalBlock"] > [data-testid="stLayoutWrapper"],
[class*="st-key-esit_satir"] [data-testid="stColumn"] > [data-testid="stVerticalBlock"] > [class*="st-key-"] {{ flex: 1 1 auto; }}
[class*="st-key-esit_satir"] [data-testid="stColumn"] > [data-testid="stVerticalBlock"] > [data-testid="stElementContainer"]:only-child {{ flex: 1 1 auto; }}
[class*="st-key-esit_satir"] [data-testid="stElementContainer"]:only-child > [data-testid="stHtml"] {{ height: 100%; }}
[class*="st-key-esit_satir"] [data-testid="stHtml"] > .mz, [class*="st-key-esit_satir"] [data-testid="stHtml"] > .ol {{ height: 100%; box-sizing: border-box; }}
[data-testid="stVegaLiteChart"] svg.marks, [data-testid="stVegaLiteChart"] canvas {{ background: transparent !important; }}

/* ---------------- manzara (anlık durum) ---------------- */
.mz {{ position: relative; overflow: hidden; border-radius: 20px; min-height: 420px; color: #F3F7EF; container-type: inline-size; box-shadow: {golge}; }}
.mz svg.mz-sahne {{ position: absolute; inset: 0; width: 100%; height: 100%; }}
.mz-katman {{ position: absolute; inset: 0; overflow: hidden; pointer-events: none; }}
.mz-ortu {{ position: absolute; inset: 0; background: radial-gradient(120% 95% at 0% 0%, rgba(14,24,24,.6), transparent 62%); }}
.mz-icerik {{ position: relative; padding: var(--ara-5) var(--ara-6); display: flex; flex-direction: column; gap: var(--ara-2); max-width: 600px;
              text-shadow: 0 1px 12px rgba(14,24,24,.5); }}
.mz-yer {{ margin: 0; font-size: 15px; font-weight: 500; }}
.mz-ust {{ display: flex; flex-wrap: wrap; align-items: flex-end; gap: 6px 22px; }}
.mz-sicak {{ font-family: {BASLIK}; font-weight: 700; line-height: .9; letter-spacing: -.06em; font-size: clamp(76px, 10vw, 120px); }}
.mz-durum {{ font-family: {BASLIK}; font-size: 22px; font-weight: 600; }}
.mz-ek {{ font-size: 15px; opacity: .92; }}
.mz-not {{ margin: 8px 0 0; font-family: {BASLIK}; font-size: clamp(18px, 2vw, 22px); line-height: 1.3; font-weight: 600; max-width: 34ch; }}
.mz-cip {{ position: absolute; right: 14px; bottom: 12px; margin: 0; padding: 5px 11px; border-radius: 999px;
           background: rgba(14,24,24,.55); font-size: 12.5px; }}
.mz-damla {{ position: absolute; top: 0; width: 1.5px; border-radius: 1px; background: linear-gradient(to bottom, transparent, rgba(214,236,226,.55));
             animation: mzDus linear infinite; will-change: transform; }}
@keyframes mzDus {{ from {{ transform: translate3d(0,-140px,0) rotate(12deg); }} to {{ transform: translate3d(-110px,560px,0) rotate(12deg); }} }}
.mz-sis {{ position: absolute; left: -30%; width: 160%; border-radius: 50%; background: radial-gradient(closest-side, rgba(220,232,224,.35), transparent);
           filter: blur(14px); animation: mzSuzul ease-in-out infinite alternate; }}
@keyframes mzSuzul {{ from {{ transform: translateX(-6%); }} to {{ transform: translateX(6%); }} }}
.mz-tane {{ position: absolute; top: 0; border-radius: 50%; background: rgba(245,250,245,.9); animation: mzKar linear infinite; }}
@keyframes mzKar {{ 0% {{ transform: translate3d(0,-20px,0); }} 50% {{ transform: translate3d(14px,220px,0); }} 100% {{ transform: translate3d(-8px,460px,0); }} }}
.mz-simsek {{ position: absolute; inset: 0; background: rgba(200,225,255,.5); opacity: 0; animation: mzSimsek 9s linear infinite; }}
@keyframes mzSimsek {{ 0%, 90% {{ opacity: 0; }} 91% {{ opacity: .5; }} 92% {{ opacity: 0; }} 94% {{ opacity: .35; }} 96%, 100% {{ opacity: 0; }} }}
@container (max-width: 520px) {{ .mz-damla:nth-of-type(2n), .mz-tane:nth-of-type(2n) {{ display: none; }} .mz-icerik {{ padding: var(--ara-4); }} }}
@media (prefers-reduced-motion: reduce) {{ .mz * {{ animation: none !important; }} .mz-damla, .mz-tane, .mz-simsek {{ display: none; }} }}

/* ---------------- ölçerler ---------------- */
.ol {{ display: grid; grid-template-columns: minmax(0,1fr); grid-auto-rows: 1fr; gap: var(--ara-3); }}
.ol-kart {{ {kart} padding: var(--ara-3) var(--ara-4); display: flex; align-items: center; gap: var(--ara-4); min-width: 0; }}
.ol-gosterge {{ position: relative; flex: none; width: 84px; }}
.ol-gosterge span {{ position: absolute; left: 0; right: 0; text-align: center; font-family: {MONO}; font-size: 16px; font-weight: 700; color: {r['metin']}; }}
.ol-gosterge.halka span {{ top: 31px; }}
.ol-gosterge.yarim span {{ top: 24px; }}
.ol-kart h3 {{ margin: 0; font-family: {BASLIK}; font-size: 15px; font-weight: 600; color: {r['metin']}; }}
.ol-kart p {{ margin: 2px 0 0; font-size: 13.5px; line-height: 1.4; color: {r['ikinci']}; }}

/* ---------------- nokta kartları ---------------- */
.nk {{ {kart} padding: var(--ara-3) var(--ara-4); display: flex; flex-direction: column; gap: var(--ara-2); min-height: 112px; box-sizing: border-box; }}
.nk.secili {{ border: 2px solid {r['vurgu']}; }}
.nk-ust {{ display: flex; justify-content: space-between; gap: 10px; }}
.nk-ad {{ font-family: {BASLIK}; font-size: 16px; font-weight: 600; color: {r['metin']}; }}
.nk-tur {{ font-size: 13px; color: {r['ikinci']}; }}
.nk-sicak {{ font-family: {MONO}; font-size: 22px; font-weight: 700; color: {r['metin']}; }}
.nk-durum {{ font-size: 14px; color: {r['ikinci']}; }}
.nk-uyari {{ font-size: 13px; font-weight: 600; }}

/* ---------------- denize çıkış ---------------- */
.dz {{ display: flex; flex-direction: column; gap: var(--ara-3); }}
.dz-ust {{ display: flex; align-items: center; gap: 18px; }}
.dz-halka {{ position: relative; flex: none; width: 100px; height: 100px; text-align: center; }}
.dz-halka b {{ position: absolute; left: 0; right: 0; top: 30px; font-family: {MONO}; font-size: 22px; color: {r['metin']}; }}
.dz-halka small {{ position: absolute; left: 0; right: 0; top: 58px; font-size: 11px; color: {r['ikinci']}; }}
.dz-ust p {{ margin: 0; font-size: 15px; line-height: 1.5; color: {r['metin']}; }}
.dz-serit {{ display: grid; grid-template-columns: repeat(24, minmax(0,1fr)); gap: 2px; }}
.dz-serit span {{ display: block; height: 22px; border-radius: 4px; }}
.dz-saat {{ display: grid; grid-template-columns: repeat(24, minmax(0,1fr)); gap: 2px; font-family: {MONO}; font-size: 11px; color: {r['soluk']}; }}
.dz-saat span {{ white-space: nowrap; overflow: visible; }}
.lejant {{ display: flex; flex-wrap: wrap; gap: 4px 16px; font-size: 13px; color: {r['ikinci']}; }}
.lejant span {{ display: inline-flex; align-items: center; gap: 6px; }}
.lejant i {{ display: inline-block; width: 14px; height: 10px; border-radius: 3px; }}

/* ---------------- 10 gün kartları ---------------- */
.gk {{ list-style: none; margin: 0 !important; padding: 0 !important; display: grid; grid-template-columns: repeat(10, minmax(0,1fr)); gap: var(--ara-3); container-type: inline-size; }}
.gk li {{ {kart} margin: 0 !important; padding: var(--ara-3) var(--ara-2); display: flex; flex-direction: column; align-items: center; gap: var(--ara-2); text-align: center; }}
.gk-ad {{ font-family: {BASLIK}; font-size: 14px; font-weight: 600; color: {r['metin']}; }}
.gk li:first-child .gk-ad {{ color: {r['baglanti']}; }}
.gk-ad small {{ display: block; font-family: {MONO}; font-weight: 400; font-size: 11px; color: {r['soluk']}; }}
.gk-daire {{ width: 50px; height: 50px; border-radius: 50%; color: #1C2829; display: flex; align-items: center; justify-content: center;
             font-family: {MONO}; font-size: 16px; font-weight: 700; }}
.gk-alt {{ font-size: 12px; color: {r['ikinci']}; }}
.gk-alt b {{ font-family: {MONO}; font-weight: 700; color: {r['metin']}; }}
.gk-durum {{ font-size: 12px; color: {r['ikinci']}; min-height: 16px; }}
@media (max-width: 1100px) {{ .gk {{ grid-template-columns: repeat(5, minmax(0,1fr)); }} }}
@media (max-width: 640px) {{
  /* 10 gün: yana kaydırılan şerit */
  .gk {{ display: flex; overflow-x: auto; scroll-snap-type: x proximity; gap: var(--ara-2); padding-bottom: 4px !important; scrollbar-width: none; }}
  .gk::-webkit-scrollbar {{ display: none; }}
  .gk li {{ flex: 0 0 76px; scroll-snap-align: start; padding: var(--ara-2) var(--ara-1); }}
  .gk-daire {{ width: 40px; height: 40px; font-size: 13px; }}
}}

/* ---------------- deniz ızgarası, pusula, bilgi listesi ---------------- */
.di {{ display: flex; flex-direction: column; gap: var(--ara-3); }}
.di-kaydir {{ overflow-x: auto; }}
.di-ic {{ min-width: 640px; display: flex; flex-direction: column; gap: 3px; }}
.di-satir {{ display: grid; grid-template-columns: 48px repeat(24, minmax(0,1fr)); gap: 3px; align-items: center; }}
.di-satir > span {{ display: block; height: 30px; border-radius: 5px; box-sizing: border-box; }}
.di-satir > span.di-gece {{ filter: brightness(.72) saturate(.85); }}
.di-satir b {{ font-family: {BASLIK}; font-size: 14px; font-weight: 600; color: {r['metin']}; }}
.di-saat > span {{ height: auto; font-family: {MONO}; font-size: 11px; color: {r['soluk']}; }}
.di-bos {{ background: transparent; }}
.pu {{ display: flex; flex-direction: column; align-items: center; gap: 4px; text-align: center; }}
.pu-hiz {{ margin: 0; font-size: 20px; font-weight: 700; color: {r['metin']}; }}
.pu-ek {{ margin: 0; font-size: 14px; line-height: 1.5; color: {r['ikinci']}; }}
.bl-liste {{ margin: 0; display: flex; flex-direction: column; }}
.bl-liste div {{ display: flex; justify-content: space-between; gap: 12px; padding: 9px 0; border-top: 1px solid {r['cizgi']}; }}
.bl-liste div:first-child {{ border-top: 0; }}
.bl-liste dt {{ font-size: 14px; color: {r['ikinci']}; }}
.bl-liste dd {{ margin: 0; font-size: 14px; font-weight: 700; color: {r['metin']}; text-align: right; }}

@media (max-width: 640px) {{
  /* telefonda üst çubuk tek satır: arama kutusu esner, veri saati ve Noktalarım yalnızca simge */
  [data-testid="stMainBlockContainer"] {{ padding-top: 4rem !important; }}
  .st-key-ust_cubuk {{ flex-wrap: nowrap !important; gap: var(--ara-2) !important; }}
  .st-key-ust_cubuk > div {{ min-width: 0; }}
  .st-key-ust_cubuk .st-key-yer {{ width: auto !important; flex: 1 1 auto; }}
  .st-key-ust_cubuk [data-testid="stElementContainer"]:has([data-testid="stCaptionContainer"]) {{ display: none; }}
  [data-testid="stMetric"] {{ padding: 10px 12px !important; }}
  /* alt menü: başparmak erişiminde bölümler + sağ uçta Ayarlar dişlisi */
  [data-testid="stMainBlockContainer"] {{ padding-bottom: 96px !important; }}
  .st-key-alt_menu {{ display: flex !important; position: fixed; left: 10px; right: 10px; bottom: 10px; z-index: 999990;
      height: 60px; padding: 0 60px 0 6px; border-radius: 18px; background: color-mix(in srgb, {r['yuzey']} 94%, transparent);
      backdrop-filter: blur(10px); border: 1px solid {r['cizgi']}; box-shadow: {golge_ust}; align-items: center; }}
  .st-key-alt_menu > div {{ flex: 1 1 0; min-width: 0; }}
  .st-key-alt_menu a {{ flex-direction: column; gap: 2px; padding: 6px 2px !important; border-radius: 12px; justify-content: center; }}
  .st-key-alt_menu a p {{ font-size: 11px !important; margin: 0; }}
  .st-key-alt_menu a [data-testid="stIconMaterial"] {{ font-size: 22px; }}
  .st-key-ayarlar {{ position: fixed !important; top: auto !important; left: auto !important; right: 22px !important; bottom: 22px !important; z-index: 999991; }}
  .st-key-ayarlar button {{ height: 36px; }}
  /* manzara kısa, ölçerler 2×2 */
  .mz {{ min-height: 0 !important; }}
  .mz-icerik {{ padding: var(--ara-4) !important; gap: 2px; }}
  .mz-yer {{ font-size: 12.5px; }}
  .mz-sicak {{ font-size: 68px; }}
  .mz-durum {{ font-size: 17px; }}
  .mz-ek {{ font-size: 12.5px; }}
  .mz-not {{ font-size: 14px; margin-top: 4px; display: -webkit-box; -webkit-line-clamp: 3; -webkit-box-orient: vertical; overflow: hidden; }}
  .ol {{ grid-template-columns: repeat(2, minmax(0,1fr)); gap: var(--ara-2); }}
  .ol-kart {{ padding: var(--ara-2) var(--ara-3); gap: var(--ara-2); }}
  .ol-gosterge {{ width: 50px; }}
  .ol-gosterge img {{ width: 50px !important; height: auto !important; }}
  .ol-gosterge span {{ font-size: 11.5px; }}
  .ol-gosterge.halka span {{ top: 17px; }}
  .ol-gosterge.yarim span {{ top: 13px; }}
  .ol-kart h3 {{ font-size: 13.5px; }}
  .ol-kart p {{ font-size: 11.5px; line-height: 1.3; display: -webkit-box; -webkit-line-clamp: 2; -webkit-box-orient: vertical; overflow: hidden; }}
  /* 24 saat: tek kart, yana kaydır */
  .deste-sekme {{ display: flex; gap: 6px; overflow-x: auto; margin-bottom: var(--ara-2); scrollbar-width: none; }}
  .deste-sekme button {{ flex: none; font: 600 13px/1 Inter, sans-serif; padding: 8px 14px; border-radius: 999px; border: 1px solid {r['cizgi']};
      background: transparent; color: {r['ikinci']}; }}
  .deste-sekme button.on {{ background: {r['vurgu']}; border-color: {r['vurgu']}; color: #1C2829; }}
  .st-key-esit_satir_deste [data-testid="stHorizontalBlock"] {{ flex-wrap: nowrap !important; overflow-x: auto; scroll-snap-type: x mandatory;
      scrollbar-width: none; gap: var(--ara-3) !important; }}
  .st-key-esit_satir_deste [data-testid="stHorizontalBlock"]::-webkit-scrollbar {{ display: none; }}
  .st-key-esit_satir_deste [data-testid="stHorizontalBlock"] > [data-testid="stColumn"] {{ flex: 0 0 100% !important; min-width: 100% !important; scroll-snap-align: start; }}
  [class*="st-key-kartlar"] [data-testid="stColumn"] {{ flex: 0 0 calc(50% - .3rem) !important; min-width: 0 !important; }}
}}
</style>""")


def baslik(etiket, metin, aciklama="", palet=None):
    """Sayfanın başlık paneli. `palet` eski tasarımdan kaldı, kullanılmıyor."""
    st.html(f"""<div class="pb">
  <div class="pb-etiket">{html.escape(etiket)}</div>
  <h1>{html.escape(metin)}</h1>
  {f"<p>{_metin(aciklama)}</p>" if aciklama else ""}
</div>""")


def bolum(no, metin, aciklama=""):
    """Bölüm başlığı. `no` eski numaralı tasarımdan kaldı; bölümler bir sıra anlatmadığı için gösterilmiyor."""
    st.html(f"""<div class="bl"><h2>{html.escape(metin)}</h2>
  {f'<span class="bl-ac">{_metin(aciklama)}</span>' if aciklama else ""}</div>""")


def simge_adi(kod, gunduz=True):
    """WMO koduna göre Material Symbols simge adı."""
    for kodlar, g, c in _SIMGE:
        if kod in kodlar:
            return g if gunduz else c
    return "help"


# ----------------------------------------------------------------- manzara
_GOK = {
    "acik": {"gece": ("#0E1A26", "#1B2E3A", "#2C4646"), "dogus": ("#34465E", "#B9806A", "#E7B487"),
             "ogle": ("#3F7EA0", "#86B7C4", "#C4DCCB"), "batim": ("#2B3858", "#9C5E5C", "#E09C6A")},
    "kapali": {"gece": ("#10181B", "#1A2628", "#263533"), "dogus": ("#3E4A4D", "#6E706A", "#8C887C"),
               "ogle": ("#566764", "#7A8C86", "#9AAAA0"), "batim": ("#343E44", "#655D5A", "#857869")},
    "sis": {"gece": ("#1A2427", "#2B3838", "#3C4B48"), "dogus": ("#59625F", "#8A8A80", "#A8A596"),
            "ogle": ("#7D8E88", "#A3B2AA", "#BAC6BD"), "batim": ("#4E5555", "#7E7570", "#998D80")},
}
_GOK_CISIM = {"gece": (930, 90, 24, "#E8EEF0"), "dogus": (180, 240, 40, "#F4B76A"),
              "ogle": (930, 90, 44, "#F1D24E"), "batim": (1020, 240, 40, "#F08A5A")}


def hava_turu(kod):
    """WMO kodu → manzaradaki hava: yagmur, firtina, kar, sis, bulutlu, acik."""
    kod = int(kod)
    if kod >= 95:
        return "firtina"
    if kod in (71, 73, 75, 77, 85, 86):
        return "kar"
    if kod >= 51:
        return "yagmur"
    if kod in (45, 48):
        return "sis"
    if kod == 3:
        return "bulutlu"
    return "acik"


def gun_evresi(an, dogus, batis):
    """Şimdiki zamanın gün evresi: gece, dogus (doğuştan sonraki 1,5 saat), batim (batıştan önceki 1,5 saat), ogle."""
    if an < dogus or an >= batis:
        return "gece"
    if an < dogus + pd.Timedelta(minutes=90):
        return "dogus"
    if an >= batis - pd.Timedelta(minutes=90):
        return "batim"
    return "ogle"


def _cam_yolu(rnd, taban, boy, adim, sap):
    yol = []
    x = -10
    while x < 1220:
        h = boy * (0.7 + rnd.random() * 0.6)
        w = h * 0.42
        y = taban + rnd.random() * sap
        yol.append(f"M{x:.0f} {y:.0f}L{x + w / 2:.0f} {y - h:.0f}L{x + w:.0f} {y:.0f}Z")
        x += adim
    return "".join(yol) + f"M0 {taban + sap}H1200V440H0Z"


def manzara(yer, sicaklik, durum, ek, ozet, kod, evre, tohum=0):
    """Anlık durum: hava durumuna (WMO kodu) ve gün evresine göre çizilen dağ-orman manzarası. Yağmur, kar, sis ve
    şimşek CSS ile canlandırılır; "hareketi azalt" açıksa hareket durur."""
    tur = hava_turu(kod)
    gok_tur = "acik" if tur == "acik" else "sis" if tur == "sis" else "kapali"
    g1, g2, g3 = _GOK[gok_tur][evre]
    rnd = random.Random(tohum)
    yildiz = ""
    if gok_tur == "acik" and evre == "gece":
        yildiz = "".join(f"M{rnd.random() * 1200:.0f} {rnd.random() * 200:.0f}h1.5v1.5h-1.5Z" for _ in range(70))
    cisim = ""
    if gok_tur == "acik":
        cx, cy, cr, renk = _GOK_CISIM[evre]
        cisim = f'<circle cx="{cx}" cy="{cy}" r="{cr}" fill="{renk}" opacity=".95"/>'
    karanlik = {"gece": .45, "dogus": .18, "ogle": 0, "batim": .18}[evre]
    dag1, dag2 = ("#5E8673", "#46705A") if gok_tur == "acik" else ("#6C857B", "#55736A")
    cam2, cam1 = _cam_yolu(rnd, 372, 60, 17, 14), _cam_yolu(rnd, 420, 95, 26, 16)

    parca = []
    if tur in ("yagmur", "firtina"):
        for _ in range(110 if tur == "firtina" else 70):
            s = (0.45 if tur == "firtina" else 0.55) + rnd.random() * 0.35
            parca.append(f'<div class="mz-damla" style="left:{rnd.random() * 120:.1f}%;height:{40 + rnd.random() * 40:.0f}px;'
                         f'opacity:{0.45 + rnd.random() * 0.55:.2f};animation-duration:{s:.2f}s;animation-delay:{-rnd.random() * s:.2f}s"></div>')
        parca.append('<div class="mz-sis" style="top:48%;height:110px;animation-duration:26s"></div>')
    elif tur == "kar":
        for _ in range(60):
            s = 7 + rnd.random() * 6
            b = 2.5 + rnd.random() * 3
            parca.append(f'<div class="mz-tane" style="left:{rnd.random() * 100:.1f}%;width:{b:.1f}px;height:{b:.1f}px;'
                         f'animation-duration:{s:.2f}s;animation-delay:{-rnd.random() * s:.2f}s"></div>')
    elif tur == "sis":
        for u in (35, 55, 72):
            parca.append(f'<div class="mz-sis" style="top:{u}%;height:{110 + rnd.random() * 70:.0f}px;'
                         f'animation-duration:{20 + rnd.random() * 15:.1f}s"></div>')
    if tur == "firtina":
        parca.append('<div class="mz-simsek"></div>')

    sahne = f"""<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 1200 440" preserveAspectRatio="xMidYMax slice">
<path d="{yildiz or 'M0 0'}" fill="#EEF4F0" opacity=".8"/>{cisim}
<path d="M0 250 L90 190 L170 225 L270 150 L360 205 L470 130 L560 190 L650 160 L760 210 L850 140 L960 200 L1060 165 L1200 215 L1200 440 L0 440Z" fill="{dag1}"/>
<path d="M0 300 L120 235 L210 270 L330 205 L440 262 L540 222 L640 275 L760 215 L880 268 L990 230 L1100 270 L1200 245 L1200 440 L0 440Z" fill="{dag2}"/>
<path d="M0 345 L140 300 L280 330 L420 290 L560 335 L700 300 L840 340 L980 305 L1120 335 L1200 320 L1200 440 L0 440Z" fill="#3E654E"/>
<path d="{cam2}" fill="#2F5B3E"/><path d="{cam1}" fill="#1F4230"/>
<rect x="0" y="0" width="1200" height="440" fill="#0A1418" opacity="{karanlik}"/>
</svg>"""
    url = "data:image/svg+xml;base64," + base64.b64encode(sahne.encode()).decode()
    st.html(f"""<section class="mz" aria-label="Şu anki hava" style="background-image: url('{url}'), linear-gradient(180deg, {g1} 0%, {g2} 55%, {g3} 100%); background-size: cover, 100% 100%; background-position: center bottom, 0 0; background-repeat: no-repeat;">
<div class="mz-katman" aria-hidden="true">{"".join(parca)}<div class="mz-ortu"></div></div>
<div class="mz-icerik">
  <p class="mz-yer">{html.escape(yer)}</p>
  <div class="mz-ust"><div class="mz-sicak">{sicaklik:.0f}°</div>
    <div style="padding-bottom: 8px;"><div class="mz-durum">{html.escape(durum)}</div><div class="mz-ek">{html.escape(ek)}</div></div></div>
  {f'<p class="mz-not">{html.escape(ozet)}</p>' if ozet else ""}
</div>
</section>""")


# ----------------------------------------------------------------- ölçerler
def _olcer_svg(tur, oran, renk, iz):
    oran = max(min(oran, 1), 0.002)
    if tur == "halka":
        c = 2 * math.pi * 38
        return _svg(f'<circle cx="50" cy="50" r="38" fill="none" stroke="{iz}" stroke-width="10"/>'
                    f'<circle cx="50" cy="50" r="38" fill="none" stroke="{renk}" stroke-width="10" stroke-linecap="round" '
                    f'stroke-dasharray="{oran * c:.1f} {c:.1f}" transform="rotate(-90 50 50)"/>', "0 0 100 100", 84, 84)
    u = math.pi * 40
    return _svg(f'<path d="M10 52 A40 40 0 0 1 90 52" fill="none" stroke="{iz}" stroke-width="10" stroke-linecap="round"/>'
                f'<path d="M10 52 A40 40 0 0 1 90 52" fill="none" stroke="{renk}" stroke-width="10" stroke-linecap="round" '
                f'stroke-dasharray="{oran * u:.1f} {u:.1f}"/>', "0 0 100 60", 84, 50)


def olcerler(liste, koyu):
    """liste: [(ad, açıklama, aria, 'halka'|'yarim', oran 0–1, renk, değer metni), …]"""
    iz = _renkler(koyu)["yuzey2"]
    kartlar = "".join(
        f'<section class="ol-kart" aria-label="{html.escape(aria)}">'
        f'<div class="ol-gosterge {tur}">{_olcer_svg(tur, oran, renk, iz)}<span>{html.escape(deger)}</span></div>'
        f'<div><h3>{html.escape(ad)}</h3><p>{html.escape(ek)}</p></div></section>'
        for ad, ek, aria, tur, oran, renk, deger in liste)
    st.html(f'<div class="ol">{kartlar}</div>')


# ----------------------------------------------------------------- nokta kartları
def nokta_karti(ad, tur, sicak, durum, uyari=None, uyari_tehlike=False, secili=False):
    u = ""
    if uyari:
        renk = "var(--kd-tehlike)" if uyari_tehlike else "var(--kd-sari-metin)"
        u = (f'<span class="nk-uyari" style="color:{renk}"><svg aria-hidden="true" width="13" height="13" viewBox="0 0 24 24" '
             f'fill="currentColor" style="vertical-align:-1px;margin-right:5px"><path d="M12 3.2 22 20.5H2z"></path></svg>{html.escape(uyari)}</span>')
    st.html(f"""<div class="nk{' secili' if secili else ''}">
  <div class="nk-ust"><div><div class="nk-ad">{html.escape(ad)}</div><div class="nk-tur">{html.escape(tur)}</div></div>
  <div class="nk-sicak">{sicak}</div></div>
  <div class="nk-durum">{html.escape(durum)}</div>{u}
</div>""")


# ----------------------------------------------------------------- denize çıkış
DENIZ_RENK = ("var(--kd-vurgu)", "var(--kd-sari)",
              "repeating-linear-gradient(135deg, var(--kd-tehlike) 0 4px, color-mix(in srgb, var(--kd-tehlike) 40%, transparent) 4px 8px)")


def deniz_seridi(seviyeler, saatler, ipuclari, ozet, koyu):
    """24 saatlik denize çıkış şeridi. seviyeler: 0 uygun, 1 dikkatli ol, 2 uygun değil."""
    uygun = sum(1 for s in seviyeler if s == 0)
    c = 2 * math.pi * 42
    hucre = "".join(f'<span title="{html.escape(i)}" style="background:{DENIZ_RENK[s]}"></span>'
                    for s, i in zip(seviyeler, ipuclari))
    saat = "".join(f"<span>{html.escape(s)}</span>" for s in saatler)
    st.html(f"""<div class="dz">
<div class="dz-ust">
<div class="dz-halka">{_svg(f'<circle cx="52" cy="52" r="42" fill="none" stroke="{_renkler(koyu)["yuzey2"]}" stroke-width="12"/>'
     f'<circle cx="52" cy="52" r="42" fill="none" stroke="#C6E066" stroke-width="12" stroke-linecap="round" '
     f'stroke-dasharray="{max(uygun, 0.01) / 24 * c:.1f} {c:.1f}" transform="rotate(-90 52 52)"/>', "0 0 104 104", 100, 100,
     f"24 saatin {uygun} saati uygun")}<b>{uygun}</b><small>/ 24 saat</small></div>
<p>{_metin(ozet)}</p>
</div>
<div class="dz-serit" role="img" aria-label="Saat saat denize çıkış durumu">{hucre}</div>
<div class="dz-saat" aria-hidden="true">{saat}</div>
<div class="lejant"><span><i style="background:var(--kd-vurgu)"></i>Uygun</span><span><i style="background:var(--kd-sari)"></i>Dikkatli ol</span>
<span><i style="background:{DENIZ_RENK[2]};border:1px solid var(--kd-tehlike);box-sizing:border-box"></i>Uygun değil</span></div>
</div>""")


# ----------------------------------------------------------------- 10 gün kartları
_DAIRE = {"acik": "#F1D24E", "parcali": "#C6E066", "bulutlu": "#AEC0B6", "sis": "#AEC0B6", "yagmur": "#5E9A6A",
          "hafif": "#8CBF5A", "kar": "#DCE8F0", "firtina": "#5E9A6A"}


def _gun_turu(kod):
    kod = int(kod)
    if kod in (0, 1):
        return "acik"
    if kod == 2:
        return "parcali"
    if kod == 3:
        return "bulutlu"
    if kod in (45, 48):
        return "sis"
    if kod in (51, 53, 55, 56, 57):
        return "hafif"
    return hava_turu(kod)


def gun_kartlari(gunluk, guven=None):
    """10 günlük tahmin kartları: dairenin rengi gökyüzü, içindeki sayı en yüksek sıcaklık; güveni düşük günler soluk."""
    from hava.grafik import gunluk_etiket          # döngüsel içe aktarmayı önlemek için burada
    from hava.veri import durum
    bugun = gunluk.index[0].date()
    li = []
    for t, g in gunluk.iterrows():
        gv = guven.get(t.normalize()) if guven is not None else None
        soluk = gv is not None and gv == gv and gv >= 4
        ad = gunluk_etiket(t, bugun)
        olas = g.precipitation_probability_max
        d = durum(g.weather_code)
        alt_yazi = f"{d} %{olas:.0f}" if olas == olas and olas >= 20 else d
        li.append(f"""<li><span class="gk-ad">{html.escape(ad.split()[0])}<small>{t:%d.%m}</small></span>
<span class="gk-daire" role="img" aria-label="{html.escape(d)}, en yüksek {g.temperature_2m_max:.0f} derece"
 style="background:{_DAIRE[_gun_turu(g.weather_code)]};opacity:{.6 if soluk else 1}">{g.temperature_2m_max:.0f}°</span>
<span class="gk-alt">en düşük <b>{g.temperature_2m_min:.0f}°</b></span><span class="gk-durum">{html.escape(alt_yazi)}</span></li>""")
    st.html(f'<ol class="gk">{"".join(li)}</ol>')


def gun_lejanti():
    """10 günlük kartların açıklaması: dağınık bir paragraf yerine renk lejantı + tek satır not."""
    ogeler = [("Açık", _DAIRE["acik"]), ("Parçalı bulutlu", _DAIRE["parcali"]), ("Hafif yağış", _DAIRE["hafif"]),
              ("Yağışlı", _DAIRE["yagmur"]), ("Kapalı / sis", _DAIRE["bulutlu"])]
    st.html('<div class="gl">' + lejant_html(ogeler)
            + '<span class="gl-not"><i style="background:#5E9A6A;opacity:.6"></i>Soluk daire: düşük güven '
              '<span title="ECMWF ansamblının 51 üyesi o günün en yüksek sıcaklığında 4 °C\'den fazla ayrışıyor.">ⓘ</span>'
              '</span><span class="gl-not">Dairedeki sayı en yüksek sıcaklık</span></div>')


def lejant_html(ogeler):
    """[(etiket, css arka plan), …] → küçük renk açıklaması."""
    return '<div class="lejant">' + "".join(f'<span><i style="background:{b}"></i>{html.escape(a)}</span>' for a, b in ogeler) + "</div>"


# ----------------------------------------------------------------- Deniz sayfası
# "Riskli" turuncusu renk körlüğünde "Dikkat" sarısından zor ayrılır: üstüne nokta deseni, "Tehlikeli"ye çizgi deseni.
RISKLI = "radial-gradient(circle, rgba(28,40,41,.45) 1.1px, transparent 1.5px) 0 0 / 5px 5px, #F0A060"
IZGARA_RENK = ("var(--kd-vurgu)", "var(--kd-sari)", RISKLI,
               "repeating-linear-gradient(135deg, var(--kd-tehlike) 0 4px, color-mix(in srgb, var(--kd-tehlike) 40%, transparent) 4px 8px)")


def deniz_izgara(seviye, gece, ipucu, gun_adlari):
    """Gün gün, saat saat denize çıkış ızgarası. seviye: 0 uygun … 3 tehlikeli (saatlik Series); gece ve ipucu aynı
    dizinde. Her satır bir gün, her hücre bir saat; geçmiş saatler boş, gece saatleri koyulaştırılmış."""
    satirlar = []
    for gun, parca in seviye.groupby(seviye.index.normalize()):
        hucre = ['<span class="di-bos"></span>'] * 24
        for t, s in parca.items():
            hucre[t.hour] = (f'<span{" class=\"di-gece\"" if gece[t] else ""} title="{html.escape(ipucu[t])}" '
                             f'style="background:{IZGARA_RENK[int(s)]}"></span>')
        uygun = int((parca == 0).sum())
        satirlar.append(f'<div class="di-satir" role="img" aria-label="{gun_adlari[gun.weekday()]} {gun:%d.%m}: '
                        f'{len(parca)} saatin {uygun} saati uygun"><b>{gun_adlari[gun.weekday()]}</b>{"".join(hucre)}</div>')
    baslik = "".join(f"<span>{h:02d}</span>" if h % 3 == 0 else "<span></span>" for h in range(24))
    st.html(f"""<div class="di"><div class="di-kaydir"><div class="di-ic">
<div class="di-satir di-saat" aria-hidden="true"><b></b>{baslik}</div>{"".join(satirlar)}</div></div>
<div class="lejant"><span><i style="background:var(--kd-vurgu)"></i>Uygun</span><span><i style="background:var(--kd-sari)"></i>Dikkat</span>
<span><i style="background:{RISKLI}"></i>Riskli (noktalı)</span><span><i style="background:{IZGARA_RENK[3]};border:1px solid var(--kd-tehlike);box-sizing:border-box"></i>Tehlikeli (çizgili)</span>
<span><i style="background:#F0A060;filter:brightness(.72) saturate(.85)"></i>Gece saatleri (koyu ton)</span></div></div>""")


def pusula(gelis, hiz, hamle, yon_ad, koyu):
    """Rüzgâr pusulası: ok rüzgârın estiği yönü (geldiği yönün tersi) gösterir."""
    r = _renkler(koyu)
    gidis = (gelis + 180) % 360
    icerik = (f'<circle cx="85" cy="85" r="70" fill="none" stroke="{r["cizgi"]}" stroke-width="2"/>'
              f'<circle cx="85" cy="85" r="46" fill="none" stroke="{r["cizgi"]}" stroke-width="1" stroke-dasharray="3 4"/>'
              + "".join(f'<text x="{x}" y="{y}" text-anchor="middle" fill="{r["ikinci"]}" font-family="sans-serif" '
                        f'font-size="12" font-weight="600">{h}</text>'
                        for h, x, y in (("K", 85, 12), ("D", 162, 89), ("G", 85, 166), ("B", 8, 89)))
              + f'<g transform="rotate({gidis:.0f} 85 85)"><path d="M85 128 L85 34" stroke="#C6E066" stroke-width="5" '
                f'stroke-linecap="round"/><path d="M85 22 L74 42 L96 42Z" fill="#C6E066"/></g>'
              f'<circle cx="85" cy="85" r="6" fill="{r["metin"]}"/>')
    st.html(f"""<div class="pu">{_svg(icerik, "0 0 170 170", 170, 170, f"Rüzgâr {yon_ad} yönünden, saatte {hiz:.0f} kilometre")}
<p class="mono pu-hiz">{hiz:.0f} km/s</p><p class="pu-ek">{html.escape(yon_ad)} yönünden esiyor, hamle {hamle:.0f} km/s.</p></div>""")


def bilgi_listesi(satirlar):
    """[(ad, değer), …] → iki sütunlu sade liste."""
    st.html('<dl class="bl-liste">' + "".join(f"<div><dt>{html.escape(a)}</dt><dd class='mono'>{html.escape(d)}</dd></div>"
                                              for a, d in satirlar) + "</dl>")
