import React, { useState } from 'react';
import type { CloserInfo } from '../convex';
import { connectCalendar, syncCalendar, markOnboardingCompleted } from '../convex';
import logoImage from '../../assets/logo.png';

interface BotOnboardingViewProps {
  closerInfo: CloserInfo;
  onComplete: () => void;
}

export function BotOnboardingView({ closerInfo, onComplete }: BotOnboardingViewProps) {
  const [step, setStep] = useState(0);
  const [icsUrl, setIcsUrl] = useState('');
  const [isConnecting, setIsConnecting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [showHelp, setShowHelp] = useState(false);

  const isValidUrl = (() => {
    const trimmed = icsUrl.trim();
    return trimmed.startsWith('http://') || trimmed.startsWith('https://') || trimmed.startsWith('webcal://');
  })();

  async function handleConnect() {
    setIsConnecting(true);
    setError(null);
    try {
      const connected = await connectCalendar(closerInfo.email, closerInfo.teamId, icsUrl.trim());
      if (!connected) throw new Error('Connection failed');
      await syncCalendar(closerInfo.email, closerInfo.teamId);
      setStep(2);
    } catch (err) {
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
              <img src={logoImage} alt="Sequ3nce Personal" className="h-12 mb-6" />
              <h2 className="text-2xl font-bold text-black mb-3">Welcome to Sequ3nce Personal</h2>
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
                Paste your Google Calendar ICS feed URL so we can automatically detect your upcoming calls and send bots to record them.
              </p>

              {/* ICS URL input */}
              <input
                type="text"
                value={icsUrl}
                onChange={(e) => setIcsUrl(e.target.value)}
                placeholder="Paste your ICS feed URL here..."
                className="w-full px-3 py-2.5 text-[13px] border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-black/10 focus:border-gray-400"
              />

              {error && (
                <p className="text-[12px] text-red-600 mt-2 w-full">{error}</p>
              )}

              {/* Help toggle */}
              <button
                onClick={() => setShowHelp(!showHelp)}
                className="mt-3 text-[13px] text-gray-500 hover:text-gray-700 flex items-center gap-1 transition-colors"
              >
                <svg className="w-3 h-3" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                  <path strokeLinecap="round" strokeLinejoin="round" d="M8.228 9c.549-1.165 2.03-2 3.772-2 2.21 0 4 1.343 4 3 0 1.4-1.278 2.575-3.006 2.907-.542.104-.994.54-.994 1.093m0 3h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
                </svg>
                {showHelp ? 'Hide instructions' : 'How do I find my ICS URL?'}
              </button>

              {showHelp && (
                <div className="w-full mt-3 p-4 bg-gray-50 rounded-lg">
                  <p className="text-[13px] font-semibold text-black mb-2">Google Calendar</p>
                  <ol className="text-[12px] text-gray-500 space-y-1 list-decimal list-inside">
                    <li>Open Google Calendar on your computer</li>
                    <li>Click the gear icon &rarr; Settings</li>
                    <li>On the left, select the calendar you use for meetings</li>
                    <li>Scroll to &quot;Secret address in iCal format&quot;</li>
                    <li>Copy the URL and paste it above</li>
                  </ol>
                </div>
              )}

              <div className="flex-1" />

              <button
                onClick={handleConnect}
                disabled={!isValidUrl || isConnecting}
                className={`w-full py-3.5 text-[15px] font-semibold rounded-xl transition-colors mb-2 ${
                  isValidUrl && !isConnecting
                    ? 'bg-black text-white hover:bg-gray-800'
                    : 'bg-gray-300 text-white cursor-not-allowed'
                }`}
              >
                {isConnecting ? 'Connecting...' : 'Connect Calendar'}
              </button>
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
