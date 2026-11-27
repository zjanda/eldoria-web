import { useEffect, useRef, useState } from "react";

/**
 * The official "Sign in with Google" button, from Google Identity Services
 * (https://developers.google.com/identity/gsi/web/guides/display-button).
 * Google's script draws the button; a click opens Google's own sign-in window, and on success Google hands
 * this page an ID token (`credential`) for the server to check. The client id is public, not a secret.
 */

const GOOGLE_SCRIPT_URL = "https://accounts.google.com/gsi/client";

interface GoogleIdentityServices {
  accounts: {
    id: {
      initialize: (config: {
        client_id: string;
        callback: (response: { credential?: string }) => void;
        ux_mode?: "popup" | "redirect";
        use_fedcm_for_button?: boolean;
        auto_select?: boolean;
      }) => void;
      renderButton: (element: HTMLElement, options: Record<string, string | number>) => void;
      disableAutoSelect: () => void;
    };
  };
}

declare global {
  interface Window {
    google?: GoogleIdentityServices;
  }
}

let scriptLoading: Promise<GoogleIdentityServices> | null = null;

function loadGoogleScript(): Promise<GoogleIdentityServices> {
  if (window.google?.accounts?.id) return Promise.resolve(window.google);
  if (!scriptLoading) {
    scriptLoading = new Promise((resolve, reject) => {
      const script = document.createElement("script");
      script.src = GOOGLE_SCRIPT_URL;
      script.async = true;
      script.onload = () => (window.google?.accounts?.id ? resolve(window.google) : reject(new Error("Google sign-in did not load.")));
      script.onerror = () => {
        scriptLoading = null; // allow another try
        reject(new Error("Google sign-in could not be loaded. Check your connection and reload the page."));
      };
      document.head.appendChild(script);
    });
  }
  return scriptLoading;
}

/** After signing out: stop Google from signing this browser straight back in. */
export function forgetGoogleAutoSelect(): void {
  window.google?.accounts?.id?.disableAutoSelect();
}

interface GoogleSignInButtonProps {
  clientId: string;
  disabled?: boolean;
  onCredential: (credential: string) => void;
}

export function GoogleSignInButton({ clientId, disabled = false, onCredential }: GoogleSignInButtonProps) {
  const container = useRef<HTMLDivElement>(null);
  const latestCallback = useRef(onCredential);
  latestCallback.current = onCredential;
  const [problem, setProblem] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    loadGoogleScript()
      .then((google) => {
        if (cancelled || !container.current) return;
        google.accounts.id.initialize({
          client_id: clientId,
          callback: (response) => response.credential && latestCallback.current(response.credential),
          ux_mode: "popup",
          use_fedcm_for_button: true,
        });
        google.accounts.id.renderButton(container.current, {
          type: "standard", theme: "filled_black", size: "large", text: "signin_with", shape: "pill", width: 280,
        });
      })
      .catch((error: Error) => !cancelled && setProblem(error.message));
    return () => {
      cancelled = true;
    };
  }, [clientId]);

  return (
    <div className={disabled ? "pointer-events-none opacity-60" : ""} aria-busy={disabled}>
      <div ref={container} className="flex min-h-[44px] justify-center" />
      {problem && <p className="mt-2 text-xs text-ember">{problem}</p>}
    </div>
  );
}
