import React, { useState, useEffect, useRef } from 'react';
import { AudioStatus } from './types/electron';
import { StatusIndicator } from './components/StatusIndicator';
import { AudioLevelMeter } from './components/AudioLevelMeter';
import { RecordButton } from './components/RecordButton';
import { PostCallQuestionnaire, CallOutcome } from './components/PostCallQuestionnaire';
import { ProspectNamePrompt } from './components/ProspectNamePrompt';
import { useAudioCapture } from './hooks/useAudioCapture';
import {
  loginCloser,
  completeCallWithOutcome,
  findMatchingScheduledCall,
  updateProspectName,
  type CloserInfo,
  type ScheduledCallMatch,
} from './convex';
import logoImage from '../assets/logo.png';

// Storage keys
const STORAGE_KEY = 'sequ3nce_closer_info';

// Auth states
type AuthState =
  | 'initial_loading'    // Checking if user is already logged in
  | 'login'              // Showing login form
  | 'logging_in'         // Attempting login
  | 'authenticated'      // Fully logged in
  | 'error';             // Error state

interface AuthError {
  message: string;
}

export function App() {
  const [authState, setAuthState] = useState<AuthState>('initial_loading');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [closerInfo, setCloserInfo] = useState<CloserInfo | null>(null);
  const [authError, setAuthError] = useState<AuthError | null>(null);

  // Check for existing session on mount
  useEffect(() => {
    checkExistingSession();
  }, []);

  const checkExistingSession = () => {
    const savedCloserInfo = localStorage.getItem(STORAGE_KEY);

    if (savedCloserInfo) {
      try {
        const info = JSON.parse(savedCloserInfo) as CloserInfo;
        setCloserInfo(info);
        setAuthState('authenticated');
      } catch (err) {
        console.error('[App] Error parsing saved closer info:', err);
        clearSession();
        setAuthState('login');
      }
    } else {
      setAuthState('login');
    }
  };

  const clearSession = () => {
    localStorage.removeItem(STORAGE_KEY);
    setCloserInfo(null);
  };

  const handleLogin = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!email.trim() || !password.trim()) return;

    setAuthState('logging_in');
    setAuthError(null);

    try {
      const result = await loginCloser(email.trim().toLowerCase(), password);

      if (result.success && result.closer) {
        // Save closer info to localStorage
        localStorage.setItem(STORAGE_KEY, JSON.stringify(result.closer));
        setCloserInfo(result.closer);
        setAuthState('authenticated');
      } else {
        setAuthError({
          message: result.error || 'Login failed. Please try again.',
        });
        setAuthState('error');
      }
    } catch (err) {
      console.error('[App] Login error:', err);
      setAuthError({
        message: 'Network error. Please check your connection and try again.',
      });
      setAuthState('error');
    }
  };

  const handleLogout = () => {
    clearSession();
    setEmail('');
    setPassword('');
    setAuthState('login');
  };

  const handleRetry = () => {
    setAuthError(null);
    setAuthState('login');
  };

  // Render based on auth state
  if (authState === 'initial_loading') {
    return (
      <div className="h-screen flex flex-col bg-white text-black items-center justify-center">
        <div className="titlebar h-8 border-b border-gray-200 w-full" />
        <div className="flex-1 flex items-center justify-center">
          <div className="text-center">
            <div className="animate-spin w-8 h-8 border-2 border-gray-300 border-t-black rounded-full mx-auto mb-4" />
            <p className="text-gray-500 text-sm">Loading...</p>
          </div>
        </div>
      </div>
    );
  }

  if (authState === 'login' || authState === 'logging_in') {
    return (
      <LoginScreen
        email={email}
        setEmail={setEmail}
        password={password}
        setPassword={setPassword}
        onSubmit={handleLogin}
        isLoading={authState === 'logging_in'}
      />
    );
  }

  if (authState === 'error' && authError) {
    return (
      <ErrorScreen
        error={authError}
        onRetry={handleRetry}
      />
    );
  }

  if (authState === 'authenticated' && closerInfo) {
    return <MainApp closerInfo={closerInfo} onLogout={handleLogout} />;
  }

  // Fallback - shouldn't reach here
  return (
    <LoginScreen
      email={email}
      setEmail={setEmail}
      password={password}
      setPassword={setPassword}
      onSubmit={handleLogin}
      isLoading={false}
    />
  );
}

