/* Device-local recovery. Records are scoped to the authenticated administrator. */
(() => {
  let opening;
  function open() {
    if (!opening)
      opening = new Promise((resolve, reject) => {
        const req = indexedDB.open("carlab-hispacold-drafts", 1);
        req.onupgradeneeded = () =>
          req.result.createObjectStore("drafts", { keyPath: "key" });
        req.onsuccess = () => resolve(req.result);
        req.onerror = () =>
          reject(new Error("No se pudo abrir el guardado local."));
        req.onblocked = () =>
          reject(
            new Error("El guardado local está bloqueado en otra pestaña."),
          );
      }).catch((error) => {
        opening = null;
        throw error;
      });
    return opening;
  }
  async function run(mode, action) {
    const db = await open();
    return new Promise((resolve, reject) => {
      const tx = db.transaction("drafts", mode);
      const req = action(tx.objectStore("drafts"));
      tx.oncomplete = () => resolve(req.result);
      tx.onerror = tx.onabort = () =>
        reject(
          new Error(
            "No se pudo guardar el borrador en este dispositivo. Guarda la orden en Carlab antes de salir.",
          ),
        );
    });
  }
  window.HCDrafts = {
    put: (user, id, value) =>
      run("readwrite", (store) =>
        store.put({
          ...value,
          key: user + ":" + id,
          user,
          id,
          updatedAt: new Date().toISOString(),
        }),
      ),
    list: async (user) =>
      (await run("readonly", (store) => store.getAll()))
        .filter((d) => d.user === user)
        .sort((a, b) => b.updatedAt.localeCompare(a.updatedAt)),
    get: (user, id) => run("readonly", (store) => store.get(user + ":" + id)),
    remove: (user, id) =>
      run("readwrite", (store) => store.delete(user + ":" + id)),
  };
})();
