import { useRef, useState } from "react";
import { MIN_PASSPHRASE } from "../../../core/backup";
import { api } from "../api";

type Mode = { kind: "backup" } | { kind: "restore"; file: Uint8Array; name: string };

/** Settings section: make an encrypted backup, or restore one. */
export function BackupSection({ toast }: { toast: (m: string) => void }) {
  const [mode, setMode] = useState<Mode | null>(null);
  const picker = useRef<HTMLInputElement>(null);

  return (
    <section className="section">
      <h2 className="section-label">Backup</h2>
      <div className="group">
        <button className="item" onClick={() => setMode({ kind: "backup" })}>
          <span className="body">
            <div className="title">Back up Lyra</div>
            <div className="sub">Chats, memory, channels, tasks, routines and soul, locked with a passphrase. Save the file to Drive, email or anywhere.</div>
          </span>
        </button>
        <button className="item" onClick={() => picker.current?.click()}>
          <span className="body">
            <div className="title">Restore from a backup</div>
            <div className="sub">Moving to this phone? Pick your Lyra backup file.</div>
          </span>
        </button>
      </div>
      <p className="hint">API keys and Google connections aren't in backups. You add them again on the new phone.</p>
      <input
        ref={picker}
        type="file"
        hidden
        aria-label="Backup file"
        onChange={async (e) => {
          const f = e.target.files?.[0];
          e.target.value = "";
          if (f) setMode({ kind: "restore", file: new Uint8Array(await f.arrayBuffer()), name: f.name });
        }}
      />
      {mode && <PassphraseDialog mode={mode} toast={toast} onClose={() => setMode(null)} />}
    </section>
  );
}

function PassphraseDialog({ mode, toast, onClose }: { mode: Mode; toast: (m: string) => void; onClose: () => void }) {
  const [pass, setPass] = useState("");
  const [again, setAgain] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const backup = mode.kind === "backup";
  const ready = backup ? pass.length >= MIN_PASSPHRASE && pass === again : pass.length > 0;

  const go = async () => {
    if (!ready || busy) return;
    if (!backup && !confirm("Restoring replaces everything Lyra has on this phone with the backup. Continue?")) return;
    setBusy(true);
    setError(null);
    try {
      if (backup) {
        await api.backup(pass);
        toast("Backup made. Keep your passphrase somewhere safe.");
        onClose();
      } else {
        await api.restore(mode.file, pass); // the app restarts on the restored data
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
        aria-labelledby="bk-title"
        onSubmit={(e) => {
          e.preventDefault();
          void go();
        }}
      >
        <h2 id="bk-title" className="dialog-title">
          {backup ? "Back up Lyra" : "Restore Lyra"}
        </h2>
        <p className="dialog-text">
          {backup
            ? "Choose a passphrase. You'll need it to restore, and nobody can open the backup without it, not even Google or Lyra's makers. If you forget it, the backup can't be opened."
            : `Enter the passphrase for ${mode.name}.`}
        </p>
        <div className="float-field">
          <input
            id="bk-pass"
            type="password"
            autoComplete={backup ? "new-password" : "current-password"}
            value={pass}
            placeholder=" "
            autoFocus
            onChange={(e) => setPass(e.target.value)}
          />
          <label htmlFor="bk-pass">Passphrase</label>
        </div>
        {backup && (
          <div className="float-field" style={{ marginTop: 12 }}>
            <input id="bk-again" type="password" autoComplete="new-password" value={again} placeholder=" " onChange={(e) => setAgain(e.target.value)} />
            <label htmlFor="bk-again">Type it again</label>
          </div>
        )}
        {backup && pass.length > 0 && pass.length < MIN_PASSPHRASE && <p className="hint">At least {MIN_PASSPHRASE} characters. A few words works well.</p>}
        {backup && again.length > 0 && pass !== again && <p className="hint">The two don't match yet.</p>}
        {error && (
          <p className="hint bad" role="alert">
            {error}
          </p>
        )}
        <div className="dialog-actions">
          <button type="button" className="btn quiet" onClick={onClose} disabled={busy}>
            Cancel
          </button>
          <button type="submit" className="btn ink" disabled={!ready || busy}>
            {busy ? (backup ? "Locking…" : "Restoring…") : backup ? "Back up" : "Restore"}
          </button>
        </div>
      </form>
    </div>
  );
}
