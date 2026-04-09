"use client";

import { useSearchParams } from "next/navigation";
import { useEffect, useRef } from "react";

export default function AffiliatePage() {
  const searchParams = useSearchParams();
  const email = searchParams.get("email") || "";
  const containerRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!containerRef.current) return;

    // Create widget div
    const widgetDiv = document.createElement("div");
    widgetDiv.id = "refgrow";
    widgetDiv.setAttribute("data-project-id", "733");
    if (email) widgetDiv.setAttribute("data-project-email", email);
    containerRef.current.appendChild(widgetDiv);

    // Load script
    const script = document.createElement("script");
    script.src = "https://scripts.refgrowcdn.com/page.js";
    script.async = true;
    script.defer = true;
    document.body.appendChild(script);

    return () => {
      script.remove();
      if (containerRef.current) containerRef.current.innerHTML = "";
    };
  }, [email]);

  return <div ref={containerRef} style={{ minHeight: "100vh" }} />;
}
