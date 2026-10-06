import axios from 'axios';

const API_BASE_URL = import.meta.env.VITE_API_BASE_URL || 'http://localhost:4000/api/v1';

/**
 * ============================================================================
 * AXIOS HTTP CLIENT & AUTOMATIC TOKEN REFRESH INTERCEPTOR
 * ============================================================================
 *
 * Architecture & Concurrency Handling:
 * ----------------------------------------------------------------------------
 * This module configures a centralized Axios instance with automated Authorization
 * header injection and transparent JWT token rotation upon receiving `401 Unauthorized`.
 *
 * Algorithmic Flow:
 * 1. REQUEST INTERCEPTOR:
 *    - Before every outgoing HTTP request, reads the latest access token from the
 *      in-memory getter (`tokenGetter()`).
 *    - Attaches `Authorization: Bearer <accessToken>` if present.
 *
 * 2. 401 RESPONSE INTERCEPTOR & CONCURRENCY QUEUE:
 *    - When an access token expires, multiple parallel requests (e.g. 5 API calls on page load)
 *      will simultaneously receive `401 Unauthorized`.
 *    - Naively calling `/auth/refresh` 5 times causes race conditions and premature token invalidation.
 *    - Solution:
 *      a) First 401 request sets `isRefreshing = true` and triggers a single call to `tokenRefresher()`.
 *      b) Subsequent 401 requests are pushed into `failedQueue` as pending Promises.
 *      c) Once the refresh call resolves with a new access token:
 *         - `processQueue()` resolves all queued Promises with the new token.
 *         - Each queued request updates its headers and replays automatically.
 *      d) If the refresh call fails (e.g. session expired/revoked):
 *         - `processQueue()` rejects all pending promises and clears auth state.
 *
 * 3. REFRESH LOOP PROTECTION:
 *    - Requests to `/auth/login`, `/auth/register`, and `/auth/refresh` never trigger
 *      the retry interceptor, preventing infinite recursion on invalid credentials.
 */

export const apiClient = axios.create({
  baseURL: API_BASE_URL,
  withCredentials: true, // Required to send & receive httpOnly refreshToken cookies
  headers: {
    'Content-Type': 'application/json',
  },
});

let tokenGetter: (() => string | null) | null = null;
let tokenRefresher: (() => Promise<string | null>) | null = null;

/**
 * Registers auth token accessors provided by React's `AuthContext`.
 * Keeps the pure Axios instance decoupled from React lifecycle hooks.
 *
 * @param getAccessToken      - Synchronous getter returning the active in-memory JWT access token
 * @param refreshAccessToken  - Asynchronous function that executes POST /auth/refresh
 */
export const setAuthTokenHandlers = (
  getAccessToken: () => string | null,
  refreshAccessToken: () => Promise<string | null>,
) => {
  tokenGetter = getAccessToken;
  tokenRefresher = refreshAccessToken;
};

// 1. Request interceptor: Attach Bearer token
apiClient.interceptors.request.use((config) => {
  if (tokenGetter) {
    const token = tokenGetter();
    if (token) {
      config.headers.Authorization = `Bearer ${token}`;
    }
  }
  return config;
});

let isRefreshing = false;
let failedQueue: Array<{
  resolve: (value?: unknown) => void;
  reject: (reason?: unknown) => void;
}> = [];

/**
 * Flush and drain the queued requests awaiting token refresh.
 */
const processQueue = (error: any, token: string | null = null) => {
  failedQueue.forEach((prom) => {
    if (error) {
      prom.reject(error);
    } else {
      prom.resolve(token);
    }
  });
  failedQueue = [];
};

// 2. Response interceptor: Automatic 401 recovery & token rotation
apiClient.interceptors.response.use(
  (response) => response,
  async (error) => {
    const originalRequest = error.config;

    // Filter out endpoints that should not trigger retry loops
    if (
      error.response?.status === 401 &&
      !originalRequest._retry &&
      !originalRequest.url?.includes('/auth/login') &&
      !originalRequest.url?.includes('/auth/register') &&
      !originalRequest.url?.includes('/auth/refresh')
    ) {
      // If a refresh is already in flight, queue this request until refresh completes
      if (isRefreshing) {
        return new Promise((resolve, reject) => {
          failedQueue.push({ resolve, reject });
        })
          .then((token) => {
            originalRequest.headers.Authorization = `Bearer ${token}`;
            return apiClient(originalRequest);
          })
          .catch((err) => Promise.reject(err));
      }

      originalRequest._retry = true;
      isRefreshing = true;

      try {
        if (tokenRefresher) {
          const newToken = await tokenRefresher();
          if (newToken) {
            processQueue(null, newToken);
            originalRequest.headers.Authorization = `Bearer ${newToken}`;
            return apiClient(originalRequest);
          }
        }
        processQueue(error, null);
        return Promise.reject(error);
      } catch (refreshErr) {
        processQueue(refreshErr, null);
        return Promise.reject(refreshErr);
      } finally {
        isRefreshing = false;
      }
    }

    return Promise.reject(error);
  },
);

