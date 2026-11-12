/**
 * A live voice call with GPT-Live: the microphone goes out and Lyra's voice comes
 * back over WebRTC, straight between this device and OpenAI. The call's logic
 * (captions, delegations, minutes) is core/live.ts; this file is the plumbing.
 */
import { LiveCall } from "../../core/live";
import { api } from "./api";

export interface VoiceCall {
  call: LiveCall;
  /** when the session started, for the clock */
  startedAt: number;
  muted: boolean;
  setMuted(muted: boolean): void;
  end(): Promise<void>;
}

/** True while a call is on: sync won't reload the app under it. */
const mark = (on: boolean) => {
  if (on) document.body.dataset.call = "1";
  else delete document.body.dataset.call;
};

export async function startVoiceCall(channelId: number | null, changed: () => void): Promise<VoiceCall> {
  if (!navigator.mediaDevices?.getUserMedia) throw new Error("This device can't use the microphone here.");
  let stream: MediaStream;
  try {
    stream = await navigator.mediaDevices.getUserMedia({ audio: { echoCancellation: true, noiseSuppression: true, autoGainControl: true } });
  } catch {
    throw new Error("Lyra needs the microphone for live voice. Allow it when asked, or in your device's settings for Lyra.");
  }

  const pc = new RTCPeerConnection();
  const audio = new Audio();
  audio.autoplay = true;
  let ended = false;
  let handle!: VoiceCall;

  const channel = pc.createDataChannel("oai-events");
  const call = new LiveCall({
    send: (event) => {
      if (channel.readyState === "open") channel.send(JSON.stringify(event));
    },
    delegate: (request) => api.liveDelegate(request, channelId),
    exchange: (user, assistant) => void api.liveExchange(user, assistant, channelId).catch(() => {}),
    changed,
  });

  const stop = async () => {
    if (ended) return;
    ended = true;
    try {
      if (channel.readyState === "open") channel.send(JSON.stringify({ type: "session.close" }));
    } catch {
      // closing anyway
    }
    stream.getTracks().forEach((t) => t.stop());
    channel.close();
    pc.close();
    audio.srcObject = null;
    mark(false);
    call.end();
    // GPT-Live reports billed seconds as it goes; if none arrived, the session's length is the best estimate
    const elapsed = handle?.startedAt ? (Date.now() - handle.startedAt) / 1000 : 0;
    await api.liveEnded(Math.round(call.seconds || elapsed)).catch(() => {});
  };

  for (const track of stream.getAudioTracks()) pc.addTrack(track, stream);
  pc.ontrack = (e) => {
    audio.srcObject = e.streams[0];
    void audio.play().catch(() => {});
  };
  channel.onmessage = (e) => {
    try {
      const ev = JSON.parse(String(e.data)) as { type?: string };
      if (ev.type === "session.started" && !handle.startedAt) handle.startedAt = Date.now();
      call.handle(ev);
    } catch {
      // not an event we understand
    }
  };
  pc.onconnectionstatechange = () => {
    if (pc.connectionState === "failed" || pc.connectionState === "closed") {
      if (!ended && pc.connectionState === "failed") call.error = call.error ?? "The call dropped. Check your connection and try again.";
      void stop();
    }
  };

  handle = {
    call,
    startedAt: 0,
    muted: false,
    setMuted(muted) {
      handle.muted = muted;
      stream.getAudioTracks().forEach((t) => (t.enabled = !muted));
      changed();
    },
    end: stop,
  };

  mark(true);
  try {
    const offer = await pc.createOffer();
    await pc.setLocalDescription(offer);
    const answer = await api.startLive(offer.sdp ?? "", channelId);
    await pc.setRemoteDescription({ type: "answer", sdp: answer.sdp });
  } catch (e) {
    await stop();
    throw e;
  }
  return handle;
}
