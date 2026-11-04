"""Etkileşimli (pydeck) hava haritaları: renkli alan, izobarlar, A/Y merkezleri, rüzgâr/dalga okları.
Kaba model ızgarası yumuşatılıp Web Mercator'a göre yeniden örneklenir ki altlık haritayla örtüşsün.
Kıyı çizgileri, sınırlar ve şehir adları renkli katmanın üstüne çizilir; altlık harita etiketsizdir."""
import base64
import io

import cartopy.feature as cf
import cartopy.io.shapereader as shpreader
import contourpy
import matplotlib
import matplotlib.colors as mcolors
import matplotlib.image
import numpy as np
import pydeck as pdk
import shapely
import streamlit as st
from scipy.interpolate import RegularGridInterpolator
from scipy.ndimage import distance_transform_edt, map_coordinates, maximum_filter, minimum_filter, zoom

from hava.veri import yon_adi
from hava.yerler import etiketler

ACIK, KOYU_STIL = pdk.map_styles.CARTO_LIGHT_NO_LABELS, pdk.map_styles.CARTO_DARK_NO_LABELS
# deck.gl metin katmanı varsayılan olarak yalnızca ASCII yükler; "auto" karakterleri veriden toplar (Türkçe harfler).
# Tırnaklı yazım, pydeck'in dizgiyi bir JS ifadesi sanmasını önler.
KARAKTERLER = '"auto"'
# pydeck'in varsayılanı "Monaco, monospace": eş aralıklı yazı geniş olduğu için şehir adları üst üste biniyordu.
YAZI = '"Inter, Helvetica, Arial, sans-serif"'

