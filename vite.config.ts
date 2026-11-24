import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import tailwindcss from "@tailwindcss/vite";

// @ts-expect-error process is a nodejs global
const host = process.env.TAURI_DEV_HOST;

// https://vite.dev/config/
export default defineConfig(async () => ({
  plugins: [react(), tailwindcss()],

  build: {
    rollupOptions: {
      output: {
        // Tách vendor để chunk chính nhỏ và cache tốt hơn.
        manualChunks(id: string) {
          if (!id.includes("node_modules")) return undefined;
          if (id.includes("@phosphor-icons")) return "vendor-phosphor";
          if (id.includes("@dnd-kit")) return "vendor-dnd";
          if (id.includes("@tanstack")) return "vendor-tanstack";
          if (id.includes("@tauri-apps")) return "vendor-tauri";
          if (/node_modules[\/](react|react-dom|scheduler)[\/]/.test(id)) return "vendor-react";
          return undefined;
        },
      },
    },
  },

  // Vite options tailored for Tauri development and only applied in `tauri dev` or `tauri build`
  //
  // 1. prevent Vite from obscuring rust errors
  clearScreen: false,
  // 2. tauri expects a fixed port, fail if that port is not available
  server: {
    port: 1420,
    strictPort: true,
    host: host || false,
    hmr: host
      ? {
          protocol: "ws",
          host,
          port: 1421,
        }
      : undefined,
    watch: {
      // 3. tell Vite to ignore watching `src-tauri`
      ignored: ["**/src-tauri/**"],
    },
  },
}));
