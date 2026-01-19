"use client";

import { useState } from "react";
import { ChatButton } from "./ChatButton";
import { ChatPanel } from "./ChatPanel";

/**
 * Container component that manages the chat button and panel state.
 * Add this to the dashboard layout to enable team messaging.
 */
export function ChatContainer() {
  const [isPanelOpen, setIsPanelOpen] = useState(false);

  const togglePanel = () => {
    setIsPanelOpen((prev) => !prev);
  };

  const closePanel = () => {
    setIsPanelOpen(false);
  };

  return (
    <>
      <ChatButton isOpen={isPanelOpen} onClick={togglePanel} />
      <ChatPanel isOpen={isPanelOpen} onClose={closePanel} />
    </>
  );
}
