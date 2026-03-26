import React, { useState, useEffect } from 'react';
import {
  loginCloser,
  logClientError,
  type CloserInfo,
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
      screenPermission: undefined as string | undefined,
      microphonePermission: undefined as string | undefined,
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

function AppContent() {
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

  const handleLogin = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!email.trim() || !password.trim()) return;

    setAuthState('logging_in');
    setAuthError(null);

    try {
      const result = await loginCloser(email.trim().toLowerCase(), password.trim());

      if (result.success && result.closer) {
        // Save closer info to localStorage
        localStorage.setItem(STORAGE_KEY, JSON.stringify(result.closer));
        setCloserInfo(result.closer);
        setAuthState('authenticated');

        // Set closer ID for the training window
        window.electron.training?.setCloserId(result.closer.closerId);
        // Set team ID for resources in ammo tracker
        window.electron.ammo?.setTeamId(result.closer.teamId);
        // Set closer email and team ID for the schedule window
        window.electron.schedule?.setCloserEmail(result.closer.email);
        window.electron.schedule?.setTeamId(result.closer.teamId);
        // Start chat polling for live messages
        window.electron.chat?.startPolling(result.closer.closerId, result.closer.teamId, result.closer.name);

        // Size window for bot hub
        window.electron.app.setWindowSize?.(1200, 800);

        // Send startup diagnostic (helps debug remote issues)
        sendStartupDiagnostic(result.closer.email);
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

    // Clear closer ID for the training window
    window.electron.training?.setCloserId(null);
    // Stop chat polling
    window.electron.chat?.stopPolling();
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
    return <MeetingBotHub closerInfo={closerInfo} onLogout={handleLogout} />;
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
          <img src={logoImage} alt="Sequ3nce" className="h-14 mx-auto dark-invert" />
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
