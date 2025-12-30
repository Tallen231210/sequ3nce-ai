"use client";

import { useState, useEffect } from "react";
import { X } from "lucide-react";
import { cn } from "@/lib/utils";

interface CalendlyModalProps {
  isOpen: boolean;
  onClose: () => void;
}

// Booking widget URL
const BOOKING_URL = "https://hub.sequ3nce.ai/widget/bookings/sequ3nceai-demo";

export function CalendlyModal({ isOpen, onClose }: CalendlyModalProps) {
  const [isLoaded, setIsLoaded] = useState(false);

  // Reset loaded state when modal closes
  useEffect(() => {
    if (!isOpen) {
      setIsLoaded(false);
    }
  }, [isOpen]);

  // Prevent body scroll when modal is open
  useEffect(() => {
    if (isOpen) {
      document.body.style.overflow = "hidden";
    } else {
      document.body.style.overflow = "unset";
    }
    return () => {
      document.body.style.overflow = "unset";
    };
  }, [isOpen]);

  // Handle escape key
  useEffect(() => {
    const handleEscape = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        onClose();
      }
    };

    if (isOpen) {
      document.addEventListener("keydown", handleEscape);
    }

    return () => {
      document.removeEventListener("keydown", handleEscape);
    };
  }, [isOpen, onClose]);

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center">
      {/* Backdrop */}
      <div
        className="absolute inset-0 bg-black/50 backdrop-blur-sm"
        onClick={onClose}
      />

      {/* Modal */}
      <div className="relative bg-white rounded-2xl shadow-2xl w-full max-w-2xl mx-4 max-h-[90vh] overflow-hidden">
        {/* Header */}
        <div className="flex items-center justify-between px-6 py-4 border-b border-zinc-200">
          <h2 className="text-lg font-semibold">Book a Demo</h2>
          <button
            onClick={onClose}
            className="p-2 hover:bg-zinc-100 rounded-lg transition-colors"
          >
            <X className="h-5 w-5" />
          </button>
        </div>

        {/* Calendly Embed */}
        <div className="relative" style={{ height: "630px" }}>
          {!isLoaded && (
            <div className="absolute inset-0 flex items-center justify-center bg-zinc-50">
              <div className="text-center">
                <div className="animate-spin h-8 w-8 border-2 border-zinc-300 border-t-zinc-600 rounded-full mx-auto mb-4" />
                <p className="text-zinc-500">Loading calendar...</p>
              </div>
            </div>
          )}
          <iframe
            src={BOOKING_URL}
            width="100%"
            height="100%"
            frameBorder="0"
            onLoad={() => setIsLoaded(true)}
            className={cn(
              "transition-opacity duration-300",
              isLoaded ? "opacity-100" : "opacity-0"
            )}
          />
        </div>
      </div>
    </div>
  );
}

// Button component that opens the modal
interface BookDemoButtonProps {
  children: React.ReactNode;
  className?: string;
  size?: "default" | "lg";
}

export function BookDemoButton({ children, className, size = "default" }: BookDemoButtonProps) {
  const [isModalOpen, setIsModalOpen] = useState(false);

  return (
    <>
      <button
        onClick={() => setIsModalOpen(true)}
        className={cn(
          "inline-flex items-center justify-center gap-2 rounded-md font-medium transition-colors",
          "bg-zinc-900 text-white hover:bg-zinc-800",
          size === "default" && "h-9 px-4 py-2 text-sm",
          size === "lg" && "h-11 px-8 text-base",
          className
        )}
      >
        {children}
      </button>
      <CalendlyModal isOpen={isModalOpen} onClose={() => setIsModalOpen(false)} />
    </>
  );
}
