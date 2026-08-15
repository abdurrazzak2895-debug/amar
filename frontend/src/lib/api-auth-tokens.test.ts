import { beforeEach, describe, expect, it } from "vitest";
import { clearSession, saveSession } from "./api";

describe("API session token storage", () => {
  beforeEach(() => {
    localStorage.clear();
  });

  it("keeps the current token synchronized across both storage keys", () => {
    saveSession({ accessToken: "fresh-access-token" });

    expect(localStorage.getItem("accessToken")).toBe("fresh-access-token");
    expect(localStorage.getItem("access_token")).toBe("fresh-access-token");
  });

  it("clears both current-token keys when the session is invalid", () => {
    saveSession({ accessToken: "stale-access-token" });
    localStorage.setItem("refreshToken", "refresh-token");
    localStorage.setItem("sessionId", "session-id");

    clearSession();

    expect(localStorage.getItem("accessToken")).toBeNull();
    expect(localStorage.getItem("access_token")).toBeNull();
    expect(localStorage.getItem("refreshToken")).toBeNull();
    expect(localStorage.getItem("sessionId")).toBeNull();
  });
});

