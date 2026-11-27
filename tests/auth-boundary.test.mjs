import test from "node:test";
import assert from "node:assert/strict";
import { createAuthBoundary } from "../src/authBoundary.ts";

class MemoryStorage {
  entries = new Map();
  get length() { return this.entries.size; }
  key(index) { return [...this.entries.keys()][index] ?? null; }
  getItem(key) { return this.entries.get(key) ?? null; }
  setItem(key, value) { this.entries.set(key, String(value)); }
  removeItem(key) { this.entries.delete(key); }
}

test("logout invalidates chat and drafts, aborts in-flight work, and preserves unrelated storage", () => {
  const storage = new MemoryStorage();
  storage.setItem("mehay-chat-user-a", JSON.stringify([{ role: "assistant", content: "private" }]));
  storage.setItem("mehay-draft-car-a", "private draft");
  storage.setItem("other-app-theme", "dark");
  const destinations = [];
  const auth = createAuthBoundary(storage, (path) => destinations.push(path));
  const requestGeneration = auth.generation;
  const controller = new AbortController();
  auth.track(controller);

  auth.begin("/mehay/login");

  assert.equal(controller.signal.aborted, true);
  assert.equal(auth.isCurrent(requestGeneration), false);
  assert.equal(auth.read("mehay-chat-user-a"), null);
  assert.equal(auth.read("mehay-draft-car-a"), null);
  assert.equal(auth.persist("mehay-chat-user-a", "late assistant response"), undefined);
  assert.equal(auth.persist("mehay-draft-car-a", "late draft effect"), undefined);
  assert.equal(storage.getItem("mehay-chat-user-a"), null);
  assert.equal(storage.getItem("mehay-draft-car-a"), null);
  assert.equal(storage.getItem("other-app-theme"), "dark");
  assert.deepEqual(destinations, ["/mehay/login"]);
});

test("401 invalidation blocks old identity writes while a new document session starts clean", () => {
  const storage = new MemoryStorage();
  storage.setItem("mehay-auth-user-id", "user-a");
  storage.setItem("mehay-chat-user-a", "old identity");
  const auth = createAuthBoundary(storage, () => {});
  const oldGeneration = auth.generation;
  auth.begin("/mehay/login?expired=1");

  assert.equal(auth.isCurrent(oldGeneration), false);
  auth.persist("mehay-chat-user-a", "late response from user A");
  const nextDocument = createAuthBoundary(storage, () => {});
  nextDocument.bindIdentity("user-b");
  assert.equal(nextDocument.read("mehay-chat-user-a"), null);
  assert.equal(nextDocument.read("mehay-auth-user-id"), "user-b");
  nextDocument.persist("mehay-chat-user-b", "new session only");
  assert.equal(storage.getItem("mehay-chat-user-b"), "new session only");
});

test("cold expired session clears prior drafts without blocking login, then login transition stays clean", () => {
  const storage = new MemoryStorage();
  storage.setItem("mehay-auth-user-id", "user-a");
  storage.setItem("mehay-chat-car-a", "completed private chat");
  storage.setItem("mehay-draft-car-a", "private request draft");
  const destinations = [];
  const auth = createAuthBoundary(storage, (path) => destinations.push(path));

  auth.resetIdentity();
  assert.equal(auth.transitioning, false);
  assert.equal(auth.read("mehay-chat-car-a"), null);
  assert.equal(auth.read("mehay-draft-car-a"), null);
  auth.bindIdentity("user-b");
  assert.equal(auth.read("mehay-auth-user-id"), "user-b");

  auth.persist("mehay-chat-car-b", "new identity data");
  auth.begin("/mehay/app");
  assert.equal(auth.read("mehay-chat-car-b"), null);
  assert.equal(auth.persist("mehay-draft-car-b", "late effect"), undefined);
  assert.deepEqual(destinations, ["/mehay/app"]);
});

test("sibling tab observes shared epoch once and blocks late assistant and draft writes", () => {
  const shared = new MemoryStorage();
  const tabAStorage = new MemoryStorage();
  const tabBStorage = new MemoryStorage();
  const tabCStorage = new MemoryStorage();
  const tabANavigations = [];
  const tabCNavigations = [];
  const tabA = createAuthBoundary(tabAStorage, (path) => tabANavigations.push(path), shared);
  const tabB = createAuthBoundary(tabBStorage, () => {}, shared);
  const tabC = createAuthBoundary(tabCStorage, (path) => tabCNavigations.push(path), shared);
  tabA.bindIdentity("user-a");
  tabA.persist("mehay-chat-car-1", "completed answer");
  tabA.persist("mehay-draft-car-1", "private draft");
  tabC.bindIdentity("user-a");
  tabC.persist("mehay-draft-car-2", "background draft");
  const inFlight = new AbortController();
  const release = tabA.track(inFlight);
  const requestGeneration = tabA.generation;

  tabB.bindIdentity("user-b");
  tabB.begin("/mehay/app");
  const newEpoch = shared.getItem("mehay-auth-epoch");
  assert.equal(tabA.syncEpoch(newEpoch, "/mehay/app"), false);
  assert.equal(tabC.catchUp("/mehay/app"), false);

  assert.equal(inFlight.signal.aborted, true);
  assert.equal(tabA.isCurrent(requestGeneration), false);
  assert.equal(tabA.read("mehay-chat-car-1"), null);
  assert.equal(tabA.persist("mehay-chat-car-1", "late assistant answer"), undefined);
  assert.equal(tabA.persist("mehay-draft-car-1", "late form effect"), undefined);
  assert.deepEqual(tabANavigations, ["/mehay/app"]);
  assert.equal(tabC.read("mehay-draft-car-2"), null);
  assert.deepEqual(tabCNavigations, ["/mehay/app"]);
  assert.equal(tabA.catchUp("/mehay/app"), false);
  release();
});

test("broadcast invalidates a sibling when shared epoch writes fail", () => {
  const shared = new MemoryStorage();
  shared.setItem = () => { throw new DOMException("quota exceeded", "QuotaExceededError"); };
  const tabAStorage = new MemoryStorage();
  const tabBStorage = new MemoryStorage();
  const tabANavigations = [];
  let receiveBroadcast;
  const tabA = createAuthBoundary(tabAStorage, (path) => tabANavigations.push(path), shared);
  const tabB = createAuthBoundary(tabBStorage, () => {}, shared, (epoch) => receiveBroadcast?.(epoch));
  tabA.bindIdentity("user-a");
  tabA.persist("mehay-draft-1", "private draft");
  tabB.bindIdentity("user-b");
  receiveBroadcast = (epoch) => tabA.syncEpoch(epoch, "/mehay/app");

  tabB.begin("/mehay/app");

  assert.equal(tabA.read("mehay-draft-1"), null);
  assert.deepEqual(tabANavigations, ["/mehay/app"]);
});

test("server principal reconciliation preserves same-user drafts and clears mismatched identity", () => {
  const storage = new MemoryStorage();
  storage.setItem("mehay-auth-user-id", "user-a");
  storage.setItem("mehay-draft-1", "same-user draft");
  const destinations = [];
  const auth = createAuthBoundary(storage, (path) => destinations.push(path));

  assert.equal(auth.reconcileIdentity("user-a", "/mehay/login"), true);
  assert.equal(auth.read("mehay-draft-1"), "same-user draft");
  assert.equal(auth.reconcileIdentity("user-b", "/mehay/login?expired=1"), false);
  assert.equal(auth.read("mehay-draft-1"), null);
  assert.deepEqual(destinations, ["/mehay/login?expired=1"]);
});
