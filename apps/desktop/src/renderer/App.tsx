import React, { useState, useEffect, useRef, useCallback } from 'react';
import { AudioStatus } from './types/electron';
import { StatusIndicator } from './components/StatusIndicator';
import { AudioLevelMeter } from './components/AudioLevelMeter';
import { RecordButton } from './components/RecordButton';
import { PostCallQuestionnaire, CallOutcome } from './components/PostCallQuestionnaire';
import { useAudioCapture } from './hooks/useAudioCapture';
import { getCloserByEmail, activateCloser, completeCallWithOutcome, type CloserInfo } from './convex';
import logoImage from '../assets/logo.png';

// Storage keys
const STORAGE_KEY = 'seq3nce_closer_email';
const SESSION_KEY = 'seq3nce_session';

// Auth states
type AuthState =
  | 'initial_loading'    // Checking if user is already logged in
  | 'email_entry'        // Showing email input
  | 'sending_link'       // Sending magic link
  | 'waiting_for_link'   // Waiting for user to click magic link
  | 'verifying'          // Verifying the session
  | 'checking_closer'    // Authenticated, checking if they're a closer
  | 'authenticated'      // Fully logged in
  | 'error';             // Error state

interface AuthError {
  message: string;
  action?: 'retry' | 'different_email' | 'contact_admin';
}

