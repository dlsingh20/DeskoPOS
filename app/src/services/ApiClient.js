import axios from 'axios';
import { IS_DESKOPOS } from './backend';

// Sign-in calls answer 401 for wrong credentials; never renew a token for them
const NO_RENEW = ['/api/auth/token/', '/api/auth/token/refresh/', '/api/auth/logout/'];

/**
 * API Client for POS Frontend
 * Handles HTTP requests with JWT authentication and hotel context
 * Based on the existing Room99 hotel system patterns
 */
class ApiClient {
  constructor() {
    this.baseURL = process.env.REACT_APP_API_BASE_URL || 'http://localhost:8001';
    
    // Create axios instance with base configuration
    this.client = axios.create({
      baseURL: this.baseURL,
      timeout: 30000,
      headers: {
        'Content-Type': 'application/json',
        'Accept': 'application/json'
      }
    });

    // Add request interceptor for auth and hotel context
    this.client.interceptors.request.use(
      (config) => {
        // Add JWT token if available
        const token = this.getAuthToken();
        if (token) {
          config.headers.Authorization = `Bearer ${token}`;
        }

        // Add hotel context header (DeskoPOS finds the client from the token)
        const hotelId = IS_DESKOPOS ? null : this.getHotelContext();
        if (hotelId) {
          config.headers['X-Hotel-Context'] = hotelId;
        }

        // Log request in development
        if (process.env.NODE_ENV === 'development') {
          console.log(`[API Request] ${config.method?.toUpperCase()} ${config.url}`, {
            data: config.data,
            params: config.params
          });
        }

        return config;
      },
      (error) => {
        console.error('[API Request Error]', error);
        return Promise.reject(error);
      }
    );

    // Add response interceptor for error handling
    this.client.interceptors.response.use(
      (response) => {
        // Log response in development
        if (process.env.NODE_ENV === 'development') {
          console.log(`[API Response] ${response.config.method?.toUpperCase()} ${response.config.url}`, {
            status: response.status,
            data: response.data
          });
        }
        return response;
      },
      async (error) => {
        console.error('[API Response Error]', error.response || error);

        // DeskoPOS access tokens last 15 minutes: renew once with the refresh token and retry
        const config = error.config;
        if (IS_DESKOPOS && error.response?.status === 401 && config && !config.skipAuthRedirect
            && !config._renewed && !NO_RENEW.some((path) => config.url?.startsWith(path))) {
          config._renewed = true;
          if (await this.renewAccessToken()) {
            config.headers.Authorization = `Bearer ${this.getAuthToken()}`;
            return this.client.request(config);
          }
        }

        // Handle authentication errors (not for requests that check someone else's credentials,
        // such as a manager approval, where 401 means a wrong PIN or password)
        if (error.response?.status === 401 && !error.config?.skipAuthRedirect) {
          this.handleAuthError();
        }
        
        // Handle server errors
        if (error.response?.status >= 500) {
          this.handleServerError(error);
        }
        
        return Promise.reject(error);
      }
    );
  }

  /**
   * New access token from the stored refresh token (which rotates). Requests that fail
   * together share one renewal. Resolves false when the session is over.
   * @returns {Promise<boolean>}
   */
  renewAccessToken() {
    if (!this.renewal) {
      this.renewal = (async () => {
        let refresh = null;
        try { refresh = localStorage.getItem('refresh_token'); } catch (e) { /* storage unavailable */ }
        if (!refresh) return false;
        try {
          const response = await this.client.post('/api/auth/token/refresh/', { refresh }, { skipAuthRedirect: true });
          this.setAuthToken(response.data.access);
          localStorage.setItem('refresh_token', response.data.refresh);
          return true;
        } catch (e) {
          return false;
        }
      })().finally(() => { this.renewal = null; });
    }
    return this.renewal;
  }

  /**
   * Get JWT authentication token from localStorage
   * @returns {string|null} JWT token
   */
  getAuthToken() {
    try {
      const token = localStorage.getItem('access_token') || localStorage.getItem('authToken');
      return token;
    } catch (error) {
      console.error('Error getting auth token:', error);
      return null;
    }
  }

  /**
   * Set JWT authentication token in localStorage
   * @param {string} token - JWT token
   */
  setAuthToken(token) {
    try {
      localStorage.setItem('access_token', token);
      localStorage.setItem('authToken', token); // Backward compatibility
    } catch (error) {
      console.error('Error setting auth token:', error);
    }
  }

  /**
   * Remove JWT token from localStorage
   */
  removeAuthToken() {
    try {
      localStorage.removeItem('access_token');
      localStorage.removeItem('authToken');
    } catch (error) {
      console.error('Error removing auth token:', error);
    }
  }

  /**
   * Get hotel context ID
   * @returns {string|null} Hotel ID
   */
  getHotelContext() {
    try {
      return localStorage.getItem('hotel_id') || process.env.REACT_APP_HOTEL_CONTEXT;
    } catch (error) {
      console.error('Error getting hotel context:', error);
      return null;
    }
  }

  /**
   * Set hotel context ID
   * @param {string} hotelId - Hotel ID
   */
  setHotelContext(hotelId) {
    try {
      localStorage.setItem('hotel_id', hotelId);
    } catch (error) {
      console.error('Error setting hotel context:', error);
    }
  }

