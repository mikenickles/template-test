import { useCallback, useEffect, useState } from "react";
import { MIN_PASSPHRASE } from "../../../core/backup";
import type { SnapshotInfo } from "../../../core/sync";
import { syncApi, type SyncStatus } from "../api";
import { deviceKind, desktopGoogleSetup, isDesktop, openBackupsFolder } from "../platform";
import { ago, parse } from "../when";

function useSyncStatus(): SyncStatus | null {
  const [s, setS] = useState<SyncStatus | null>(null);
  useEffect(() => {
    const load = () => void syncApi.status().then(setS, () => {});
    load();
    return syncApi.onChange(load);
  }, []);
  return s;
}

/** Settings: keep this device and your others in step through an encrypted copy in Google Drive. */
export function SyncSection({ toast }: { toast: (m: string) => void }) {
  const s = useSyncStatus();
  const [busy, setBusy] = useState(false);
  const [setup, setSetup] = useState<{ existing?: SnapshotInfo } | null>(null);
  const [pushSetup, setPushSetup] = useState(false);
  const [push, setPush] = useState<Awaited<ReturnType<typeof syncApi.push>> | null>(null);
  useEffect(() => {
    const load = () => void syncApi.push().then(setPush, () => {});
    load();
    return syncApi.onChange(load);
  }, []);

  const start = async () => {
    setBusy(true);
    try {
      setSetup({ existing: await syncApi.connect() });
    } catch (e) {
      toast((e as Error).message);
    } finally {
      setBusy(false);
    }
  };

  const now = async () => {
    setBusy(true);
    try {
      const r = await syncApi.now();
      toast(r === "pushed" ? "Synced" : r === "up-to-date" ? "Already up to date" : r === "conflict" ? "Lyra changed on both devices" : r === "busy" ? "Lyra's busy. It'll sync in a moment." : "Synced");
    } catch (e) {
      toast((e as Error).message);
    } finally {
      setBusy(false);
    }
  };

  const off = async () => {
    if (!confirm("Turn off sync on this device? Everything stays here, and your other devices keep their copies.")) return;
    await syncApi.disable();
    toast("Sync is off on this device");
  };

  if (!s) return null;
  return (
    <section className="section">
      <h2 className="section-label">Sync</h2>
      <div className="group">
        {s.enabled ? (
          <>
            <div className="item">
              <span className="body">
                <div className="title">On · {s.deviceName}</div>
                <div className={`sub${s.lastError ? " bad" : ""}`}>
                  {s.lastError
                    ? `Couldn't sync: ${s.lastError}`
                    : s.lastSync
                      ? `Synced ${ago(parse(s.lastSync))}${s.pending ? " · changes waiting" : ""}`
                      : "Waiting for the first sync"}
                </div>
              </span>
              <button className="btn quiet" onClick={() => void now()} disabled={busy}>
                Sync now
              </button>
            </div>
            {isDesktop && (
              <label className="item">
                <span className="body">
                  <div className="title">Make this computer Lyra's home base</div>
                  <div className="sub">
                    For a computer that's always on. Lyra does her routines, heads-ups and mail checks here instead of on your phone, so they happen on time whatever your phone is doing. If this computer goes quiet for half an hour, your phone takes over until it's back.
                  </div>
                </span>
                <input
                  type="checkbox"
                  role="switch"
                  className="switch"
                  checked={s.home}
                  disabled={busy}
                  onChange={(e) => {
                    const on = e.target.checked;
                    setBusy(true);
                    void syncApi
                      .setHome(on)
                      .then(
                        (r) => toast(on ? (r.headsUpsOn ? "This computer is Lyra's home base. Heads-ups turned on." : "This computer is Lyra's home base") : "Your phone does the background work again"),
                        (err) => toast((err as Error).message),
                      )
                      .finally(() => setBusy(false));
                  }}
                />
              </label>
            )}
            {s.home && s.homeGaps.length > 0 && (
              <div className="item">
                <span className="body">
                  <div className="title bad">This computer can't do the whole job yet</div>
                  <div className="sub">
                    API keys and Google connections stay on each device, so the home base needs its own. Missing here: {s.homeGaps.join("; ")}. Until then Lyra's heads-ups and mail checks won't happen, and your phone won't do them either.
                  </div>
                </span>
              </div>
            )}
            {(s.home || push?.configured) && push && (
              <div className="item">
                <span className="body">
                  <div className="title">{s.home ? "Ring my phone" : "Notifications from the home base"}</div>
                  <div className={`sub${push.error ? " bad" : ""}`}>
                    {s.home
                      ? !push.canSend
                        ? "Lyra's news reaches your phone within seconds, even with Lyra closed there. Needs a free Firebase project of your own, set up once (about ten minutes)."
                        : push.devices.length
                          ? `On. Reaches ${push.devices.map((d) => d.name).join(", ")}.`
                          : "Set up. Now open Lyra on your phone once, so it signs up."
                      : push.error
                        ? `This device couldn't sign up: ${push.error}`
                        : push.devices.some((d) => d.id === push.thisDevice)
                          ? "On. Your home base rings this phone when Lyra has something."
                          : isDesktop
                            ? "Set up on your home base."
                            : "Signing up… (needs notifications allowed)"}
                  </div>
                </span>
                {s.home && !push.canSend && (
                  <button className="btn quiet" onClick={() => setPushSetup(true)}>
                    Set up
                  </button>
                )}
                {s.home && push.canSend && push.devices.length > 0 && (
                  <button
                    className="btn quiet"
                    onClick={() => void syncApi.testPush().then((n) => toast(n ? "Sent. Check your phone." : "Couldn't reach your phone. Open Lyra there once, then try again."), (e) => toast((e as Error).message))}
                  >
                    Test
                  </button>
                )}
              </div>
            )}
            {s.home && push?.canSend && (
              <button className="item" onClick={() => confirm("Stop ringing your phone from this computer? Your Firebase project stays as it is.") && void syncApi.forgetPush().then(() => toast("Push is off"))}>
                <span className="body">
                  <div className="title">Turn off push</div>
                </span>
              </button>
            )}
            {s.homeBase && (
              <div className="item">
                <span className="body">
                  <div className="title">Home base · {s.homeBase.name}</div>
                  <div className={`sub${s.homeBase.fresh ? "" : " bad"}`}>
                    {s.homeBase.fresh
                      ? `Doing Lyra's routines and heads-ups. Last heard from ${ago(parse(s.homeBase.at))}.`
                      : `Not heard from since ${ago(parse(s.homeBase.at))}, so ${isDesktop ? "your phone" : "this phone"} is doing the background work until it's back.`}
                  </div>
                </span>
              </div>
            )}
            {isDesktop && (
              <button className="item" onClick={() => void openBackupsFolder()}>
                <span className="body">
                  <div className="title">Open backups folder</div>
                  <div className="sub">Every sync also saves an encrypted copy in Documents, Lyra Backups (the newest 20).</div>
                </span>
              </button>
            )}
            <button className="item" onClick={() => void off()}>
              <span className="body">
                <div className="title bad">Turn off sync</div>
              </span>
            </button>
          </>
        ) : (
          <button className="item" onClick={() => void start()} disabled={busy}>
            <span className="body">
              <div className="title">{busy ? "Connecting to Google…" : "Turn on sync"}</div>
              <div className="sub">Your phone and computer keep the same chats, memory and tasks. Each works on its own; changes hand over when both can reach Google Drive.</div>
            </span>
          </button>
        )}
      </div>
      <p className="hint">
        {s.enabled && !s.routinesHere
          ? s.homeBase?.fresh
            ? `Routines and heads-ups run on ${s.homeBase.name}, so nothing is posted twice.`
            : "Routines run on your phone while sync is on, so nothing is posted twice."
          : "Encrypted with your sync passphrase before it leaves this device. Google only stores scrambled data in a hidden Lyra folder, and Lyra can't see your other Drive files through it."}
      </p>
      {setup && <SyncSetupDialog existing={setup.existing} toast={toast} onClose={() => setSetup(null)} />}
      {pushSetup && <PushSetupDialog toast={toast} onClose={() => setPushSetup(false)} />}
    </section>
  );
}

