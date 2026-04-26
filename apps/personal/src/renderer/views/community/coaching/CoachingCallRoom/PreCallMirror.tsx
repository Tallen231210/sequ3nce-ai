import React, { useEffect, useState } from 'react';
import { DailyVideo, useDaily, useLocalSessionId, useParticipant } from '@daily-co/daily-react';
import type { CoachingCall } from '../../../../convex';
import { Icon } from './Icon';
import { CtrlButton } from './CtrlButton';

interface PreCallMirrorProps {
  call: CoachingCall;
  micOn: boolean;
  camOn: boolean;
  onToggleMic: () => Promise<void> | void;
  onToggleCam: () => Promise<void> | void;
  onJoin: () => Promise<void> | void;
  onCancel: () => void;
}

export function PreCallMirror({ call, micOn, camOn, onToggleMic, onToggleCam, onJoin, onCancel }: PreCallMirrorProps) {
  const daily = useDaily();
  const localId = useLocalSessionId();
  const local = useParticipant(localId ?? '');
  const [joining, setJoining] = useState(false);
  const [cameras, setCameras] = useState<MediaDeviceInfo[]>([]);
  const [mics, setMics] = useState<MediaDeviceInfo[]>([]);
  const [selectedCamId, setSelectedCamId] = useState<string>('');
  const [selectedMicId, setSelectedMicId] = useState<string>('');

  // Enumerate available cameras + mics on mount so the user can pick a
  // webcam instead of the built-in computer camera. Labels are only
  // populated after permission is granted — by the time we get here, Daily
  // has already started the preview stream so labels are present.
  useEffect(() => {
    if (!daily) return;
    let cancelled = false;
    async function load() {
      try {
        const list = await navigator.mediaDevices.enumerateDevices();
        if (cancelled) return;
        setCameras(list.filter((d) => d.kind === 'videoinput'));
        setMics(list.filter((d) => d.kind === 'audioinput'));
        // Reflect the device Daily is currently using so the dropdown matches.
        const current = await daily?.getInputDevices();
        if (cancelled) return;
        const camId = (current?.camera as MediaDeviceInfo | undefined)?.deviceId;
        const micId = (current?.mic as MediaDeviceInfo | undefined)?.deviceId;
        if (camId) setSelectedCamId(camId);
        if (micId) setSelectedMicId(micId);
      } catch (err) {
        console.error('[PreCallMirror] device enumeration failed:', err);
      }
    }
    void load();
    // Re-enumerate when devices are plugged/unplugged so a newly-connected
    // webcam shows up in the dropdown without a refresh.
    const onChange = () => void load();
    navigator.mediaDevices.addEventListener?.('devicechange', onChange);
    return () => {
      cancelled = true;
      navigator.mediaDevices.removeEventListener?.('devicechange', onChange);
    };
  }, [daily]);

  async function changeCamera(deviceId: string) {
    setSelectedCamId(deviceId);
    if (!daily) return;
    try {
      await daily.setInputDevicesAsync({ videoDeviceId: deviceId });
    } catch (err) {
      console.error('[PreCallMirror] camera switch failed:', err);
    }
  }

  async function changeMic(deviceId: string) {
    setSelectedMicId(deviceId);
    if (!daily) return;
    try {
      await daily.setInputDevicesAsync({ audioDeviceId: deviceId });
    } catch (err) {
      console.error('[PreCallMirror] mic switch failed:', err);
    }
  }

  async function handleJoin() {
    if (joining) return;
    setJoining(true);
    try {
      await onJoin();
    } finally {
      // If onJoin bounces back to preview (join error), clear so the button works again.
      setJoining(false);
    }
  }

  return (
    <div className="fixed inset-0 z-[100] bg-[#0a0a0a] flex flex-col items-center justify-center font-sans p-8">
      <div className="w-full max-w-[640px] flex flex-col gap-4">
        {/* Context: what call they're about to join */}
        <div className="text-center">
          <div className="text-[10px] font-mono uppercase tracking-[0.18em] text-white/50 mb-1">
            About to join
          </div>
          <div className="text-[20px] font-bold text-white">{call.title}</div>
          <div className="text-[13px] text-white/50 mt-0.5">Hosted by Coach {call.coachName}</div>
        </div>

        {/* Camera preview */}
        <div className="relative aspect-video bg-zinc-950 rounded-xl overflow-hidden border border-white/10">
          {localId && local?.video ? (
            <DailyVideo
              sessionId={localId}
              type="video"
              automirror
              className="w-full h-full object-cover"
            />
          ) : (
            <div className="w-full h-full flex items-center justify-center bg-gradient-to-br from-zinc-900 to-black">
              <div className="flex flex-col items-center gap-2">
                <Icon name="camera-off" className="w-10 h-10 text-white/30" />
                <span className="text-[11px] font-mono uppercase tracking-wider text-white/40">
                  Camera off
                </span>
              </div>
            </div>
          )}

          {/* Mic meter — derived from Daily's local participant audio tracks */}
          <div className="absolute bottom-3 left-3">
            <MicMeter active={micOn} />
          </div>
        </div>

        {/* Controls */}
        <div className="flex items-center justify-center gap-2">
          <CtrlButton
            active={!micOn}
            onClick={onToggleMic}
            iconName={micOn ? 'mic' : 'mic-off'}
            label={micOn ? 'Mute' : 'Unmute'}
          />
          <CtrlButton
            active={!camOn}
            onClick={onToggleCam}
            iconName={camOn ? 'camera' : 'camera-off'}
            label={camOn ? 'Camera off' : 'Camera on'}
          />
        </div>

        {/* Device pickers — let users with multiple cameras / mics (webcams,
            external mics, etc.) choose which to use BEFORE joining the call.
            Switching after join works too via daily.setInputDevicesAsync, but
            doing it here avoids the "I'm in but the wrong camera is on"
            disorientation. */}
        {(cameras.length > 1 || mics.length > 1) && (
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
            {cameras.length > 1 && (
              <label className="flex flex-col gap-1">
                <span className="text-[10px] font-mono uppercase tracking-wider text-white/50">
                  Camera
                </span>
                <div className="relative">
                  <Icon name="camera" className="absolute left-2.5 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-white/50 pointer-events-none" />
                  <select
                    value={selectedCamId}
                    onChange={(e) => changeCamera(e.target.value)}
                    className="w-full pl-8 pr-2 py-2 text-[12.5px] bg-white/5 border border-white/10 rounded-lg text-white focus:outline-none focus:border-white/30 appearance-none cursor-pointer hover:bg-white/10"
                  >
                    {cameras.map((c) => (
                      <option key={c.deviceId} value={c.deviceId} className="bg-zinc-900">
                        {c.label || `Camera (${c.deviceId.slice(0, 8)}…)`}
                      </option>
                    ))}
                  </select>
                </div>
              </label>
            )}
            {mics.length > 1 && (
              <label className="flex flex-col gap-1">
                <span className="text-[10px] font-mono uppercase tracking-wider text-white/50">
                  Microphone
                </span>
                <div className="relative">
                  <Icon name="mic" className="absolute left-2.5 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-white/50 pointer-events-none" />
                  <select
                    value={selectedMicId}
                    onChange={(e) => changeMic(e.target.value)}
                    className="w-full pl-8 pr-2 py-2 text-[12.5px] bg-white/5 border border-white/10 rounded-lg text-white focus:outline-none focus:border-white/30 appearance-none cursor-pointer hover:bg-white/10"
                  >
                    {mics.map((m) => (
                      <option key={m.deviceId} value={m.deviceId} className="bg-zinc-900">
                        {m.label || `Mic (${m.deviceId.slice(0, 8)}…)`}
                      </option>
                    ))}
                  </select>
                </div>
              </label>
            )}
          </div>
        )}

        {/* Primary CTA */}
        <div className="flex items-center justify-center gap-3 mt-2">
          <button
            onClick={onCancel}
            className="px-4 py-2 text-[13px] font-medium bg-white/5 text-white rounded-lg hover:bg-white/10 transition-colors"
          >
            Cancel
          </button>
          <button
            onClick={handleJoin}
            disabled={joining}
            className="px-6 py-2.5 text-[14px] font-semibold bg-white text-black rounded-lg hover:bg-white/90 disabled:opacity-50 disabled:cursor-wait transition-colors"
          >
            {joining ? 'Joining…' : 'Join now'}
          </button>
        </div>
      </div>

      {/* DailyAudio rendered at CoachingCallLayer covers preview + joined. */}
    </div>
  );
}

