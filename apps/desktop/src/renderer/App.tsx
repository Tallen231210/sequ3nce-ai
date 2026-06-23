import React, { useState, useEffect } from 'react';
import * as Sentry from '@sentry/electron/renderer';
import {
  loginCloser,
  requestMagicLink,
  verifyMagicLink,
  pickCloserTeam,
  logClientError,
  type CloserInfo,
  type TeamChoice,
} from './convex';
import { MeetingBotHub } from './views/MeetingBotHub';
import { ThemeProvider } from './ThemeContext';
import logoImage from '../assets/logo.png';

// Storage keys
const STORAGE_KEY = 'sequ3nce_closer_info';

// Send startup diagnostic to help debug issues remotely
async function sendStartupDiagnostic(closerEmail: string): Promise<void> {
  try {
    // Start with required fields for ClientErrorData type
    const diagnostic = {
      closerEmail,
      errorType: 'diagnostic_startup',
      errorMessage: 'App started successfully',
      platform: undefined as string | undefined,
      osVersion: undefined as string | undefined,
      architecture: undefined as string | undefined,
      appVersion: undefined as string | undefined,
      context: undefined as string | undefined,
    };

    // Gather additional context in isolated try/catches
    const contextErrors: Record<string, string> = {};

    try {
      const p = await window.electron.app.getPlatform();
      diagnostic.platform = p.platform;
      diagnostic.osVersion = p.osRelease;
      diagnostic.architecture = p.arch;
    } catch (e) { contextErrors.platformError = String(e); }

    try {
      diagnostic.appVersion = await window.electron.app.getVersion();
    } catch (e) { contextErrors.appVersionError = String(e); }

    // Include any errors in gathering context
    if (Object.keys(contextErrors).length > 0) {
      diagnostic.context = JSON.stringify(contextErrors);
    }

    // Send diagnostic (fire and forget)
    logClientError(diagnostic);
    console.log('[App] Startup diagnostic sent:', diagnostic);
  } catch (e) {
    console.error('[App] Failed to send startup diagnostic:', e);
  }
}

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
  return (
    <ThemeProvider>
      <AppContent />
    </ThemeProvider>
  );
}

type LoginMode = 'magic_email' | 'magic_code' | 'team_picker' | 'password';

