import { describe, it, expect } from "vitest";
import { friendlyChainError } from "@/services/contracts/contract-utils";

describe("friendlyChainError", () => {
  it("never leaks the raw ethers blob for a dropped-connection CALL_EXCEPTION", () => {
    const err = {
      code: "CALL_EXCEPTION",
      data: null,
      reason: null,
      message:
        'missing revert data (action="call", data=null, reason=null, transaction={ "data": "0x7503e1b7..." }, version=6.17.0)',
    };
    const msg = friendlyChainError(err);
    expect(msg).not.toContain("missing revert data");
    expect(msg).not.toContain("0x7503e1b7");
    expect(msg).toContain("try again");
  });

  it("surfaces a genuine revert reason when one is present", () => {
    const err = { code: "CALL_EXCEPTION", data: "0x08c379a0", reason: "NOT_ACTIVE" };
    expect(friendlyChainError(err)).toContain("NOT_ACTIVE");
  });

  it("maps network-family errors to a connectivity message", () => {
    expect(friendlyChainError({ code: "NETWORK_ERROR", message: "boom" })).toContain("reach the blockchain");
    expect(friendlyChainError({ code: "TIMEOUT", message: "boom" })).toContain("reach the blockchain");
  });

  it("passes through short clean messages but falls back on raw blobs", () => {
    expect(friendlyChainError({ message: "You have no MATIC for gas." })).toBe("You have no MATIC for gas.");
    expect(friendlyChainError({ message: 'ugly {"json":true} payload' }, "fallback")).toBe("fallback");
    expect(friendlyChainError(null, "fallback")).toBe("fallback");
  });
});
