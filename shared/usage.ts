export const DAILY_LIMIT = 100;

/**
 * Endpoints logged to gemini_logs that are not Gemini calls, so they must not
 * count against the AI allowance. find-image is an Unsplash search; it is
 * recorded for visibility and for its own separate limit.
 */
export const NON_AI_ENDPOINTS = ['find-image'] as const;
