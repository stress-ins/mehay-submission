type StorageLike = Pick<Storage, "length" | "key" | "getItem" | "setItem" | "removeItem">;
export const AUTH_EPOCH_KEY = "mehay-auth-epoch";
export const AUTH_CHANNEL_NAME = "mehay-auth";

export function createAuthBoundary(
  storage: StorageLike,
  navigate: (path: string) => void,
  sharedStorage?: Pick<Storage, "getItem" | "setItem">,
  broadcast?: (epoch: string) => void,
) {
  let generation = 0;
  let transitioning = false;
  const requests = new Set<AbortController>();
  let seenEpoch: string | null = readSharedEpoch();
  function readSharedEpoch() {
    try { return sharedStorage?.getItem(AUTH_EPOCH_KEY) ?? null; }
    catch { return null; }
  }
  function publishEpoch() {
    if (!sharedStorage) return;
    seenEpoch = crypto.randomUUID();
    try { sharedStorage?.setItem(AUTH_EPOCH_KEY, seenEpoch); }
    catch { /* The server-side principal check remains authoritative. */ }
    broadcast?.(seenEpoch);
  }
  function clearPrivateState() {
    for (let index = storage.length - 1; index >= 0; index -= 1) {
      const key = storage.key(index);
      if (key?.startsWith("mehay-")) storage.removeItem(key);
    }
  }
  function invalidate() {
    generation += 1;
    for (const controller of requests) controller.abort();
    requests.clear();
    clearPrivateState();
  }
  function syncEpoch(epoch: string | null, currentUrl: string) {
    if (transitioning) return false;
    if (epoch === seenEpoch) return true;
    seenEpoch = epoch;
    transitioning = true;
    invalidate();
    navigate(currentUrl);
    return false;
  }

  return {
    get generation() { return generation; },
    get transitioning() { return transitioning; },
    isCurrent(requestGeneration: number) {
      return !transitioning && requestGeneration === generation;
    },
    track(controller: AbortController) {
      requests.add(controller);
      return () => requests.delete(controller);
    },
    persist(key: string, value: string) {
      if (!transitioning) storage.setItem(key, value);
    },
    remove(key: string) {
      if (!transitioning) storage.removeItem(key);
    },
    read(key: string) {
      return transitioning ? null : storage.getItem(key);
    },
    resetIdentity() {
      if (!transitioning) invalidate();
    },
    bindIdentity(userId: string) {
      if (transitioning) return;
      if (storage.getItem("mehay-auth-user-id") !== userId) invalidate();
      storage.setItem("mehay-auth-user-id", userId);
    },
    reconcileIdentity(userId: string | null, currentUrl: string) {
      if (transitioning) return false;
      if (storage.getItem("mehay-auth-user-id") === userId && userId !== null) return true;
      transitioning = true;
      invalidate();
      publishEpoch();
      navigate(currentUrl);
      return false;
    },
    get identity() {
      return transitioning ? null : storage.getItem("mehay-auth-user-id");
    },
    syncEpoch,
    catchUp(currentUrl: string) {
      return syncEpoch(readSharedEpoch(), currentUrl);
    },
    begin(path: string) {
      if (transitioning) return;
      transitioning = true;
      invalidate();
      publishEpoch();
      navigate(path);
    },
  };
}