export function App() {
  const [authState, setAuthState] = useState<AuthState>('initial_loading');
  const [email, setEmail] = useState('');
  const [closerInfo, setCloserInfo] = useState<CloserInfo | null>(null);
  const [authError, setAuthError] = useState<AuthError | null>(null);
  const [canResend, setCanResend] = useState(false);
  const resendTimerRef = useRef<NodeJS.Timeout | null>(null);

  // Check for existing session on mount
  useEffect(() => {
    checkExistingSession();

    // Listen for auth callback from main process
    const handleAuthCallback = (event: CustomEvent<{ token?: string; email?: string; error?: string }>) => {
      console.log('[App] Auth callback received:', event.detail);
      if (event.detail.error) {
        setAuthError({ message: event.detail.error, action: 'retry' });
        setAuthState('error');
      } else if (event.detail.token) {
        // Use email from callback if available, otherwise use the current email state
        const authEmail = event.detail.email || email;
        if (authEmail) {
          setEmail(authEmail);
        }
        handleAuthSuccess(event.detail.token, authEmail);
      }
    };

    window.addEventListener('auth:callback' as any, handleAuthCallback);

    return () => {
      window.removeEventListener('auth:callback' as any, handleAuthCallback);
      if (resendTimerRef.current) {
        clearTimeout(resendTimerRef.current);
      }
    };
  }, [email]);

  const checkExistingSession = async () => {
    const savedEmail = localStorage.getItem(STORAGE_KEY);
    const savedSession = localStorage.getItem(SESSION_KEY);

    if (savedEmail && savedSession) {
      // Verify the session is still valid
      setAuthState('verifying');
      try {
        const isValid = await window.electron.auth.verifySession(savedSession);
        if (isValid) {
          await verifyCloserAndLogin(savedEmail);
        } else {
          // Session expired, clear and show login
          clearSession();
          setAuthState('email_entry');
        }
      } catch (err) {
        console.error('[App] Session verification error:', err);
        clearSession();
        setAuthState('email_entry');
      }
    } else {
      setAuthState('email_entry');
    }
  };

  const clearSession = () => {
    localStorage.removeItem(STORAGE_KEY);
    localStorage.removeItem(SESSION_KEY);
    setCloserInfo(null);
  };

  const handleSendMagicLink = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!email.trim()) return;

    const normalizedEmail = email.trim().toLowerCase();
    setAuthState('sending_link');
    setAuthError(null);

    try {
      const result = await window.electron.auth.sendMagicLink(normalizedEmail);

      if (result.success) {
        setAuthState('waiting_for_link');
        // Start resend timer (30 seconds)
        setCanResend(false);
        resendTimerRef.current = setTimeout(() => {
          setCanResend(true);
        }, 30000);
      } else {
        setAuthError({
          message: result.error || 'Failed to send magic link. Please try again.',
          action: 'retry'
        });
        setAuthState('error');
      }
    } catch (err) {
      console.error('[App] Error sending magic link:', err);
      setAuthError({
        message: 'Network error. Please check your connection and try again.',
        action: 'retry'
      });
      setAuthState('error');
    }
  };

  const handleAuthSuccess = async (sessionToken: string, authEmail?: string) => {
    setAuthState('checking_closer');
    localStorage.setItem(SESSION_KEY, sessionToken);

    // Use the email from callback if provided, otherwise use current state
    const normalizedEmail = (authEmail || email).trim().toLowerCase();
    await verifyCloserAndLogin(normalizedEmail);
  };

  const verifyCloserAndLogin = async (userEmail: string) => {
    setAuthState('checking_closer');

    try {
      const info = await getCloserByEmail(userEmail);

      if (!info) {
        setAuthError({
          message: "You haven't been added to a team yet. Contact your manager to get set up.",
          action: 'contact_admin'
        });
        setAuthState('error');
        return;
      }

      if (info.status === 'deactivated') {
        setAuthError({
          message: "Your account has been deactivated. Contact your manager for assistance.",
          action: 'contact_admin'
        });
        setAuthState('error');
        return;
      }

      // Activate the closer if pending
      await activateCloser(userEmail);

      localStorage.setItem(STORAGE_KEY, userEmail);
      setCloserInfo(info);
      setAuthState('authenticated');
    } catch (err) {
      console.error('[App] Error verifying closer:', err);
      setAuthError({
        message: 'Unable to verify your account. Please try again.',
        action: 'retry'
      });
      setAuthState('error');
    }
  };

  const handleResendLink = async () => {
    if (!canResend) return;

    setCanResend(false);
    setAuthState('sending_link');

    try {
      const result = await window.electron.auth.sendMagicLink(email.trim().toLowerCase());

      if (result.success) {
        setAuthState('waiting_for_link');
        resendTimerRef.current = setTimeout(() => {
          setCanResend(true);
        }, 30000);
      } else {
        setAuthError({
          message: result.error || 'Failed to resend link.',
          action: 'retry'
        });
        setAuthState('error');
      }
    } catch (err) {
      setAuthError({
        message: 'Network error. Please try again.',
        action: 'retry'
      });
      setAuthState('error');
    }
  };

  const handleUseDifferentEmail = () => {
    setEmail('');
    setAuthError(null);
    setAuthState('email_entry');
    if (resendTimerRef.current) {
      clearTimeout(resendTimerRef.current);
    }
  };

  const handleLogout = async () => {
    try {
      await window.electron.auth.signOut();
    } catch (err) {
      console.error('[App] Logout error:', err);
    }
    clearSession();
    setEmail('');
    setAuthState('email_entry');
  };

  const handleRetry = () => {
    setAuthError(null);
    if (authError?.action === 'different_email') {
      setAuthState('email_entry');
    } else {
      // Retry sending magic link
      handleSendMagicLink({ preventDefault: () => {} } as React.FormEvent);
    }
  };

  // Render based on auth state
  if (authState === 'initial_loading' || authState === 'verifying') {
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

  if (authState === 'email_entry' || authState === 'sending_link') {
    return (
      <EmailEntryScreen
        email={email}
        setEmail={setEmail}
        onSubmit={handleSendMagicLink}
        isLoading={authState === 'sending_link'}
      />
    );
  }

  if (authState === 'waiting_for_link' || authState === 'checking_closer') {
    return (
      <WaitingForLinkScreen
        email={email}
        canResend={canResend && authState === 'waiting_for_link'}
        onResend={handleResendLink}
        onUseDifferentEmail={handleUseDifferentEmail}
        isVerifying={authState === 'checking_closer'}
      />
    );
  }

  if (authState === 'error' && authError) {
    return (
      <ErrorScreen
        error={authError}
        onRetry={handleRetry}
        onUseDifferentEmail={handleUseDifferentEmail}
      />
    );
  }

  if (authState === 'authenticated' && closerInfo) {
    return <MainApp closerInfo={closerInfo} onLogout={handleLogout} />;
  }

  // Fallback - shouldn't reach here
  return (
    <EmailEntryScreen
      email={email}
      setEmail={setEmail}
      onSubmit={handleSendMagicLink}
      isLoading={false}
    />
  );
}

