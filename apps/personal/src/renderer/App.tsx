import React, { useState, useEffect, useRef } from 'react';
import {
  loginCloser,
  signupB2CUser,
  changePassword,
  requestPasswordReset,
  resetPasswordWithCode,
  sendVerificationCode,
  logClientError,
  type CloserInfo,
} from './convex';
import { MeetingBotHub } from './views/MeetingBotHub';
import { EmailVerificationScreen } from './views/EmailVerificationScreen';
import { SubscriptionGate } from './views/SubscriptionGate';
import { ThemeProvider } from './ThemeContext';
import logoImage from '../assets/logo.png';

// Storage keys
const STORAGE_KEY = 'sequ3nce_personal_info';

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

    // All B2C users use meeting bots — set window to hub size
    window.electron?.app?.setWindowSize?.(1200, 800);

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
          b2cUserId: result.b2cUserId,
          trialExpiresAt: (result as any).trialExpiresAt,
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

// MainApp (legacy local recording UI) has been removed.
// All B2C Personal users use the MeetingBotHub.
