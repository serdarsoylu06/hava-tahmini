// Canlı harita bileşeni (Streamlit Custom Components v2).
// MapLibre altlık harita + RainViewer radar + EUMETSAT uydu kareleri + rüzgâr parçacıkları.
// Animasyon tamamen tarayıcıda döner; Python yalnızca kare listesini ve rüzgâr ızgarasını gönderir.

const MAPLIBRE = "https://cdn.jsdelivr.net/npm/maplibre-gl@4.7.1/dist/maplibre-gl.js"
const DURUM = new WeakMap()

function maplibreYukle() {
  if (window.maplibregl) return Promise.resolve(window.maplibregl)
  if (!window.__maplibreYukleniyor) {
    window.__maplibreYukleniyor = new Promise((tamam, hata) => {
      const s = document.createElement("script")
      s.src = MAPLIBRE
      s.onload = () => tamam(window.maplibregl)
      s.onerror = hata
      document.head.appendChild(s)
    })
  }
  return window.__maplibreYukleniyor
}

export default function (component) {
  const { data, parentElement, setTriggerValue } = component
  let d = DURUM.get(parentElement)
  if (!d) {
    d = { veri: data, kare: 0, oynuyor: true, kaynaklar: new Set() }
    DURUM.set(parentElement, d)
    kur(parentElement, d)
  } else {
    d.veri = data
    if (d.hazir) guncelle(d)
  }
  d.tetikle = setTriggerValue
  return () => {
    d.iptal = true
    cancelAnimationFrame(d.raf)
    clearInterval(d.oynatici)
    if (d.harita) d.harita.remove()
    DURUM.delete(parentElement)
  }
}

// ------------------------------------------------------------------ kurulum
async function kur(kok, d) {
  const el = (s) => kok.querySelector(s)
  d.el = { kap: el(".kap"), harita: el(".harita"), tuval: el(".parcacik"), oynat: el(".oynat"),
           kaydir: el(".kaydir"), zaman: el(".zaman"), durum: el(".durum"), lejant: el(".lejant") }
  let ml
  try {
    ml = await maplibreYukle()
  } catch (e) {
    d.el.durum.textContent = "Harita kütüphanesi yüklenemedi (internet bağlantısını kontrol et)."
    return
  }
  if (d.iptal) return
  const v = d.veri
  d.harita = new ml.Map({
    container: d.el.harita,
    style: v.stil,
    center: [v.merkez.lon, v.merkez.lat],
    zoom: v.yakinlik,
    attributionControl: { compact: true },
    dragRotate: false,
  })
  d.harita.touchZoomRotate.disableRotation()
  d.harita.addControl(new ml.NavigationControl({ showCompass: false }), "top-right")
  d.isaret = new ml.Marker({ color: "#E03131" }).setLngLat([v.konum.lon, v.konum.lat]).addTo(d.harita)

  d.harita.on("load", () => {
    d.hazir = true
    // radar ve uydu, yer adlarının altına çizilsin: ilk sembol (etiket) katmanının önüne eklenir
    d.etiketOncesi = (d.harita.getStyle().layers.find((l) => l.type === "symbol") || {}).id
    guncelle(d)
    parcacikBaslat(d)
  })
  d.harita.on("click", (e) => d.tetikle && d.tetikle("tiklama", { lat: e.lngLat.lat, lon: e.lngLat.lng }))
  d.harita.on("movestart", () => tuvalTemizle(d))
  d.harita.on("resize", () => tuvalBoyutla(d))

  d.el.oynat.onclick = () => {
    d.oynuyor = !d.oynuyor
    d.el.oynat.textContent = d.oynuyor ? "❚❚" : "▶"
  }
  d.el.kaydir.oninput = (e) => {
    d.oynuyor = false
    d.el.oynat.textContent = "▶"
    kareGoster(d, Number(e.target.value))
  }
  d.oynatici = setInterval(() => {
    if (!d.oynuyor || !d.zamanlar || d.zamanlar.length < 2) return
    // son karede biraz bekle, sonra başa dön
    if (d.kare === d.zamanlar.length - 1 && (d.bekle = (d.bekle || 0) + 1) < 3) return
    d.bekle = 0
    kareGoster(d, (d.kare + 1) % d.zamanlar.length)
  }, 700)
}

// ------------------------------------------------------------------ katmanlar
function rasterEkle(d, id, karolar, opaklik, enFazlaYakinlik, boyut = 256) {
  const h = d.harita
  if (!h.getSource(id)) {
    h.addSource(id, { type: "raster", tiles: [karolar], tileSize: boyut, maxzoom: enFazlaYakinlik })
    h.addLayer({ id, type: "raster", source: id,
                 paint: { "raster-opacity": 0, "raster-fade-duration": 0 } }, d.etiketOncesi)
  }
  d.kaynaklar.add(id)
  d.opaklik = d.opaklik || {}
  d.opaklik[id] = opaklik
}

