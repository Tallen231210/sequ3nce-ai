import React, { useEffect, useState, useRef } from 'react';
import type { CloserInfo, CalendarStatus } from '../convex';
import {
  getCalendarStatus,
  syncCalendar,
  disconnectCalendar,
  changePassword,
  submitDiagnosticReport,
  createB2CPortal,
} from '../convex';

interface SettingsViewProps {
  closerInfo: CloserInfo;
  onLogout: () => void;
}

export function SettingsView({ closerInfo, onLogout }: SettingsViewProps) {
  // Calendar
  const [calStatus, setCalStatus] = useState<CalendarStatus | null>(null);
  const [isLoadingCal, setIsLoadingCal] = useState(true);
  const [isWaitingOAuth, setIsWaitingOAuth] = useState(false);
  const [isDisconnecting, setIsDisconnecting] = useState(false);

  // Password
  const [showPasswordForm, setShowPasswordForm] = useState(false);
  const [currentPassword, setCurrentPassword] = useState('');
  const [newPassword, setNewPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [isChangingPassword, setIsChangingPassword] = useState(false);
  const [passwordError, setPasswordError] = useState<string | null>(null);
  const [passwordSuccess, setPasswordSuccess] = useState(false);

  // Diagnostics
  const [diagDescription, setDiagDescription] = useState('');
  const [isSendingDiag, setIsSendingDiag] = useState(false);
  const [diagReportId, setDiagReportId] = useState<string | null>(null);
  const [diagError, setDiagError] = useState<string | null>(null);

  // Cleanup refs
  const mountedRef = useRef(true);
  const timeoutsRef = useRef<ReturnType<typeof setTimeout>[]>([]);

  useEffect(() => {
    return () => {
      mountedRef.current = false;
      timeoutsRef.current.forEach(clearTimeout);
    };
  }, []);

  useEffect(() => {
    setIsLoadingCal(true);
    getCalendarStatus(closerInfo.email, closerInfo.teamId).then((s) => {
      setCalStatus(s);
      setIsLoadingCal(false);
    });
  }, [closerInfo.email, closerInfo.teamId]);

  // Listen for Google Calendar OAuth deep link callback
  useEffect(() => {
    function handleCalendarConnected() {
      setIsWaitingOAuth(false);
      // Refresh calendar status
      getCalendarStatus(closerInfo.email, closerInfo.teamId).then((s) => {
        setCalStatus(s);
      });
    }
    window.addEventListener('calendar:connected', handleCalendarConnected);
    return () => window.removeEventListener('calendar:connected', handleCalendarConnected);
  }, [closerInfo.email, closerInfo.teamId]);

  function handleGoogleConnect() {
    setIsWaitingOAuth(true);
    const authUrl = `https://sequ3nce.ai/api/auth/google/authorize?closerId=${closerInfo.closerId}&app=personal`;
    window.open(authUrl, '_blank');
  }

  async function handleDisconnectCalendar() {
    setIsDisconnecting(true);
    await disconnectCalendar(closerInfo.email, closerInfo.teamId);
    setCalStatus(null);
    setIsDisconnecting(false);
  }

  async function handleChangePassword() {
    if (newPassword !== confirmPassword) {
      setPasswordError('Passwords do not match.');
      return;
    }
    if (newPassword.length < 6) {
      setPasswordError('Password must be at least 6 characters.');
      return;
    }
    setIsChangingPassword(true);
    setPasswordError(null);
    const result = await changePassword(closerInfo.closerId, currentPassword, newPassword);
    setIsChangingPassword(false);
    if (result.success) {
      setPasswordSuccess(true);
      setShowPasswordForm(false);
      setCurrentPassword('');
      setNewPassword('');
      setConfirmPassword('');
      const t = setTimeout(() => { if (mountedRef.current) setPasswordSuccess(false); }, 3000);
      timeoutsRef.current.push(t);
    } else {
      setPasswordError(result.error || 'Failed to change password.');
      setCurrentPassword('');
      setNewPassword('');
      setConfirmPassword('');
    }
  }

  async function handleSendDiagnostics() {
    setIsSendingDiag(true);
    setDiagError(null);
    setDiagReportId(null);

    const reportId = generateReportId();

    // 1. Main process diagnostics (system, websocket, audio, call, context)
    let mainData: Record<string, Record<string, unknown>> = { system: {}, websocket: {}, audio: {}, call: {}, context: {} };
    try { mainData = await window.electron.diagnostics.collect() as Record<string, Record<string, unknown>>; } catch { /* ignore */ }

    // 2. Renderer-side data collection (each wrapped independently)
    let micPermission = 'unknown';
    try { micPermission = await window.electron.audio.checkMicrophonePermission(); } catch { /* ignore */ }

    let screenPermission = false;
    try { screenPermission = await window.electron.audio.checkPermissions(); } catch { /* ignore */ }

    let audioStatusStr = 'unknown';
    try { audioStatusStr = await window.electron.audio.getStatus(); } catch { /* ignore */ }

    let audioDevices: Array<{ kind: string; label: string }> = [];
    try {
      const devices = await navigator.mediaDevices.enumerateDevices();
      audioDevices = devices
        .filter(d => d.kind === 'audioinput' || d.kind === 'audiooutput')
        .map(d => ({ kind: d.kind, label: d.label || 'unlabeled' }));
    } catch { /* ignore */ }

    // 3. Build report
    const report = {
      reportId,
      appType: 'b2c',
      closerId: closerInfo.closerId,
      teamId: closerInfo.teamId,
      closerEmail: closerInfo.email,
      userDescription: diagDescription.trim() || undefined,
      system: {
        ...mainData.system,
        userAgent: navigator.userAgent,
      },
      audio: {
        ...mainData.audio,
        systemAudioCaptureStatus: audioStatusStr,
        audioDevices,
      },
      websocket: mainData.websocket,
      call: mainData.call || undefined,
      meetingBot: {
        meetingBotEnabled: localStorage.getItem('sequ3nce_personal_bot_mode') === 'true',
        calendarConnected: calStatus?.connected || false,
        ammoPanelVisible: mainData.context?.ammoTrackerVisible as boolean || false,
        questionnairePanelVisible: mainData.context?.postCallPending as boolean || false,
        appMode: localStorage.getItem('sequ3nce_personal_bot_mode') === 'true' ? 'hub' : 'legacy',
      },
      permissions: {
        microphonePermission: micPermission,
        screenRecordingPermission: screenPermission ? 'granted' : 'denied',
      },
      createdAt: Date.now(),
    };

    const result = await submitDiagnosticReport(report);
    setIsSendingDiag(false);
    if (result.success) {
      setDiagReportId(result.reportId!);
      setDiagDescription('');
    } else {
      setDiagError(result.error || 'Failed to send diagnostics.');
    }
  }

  return (
    <div className="flex flex-col h-full">
      <div className="px-6 pt-5 pb-3 shrink-0">
        <h1 className="text-2xl font-bold text-black">Settings</h1>
      </div>

      <div className="flex-1 overflow-y-auto px-6 pb-6 space-y-6">
        {/* Account Section */}
        <SettingsSection title="Account">
          <div className="flex items-center gap-3 mb-4">
            <div className="w-10 h-10 bg-black rounded-full flex items-center justify-center text-white text-[14px] font-bold">
              {closerInfo.name.split(' ').map((n) => n[0]).join('').slice(0, 2).toUpperCase()}
            </div>
            <div>
              <p className="text-[14px] font-semibold text-black">{closerInfo.name}</p>
              <p className="text-[12px] text-gray-500">{closerInfo.email}</p>
            </div>
          </div>

          {passwordSuccess && (
            <div className="flex items-center gap-1.5 p-2 mb-3 bg-green-50 border border-green-200 rounded-lg text-[12px] text-green-700">
              <svg className="w-3.5 h-3.5" fill="currentColor" viewBox="0 0 20 20"><path fillRule="evenodd" d="M10 18a8 8 0 100-16 8 8 0 000 16zm3.707-9.293a1 1 0 00-1.414-1.414L9 10.586 7.707 9.293a1 1 0 00-1.414 1.414l2 2a1 1 0 001.414 0l4-4z" clipRule="evenodd" /></svg>
              Password changed successfully!
            </div>
          )}

          {!showPasswordForm ? (
            <button
              onClick={() => setShowPasswordForm(true)}
              className="text-[13px] font-medium text-blue-600 hover:text-blue-700"
            >
              Change Password
            </button>
          ) : (
            <div className="space-y-2 max-w-xs">
              <input
                type="password"
                value={currentPassword}
                onChange={(e) => setCurrentPassword(e.target.value)}
                placeholder="Current password"
                className="w-full px-3 py-2 text-[13px] bg-gray-50 border border-gray-200 rounded-lg focus:outline-none focus:border-gray-400"
              />
              <input
                type="password"
                value={newPassword}
                onChange={(e) => setNewPassword(e.target.value)}
                placeholder="New password"
                className="w-full px-3 py-2 text-[13px] bg-gray-50 border border-gray-200 rounded-lg focus:outline-none focus:border-gray-400"
              />
              <input
                type="password"
                value={confirmPassword}
                onChange={(e) => setConfirmPassword(e.target.value)}
                placeholder="Confirm new password"
                className="w-full px-3 py-2 text-[13px] bg-gray-50 border border-gray-200 rounded-lg focus:outline-none focus:border-gray-400"
              />
              {passwordError && (
                <p className="text-[12px] text-red-600">{passwordError}</p>
              )}
              <div className="flex gap-2">
                <button
                  onClick={handleChangePassword}
                  disabled={isChangingPassword || !currentPassword || !newPassword || !confirmPassword}
                  className="px-4 py-2 text-[12px] font-semibold text-white bg-black rounded-lg hover:bg-gray-800 disabled:bg-gray-300 disabled:cursor-not-allowed transition-colors"
                >
                  {isChangingPassword ? 'Saving...' : 'Save'}
                </button>
                <button
                  onClick={() => { setShowPasswordForm(false); setPasswordError(null); }}
                  className="px-4 py-2 text-[12px] font-medium text-gray-600 hover:text-gray-800"
                >
                  Cancel
                </button>
              </div>
            </div>
          )}
        </SettingsSection>

        {/* Calendar Section */}
        <SettingsSection title="Calendar Connection">
          {isLoadingCal ? (
            <div className="flex items-center gap-2">
              <span className="w-3 h-3 border-2 border-gray-400 border-t-transparent rounded-full animate-spin" />
              <span className="text-[13px] text-gray-500">Loading...</span>
            </div>
          ) : calStatus?.connected ? (
            <div className="space-y-2">
              <div className="flex items-center gap-2 text-[13px]">
                <span className="w-2 h-2 bg-green-500 rounded-full" />
                <span className="text-green-700 font-medium">Connected</span>
                {calStatus.lastSynced && (
                  <span className="text-gray-400 text-[11px]">
                    Last synced {new Date(calStatus.lastSynced).toLocaleString()}
                  </span>
                )}
              </div>
              <button
                onClick={handleDisconnectCalendar}
                disabled={isDisconnecting}
                className="text-[12px] font-medium text-red-600 hover:text-red-700"
              >
                {isDisconnecting ? 'Disconnecting...' : 'Disconnect Calendar'}
              </button>
            </div>
          ) : (
            <div className="space-y-3 max-w-md">
              <p className="text-[13px] text-gray-500 dark:text-gray-400">Not connected. Connect your Google Calendar to see your schedule.</p>
              {isWaitingOAuth ? (
                <div className="flex items-center gap-2">
                  <span className="w-3 h-3 border-2 border-gray-400 border-t-transparent rounded-full animate-spin" />
                  <span className="text-[13px] text-gray-500">Waiting for authorization...</span>
                  <button onClick={() => setIsWaitingOAuth(false)} className="text-[12px] text-gray-400 hover:text-gray-600 ml-2">Cancel</button>
                </div>
              ) : (
                <button
                  onClick={handleGoogleConnect}
                  className="flex items-center gap-2 px-4 py-2.5 text-[13px] font-semibold text-white bg-black dark:bg-white dark:text-black rounded-lg hover:bg-gray-800 dark:hover:bg-gray-100 transition-colors"
                >
                  <svg className="w-4 h-4" viewBox="0 0 24 24" fill="none">
                    <path d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92a5.06 5.06 0 01-2.2 3.32v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.1z" fill="#4285F4"/>
                    <path d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z" fill="#34A853"/>
                    <path d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18A10.96 10.96 0 001 12c0 1.77.42 3.45 1.18 4.93l3.66-2.84z" fill="#FBBC05"/>
                    <path d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z" fill="#EA4335"/>
                  </svg>
                  Connect Google Calendar
                </button>
              )}
            </div>
          )}
        </SettingsSection>

        {/* Subscription Section */}
        {closerInfo.subscriptionStatus === 'active' && (
          <SettingsSection title="Subscription">
            <div className="flex items-center gap-2 mb-3">
              <span className="w-2 h-2 bg-green-500 rounded-full" />
              <span className="text-[13px] text-green-700 font-medium">Active</span>
              <span className="text-[11px] text-gray-400">$129.99/month</span>
            </div>
            <button
              onClick={async () => {
                if (!closerInfo.b2cUserId) return;
                const result = await createB2CPortal(closerInfo.b2cUserId);
                if (result.url) {
                  window.open(result.url, '_blank');
                }
              }}
              className="text-[12px] font-medium text-blue-600 hover:text-blue-700"
            >
              Manage Subscription
            </button>
          </SettingsSection>
        )}

        {/* Diagnostics Section */}
        <SettingsSection title="Support & Diagnostics">
          <p className="text-[13px] text-gray-500 mb-3">
            Send a diagnostic report to help our team troubleshoot issues.
          </p>
          <div className="max-w-md space-y-2">
            <textarea
              value={diagDescription}
              onChange={(e) => setDiagDescription(e.target.value)}
              placeholder="Describe the issue (optional)..."
              rows={3}
              className="w-full px-3 py-2 text-[13px] bg-gray-50 border border-gray-200 rounded-lg resize-none focus:outline-none focus:border-gray-400"
            />
            {diagError && (
              <p className="text-[12px] text-red-600">{diagError}</p>
            )}
            {diagReportId && (
              <div className="flex items-center gap-2 p-2 bg-green-50 border border-green-200 rounded-lg">
                <svg className="w-3.5 h-3.5 text-green-600" fill="currentColor" viewBox="0 0 20 20"><path fillRule="evenodd" d="M10 18a8 8 0 100-16 8 8 0 000 16zm3.707-9.293a1 1 0 00-1.414-1.414L9 10.586 7.707 9.293a1 1 0 00-1.414 1.414l2 2a1 1 0 001.414 0l4-4z" clipRule="evenodd" /></svg>
                <span className="text-[12px] text-green-700">
                  Report sent! ID: <button onClick={() => navigator.clipboard.writeText(diagReportId)} className="font-mono font-bold underline">{diagReportId}</button>
                </span>
              </div>
            )}
            <button
              onClick={handleSendDiagnostics}
              disabled={isSendingDiag}
              className="px-4 py-2 text-[12px] font-semibold text-white bg-black rounded-lg hover:bg-gray-800 disabled:bg-gray-300 disabled:cursor-not-allowed transition-colors"
            >
              {isSendingDiag ? (
                <span className="flex items-center gap-1.5">
                  <span className="w-3 h-3 border-2 border-white border-t-transparent rounded-full animate-spin" />
                  Sending...
                </span>
              ) : (
                'Send Diagnostics'
              )}
            </button>
          </div>
        </SettingsSection>

        {/* Sign Out */}
        <SettingsSection title="Sign Out">
          <button
            onClick={onLogout}
            className="px-4 py-2 text-[12px] font-semibold text-red-600 border border-red-300 rounded-lg hover:bg-red-50 transition-colors"
          >
            Sign Out
          </button>
        </SettingsSection>
      </div>
    </div>
  );
}

function SettingsSection({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div>
      <h3 className="text-[11px] font-semibold text-gray-500 uppercase tracking-wider mb-3">{title}</h3>
      <div className="p-4 bg-white rounded-lg border border-gray-100">
        {children}
      </div>
    </div>
  );
}

function generateReportId(): string {
  const chars = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
  let id = '';
  for (let i = 0; i < 6; i++) {
    id += chars[Math.floor(Math.random() * chars.length)];
  }
  return id;
}