function AppContent() {
  const [authState, setAuthState] = useState<AuthState>('initial_loading');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [closerInfo, setCloserInfo] = useState<CloserInfo | null>(null);
  const [authError, setAuthError] = useState<AuthError | null>(null);
  // Magic-link state — separate from password so a closer can switch
  // between flows without losing their email field.
  const [loginMode, setLoginMode] = useState<LoginMode>('magic_email');
  const [magicCode, setMagicCode] = useState('');
  const [magicMessage, setMagicMessage] = useState<string | null>(null);
  // Team-picker state — set when verify returns multiple matching teams.
  // Closer picks one; pickCloserTeam finalizes auth with the chosen ID.
  const [teamChoices, setTeamChoices] = useState<TeamChoice[]>([]);
  const [pickerToken, setPickerToken] = useState<string | null>(null);

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

        // Tag every subsequent Sentry event with which closer is logged in.
        Sentry.setUser({
          id: info.closerId,
          email: info.email,
          username: info.name,
        });

        // Set closer ID for the training window
        window.electron.training?.setCloserId(info.closerId);
        // Set team ID for resources in ammo tracker
        window.electron.ammo?.setTeamId(info.teamId);
        // Set closer email and team ID for the schedule window
        window.electron.schedule?.setCloserEmail(info.email);
        window.electron.schedule?.setTeamId(info.teamId);
        // Start chat polling for live messages
        window.electron.chat?.startPolling(info.closerId, info.teamId, info.name);

        // Size window for bot hub
        window.electron.app.setWindowSize?.(1200, 800);

        // Send startup diagnostic (helps debug remote issues)
        sendStartupDiagnostic(info.email);
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

  // Shared post-auth side effects. Both password login and magic-link
  // verify funnel through here so we don't drift the two code paths.
  const completeLogin = (closer: CloserInfo) => {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(closer));
    setCloserInfo(closer);
    setAuthState('authenticated');

    Sentry.setUser({
      id: closer.closerId,
      email: closer.email,
      username: closer.name,
    });

    window.electron.training?.setCloserId(closer.closerId);
    window.electron.ammo?.setTeamId(closer.teamId);
    window.electron.schedule?.setCloserEmail(closer.email);
    window.electron.schedule?.setTeamId(closer.teamId);
    window.electron.chat?.startPolling(closer.closerId, closer.teamId, closer.name);
    window.electron.app.setWindowSize?.(1200, 800);

    sendStartupDiagnostic(closer.email);
  };

  const handleLogin = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!email.trim() || !password.trim()) return;

    setAuthState('logging_in');
    setAuthError(null);

    try {
      const result = await loginCloser(email.trim().toLowerCase(), password.trim());
      if (result.success && result.closer) {
        completeLogin(result.closer);
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

  // Magic-link: ask the backend to email a 6-digit code.
  const handleRequestMagicLink = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!email.trim()) return;

    setAuthState('logging_in');
    setAuthError(null);
    setMagicMessage(null);

    try {
      const result = await requestMagicLink(email.trim().toLowerCase());
      if (result.success) {
        setLoginMode('magic_code');
        setMagicMessage(`Check ${email.trim().toLowerCase()} for a 6-digit code. It's valid for 7 days.`);
        setAuthState('login');
      } else {
        setAuthError({
          message: result.error || 'Could not send sign-in link. Try again.',
        });
        setAuthState('error');
      }
    } catch (err) {
      console.error('[App] requestMagicLink error:', err);
      setAuthError({
        message: 'Network error. Please check your connection and try again.',
      });
      setAuthState('error');
    }
  };

  // Magic-link: verify the 6-digit code. Accepts overrides for both
  // code AND email because the deep-link handler fires synchronously
  // after setState calls — the component state hasn't committed yet
  // when this is invoked from the auth:callback listener, so we can't
  // rely on the `email` closure.
  const handleVerifyMagicLink = async (
    codeOverride?: string,
    emailOverride?: string,
  ) => {
    const code = (codeOverride ?? magicCode).trim();
    const normalizedEmail = (emailOverride ?? email).trim().toLowerCase();
    if (!normalizedEmail || code.length !== 6) return;

    setAuthState('logging_in');
    setAuthError(null);

    try {
      const result = await verifyMagicLink(normalizedEmail, code);
      if (!result.success) {
        setAuthError({
          message: result.error || 'Invalid or expired code.',
        });
        setAuthState('error');
        return;
      }
      if (result.kind === 'signed_in') {
        completeLogin(result.closer);
        return;
      }
      // Multi-team case: stash choices + token, show picker.
      setTeamChoices(result.choices);
      setPickerToken(result.pickerToken);
      setLoginMode('team_picker');
      setAuthState('login');
    } catch (err) {
      console.error('[App] verifyMagicLink error:', err);
      setAuthError({
        message: 'Network error. Please check your connection and try again.',
      });
      setAuthState('error');
    }
  };

  // Multi-team picker: closer chose a team, finalize auth.
  const handlePickTeam = async (closerId: string) => {
    if (!pickerToken) return;
    setAuthState('logging_in');
    setAuthError(null);
    try {
      const result = await pickCloserTeam(pickerToken, closerId);
      if (result.success && result.closer) {
        completeLogin(result.closer);
        return;
      }
      // Most commonly: picker token expired. Reset to email entry so
      // the closer can request a fresh code.
      setAuthError({
        message: result.error || 'Selection timed out. Sign in again.',
      });
      setAuthState('error');
      setLoginMode('magic_email');
      setMagicCode('');
      setPickerToken(null);
      setTeamChoices([]);
    } catch (err) {
      console.error('[App] pickCloserTeam error:', err);
      setAuthError({
        message: 'Network error. Please check your connection and try again.',
      });
      setAuthState('error');
    }
  };

  // Listen for the sequ3nce:// auth-callback deep-link from main process
  // (preload dispatches as a CustomEvent on window). When the closer
  // clicks "Open in Sequ3nce app" in the email, we get { email, code }
  // here and can auto-verify without typing.
  useEffect(() => {
    const handler = (event: Event) => {
      const detail = (event as CustomEvent<{ email?: string; code?: string }>)
        .detail;
      if (!detail?.email || !detail?.code) return;
      setEmail(detail.email);
      setMagicCode(detail.code);
      setLoginMode('magic_code');
      // Pass both overrides — state from setEmail hasn't committed yet.
      void handleVerifyMagicLink(detail.code, detail.email);
    };
    window.addEventListener('auth:callback', handler as EventListener);
    return () =>
      window.removeEventListener('auth:callback', handler as EventListener);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const handleLogout = () => {
    clearSession();
    setEmail('');
    setPassword('');
    setAuthState('login');
    // Reset magic-link state too, otherwise a logged-out closer might
    // land on the code-entry screen or the password screen depending on
    // how they last signed in. Default everyone to the magic-link email
    // entry point — clean slate.
    setLoginMode('magic_email');
    setMagicCode('');
    setMagicMessage(null);
    setTeamChoices([]);
    setPickerToken(null);

    // Clear Sentry user so subsequent errors aren't attributed to the
    // logged-out closer.
    Sentry.setUser(null);

    // Clear closer ID for the training window
    window.electron.training?.setCloserId(null);
    // Stop chat polling
    window.electron.chat?.stopPolling();
    // Clear schedule window state so stale email/teamId don't persist across sessions
    window.electron.schedule?.setCloserEmail(null);
    window.electron.schedule?.setTeamId(null);
  };

  const handleRetry = () => {
    setAuthError(null);
    setAuthState('login');
    // Send them back to the magic-email entry point. Otherwise a
    // closer whose code expired bounces back to the code-entry screen
    // (or stale team-picker view) with no path to request a fresh one.
    setLoginMode('magic_email');
    setMagicCode('');
    setMagicMessage(null);
    setTeamChoices([]);
    setPickerToken(null);
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
        mode={loginMode}
        setMode={setLoginMode}
        email={email}
        setEmail={setEmail}
        password={password}
        setPassword={setPassword}
        magicCode={magicCode}
        setMagicCode={setMagicCode}
        magicMessage={magicMessage}
        teamChoices={teamChoices}
        onPasswordSubmit={handleLogin}
        onMagicRequest={handleRequestMagicLink}
        onMagicVerify={() => handleVerifyMagicLink()}
        onPickTeam={handlePickTeam}
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
    return <MeetingBotHub closerInfo={closerInfo} onLogout={handleLogout} />;
  }

  // Fallback - shouldn't reach here
  return (
    <LoginScreen
      mode={loginMode}
      setMode={setLoginMode}
      email={email}
      setEmail={setEmail}
      password={password}
      setPassword={setPassword}
      magicCode={magicCode}
      setMagicCode={setMagicCode}
      magicMessage={magicMessage}
      teamChoices={teamChoices}
      onPasswordSubmit={handleLogin}
      onMagicRequest={handleRequestMagicLink}
      onMagicVerify={() => handleVerifyMagicLink()}
      onPickTeam={handlePickTeam}
      isLoading={false}
    />
  );
}

// ==================== Auth Screens ====================

interface LoginScreenProps {
  mode: LoginMode;
  setMode: (m: LoginMode) => void;
  email: string;
  setEmail: (email: string) => void;
  password: string;
  setPassword: (password: string) => void;
  magicCode: string;
  setMagicCode: (code: string) => void;
  magicMessage: string | null;
  teamChoices: TeamChoice[];
  onPasswordSubmit: (e: React.FormEvent) => void;
  onMagicRequest: (e: React.FormEvent) => void;
  onMagicVerify: () => void;
  onPickTeam: (closerId: string) => void;
  isLoading: boolean;
}

function LoginScreen({
  mode,
  setMode,
  email,
  setEmail,
  password,
  setPassword,
  magicCode,
  setMagicCode,
  magicMessage,
  teamChoices,
  onPasswordSubmit,
  onMagicRequest,
  onMagicVerify,
  onPickTeam,
  isLoading,
}: LoginScreenProps) {
  return (
    <div className="h-screen flex flex-col bg-white text-black">
      <div className="titlebar h-8 border-b border-gray-200" />

      <div className="flex-1 flex flex-col items-center justify-center p-6">
        <div className="mb-8 text-center">
          <img src={logoImage} alt="Sequ3nce" className="h-14 mx-auto dark-invert" />
          <p className="text-gray-500 text-sm mt-4">Sign in to your account</p>
        </div>

        {/* Mode 1 — request magic link (email only) */}
        {mode === 'magic_email' && (
          <form onSubmit={onMagicRequest} className="w-full max-w-xs space-y-4">
            <input
              type="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              placeholder="Email"
              className="w-full px-4 py-3 bg-gray-50 border border-gray-200 rounded-lg text-black placeholder-gray-400 focus:outline-none focus:border-gray-400 focus:ring-1 focus:ring-gray-400 transition-all duration-150"
              disabled={isLoading}
              autoFocus
            />
            <button
              type="submit"
              disabled={isLoading || !email.trim()}
              className="w-full py-3 bg-black text-white font-medium rounded-lg hover:bg-gray-800 transition-colors duration-150 disabled:opacity-50 disabled:cursor-not-allowed flex items-center justify-center gap-2"
            >
              {isLoading ? (
                <>
                  <div className="animate-spin w-4 h-4 border-2 border-gray-400 border-t-white rounded-full" />
                  Sending...
                </>
              ) : (
                'Send me a sign-in link'
              )}
            </button>
            <button
              type="button"
              onClick={() => setMode('password')}
              className="w-full text-xs text-gray-500 hover:text-gray-700 transition-colors"
            >
              Sign in with password instead
            </button>
          </form>
        )}

        {/* Mode 2 — enter the 6-digit code */}
        {mode === 'magic_code' && (
          <form
            onSubmit={(e) => {
              e.preventDefault();
              onMagicVerify();
            }}
            className="w-full max-w-xs space-y-4"
          >
            {magicMessage && (
              <p className="text-xs text-gray-600 text-center bg-gray-50 border border-gray-200 rounded-md px-3 py-2">
                {magicMessage}
              </p>
            )}
            <input
              type="text"
              inputMode="numeric"
              autoComplete="one-time-code"
              maxLength={6}
              value={magicCode}
              onChange={(e) =>
                setMagicCode(e.target.value.replace(/\D/g, '').slice(0, 6))
              }
              placeholder="6-digit code"
              className="w-full px-4 py-3 bg-gray-50 border border-gray-200 rounded-lg text-black text-center text-2xl tracking-[0.5em] font-mono placeholder-gray-400 placeholder:tracking-normal placeholder:text-sm placeholder:font-sans focus:outline-none focus:border-gray-400 focus:ring-1 focus:ring-gray-400 transition-all duration-150"
              disabled={isLoading}
              autoFocus
            />
            <button
              type="submit"
              disabled={isLoading || magicCode.length !== 6}
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
            <button
              type="button"
              onClick={() => {
                setMode('magic_email');
                setMagicCode('');
              }}
              className="w-full text-xs text-gray-500 hover:text-gray-700 transition-colors"
            >
              Use a different email
            </button>
          </form>
        )}

        {/* Mode 2b — pick a team (only when verify returned multiple matching closer records) */}
        {mode === 'team_picker' && (
          <div className="w-full max-w-xs space-y-3">
            <p className="text-sm text-gray-700 text-center mb-1">
              You belong to multiple Sequ3nce teams.
            </p>
            <p className="text-xs text-gray-500 text-center mb-3">
              Which one are you signing into?
            </p>
            {teamChoices.map((choice) => (
              <button
                key={choice.closerId}
                type="button"
                onClick={() => onPickTeam(choice.closerId)}
                disabled={isLoading}
                className="w-full flex items-center justify-between px-4 py-3 bg-gray-50 border border-gray-200 rounded-lg text-left text-black hover:border-gray-400 hover:bg-gray-100 transition-all duration-150 disabled:opacity-50 disabled:cursor-not-allowed"
              >
                <span className="font-medium">{choice.teamName}</span>
                {choice.status === 'pending' && (
                  <span className="text-[10px] uppercase tracking-wider text-gray-500">
                    New invite
                  </span>
                )}
              </button>
            ))}
            <button
              type="button"
              onClick={() => setMode('magic_email')}
              disabled={isLoading}
              className="w-full text-xs text-gray-500 hover:text-gray-700 transition-colors mt-2"
            >
              Use a different email
            </button>
            <p className="text-[11px] text-gray-400 text-center mt-2">
              You have 2 minutes to choose before the session expires.
            </p>
          </div>
        )}

        {/* Mode 3 — legacy password sign-in (for closers added pre-magic-link) */}
        {mode === 'password' && (
          <form onSubmit={onPasswordSubmit} className="w-full max-w-xs space-y-4">
            <input
              type="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              placeholder="Email"
              className="w-full px-4 py-3 bg-gray-50 border border-gray-200 rounded-lg text-black placeholder-gray-400 focus:outline-none focus:border-gray-400 focus:ring-1 focus:ring-gray-400 transition-all duration-150"
              disabled={isLoading}
              autoFocus
            />
            <input
              type="password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              placeholder="Password"
              className="w-full px-4 py-3 bg-gray-50 border border-gray-200 rounded-lg text-black placeholder-gray-400 focus:outline-none focus:border-gray-400 focus:ring-1 focus:ring-gray-400 transition-all duration-150"
              disabled={isLoading}
            />
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
            <button
              type="button"
              onClick={() => setMode('magic_email')}
              className="w-full text-xs text-gray-500 hover:text-gray-700 transition-colors"
            >
              Forgot password? Send me a sign-in link
            </button>
          </form>
        )}

        <p className="mt-8 text-xs text-gray-400 text-center max-w-xs">
          {mode === 'password'
            ? 'Use the email and password your manager provided.'
            : 'We’ll email you a one-time sign-in code.'}
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
          <img src={logoImage} alt="Sequ3nce" className="h-14 mx-auto dark-invert" />
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