  /**
   * Handle authentication errors
   */
  handleAuthError() {
    console.warn('Authentication error detected, redirecting to login...');
    this.removeAuthToken();
    
    // Redirect to login or trigger auth flow
    if (window.location.pathname !== '/login') {
      window.location.href = '/login';
    }
  }

  /**
   * Handle server errors
   * @param {Error} error - Server error
   */
  handleServerError(error) {
    console.error('Server error detected:', error);
    
    // You could show a toast notification here
    // or trigger a global error handler
  }

  /**
   * GET request
   * @param {string} url - Request URL
   * @param {Object} config - Axios config
   * @returns {Promise} Axios response
   */
  get(url, config = {}) {
    return this.client.get(url, config);
  }

  /**
   * POST request
   * @param {string} url - Request URL
   * @param {Object} data - Request data
   * @param {Object} config - Axios config
   * @returns {Promise} Axios response
   */
  post(url, data = {}, config = {}) {
    return this.client.post(url, data, config);
  }

  /**
   * PUT request
   * @param {string} url - Request URL
   * @param {Object} data - Request data
   * @param {Object} config - Axios config
   * @returns {Promise} Axios response
   */
  put(url, data = {}, config = {}) {
    return this.client.put(url, data, config);
  }

  /**
   * PATCH request
   * @param {string} url - Request URL
   * @param {Object} data - Request data
   * @param {Object} config - Axios config
   * @returns {Promise} Axios response
   */
  patch(url, data = {}, config = {}) {
    return this.client.patch(url, data, config);
  }

  /**
   * DELETE request
   * @param {string} url - Request URL
   * @param {Object} config - Axios config
   * @returns {Promise} Axios response
   */
  delete(url, config = {}) {
    return this.client.delete(url, config);
  }

  /**
   * Check if user is authenticated
   * @returns {boolean} Authentication status
   */
  isAuthenticated() {
    const token = this.getAuthToken();
    if (!token) return false;

    try {
      // Basic token validation (you could add JWT decode here)
      return token.length > 0;
    } catch (error) {
      console.error('Error validating token:', error);
      return false;
    }
  }

  /**
   * Login user and set authentication token
   * @param {string} username - Username
   * @param {string} password - Password
   * @param {string} [captchaToken] - Cloudflare Turnstile token (optional; omitted when empty)
   * @param {{code: string, challenge: string}} [otp] - emailed sign-in code for the second step
   * @returns {Promise<Object>} Login response, or {otpRequired, challenge, emailHint}
   */
  async login(username, password, captchaToken, otp) {
    try {
      const payload = { username, password };
      if (captchaToken) {
        payload.cf_turnstile_token = captchaToken;
      }
      // Elevated roles (manager and up) need an emailed one-time code once
      // every 24h. A previous verification left a signed trust token; send
      // it so the server can skip the code inside that window.
      try {
        const trust = localStorage.getItem('pos_otp_trust');
        if (trust) payload.otp_trust = trust;
      } catch (e) { /* storage unavailable — the server will just challenge */ }
      if (otp && otp.code) {
        payload.otp_code = otp.code;
        payload.otp_challenge = otp.challenge;
      }
      // A 401 here means a wrong password or code, not an expired session.
      const response = await this.post('/api/auth/token/', payload, { skipAuthRedirect: true });

      // 202: the password was right but a code was emailed — nothing is
      // stored, the caller shows the code form and calls login() again.
      if (response.status === 202 || response.data?.otp_required) {
        return {
          otpRequired: true,
          challenge: response.data.otp_challenge,
          emailHint: response.data.email_hint || '',
        };
      }

      const { access, refresh, user, otp_trust } = response.data;
      if (otp_trust) {
        try { localStorage.setItem('pos_otp_trust', otp_trust); } catch (e) { /* per-device nicety only */ }
      }

      if (access) {
        this.setAuthToken(access);
        
        // Set refresh token if provided
        if (refresh) {
          localStorage.setItem('refresh_token', refresh);
        }
        
        // Set hotel context from user profile
        if (user?.hotel?.id) {
          this.setHotelContext(user.hotel.id.toString());
        } else if (user?.user_profile?.hotel?.id) {
          this.setHotelContext(user.user_profile.hotel.id.toString());
        }
      }

      return response.data;
    } catch (error) {
      console.error('Login error:', error);
      throw error;
    }
  }

  /**
   * Logout user and clear tokens
   * @returns {Promise<void>}
   */
  async logout() {
    try {
      // Call logout endpoint if available (this might not exist in the backend)
      // Just attempt it but don't fail if it doesn't exist
      try {
        await this.post('/api/auth/logout/', {});
      } catch (logoutError) {
        // Ignore logout endpoint errors (404, 405, etc.) - not all backends have this
        if (logoutError.response?.status !== 404 && logoutError.response?.status !== 405) {
          console.warn('Logout endpoint error (non-critical):', logoutError.message);
        }
      }
    } catch (error) {
      console.error('Logout error:', error);
    } finally {
      // Always clear local tokens regardless of backend call
      this.removeAuthToken();
      localStorage.removeItem('refresh_token');
      localStorage.removeItem('hotel_id');
    }
  }

  /**
   * Get current user information
   * @returns {Promise<Object>} User data
   */
  async getCurrentUser() {
    try {
      const response = await this.get('/api/v1/users/current');
      return response.data;
    } catch (error) {
      console.error('Error fetching current user:', error);
      throw error;
    }
  }
}

// Export singleton instance
const apiClient = new ApiClient();
export default apiClient;