KATMANLAR = {
    "Sıcaklık + basınç": dict(
        var="temperature_2m", cmap="RdYlBu_r", birim="°C", adim=2, izo="pressure_msl", aralik=4,
        izo_ad="Basınç (hPa)",
        bak=["**Renkler** yerden 2 m yükseklikteki sıcaklıktır. Kara ile deniz, gündüz ile gece arasındaki "
             "farkı zamanı oynatarak izle.",
             "**İnce çizgiler (izobarlar)** eşit basınçlı noktaları birleştirir. Rüzgâr bu çizgilere "
             "neredeyse paralel eser: Kuzey Yarımküre'de alçak basınç (A) saat yönünün tersine, yüksek "
             "basınç (Y) saat yönünde dolanılır.",
             "**Çizgilerin sıklaştığı yerler** kuvvetli rüzgâr bölgeleridir.",
             "**A merkezleri** bulut ve yağış, **Y merkezleri** açık ve durgun hava getirir."]),
    "Yağış + basınç": dict(
        var="precipitation", birim="mm/saat", izo="pressure_msl", aralik=4, izo_ad="Basınç (hPa)",
        seviyeler=[0.1, 0.5, 1, 2, 4, 8, 16, 32],
        renkler=["#C5E5FB", "#8CC8F2", "#4FA3E0", "#1F78C8", "#7B4FD1", "#C13CB4", "#E8384F"],
        bak=["**Yağış alanları** genellikle A merkezlerinin doğusunda ve cephe boyunca uzanan bantlar "
             "hâlinde görülür.",
             "**Zamanı oynat**: yağış bandının batıdan doğuya ilerleyişi, cephenin hızını gösterir.",
             "**Küçük, dağınık ve yoğun lekeler** konvektif (sağanak/gök gürültülü) yağışı, **geniş ve "
             "düzgün bantlar** cephesel yağışı anlatır."]),
    "Rüzgâr hamleleri": dict(
        var="wind_gusts_10m", birim="km/s", izo="pressure_msl", aralik=4, izo_ad="Basınç (hPa)", ruzgar=True,
        seviyeler=[0, 15, 30, 45, 60, 75, 90, 110, 140],
        renkler=["#E7F5FF", "#A5D8FF", "#69DB7C", "#FFE066", "#FFA94D", "#FF6B6B", "#E64980", "#9C36B5"],
        bak=["**Renkler** hamle hızıdır; 50 km/s üstü ağaç dalı, 75 km/s üstü çatı hasarı riski taşır.",
             "**Oklar** ortalama rüzgârın yönünü ve göreli kuvvetini gösterir; izobarlara neredeyse paralel "
             "olduklarına dikkat et.",
             "Boğazlar, vadiler ve dağ geçitleri rüzgârı kanalize eder (ör. Çanakkale, İzmit Körfezi); model "
             "çözünürlüğü bunları tam yakalayamaz."]),
    "Bulutluluk": dict(
        var="cloud_cover", birim="%", seviyeler=[10, 25, 40, 55, 70, 85, 101],
        renkler=["#F1F3F5", "#DEE2E6", "#CED4DA", "#ADB5BD", "#868E96", "#5C636A"], izo="pressure_msl", aralik=4,
        izo_ad="Basınç (hPa)",
        bak=["Bir tür **sentetik uydu görüntüsü**: modelin toplam bulut örtüsü.",
             "**Spiral biçimli bulut alanları** gelişmiş alçak basınç sistemlerinin işaretidir.",
             "Y merkezleri altında bulutsuz alanlar, gece **don ve sis**, gündüz güneşli hava demektir."]),
    "Dalga yüksekliği": dict(
        var="wave_height", kaynak="deniz", birim="m", ok="wave_direction", ok_ad="Dalga",
        seviyeler=[0.05, 0.25, 0.5, 1, 1.5, 2, 2.5, 3, 4, 6],
        renkler=["#E3F2FD", "#B3DDF8", "#7CC4EE", "#47A3DC", "#2B7BBF", "#5F4BB6", "#A23CA8", "#D6336C",
                 "#F03E3E"],
        bak=["**Renkler** belirgin dalga yüksekliğidir: en yüksek üçte bir dalganın ortalaması. Tek tek "
             "dalgalar bunun **iki katına** çıkabilir.",
             "**Oklar** dalgaların gittiği yönü gösterir. Rüzgârın uzun mesafe boyunca aynı yönde estiği "
             "yerlerde (uzun *feç*) dalga büyür; bu yüzden Karadeniz'de poyraz, Ege'de kuzey rüzgârı "
             "kıyıları döver.",
             "Küçük tekneler için 1 m üstü zorlu, 2 m üstü tehlikelidir. Ayrıntı için **Balıkçılık ve deniz** "
             "sayfasına bak."]),
    "Deniz suyu sıcaklığı": dict(
        var="sea_surface_temperature", kaynak="deniz", cmap="turbo", birim="°C", adim=1,
        bak=["Denizler karadan çok daha yavaş ısınıp soğur; bu yüzden kıyıda kışlar ılık, yazlar serin geçer.",
             "**Sıcak deniz** üzerinden geçen soğuk hava nem ve enerji yükler: sonbaharda Karadeniz kıyısında "
             "kuvvetli sağanak ve kar yağışının (\"deniz etkisi\") kaynağı budur.",
             "Balıklar türüne göre belirli su sıcaklıklarını izleyerek göç eder; ani sıcaklık değişimleri "
             "avı etkiler."]),
    "850 hPa sıcaklık (~1,5 km)": dict(
        var="temperature_850hPa", cmap="RdYlBu_r", birim="°C", adim=2, izo="geopotential_height_850hPa",
        aralik=30, izo_ad="850 hPa yüksekliği (m)",
        bak=["Bu seviye yer yüzeyinin gündüz ısınmasından etkilenmez; **hava kütlesini** doğrudan gösterir.",
             "**Renk kuşaklarının sıklaştığı yerler cephelerdir**: soğuk havanın sıcak havayı ittiği hat.",
             "Kar için pratik kural: **850 hPa sıcaklığı −2/−4 °C'nin altındaysa** yağış alçak kotlarda "
             "bile kar olabilir.",
             "Mavi tonların güneye doğru uzanması **soğuk hava girişi** (soğuk adveksiyon) demektir."]),
    "500 hPa yükseklik (~5,5 km)": dict(
        var="temperature_500hPa", cmap="coolwarm", birim="°C", adim=2, izo="geopotential_height_500hPa",
        aralik=60, izo_ad="500 hPa yüksekliği (m)",
        bak=["Çizgiler 500 hPa basıncının kaç metrede olduğunu gösterir; bu akış **yerdeki sistemleri "
             "yönlendirir**.",
             "Çizgilerin güneye **çukurlaştığı** yerler **oluk**tur: soğuk, kararsız hava ve sağanak.",
             "Kuzeye **kabardığı** yerler **sırt**tır: sıcak ve sakin hava.",
             "Akıştan kopmuş kapalı alçak merkezler (**cut-off low**) günlerce aynı bölgede kalıp kalıcı "
             "yağış ve sel üretebilir."]),
}
for _a in KATMANLAR.values():
    if _a.get("ruzgar"):
        _a.update(ok="wind_direction_10m", ok_boy="wind_speed_10m", ok_ad="Rüzgâr")

