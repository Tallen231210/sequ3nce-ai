import { useCallback, useEffect, useRef, useState } from 'react';
import {
  getAdoptionChecklistData,
  ensureAdoptionChecklistRow,
  markSetupAutoOpened,
  dismissAdoptionSetup,
  markEarnSeen,
  type AdoptionChecklistData,
} from '../../convex';

const POLL_INTERVAL_MS = 30_000; // 30s — checklist state changes slowly

interface UseAdoptionChecklistResult {
  data: AdoptionChecklistData | null;
  loading: boolean;
  refresh: () => Promise<void>;
  ensureRow: () => Promise<void>;
  markAutoOpened: () => Promise<void>;
  dismissSetup: () => Promise<void>;
  markEarnSeen: () => Promise<void>;
}

// Polls the adoption-checklist backend on a 30s interval (and on demand). Only
// active when a userId is provided — gracefully no-ops for unauthenticated
// renders.
export function useAdoptionChecklist(userId: string | undefined): UseAdoptionChecklistResult {
  const [data, setData] = useState<AdoptionChecklistData | null>(null);
  const [loading, setLoading] = useState(false);
  const mountedRef = useRef(true);

  const refresh = useCallback(async () => {
    if (!userId) return;
    setLoading(true);
    try {
      const res = await getAdoptionChecklistData(userId);
      if (!mountedRef.current) return;
      if ('error' in res) {
        // Network-degraded; keep prior data, stop spinning.
        return;
      }
      setData(res);
    } finally {
      if (mountedRef.current) setLoading(false);
    }
  }, [userId]);

  useEffect(() => {
    mountedRef.current = true;
    if (!userId) return () => {
      mountedRef.current = false;
    };
    void refresh();
    const interval = setInterval(() => {
      void refresh();
    }, POLL_INTERVAL_MS);
    return () => {
      mountedRef.current = false;
      clearInterval(interval);
    };
  }, [userId, refresh]);

  const ensureRow = useCallback(async () => {
    if (!userId) return;
    await ensureAdoptionChecklistRow(userId);
    await refresh();
  }, [userId, refresh]);

  const markAutoOpenedCb = useCallback(async () => {
    if (!userId) return;
    await markSetupAutoOpened(userId);
    await refresh();
  }, [userId, refresh]);

  const dismissSetupCb = useCallback(async () => {
    if (!userId) return;
    await dismissAdoptionSetup(userId);
    await refresh();
  }, [userId, refresh]);

  const markEarnSeenCb = useCallback(async () => {
    if (!userId) return;
    await markEarnSeen(userId);
    await refresh();
  }, [userId, refresh]);

  return {
    data,
    loading,
    refresh,
    ensureRow,
    markAutoOpened: markAutoOpenedCb,
    dismissSetup: dismissSetupCb,
    markEarnSeen: markEarnSeenCb,
  };
}
