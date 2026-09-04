export type AppInstallStatus = "unavailable" | "ready" | "prompting" | "accepted" | "installed" | "error";

declare global {
  interface Window {
    __OKRI_INSTALL__?: {
      status: AppInstallStatus;
      prompt: () => Promise<void>;
    };
  }
}

// Capture the browser's one-use event before React or authentication finishes loading.
export const appInstallBootstrapScript = `(() => {
  if (window.__OKRI_INSTALL__) return;
  const display = window.matchMedia("(display-mode: standalone)");
  let pending = null;
  const state = window.__OKRI_INSTALL__ = {
    status: display.matches ? "installed" : "unavailable",
    prompt: async () => {
      if (state.status !== "ready" || !pending) return;
      const event = pending;
      pending = null;
      update("prompting");
      try {
        const choice = await event.prompt();
        if (state.status !== "installed") update(choice.outcome === "accepted" ? "accepted" : "unavailable");
      } catch {
        if (state.status !== "installed") update("error");
      }
    },
  };
  function update(status) {
    state.status = status;
    window.dispatchEvent(new Event("okri:installchange"));
  }
  window.addEventListener("beforeinstallprompt", (event) => {
    event.preventDefault();
    if (display.matches || state.status === "installed" || state.status === "prompting") return;
    pending = event;
    update("ready");
  });
  window.addEventListener("appinstalled", () => { pending = null; update("installed"); });
  display.addEventListener("change", () => {
    if (display.matches) { pending = null; update("installed"); }
  });
})();`;