BOLGELER = {
    "Türkiye": ((35, 43, 1.0), (25, 46, 1.0)),
    "Konumun çevresi": None,
    "Avrupa – Orta Doğu": ((30, 55, 2.5), (-5, 55, 2.5)),
}


def bolge_izgarasi(bolge, lat, lon):
    if bolge == "Konumun çevresi":
        la0, lo0 = round(lat * 2) / 2 - 3, round(lon * 2) / 2 - 4
        return (la0, la0 + 6, 0.5), (lo0, lo0 + 8, 0.5)
    return BOLGELER[bolge]


def renk_skalasi(ayar, alanlar):
    """Seviyeler ve renkler. Sürekli alanlarda tüm zamanların aralığı kullanılır ki renkler zamanlar
    arasında kıyaslanabilsin."""
    if "seviyeler" in ayar:
        return np.array(ayar["seviyeler"], float), ayar["renkler"]
    a = ayar["adim"]
    lo, hi = np.floor(np.nanmin(alanlar) / a) * a, np.ceil(np.nanmax(alanlar) / a) * a + a
    sev = np.arange(lo, hi + 0.01, a)
    cmap = matplotlib.colormaps[ayar["cmap"]]
    return sev, [mcolors.to_hex(cmap(x)) for x in np.linspace(0.05, 0.95, len(sev) - 1)]


def cetvel(seviyeler, renkler, birim):
    """Haritanın renk ölçeği: saydam zeminli PNG (yazılar gri, açık ve koyu temada okunur)."""
    import matplotlib.pyplot as plt
    fig, ax = plt.subplots(figsize=(7.2, 0.32), dpi=110)
    fig.patch.set_alpha(0)
    n = len(renkler)
    ax.imshow([list(range(n))], cmap=mcolors.ListedColormap(renkler), aspect="auto", extent=(0, n, 0, 1))
    ax.set_xticks(range(n + 1), [f"{x:g}" for x in seviyeler], fontsize=7, color="#8A94A6")
    ax.set_yticks([])
    ax.tick_params(length=0, pad=3)
    for k in ax.spines.values():
        k.set_visible(False)
    ax.set_xlabel(birim, fontsize=7, color="#8A94A6", loc="left", labelpad=2)
    tampon = io.BytesIO()
    fig.savefig(tampon, format="png", bbox_inches="tight", transparent=True)
    plt.close(fig)
    return tampon.getvalue()


# ----------------------------------------------------------------- coğrafi çizgiler
def _yollar(geometriler, kutu):
    out = []
    for g in geometriler:
        g = g.intersection(kutu)
        parcalar = getattr(g, "geoms", [g])
        for p in parcalar:
            if p.is_empty or p.geom_type not in ("LineString", "LinearRing"):
                continue
            out.append({"yol": np.round(np.asarray(p.coords), 3).tolist()})
    return out