/** On the home base: the two files from the user's own Firebase project. */
function PushSetupDialog({ toast, onClose }: { toast: (m: string) => void; onClose: () => void }) {
  const [services, setServices] = useState<{ name: string; text: string } | null>(null);
  const [account, setAccount] = useState<{ name: string; text: string } | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const pick = (set: (f: { name: string; text: string } | null) => void) => (e: React.ChangeEvent<HTMLInputElement>) => {
    const f = e.target.files?.[0];
    setError("");
    if (!f) return set(null);
    void f.text().then((text) => set({ name: f.name, text }));
  };
  const go = async () => {
    if (!services || !account) return;
    setBusy(true);
    setError("");
    try {
      await syncApi.setupPush(services.text, account.text);
      toast("Push is set up. Open Lyra on your phone once.");
      onClose();
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  };
  return (
    <div className="dialog-layer" role="presentation">
      <button className="dialog-scrim" aria-label="Cancel" tabIndex={-1} onClick={onClose} />
      <form
        className="dialog push-setup"
        role="dialog"
        aria-modal="true"
        aria-labelledby="pu-title"
        onSubmit={(e) => {
          e.preventDefault();
          void go();
        }}
      >
        <h2 id="pu-title" className="dialog-title">
          Ring my phone
        </h2>
        <p className="dialog-text">Lyra has no server, so this uses Google's push service through a free Firebase project that only you own. Once, on this computer:</p>
        <ol className="push-steps">
          <li>
            Open <b>console.firebase.google.com</b> and create a project (any name; Analytics can stay off).
          </li>
          <li>
            Add an <b>Android app</b> with the package name <b className="mono">app.lyra.chief</b>, and download <b>google-services.json</b>. Skip the rest of Firebase's steps.
          </li>
          <li>
            In <b>Project settings, Service accounts</b>, choose <b>Generate new private key</b>. That downloads a second file.
          </li>
          <li>Choose both files here.</li>
        </ol>
        <label className="action-field">
          <span>google-services.json{services ? ` · ${services.name}` : ""}</span>
          <input type="file" accept=".json,application/json" aria-label="google-services.json" onChange={pick(setServices)} />
        </label>
        <label className="action-field" style={{ marginTop: 12 }}>
          <span>Service account key{account ? ` · ${account.name}` : ""}</span>
          <input type="file" accept=".json,application/json" aria-label="Service account key" onChange={pick(setAccount)} />
        </label>
        <p className="hint">The key stays on this computer, stored like your API keys. Your phone gets only the app's public settings, through sync. A notification carries one line: the title and the first line of what Lyra posted.</p>
        {error && (
          <p className="hint bad" role="alert">
            {error}
          </p>
        )}
        <div className="dialog-actions">
          <button type="button" className="btn quiet" onClick={onClose} disabled={busy}>
            Cancel
          </button>
          <button type="submit" className="btn ink" disabled={!services || !account || busy}>
            {busy ? "Checking…" : "Turn on"}
          </button>
        </div>
      </form>
    </div>
  );
}

function SyncSetupDialog({ existing, toast, onClose }: { existing?: SnapshotInfo; toast: (m: string) => void; onClose: () => void }) {
  const [name, setName] = useState(deviceKind);
  const [pass, setPass] = useState("");
  const [again, setAgain] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const joining = !!existing;
  const ok = name.trim() && (joining ? pass.length > 0 : pass.length >= MIN_PASSPHRASE && pass === again);

  const go = async () => {
    if (!ok || busy) return;
    if (joining && !confirm(`This replaces what Lyra has on this device with what's synced from ${existing!.deviceName}. Continue?`)) return;
    setBusy(true);
    setError(null);
    try {
      const r = await syncApi.enable(pass, name);
      if (r !== "pulled") {
        toast("Sync is on");
        onClose();
      }
    } catch (e) {
      setError((e as Error).message);
      setBusy(false);
    }
  };

  return (
    <div className="dialog-layer" role="presentation">
      <button className="dialog-scrim" aria-label="Cancel" tabIndex={-1} onClick={onClose} />
      <form
        className="dialog"
        role="dialog"
        aria-modal="true"
        aria-labelledby="sy-title"
        onSubmit={(e) => {
          e.preventDefault();
          void go();
        }}
      >
        <h2 id="sy-title" className="dialog-title">
          {joining ? "Join sync" : "Turn on sync"}
        </h2>
        <p className="dialog-text">
          {joining
            ? `Lyra is already syncing from ${existing!.deviceName}. Enter the sync passphrase you chose there.`
            : "Choose a sync passphrase. Every device uses the same one, and nobody can read the synced copy without it. If you forget it, your devices keep working, but a new one can't join."}
        </p>
        <div className="float-field">
          <input id="sy-name" value={name} maxLength={40} placeholder=" " onChange={(e) => setName(e.target.value)} />
          <label htmlFor="sy-name">This device's name</label>
        </div>
        <div className="float-field" style={{ marginTop: 12 }}>
          <input id="sy-pass" type="password" autoComplete={joining ? "current-password" : "new-password"} value={pass} placeholder=" " autoFocus onChange={(e) => setPass(e.target.value)} />
          <label htmlFor="sy-pass">Sync passphrase</label>
        </div>
        {!joining && (
          <div className="float-field" style={{ marginTop: 12 }}>
            <input id="sy-again" type="password" autoComplete="new-password" value={again} placeholder=" " onChange={(e) => setAgain(e.target.value)} />
            <label htmlFor="sy-again">Type it again</label>
          </div>
        )}
        {!joining && pass.length > 0 && pass.length < MIN_PASSPHRASE && <p className="hint">At least {MIN_PASSPHRASE} characters. A few words works well.</p>}
        {!joining && again.length > 0 && pass !== again && <p className="hint">The two don't match yet.</p>}
        {error && (
          <p className="hint bad" role="alert">
            {error}
          </p>
        )}
        <div className="dialog-actions">
          <button type="button" className="btn quiet" onClick={onClose} disabled={busy}>
            Cancel
          </button>
          <button type="submit" className="btn ink" disabled={!ok || busy}>
            {busy ? "Syncing…" : joining ? "Join" : "Turn on"}
          </button>
        </div>
      </form>
    </div>
  );
}

/** Shown anywhere in the app when both devices changed while apart. */
export function SyncConflict() {
  const s = useSyncStatus();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const pick = useCallback(async (keep: "this" | "other") => {
    setBusy(true);
    setError(null);
    try {
      await syncApi.resolve(keep);
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  }, []);
  if (!s?.conflict) return null;
  const other = s.conflict.deviceName;
  return (
    <div className="dialog-layer" role="presentation">
      <div className="dialog-scrim" />
      <div className="dialog" role="alertdialog" aria-modal="true" aria-labelledby="cf-title">
        <h2 id="cf-title" className="dialog-title">
          Lyra changed on both devices
        </h2>
        <p className="dialog-text">
          While they were apart, things changed here and on {other} ({ago(parse(s.conflict.savedAt))}). Pick which version to keep. The other is saved in Drive just in case.
        </p>
        {error && (
          <p className="hint bad" role="alert">
            {error}
          </p>
        )}
        <div className="dialog-actions">
          <button className="btn quiet" onClick={() => void pick("this")} disabled={busy}>
            Keep this {s.deviceName.toLowerCase() === "phone" ? "phone's" : "device's"}
          </button>
          <button className="btn ink" onClick={() => void pick("other")} disabled={busy}>
            Use {other}'s
          </button>
        </div>
      </div>
    </div>
  );
}

/** Desktop only: the Google Cloud "Desktop app" client this computer signs in with. */
export function GoogleSetupSection({ toast }: { toast: (m: string) => void }) {
  const [have, setHave] = useState<boolean | null>(null);
  // arriving from "Open Google setup": open this section and bring it into view
  const [open, setOpen] = useState(() => location.hash.includes("google"));
  const [id, setId] = useState("");
  const [secret, setSecret] = useState("");
  useEffect(() => {
    void desktopGoogleSetup.get().then((c) => setHave(!!c));
  }, []);
  if (!isDesktop || have === null) return null;

  const save = async () => {
    try {
      await desktopGoogleSetup.set(id, secret);
      setHave(true);
      setOpen(false);
      setId("");
      setSecret("");
      toast("Google is set up on this computer");
    } catch (e) {
      toast((e as Error).message);
    }
  };

  return (
    <section className="section" ref={(el) => void (open && location.hash.includes("google") && el?.scrollIntoView({ block: "start" }))}>
      <h2 className="section-label">Google on this computer</h2>
      <div className="group">
        <button className="item" onClick={() => setOpen((v) => !v)} aria-expanded={open}>
          <span className="body">
            <div className="title">{have ? "Set up" : "Not set up yet"}</div>
            <div className="sub">{have ? "Tap to replace the client ID and secret." : "Needed for sync, Mail, Calendar and Files on this computer. One time, about five minutes."}</div>
          </span>
        </button>
      </div>
      {open && (
        <div className="setup-box">
          <ol className="setup-steps">
            <li>
              Open <b>console.cloud.google.com</b>, in the same project you made for the phone.
            </li>
            <li>
              <b>APIs &amp; Services → Credentials → Create credentials → OAuth client ID</b>.
            </li>
            <li>
              Application type <b>Desktop app</b>, name it "Lyra for Windows", and create it.
            </li>
            <li>Copy the client ID and client secret here.</li>
          </ol>
          <label className="field-label" htmlFor="gs-id">
            Client ID
          </label>
          <input id="gs-id" className="field" value={id} onChange={(e) => setId(e.target.value)} placeholder="….apps.googleusercontent.com" autoComplete="off" spellCheck={false} />
          <label className="field-label" htmlFor="gs-secret" style={{ marginTop: 12 }}>
            Client secret
          </label>
          <input id="gs-secret" className="field" type="password" value={secret} onChange={(e) => setSecret(e.target.value)} autoComplete="off" spellCheck={false} />
          <button className="btn ink" style={{ marginTop: 16, width: "100%" }} onClick={() => void save()} disabled={!id.trim() || !secret.trim()}>
            Save
          </button>
          <p className="hint">Kept encrypted by Windows for your account. A desktop client's secret isn't a password: it only identifies the app to Google.</p>
        </div>
      )}
    </section>
  );
}
