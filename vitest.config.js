import { defineConfig } from "vitest/config";

// Unit tests live next to the code (src/**/*.test.js|jsx) and run in node, as
// before; src/account/account.test.js asks for jsdom itself with a pragma.
// The database tests under tests/db are node:test files against the local
// Supabase stack (npm run test:db) and are not Vitest suites.
export default defineConfig({
  test: {
    include: ["src/**/*.test.{js,jsx}"],
  },
});