@st.cache_resource(max_entries=10)
def cografya(kapsam):
    """Kapsam (lo0, lo1, la0, la1) için kıyı çizgisi, ülke sınırı ve Türkiye il sınırı yolları."""
    lo0, lo1, la0, la1 = kapsam
    kutu = shapely.box(lo0 - 1, la0 - 1, lo1 + 1, la1 + 1)
    kiyi = _yollar(cf.NaturalEarthFeature("physical", "coastline", "50m").geometries(), kutu)
    sinir = _yollar(cf.NaturalEarthFeature("cultural", "admin_0_boundary_lines_land", "50m").geometries(), kutu)
    il = []
    try:
        yol = shpreader.natural_earth("10m", "cultural", "admin_1_states_provinces_lines")
        il = _yollar([r.geometry for r in shpreader.Reader(yol).records()
                      if r.attributes.get("ADM0_A3") == "TUR"], kutu)
    except Exception:       # il sınırları yalnızca süs; indirilemezse haritayı engellemesin
        pass
    return kiyi, sinir, il


@st.cache_resource(max_entries=1)
def _kara():
    kara = shapely.union_all(list(cf.NaturalEarthFeature("physical", "land", "50m").geometries()))
    shapely.prepare(kara)                       # nokta-içinde sorgularını hızlandırır
    return kara


def kara_maskesi(lat_dizi, lon_dizi):
    """Verilen ızgaradaki (satır: enlem, sütun: boylam) noktaların karada olup olmadığı."""
    LO, LA = np.meshgrid(lon_dizi, lat_dizi)
    return shapely.contains_xy(_kara(), LO, LA)


# ----------------------------------------------------------------- alan görüntüsü
def _merkator(lat):
    return np.log(np.tan(np.pi / 4 + np.radians(lat) / 2))


def _doldur(alan):
    """NaN noktaları (ör. denizdeki karalar) en yakın geçerli değerle doldurur ki yumuşatma kıyıda bozulmasın."""
    bos = np.isnan(alan)
    if not bos.any():
        return alan
    if bos.all():
        return np.zeros_like(alan)
    return alan[tuple(distance_transform_edt(bos, return_distances=False, return_indices=True))]


def _ince(lats, lons, alan, k=8):
    """Kaba ızgarayı k kat sıklaştırır (kübik, aşmayı kırparak)."""
    ince = np.clip(zoom(_doldur(alan), k, order=3), np.nanmin(alan), np.nanmax(alan))
    return np.linspace(lats[0], lats[-1], ince.shape[0]), np.linspace(lons[0], lons[-1], ince.shape[1]), ince


def goruntu(lats, lons, alan, seviyeler, renkler, deniz=False, opaklik=0.72):
    """Alanı PNG'ye çevirir; satırlar Mercator'da eşit aralıklı olacak şekilde yeniden örneklenir.
    Deniz alanlarında karalar gerçek kıyı çizgisine göre saydam bırakılır."""
    flat, flon, ince = _ince(lats, lons, alan)
    hedef = np.linspace(_merkator(flat[-1]), _merkator(flat[0]), ince.shape[0])     # kuzeyden güneye
    hedef_lat = np.degrees(2 * np.arctan(np.exp(hedef)) - np.pi / 2)
    satir = (hedef_lat - flat[0]) / (flat[1] - flat[0])
    ii, jj = np.meshgrid(satir, np.arange(ince.shape[1]), indexing="ij")
    m = map_coordinates(ince, [ii, jj], order=1)
    renk = np.array([mcolors.to_rgba(r) for r in renkler])
    sinif = np.digitize(m, seviyeler) - 1
    rgba = renk[np.clip(sinif, 0, len(renkler) - 1)]
    gorunur = sinif >= 0                                  # en alt eşiğin altı (ör. yağış < 0.1) saydam
    if deniz:
        gorunur &= ~kara_maskesi(hedef_lat, flon)
    rgba[..., 3] = np.where(gorunur, opaklik, 0)
    tampon = io.BytesIO()
    matplotlib.image.imsave(tampon, rgba, format="png")
    return "data:image/png;base64," + base64.b64encode(tampon.getvalue()).decode()


