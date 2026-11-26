
import { useState } from "react";
import { isNative, type AppState } from "../api";
import { Usage } from "./Usage";
import { isDesktop } from "../platform";
import { BackupSection } from "./Backup";
import { ModelSettings } from "./ModelSettings";
import { GoogleSetupSection, SyncSection } from "./SyncSection";
import { UpdatesSection } from "./UpdatesSection";
import { TITLES } from "./settings/choices";
import { SettingsHome } from "./settings/Home";
import { YouSection } from "./settings/You";
import { AlertsSection } from "./settings/Alerts";

export type SettingsSection = "model" | "usage" | "you" | "alerts" | "sync" | "about";
export const SETTINGS_SECTIONS: SettingsSection[] = ["model", "usage", "you", "alerts", "sync", "about"];

export interface Props {
  state: AppState;
  setState: (s: AppState) => void;
  toast: (m: string) => void;
  section?: SettingsSection;
}

export function Settings({ state, setState, toast, section }: Props) {
  const [busy, setBusy] = useState(false);
  const run = async (fn: () => Promise<AppState>, done: string) => {
    setBusy(true);
    try {
      setState(await fn());
      toast(done);
    } catch (e) {
      toast((e as Error).message);
    } finally {
      setBusy(false);
    }
  };

  if (!section) return <SettingsHome state={state} />;
  return (
    <div className="screen">
      <h1 className="page-title">{TITLES[section]}</h1>
      {section === "model" && (
        <>
          <p className="page-sub">
            Keys stay encrypted on {isNative ? "this phone" : isDesktop ? "this computer" : "this browser"} and only go to their provider.
          </p>
          <ModelSettings state={state} run={run} busy={busy} />
        </>
      )}
      {section === "usage" && <Usage />}
      {section === "you" && <YouSection state={state} setState={setState} toast={toast} run={run} busy={busy} />}
      {section === "alerts" && <AlertsSection state={state} run={run} busy={busy} toast={toast} />}
      {section === "sync" && (
        <>
          <SyncSection toast={toast} />
          <GoogleSetupSection toast={toast} />
          <BackupSection toast={toast} />
        </>
      )}
      {section === "about" && <UpdatesSection />}
    </div>
  );
}