// ==================== Auth Screens ====================

interface EmailEntryScreenProps {
  email: string;
  setEmail: (email: string) => void;
  onSubmit: (e: React.FormEvent) => void;
  isLoading: boolean;
}

function EmailEntryScreen({ email, setEmail, onSubmit, isLoading }: EmailEntryScreenProps) {
  return (
    <div className="h-screen flex flex-col bg-white text-black">
      <div className="titlebar h-8 border-b border-gray-200" />

      <div className="flex-1 flex flex-col items-center justify-center p-6">
        <div className="mb-8 text-center">
          <img src={logoImage} alt="Seq3nce" className="h-14 mx-auto" />
          <p className="text-gray-500 text-sm mt-4">Enter your email to get started</p>
        </div>

        <form onSubmit={onSubmit} className="w-full max-w-xs space-y-4">
          <div>
            <input
              type="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              placeholder="you@example.com"
              className="w-full px-4 py-3 bg-gray-50 border border-gray-200 rounded-lg text-black placeholder-gray-400 focus:outline-none focus:border-gray-400 focus:ring-1 focus:ring-gray-400 transition-all duration-150"
              disabled={isLoading}
              autoFocus
            />
          </div>

          <button
            type="submit"
            disabled={isLoading || !email.trim()}
            className="w-full py-3 bg-black text-white font-medium rounded-lg hover:bg-gray-800 transition-colors duration-150 disabled:opacity-50 disabled:cursor-not-allowed flex items-center justify-center gap-2"
          >
            {isLoading ? (
              <>
                <div className="animate-spin w-4 h-4 border-2 border-gray-400 border-t-white rounded-full" />
                Sending link...
              </>
            ) : (
              'Continue'
            )}
          </button>
        </form>

        <p className="mt-8 text-xs text-gray-400 text-center max-w-xs">
          We'll send a secure login link to your email
        </p>
      </div>
    </div>
  );
}

interface WaitingForLinkScreenProps {
  email: string;
  canResend: boolean;
  onResend: () => void;
  onUseDifferentEmail: () => void;
  isVerifying: boolean;
}

function WaitingForLinkScreen({ email, canResend, onResend, onUseDifferentEmail, isVerifying }: WaitingForLinkScreenProps) {
  return (
    <div className="h-screen flex flex-col bg-white text-black">
      <div className="titlebar h-8 border-b border-gray-200" />

      <div className="flex-1 flex flex-col items-center justify-center p-6">
        <div className="mb-8 text-center">
          <img src={logoImage} alt="Seq3nce" className="h-14 mx-auto" />
        </div>

        {isVerifying ? (
          <div className="text-center">
            <div className="animate-spin w-8 h-8 border-2 border-gray-300 border-t-black rounded-full mx-auto mb-4" />
            <p className="text-gray-900 font-medium">Logging you in...</p>
          </div>
        ) : (
          <>
            {/* Email icon */}
            <div className="w-16 h-16 bg-gray-100 rounded-full flex items-center justify-center mb-6">
              <svg className="w-8 h-8 text-gray-600" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M3 8l7.89 5.26a2 2 0 002.22 0L21 8M5 19h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v10a2 2 0 002 2z" />
              </svg>
            </div>

            <h2 className="text-xl font-semibold text-gray-900 mb-2">Check your email</h2>
            <p className="text-gray-500 text-sm text-center mb-2">
              We sent a login link to
            </p>
            <p className="text-gray-900 font-medium mb-6">{email}</p>
            <p className="text-gray-500 text-sm text-center mb-8 max-w-xs">
              Click the link in your email to continue. The link will expire in 10 minutes.
            </p>

            <div className="space-y-3 w-full max-w-xs">
              <button
                onClick={onResend}
                disabled={!canResend}
                className="w-full py-2.5 text-sm font-medium text-gray-600 hover:text-gray-900 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
              >
                {canResend ? 'Resend link' : 'Resend available in 30s'}
              </button>

              <button
                onClick={onUseDifferentEmail}
                className="w-full py-2.5 text-sm text-gray-400 hover:text-gray-600 transition-colors"
              >
                Use a different email
              </button>
            </div>
          </>
        )}
      </div>
    </div>
  );
}

