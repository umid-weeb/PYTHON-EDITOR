import { useEffect, useRef, useState } from "react";
import { authApi } from "../../lib/apiClient.js";
import styles from "../../pages/AuthPage.module.css";

let googleScriptPromise;

function loadGoogleScript() {
  if (window.google?.accounts?.id) {
    return Promise.resolve(window.google);
  }
  if (googleScriptPromise) {
    return googleScriptPromise;
  }

  googleScriptPromise = new Promise((resolve, reject) => {
    const existing = document.querySelector('script[data-google-gsi="true"]');
    if (existing) {
      existing.addEventListener("load", () => resolve(window.google), { once: true });
      existing.addEventListener("error", () => reject(new Error("Google script failed to load")), { once: true });
      return;
    }

    const script = document.createElement("script");
    script.src = "https://accounts.google.com/gsi/client";
    script.async = true;
    script.defer = true;
    script.dataset.googleGsi = "true";
    script.onload = () => resolve(window.google);
    script.onerror = () => reject(new Error("Google script failed to load"));
    document.head.appendChild(script);
  });

  return googleScriptPromise;
}

export default function GoogleAuthButton({ onCredential, onError, text = "continue_with" }) {
  const buttonRef = useRef(null);
  const credentialHandlerRef = useRef(onCredential);
  const errorHandlerRef = useRef(onError);
  const [isReady, setIsReady] = useState(false);
  const [isEnabled, setIsEnabled] = useState(true);

  useEffect(() => {
    credentialHandlerRef.current = onCredential;
  }, [onCredential]);

  useEffect(() => {
    errorHandlerRef.current = onError;
  }, [onError]);

  useEffect(() => {
    let active = true;

    async function setupGoogleButton() {
      try {
        const config = await authApi.googleConfig();
        if (!active) {
          return;
        }
        if (!config?.enabled || !config?.client_id) {
          setIsEnabled(false);
          return;
        }
        if (!buttonRef.current) {
          return;
        }

        await loadGoogleScript();
        if (!active || !window.google?.accounts?.id || !buttonRef.current) {
          return;
        }

        buttonRef.current.innerHTML = "";
        const buttonWidth = Math.min(
          buttonRef.current.parentElement?.offsetWidth || buttonRef.current.offsetWidth || 360,
          360
        );
        window.google.accounts.id.initialize({
          client_id: config.client_id,
          callback: (response) => {
            if (response?.credential) {
              credentialHandlerRef.current?.(response.credential);
            } else {
              errorHandlerRef.current?.(new Error("Google credential topilmadi."));
            }
          },
          ux_mode: "popup",
          cancel_on_tap_outside: true,
        });

        window.google.accounts.id.renderButton(buttonRef.current, {
          theme: "outline",
          size: "large",
          shape: "pill",
          width: buttonWidth,
          text,
        });
        setIsReady(true);
      } catch (error) {
        setIsEnabled(false);
        errorHandlerRef.current?.(error);
      }
    }

    setupGoogleButton();
    return () => {
      active = false;
      if (buttonRef.current) {
        buttonRef.current.innerHTML = "";
      }
    };
  }, [text]);

  if (!isEnabled) {
    return null;
  }

  return (
    <div className={styles.googleSection}>
      <div className={styles.divider}>
        <span>yoki</span>
      </div>
      <div className={styles.googleButtonWrap}>
        <div className={styles.googleButton} ref={buttonRef} />
        {!isReady ? <p className={styles.googleHint}>Google tugmasi yuklanmoqda...</p> : null}
      </div>
    </div>
  );
}
