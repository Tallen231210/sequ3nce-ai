import React, { useState, useEffect, useRef } from 'react';
import { AudioStatus } from './types/electron';
import { StatusIndicator } from './components/StatusIndicator';
import { AudioLevelMeter } from './components/AudioLevelMeter';
import { RecordButton } from './components/RecordButton';
import { PostCallQuestionnaire, CallOutcome } from './components/PostCallQuestionnaire';
import { ProspectNamePrompt } from './components/ProspectNamePrompt';
import { RolePlayRoomButton } from './components/RolePlayRoom';
import { useAudioCapture } from './hooks/useAudioCapture';
import { useRolePlayRoomParticipantCount } from './hooks/useRolePlayRoom';
import {
  loginCloser,
  signupB2CUser,
  completeCallWithOutcome,
  findMatchingScheduledCall,
  updateProspectName,
  changePassword,
  requestPasswordReset,
  resetPasswordWithCode,
  sendVerificationCode,
  logClientError,
  isMeetingBotEnabled,
  type CloserInfo,
  type ScheduledCallMatch,
} from './convex';
import { MeetingBotHub } from './views/MeetingBotHub';
import { EmailVerificationScreen } from './views/EmailVerificationScreen';
import { SubscriptionGate } from './views/SubscriptionGate';
import { ThemeProvider } from './ThemeContext';
import logoImage from '../assets/logo.png';

// Storage keys
const STORAGE_KEY = 'sequ3nce_personal_info';

// Hook to watch for permission changes (self-healing - no restart needed)
function usePermissionWatcher(onPermissionGranted: () => void) {
  const lastScreenPermRef = React.useRef<boolean>(false);
  const lastMicPermRef = React.useRef<string>('');

  React.useEffect(() => {
    let isMounted = true;

    // Check permissions every 2 seconds
    const interval = setInterval(async () => {
      if (!isMounted) return;

      try {
        const currentScreen = await window.electron.audio.checkPermissions();
        const currentMic = await window.electron.audio.checkMicrophonePermission();

        // Check if screen permission was just granted
        if (!lastScreenPermRef.current && currentScreen) {
          console.log('[App] Screen recording permission just granted!');
          lastScreenPermRef.current = currentScreen;
          onPermissionGranted();
        }

        // Check if mic permission was just granted
        if (lastMicPermRef.current !== 'granted' && currentMic === 'granted') {
          console.log('[App] Microphone permission just granted!');
          lastMicPermRef.current = currentMic;
          onPermissionGranted();
        }

        lastScreenPermRef.current = currentScreen;
        lastMicPermRef.current = currentMic;
      } catch (e) {
        // Ignore errors - polling should be silent
      }
    }, 2000);

    // Also check immediately on mount
    (async () => {
      try {
        lastScreenPermRef.current = await window.electron.audio.checkPermissions();
        lastMicPermRef.current = await window.electron.audio.checkMicrophonePermission();
      } catch (e) {
        // Ignore
      }
    })();

    return () => {
      isMounted = false;
      clearInterval(interval);
    };
  }, [onPermissionGranted]);
}

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

    try {
      const screenPerm = await window.electron.audio.checkPermissions();
      diagnostic.screenPermission = String(screenPerm);
    } catch (e) { contextErrors.screenPermError = String(e); }

    try {
      diagnostic.microphonePermission = await window.electron.audio.checkMicrophonePermission();
    } catch (e) { contextErrors.micPermError = String(e); }

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
  | 'signup'             // Showing signup form
  | 'signing_up'         // Attempting signup
  | 'forgot_password'    // Showing forgot password flow
  | 'verify_email'       // Awaiting email verification code
  | 'authenticated'      // Fully logged in
  | 'error';             // Error state

// Validation constants (match backend for consistent UX)
const EMAIL_REGEX = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const PHONE_REGEX = /^\+?[\d\s\-()]{7,20}$/;

interface AuthError {
  message: string;
  origin: 'login' | 'signup';
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
  const [signupName, setSignupName] = useState('');
  const [signupEmail, setSignupEmail] = useState('');
  const [signupPhone, setSignupPhone] = useState('');
  const [signupPassword, setSignupPassword] = useState('');
  const [signupConfirmPassword, setSignupConfirmPassword] = useState('');
  const [closerInfo, setCloserInfo] = useState<CloserInfo | null>(null);
  const [authError, setAuthError] = useState<AuthError | null>(null);
  const [isBotMode, setIsBotMode] = useState(false);
  const [botModeChecked, setBotModeChecked] = useState(false);
  const isSubmittingRef = useRef(false);
  const [pendingVerificationEmail, setPendingVerificationEmail] = useState('');
  const [pendingCloserInfo, setPendingCloserInfo] = useState<CloserInfo | null>(null);

  // Shared post-auth initialization (DRY — used by login, signup, and session restore)
  const initializeSession = (info: CloserInfo) => {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(info));
    setCloserInfo(info);
    setAuthState('authenticated');

    window.electron?.training?.setCloserId(info.closerId);
    window.electron?.ammo?.setTeamId(info.teamId);
    window.electron?.schedule?.setCloserEmail(info.email);
    window.electron?.schedule?.setTeamId(info.teamId);
    window.electron?.chat?.startPolling(info.closerId, info.teamId, info.name);

