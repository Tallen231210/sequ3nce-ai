"use client";

import { Lock } from "lucide-react";
import { Logo } from "@/components/ui/logo";

interface PasswordGateProps {
  password: string;
  setPassword: (value: string) => void;
  onSubmit: (e: React.FormEvent) => void;
  isUnlocking: boolean;
  error: boolean;
}

export function PasswordGate({
  password,
  setPassword,
  onSubmit,
  isUnlocking,
  error,
}: PasswordGateProps) {
  return (
    <div className="min-h-screen bg-white flex items-center justify-center px-6 py-10">
      <div className="text-center space-y-5 w-full max-w-sm">
        <div className="w-14 h-14 rounded-full bg-zinc-100 flex items-center justify-center mx-auto">
          <Lock className="w-6 h-6 text-zinc-400" />
        </div>
        <div>
          <h1 className="text-lg font-semibold text-zinc-900">
            Password Protected
          </h1>
          <p className="text-sm text-zinc-500 mt-1">
            This recording requires a password to view.
          </p>
        </div>
        <form onSubmit={onSubmit} className="space-y-3">
          <input
            type="password"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            placeholder="Enter password"
            autoFocus
            autoComplete="off"
            className={`w-full px-3 py-2 text-sm border rounded-lg outline-none transition-colors ${
              error
                ? "border-red-300 focus:border-red-400"
                : "border-zinc-200 focus:border-zinc-400"
            }`}
          />
          {error && (
            <p className="text-xs text-red-500">
              Incorrect password. Please try again.
            </p>
          )}
          <button
            type="submit"
            disabled={isUnlocking || !password.trim()}
            className="w-full px-4 py-2 text-sm font-medium text-white bg-zinc-900 rounded-lg hover:bg-zinc-800 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
          >
            {isUnlocking ? "Unlocking..." : "Unlock Recording"}
          </button>
        </form>
        <div className="pt-2">
          <Logo height={20} />
        </div>
      </div>
    </div>
  );
}

export function LoadingState() {
  return (
    <div className="min-h-screen bg-white flex items-center justify-center px-6">
      <div className="text-center space-y-4">
        <div className="w-8 h-8 border-2 border-zinc-200 border-t-zinc-800 rounded-full animate-spin mx-auto" />
        <p className="text-sm text-zinc-400">Loading recording...</p>
      </div>
    </div>
  );
}

interface ErrorStateProps {
  message: string;
}

export function ErrorState({ message }: ErrorStateProps) {
  return (
    <div className="min-h-screen bg-white flex items-center justify-center px-6 py-10">
      <div className="text-center space-y-4 w-full max-w-md">
        <div className="w-14 h-14 rounded-full bg-zinc-100 flex items-center justify-center mx-auto">
          <svg
            className="w-6 h-6 text-zinc-400"
            fill="none"
            viewBox="0 0 24 24"
            strokeWidth={1.5}
            stroke="currentColor"
          >
            <path
              strokeLinecap="round"
              strokeLinejoin="round"
              d="M18.364 18.364A9 9 0 005.636 5.636m12.728 12.728A9 9 0 015.636 5.636m12.728 12.728L5.636 5.636"
            />
          </svg>
        </div>
        <h1 className="text-lg font-semibold text-zinc-900">Link Unavailable</h1>
        <p className="text-sm text-zinc-500">{message}</p>
        <div className="pt-4">
          <Logo height={20} />
        </div>
      </div>
    </div>
  );
}
