import React, { useState } from 'react';
import type { CloserInfo } from '../../convex';
import { NotificationComposer } from './NotificationComposer';
import { NotificationHistoryPanel } from './NotificationHistoryPanel';

interface NotificationsViewProps {
  closerInfo: CloserInfo;
}

export function NotificationsView({ closerInfo }: NotificationsViewProps) {
  const founderId = closerInfo.b2cUserId || '';
  const [refreshToken, setRefreshToken] = useState(0);

  if (!founderId) {
    return (
      <div className="p-6 text-sm text-gray-500 dark:text-gray-400">
        Unable to load — please log out and back in.
      </div>
    );
  }

  return (
    <div className="max-w-3xl mx-auto p-6 space-y-4">
      <div>
        <h2 className="text-lg font-bold text-gray-900 dark:text-white">Notifications</h2>
        <p className="text-sm text-gray-500 dark:text-gray-400 mt-0.5">
          Send official messages as <b>Sequ3nce Team</b>. Replies land in your Messages tab under
          <b> Sequ3nce Inbox</b>.
        </p>
      </div>

      <NotificationComposer
        founderId={founderId}
        onSent={() => setRefreshToken((t) => t + 1)}
      />

      <NotificationHistoryPanel founderId={founderId} refreshToken={refreshToken} />
    </div>
  );
}
