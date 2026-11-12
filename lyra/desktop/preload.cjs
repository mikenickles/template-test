// The only doors from the app into the computer: Lyra's own files, its secrets,
// Google sign-in, backups and notifications. Nothing else from Node is exposed.
const { contextBridge, ipcRenderer } = require("electron");

contextBridge.exposeInMainWorld("lyraDesktop", {
  files: {
    read: (name) => ipcRenderer.invoke("files:read", name),
    write: (name, data) => ipcRenderer.invoke("files:write", name, data),
    remove: (name) => ipcRenderer.invoke("files:remove", name),
  },
  secrets: {
    get: (key) => ipcRenderer.invoke("secrets:get", key),
    set: (key, value) => ipcRenderer.invoke("secrets:set", key, value),
    remove: (key) => ipcRenderer.invoke("secrets:remove", key),
  },
  google: {
    authorize: (scopes, interactive) => ipcRenderer.invoke("google:authorize", scopes, interactive),
    signOut: () => ipcRenderer.invoke("google:signOut"),
  },
  backups: {
    keep: (name, bytes) => ipcRenderer.invoke("backup:keep", name, bytes),
    saveAs: (name, bytes) => ipcRenderer.invoke("backup:saveAs", name, bytes),
    openFolder: () => ipcRenderer.invoke("backup:openFolder"),
  },
  notify: (title, body, hash) => ipcRenderer.invoke("notify", title, body, hash),
  onOpenHash: (fn) => {
    const h = (_e, hash) => fn(hash);
    ipcRenderer.on("open-hash", h);
    return () => ipcRenderer.removeListener("open-hash", h);
  },
  info: () => ipcRenderer.invoke("app:info"),
  // keep running in the tray, open at sign-in (shell 3)
  shell: {
    prefs: () => ipcRenderer.invoke("shell:prefs"),
    setPrefs: (p) => ipcRenderer.invoke("shell:setPrefs", p),
  },
  updates: {
    info: () => ipcRenderer.invoke("updates:info"),
    installPack: (bytes) => ipcRenderer.invoke("updates:installPack", bytes),
    ok: () => ipcRenderer.invoke("updates:ok"),
    relaunch: () => ipcRenderer.invoke("app:relaunch"),
  },
});