    isMeetingBotEnabled(info.teamId).then((enabled) => {
      setIsBotMode(enabled);
      setBotModeChecked(true);
      localStorage.setItem('sequ3nce_personal_bot_mode', String(enabled));
      if (enabled) {
        window.electron?.app.setWindowSize?.(1200, 800);
      }
    }).catch(() => {
      setBotModeChecked(true);
    });

    sendStartupDiagnostic(info.email);
  };

  // Check for existing session on mount
  useEffect(() => {
    checkExistingSession();
  }, []);

  const checkExistingSession = () => {
    const savedCloserInfo = localStorage.getItem(STORAGE_KEY);

    if (savedCloserInfo) {
      try {
        const info = JSON.parse(savedCloserInfo) as CloserInfo;
        initializeSession(info);
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
    if (isSubmittingRef.current) return;

    isSubmittingRef.current = true;
    setAuthState('logging_in');
    setAuthError(null);

    try {
      const result = await loginCloser(email.trim().toLowerCase(), password.trim());

      if (result.success && result.closer) {
        if (result.emailVerified === false) {
          setPendingCloserInfo(result.closer);
          setPendingVerificationEmail(result.closer.email);
          setAuthState('verify_email');
          sendVerificationCode(result.closer.email);
        } else {
          initializeSession(result.closer);
        }
      } else {
        setAuthError({
          message: result.error || 'Login failed. Please try again.',
          origin: 'login',
        });
        setAuthState('error');
      }
    } catch (err) {
      console.error('[App] Login error:', err);
      setAuthError({
        message: 'Network error. Please check your connection and try again.',
        origin: 'login',
      });
      setAuthState('error');
    } finally {
      isSubmittingRef.current = false;
    }
  };

  const handleSignup = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!signupName.trim() || !signupEmail.trim() || !signupPhone.trim() || !signupPassword.trim()) return;
    if (isSubmittingRef.current) return;

    // Client-side validation (mirrors backend for instant feedback)
    if (!EMAIL_REGEX.test(signupEmail.trim())) {
      setAuthError({ message: 'Please enter a valid email address.', origin: 'signup' });
      setAuthState('error');
      return;
    }

    if (!PHONE_REGEX.test(signupPhone.trim())) {
      setAuthError({ message: 'Please enter a valid phone number.', origin: 'signup' });
      setAuthState('error');
      return;
    }

    if (signupPassword !== signupConfirmPassword) {
      setAuthError({ message: 'Passwords do not match.', origin: 'signup' });
      setAuthState('error');
      return;
    }

    if (signupPassword.length < 8) {
      setAuthError({ message: 'Password must be at least 8 characters.', origin: 'signup' });
      setAuthState('error');
      return;
    }

    isSubmittingRef.current = true;
    setAuthState('signing_up');
    setAuthError(null);

    try {
      const result = await signupB2CUser(
        signupEmail.trim().toLowerCase(),
        signupPhone.trim(),
        signupPassword.trim(),
        signupName.trim()
      );

      if (result.success && result.closerId && result.teamId) {
        const closerInfoData: CloserInfo = {
          closerId: result.closerId,
          teamId: result.teamId,
          name: result.name || signupName.trim(),
          email: result.email || signupEmail.trim().toLowerCase(),
          status: 'active',
          subscriptionStatus: result.subscriptionStatus || 'none',
        };

        // Clear signup form fields
        setSignupName('');
        setSignupEmail('');
        setSignupPhone('');
        setSignupPassword('');
        setSignupConfirmPassword('');

        // Route to email verification
        const verifyEmail = result.email || signupEmail.trim().toLowerCase();
        setPendingCloserInfo(closerInfoData);
        setPendingVerificationEmail(verifyEmail);
        setAuthState('verify_email');
        sendVerificationCode(verifyEmail);
      } else {
        setAuthError({
          message: result.error || 'Signup failed. Please try again.',
          origin: 'signup',
        });
        setAuthState('error');
      }
    } catch (err) {
      console.error('[App] Signup error:', err);
      setAuthError({
        message: 'Network error. Please check your connection and try again.',
        origin: 'signup',
      });
      setAuthState('error');
    } finally {
      isSubmittingRef.current = false;
    }
  };

  const handleLogout = () => {
    clearSession();
    setEmail('');
    setPassword('');
    setAuthState('login');

    // Reset bot mode and restore window size
    setBotModeChecked(false);
    localStorage.removeItem('sequ3nce_personal_bot_mode');
    if (isBotMode) {
      setIsBotMode(false);
      window.electron?.app.setWindowSize?.(400, 600);
    }

    // Clear closer ID for the training window
    window.electron?.training?.setCloserId(null);
    // Stop chat polling
    window.electron?.chat?.stopPolling();
  };

  const handleRetry = () => {
    const returnTo = authError?.origin === 'signup' ? 'signup' : 'login';
    setAuthError(null);
    setAuthState(returnTo);
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
        onSwitchToSignup={() => setAuthState('signup')}
        onForgotPassword={() => setAuthState('forgot_password')}
      />
    );
  }

  if (authState === 'forgot_password') {
    return <ForgotPasswordScreen onBack={() => setAuthState('login')} />;
  }

  if (authState === 'verify_email' && pendingVerificationEmail) {
    return (
      <EmailVerificationScreen
        email={pendingVerificationEmail}
        onVerified={() => {
          if (pendingCloserInfo) initializeSession(pendingCloserInfo);
          setPendingCloserInfo(null);
          setPendingVerificationEmail('');
        }}
        onBack={() => {
          setPendingCloserInfo(null);
          setPendingVerificationEmail('');
          setAuthState('login');
        }}
      />
    );
  }

  if (authState === 'signup' || authState === 'signing_up') {
    return (
      <SignupScreen
        name={signupName}
        setName={setSignupName}
        email={signupEmail}
        setEmail={setSignupEmail}
        phone={signupPhone}
        setPhone={setSignupPhone}
        password={signupPassword}
        setPassword={setSignupPassword}
        confirmPassword={signupConfirmPassword}
        setConfirmPassword={setSignupConfirmPassword}
        onSubmit={handleSignup}
        isLoading={authState === 'signing_up'}
        onSwitchToLogin={() => setAuthState('login')}
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
    // Wait for bot mode check to complete before rendering to prevent
    // flash of MainApp (v1 UI) before MeetingBotHub loads
    if (!botModeChecked) {
      return (
        <div className="h-screen flex flex-col bg-white dark:bg-gray-950 text-black dark:text-white items-center justify-center">
          <div className="titlebar h-8 border-b border-gray-200 dark:border-gray-800 w-full" />
          <div className="flex-1 flex items-center justify-center">
            <div className="text-center">
              <div className="animate-spin w-8 h-8 border-2 border-gray-300 dark:border-gray-600 border-t-black dark:border-t-white rounded-full mx-auto mb-4" />
              <p className="text-gray-500 dark:text-gray-400 text-sm">Loading...</p>
            </div>
          </div>
        </div>
      );
    }

    // Subscription paywall — block access unless subscription is active
    if (closerInfo.subscriptionStatus !== 'active') {
      return (
        <SubscriptionGate
          closerInfo={closerInfo}
          onSubscribed={(updatedInfo) => {
            // Update session with active subscription
            localStorage.setItem(STORAGE_KEY, JSON.stringify(updatedInfo));
            setCloserInfo(updatedInfo);
          }}
          onLogout={handleLogout}
        />
      );
    }

    if (isBotMode) {
      return <MeetingBotHub closerInfo={closerInfo} onLogout={handleLogout} />;
    }
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
      onSwitchToSignup={() => setAuthState('signup')}
      onForgotPassword={() => setAuthState('forgot_password')}
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
  onSwitchToSignup: () => void;
  onForgotPassword: () => void;
}

function LoginScreen({ email, setEmail, password, setPassword, onSubmit, isLoading, onSwitchToSignup, onForgotPassword }: LoginScreenProps) {
  return (
    <div className="h-screen flex flex-col bg-white text-black">
      <div className="titlebar h-8 border-b border-gray-200" />

      <div className="flex-1 flex flex-col items-center justify-center p-6">
        <div className="mb-8 text-center">
          <img src={logoImage} alt="Sequ3nce Personal" className="h-14 mx-auto dark-invert" />
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
            <div className="mt-1 text-right">
              <button
                type="button"
                onClick={onForgotPassword}
                className="text-xs text-gray-400 hover:text-black transition-colors"
              >
                Forgot password?
              </button>
            </div>
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
          Don't have an account?{' '}
          <button
            type="button"
            onClick={onSwitchToSignup}
            className="text-black font-medium hover:underline"
          >
            Sign up
          </button>
        </p>
      </div>
    </div>
  );
}

// ==================== Forgot Password Screen ====================

interface ForgotPasswordScreenProps {
  onBack: () => void;
}

function ForgotPasswordScreen({ onBack }: ForgotPasswordScreenProps) {
  const [step, setStep] = useState<'email' | 'code' | 'success'>('email');
  const [email, setEmail] = useState('');
  const [code, setCode] = useState('');
  const [newPassword, setNewPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [successMessage, setSuccessMessage] = useState<string | null>(null);

  async function sendResetCode() {
    if (!email.trim() || isLoading) return;

    setIsLoading(true);
    setError(null);

    const result = await requestPasswordReset(email);
    setIsLoading(false);

    if (!result.success) {
      setError(result.error || 'Failed to send reset code');
      return;
    }

    setSuccessMessage('If an account exists with this email, a reset code has been sent.');
    setStep('code');
  }

  function handleRequestCode(e: React.FormEvent) {
    e.preventDefault();
    sendResetCode();
  }

  async function handleResetPassword(e: React.FormEvent) {
    e.preventDefault();
    if (!code.trim() || !newPassword || !confirmPassword || isLoading) return;

    if (newPassword !== confirmPassword) {
      setError('Passwords do not match');
      return;
    }

    if (newPassword.length < 8) {
      setError('Password must be at least 8 characters');
      return;
    }

    setIsLoading(true);
    setError(null);

    const result = await resetPasswordWithCode(email, code, newPassword);
    setIsLoading(false);

    if (!result.success) {
      setError(result.error || 'Failed to reset password');
      return;
    }

    setStep('success');
  }

  return (
    <div className="h-screen flex flex-col bg-white text-black">
      <div className="titlebar h-8 border-b border-gray-200" />

      <div className="flex-1 flex flex-col items-center justify-center p-6">
        <div className="mb-8 text-center">
          <img src={logoImage} alt="Sequ3nce Personal" className="h-14 mx-auto dark-invert" />
          <p className="text-gray-500 text-sm mt-4">
            {step === 'email' && 'Reset your password'}
            {step === 'code' && 'Enter your reset code'}
            {step === 'success' && 'Password reset successful'}
          </p>
        </div>

        {step === 'email' && (
          <form onSubmit={handleRequestCode} className="w-full max-w-xs space-y-4">
            <p className="text-xs text-gray-500 text-center">
              Enter your email address and we'll send you a 6-digit code to reset your password.
            </p>

            <input
              type="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              placeholder="Email"
              className="w-full px-4 py-3 bg-gray-50 border border-gray-200 rounded-lg text-black placeholder-gray-400 focus:outline-none focus:border-gray-400 focus:ring-1 focus:ring-gray-400 transition-all duration-150"
              disabled={isLoading}
              autoFocus
            />

            {error && <p className="text-xs text-red-600 text-center">{error}</p>}

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
                'Send Reset Code'
              )}
            </button>
          </form>
        )}

        {step === 'code' && (
          <form onSubmit={handleResetPassword} className="w-full max-w-xs space-y-4">
            {successMessage && (
              <p className="text-xs text-green-600 text-center">{successMessage}</p>
            )}

            <input
              type="text"
              value={code}
              onChange={(e) => setCode(e.target.value.replace(/\D/g, '').slice(0, 6))}
              placeholder="6-digit code"
              className="w-full px-4 py-3 bg-gray-50 border border-gray-200 rounded-lg text-black placeholder-gray-400 focus:outline-none focus:border-gray-400 focus:ring-1 focus:ring-gray-400 transition-all duration-150 text-center text-lg tracking-widest"
              disabled={isLoading}
              autoFocus
              maxLength={6}
              inputMode="numeric"
            />

            <input
              type="password"
              value={newPassword}
              onChange={(e) => setNewPassword(e.target.value)}
              placeholder="New password"
              className="w-full px-4 py-3 bg-gray-50 border border-gray-200 rounded-lg text-black placeholder-gray-400 focus:outline-none focus:border-gray-400 focus:ring-1 focus:ring-gray-400 transition-all duration-150"
              disabled={isLoading}
            />

            <input
              type="password"
              value={confirmPassword}
              onChange={(e) => setConfirmPassword(e.target.value)}
              placeholder="Confirm new password"
              className="w-full px-4 py-3 bg-gray-50 border border-gray-200 rounded-lg text-black placeholder-gray-400 focus:outline-none focus:border-gray-400 focus:ring-1 focus:ring-gray-400 transition-all duration-150"
              disabled={isLoading}
            />

            {error && <p className="text-xs text-red-600 text-center">{error}</p>}

            <button
              type="submit"
              disabled={isLoading || code.length !== 6 || !newPassword || !confirmPassword}
              className="w-full py-3 bg-black text-white font-medium rounded-lg hover:bg-gray-800 transition-colors duration-150 disabled:opacity-50 disabled:cursor-not-allowed flex items-center justify-center gap-2"
            >
              {isLoading ? (
                <>
                  <div className="animate-spin w-4 h-4 border-2 border-gray-400 border-t-white rounded-full" />
                  Resetting...
                </>
              ) : (
                'Reset Password'
              )}
            </button>

            <button
              type="button"
              onClick={sendResetCode}
              disabled={isLoading}
              className="w-full text-xs text-blue-600 hover:text-blue-700 font-medium"
            >
              Resend code
            </button>
          </form>
        )}

        {step === 'success' && (
          <div className="w-full max-w-xs text-center space-y-4">
            <div className="w-12 h-12 mx-auto bg-green-100 rounded-full flex items-center justify-center">
              <svg className="w-6 h-6 text-green-600" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" />
              </svg>
            </div>
            <p className="text-sm text-gray-600">Your password has been reset. You can now sign in with your new password.</p>
            <button
              onClick={onBack}
              className="w-full py-3 bg-black text-white font-medium rounded-lg hover:bg-gray-800 transition-colors duration-150"
            >
              Back to Sign In
            </button>
          </div>
        )}

        {step !== 'success' && (
          <p className="mt-8 text-xs text-gray-400 text-center">
            <button
              type="button"
              onClick={onBack}
              className="text-black font-medium hover:underline"
            >
              Back to Sign In
            </button>
          </p>
        )}
      </div>
    </div>
  );
}

