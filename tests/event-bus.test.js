"use strict";

const { EventBus } = require("../src/events/event-bus");

describe("event bus delegation and messaging", () => {
  test("sendMessage emits AgentMessage envelope", () => {
    const bus = new EventBus({ log() {} });
    const evt = bus.sendMessage({ from: "a", to: "b", payload: { ping: true } });
    expect(evt.event_type).toBe("AgentMessage");
    expect(evt.from).toBe("a");
    expect(evt.to).toBe("b");
    expect(typeof evt.trace_id).toBe("string");
    expect(evt.parent_message_id).toBeNull();
  });

  test("delegateTask emits TaskDelegated event", () => {
    const bus = new EventBus({ log() {} });
    const evt = bus.delegateTask("orc", "exec", { action: "run" });
    expect(evt.event_type).toBe("TaskDelegated");
    expect(evt.payload.status).toBe("delegated");
    expect(evt.payload.task.action).toBe("run");
  });
});
