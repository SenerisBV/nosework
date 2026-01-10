/**
 * Client-side error capture for nosework
 *
 * This is a lightweight (~2KB) script that captures unhandled errors
 * and sends them to your tracking endpoint.
 *
 * Usage:
 * ```typescript
 * import { initErrorTracking } from '@seneris/nosework/client/errors'
 *
 * initErrorTracking({
 *   endpoint: '/api/analytics/error',
 *   siteId: process.env.NEXT_PUBLIC_ANALYTICS_SITE_ID!,
 * })
 * ```
 */

export interface ErrorTrackingConfig {
  /** The endpoint to send errors to (e.g., '/api/analytics/error') */
  endpoint: string;
  /** Your site ID for analytics */
  siteId: string;
  /** Optional: custom metadata to include with every error */
  metadata?: Record<string, unknown>;
  /** Optional: function to filter errors (return false to skip) */
  filter?: (error: CapturedError) => boolean;
  /** Optional: max errors to send per minute (default: 10) */
  rateLimit?: number;
}

export interface CapturedError {
  message: string;
  stack?: string;
  url: string;
  type: "error" | "unhandledrejection";
}

interface ErrorPayload {
  siteId: string;
  message: string;
  stack?: string;
  url: string;
  metadata?: Record<string, unknown>;
}

let config: ErrorTrackingConfig | null = null;
let errorCount = 0;
let lastResetTime = Date.now();

/**
 * Reset rate limiter every minute
 */
function checkRateLimit(): boolean {
  const now = Date.now();
  if (now - lastResetTime > 60000) {
    errorCount = 0;
    lastResetTime = now;
  }

  const limit = config?.rateLimit ?? 10;
  if (errorCount >= limit) {
    return false;
  }

  errorCount++;
  return true;
}

/**
 * Send error to the tracking endpoint
 */
async function sendError(payload: ErrorPayload): Promise<void> {
  if (!config) return;

  try {
    await fetch(config.endpoint, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload),
      // Don't wait for response, fire and forget
      keepalive: true,
    });
  } catch {
    // Silently fail - we don't want error tracking to cause more errors
  }
}

/**
 * Process and send an error
 */
function handleError(captured: CapturedError): void {
  if (!config) return;

  // Apply filter if provided
  if (config.filter && !config.filter(captured)) {
    return;
  }

  // Check rate limit
  if (!checkRateLimit()) {
    return;
  }

  const payload: ErrorPayload = {
    siteId: config.siteId,
    message: captured.message,
    stack: captured.stack,
    url: captured.url,
    metadata: {
      ...config.metadata,
      errorType: captured.type,
    },
  };

  sendError(payload);
}

/**
 * Handler for window.onerror events
 */
function errorHandler(event: ErrorEvent): void {
  handleError({
    message: event.message || "Unknown error",
    stack: event.error?.stack,
    url: window.location.href,
    type: "error",
  });
}

/**
 * Handler for unhandled promise rejections
 */
function rejectionHandler(event: PromiseRejectionEvent): void {
  let message = "Unhandled promise rejection";
  let stack: string | undefined;

  if (event.reason instanceof Error) {
    message = event.reason.message;
    stack = event.reason.stack;
  } else if (typeof event.reason === "string") {
    message = event.reason;
  } else if (event.reason && typeof event.reason === "object") {
    message = JSON.stringify(event.reason);
  }

  handleError({
    message,
    stack,
    url: window.location.href,
    type: "unhandledrejection",
  });
}

/**
 * Initialize error tracking
 * Call this once when your app starts
 */
export function initErrorTracking(options: ErrorTrackingConfig): void {
  if (typeof window === "undefined") {
    // SSR - do nothing
    return;
  }

  config = options;

  // Add event listeners
  window.addEventListener("error", errorHandler);
  window.addEventListener("unhandledrejection", rejectionHandler);
}

/**
 * Stop error tracking and remove event listeners
 */
export function stopErrorTracking(): void {
  if (typeof window === "undefined") return;

  window.removeEventListener("error", errorHandler);
  window.removeEventListener("unhandledrejection", rejectionHandler);
  config = null;
}

/**
 * Manually track an error
 * Useful for caught exceptions you still want to track
 */
export function captureError(
  error: Error | string,
  metadata?: Record<string, unknown>
): void {
  if (!config) return;

  const captured: CapturedError = {
    message: typeof error === "string" ? error : error.message,
    stack: typeof error === "string" ? undefined : error.stack,
    url: typeof window !== "undefined" ? window.location.href : "",
    type: "error",
  };

  // Apply filter
  if (config.filter && !config.filter(captured)) {
    return;
  }

  // Check rate limit
  if (!checkRateLimit()) {
    return;
  }

  const payload: ErrorPayload = {
    siteId: config.siteId,
    message: captured.message,
    stack: captured.stack,
    url: captured.url,
    metadata: {
      ...config.metadata,
      ...metadata,
      errorType: "manual",
    },
  };

  sendError(payload);
}