// ==================== Signup Screen ====================

interface SignupScreenProps {
  name: string;
  setName: (name: string) => void;
  email: string;
  setEmail: (email: string) => void;
  phone: string;
  setPhone: (phone: string) => void;
  password: string;
  setPassword: (password: string) => void;
  confirmPassword: string;
  setConfirmPassword: (confirmPassword: string) => void;
  onSubmit: (e: React.FormEvent) => void;
  isLoading: boolean;
  onSwitchToLogin: () => void;
}

function SignupScreen({
  name, setName,
  email, setEmail,
  phone, setPhone,
  password, setPassword,
  confirmPassword, setConfirmPassword,
  onSubmit, isLoading, onSwitchToLogin,
}: SignupScreenProps) {
  return (
    <div className="h-screen flex flex-col bg-white text-black">
      <div className="titlebar h-8 border-b border-gray-200" />

      <div className="flex-1 flex flex-col items-center justify-center p-6">
        <div className="mb-6 text-center">
          <img src={logoImage} alt="Sequ3nce Personal" className="h-14 mx-auto dark-invert" />
          <p className="text-gray-500 text-sm mt-4">Create your account</p>
        </div>

        <form onSubmit={onSubmit} className="w-full max-w-xs space-y-3">
          <div>
            <input
              type="text"
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="Full Name"
              className="w-full px-4 py-3 bg-gray-50 border border-gray-200 rounded-lg text-black placeholder-gray-400 focus:outline-none focus:border-gray-400 focus:ring-1 focus:ring-gray-400 transition-all duration-150"
              disabled={isLoading}
              autoFocus
            />
          </div>

          <div>
            <input
              type="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              placeholder="Email"
              className="w-full px-4 py-3 bg-gray-50 border border-gray-200 rounded-lg text-black placeholder-gray-400 focus:outline-none focus:border-gray-400 focus:ring-1 focus:ring-gray-400 transition-all duration-150"
              disabled={isLoading}
            />
          </div>

          <div>
            <input
              type="tel"
              value={phone}
              onChange={(e) => setPhone(e.target.value)}
              placeholder="Phone Number"
              className="w-full px-4 py-3 bg-gray-50 border border-gray-200 rounded-lg text-black placeholder-gray-400 focus:outline-none focus:border-gray-400 focus:ring-1 focus:ring-gray-400 transition-all duration-150"
              disabled={isLoading}
            />
          </div>

          <div>
            <input
              type="password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              placeholder="Password (min. 8 characters)"
              className="w-full px-4 py-3 bg-gray-50 border border-gray-200 rounded-lg text-black placeholder-gray-400 focus:outline-none focus:border-gray-400 focus:ring-1 focus:ring-gray-400 transition-all duration-150"
              disabled={isLoading}
            />
          </div>

          <div>
            <input
              type="password"
              value={confirmPassword}
              onChange={(e) => setConfirmPassword(e.target.value)}
              placeholder="Confirm Password"
              className="w-full px-4 py-3 bg-gray-50 border border-gray-200 rounded-lg text-black placeholder-gray-400 focus:outline-none focus:border-gray-400 focus:ring-1 focus:ring-gray-400 transition-all duration-150"
              disabled={isLoading}
            />
          </div>

          <button
            type="submit"
            disabled={isLoading || !name.trim() || !email.trim() || !phone.trim() || !password.trim() || !confirmPassword.trim()}
            className="w-full py-3 bg-black text-white font-medium rounded-lg hover:bg-gray-800 transition-colors duration-150 disabled:opacity-50 disabled:cursor-not-allowed flex items-center justify-center gap-2"
          >
            {isLoading ? (
              <>
                <div className="animate-spin w-4 h-4 border-2 border-gray-400 border-t-white rounded-full" />
                Creating account...
              </>
            ) : (
              'Create Account'
            )}
          </button>
        </form>

        <p className="mt-6 text-xs text-gray-400 text-center max-w-xs">
          Already have an account?{' '}
          <button
            type="button"
            onClick={onSwitchToLogin}
            className="text-black font-medium hover:underline"
          >
            Sign in
          </button>
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
  const heading = error.origin === 'signup' ? 'Signup Failed' : 'Login Failed';

  return (
    <div className="h-screen flex flex-col bg-white text-black">
      <div className="titlebar h-8 border-b border-gray-200" />

      <div className="flex-1 flex flex-col items-center justify-center p-6">
        <div className="mb-8 text-center">
          <img src={logoImage} alt="Sequ3nce Personal" className="h-14 mx-auto dark-invert" />
        </div>

        {/* Error icon */}
        <div className="w-16 h-16 bg-red-50 rounded-full flex items-center justify-center mb-6">
          <svg className="w-8 h-8 text-red-500" fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z" />
          </svg>
        </div>

        <h2 className="text-xl font-semibold text-gray-900 mb-2">{heading}</h2>
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
  const callIdRef = useRef<string | null>(null); // Ref to always have latest callId
  const [hasPermission, setHasPermission] = useState<boolean | null>(null);
  const [duration, setDuration] = useState(0);
  const [version, setVersion] = useState('');
  const [ammoTrackerVisible, setAmmoTrackerVisible] = useState(false);
  const [showQuestionnaire, setShowQuestionnaire] = useState(false);
  const [pendingCallId, setPendingCallId] = useState<string | null>(null);
  const [isSubmittingQuestionnaire, setIsSubmittingQuestionnaire] = useState(false);
  const [savedNotes, setSavedNotes] = useState<string | null>(null);
  const isCapturingRef = useRef(false);
  const maxCallDurationTimeoutRef = useRef<NodeJS.Timeout | null>(null);
  const [showSpeakFirstReminder, setShowSpeakFirstReminder] = useState(false);
  const [autoStoppedMessage, setAutoStoppedMessage] = useState<string | null>(null);

  // Prospect name prompt state
  const [showProspectPrompt, setShowProspectPrompt] = useState(false);
  const [scheduledCallMatch, setScheduledCallMatch] = useState<ScheduledCallMatch | null>(null);
  const [prospectName, setProspectName] = useState<string | null>(null);
  const [prospectNameSaved, setProspectNameSaved] = useState(false);

  // Settings/Password change state
  const [showSettingsModal, setShowSettingsModal] = useState(false);
  const [currentPassword, setCurrentPassword] = useState('');
  const [newPassword, setNewPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [passwordError, setPasswordError] = useState<string | null>(null);
  const [passwordSuccess, setPasswordSuccess] = useState(false);
  const [isChangingPassword, setIsChangingPassword] = useState(false);

  // Role Play Room participant count (for button badge)
  const rolePlayParticipantCount = useRolePlayRoomParticipantCount(closerInfo.teamId);

  // Audio capture hook
  const { startCapture, stopCapture } = useAudioCapture({
    onAudioLevel: setAudioLevel,
    onError: (err) => {
      setError(err);
      setTimeout(() => setError(null), 5000);
    },
  });

  // Self-healing permission watcher - updates when user grants permission
  // No app restart required after granting permissions in System Settings
  const handlePermissionGranted = React.useCallback(() => {
    console.log('[App] Permission granted - updating state');
    setHasPermission(true);
    // Clear any permission-related errors
    setError(null);
  }, []);

  usePermissionWatcher(handlePermissionGranted);

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
        callIdRef.current = null; // Reset ref too
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
      callIdRef.current = convexCallId; // Keep ref in sync for immediate access
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
    // GUARD: Prevent duplicate calls - don't start if already capturing
    if (status === 'capturing' || status === 'connecting') {
      console.warn('[App] Attempted to start call while already active. Status:', status);
      return;
    }

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
      callIdRef.current = result.callId; // Also set ref (will be overwritten by Convex ID later)

      const captureStarted = await startCapture();
      if (!captureStarted) {
        await window.electron.audio.stop();
        const errorMsg = 'Could not capture audio. Please grant Screen Recording permission in System Preferences and restart the app.';
        setError(errorMsg);

        // Log error remotely for debugging
        const platformInfo = await window.electron.app.getPlatform();
        const appVersion = await window.electron.app.getVersion();
        const screenPermission = await window.electron.audio.checkPermissions();
        const micPermission = await window.electron.audio.checkMicrophonePermission();

        logClientError({
          closerEmail: closerInfo.email,
          errorType: 'capture_failed',
          errorMessage: errorMsg,
          appVersion,
          platform: platformInfo.platform,
          architecture: platformInfo.arch,
          screenPermission: screenPermission ? 'true' : 'false',
          microphonePermission: micPermission,
          context: JSON.stringify({
            closerName: closerInfo.name,
            teamId: closerInfo.teamId,
          }),
        });

        return;
      }
      isCapturingRef.current = true;
      setHasPermission(true);

      // Show "speak first" reminder for 4 seconds
      setShowSpeakFirstReminder(true);
      setTimeout(() => setShowSpeakFirstReminder(false), 4000);

      // Set 2-hour max call duration auto-stop
      const MAX_CALL_DURATION_MS = 2 * 60 * 60 * 1000; // 2 hours
      maxCallDurationTimeoutRef.current = setTimeout(async () => {
        console.log('[App] Max call duration reached (2 hours) - auto-stopping');
        setAutoStoppedMessage('Recording auto-stopped after 2 hours');
        // Trigger stop
        if (isCapturingRef.current) {
          stopCapture();
          isCapturingRef.current = false;
        }
        await window.electron.audio.stop();
        // Clear the message after 10 seconds
        setTimeout(() => setAutoStoppedMessage(null), 10000);
      }, MAX_CALL_DURATION_MS);

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

      // Log audio.start error remotely for debugging
      logClientError({
        closerEmail: closerInfo.email,
        errorType: 'audio_start_failed',
        errorMessage: result.error,
        context: JSON.stringify({
          closerName: closerInfo.name,
          teamId: closerInfo.teamId,
        }),
      });
    }
  };

  const handleStop = async () => {
    // Clear the max duration timeout if user stops manually
    if (maxCallDurationTimeoutRef.current) {
      clearTimeout(maxCallDurationTimeoutRef.current);
      maxCallDurationTimeoutRef.current = null;
    }

    // Store the current callId before stopping
    if (callId) {
      setPendingCallId(callId);

      // Fetch saved notes from the database to pre-populate the questionnaire
      try {
        const response = await fetch(`https://ideal-ram-982.convex.site/getCallNotes?callId=${encodeURIComponent(callId)}`);
        if (response.ok) {
          const notesData = await response.json();
          setSavedNotes(notesData.notes || null);
          console.log('[App] Fetched saved notes for questionnaire:', notesData.notes);
        }
      } catch (err) {
        console.error('[App] Error fetching notes for questionnaire:', err);
        setSavedNotes(null);
      }

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
    cashCollected?: number;
    contractValue?: number;
    notes?: string;
    primaryObjection?: string;
    primaryObjectionOther?: string;
    objectionsOvercome?: string;
    objectionsOvercomeOther?: string;
    leadQualityScore?: number;
    prospectWasDecisionMaker?: string;
  }) => {
    if (!pendingCallId) {
      console.error('[App] No pending call ID for questionnaire submission');
      return;
    }

    console.log('[App] Submitting questionnaire for call:', pendingCallId, data);
    setIsSubmittingQuestionnaire(true);

    try {
      // Fetch existing notes from the database if user didn't add any in the questionnaire
      let finalNotes = data.notes;
      if (!finalNotes || finalNotes.trim() === '') {
        // Try to get notes that were saved during the call
        try {
          const response = await fetch(`https://ideal-ram-982.convex.site/getCallNotes?callId=${encodeURIComponent(pendingCallId)}`);
          if (response.ok) {
            const notesData = await response.json();
            if (notesData.notes) {
              finalNotes = notesData.notes;
              console.log('[App] Using saved notes from database:', finalNotes);
            }
          }
        } catch (err) {
          console.error('[App] Error fetching saved notes:', err);
          // Continue without notes if fetch fails
        }
      }

      const result = await completeCallWithOutcome({
        callId: pendingCallId,
        prospectName: data.prospectName,
        outcome: data.outcome,
        dealValue: data.dealValue,
        cashCollected: data.cashCollected,
        contractValue: data.contractValue,
        notes: finalNotes,
        primaryObjection: data.primaryObjection,
        primaryObjectionOther: data.primaryObjectionOther,
        objectionsOvercome: data.objectionsOvercome,
        objectionsOvercomeOther: data.objectionsOvercomeOther,
        leadQualityScore: data.leadQualityScore,
        prospectWasDecisionMaker: data.prospectWasDecisionMaker,
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

  // Note: handleQuestionnaireCancel removed — form is mandatory (no cancel button)
  // The only way to dismiss is by submitting the form successfully

  // Settings modal handlers
  const openSettingsModal = () => {
    setShowSettingsModal(true);
    setCurrentPassword('');
    setNewPassword('');
    setConfirmPassword('');
    setPasswordError(null);
    setPasswordSuccess(false);
  };

  const closeSettingsModal = () => {
    setShowSettingsModal(false);
    setCurrentPassword('');
    setNewPassword('');
    setConfirmPassword('');
    setPasswordError(null);
    setPasswordSuccess(false);
  };

  const handleChangePassword = async (e: React.FormEvent) => {
    e.preventDefault();
    setPasswordError(null);

    // Validate passwords match
    if (newPassword !== confirmPassword) {
      setPasswordError("New passwords don't match");
      return;
    }

    // Validate minimum length
    if (newPassword.length < 6) {
      setPasswordError("New password must be at least 6 characters");
      return;
    }

    setIsChangingPassword(true);

    try {
      console.log('[ChangePassword] Attempting password change for closerId:', closerInfo.closerId);
      const result = await changePassword(closerInfo.closerId, currentPassword, newPassword);
      console.log('[ChangePassword] Result:', result);

      if (result.success) {
        setPasswordSuccess(true);
        // Auto-close after success
        setTimeout(() => {
          closeSettingsModal();
        }, 2000);
      } else {
        console.error('[ChangePassword] Failed:', result.error);
        setPasswordError(result.error || "Failed to change password");
      }
    } catch (err) {
      console.error('[ChangePassword] Exception:', err);
      setPasswordError("Network error. Please try again.");
    } finally {
      setIsChangingPassword(false);
    }
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
          initialNotes={savedNotes || undefined}
          onSubmit={handleQuestionnaireSubmit}
          isSubmitting={isSubmittingQuestionnaire}
        />
      )}

      {/* Settings Modal */}
      {showSettingsModal && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50">
          <div className="bg-white rounded-lg shadow-xl w-80 p-6">
            <div className="flex items-center justify-between mb-4">
              <h2 className="text-lg font-semibold text-gray-900">Change Password</h2>
              <button
                onClick={closeSettingsModal}
                className="text-gray-400 hover:text-gray-600"
              >
                <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                </svg>
              </button>
            </div>

            {passwordSuccess ? (
              <div className="text-center py-4">
                <div className="w-12 h-12 bg-green-100 rounded-full flex items-center justify-center mx-auto mb-3">
                  <svg className="w-6 h-6 text-green-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
                  </svg>
                </div>
                <p className="text-green-600 font-medium">Password changed successfully!</p>
              </div>
            ) : (
              <form onSubmit={handleChangePassword} className="space-y-4">
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">
                    Current Password
                  </label>
                  <input
                    type="password"
                    value={currentPassword}
                    onChange={(e) => setCurrentPassword(e.target.value)}
                    className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-black focus:border-transparent text-sm"
                    required
                  />
                </div>

                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">
                    New Password
                  </label>
                  <input
                    type="password"
                    value={newPassword}
                    onChange={(e) => setNewPassword(e.target.value)}
                    className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-black focus:border-transparent text-sm"
                    required
                    minLength={6}
                  />
                </div>

                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">
                    Confirm New Password
                  </label>
                  <input
                    type="password"
                    value={confirmPassword}
                    onChange={(e) => setConfirmPassword(e.target.value)}
                    className={`w-full px-3 py-2 border rounded-lg focus:ring-2 focus:ring-black focus:border-transparent text-sm ${
                      confirmPassword && newPassword !== confirmPassword
                        ? 'border-red-300 bg-red-50'
                        : confirmPassword && newPassword === confirmPassword
                          ? 'border-green-300 bg-green-50'
                          : 'border-gray-300'
                    }`}
                    required
                    minLength={6}
                  />
                  {confirmPassword && newPassword !== confirmPassword && (
                    <p className="text-xs text-red-500 mt-1">Passwords do not match</p>
                  )}
                  {confirmPassword && newPassword === confirmPassword && newPassword.length >= 6 && (
                    <p className="text-xs text-green-500 mt-1">Passwords match ✓</p>
                  )}
                </div>

                {passwordError && (
                  <p className="text-sm text-red-600">{passwordError}</p>
                )}

                <div className="flex gap-2 pt-2">
                  <button
                    type="button"
                    onClick={closeSettingsModal}
                    className="flex-1 py-2 px-4 border border-gray-300 rounded-lg text-sm font-medium text-gray-700 hover:bg-gray-50"
                  >
                    Cancel
                  </button>
                  <button
                    type="submit"
                    disabled={isChangingPassword}
                    className="flex-1 py-2 px-4 bg-black text-white rounded-lg text-sm font-medium hover:bg-gray-800 disabled:opacity-50 disabled:cursor-not-allowed"
                  >
                    {isChangingPassword ? 'Updating...' : 'Update Password'}
                  </button>
                </div>
              </form>
            )}
          </div>
        </div>
      )}

      {/* Draggable title bar with settings and sign out */}
      <div className="titlebar h-8 flex items-center justify-end px-4 border-b border-gray-200 gap-3">
        <button
          onClick={openSettingsModal}
          className="text-gray-400 hover:text-gray-600 transition-colors duration-150"
          title="Settings"
        >
          <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M10.325 4.317c.426-1.756 2.924-1.756 3.35 0a1.724 1.724 0 002.573 1.066c1.543-.94 3.31.826 2.37 2.37a1.724 1.724 0 001.065 2.572c1.756.426 1.756 2.924 0 3.35a1.724 1.724 0 00-1.066 2.573c.94 1.543-.826 3.31-2.37 2.37a1.724 1.724 0 00-2.572 1.065c-.426 1.756-2.924 1.756-3.35 0a1.724 1.724 0 00-2.573-1.066c-1.543.94-3.31-.826-2.37-2.37a1.724 1.724 0 00-1.065-2.572c-1.756-.426-1.756-2.924 0-3.35a1.724 1.724 0 001.066-2.573c-.94-1.543.826-3.31 2.37-2.37.996.608 2.296.07 2.572-1.065z" />
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" />
          </svg>
        </button>
        <button
          onClick={onLogout}
          className="text-xs text-gray-400 hover:text-gray-600 transition-colors duration-150"
        >
          Sign out
        </button>
      </div>

      {/* Logo centered at top */}
      <div className="pt-4 pb-2 flex justify-center">
        <img src={logoImage} alt="Sequ3nce Personal" className="h-12 dark-invert" />
      </div>

      {/* User info */}
      <div className="px-4 py-2 border-b border-gray-100 bg-gray-50/50">
        <div className="text-sm font-medium text-gray-900 text-center">{closerInfo.name}</div>
        <div className="text-xs text-gray-500 text-center">{closerInfo.email}</div>
      </div>

      {/* Main content */}
      <div className="flex-1 flex flex-col items-center justify-center p-6">
        {/* Status indicator */}
        <StatusIndicator status={status} />

        {/* Speak First Reminder */}
        {showSpeakFirstReminder && (
          <div className="mt-4 w-full max-w-xs animate-fade-in">
            <div className="bg-blue-50 border border-blue-200 rounded-lg p-3 flex items-center gap-2">
              <svg className="w-5 h-5 text-blue-600 flex-shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 16h-1v-4h-1m1-4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
              </svg>
              <span className="text-sm text-blue-800 font-medium">Speak first to be identified correctly</span>
            </div>
          </div>
        )}

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

        {/* Training button */}
        <button
          onClick={() => window.electron.training?.open()}
          className="mt-2 px-4 py-2 rounded-lg text-sm font-medium transition-all duration-150 bg-gray-100 text-gray-600 hover:bg-gray-200 hover:text-gray-800"
        >
          Training
        </button>

        {/* Schedule button */}
        <button
          onClick={() => window.electron.schedule?.open()}
          className="mt-2 px-4 py-2 rounded-lg text-sm font-medium transition-all duration-150 bg-gray-100 text-gray-600 hover:bg-gray-200 hover:text-gray-800 flex items-center gap-2"
        >
          <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 7V3m8 4V3m-9 8h10M5 21h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v12a2 2 0 002 2z" />
          </svg>
          Schedule
        </button>

        {/* Role Play Room button */}
        <RolePlayRoomButton
          participantCount={rolePlayParticipantCount}
          onClick={() => window.electron.roleplay.open({
            teamId: closerInfo.teamId,
            closerId: closerInfo.closerId,
            userName: closerInfo.name,
          })}
          disabled={status === 'capturing'}
        />

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

        {autoStoppedMessage && (
          <div className="mt-4 p-3 bg-amber-50 border border-amber-200 rounded-lg max-w-xs">
            <p className="text-amber-700 text-sm text-center font-medium">{autoStoppedMessage}</p>
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
