import { describe, expect, it } from "vitest";
import { alanYolu, araliklar, bantYolu, duzYol, egimler, eksen, eksenYazisi, enYakinSira, etiketSec, guzelAdim, type Nokta, parcalar, xKonum, yumusakYol } from "./olcek";

describe("guzelAdim", () => {
  it("1, 2 ya da 5'in onluk katını verir", () => {
    expect(guzelAdim(6, 3)).toBe(2);
    expect(guzelAdim(9, 3)).toBe(5);
    expect(guzelAdim(30, 3)).toBe(10);
    expect(guzelAdim(1, 3)).toBe(0.5);
    expect(guzelAdim(0.3, 3)).toBeCloseTo(0.1, 12);
    expect(guzelAdim(0, 3)).toBe(1);
  });
});

describe("eksen", () => {
  it("değerleri yuvarlak sınırlarla kapsar", () => {
    const e = eksen([7.8, 9, 13.6]);
    expect(e.alt).toBe(6); expect(e.ust).toBe(14); expect(e.cizgiler).toEqual([6, 8, 10, 12, 14]);
  });
  it("basınçta sıfırdan başlamaz", () => {
    const e = eksen([1012, 1021]);
    expect(e.alt).toBe(1010); expect(e.ust).toBe(1025); expect(e.cizgiler).toEqual([1010, 1015, 1020, 1025]);
  });
  it("taban verilirse oradan başlar; hepsi sıfırsa yine bir aralık verir", () => {
    expect(eksen([0, 0, 0], { taban: 0 })).toMatchObject({ alt: 0, ust: 1 });
    expect(eksen([0.2, 3.4], { taban: 0 }).alt).toBe(0);
  });
  it("elle verilen çizgileri kullanır", () => {
    expect(eksen([3, 40], { taban: 0, tavan: 100, cizgiler: [0, 50, 100] })).toMatchObject({ alt: 0, ust: 100, cizgiler: [0, 50, 100] });
  });
  it("eksik ve sonsuz değerleri atlar; boş veride 0–1 döner", () => {
    expect(eksen([null, NaN, 4, Infinity, 6]).alt).toBe(4);
    expect(eksen([null, null])).toMatchObject({ alt: 0, ust: 1 });
  });
  it("kayan nokta artığı bırakmaz", () => {
    expect(eksen([0.1, 0.7]).cizgiler).toEqual([0, 0.2, 0.4, 0.6, 0.8]);
  });
});

describe("eksenYazisi", () => {
  it("adıma göre ondalık hane ve virgül kullanır", () => {
    expect(eksenYazisi(10, 5)).toBe("10");
    expect(eksenYazisi(0.5, 0.5)).toBe("0,5");
    expect(eksenYazisi(0.25, 0.05)).toBe("0,25");
    expect(eksenYazisi(-5, 5)).toBe("−5");
  });
});

describe("xKonum ve enYakinSira", () => {
  it("bantsız düzende uçlar kenardadır", () => {
    expect(xKonum(0, 5, 40, 200, false)).toBe(40);
    expect(xKonum(4, 5, 40, 200, false)).toBe(240);
  });
  it("bantlı düzende değer şeridinin ortasındadır", () => {
    expect(xKonum(0, 4, 40, 200, true)).toBe(65);
    expect(xKonum(3, 4, 40, 200, true)).toBe(215);
  });
  it("konumdan sıraya dönüş, sıradan konuma gidişin tersidir", () => {
    for (const bant of [true, false]) for (let i = 0; i < 24; i++) expect(enYakinSira(xKonum(i, 24, 30, 317, bant), 24, 30, 317, bant)).toBe(i);
  });
  it("çizim alanının dışındaki konumlar uçlara sıkıştırılır", () => {
    expect(enYakinSira(-50, 10, 40, 200, true)).toBe(0);
    expect(enYakinSira(900, 10, 40, 200, false)).toBe(9);
  });
});

describe("parcalar", () => {
  it("eksik değerlerde kırılır", () => {
    const p = parcalar([1, 2, null, 4, NaN, 6, 7], (i) => i * 10, (v) => v);
    expect(p.map((q) => q.length)).toEqual([2, 1, 2]);
    expect(p[2]).toEqual([[50, 6], [60, 7]]);
  });
});