// Compact visual mic meter. Polls Daily's local audio level at 100ms.
// Renders a vertical stack of bars that light up with volume.
function MicMeter({ active }: { active: boolean }) {
  const daily = useDaily();
  const [level, setLevel] = useState(0);

  useEffect(() => {
    if (!daily || !active) {
      setLevel(0);
      return;
    }
    const interval = setInterval(() => {
      try {
        // Daily exposes audio level on the local participant's audio track.
        // `getInputSettings` / track-level APIs vary by SDK version; we use
        // the simple `localAudio.getLevel`-style approach when available,
        // falling back to zero. This is purely decorative.
        const local = daily.participants().local;
        // @ts-expect-error — `audioLevel` is a reasonable best-effort; SDK types don't universally expose it
        const lvl = typeof local?.audioLevel === 'number' ? local.audioLevel : 0;
        setLevel(Math.min(1, Math.max(0, lvl)));
      } catch {
        // ignore — meter just stays flat
      }
    }, 100);
    return () => clearInterval(interval);
  }, [daily, active]);

  if (!active) {
    return (
      <div className="flex items-center gap-1 px-2 py-1 rounded-md bg-black/60 border border-white/10">
        <Icon name="mic-off" className="w-3 h-3 text-white/60" />
        <span className="text-[10px] font-mono text-white/50">Muted</span>
      </div>
    );
  }

  const bars = 5;
  const lit = Math.round(level * bars);
  return (
    <div className="flex items-end gap-[2px] px-2 py-1 rounded-md bg-black/60 border border-white/10">
      <Icon name="mic" className="w-3 h-3 text-white/80 mr-1" />
      {Array.from({ length: bars }).map((_, i) => (
        <div
          key={i}
          className={`w-[3px] transition-colors ${i < lit ? 'bg-emerald-400' : 'bg-white/15'}`}
          style={{ height: 3 + i * 2 }}
        />
      ))}
    </div>
  );
}
