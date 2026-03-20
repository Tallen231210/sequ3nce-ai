import React, { useState, useEffect, useRef, useCallback } from 'react';
import { sendVerificationCode, verifyEmail } from '../convex';
import logoImage from '../../assets/logo.png';

interface EmailVerificationScreenProps {
  email: string;
  onVerified: () => void;
  onBack: () => void;
}

export function EmailVerificationScreen({ email, onVerified, onBack }: EmailVerificationScreenProps) {
  const [step, setStep] = useState<'code' | 'success'>('code');
  const [code, setCode] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [cooldown, setCooldown] = useState(60); // Start at 60s (code was just sent)
  const cooldownRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  // Focus the code input on mount
  useEffect(() => {
    inputRef.current?.focus();
  }, []);

  // Cooldown timer
  useEffect(() => {
    if (cooldown <= 0) {
      if (cooldownRef.current) clearInterval(cooldownRef.current);
      return;
    }
    cooldownRef.current = setInterval(() => {
      setCooldown((prev) => {
        if (prev <= 1) {
          if (cooldownRef.current) clearInterval(cooldownRef.current);
          return 0;
        }
        return prev - 1;
      });
    }, 1000);
    return () => {
      if (cooldownRef.current) clearInterval(cooldownRef.current);
    };
  }, [cooldown]);

  const handleCodeChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const value = e.target.value.replace(/\D/g, '').slice(0, 6);
    setCode(value);
    setError(null);
  };

  const handleVerify = useCallback(async () => {
    if (code.length !== 6 || isLoading) return;
    setIsLoading(true);
    setError(null);

    try {
      const result = await verifyEmail(email, code);
      if (result.success) {
        setStep('success');
      } else {
        setError(result.error || 'Verification failed');
      }
    } catch {
      setError('Network error. Please try again.');
    } finally {
      setIsLoading(false);
    }
  }, [code, email, isLoading]);

  const handleResend = async () => {
    if (cooldown > 0 || isLoading) return;
    setError(null);

    try {
      const result = await sendVerificationCode(email);
      if (result.retryAfter) {
        setCooldown(result.retryAfter);
      } else {
        setCooldown(60);
      }
      if (!result.success) {
        setError(result.error || 'Failed to resend code');
      }
    } catch {
      setError('Network error. Please try again.');
    }
  };

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter' && code.length === 6) {
      handleVerify();
    }
  };

  if (step === 'success') {
    return (
      <div className="h-screen flex flex-col bg-white text-black">
        <div className="titlebar h-8 border-b border-gray-200" />
        <div className="flex-1 flex flex-col items-center justify-center p-6">
          <div className="w-16 h-16 rounded-full bg-green-100 flex items-center justify-center mb-6">
            <svg className="w-8 h-8 text-green-600" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
            </svg>
          </div>
          <h2 className="text-xl font-semibold mb-2">Email Verified!</h2>
          <p className="text-gray-500 text-sm mb-8">Your email has been verified successfully.</p>
          <button
            onClick={onVerified}
            className="w-full max-w-xs py-3 bg-black text-white font-medium rounded-lg hover:bg-gray-800 transition-colors"
          >
            Continue
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="h-screen flex flex-col bg-white text-black">
      <div className="titlebar h-8 border-b border-gray-200" />

      <div className="flex-1 flex flex-col items-center justify-center p-6">
        <div className="mb-8 text-center">
          <img src={logoImage} alt="Sequ3nce Personal" className="h-14 mx-auto dark-invert" />
          <h2 className="text-lg font-semibold mt-6 mb-2">Verify Your Email</h2>
          <p className="text-gray-500 text-sm">
            We sent a 6-digit code to <span className="font-medium text-black">{email}</span>
          </p>
        </div>

        <div className="w-full max-w-xs space-y-4">
          <input
            ref={inputRef}
            type="text"
            inputMode="numeric"
            value={code}
            onChange={handleCodeChange}
            onKeyDown={handleKeyDown}
            placeholder="000000"
            maxLength={6}
            className="w-full px-4 py-4 bg-gray-50 border border-gray-200 rounded-lg text-black text-center text-2xl font-mono tracking-[0.5em] placeholder-gray-300 focus:outline-none focus:border-gray-400 focus:ring-1 focus:ring-gray-400 transition-all duration-150"
            disabled={isLoading}
            autoComplete="one-time-code"
          />

          {error && (
            <p className="text-red-500 text-sm text-center">{error}</p>
          )}

          <button
            onClick={handleVerify}
            disabled={isLoading || code.length < 6}
            className="w-full py-3 bg-black text-white font-medium rounded-lg hover:bg-gray-800 transition-colors duration-150 disabled:opacity-50 disabled:cursor-not-allowed flex items-center justify-center gap-2"
          >
            {isLoading ? (
              <>
                <div className="animate-spin w-4 h-4 border-2 border-gray-400 border-t-white rounded-full" />
                Verifying...
              </>
            ) : (
              'Verify'
            )}
          </button>

          <div className="text-center">
            <button
              type="button"
              onClick={handleResend}
              disabled={cooldown > 0}
              className="text-sm text-gray-500 hover:text-black transition-colors disabled:text-gray-300 disabled:cursor-not-allowed"
            >
              {cooldown > 0 ? `Resend code (${cooldown}s)` : 'Resend code'}
            </button>
          </div>

          <div className="text-center pt-2">
            <button
              type="button"
              onClick={onBack}
              className="text-xs text-gray-400 hover:text-black transition-colors"
            >
              Back to Sign In
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
