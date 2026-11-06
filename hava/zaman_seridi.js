// Zaman şeridi bileşeni (Streamlit Custom Components v2).
// Python saatlik veriyi gönderir; seçim (saate tıklama) ve telefon/masaüstü düzeni tamamen tarayıcıda.
// Masaüstü: saatler sütun, değişkenler alt alta şerit. Telefon (<720 px): üstte kaydırılan mini şerit, altta saat listesi.

const DURUM = new WeakMap()

const kac = (s) => String(s).replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]))

const IKON = {
  gunes: '<circle cx="12" cy="12" r="4"/><path d="M12 3v2M12 19v2M3 12h2M19 12h2M5.6 5.6l1.4 1.4M17 17l1.4 1.4M5.6 18.4 7 17M17 7l1.4-1.4"/>',
  ay: '<path d="M20 14.5A8 8 0 1 1 9.5 4a6.5 6.5 0 0 0 10.5 10.5z"/>',
  parcali: '<path d="M8 4v1.5M3.5 8.5H5M4.8 5.3l1 1"/><path d="M11.5 8.8A4 4 0 0 0 5.2 11"/><path d="M8 19h9a3.5 3.5 0 0 0 .4-7 5 5 0 0 0-9.6 1.4A2.8 2.8 0 0 0 8 19z"/>',
  bulut: '<path d="M7 18h10a4 4 0 0 0 .5-8 6 6 0 0 0-11.4 1.6A3.3 3.3 0 0 0 7 18z"/>',
  yagmur: '<path d="M7 14h10a4 4 0 0 0 .5-8 6 6 0 0 0-11.4 1.6A3.3 3.3 0 0 0 7 14z"/><path d="M8 17l-1 3M12 17l-1 3M16 17l-1 3"/>',
  kar: '<path d="M7 14h10a4 4 0 0 0 .5-8 6 6 0 0 0-11.4 1.6A3.3 3.3 0 0 0 7 14z"/><path d="M8 18h.01M12 20h.01M16 18h.01"/>',
  sis: '<path d="M4 9h16M3 13h18M5 17h14"/>',
  simsek: '<path d="M7 14h10a4 4 0 0 0 .5-8 6 6 0 0 0-11.4 1.6A3.3 3.3 0 0 0 7 14z"/><path d="m12 14-2 4h4l-2 4"/>',
}
const ikon = (tur) => `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">${IKON[tur] || IKON.bulut}</svg>`
const ok = (yon) => `<svg viewBox="0 0 24 24" aria-hidden="true" style="transform: rotate(${yon}deg)"><path d="M12 3v18M6 15l6 6 6-6" fill="none" stroke="currentColor" stroke-width="2.4"/></svg>`

const sisMi = (h) => h.t - h.d <= 1 && h.w < 10
const sertMi = (h) => h.g >= 40 || h.w >= 25

function egilim(s, i) { return Math.round((s[i].pr - s[Math.max(0, i - 3)].pr) * 10) / 10 }

function bolgeler(s) {
  // ardışık saatleri tek uyarı bandında birleştir
  const tur = [["sis", sisMi, "Sis riski"], ["sert", sertMi, "Sert rüzgâr"], ["yagis", (h) => h.p >= 60, "Yağış olasılığı yüksek"]]
  const sonuc = []
  for (const [ad, kosul, metin] of tur) {
    let bas = -1
    s.forEach((h, i) => {
      if (kosul(h) && bas < 0) bas = i
      if ((!kosul(h) || i === s.length - 1) && bas >= 0) {
        const son = kosul(h) ? i : i - 1
        const ek = ad === "sert" ? ` · hamle ${Math.max(...s.slice(bas, son + 1).map((x) => x.g))} km/s`
          : ad === "yagis" ? ` · %${Math.max(...s.slice(bas, son + 1).map((x) => x.p))}` : ""
        sonuc.push({ ad, bas, son, metin: metin + ek })
        bas = -1
      }
    })
  }
  return sonuc
}

