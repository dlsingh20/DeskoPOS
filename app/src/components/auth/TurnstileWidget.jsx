import React, { forwardRef, useEffect, useImperativeHandle, useRef } from 'react';

/**
 * Cloudflare Turnstile captcha widget.
 *
 * Loads the Turnstile script once (explicit render mode), renders the widget,
 * and reports the token via onToken (empty string when expired/errored).
 * Never blocks: if the script fails to load, the form still submits without a token.
 *
 * Imperative handle: ref.current.reset() — call after every failed login
 * (tokens are single-use).
 */
export const TURNSTILE_SITEKEY = process.env.REACT_APP_TURNSTILE_SITEKEY || '';

/** The sign-in captcha is on only when a site key is set (the service then checks it with its secret) */
export const CAPTCHA_ENABLED = !!TURNSTILE_SITEKEY;

const SCRIPT_SRC = 'https://challenges.cloudflare.com/turnstile/v0/api.js?render=explicit';
let scriptPromise = null;

function loadTurnstile() {
  if (typeof window === 'undefined') return Promise.reject(new Error('no window'));
  if (window.turnstile) return Promise.resolve(window.turnstile);
  if (!scriptPromise) {
    scriptPromise = new Promise((resolve, reject) => {
      const script = document.createElement('script');
      script.src = SCRIPT_SRC;
      script.async = true;
      script.defer = true;
      script.onload = () => (window.turnstile ? resolve(window.turnstile) : reject(new Error('turnstile missing')));
      script.onerror = () => {
        scriptPromise = null; // allow a retry on next mount
        script.remove();
        reject(new Error('Failed to load Turnstile'));
      };
      document.head.appendChild(script);
    });
  }
  return scriptPromise;
}

const TurnstileWidget = forwardRef(({ onToken, siteKey = TURNSTILE_SITEKEY }, ref) => {
  const containerRef = useRef(null);
  const widgetIdRef = useRef(null);
  const onTokenRef = useRef(onToken);
  onTokenRef.current = onToken;

  useImperativeHandle(ref, () => ({
    reset() {
      onTokenRef.current && onTokenRef.current('');
      if (window.turnstile && widgetIdRef.current != null) {
        try {
          window.turnstile.reset(widgetIdRef.current);
        } catch (e) {
          /* ignore */
        }
      }
    },
  }));

  useEffect(() => {
    let cancelled = false;
    loadTurnstile()
      .then((turnstile) => {
        if (cancelled || !containerRef.current || widgetIdRef.current != null) return;
        widgetIdRef.current = turnstile.render(containerRef.current, {
          sitekey: siteKey,
          callback: (token) => onTokenRef.current && onTokenRef.current(token),
          'expired-callback': () => onTokenRef.current && onTokenRef.current(''),
          'error-callback': () => onTokenRef.current && onTokenRef.current(''),
        });
      })
      .catch((err) => {
        console.warn('Turnstile unavailable, continuing without captcha:', err);
      });
    return () => {
      cancelled = true;
      if (window.turnstile && widgetIdRef.current != null) {
        try {
          window.turnstile.remove(widgetIdRef.current);
        } catch (e) {
          /* ignore */
        }
      }
      widgetIdRef.current = null;
    };
  }, [siteKey]);

  return <div ref={containerRef} style={{ display: 'flex', justifyContent: 'center', width: '100%' }} />;
});

TurnstileWidget.displayName = 'TurnstileWidget';

export default TurnstileWidget;
