import { useState, useEffect, useCallback, useRef } from 'react';

/**
 * Hook to track user activity for smart refresh optimization
 * @param {Object} options - Configuration options
 * @param {number} options.timeout - Inactivity timeout in ms (default: 5 minutes)
 * @param {number} options.throttle - Throttle activity events in ms (default: 1 second)
 */
const useUserActivity = ({ timeout = 300000, throttle = 1000 } = {}) => {
  const [isActive, setIsActive] = useState(true);
  const [isVisible, setIsVisible] = useState(!document.hidden);
  const lastActivityRef = useRef(Date.now());
  const throttleTimeoutRef = useRef(null);

  // Trigger activity - can be called manually
  const triggerActivity = useCallback(() => {
    lastActivityRef.current = Date.now();
    setIsActive(true);
  }, []);

  // Throttled activity handler
  const handleActivity = useCallback(() => {
    if (throttleTimeoutRef.current) return;

    throttleTimeoutRef.current = setTimeout(() => {
      throttleTimeoutRef.current = null;
    }, throttle);

    triggerActivity();
  }, [throttle, triggerActivity]);

  // Check for inactivity
  useEffect(() => {
    const checkInactivity = setInterval(() => {
      const timeSinceLastActivity = Date.now() - lastActivityRef.current;
      if (timeSinceLastActivity > timeout) {
        setIsActive(false);
      }
    }, 10000); // Check every 10 seconds

    return () => clearInterval(checkInactivity);
  }, [timeout]);

  // Listen for user activity events
  useEffect(() => {
    const events = ['mousedown', 'mousemove', 'keydown', 'scroll', 'touchstart', 'click'];

    events.forEach(event => {
      window.addEventListener(event, handleActivity, { passive: true });
    });

    return () => {
      events.forEach(event => {
        window.removeEventListener(event, handleActivity);
      });
    };
  }, [handleActivity]);

  // Listen for visibility changes
  useEffect(() => {
    const handleVisibilityChange = () => {
      setIsVisible(!document.hidden);
      if (!document.hidden) {
        triggerActivity();
      }
    };

    document.addEventListener('visibilitychange', handleVisibilityChange);

    return () => {
      document.removeEventListener('visibilitychange', handleVisibilityChange);
    };
  }, [triggerActivity]);

  return {
    isActive,
    isVisible,
    triggerActivity,
    lastActivity: lastActivityRef.current
  };
};

export default useUserActivity;