function ipucu(s, i) {
  const h = s[i], tr = egilim(s, i)
  if (sisMi(h)) return `Sıcaklık ile çiy noktası arasında yalnızca ${h.t - h.d}° var: hava doymak üzere. Rüzgâr da zayıf (${h.w} km/s), sis ya da alçak bulut oluşabilir.`
  if (sertMi(h)) return `Rüzgâr ${h.w} km/s, hamleler ${h.g} km/s. Hamle ortalamanın ${(h.g / Math.max(h.w, 1)).toFixed(1)} katı: hava türbülanslı.${tr <= -2 ? " Basınç da düşüyor: bir alçak basınç sistemi yaklaşıyor." : ""}`
  if (tr <= -2) return `Basınç 3 saatte ${Math.abs(tr)} hPa düştü. Tek başına değeri değil bu eğilimi izle: hızlı düşüş kötüleşen havanın en güvenilir habercisidir.`
  if (h.p >= 50) return `Yağış olasılığı %${h.p}${h.mm ? `, beklenen miktar ${h.mm} mm` : ""}. Olasılık yüksek ama miktar azsa hafif ama kesin yağış; ikisi de yüksekse sağanak beklenir.`
  if (h.gece && h.t - h.d <= 3) return `Gece ve hava nemli (sıcaklık − çiy ${h.t - h.d}°). Rüzgâr kesilirse sabaha karşı sis ya da kırağı oluşabilir.`
  return "Bu saatte belirgin bir risk yok. Sıcaklık ile çiy noktası arasındaki farkı ve basıncın eğilimini izlemeye devam et."
}

function degerler(s, i) {
  const h = s[i], tr = egilim(s, i)
  const isaret = tr > 0 ? "+" : tr < 0 ? "−" : "±"
  const hucre = (ad, dg) => `<div><div class="ad">${ad}</div><div class="dg">${dg}</div></div>`
  return `<div class="zs-degerler">${[
    hucre("Hissedilen", `${h.a}°`), hucre("Yağış", `%${h.p}${h.mm ? ` <small>${h.mm} mm</small>` : ""}`),
    hucre("Rüzgâr / hamle", `${h.w} / ${h.g}`), hucre("Çiy noktası", `${h.d}°`),
    hucre("Sıcaklık − çiy", `${h.t - h.d}°`),
    hucre("Basınç, 3 saat", `${Math.round(h.pr)} <span style="color: ${tr <= -2 ? "var(--uyari)" : "var(--soluk)"}">${isaret}${Math.abs(tr)}</span>`),
  ].join("")}</div>`
}

