import path from "node:path";
import react from "@vitejs/plugin-react";
import { defineConfig } from "vitest/config";

export default defineConfig({
  plugins: [react()],
  resolve: {
    alias: {
      "@": path.resolve(import.meta.dirname, "./src"),
    },
  },
  test: {
    environment: "node",
    include: ["tests/unit/**/*.test.ts", "tests/isolation/**/*.test.ts"],
    // Los tests que usan la base real (tenant-scope) se saltean en CI hasta
    // que haya una base de pruebas dedicada (SKIP_DB_TESTS=1 en el workflow).
    exclude: process.env.SKIP_DB_TESTS ? ["tests/isolation/tenant-scope.test.ts"] : [],
    setupFiles: ["./tests/setup.ts"],
  },
});