def izobarlar(lats, lons, alan, aralik):
    flat, flon, ince = _ince(lats, lons, alan, k=4)
    gen = contourpy.contour_generator(flon, flat, ince)
    sev = np.arange(np.floor(np.nanmin(alan) / aralik) * aralik, np.nanmax(alan) + aralik, aralik)
    yollar, etiket = [], []
    for s in sev:
        for c in gen.lines(s):
            if len(c) < 6:
                continue
            yollar.append({"yol": c.tolist()})
            if len(c) > 25:
                etiket.append({"konum": c[len(c) // 2].tolist(), "metin": f"{s:.0f}"})
    return yollar, etiket


def basinc_merkezleri(lats, lons, p, n=2, fark=2.0):
    """Çevresindeki (2n+1)×(2n+1) noktanın en düşüğü/en yükseği olan iç noktalar. Kenardaki noktalar gerçek
    merkez olmayabileceği, en az `fark` hPa zıtlık olmayan düz alanlar da sahte merkez üreteceği için atlanır."""
    p = np.where(np.isnan(p), np.nanmean(p), p)
    en_az, en_cok = minimum_filter(p, 2 * n + 1), maximum_filter(p, 2 * n + 1)
    ic = np.zeros(p.shape, bool)
    ic[n:-n, n:-n] = True
    belirgin = ic & (en_cok - en_az >= fark)
    out = []
    for maske, harf, renk in ((belirgin & (p == en_az), "A", [224, 49, 49]),
                              (belirgin & (p == en_cok), "Y", [28, 126, 214])):
        out += [{"konum": [float(lons[j]), float(lats[i])], "harf": harf, "renk": renk,
                 "deger": f"{p[i, j]:.0f}"} for i, j in np.argwhere(maske)]
    return out


def oklar(lats, lons, buyukluk, yon, d):
    """Gidiş yönünde oklar (yön, meteorolojik "geldiği yön" olarak verilir); boyu büyüklükle orantılı."""
    out = []
    enb = max(np.nanmax(buyukluk), 1e-6) if np.isfinite(buyukluk).any() else 1
    for i in range(len(lats)):
        for j in range(len(lons)):
            if np.isnan(buyukluk[i, j]) or np.isnan(yon[i, j]):
                continue
            boy = d * 0.85 * (0.25 + 0.75 * buyukluk[i, j] / enb)
            a = np.radians(yon[i, j] + 180)
            kx = 1 / np.cos(np.radians(lats[i]))                 # boylam derecesi kısalır
            x0, y0 = lons[j], lats[i]
            x1, y1 = x0 + boy * np.sin(a) * kx, y0 + boy * np.cos(a)
            kanat = [[x1 + 0.3 * boy * np.sin(t) * kx, y1 + 0.3 * boy * np.cos(t)]
                     for t in (a + np.radians(150), a - np.radians(150))]
            out.append({"yol": [kanat[0], [x1, y1], kanat[1], [x1, y1], [x0, y0]]})
    return out


def okuma_noktalari(lats, lons, alan, izo, ok_b, ok_y, ayar):
    """Fareyle okunacak ve tıklanınca konum seçilecek ince ızgara (~110 sütun), değerler ara değerlemeyle."""
    adim = max(0.15, (lons[-1] - lons[0]) / 110)
    ilat, ilon = np.arange(lats[0], lats[-1] + 1e-6, adim), np.arange(lons[0], lons[-1] + 1e-6, adim)
    LA, LO = np.meshgrid(ilat, ilon, indexing="ij")
    P = np.column_stack([LA.ravel(), LO.ravel()])
    ara = lambda f: RegularGridInterpolator((lats, lons), f, bounds_error=False)(P)
    v = ara(alan)
    iz = ara(izo) if izo is not None else None
    if ok_y is not None:
        yr = np.radians(ok_y)
        u, w = ara(np.sin(yr)), ara(np.cos(yr))
        yon = (np.degrees(np.arctan2(u, w)) + 360) % 360
        b = ara(ok_b) if ok_b is not None else None
    out = []
    for n in range(len(P)):
        satir = [f"{ayar['izo_ad']}: {iz[n]:.0f}" if iz is not None and np.isfinite(iz[n]) else ""]
        if ok_y is not None and np.isfinite(yon[n]):
            satir.append(f"{ayar['ok_ad']}: " + (f"{b[n]:.0f} km/s, " if b is not None else "")
                         + f"{yon_adi(yon[n])} yönünden")
        out.append({"konum": [round(float(P[n, 1]), 3), round(float(P[n, 0]), 3)],
                    "deger": f"{v[n]:.1f} {ayar['birim']}" if np.isfinite(v[n]) else "Kara (veri yok)",
                    "ek": "<br/>".join(x for x in satir if x),
                    "yer": f"{P[n, 0]:.2f}° K  {P[n, 1]:.2f}° D"})
    return out, adim


def harita(lats, lons, alan, izo, ok_b, ok_y, ayar, sev, renkler, konum, koyu):
    dla = lats[1] - lats[0]
    deniz = ayar.get("kaynak") == "deniz"
    kapsam = (float(lons[0]), float(lons[-1]), float(lats[0]), float(lats[-1]))
    on = [235, 240, 245] if koyu else [25, 32, 44]
    arka = [11, 18, 32] if koyu else [255, 255, 255]

    # tırnaklı dizgi: pydeck aksi hâlde "data:" URL'sini bir JS ifadesi sanıyor
    katman = [pdk.Layer("BitmapLayer", id="alan", image=f'"{goruntu(lats, lons, alan, sev, renkler, deniz)}"',
                        bounds=[kapsam[0], kapsam[2], kapsam[1], kapsam[3]])]

    kiyi, sinir, il = cografya(kapsam)
    katman += [
        pdk.Layer("PathLayer", il, id="il", get_path="yol", get_color=on + [45], width_min_pixels=0.6),
        pdk.Layer("PathLayer", sinir, id="sinir", get_path="yol", get_color=on + [120], width_min_pixels=1.1),
        pdk.Layer("PathLayer", kiyi, id="kiyi", get_path="yol", get_color=on + [150], width_min_pixels=1),
    ]
    if izo is not None:
        yollar, etiket = izobarlar(lats, lons, izo, ayar["aralik"])
        katman += [
            pdk.Layer("PathLayer", yollar, id="izobar", get_path="yol", get_color=on + [210], width_min_pixels=1.5),
            pdk.Layer("TextLayer", character_set=KARAKTERLER, font_family=YAZI, data=etiket, id="izobar_etiket", get_position="konum", get_text="metin", get_size=11,
                      get_color=on + [255], background=True, get_background_color=arka + [210],
                      background_padding=[3, 1], font_weight=600),
        ]
        if ayar["izo"] == "pressure_msl":
            # komşuluk ~2° olsun; ince ızgarada dağların yarattığı küçük basınç çukurları merkez sayılmasın
            m = basinc_merkezleri(lats, lons, izo, n=max(2, round(2 / dla)), fark=3.0)
            katman += [
                pdk.Layer("TextLayer", character_set=KARAKTERLER, font_family=YAZI, data=m, id="merkez", get_position="konum", get_text="harf", get_size=30,
                          get_color="renk", font_weight=800, font_settings={"sdf": True}, outline_width=3,
                          outline_color=arka + [230]),
                pdk.Layer("TextLayer", character_set=KARAKTERLER, font_family=YAZI, data=m, id="merkez_deger", get_position="konum", get_text="deger", get_size=11,
                          get_color="renk", get_pixel_offset=[0, 21], font_weight=700, font_settings={"sdf": True},
                          outline_width=3, outline_color=arka + [230]),
            ]
    if ok_y is not None:
        boy = ok_b if ok_b is not None else alan
        katman.append(pdk.Layer("PathLayer", oklar(lats, lons, boy, ok_y, dla), id="ok", get_path="yol",
                                get_color=on + [200], width_min_pixels=1.4))

    # Türkiye ölçeğinde (≈20°) ikinci derece şehirler de eklenince adlar birbirine giriyordu; geniş bölgede yalnızca
    # büyük şehirler, "konumun çevresi" gibi dar bölgede ikinci derece şehirler de gösterilir.
    sehir = etiketler(kapsam, onem_en_cok=1 if kapsam[1] - kapsam[0] > 12 else 2)
    # konumun kırmızı etiketi zaten var; ona çok yakın şehir adları (Yomra'da "Trabzon") altında kalıp karışıyordu
    # Seyreltme: harita genişliğinin ~1/9'undan yakın iki ad bırakılmaz; liste önem sırasında olduğu için önce gelen
    # (İstanbul, Ankara…) kalır. Konumun kırmızı etiketinin çevresi de boş tutulur (Yomra'da "Trabzon" altta kalıyordu).
    ara = (kapsam[1] - kapsam[0]) / 9
    secilen = [(konum["lon"], konum["lat"])]
    kalan = []
    for x in sehir:
        lo, la = x["k"]
        if x["ad"] != konum["ad"] and all(abs(lo - a) > ara or abs(la - b) > ara * 0.6 for a, b in secilen):
            secilen.append((lo, la))
            kalan.append(x)
    sehir = kalan
    katman.append(pdk.Layer("TextLayer", character_set=KARAKTERLER, font_family=YAZI, data=sehir, id="sehir", get_position="k", get_text="ad",
                            get_size=12, get_color=on + [235], font_weight=600, font_settings={"sdf": True},
                            outline_width=4, outline_color=arka + [220], get_pixel_offset=[0, -9]))
    katman.append(pdk.Layer("ScatterplotLayer", sehir, id="sehir_nokta", get_position="k", get_radius=2.5,
                            radius_units='"pixels"', get_fill_color=on + [220]))

    nokta, adim = okuma_noktalari(lats, lons, alan, izo, ok_b, ok_y, ayar)
    katman.append(pdk.Layer("ScatterplotLayer", nokta, id="izgara", get_position="konum",
                            get_radius=adim * 111e3 * 0.55, get_fill_color=[0, 0, 0, 1], pickable=True,
                            auto_highlight=True, highlight_color=[255, 255, 255, 60]))
    katman += [
        pdk.Layer("ScatterplotLayer", [{"k": [konum["lon"], konum["lat"]]}], id="konum_halka", get_position="k",
                  get_radius=13, radius_units='"pixels"', get_fill_color=[240, 62, 62, 50], stroked=True,
                  get_line_color=[240, 62, 62, 160], line_width_min_pixels=1.5),
        pdk.Layer("ScatterplotLayer", [{"k": [konum["lon"], konum["lat"]]}], id="konum", get_position="k",
                  get_radius=6, radius_units='"pixels"', get_fill_color=[240, 62, 62], get_line_color=[255, 255, 255],
                  stroked=True, line_width_min_pixels=2),
        pdk.Layer("TextLayer", character_set=KARAKTERLER, font_family=YAZI, data=[{"k": [konum["lon"], konum["lat"]], "ad": konum["ad"]}], id="konum_ad",
                  get_position="k", get_text="ad", get_size=13, get_pixel_offset=[0, -22], font_weight=700,
                  get_color=[255, 255, 255], background=True, get_background_color=[224, 49, 49, 235],
                  background_padding=[6, 3]),
    ]
    yak = float(np.clip(np.log2(360 / (kapsam[1] - kapsam[0])) + 0.75, 2, 8))
    return pdk.Deck(
        layers=katman, map_provider="carto", map_style=KOYU_STIL if koyu else ACIK,
        initial_view_state=pdk.ViewState(latitude=(kapsam[2] + kapsam[3]) / 2,
                                         longitude=(kapsam[0] + kapsam[1]) / 2, zoom=yak),
        tooltip={"html": "<b style='font-size:15px'>{deger}</b><br/>{ek}"
                         "<br/><span style='opacity:.6'>{yer} · tıkla: konum yap</span>",
                 "style": {"fontSize": "12px", "borderRadius": "8px", "padding": "8px 10px"}},
    )
