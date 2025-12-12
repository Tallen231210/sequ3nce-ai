import React, { useState, useEffect, useRef } from 'react';
import { AudioStatus } from './types/electron';
import { StatusIndicator } from './components/StatusIndicator';
import { AudioLevelMeter } from './components/AudioLevelMeter';
import { RecordButton } from './components/RecordButton';
import { useAudioCapture } from './hooks/useAudioCapture';
import { getCloserByEmail, activateCloser, type CloserInfo } from './convex';

// Simple local storage for persisting login
const STORAGE_KEY = 'seq3nce_closer_email';

export function App() {
  const [email, setEmail] = useState('');
  const [closerInfo, setCloserInfo] = useState<CloserInfo | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  // Check for saved email on mount
  useEffect(() => {
    const savedEmail = localStorage.getItem(STORAGE_KEY);
    if (savedEmail) {
      handleLogin(savedEmail);
    } else {
      setIsLoading(false);
    }
  }, []);

  const handleLogin = async (loginEmail: string) => {
    setIsLoading(true);
    setError(null);

    try {
      const info = await getCloserByEmail(loginEmail.trim().toLowerCase());

      if (info) {
        // Activate the closer (changes status from pending to active)
        await activateCloser(loginEmail.trim().toLowerCase());

        setCloserInfo(info);
        localStorage.setItem(STORAGE_KEY, loginEmail.trim().toLowerCase());
      } else {
        setError('No account found with that email. Make sure your team admin has added you.');
      }
    } catch (err) {
      console.error('[App] Login error:', err);
      setError('Failed to connect. Please check your internet connection.');
    }

    setIsLoading(false);
  };

  const handleLogout = () => {
    localStorage.removeItem(STORAGE_KEY);
    setCloserInfo(null);
    setEmail('');
  };

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (email.trim()) {
      handleLogin(email);
    }
  };

  if (isLoading) {
    return (
      <div className="h-screen flex flex-col bg-black text-white items-center justify-center">
        <div className="animate-pulse text-zinc-400">Loading...</div>
      </div>
    );
  }

  if (!closerInfo) {
    return <LoginScreen
      email={email}
      setEmail={setEmail}
      onSubmit={handleSubmit}
      error={error}
      isLoading={isLoading}
    />;
  }

  return <MainApp closerInfo={closerInfo} onLogout={handleLogout} />;
}

interface LoginScreenProps {
  email: string;
  setEmail: (email: string) => void;
  onSubmit: (e: React.FormEvent) => void;
  error: string | null;
  isLoading: boolean;
}

function LoginScreen({ email, setEmail, onSubmit, error, isLoading }: LoginScreenProps) {
  return (
    <div className="h-screen flex flex-col bg-black text-white">
      {/* Draggable title bar */}
      <div className="titlebar h-8 flex items-center justify-center border-b border-zinc-800">
        <span className="text-xs text-zinc-500 font-medium">Seq3nce</span>
      </div>

      <div className="flex-1 flex flex-col items-center justify-center p-6">
        <div className="mb-8 text-center">
          <h1 className="text-2xl font-semibold">Seq3nce</h1>
          <p className="text-zinc-500 text-sm mt-2">Enter your email to get started</p>
        </div>

        <form onSubmit={onSubmit} className="w-full max-w-xs space-y-4">
          <div>
            <input
              type="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              placeholder="you@example.com"
              className="w-full px-4 py-3 bg-zinc-900 border border-zinc-700 rounded-lg text-white placeholder-zinc-500 focus:outline-none focus:border-zinc-500 transition-colors"
              disabled={isLoading}
              autoFocus
            />
          </div>

          {error && (
            <p className="text-red-400 text-sm text-center">{error}</p>
          )}

          <button
            type="submit"
            disabled={isLoading || !email.trim()}
            className="w-full py-3 bg-white text-black font-medium rounded-lg hover:bg-zinc-200 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
          >
            {isLoading ? 'Signing in...' : 'Continue'}
          </button>
        </form>

        <p className="mt-8 text-xs text-zinc-600 text-center max-w-xs">
          Use the email your team admin invited you with
        </p>
      </div>
    </div>
  );
}

interface MainAppProps {
  closerInfo: CloserInfo;
  onLogout: () => void;
}

