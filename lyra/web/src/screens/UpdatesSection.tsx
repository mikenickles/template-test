import { useEffect, useState, useSyncExternalStore } from "react";
import { updatesApi } from "../api";
import { installer, isNative } from "../platform";
import { canUpdate, onUpdateState, updateState } from "../updater";

const DRIVE_FOLDER = "https://drive.google.com/drive/search?q=%22Lyra%20Updates%22";

/** Settings: the version, and updates from your Drive's "Lyra Updates" folder. */
export function UpdatesSection() {
  const state = useSyncExternalStore(onUpdateState, updateState);
  const [version, setVersion] = useState(__LYRA_VERSION__);
  useEffect(() => {
    void installer.version().then(setVersion);
  }, []);
  // arriving from the update notification
  const [here] = useState(() => location.hash.includes("updates"));

  const sub = (() => {
    switch (state.kind) {
      case "checking":
        return "Checking your Drive…";
      case "current":
        return "You're up to date.";
      case "available":
        return `Lyra ${state.file.version} is in your Drive.`;
      case "downloading":
        return `Downloading ${state.file.version}…`;
      case "ready":
        return `${state.version} is ready. Restart Lyra to use it.`;
      case "needs-full":
        return `${state.version} needs a fresh install: download the Windows zip from the Lyra Updates folder in your Drive.`;
      case "permission":
        return "Allow Lyra to install apps (the switch Android just opened), then come back and tap Update.";
      case "error":
        return state.message;
      default:
        return "Updates come from the Lyra Updates folder in your Google Drive.";
    }
  })();

  const action =
    state.kind === "available"
      ? { label: "Update", go: () => void updatesApi.apply() }
      : state.kind === "permission"
        ? { label: "Update", go: () => void updatesApi.apply() }
        : state.kind === "ready"
          ? { label: "Restart", go: () => void updatesApi.apply() }
          : state.kind === "needs-full"
            ? { label: "Open Drive", go: () => void window.open(DRIVE_FOLDER, "_blank") }
            : { label: "Check", go: () => void updatesApi.check() };

  return (
    <section className="section" ref={(el) => void (here && el?.scrollIntoView({ block: "start" }))}>
      <h2 className="section-label">Updates</h2>
      <div className="group">
        <div className="item">
          <span className="body">
            <div className="title">Lyra {version}</div>
            <div className={`sub${state.kind === "error" ? " bad" : ""}`}>{canUpdate ? sub : "Updates work in the phone and Windows apps."}</div>
          </span>
          {canUpdate && (
            <button className={`btn ${state.kind === "available" || state.kind === "ready" ? "ink" : "quiet"}`} onClick={action.go} disabled={state.kind === "checking" || state.kind === "downloading"}>
              {action.label}
            </button>
          )}
        </div>
      </div>
      {isNative && <p className="hint">Android asks you to confirm every update. Your chats and settings stay.</p>}
    </section>
  );
}
