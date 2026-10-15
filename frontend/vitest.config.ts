import path from "node:path";
import { defineConfig } from "vitest/config";

export default defineConfig({
  resolve: {
    alias: {
      "@": path.resolve("."),
    },
  },
  test: {
    environment: "node",
    include: [
      "lib/**/*.test.ts",
      "components/*.test.tsx",
      "app/listings/**/*.test.tsx",
      "app/owner/dashboard/_components/*.test.tsx",
      "app/owner/listings/new/_components/*.test.tsx",
    ],
  },
});