interface ErrorScreenProps {
  error: AuthError;
  onRetry: () => void;
  onUseDifferentEmail: () => void;
}

function ErrorScreen({ error, onRetry, onUseDifferentEmail }: ErrorScreenProps) {
  return (
    <div className="h-screen flex flex-col bg-white text-black">
      <div className="titlebar h-8 border-b border-gray-200" />

      <div className="flex-1 flex flex-col items-center justify-center p-6">
        <div className="mb-8 text-center">
          <img src={logoImage} alt="Seq3nce" className="h-14 mx-auto" />
        </div>

        {/* Error icon */}
        <div className="w-16 h-16 bg-red-50 rounded-full flex items-center justify-center mb-6">
          <svg className="w-8 h-8 text-red-500" fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z" />
          </svg>
        </div>

        <h2 className="text-xl font-semibold text-gray-900 mb-2">Something went wrong</h2>
        <p className="text-gray-500 text-sm text-center mb-8 max-w-xs">
          {error.message}
        </p>

        <div className="space-y-3 w-full max-w-xs">
          {error.action === 'retry' && (
            <button
              onClick={onRetry}
              className="w-full py-3 bg-black text-white font-medium rounded-lg hover:bg-gray-800 transition-colors duration-150"
            >
              Try again
            </button>
          )}

          {error.action !== 'contact_admin' && (
            <button
              onClick={onUseDifferentEmail}
              className="w-full py-2.5 text-sm text-gray-500 hover:text-gray-700 transition-colors"
            >
              Use a different email
            </button>
          )}

          {error.action === 'contact_admin' && (
            <button
              onClick={onUseDifferentEmail}
              className="w-full py-3 bg-black text-white font-medium rounded-lg hover:bg-gray-800 transition-colors duration-150"
            >
              Try a different email
            </button>
          )}
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
    // Store the current callId before stopping
    if (callId) {
      setPendingCallId(callId);
      setShowQuestionnaire(true);
    }

    // Stop audio capture
    if (isCapturingRef.current) {
      stopCapture();
      isCapturingRef.current = false;
    }
    await window.electron.audio.stop();
  };

  const handleQuestionnaireSubmit = async (data: {
    prospectName: string;
    outcome: CallOutcome;
    dealValue?: number;
    notes?: string;
  }) => {
    if (!pendingCallId) return;

    setIsSubmittingQuestionnaire(true);

    const result = await completeCallWithOutcome({
      callId: pendingCallId,
      prospectName: data.prospectName,
      outcome: data.outcome,
      dealValue: data.dealValue,
      notes: data.notes,
    });

    setIsSubmittingQuestionnaire(false);

    if (result.success) {
      setShowQuestionnaire(false);
      setPendingCallId(null);
    } else {
      setError(result.error || 'Failed to save call data');
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
          onSubmit={handleQuestionnaireSubmit}
          onCancel={handleQuestionnaireCancel}
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
        <img src={logoImage} alt="Seq3nce" className="h-12" />
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
