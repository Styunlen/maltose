"use client";

import * as React from "react";
import { X, AlertTriangle } from "lucide-react";

export default function AuthErrorToast() {
  const [visible, setVisible] = React.useState(false);
  const [error, setError] = React.useState("");
  const [hint, setHint] = React.useState("");

  React.useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const authError = params.get("auth_error");
    const authHint = params.get("auth_hint");

    if (authError) {
      setError(decodeURIComponent(authError));
      setHint(authHint ? decodeURIComponent(authHint) : "");
      setVisible(true);

      const url = new URL(window.location.href);
      url.searchParams.delete("auth_error");
      url.searchParams.delete("auth_hint");
      window.history.replaceState({}, "", url.toString());
    }
  }, []);

  if (!visible) return null;

  return (
    <div className="pointer-events-auto fixed top-4 left-1/2 z-[9999] w-full max-w-lg -translate-x-1/2 animate-slide-down px-4">
      <div className="flex items-start gap-3 rounded-xl border border-red-200 bg-red-50 p-4 shadow-lg dark:border-red-800 dark:bg-red-950">
        <AlertTriangle className="mt-0.5 size-5 shrink-0 text-red-500" />
        <div className="flex-1 min-w-0">
          <p className="text-sm font-semibold text-red-700 dark:text-red-300">
            {error}
          </p>
          {hint && (
            <p className="mt-1 text-xs text-red-600 dark:text-red-400 leading-relaxed">
              {hint}
            </p>
          )}
        </div>
        <button
          type="button"
          onClick={() => setVisible(false)}
          className="flex size-6 shrink-0 items-center justify-center rounded-md text-red-400 hover:bg-red-200 hover:text-red-600 transition-colors dark:hover:bg-red-800 dark:hover:text-red-300"
        >
          <X className="size-4" />
        </button>
      </div>
      <style>{`
        @keyframes slide-down {
          from { opacity: 0; transform: translateX(-50%) translateY(-16px); }
          to   { opacity: 1; transform: translateX(-50%) translateY(0); }
        }
        .animate-slide-down { animation: slide-down 0.3s ease-out; }
      `}</style>
    </div>
  );
}
