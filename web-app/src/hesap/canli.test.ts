import { describe, expect, it } from "vitest";
import { kareSec, radarAyikla, sonUyduZamani, uyduKareleri } from "./canli";

describe("radarAyikla", () => {
  it("kareleri zamana göre sıralar ve karo kalıbını kurar", () => {
    const r = radarAyikla({ host: "https://h", radar: { past: [{ time: 200, path: "/v2/radar/b" }, { time: 100, path: "/v2/radar/a" }, { bozuk: 1 }], nowcast: [] } });
    expect(r.kareler).toEqual([{ zaman: 100, karo: "https://h/v2/radar/a/256/{z}/{x}/{y}/2/1_1.png" }, { zaman: 200, karo: "https://h/v2/radar/b/256/{z}/{x}/{y}/2/1_1.png" }]);
    expect(r.kapsama).toBe("https://h/v2/coverage/0/256/{z}/{x}/{y}/0/0_0.png");
  });
  it("bozuk ya da boş yanıtta kare vermez", () => {
    expect(radarAyikla(null)).toEqual({ kareler: [], kapsama: null });
    expect(radarAyikla({ host: "h", radar: { past: [] } })).toEqual({ kareler: [], kapsama: null });
  });
});

describe("uydu", () => {
  it("yetenek belgesinden son görüntü zamanını okur", () => {
    expect(sonUyduZamani('<Dimension name="time" default="2026-11-15T07:30:00Z" units="ISO8601">')).toBe(Date.UTC(2026, 10, 15, 7, 30) / 1000);
    expect(sonUyduZamani("<x/>")).toBeNull();
    expect(sonUyduZamani('name="time" default="bozuk"')).toBeNull();
  });
  it("15 dakika aralıklı kareleri eskiden yeniye üretir", () => {
    const son = Date.UTC(2026, 10, 15, 7, 30) / 1000, k = uyduKareleri("mtg_fd:rgb_geocolour", son, 3);
    expect(k.map((x) => x.zaman)).toEqual([son - 1800, son - 900, son]);
    expect(k[2]!.karo).toContain("layers=mtg_fd:rgb_geocolour");
    expect(k[2]!.karo).toContain("bbox={bbox-epsg-3857}");
    expect(k[0]!.karo.endsWith("&time=2026-11-15T07:00:00Z")).toBe(true);
  });
});

describe("kareSec", () => {
  const k = [100, 700, 1300].map((zaman) => ({ zaman, karo: "" }));
  it("en yakın kareyi bulur", () => {
    expect(kareSec(k, 0)).toBe(0);
    expect(kareSec(k, 950)).toBe(1);
    expect(kareSec(k, 5000)).toBe(2);
    expect(kareSec([], 5)).toBe(-1);
  });
});