// ==================== Auth Screens ====================

interface LoginScreenProps {
  email: string;
  setEmail: (email: string) => void;
  password: string;
  setPassword: (password: string) => void;
  onSubmit: (e: React.FormEvent) => void;
  isLoading: boolean;
}

function LoginScreen({ email, setEmail, password, setPassword, onSubmit, isLoading }: LoginScreenProps) {
  return (
    <div className="h-screen flex flex-col bg-white text-black">
      <div className="titlebar h-8 border-b border-gray-200" />

      <div className="flex-1 flex flex-col items-center justify-center p-6">
        <div className="mb-8 text-center">
          <img src={logoImage} alt="Sequ3nce" className="h-14 mx-auto" />
          <p className="text-gray-500 text-sm mt-4">Sign in to your account</p>
        </div>

        <form onSubmit={onSubmit} className="w-full max-w-xs space-y-4">
          <div>
            <input
              type="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              placeholder="Email"
              className="w-full px-4 py-3 bg-gray-50 border border-gray-200 rounded-lg text-black placeholder-gray-400 focus:outline-none focus:border-gray-400 focus:ring-1 focus:ring-gray-400 transition-all duration-150"
              disabled={isLoading}
              autoFocus
            />
          </div>

          <div>
            <input
              type="password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              placeholder="Password"
              className="w-full px-4 py-3 bg-gray-50 border border-gray-200 rounded-lg text-black placeholder-gray-400 focus:outline-none focus:border-gray-400 focus:ring-1 focus:ring-gray-400 transition-all duration-150"
              disabled={isLoading}
            />
          </div>

          <button
            type="submit"
            disabled={isLoading || !email.trim() || !password.trim()}
            className="w-full py-3 bg-black text-white font-medium rounded-lg hover:bg-gray-800 transition-colors duration-150 disabled:opacity-50 disabled:cursor-not-allowed flex items-center justify-center gap-2"
          >
            {isLoading ? (
              <>
                <div className="animate-spin w-4 h-4 border-2 border-gray-400 border-t-white rounded-full" />
                Signing in...
              </>
            ) : (
              'Sign In'
            )}
          </button>
        </form>

        <p className="mt-8 text-xs text-gray-400 text-center max-w-xs">
          Use the email and password your manager provided
        </p>
      </div>
    </div>
  );
}

interface ErrorScreenProps {
  error: AuthError;
  onRetry: () => void;
}

function ErrorScreen({ error, onRetry }: ErrorScreenProps) {
  return (
    <div className="h-screen flex flex-col bg-white text-black">
      <div className="titlebar h-8 border-b border-gray-200" />

      <div className="flex-1 flex flex-col items-center justify-center p-6">
        <div className="mb-8 text-center">
          <img src={logoImage} alt="Sequ3nce" className="h-14 mx-auto" />
        </div>

        {/* Error icon */}
        <div className="w-16 h-16 bg-red-50 rounded-full flex items-center justify-center mb-6">
          <svg className="w-8 h-8 text-red-500" fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z" />
          </svg>
        </div>

        <h2 className="text-xl font-semibold text-gray-900 mb-2">Login Failed</h2>
        <p className="text-gray-500 text-sm text-center mb-8 max-w-xs">
          {error.message}
        </p>

        <div className="space-y-3 w-full max-w-xs">
          <button
            onClick={onRetry}
            className="w-full py-3 bg-black text-white font-medium rounded-lg hover:bg-gray-800 transition-colors duration-150"
          >
            Try again
          </button>
        </div>
      </div>
    </div>
  );
}