function MainApp({ closerInfo, onLogout }: MainAppProps) {
  const [status, setStatus] = useState<AudioStatus>('idle');
  const [audioLevel, setAudioLevel] = useState(0);
  const [error, setError] = useState<string | null>(null);
  const [callId, setCallId] = useState<string | null>(null);
  const [hasPermission, setHasPermission] = useState<boolean | null>(null);
  const [duration, setDuration] = useState(0);
  const [version, setVersion] = useState('');
  const [ammoTrackerVisible, setAmmoTrackerVisible] = useState(false);
  const isCapturingRef = useRef(false);

  // Audio capture hook
  const { startCapture, stopCapture } = useAudioCapture({
    onAudioLevel: setAudioLevel,
    onError: (err) => {
      setError(err);
      setTimeout(() => setError(null), 5000);
    },
  });

  // Check permissions and ammo tracker state on mount
  useEffect(() => {
    const checkPermissions = async () => {
      const permitted = await window.electron.audio.checkPermissions();
      setHasPermission(permitted);
    };
    checkPermissions();
    window.electron.app.getVersion().then(setVersion);
    window.electron.ammo.isVisible().then(setAmmoTrackerVisible);
  }, []);

  // Subscribe to audio events
  useEffect(() => {
    const unsubStatus = window.electron.audio.onStatusChange((newStatus) => {
      console.log('[App] Status changed:', newStatus);
      setStatus(newStatus);
      if (newStatus === 'idle') {
        setCallId(null);
        setDuration(0);
      }
    });

    const unsubError = window.electron.audio.onError((err) => {
      console.error('[App] Error:', err);
      setError(err);
      setTimeout(() => setError(null), 5000);
    });

    const unsubLevel = window.electron.audio.onAudioLevel((level) => {
      setAudioLevel(level);
    });

    const handleTrayStart = () => handleStart();
    const handleTrayStop = () => handleStop();

    window.addEventListener('tray:start-recording', handleTrayStart);
    window.addEventListener('tray:stop-recording', handleTrayStop);

    return () => {
      unsubStatus();
      unsubError();
      unsubLevel();
      window.removeEventListener('tray:start-recording', handleTrayStart);
      window.removeEventListener('tray:stop-recording', handleTrayStop);
    };
  }, [closerInfo]);

  // Track recording duration
  useEffect(() => {
    let interval: NodeJS.Timeout | null = null;

    if (status === 'capturing') {
      interval = setInterval(() => {
        setDuration((d) => d + 1);
      }, 1000);
    }

    return () => {
      if (interval) clearInterval(interval);
    };
  }, [status]);

  const handleStart = async () => {
    setError(null);

    // Use real IDs from Convex
    const config: { teamId: string; closerId: string; prospectName?: string } = {
      teamId: closerInfo.teamId,
      closerId: closerInfo.closerId,
      prospectName: undefined,
    };

    console.log('[App] Starting call with config:', config);

    const result = await window.electron.audio.start(config);

    if (result.success && result.callId) {
      setCallId(result.callId);

      const captureStarted = await startCapture();
      if (!captureStarted) {
        await window.electron.audio.stop();
        setError('Could not capture audio. Please grant Screen Recording permission in System Preferences and restart the app.');
        return;
      }
      isCapturingRef.current = true;
      setHasPermission(true);
    } else if (result.error) {
      setError(result.error);
    }
  };

  const handleStop = async () => {
    if (isCapturingRef.current) {
      stopCapture();
      isCapturingRef.current = false;
    }
    await window.electron.audio.stop();
  };

  const formatDuration = (seconds: number): string => {
    const mins = Math.floor(seconds / 60);
    const secs = seconds % 60;
    return `${mins.toString().padStart(2, '0')}:${secs.toString().padStart(2, '0')}`;
  };

  const handleToggleAmmoTracker = async () => {
    const isVisible = await window.electron.ammo.toggle();
    setAmmoTrackerVisible(isVisible);
  };

  const isRecording = status === 'capturing';
  const isConnecting = status === 'connecting';

  return (
    <div className="h-screen flex flex-col bg-black text-white">
      {/* Draggable title bar */}
      <div className="titlebar h-8 flex items-center justify-between px-4 border-b border-zinc-800">
        <span className="text-xs text-zinc-500 font-medium">Seq3nce</span>
        <button
          onClick={onLogout}
          className="text-xs text-zinc-600 hover:text-zinc-400"
        >
          Sign out
        </button>
      </div>

      {/* User info */}
      <div className="px-4 py-2 border-b border-zinc-800/50 bg-zinc-900/50">
        <div className="text-sm text-zinc-300">{closerInfo.name}</div>
        <div className="text-xs text-zinc-600">{closerInfo.teamName}</div>
      </div>

      {/* Main content */}
      <div className="flex-1 flex flex-col items-center justify-center p-6">
        {/* Status indicator */}
        <StatusIndicator status={status} />

        {/* Duration */}
        {isRecording && (
          <div className="mt-4 text-2xl font-mono text-zinc-300">
            {formatDuration(duration)}
          </div>
        )}

        {/* Audio level meter */}
        <div className="mt-6 w-full max-w-xs">
          <AudioLevelMeter level={audioLevel} isActive={isRecording} />
        </div>

        {/* Record button */}
        <div className="mt-8">
          <RecordButton
            isRecording={isRecording}
            isConnecting={isConnecting}
            onStart={handleStart}
            onStop={handleStop}
          />
        </div>

        {/* Ammo Tracker toggle button */}
        <button
          onClick={handleToggleAmmoTracker}
          className={`mt-4 px-4 py-2 rounded-lg text-sm font-medium transition-colors flex items-center gap-2 ${
            ammoTrackerVisible
              ? 'bg-zinc-800 text-white hover:bg-zinc-700'
              : 'bg-zinc-900 text-zinc-400 hover:bg-zinc-800 hover:text-zinc-300'
          }`}
        >
          <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 10V3L4 14h7v7l9-11h-7z" />
          </svg>
          {ammoTrackerVisible ? 'Hide Ammo' : 'Show Ammo'}
        </button>

        {/* Call ID */}
        {callId && (
          <p className="mt-4 text-xs text-zinc-600 font-mono">
            Call: {callId.slice(0, 8)}...
          </p>
        )}

        {/* Error message */}
        {error && (
          <div className="mt-4 p-3 bg-red-900/20 border border-red-800 rounded-lg max-w-xs">
            <p className="text-red-300 text-sm text-center">{error}</p>
          </div>
        )}
      </div>

      {/* Footer */}
      <div className="p-4 border-t border-zinc-800">
        <div className="flex items-center justify-between text-xs text-zinc-600">
          <span>v{version}</span>
          <span className="flex items-center gap-1">
            <span className={`w-1.5 h-1.5 rounded-full ${
              status === 'idle' ? 'bg-zinc-600' :
              status === 'connecting' ? 'bg-yellow-500' :
              status === 'capturing' ? 'bg-green-500' :
              'bg-red-500'
            }`} />
            {status === 'idle' ? 'Ready' :
             status === 'connecting' ? 'Connecting...' :
             status === 'capturing' ? 'Recording' :
             'Error'}
          </span>
        </div>
      </div>
    </div>
  );
}
