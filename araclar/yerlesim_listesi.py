"""Şehir arama kutusunun öneri listesini (hava/yerlesimler.json) üretir. Uygulama çalışırken gerekmez;
liste güncellenmek istendiğinde bir kez çalıştırılır.

Kaynak: GeoNames (CC BY 4.0) — https://download.geonames.org/export/dump/
  cities1000.txt (unzip edilmiş cities1000.zip) ve admin1CodesASCII.txt dosyalarını bir klasöre indir, sonra:
    python araclar/yerlesim_listesi.py <klasör>
Ülke adlarının Türkçesi Natural Earth'ten (Cartopy üzerinden) alınır.
"""
import csv
import json
import sys
from pathlib import Path

import cartopy.io.shapereader as shpreader

IL_ADLARI = (
    "Adana Adıyaman Afyonkarahisar Ağrı Aksaray Amasya Ankara Antalya Ardahan Artvin Aydın Balıkesir Bartın Batman "
    "Bayburt Bilecik Bingöl Bitlis Bolu Burdur Bursa Çanakkale Çankırı Çorum Denizli Diyarbakır Düzce Edirne Elazığ "
    "Erzincan Erzurum Eskişehir Gaziantep Giresun Gümüşhane Hakkari Hatay Iğdır Isparta İstanbul İzmir Kahramanmaraş "
    "Karabük Karaman Kars Kastamonu Kayseri Kilis Kırıkkale Kırklareli Kırşehir Kocaeli Konya Kütahya Malatya Manisa "
    "Mardin Mersin Muğla Muş Nevşehir Niğde Ordu Osmaniye Rize Sakarya Samsun Şanlıurfa Siirt Sinop Şırnak Sivas "
    "Tekirdağ Tokat Trabzon Tunceli Uşak Van Yalova Yozgat Zonguldak").split()
TR_NUFUS, DUNYA_NUFUS = 10_000, 500_000


def katla(s):
    """Türkçe harfleri ASCII'ye indirip küçültür (GeoNames il adlarıyla eşleştirmek için)."""
    return s.translate(str.maketrans("çğıöşüÇĞİÖŞÜâîû", "cgiosuCGIOSUaiu")).lower().replace(" ", "").replace("-", "")


def main(klasor):
    klasor = Path(klasor)
    il = {katla(a): a for a in IL_ADLARI}
    il.update({"afyon": "Afyonkarahisar", "icel": "Mersin", "k.maras": "Kahramanmaraş"})
    bolge1 = {}
    for satir in csv.reader(open(klasor / "admin1CodesASCII.txt", encoding="utf-8"), delimiter="\t"):
        bolge1[satir[0]] = satir[1].removesuffix(" Province")

    # yabancı şehirlerin Türkçe adları (Londra, Moskova…): Natural Earth kayıtları GeoNames kimliğiyle eşleşir
    tr_ad = {}
    for r in shpreader.Reader(shpreader.natural_earth("10m", "cultural", "populated_places")).records():
        a = r.attributes
        if a.get("GEONAMESID") and a.get("NAME_TR"):
            tr_ad[str(int(a["GEONAMESID"]))] = a["NAME_TR"]

    ulke = {}
    for r in shpreader.Reader(shpreader.natural_earth("110m", "cultural", "admin_0_countries")).records():
        a = r.attributes
        ulke[a.get("ISO_A2_EH") or a.get("ISO_A2")] = a.get("NAME_TR") or a.get("NAME")

    secilen = {}
    for s in csv.reader(open(klasor / "cities1000.txt", encoding="utf-8"), delimiter="\t", quoting=csv.QUOTE_NONE):
        ad, lat, lon, kod, ulke_kod, adm1, nufus, dem, tz = s[1], float(s[4]), float(s[5]), s[7], s[8], s[10], \
            int(s[14] or 0), int(s[16] or 0), s[17]
        rakim = int(s[15]) if s[15] else dem
        if ulke_kod == "TR":
            if not (kod in ("PPLC", "PPLA", "PPLA2") or nufus >= TR_NUFUS):
                continue
            bolge = il.get(katla(bolge1.get(f"TR.{adm1}", "")), bolge1.get(f"TR.{adm1}", ""))
            if katla(ad) == katla(bolge):                  # il merkezi: ilin Türkçe yazımını kullan (Istanbul → İstanbul)
                ad = etiket = bolge
            else:
                etiket = f"{ad}, {bolge}"
        else:
            if not (kod == "PPLC" or nufus >= DUNYA_NUFUS):
                continue
            turkce = tr_ad.get(s[0])
            if turkce and turkce != ad:
                ad, etiket = turkce, f"{turkce} ({ad}), {ulke.get(ulke_kod, ulke_kod)}"
            else:
                etiket = f"{ad}, {ulke.get(ulke_kod, ulke_kod)}"
        if etiket in secilen and secilen[etiket][6] >= nufus:
            continue
        secilen[etiket] = [etiket, ad, round(lat, 4), round(lon, 4), None if rakim < -9000 else rakim, tz, nufus,
                           ulke_kod == "TR"]

    # Türkiye önce, her grup nüfusa göre: öneri listesinde büyük yerler üstte çıkar
    liste = sorted(secilen.values(), key=lambda x: (not x[7], -x[6]))
    cikti = Path(__file__).resolve().parent.parent / "hava" / "yerlesimler.json"
    json.dump({"kaynak": "GeoNames (CC BY 4.0), geonames.org",
               "alanlar": ["etiket", "ad", "enlem", "boylam", "rakim", "saat_dilimi", "nufus", "turkiye"],
               "yerler": liste}, open(cikti, "w", encoding="utf-8"), ensure_ascii=False, separators=(",", ":"))
    print(f"{cikti}: {sum(x[7] for x in liste)} Türkiye, {sum(not x[7] for x in liste)} dünya yerleşimi")


if __name__ == "__main__":
    main(sys.argv[1])
