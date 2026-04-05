"use strict";

const { ApprovalManager } = require("../src/orchestration/approval-manager");

describe("ApprovalManager", () => {
  test("issues and validates token", () => {
    const mgr = new ApprovalManager({ runtime: { hitl: { token_ttl_seconds: 300 } } }, { log() {} });
    const token = mgr.issue({
      agentId: "a1",
      skillId: "s1",
      reason: "manual approval",
      traceId: "t1",
    });

    const check = mgr.validate(token.token, { agentId: "a1", skillId: "s1" });
    expect(check.ok).toBe(true);
  });

  test("consume marks token as used", () => {
    const mgr = new ApprovalManager({ runtime: { hitl: { token_ttl_seconds: 300 } } }, { log() {} });
    const token = mgr.issue({
      agentId: "a1",
      skillId: "s1",
      reason: "manual approval",
      traceId: "t1",
    });

    const consumed = mgr.consume(token.token, { agentId: "a1", skillId: "s1", traceId: "t1" });
    expect(consumed.ok).toBe(true);

    const checkAgain = mgr.validate(token.token, { agentId: "a1", skillId: "s1" });
    expect(checkAgain.ok).toBe(false);
    expect(checkAgain.code).toBe("TOKEN_ALREADY_USED");
  });
});
