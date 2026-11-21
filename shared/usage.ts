export const DAILY_LIMIT = 100;

/**
 * Endpoints logged to gemini_logs that must not count against the AI
 * allowance. find-image is an Unsplash search, recorded for visibility and for
 * its own separate limit. health-check is the admin System tab's probes: real
 * Gemini calls, logged so they can be seen, but run on purpose to test the
 * service rather than to do work, so they cost none of the hundred.
 */
export const NON_AI_ENDPOINTS = ['find-image', 'health-check'] as const;
