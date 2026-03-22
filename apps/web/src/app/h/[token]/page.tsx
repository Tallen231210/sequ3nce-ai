"use client";

import { useParams } from "next/navigation";
import { useEffect, useState, useRef } from "react";
import { Logo } from "@/components/ui/logo";
import { Lock } from "lucide-react";

const CONVEX_SITE_URL =
  process.env.NEXT_PUBLIC_CONVEX_SITE_URL ||
  (process.env.NEXT_PUBLIC_CONVEX_URL || "").replace(".cloud", ".site");

interface ClipShareData {
  label: string;
  startTime: number;
  endTime: number;
  isFullCall: boolean;
  blurRegion: string;
  recordingUrl: string | null;
  closerName: string;
  profileSlug: string | null;
}

type PageState = "loading" | "password" | "loaded" | "error" | "not_found";

export default function HighlightSharePage() {
  const params = useParams<{ token: string }>();
  const token = params.token;

  const [state, setState] = useState<PageState>("loading");
  const [data, setData] = useState<ClipShareData | null>(null);
  const [password, setPassword] = useState("");
  const [passwordError, setPasswordError] = useState(false);
  const [isPlaying, setIsPlaying] = useState(false);
  const videoRef = useRef<HTMLVideoElement>(null);

  useEffect(() => {
    if (token) fetchData();
  }, [token]);

  const fetchData = async (pw?: string) => {
    try {
      const response = await fetch(`${CONVEX_SITE_URL}/b2c/highlight-shares/public`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ token, password: pw }),
      });

      if (response.status === 401) {
        const body = await response.json();
        if (body.needsPassword) {
          setState("password");
          return;
        }
        if (body.passwordIncorrect) {
          setPasswordError(true);
          return;
        }
      }

      if (response.status === 404) {
        setState("not_found");
        return;
      }

      if (!response.ok) {
        setState("error");
        return;
      }

      const result = await response.json();
      setData(result);
      setState("loaded");
    } catch {
      setState("error");
    }
  };

  const handlePasswordSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!password.trim()) return;
    setPasswordError(false);
    fetchData(password.trim());
  };

  const handlePlayToggle = () => {
    if (!videoRef.current) return;
    if (isPlaying) {
      videoRef.current.pause();
    } else {
      videoRef.current.play();
    }
  };

  function formatDuration(start: number, end: number): string {
    const total = Math.round(end - start);
    const m = Math.floor(total / 60);
    const s = total % 60;
    return `${m}:${s.toString().padStart(2, "0")}`;
  }

  // Password gate
  if (state === "password") {
    return (
      <div className="min-h-screen bg-zinc-50 flex flex-col">
        <header className="border-b border-zinc-200 bg-white">
          <div className="max-w-4xl mx-auto px-6 py-4">
            <Logo height={22} href="/" />
          </div>
        </header>
        <div className="flex-1 flex items-center justify-center">
          <form onSubmit={handlePasswordSubmit} className="bg-white rounded-xl border border-zinc-200 shadow-sm p-8 w-full max-w-sm space-y-4">
            <div className="flex items-center gap-2 text-zinc-700">
              <Lock className="w-5 h-5" />
              <h2 className="text-lg font-semibold">Password Required</h2>
            </div>
            <p className="text-sm text-zinc-500">This highlight clip is password protected.</p>
            <input
              type="password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              placeholder="Enter password..."
              autoFocus
              className="w-full px-3 py-2 border border-zinc-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-black"
            />
            {passwordError && (
              <p className="text-sm text-red-500">Incorrect password. Please try again.</p>
            )}
            <button
              type="submit"
              className="w-full py-2 bg-black text-white text-sm font-medium rounded-lg hover:bg-zinc-800"
            >
              Unlock
            </button>
          </form>
        </div>
      </div>
    );
  }

  // Loading
  if (state === "loading") {
    return (
      <div className="min-h-screen bg-zinc-50 flex items-center justify-center">
        <div className="text-sm text-zinc-400">Loading...</div>
      </div>
    );
  }

  // Not found / error
  if (state === "not_found" || state === "error") {
    return (
      <div className="min-h-screen bg-zinc-50 flex flex-col">
        <header className="border-b border-zinc-200 bg-white">
          <div className="max-w-4xl mx-auto px-6 py-4">
            <Logo height={22} href="/" />
          </div>
        </header>
        <div className="flex-1 flex items-center justify-center">
          <div className="text-center">
            <h2 className="text-xl font-semibold text-zinc-900 mb-2">
              {state === "not_found" ? "Highlight Not Found" : "Something Went Wrong"}
            </h2>
            <p className="text-sm text-zinc-500">
              {state === "not_found"
                ? "This highlight clip link may have been revoked or doesn't exist."
                : "We couldn't load this highlight clip. Please try again later."}
            </p>
          </div>
        </div>
      </div>
    );
  }

  // Loaded
  if (!data) return null;

  const videoSrc = data.recordingUrl
    ? data.isFullCall
      ? data.recordingUrl
      : `${data.recordingUrl}#t=${data.startTime},${data.endTime}`
    : null;

  return (
    <div className="min-h-screen bg-zinc-50 flex flex-col">
      {/* Header */}
      <header className="border-b border-zinc-200 bg-white">
        <div className="max-w-4xl mx-auto px-6 py-4 flex items-center justify-between">
          <Logo height={22} href="/" />
          {data.profileSlug && (
            <a
              href={`/p/${data.profileSlug}`}
              className="text-sm text-zinc-600 hover:text-black transition-colors"
            >
              View Profile
            </a>
          )}
        </div>
      </header>

      {/* Content */}
      <main className="flex-1 max-w-4xl mx-auto w-full px-6 py-8">
        {/* Closer info */}
        <div className="mb-4">
          <div className="text-sm text-zinc-500">Shared by</div>
          <div className="text-lg font-semibold text-zinc-900">{data.closerName}</div>
        </div>

        {/* Clip label */}
        <h1 className="text-xl font-bold text-zinc-900 mb-4">{data.label}</h1>

        {/* Video player */}
        <div className="relative rounded-xl overflow-hidden bg-black aspect-video mb-4 cursor-pointer" onClick={handlePlayToggle}>
          {videoSrc ? (
            <video
              ref={videoRef}
              src={videoSrc}
              className="w-full h-full object-contain"
              playsInline
              onPlay={() => setIsPlaying(true)}
              onPause={() => setIsPlaying(false)}
              onEnded={() => setIsPlaying(false)}
            />
          ) : (
            <div className="w-full h-full flex items-center justify-center">
              <span className="text-sm text-zinc-500">Recording unavailable</span>
            </div>
          )}

          {/* Blur overlay */}
          {data.blurRegion !== "none" && (
            <div
              className="absolute top-0 bottom-0"
              style={{
                [data.blurRegion === "left" ? "left" : "right"]: 0,
                width: "50%",
                backdropFilter: "blur(20px)",
                WebkitBackdropFilter: "blur(20px)",
                backgroundColor: "rgba(255,255,255,0.15)",
              }}
            />
          )}

          {/* Play button */}
          {!isPlaying && videoSrc && (
            <div className="absolute inset-0 flex items-center justify-center bg-black/20">
              <div className="w-16 h-16 bg-white/90 rounded-full flex items-center justify-center shadow-lg">
                <svg className="w-6 h-6 text-black ml-1" fill="currentColor" viewBox="0 0 20 20">
                  <path d="M6.3 2.841A1.5 1.5 0 004 4.11V15.89a1.5 1.5 0 002.3 1.269l9.344-5.89a1.5 1.5 0 000-2.538L6.3 2.84z" />
                </svg>
              </div>
            </div>
          )}

          {/* Duration badge */}
          <div className="absolute bottom-3 right-3 bg-black/70 text-white text-xs font-medium px-2 py-1 rounded">
            {formatDuration(data.startTime, data.endTime)}
          </div>
        </div>

        {/* Metadata */}
        <div className="flex items-center gap-3 text-xs text-zinc-400">
          {data.isFullCall && <span>Full call</span>}
          {data.blurRegion !== "none" && <span>Prospect side blurred</span>}
        </div>
      </main>

      {/* Footer */}
      <footer className="border-t border-zinc-200 bg-white">
        <div className="max-w-4xl mx-auto px-6 py-4 text-center">
          <p className="text-xs text-zinc-400">
            Powered by{" "}
            <a href="https://sequ3nce.ai" className="text-zinc-600 hover:text-black transition-colors">
              Sequ3nce
            </a>
          </p>
        </div>
      </footer>
    </div>
  );
}
