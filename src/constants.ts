export const API_BASE_URL = "https://api.productive.io/api/v2";
export const MAX_PAGE_SIZE = 200;
export const DEFAULT_PAGE_SIZE = 30;
export const CHARACTER_LIMIT = 25000;
export const MAX_RETRIES = 3;
export const RETRY_BASE_DELAY_MS = 1000;

/**
 * Timezone offset for time entries (e.g. "+01:00", "+02:00", "-05:00").
 * Set via PRODUCTIVE_TIMEZONE env var. Defaults to UTC ("Z").
 */
export const TIMEZONE_OFFSET = process.env.PRODUCTIVE_TIMEZONE || "Z";
