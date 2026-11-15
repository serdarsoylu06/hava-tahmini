import react from "@vitejs/plugin-react";
import { defineConfig } from "vitest/config";

// Cloudflare Pages: derleme kökü web-app/, çıktı klasörü dist/.
export default defineConfig({
  plugins: [react()],
  // Harita paketi işçi betiğini ve .wasm dosyasını kendi klasöründen `new URL(…, import.meta.url)` ile yükler;
  // geliştirme sunucusunun ön-paketlemesi bu yolları bozduğu için paket ön-paketlemenin dışında tutulur.
  optimizeDeps: { exclude: ["@openmeteo/weather-map-layer"] },
  worker: { format: "es" },
  // Büyük kitaplıklar ayrı parçalarda, yalnızca gerektiğinde iner: grafikler (ECharts, sıkıştırılmış ~190 kB) ilk
  // grafikle, harita (MapLibre + ızgara okuyucu, sıkıştırılmış ~330 kB) Uzman mod açılınca. Ana parça ~90 kB.
  build: { chunkSizeWarningLimit: 1300 },
  test: { environment: "node", include: ["src/**/*.test.ts"] },
});