function masaustu(d, sec) {
  const s = d.saatler, n = s.length, W = 1000, cw = W / n
  const x = (i) => i * cw + cw / 2
  const tum = s.flatMap((h) => [h.t, h.a, h.d])
  const lo = Math.min(...tum) - 1, hi = Math.max(...tum) + 1
  const y = (v) => 8 + (hi - v) / (hi - lo) * 104
  const yol = (k) => s.map((h, i) => `${i ? "L" : "M"}${x(i).toFixed(1)} ${y(h[k]).toFixed(1)}`).join(" ")
  const geceler = s.map((h, i) => h.gece ? `<rect x="${i * cw}" y="0" width="${cw + 0.5}" height="120" fill="var(--gece)"/>` : "").join("")
  const imlec = (h) => `<rect x="${sec * cw}" y="0" width="${cw}" height="${h}" fill="var(--vurgu-zemin)"/>`
  const sisler = s.map((h, i) => sisMi(h) ? `<rect x="${i * cw}" y="${y(h.t) - 4}" width="${cw}" height="${Math.max(y(h.d) - y(h.t) + 8, 10)}" fill="var(--mavi)" opacity="0.14"/>` : "").join("")
  const cubuk = s.map((h, i) => `<rect x="${x(i) - cw * 0.35}" y="${60 - h.p / 100 * 56}" width="${cw * 0.7}" height="${h.p / 100 * 56}" fill="var(--yagis)"/>`).join("")
  const prs = s.map((h) => h.pr), plo = Math.min(...prs) - 1, phi = Math.max(...prs) + 1
  const py = (v) => 6 + (phi - v) / (phi - plo) * 54
  const pyol = s.map((h, i) => `${i ? "L" : "M"}${x(i).toFixed(1)} ${py(h.pr).toFixed(1)}`).join(" ")
  const dusus = s.map((h, i) => egilim(s, i) <= -2 ? `<rect x="${i * cw}" y="0" width="${cw}" height="66" fill="var(--uyari)" opacity="0.10"/>` : "").join("")
  const pmin = Math.min(...prs), pi = prs.indexOf(pmin)
  const dipVar = pi >= 3 && pi <= n - 4
  const bol = bolgeler(s)
  const h = s[sec]

  const saatler = s.map((h, i) => `<button type="button" class="zs-saat${i === sec ? " secili" : ""}" data-i="${i}" aria-label="${kac(h.uzun)}, ${h.t} derece, ${kac(h.durum)}" aria-pressed="${i === sec}">
      <span class="s mono${i === 0 ? " simdi" : ""}">${h.gun ? `<b>${h.gun}</b>` : ""}${i === 0 ? "ŞİMDİ" : kac(h.saat)}</span>${ikon(h.tur)}<span class="t mono">${h.t}°</span></button>`).join("")
  const ruzgar = s.map((h, i) => `<span class="zs-ruzgar${i === sec ? " secili" : ""}" style="color: ${sertMi(h) ? "var(--uyari)" : "var(--ruzgar)"}">${ok(h.yon)}
      <span class="w mono${sertMi(h) ? " sert" : ""}">${h.w}</span><span class="g mono${h.g >= 40 ? " sert" : ""}">${h.g}</span></span>`).join("")
  // Çakışan uyarılar alt alta ayrı şeritlere dizilir (üst üste binip okunmaz olmasınlar)
  const serit = []
  const sira = [...bol].sort((a, b) => a.bas - b.bas).map((b) => {
    let k = serit.findIndex((son) => son < b.bas)
    if (k < 0) { k = serit.length; serit.push(0) }
    serit[k] = b.son
    return { ...b, k }
  })
  const uyarilar = sira.length ? sira.map((b) => `<button type="button" class="${b.ad}" data-i="${b.bas}" style="left: ${b.bas / n * 100}%; width: ${(b.son - b.bas + 1) / n * 100}%; top: ${6 + b.k * 28}px" title="${kac(b.metin)}">${kac(b.metin)}</button>`).join("")
    : `<div class="zs-bos">Bu saatlerde sis, sert rüzgâr ya da yüksek yağış olasılığı görünmüyor.</div>`

  return `<div class="zs-masa">
  <div class="zs-kart">
    <div class="zs-ust"><span>Bir saate tıkla: bütün şeritler o saatte hizalanır. Mavi zemin gece.</span>
      <span class="zs-lejant"><span><i></i>Sıcaklık</span><span><i class="his"></i>Hissedilen</span><span><i class="cig"></i>Çiy noktası</span></span></div>
    <div class="zs-kaydir"><div class="zs-izgara" style="--n: ${n}">
      <div class="zs-ad ilk">Saat</div><div class="zs-satir ilk zs-sutunlar">${saatler}</div>
      <div class="zs-ad">Sıcaklık<small>°C</small></div>
      <div class="zs-satir"><svg class="serit" viewBox="0 0 ${W} 120" preserveAspectRatio="none" style="height: 120px" role="img" aria-label="Sıcaklık, hissedilen sıcaklık ve çiy noktası">
        ${geceler}${imlec(120)}${sisler}
        <path d="${yol("a")}" fill="none" stroke="var(--his)" stroke-width="1.5" stroke-dasharray="1.5 3" stroke-linecap="round" vector-effect="non-scaling-stroke"/>
        <path d="${yol("d")}" fill="none" stroke="var(--cig)" stroke-width="1.5" stroke-dasharray="4 3" vector-effect="non-scaling-stroke"/>
        <path d="${yol("t")}" fill="none" stroke="var(--sicak)" stroke-width="2.5" vector-effect="non-scaling-stroke"/></svg></div>
      <div class="zs-ad">Yağış<small>olasılık %</small></div>
      <div class="zs-satir"><svg class="serit" viewBox="0 0 ${W} 60" preserveAspectRatio="none" style="height: 60px" role="img" aria-label="Yağış olasılığı">${imlec(60)}${cubuk}</svg></div>
      <div class="zs-ad">Rüzgâr<small>ortalama / hamle<br>km/s, geldiği yön</small></div>
      <div class="zs-satir zs-sutunlar">${ruzgar}</div>
      <div class="zs-ad">Basınç<small>hPa · eğilimi önemli</small></div>
      <div class="zs-satir"><svg class="serit" viewBox="0 0 ${W} 66" preserveAspectRatio="none" style="height: 66px" role="img" aria-label="Deniz seviyesi basıncı">
        ${imlec(66)}${dusus}<path d="${pyol}" fill="none" stroke="var(--metin)" stroke-width="2" vector-effect="non-scaling-stroke"/></svg>
        <div class="zs-dip mono"><span style="left: 0; transform: none; color: var(--soluk); font-weight: 400">${Math.round(s[0].pr)} hPa</span>${dipVar ? `<span style="left: ${(pi + 0.5) / n * 100}%">dip ${Math.round(pmin)} hPa</span>` : ""}</div></div>
      <div class="zs-ad">Dikkat</div>
      <div class="zs-satir zs-uyari" style="height: ${Math.max(1, serit.length) * 28 + 12}px">${uyarilar}</div>
    </div></div>
  </div>
  <div class="zs-kart zs-ayrinti">
    <div class="zs-bas"><div class="zs-etiket">SEÇİLİ SAAT · ${kac(h.uzun.toLocaleUpperCase("tr"))}</div>
      <div class="zs-buyuk">${h.t}°</div><div class="zs-durum">${kac(h.durum)}</div></div>
    ${degerler(s, sec)}
    <div class="zs-neye"><div class="zs-etiket vurgu">BU SAATTE NEYE BAKMALI?</div><div class="zs-ipucu">${kac(ipucu(s, sec))}</div></div>
  </div>
</div>`
}