function kaynaklariTemizle(d, onek, tutulacak) {
  for (const id of [...d.kaynaklar]) {
    if (id.startsWith(onek) && !tutulacak.has(id)) {
      if (d.harita.getLayer(id)) d.harita.removeLayer(id)
      if (d.harita.getSource(id)) d.harita.removeSource(id)
      d.kaynaklar.delete(id)
    }
  }
}

function guncelle(d) {
  const v = d.veri
  const h = d.harita
  // tema değişince Python bileşeni yeni anahtarla yeniden kurar; burada altlık stili değiştirmeye gerek yok
  d.isaret.setLngLat([v.konum.lon, v.konum.lat])
  if (d.merkezAnahtari !== v.merkez_anahtari) {
    d.merkezAnahtari = v.merkez_anahtari
    h.jumpTo({ center: [v.merkez.lon, v.merkez.lat], zoom: v.yakinlik })
  }

  const uydu = v.katmanlar.uydu ? v.uydu : []
  const radar = v.katmanlar.radar ? v.radar : []
  const tutulan = new Set()
  // uydu kareleri gerektikçe eklenir (kareGoster): hepsi birden istenirse EUMETSAT sunucusu istekleri kısıyor
  d.uyduKareler = uydu
  uydu.forEach((k) => { if (d.kaynaklar.has("uydu-" + k.zaman)) tutulan.add("uydu-" + k.zaman) })
  radar.forEach((k) => { rasterEkle(d, "radar-" + k.zaman, k.karo, 0.85, 7); tutulan.add("radar-" + k.zaman) })
  if (v.katmanlar.radar && v.kapsama) {
    rasterEkle(d, "kapsama", v.kapsama, 0.35, 7)
    tutulan.add("kapsama")
  }
  kaynaklariTemizle(d, "uydu-", tutulan)
  kaynaklariTemizle(d, "radar-", tutulan)
  kaynaklariTemizle(d, "kapsama", tutulan)
  if (h.getLayer("kapsama")) h.setPaintProperty("kapsama", "raster-opacity", 0.35)

  // zaman çizelgesi: radar açıksa radar kareleri (10 dk), değilse uydu kareleri (15 dk)
  d.zamanlar = (radar.length ? radar : uydu).map((k) => k.zaman)
  d.radarZaman = radar.map((k) => k.zaman)
  d.uyduZaman = uydu.map((k) => k.zaman)
  d.el.kaydir.max = Math.max(0, d.zamanlar.length - 1)
  d.el.kaydir.disabled = d.zamanlar.length < 2
  d.el.lejant.style.display = radar.length ? "flex" : "none"
  kareGoster(d, d.zamanlar.length ? d.zamanlar.length - 1 : 0)

  d.ruzgar = v.katmanlar.ruzgar ? v.ruzgar : null
  d.el.tuval.style.display = d.ruzgar ? "block" : "none"
  tuvalTemizle(d)

  const notlar = []
  if (v.katmanlar.uydu && !uydu.length) notlar.push("Uydu görüntüsü şu an alınamadı.")
  if (v.katmanlar.radar && !radar.length) notlar.push("Radar verisi şu an alınamadı.")
  if (v.katmanlar.ruzgar && !v.ruzgar) notlar.push("Rüzgâr verisi şu an alınamadı (istek sınırı); radar ve uydu çalışıyor.")
  d.el.durum.textContent = notlar.join(" ")
}

function enYakin(dizi, t) {
  let en = -1, fark = Infinity
  dizi.forEach((x, i) => { const f = Math.abs(x - t); if (f < fark) { fark = f; en = i } })
  return en
}

function kareGoster(d, i) {
  d.kare = i
  d.el.kaydir.value = i
  const t = d.zamanlar[i]
  const h = d.harita
  const radarI = d.radarZaman.indexOf(t)
  const uyduI = d.uyduZaman.length ? enYakin(d.uyduZaman, t) : -1
  d.radarZaman.forEach((z, j) => h.setPaintProperty("radar-" + z, "raster-opacity", j === radarI ? 0.85 : 0))
  for (const j of [uyduI, uyduI + 1]) {            // gösterilen kare ve bir sonraki (ön yükleme)
    const k = d.uyduKareler && d.uyduKareler[j]
    if (k) rasterEkle(d, "uydu-" + k.zaman, k.karo, 0.92, 12, 512)
  }
  d.uyduZaman.forEach((z, j) => {
    if (h.getLayer("uydu-" + z)) h.setPaintProperty("uydu-" + z, "raster-opacity", j === uyduI ? 0.92 : 0)
  })
  if (t) {
    const f = new Intl.DateTimeFormat("tr-TR", { weekday: "short", hour: "2-digit", minute: "2-digit",
                                                 timeZone: d.veri.saat_dilimi })
    const dk = Math.round((Date.now() / 1000 - t) / 60)
    d.el.zaman.textContent = f.format(new Date(t * 1000)) + (dk > 0 ? `  ·  ${dk} dk önce` : "")
  } else {
    d.el.zaman.textContent = ""
  }
}