/** Kübik Bezier parçasını örnekler (yolun içindeki C komutlarından). */
function ornekle(yol: string): Nokta[] {
  const sayilar = [...yol.matchAll(/-?\d+(?:\.\d+)?/g)].map((m) => Number(m[0]));
  const noktalar: Nokta[] = [];
  let x0 = sayilar[0]!, y0 = sayilar[1]!;
  for (let k = 2; k + 5 < sayilar.length + 1; k += 6) {
    const [x1, y1, x2, y2, x3, y3] = sayilar.slice(k, k + 6) as [number, number, number, number, number, number];
    for (let t = 0; t <= 1.0001; t += 0.05) {
      const u = 1 - t;
      noktalar.push([u ** 3 * x0 + 3 * u * u * t * x1 + 3 * u * t * t * x2 + t ** 3 * x3, u ** 3 * y0 + 3 * u * u * t * y1 + 3 * u * t * t * y2 + t ** 3 * y3]);
    }
    x0 = x3; y0 = y3;
  }
  return noktalar;
}

describe("yumusakYol", () => {
  const p: Nokta[] = [[0, 10], [10, 10], [20, 40], [30, 41], [40, 5], [50, 5], [60, 30]];
  it("bütün noktalardan geçer", () => {
    const yol = yumusakYol(p);
    for (const [x, y] of p) expect(yol).toContain(`${x} ${y}`);
  });
  it("iki nokta arasında o iki değerin dışına taşmaz (uydurma tepe ya da çukur yok)", () => {
    const egri = ornekle(yumusakYol(p));
    for (const [x, y] of egri) {
      const i = Math.min(Math.floor(x / 10 + 1e-9), p.length - 2);
      const a = p[i]![1], b = p[i + 1]![1];
      expect(y).toBeGreaterThanOrEqual(Math.min(a, b) - 0.06);
      expect(y).toBeLessThanOrEqual(Math.max(a, b) + 0.06);
    }
  });
  it("yerel tepe ve çukurlarda eğim sıfırdır", () => {
    const m = egimler(p);
    expect(m[3]).toBe(0);            // tepe (41)
    expect(m[4]).toBe(0);            // düzlük başlangıcı
    expect(m[0]).toBe(0);
  });
  it("iki noktada düz çizgidir", () => {
    expect(yumusakYol([[0, 0], [10, 5]])).toBe("M0 0L10 5");
  });
});

describe("kapalı yollar", () => {
  it("alan tabana iner ve kapanır", () => {
    expect(alanYolu([[0, 5], [10, 2]], 20, false)).toBe("M0 5L10 2L10 20L0 20Z");
    expect(alanYolu([], 20, false)).toBe("");
  });
  it("bant üst sınırdan gidip alt sınırdan döner", () => {
    expect(bantYolu([[0, 1], [10, 2]], [[0, 5], [10, 6]])).toBe("M0 1L10 2L10 6L0 5Z");
  });
  it("düz yol ondalığı bir haneye yuvarlar", () => {
    expect(duzYol([[0.04, 1.26], [2, 3]])).toBe("M0 1.3L2 3");
  });
});

describe("etiketSec", () => {
  const aday = (sira: number, x: number, oncelik = false) => ({ sira, x, genislik: 40, oncelik });
  it("üst üste binenleri eler", () => {
    expect(etiketSec([aday(0, 0), aday(1, 20), aday(2, 50), aday(3, 70), aday(4, 100)])).toEqual([0, 2, 4]);
  });
  it("önceliklileri (gün başlarını) ötekilerden önce yerleştirir", () => {
    expect(etiketSec([aday(0, 0), aday(1, 30, true), aday(2, 80), aday(3, 130, true)])).toEqual([1, 2, 3]);
  });
});

describe("araliklar", () => {
  it("ardışık işaretleri aralığa çevirir", () => {
    expect(araliklar([true, true, false, true, false, false, true, true, true])).toEqual([[0, 1], [3, 3], [6, 8]]);
    expect(araliklar([false, false])).toEqual([]);
  });
});
