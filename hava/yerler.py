"""Şehir arama önerileri, harita etiketleri ve haritadan seçilen noktayı adlandırma."""
import json
from functools import cache
from pathlib import Path

import numpy as np

# (ad, enlem, boylam, önem) — önem 1: her ölçekte, 2: yalnızca Türkiye/yakın çevre haritalarında
SEHIRLER = [
    ("İstanbul", 41.01, 28.98, 1), ("Ankara", 39.93, 32.86, 1), ("İzmir", 38.42, 27.14, 1),
    ("Antalya", 36.90, 30.70, 1), ("Trabzon", 41.00, 39.72, 1), ("Adana", 37.00, 35.32, 1),
    ("Erzurum", 39.90, 41.27, 1), ("Diyarbakır", 37.91, 40.23, 1), ("Samsun", 41.29, 36.33, 1),
    ("Van", 38.49, 43.38, 1),
    ("Bursa", 40.19, 29.06, 2), ("Konya", 37.87, 32.48, 2), ("Gaziantep", 37.07, 37.38, 2),
    ("Şanlıurfa", 37.16, 38.79, 2), ("Mersin", 36.81, 34.64, 2), ("Kayseri", 38.73, 35.49, 2),
    ("Eskişehir", 39.78, 30.52, 2), ("Malatya", 38.35, 38.31, 2), ("Sivas", 39.75, 37.02, 2),
    ("Giresun", 40.91, 38.39, 2), ("Rize", 41.02, 40.52, 2), ("Ordu", 40.98, 37.88, 2),
    ("Sinop", 42.03, 35.15, 2), ("Kastamonu", 41.38, 33.78, 2), ("Zonguldak", 41.45, 31.79, 2),
    ("Çanakkale", 40.15, 26.41, 2), ("Edirne", 41.68, 26.56, 2), ("Tekirdağ", 40.98, 27.51, 2),
    ("Balıkesir", 39.65, 27.88, 2), ("Muğla", 37.22, 28.36, 2), ("Bodrum", 37.03, 27.43, 2),
    ("Denizli", 37.78, 29.09, 2), ("Aydın", 37.85, 27.85, 2), ("Isparta", 37.76, 30.55, 2),
    ("Antakya", 36.20, 36.16, 2), ("İskenderun", 36.59, 36.17, 2), ("Kahramanmaraş", 37.58, 36.94, 2),
    ("Elazığ", 38.67, 39.22, 2), ("Kars", 40.60, 43.10, 2), ("Artvin", 41.18, 41.82, 2),
    ("Hopa", 41.39, 41.42, 2), ("İzmit", 40.77, 29.92, 2), ("Sakarya", 40.78, 30.40, 2),
    ("Bolu", 40.73, 31.61, 2), ("Afyonkarahisar", 38.76, 30.54, 2), ("Kütahya", 39.42, 29.98, 2),
    ("Batman", 37.88, 41.13, 2), ("Mardin", 37.31, 40.74, 2), ("Hakkari", 37.58, 43.74, 2),
    ("Ağrı", 39.72, 43.05, 2), ("Erzincan", 39.75, 39.49, 2), ("Tokat", 40.31, 36.55, 2),
    ("Çorum", 40.55, 34.95, 2), ("Yozgat", 39.82, 34.81, 2), ("Nevşehir", 38.62, 34.71, 2),
    ("Niğde", 37.97, 34.68, 2), ("Karaman", 37.18, 33.22, 2), ("Alanya", 36.54, 32.00, 2),
    ("Fethiye", 36.62, 29.12, 2), ("Kuşadası", 37.86, 27.26, 2), ("Ayvalık", 39.32, 26.69, 2),
    ("Amasra", 41.75, 32.39, 2),
    ("Atina", 37.98, 23.73, 1), ("Selanik", 40.64, 22.94, 2), ("Sofya", 42.70, 23.32, 1),
    ("Varna", 43.21, 27.92, 2), ("Bükreş", 44.43, 26.10, 1), ("Köstence", 44.18, 28.65, 2),
    ("Odessa", 46.48, 30.72, 2), ("Kiev", 50.45, 30.52, 1), ("Sivastopol", 44.60, 33.52, 2),
    ("Tiflis", 41.72, 44.79, 1), ("Batum", 41.64, 41.63, 2), ("Erivan", 40.18, 44.51, 1),
    ("Bakü", 40.41, 49.87, 1), ("Tahran", 35.69, 51.39, 1), ("Tebriz", 38.08, 46.29, 2),
    ("Bağdat", 33.31, 44.36, 1), ("Musul", 36.34, 43.13, 2), ("Erbil", 36.19, 44.01, 2),
    ("Şam", 33.51, 36.29, 1), ("Halep", 36.20, 37.13, 2), ("Beyrut", 33.89, 35.50, 1),
    ("Lefkoşa", 35.19, 33.38, 1), ("Kudüs", 31.77, 35.21, 1), ("Kahire", 30.04, 31.24, 1),
    ("İskenderiye", 31.20, 29.92, 2), ("Roma", 41.90, 12.50, 1), ("Viyana", 48.21, 16.37, 1),
    ("Berlin", 52.52, 13.40, 1), ("Paris", 48.86, 2.35, 1), ("Londra", 51.51, -0.13, 1),
    ("Madrid", 40.42, -3.70, 1), ("Belgrad", 44.79, 20.45, 1), ("Budapeşte", 47.50, 19.04, 1),
    ("Varşova", 52.23, 21.01, 1), ("Moskova", 55.76, 37.62, 1), ("Riyad", 24.71, 46.68, 1),
    ("Trablus", 32.89, 13.19, 1), ("Tunus", 36.81, 10.18, 1),
]
YONLER = ["K", "KD", "D", "GD", "G", "GB", "B", "KB"]


