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
    // Los tests con base real hacen varias consultas a Neon por test.
    testTimeout: 30_000,
    hookTimeout: 30_000,
    include: ["tests/unit/**/*.test.ts", "tests/isolation/**/*.test.ts", "tests/integration/**/*.test.ts"],
    // Los tests que usan la base real (tenant-scope) se saltean en CI hasta
    // que haya una base de pruebas dedicada (SKIP_DB_TESTS=1 en el workflow).
    exclude: process.env.SKIP_DB_TESTS
      ? ["tests/isolation/courses-scope.test.ts", "tests/isolation/tenant-scope.test.ts", "tests/integration/**"]
      : [],
    setupFiles: ["./tests/setup.ts"],
  },
});