// ------------------------------------------------------------------ rüzgâr parçacıkları
function tuvalBoyutla(d) {
  const t = d.el.tuval
  const r = d.el.harita.getBoundingClientRect()
  const o = window.devicePixelRatio || 1
  t.width = r.width * o
  t.height = r.height * o
  t.style.width = r.width + "px"
  t.style.height = r.height + "px"
  d.ctx = t.getContext("2d")
  d.ctx.setTransform(o, 0, 0, o, 0, 0)
}

function tuvalTemizle(d) {
  if (d.ctx) d.ctx.clearRect(0, 0, d.el.tuval.width, d.el.tuval.height)
  d.parcaciklar = null
}

function ruzgarAl(r, lat, lon) {
  // ızgara üzerinde çift doğrusal ara değer: [u, v] (km/s, u doğuya, v kuzeye)
  const fi = (lat - r.lat0) / r.dlat, fj = (lon - r.lon0) / r.dlon
  if (fi < 0 || fj < 0 || fi > r.ny - 1 || fj > r.nx - 1) return null
  const i = Math.min(Math.floor(fi), r.ny - 2), j = Math.min(Math.floor(fj), r.nx - 2)
  const a = fi - i, b = fj - j
  const g = (m, ii, jj) => m[ii * r.nx + jj]
  const ara = (m) => (1 - a) * ((1 - b) * g(m, i, j) + b * g(m, i, j + 1)) + a * ((1 - b) * g(m, i + 1, j) + b * g(m, i + 1, j + 1))
  const u = ara(r.u), v = ara(r.v)
  return Number.isFinite(u) && Number.isFinite(v) ? [u, v] : null
}

function yeniParcacik(d, r) {
  const s = d.harita.getBounds()
  const lat0 = Math.max(s.getSouth(), r.lat0), lat1 = Math.min(s.getNorth(), r.lat0 + r.dlat * (r.ny - 1))
  const lon0 = Math.max(s.getWest(), r.lon0), lon1 = Math.min(s.getEast(), r.lon0 + r.dlon * (r.nx - 1))
  if (lat1 <= lat0 || lon1 <= lon0) return null
  return { lat: lat0 + Math.random() * (lat1 - lat0), lon: lon0 + Math.random() * (lon1 - lon0),
           yas: Math.floor(Math.random() * 90) }
}

function renk(hiz, koyu) {
  // km/s: sakin → kuvvetli
  const durak = koyu
    ? [[0, "rgba(255,255,255,0.55)"], [20, "rgba(165,216,255,0.8)"], [40, "rgba(255,224,102,0.9)"],
       [60, "rgba(255,146,43,0.95)"], [80, "rgba(250,82,82,1)"]]
    : [[0, "rgba(40,60,90,0.45)"], [20, "rgba(28,126,214,0.75)"], [40, "rgba(240,140,0,0.85)"],
       [60, "rgba(232,89,12,0.9)"], [80, "rgba(201,42,42,1)"]]
  let c = durak[0][1]
  for (const [e, r] of durak) if (hiz >= e) c = r
  return c
}

function parcacikBaslat(d) {
  tuvalBoyutla(d)
  const adim = () => {
    if (d.iptal) return
    d.raf = requestAnimationFrame(adim)
    const r = d.ruzgar
    if (!r || !d.ctx || d.harita.isMoving()) return
    const ctx = d.ctx
    const N = Math.round(Math.min(3500, d.el.harita.clientWidth * d.el.harita.clientHeight / 260))
    if (!d.parcaciklar) d.parcaciklar = Array.from({ length: N }, () => yeniParcacik(d, r)).filter(Boolean)
    // eski izleri yavaşça sil
    ctx.globalCompositeOperation = "destination-in"
    ctx.fillStyle = "rgba(0,0,0,0.9)"
    ctx.fillRect(0, 0, d.el.tuval.width, d.el.tuval.height)
    ctx.globalCompositeOperation = "source-over"
    ctx.lineWidth = 1.3
    const olcek = 0.0009 * Math.pow(2, 5.5 - d.harita.getZoom())   // ekranda benzer hız için yakınlığa göre
    for (let k = 0; k < d.parcaciklar.length; k++) {
      let p = d.parcaciklar[k]
      const w = ruzgarAl(r, p.lat, p.lon)
      if (!w || p.yas++ > 100) { d.parcaciklar[k] = yeniParcacik(d, r) || p; continue }
      const a = d.harita.project([p.lon, p.lat])
      p.lon += w[0] * olcek / Math.cos(p.lat * Math.PI / 180)
      p.lat += w[1] * olcek
      const b = d.harita.project([p.lon, p.lat])
      ctx.strokeStyle = renk(Math.hypot(w[0], w[1]), d.veri.koyu)
      ctx.beginPath()
      ctx.moveTo(a.x, a.y)
      ctx.lineTo(b.x, b.y)
      ctx.stroke()
    }
  }
  adim()
}
