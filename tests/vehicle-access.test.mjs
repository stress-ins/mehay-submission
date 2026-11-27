import assert from "node:assert/strict";
import test from "node:test";
import { canSaveAssignments, visibleConversation } from "../src/vehicleAccess.ts";

test("conversation history stays hidden until the selected vehicle/session snapshot loads", () => {
  const oldVehicleEntry = { id: "old", text: "private prior vehicle entry" };
  const pendingOwnEntry = { id: "pending", text: "current mechanic draft" };

  assert.deepEqual(visibleConversation({
    activeContext: "vehicle-b:session-2", loadedContext: "vehicle-a:session-1", loadState: "ready",
    serverSnapshot: [oldVehicleEntry], pendingWrites: [],
  }), []);
  assert.deepEqual(visibleConversation({
    activeContext: "vehicle-b:session-2", loadedContext: "vehicle-b:session-2", loadState: "loading",
    serverSnapshot: [oldVehicleEntry], pendingWrites: [],
  }), []);
  assert.deepEqual(visibleConversation({
    activeContext: "vehicle-b:session-2", loadedContext: "vehicle-b:session-2", loadState: "error",
    serverSnapshot: [oldVehicleEntry], pendingWrites: [pendingOwnEntry],
  }), []);
});

test("authorized conversation snapshot replaces stale entries and retains only pending own writes", () => {
  const serverEntry = { id: "server", text: "authorized exchange" };
  const pendingEntry = { id: "pending", text: "pending own exchange" };
  assert.deepEqual(visibleConversation({
    activeContext: "vehicle-b:session-2", loadedContext: "vehicle-b:session-2", loadState: "ready",
    serverSnapshot: [serverEntry], pendingWrites: [serverEntry, pendingEntry],
  }), [serverEntry, pendingEntry]);
});

test("assignment updates require a successfully loaded snapshot for the selected vehicle", () => {
  assert.equal(canSaveAssignments({ selectedVehicleId: "vehicle-b", loadedVehicleId: "vehicle-a", loading: false, saving: false }), false);
  assert.equal(canSaveAssignments({ selectedVehicleId: "vehicle-b", loadedVehicleId: null, loading: false, saving: false }), false);
  assert.equal(canSaveAssignments({ selectedVehicleId: "vehicle-b", loadedVehicleId: "vehicle-b", loading: true, saving: false }), false);
  assert.equal(canSaveAssignments({ selectedVehicleId: "vehicle-b", loadedVehicleId: "vehicle-b", loading: false, saving: false }), true);
});
