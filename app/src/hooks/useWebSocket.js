import { useState, useEffect, useCallback, useRef } from 'react';

/**
 * Hook for WebSocket connection management
 * @param {string} url - WebSocket URL
 * @param {Object} options - Configuration options
 */
const useWebSocket = (url, options = {}) => {
  const {
    autoConnect = true,
    reconnectAttempts = 5,
    reconnectInterval = 3000,
    onMessage,
    onConnected,
    onDisconnected,
    onError
  } = options;

  const [isConnected, setIsConnected] = useState(false);
  const [isConnecting, setIsConnecting] = useState(false);
  const [error, setError] = useState(null);

  const wsRef = useRef(null);
  const reconnectCountRef = useRef(0);
  const reconnectTimeoutRef = useRef(null);

  // Send message through WebSocket
  const sendMessage = useCallback((data) => {
    if (wsRef.current && wsRef.current.readyState === WebSocket.OPEN) {
      wsRef.current.send(JSON.stringify(data));
      return true;
    }
    return false;
  }, []);

  // Authenticate WebSocket connection
  const authenticate = useCallback((token, restaurantId, hotelId) => {
    return sendMessage({
      type: 'authenticate',
      token,
      restaurant_id: restaurantId,
      hotel_id: hotelId
    });
  }, [sendMessage]);

  // Join restaurant room. The server verifies the JWT and that the
  // restaurant belongs to the user's hotel before joining the group.
  const joinRestaurant = useCallback((restaurantId, hotelId, token) => {
    return sendMessage({
      type: 'join_restaurant',
      token,
      restaurant_id: restaurantId,
      hotel_id: hotelId
    });
  }, [sendMessage]);

  // Subscribe to updates
  const subscribeToUpdates = useCallback((updateType) => {
    return sendMessage({
      type: 'subscribe',
      subscription: updateType
    });
  }, [sendMessage]);

  // Connect to WebSocket
  const connect = useCallback(() => {
    if (!url || wsRef.current?.readyState === WebSocket.OPEN) {
      return;
    }

    setIsConnecting(true);
    setError(null);

    try {
      wsRef.current = new WebSocket(url);

      wsRef.current.onopen = () => {
        console.log('WebSocket connected:', url);
        setIsConnected(true);
        setIsConnecting(false);
        reconnectCountRef.current = 0;
        onConnected?.();
      };

      wsRef.current.onmessage = (event) => {
        try {
          const data = JSON.parse(event.data);
          onMessage?.(data);
        } catch (e) {
          console.error('Failed to parse WebSocket message:', e);
        }
      };

      wsRef.current.onclose = (event) => {
        console.log('WebSocket disconnected:', event.code, event.reason);
        setIsConnected(false);
        setIsConnecting(false);
        onDisconnected?.();

        // Attempt reconnection if not intentionally closed
        if (event.code !== 1000 && reconnectCountRef.current < reconnectAttempts) {
          reconnectCountRef.current++;
          console.log(`Reconnecting... Attempt ${reconnectCountRef.current}/${reconnectAttempts}`);
          reconnectTimeoutRef.current = setTimeout(connect, reconnectInterval);
        }
      };

      wsRef.current.onerror = (event) => {
        console.error('WebSocket error:', event);
        setError('WebSocket connection error');
        setIsConnecting(false);
        onError?.(event);
      };
    } catch (e) {
      console.error('Failed to create WebSocket:', e);
      setError(e.message);
      setIsConnecting(false);
    }
  }, [url, reconnectAttempts, reconnectInterval, onMessage, onConnected, onDisconnected, onError]);

  // Disconnect from WebSocket
  const disconnect = useCallback(() => {
    if (reconnectTimeoutRef.current) {
      clearTimeout(reconnectTimeoutRef.current);
    }
    if (wsRef.current) {
      wsRef.current.close(1000, 'Intentional disconnect');
      wsRef.current = null;
    }
    setIsConnected(false);
    setIsConnecting(false);
  }, []);

  // Auto-connect on mount if enabled
  useEffect(() => {
    if (autoConnect && url) {
      connect();
    }

    return () => {
      disconnect();
    };
  }, [autoConnect, url, connect, disconnect]);

  return {
    isConnected,
    isConnecting,
    error,
    connect,
    disconnect,
    sendMessage,
    authenticate,
    joinRestaurant,
    subscribeToUpdates
  };
};

export default useWebSocket;
