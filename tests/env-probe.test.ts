import { expect, test } from "vitest";
test("env probe", () => {
  console.log("URL:", process.env.DATABASE_URL);
  expect(1).toBe(1);
});
