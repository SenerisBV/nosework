// Main exports for nosework analytics package

// Tracking functions
export { trackPageView, trackEvent } from "./track.js";

// Error tracking functions
export {
  trackError,
  getErrorStats,
  getErrorGroups,
  getErrorInstances,
  updateErrorGroupStatus,
  deleteOldErrors,
} from "./error.js";

// Query functions
export {
  getStats,
  getTopPages,
  getLocations,
  getReferrers,
  getDevices,
  getTimeSeries,
  // Session analytics
  getSessionStats,
  getEntryPages,
  getExitPages,
  getPageFlows,
  getSessions,
} from "./query.js";

// Site enumeration
export { listSites } from "./sites.js";
export type { SiteSummary } from "./sites.js";

// Retention
export { deleteOldPageViews } from "./retention.js";

// Schema exports (for advanced use cases)
export * from "./schema.js";

// Client utilities
export { getClient, disconnect } from "./client.js";

// Utility functions
export { isBot, cleanupOldSalts } from "./utils.js";

// User-Agent parsing (for advanced use cases)
export { parseUserAgent } from "./ua.js";

// Types
export type {
  TrackPageViewOptions,
  TrackEventOptions,
  DateRange,
  QueryOptions,
  PaginatedQueryOptions,
  Stats,
  TopPage,
  LocationData,
  ReferrerData,
  DeviceData,
  GeoLocation,
  ParsedUserAgent,
  VisitorInfo,
  // Session analytics types
  SessionStats,
  SessionData,
  EntryExitPage,
  PageFlow,
  // Error tracking types
  TrackErrorOptions,
  ErrorStats,
  ErrorGroupStatus,
  ErrorGroupData,
  ErrorInstance,
} from "./types.js";

// Re-export TimeSeriesDataPoint from query
export type { TimeSeriesDataPoint } from "./query.js";
