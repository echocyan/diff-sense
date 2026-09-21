import { describe, it, expect } from "vitest";
import { getVersion } from "./version";

describe("getVersion", () => {
  it("返回有效的 semver 版本号", () => {
    const version = getVersion();
    expect(version).toMatch(/^\d+\.\d+\.\d+/);
  });
});
