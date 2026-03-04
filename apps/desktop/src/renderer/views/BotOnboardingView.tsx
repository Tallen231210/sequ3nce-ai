import React, { useState, useEffect } from 'react';
import type { CloserInfo } from '../convex';
import { connectCalendar, syncCalendar, markOnboardingCompleted } from '../convex';
import logoImage from '../../assets/logo.png';

const APP_URL = 'https://sequ3nce.ai';

interface BotOnboardingViewProps {
  closerInfo: CloserInfo;
  onComplete: () => void;
}

export function BotOnboardingView({ closerInfo, onComplete }: BotOnboardingViewProps) {
  const [step, setStep] = useState(0);
  const [showIcsFallback, setShowIcsFallback] = useState(false);
  const [icsUrl, setIcsUrl] = useState('');
  const [isConnecting, setIsConnecting] = useState(false);
  const [isWaitingForOAuth, setIsWaitingForOAuth] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const isValidUrl = (() => {
    const trimmed = icsUrl.trim();
    return trimmed.startsWith('http://') || trimmed.startsWith('https://') || trimmed.startsWith('webcal://');
  })();

  // Listen for Google Calendar OAuth callback deep link
  useEffect(() => {
    function handleCalendarConnected() {
      setIsWaitingForOAuth(false);
      setStep(2);
    }

    window.addEventListener('calendar:connected', handleCalendarConnected);
    return () => window.removeEventListener('calendar:connected', handleCalendarConnected);
  }, []);

  function handleGoogleConnect() {
    setIsWaitingForOAuth(true);
    setError(null);
    const authUrl = `${APP_URL}/api/auth/google/authorize?closerId=${closerInfo.closerId}`;
    // Open in user's default browser
    window.open(authUrl, '_blank');
  }

  async function handleIcsConnect() {
    setIsConnecting(true);
    setError(null);
    try {
      const connected = await connectCalendar(closerInfo.email, closerInfo.teamId, icsUrl.trim());
      if (!connected) throw new Error('Connection failed');
      await syncCalendar(closerInfo.email, closerInfo.teamId);
      setStep(2);
    } catch {
      setError('Failed to connect calendar. Please check your URL and try again.');
    }
    setIsConnecting(false);
  }

  async function handleComplete() {
    await markOnboardingCompleted(closerInfo.closerId);
    onComplete();
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50">
      <div className="w-[520px] h-[560px] bg-white rounded-2xl shadow-2xl flex flex-col">
        {/* Content */}
        <div className="flex-1 flex flex-col">
          {step === 0 && (
            <div className="flex-1 flex flex-col items-center justify-center px-10 text-center">
              <img src={logoImage} alt="Sequ3nce" className="h-12 mb-6" />
              <h2 className="text-2xl font-bold text-black mb-3">Welcome to Sequ3nce</h2>
              <p className="text-[15px] text-gray-500 mb-8">
                Let's set up automatic call recording and live coaching
              </p>
              <button
                onClick={() => setStep(1)}
                className="w-full max-w-xs py-3.5 bg-black text-white text-[15px] font-semibold rounded-xl hover:bg-gray-800 transition-colors"
              >
                Get Started
              </button>
            </div>
          )}

          {step === 1 && (
            <div className="flex-1 flex flex-col items-center px-10 pt-8">
              {/* Calendar icon */}
              <div className="w-16 h-16 bg-gray-100 rounded-full flex items-center justify-center mb-5">
                <svg className="w-6 h-6 text-gray-500" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
                  <path strokeLinecap="round" strokeLinejoin="round" d="M6.75 3v2.25M17.25 3v2.25M3 18.75V7.5a2.25 2.25 0 012.25-2.25h13.5A2.25 2.25 0 0121 7.5v11.25m-18 0A2.25 2.25 0 005.25 21h13.5A2.25 2.25 0 0021 18.75m-18 0v-7.5A2.25 2.25 0 015.25 9h13.5A2.25 2.25 0 0121 11.25v7.5" />
                </svg>
              </div>

              <h2 className="text-xl font-semibold text-black mb-2 text-center">
                Connect Your Google Calendar
              </h2>
              <p className="text-[14px] text-gray-500 text-center mb-6 px-4">
                Connect your Google Calendar so we can automatically detect your upcoming calls and send bots to record them.
              </p>

              {isWaitingForOAuth ? (
                // Waiting for OAuth completion
                <div className="w-full flex flex-col items-center gap-4 mt-2">
                  <div className="w-6 h-6 border-2 border-gray-300 border-t-black rounded-full animate-spin" />
                  <p className="text-[13px] text-gray-500 text-center">
                    Complete the sign-in in your browser...
                  </p>
                  <button
                    onClick={() => setIsWaitingForOAuth(false)}
                    className="text-[12px] text-gray-400 hover:text-gray-600 transition-colors"
                  >
                    Cancel
                  </button>
                </div>
              ) : (
                <>
                  {/* Primary: Google OAuth button */}
                  <button
                    onClick={handleGoogleConnect}
                    className="w-full py-3.5 bg-black text-white text-[15px] font-semibold rounded-xl hover:bg-gray-800 transition-colors flex items-center justify-center gap-2"
                  >
                    <svg className="w-5 h-5" viewBox="0 0 24 24" fill="currentColor">
                      <path d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92a5.06 5.06 0 01-2.2 3.32v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.1z" fill="#4285F4" />
                      <path d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z" fill="#34A853" />
                      <path d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l2.85-2.22.81-.62z" fill="#FBBC05" />
                      <path d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z" fill="#EA4335" />
                    </svg>
                    Connect with Google Calendar
                  </button>

                  {error && (
                    <p className="text-[12px] text-red-600 mt-2 w-full">{error}</p>
                  )}

                  {/* Secondary: ICS fallback */}
                  <button
                    onClick={() => setShowIcsFallback(!showIcsFallback)}
                    className="mt-4 text-[12px] text-gray-400 hover:text-gray-600 transition-colors"
                  >
                    {showIcsFallback ? 'Hide' : 'Use ICS feed instead'}
                  </button>

                  {showIcsFallback && (
                    <div className="w-full mt-3 space-y-3">
                      <p className="text-[12px] text-gray-500">
                        Paste your Google Calendar ICS feed URL. Go to Google Calendar Settings, select your calendar, and copy the "Secret address in iCal format".
                      </p>
                      <input
                        type="text"
                        value={icsUrl}
                        onChange={(e) => setIcsUrl(e.target.value)}
                        placeholder="Paste your ICS feed URL here..."
                        className="w-full px-3 py-2.5 text-[13px] border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-black/10 focus:border-gray-400"
                      />
                      <button
                        onClick={handleIcsConnect}
                        disabled={!isValidUrl || isConnecting}
                        className={`w-full py-2.5 text-[13px] font-semibold rounded-lg transition-colors ${
                          isValidUrl && !isConnecting
                            ? 'bg-gray-100 text-black hover:bg-gray-200'
                            : 'bg-gray-100 text-gray-400 cursor-not-allowed'
                        }`}
                      >
                        {isConnecting ? 'Connecting...' : 'Connect via ICS'}
                      </button>
                    </div>
                  )}
                </>
              )}
            </div>
          )}

          {step === 2 && (
            <div className="flex-1 flex flex-col items-center justify-center px-10 text-center">
              {/* Green checkmark */}
              <div className="w-20 h-20 bg-green-100 rounded-full flex items-center justify-center mb-6">
                <svg className="w-11 h-11 text-green-500" fill="currentColor" viewBox="0 0 20 20">
                  <path fillRule="evenodd" d="M10 18a8 8 0 100-16 8 8 0 000 16zm3.707-9.293a1 1 0 00-1.414-1.414L9 10.586 7.707 9.293a1 1 0 00-1.414 1.414l2 2a1 1 0 001.414 0l4-4z" clipRule="evenodd" />
                </svg>
              </div>

              <h2 className="text-2xl font-bold text-black mb-3">You're all set!</h2>
              <p className="text-[15px] text-gray-500 mb-2">
                We'll automatically join your calls, record, and give you live coaching.
              </p>
              <p className="text-[15px] text-gray-500 mb-8">
                You don't need to do anything &mdash; just take your calls as usual.
              </p>
              <button
                onClick={handleComplete}
                className="w-full max-w-xs py-3.5 bg-black text-white text-[15px] font-semibold rounded-xl hover:bg-gray-800 transition-colors"
              >
                Let's Go
              </button>
            </div>
          )}
        </div>

        {/* Progress dots */}
        <div className="flex justify-center gap-2 pb-6">
          {[0, 1, 2].map((s) => (
            <div
              key={s}
              className={`w-2 h-2 rounded-full ${s === step ? 'bg-black' : 'bg-gray-300'}`}
            />
          ))}
        </div>
      </div>
    </div>
  );
}