function telefon(d, sec) {
  const s = d.saatler, n = s.length
  const tlo = Math.min(...s.map((h) => h.t)) - 1, thi = Math.max(...s.map((h) => h.t)) + 1
  const sy = (t) => 4 + (thi - t) / (thi - tlo) * 30
  const yol = s.map((h, i) => `${i ? "L" : "M"}${i * 30 + 15} ${sy(h.t).toFixed(1)}`).join(" ")
  const zemin = s.map((h, i) => h.gece ? `<rect x="${i * 30}" y="0" width="30" height="38" fill="var(--gece)"/>` : "").join("")
  const mini = s.map((h, i) => `<button type="button" class="${i === sec ? "secili" : ""}" data-i="${i}" aria-label="${kac(h.uzun)}, ${h.t} derece, yağış yüzde ${h.p}">
      <span class="t mono">${h.t}°</span><span class="cubuk"><i style="height: ${Math.max(h.p / 100 * 22, 1)}px"></i></span><span class="s mono">${h.gun || kac(h.saat)}</span></button>`).join("")
  const bol = bolgeler(s)
  const bant = (i) => bol.filter((b) => b.bas === i).map((b) => `<div class="bant ${b.ad}"><i></i>${kac(b.metin)} · ${kac(s[b.bas].uzun)}–${kac(s[b.son].uzun.split(" ")[1])}</div>`).join("")
  const satirlar = s.slice(0, 24).map((h, i) => `<li>${bant(i)}
      <button type="button" class="satir${h.gece ? " gece" : ""}${i === sec ? " acik" : ""}" data-i="${i}" aria-expanded="${i === sec}">
        <span class="s mono"${i === 0 ? ' style="font-weight: 600"' : ""}>${i === 0 ? "Şimdi" : `${h.gun ? h.gun + " " : ""}${kac(h.saat)}`}</span>${ikon(h.tur)}
        <span class="t mono">${h.t}°</span><span class="yb"><i style="width: ${Math.max(h.p, 2)}%"></i></span>
        <span class="w mono${sertMi(h) ? " sert" : ""}">${h.w} km/s</span></button>
      ${i === sec ? `<div class="zs-acilir">${degerler(s, i)}<div class="zs-ipucu">${kac(ipucu(s, i))}</div></div>` : ""}</li>`).join("")
  return `<div class="zs-tel">
  <div class="zs-mini"><div class="zs-mini-ic" style="--n: ${n}">
    <svg viewBox="0 0 ${n * 30} 38" style="width: ${n * 30}px; height: 38px; display: block" aria-hidden="true">${zemin}<path d="${yol}" fill="none" stroke="var(--sicak)" stroke-width="2.2"/></svg>
    <div class="zs-mini-sutunlar">${mini}</div></div></div>
  <p class="zs-not">Şeridi yana kaydır. Bir saate dokun: aşağıda ayrıntısı açılır. Mavi çubuk yağış olasılığı.</p>
  <ol class="zs-liste zs-kart" aria-label="Saat saat tahmin">${satirlar}</ol>
</div>`
}

function ciz(kok, d, durum) {
  const kaydir = [...kok.querySelectorAll(".zs-kaydir, .zs-mini")].map((e) => e.scrollLeft)
  const kap = kok.querySelector(".zs") || kok
  kap.className = "zs" + (d.koyu ? " koyu" : "")
  kap.innerHTML = `<p class="zs-ozet">${kac(d.ozet)}</p>${masaustu(d, durum.sec)}${telefon(d, durum.sec)}`
  kap.querySelectorAll(".zs-kaydir, .zs-mini").forEach((e, k) => { e.scrollLeft = kaydir[k] || 0 })
  kap.querySelectorAll("[data-i]").forEach((b) => {
    b.addEventListener("click", () => {
      const i = Number(b.dataset.i)
      // telefonda açık satıra yeniden dokunmak onu kapatmaz; seçim her zaman bir saatte durur
      durum.sec = Math.min(i, d.saatler.length - 1)
      ciz(kok, d, durum)
    })
  })
}

export default function (component) {
  const { data, parentElement } = component
  let durum = DURUM.get(parentElement)
  if (!durum) { durum = { sec: 0 }; DURUM.set(parentElement, durum) }
  if (!data || !data.saatler || !data.saatler.length) return
  if (durum.sec >= data.saatler.length) durum.sec = 0
  ciz(parentElement, data, durum)
}