// ==================== Main App ====================

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
  const [showQuestionnaire, setShowQuestionnaire] = useState(false);
  const [pendingCallId, setPendingCallId] = useState<string | null>(null);
  const [isSubmittingQuestionnaire, setIsSubmittingQuestionnaire] = useState(false);
  const isCapturingRef = useRef(false);

  // Prospect name prompt state
  const [showProspectPrompt, setShowProspectPrompt] = useState(false);
  const [scheduledCallMatch, setScheduledCallMatch] = useState<ScheduledCallMatch | null>(null);
  const [prospectName, setProspectName] = useState<string | null>(null);
  const [prospectNameSaved, setProspectNameSaved] = useState(false);

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

    // CRITICAL: Listen for Convex callId updates from the audio processor
    // The audio processor creates the call in Convex and returns the actual _id
    const unsubCallIdUpdated = window.electron.audio.onCallIdUpdated((convexCallId) => {
      console.log('[App] Received Convex callId:', convexCallId);
      setCallId(convexCallId);
    });

    const handleTrayStart = () => handleStart();
    const handleTrayStop = () => handleStop();

    window.addEventListener('tray:start-recording', handleTrayStart);
    window.addEventListener('tray:stop-recording', handleTrayStop);

    return () => {
      unsubStatus();
      unsubError();
      unsubLevel();
      unsubCallIdUpdated();
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

    // Reset prospect name state for new call
    setProspectName(null);
    setProspectNameSaved(false);
    setScheduledCallMatch(null);

    // Use real IDs from Convex
    const config: { teamId: string; closerId: string; prospectName?: string } = {
      teamId: closerInfo.teamId,
      closerId: closerInfo.closerId,
      prospectName: undefined,
    };

    console.log('[App] Starting call with config:', config);

    // Start recording IMMEDIATELY - zero delay
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

      // Show prospect name prompt immediately after recording starts
      setShowProspectPrompt(true);

      // Check for matching scheduled call in parallel (doesn't block recording)
      findMatchingScheduledCall(closerInfo.closerId, closerInfo.teamId)
        .then((match) => {
          if (match) {
            console.log('[App] Found matching scheduled call:', match);
            setScheduledCallMatch(match);
            if (match.prospectName) {
              setProspectName(match.prospectName);
            }
          } else {
            console.log('[App] No matching scheduled call found');
          }
        })
        .catch((err) => {
          console.error('[App] Error finding scheduled call:', err);
        });
    } else if (result.error) {
      setError(result.error);
    }
  };

  const handleStop = async () => {
    // Store the current callId before stopping
    if (callId) {
      setPendingCallId(callId);
      setShowQuestionnaire(true);
    }

    // Hide prospect name prompt
    setShowProspectPrompt(false);

    // Stop audio capture
    if (isCapturingRef.current) {
      stopCapture();
      isCapturingRef.current = false;
    }
    await window.electron.audio.stop();
  };

  // Handle prospect name submission from the inline prompt
  const handleProspectNameSubmit = async (name: string) => {
    if (!callId) return;

    console.log('[App] Submitting prospect name:', name);
    setProspectName(name);
    setProspectNameSaved(true);
    setShowProspectPrompt(false);

    // Update the call record in Convex
    const result = await updateProspectName({
      callId,
      prospectName: name,
      scheduledCallId: scheduledCallMatch?.scheduledCallId,
    });

    if (!result.success) {
      console.error('[App] Failed to save prospect name:', result.error);
      // Don't show error to user - they can still edit in post-call questionnaire
    }
  };

  const handleQuestionnaireSubmit = async (data: {
    prospectName: string;
    outcome: CallOutcome;
    dealValue?: number;
    notes?: string;
  }) => {
    if (!pendingCallId) {
      console.error('[App] No pending call ID for questionnaire submission');
      return;
    }

    console.log('[App] Submitting questionnaire for call:', pendingCallId, data);
    setIsSubmittingQuestionnaire(true);

    try {
      const result = await completeCallWithOutcome({
        callId: pendingCallId,
        prospectName: data.prospectName,
        outcome: data.outcome,
        dealValue: data.dealValue,
        notes: data.notes,
      });

      console.log('[App] Questionnaire submission result:', result);
      setIsSubmittingQuestionnaire(false);

      if (result.success) {
        console.log('[App] Questionnaire saved successfully, closing modal');
        setShowQuestionnaire(false);
        setPendingCallId(null);
        // Reset prospect name state for next call
        setProspectName(null);
        setProspectNameSaved(false);
      } else {
        console.error('[App] Questionnaire submission failed:', result.error);
        setError(result.error || 'Failed to save call data');
        setTimeout(() => setError(null), 5000);
      }
    } catch (err) {
      console.error('[App] Questionnaire submission error:', err);
      setIsSubmittingQuestionnaire(false);
      setError('Network error. Please try again.');
      setTimeout(() => setError(null), 5000);
    }
  };

  const handleQuestionnaireCancel = () => {
    // Allow cancel but warn user - for now just close
    // In production, you might want to confirm first
    setShowQuestionnaire(false);
    setPendingCallId(null);
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
    <div className="h-screen flex flex-col bg-white text-black">
      {/* Post-Call Questionnaire Modal */}
      {showQuestionnaire && pendingCallId && (
        <PostCallQuestionnaire
          callId={pendingCallId}
          initialProspectName={prospectName || undefined}
          onSubmit={handleQuestionnaireSubmit}
          onCancel={handleQuestionnaireCancel}
          isSubmitting={isSubmittingQuestionnaire}
        />
      )}

      {/* Draggable title bar with sign out */}
      <div className="titlebar h-8 flex items-center justify-end px-4 border-b border-gray-200">
        <button
          onClick={onLogout}
          className="text-xs text-gray-400 hover:text-gray-600 transition-colors duration-150"
        >
          Sign out
        </button>
      </div>

      {/* Logo centered at top */}
      <div className="pt-4 pb-2 flex justify-center">
        <img src={logoImage} alt="Sequ3nce" className="h-12" />
      </div>

      {/* User info */}
      <div className="px-4 py-2 border-b border-gray-100 bg-gray-50/50">
        <div className="text-sm font-medium text-gray-900 text-center">{closerInfo.name}</div>
        <div className="text-xs text-gray-500 text-center">{closerInfo.teamName}</div>
      </div>

      {/* Main content */}
      <div className="flex-1 flex flex-col items-center justify-center p-6">
        {/* Status indicator */}
        <StatusIndicator status={status} />

        {/* Duration */}
        {isRecording && (
          <div className="mt-4 text-2xl font-mono text-gray-900 tabular-nums">
            {formatDuration(duration)}
          </div>
        )}

        {/* Prospect Name Prompt - shown when recording and name not yet saved */}
        {isRecording && showProspectPrompt && !prospectNameSaved && (
          <div className="mt-4 w-full max-w-xs">
            <ProspectNamePrompt
              suggestedName={scheduledCallMatch?.prospectName}
              source={scheduledCallMatch?.source}
              onSubmit={handleProspectNameSubmit}
            />
          </div>
        )}

        {/* Prospect Name Confirmed - shown when name is saved */}
        {isRecording && prospectNameSaved && prospectName && (
          <div className="mt-4 w-full max-w-xs">
            <div className="bg-green-50 border border-green-200 rounded-lg p-3 flex items-center gap-2">
              <svg className="w-4 h-4 text-green-600 flex-shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
              </svg>
              <span className="text-sm text-green-800">Calling {prospectName}</span>
            </div>
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

        {/* Panel toggle button */}
        <button
          onClick={handleToggleAmmoTracker}
          className={`mt-4 px-4 py-2 rounded-lg text-sm font-medium transition-all duration-150 flex items-center gap-2 ${
            ammoTrackerVisible
              ? 'bg-black text-white hover:bg-gray-800'
              : 'bg-gray-100 text-gray-600 hover:bg-gray-200 hover:text-gray-800'
          }`}
        >
          <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 6h16M4 12h16M4 18h7" />
          </svg>
          {ammoTrackerVisible ? 'Hide Panel' : 'Show Panel'}
        </button>

        {/* Call ID */}
        {callId && (
          <p className="mt-4 text-xs text-gray-400 font-mono">
            Call: {callId.slice(0, 8)}...
          </p>
        )}

        {/* Error message */}
        {error && (
          <div className="mt-4 p-3 bg-red-50 border border-red-200 rounded-lg max-w-xs">
            <p className="text-red-600 text-sm text-center">{error}</p>
          </div>
        )}
      </div>

      {/* Footer */}
      <div className="p-4 border-t border-gray-200">
        <div className="flex items-center justify-between text-xs text-gray-500">
          <span>v{version}</span>
          <span className="flex items-center gap-1.5">
            <span className={`w-1.5 h-1.5 rounded-full transition-colors duration-150 ${
              status === 'idle' ? 'bg-gray-400' :
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