def mesafe_km(lat1, lon1, lat2, lon2):
    p1, p2 = np.radians(lat1), np.radians(lat2)
    a = np.sin((p2 - p1) / 2) ** 2 + np.cos(p1) * np.cos(p2) * np.sin(np.radians(lon2 - lon1) / 2) ** 2
    return 6371 * 2 * np.arcsin(np.sqrt(a))


def kerteriz(lat1, lon1, lat2, lon2):
    """1. noktadan 2. noktaya pusula yönü (derece, kuzeyden saat yönünde)."""
    p1, p2, dl = np.radians(lat1), np.radians(lat2), np.radians(lon2 - lon1)
    x = np.sin(dl) * np.cos(p2)
    y = np.cos(p1) * np.sin(p2) - np.sin(p1) * np.cos(p2) * np.cos(dl)
    return (np.degrees(np.arctan2(x, y)) + 360) % 360


def etiketler(kapsam, onem_en_cok):
    """Kapsamdaki (lo0, lo1, la0, la1) şehirler."""
    lo0, lo1, la0, la1 = kapsam
    return [{"ad": a, "k": [lo, la], "buyuk": o == 1} for a, la, lo, o in SEHIRLER
            if o <= onem_en_cok and lo0 <= lo <= lo1 and la0 <= la <= la1]


@cache
def yerlesimler():
    """Arama kutusunun öneri listesi: etiket → kayıt. Türkiye'deki il/ilçe merkezleri ve 10.000 üstü yerleşimler
    ile dünyanın başkentleri ve büyük şehirleri (GeoNames, CC BY 4.0; üretimi: araclar/yerlesim_listesi.py).
    Liste tarayıcıya bir kez gider ve yazdıkça orada süzülür: öneriler için sunucuya ya da API'ye istek gitmez."""
    veri = json.loads((Path(__file__).with_name("yerlesimler.json")).read_text(encoding="utf-8"))
    return {k[0]: dict(zip(veri["alanlar"], k)) for k in veri["yerler"]}


def konum_kaydi(y):
    """Öneri listesindeki bir kaydı uygulamanın konum sözlüğüne çevirir."""
    bolge = y["etiket"].split(", ", 1)[1] if ", " in y["etiket"] else ""
    if y["turkiye"]:
        bolge = f"{bolge}, Türkiye" if bolge else "Türkiye"
    return {"ad": y["ad"], "lat": y["enlem"], "lon": y["boylam"], "tz": y["saat_dilimi"], "rakim": y["rakim"],
            "bolge": bolge}


@cache
def _dizi():
    y = list(yerlesimler().values())
    return y, np.array([x["enlem"] for x in y]), np.array([x["boylam"] for x in y])


def nokta_konumu(lat, lon, ad=None, bolge="Haritadan seçilen nokta"):
    """Haritadan ya da kayıttan gelen bir nokta için konum sözlüğü; API'ye istek atmaz. Ad en yakın yerleşime
    göre verilir ("Tirebolu yakını (6 km KD)"), saat dilimi de o yerleşimden alınır. Rakım bilinmez (None);
    sayfalar gerekirse tahmin yanıtındaki model rakımını kullanır."""
    y, la, lo = _dizi()
    km = mesafe_km(lat, lon, la, lo)
    i = int(np.argmin(km))
    if ad is None:
        if km[i] < 3:
            ad = y[i]["ad"]
        elif km[i] < 150:
            ad = f"{y[i]['ad']} yakını ({km[i]:.0f} km {YONLER[int(kerteriz(la[i], lo[i], lat, lon) / 45 + 0.5) % 8]})"
        else:
            ad = f"{lat:.2f}° K, {lon:.2f}° D"
    return {"ad": ad, "lat": lat, "lon": lon, "tz": y[i]["saat_dilimi"] if km[i] < 1500 else "auto",
            "rakim": None, "bolge": bolge}


def adlandir(lat, lon):
    return nokta_konumu(lat, lon)["ad"]
