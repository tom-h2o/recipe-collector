/**
 * What Sentry may collect, for the browser (src/lib/sentry.ts) and the server
 * (api/_lib/sentry.ts).
 *
 * SDK v11 turned the defaults around: with `dataCollection` unset it collects
 * user details, cookies, every request and response body, and AI prompts and
 * answers. Here a request body is a recipe, a photo or a pasted page, and an
 * AI prompt is the same text again, so every category is switched off unless
 * it says nothing about the person. What stays: the error, its stack trace
 * (with source lines, without local variables), the page or endpoint, and
 * query parameters, in which Sentry filters anything named like a secret.
 */
const IDENTIFYING_HEADERS = ['forwarded', '-ip', 'remote-', 'via', '-user'];

const NOTHING_PERSONAL = {
  userInfo: false,
  cookies: false,
  httpBodies: [],
  genAI: { inputs: false, outputs: false },
  mcp: { inputs: false, outputs: false },
  databaseQueryData: false,
  queues: false,
  graphQL: { document: false, variables: false },
  // Local variables of a failing function: on the server these include API
  // keys, the Shortcut key and recipe text.
  stackFrameVariables: false,
};

export const BROWSER_DATA_COLLECTION = {
  ...NOTHING_PERSONAL,
  httpHeaders: { request: { deny: IDENTIFYING_HEADERS }, response: { deny: IDENTIFYING_HEADERS } },
  urlQueryParams: { deny: IDENTIFYING_HEADERS },
};

/**
 * The server collects no headers at all: the Shortcut sends its key in
 * X-Speisekammer-Key, and a key that is not named like one is not filtered.
 * No query parameters either: the share preview reads the public share token
 * from one.
 */
export const SERVER_DATA_COLLECTION = {
  ...NOTHING_PERSONAL,
  httpHeaders: false,
  urlQueryParams: false,
};

/**
 * An address without its `#…` part. Supabase puts the sign-in itself there:
 * a magic link or a password reset lands on `/#access_token=…&refresh_token=…`,
 * and an error, breadcrumb or page-load span recorded on that page would
 * otherwise carry a working session to Sentry.
 */
export function withoutFragment(url: string): string {
  const at = url.indexOf('#');
  return at === -1 ? url : url.slice(0, at);
}

function scrubUrl(value: unknown): unknown {
  return typeof value === 'string' ? withoutFragment(value) : value;
}

interface EventLike {
  request?: { url?: string };
  breadcrumbs?: BreadcrumbLike[];
}

interface BreadcrumbLike {
  category?: string;
  data?: Record<string, unknown>;
}

interface SpanLike {
  name?: string;
  attributes?: Record<string, unknown>;
}

const URL_KEYS = ['url', 'from', 'to'];

/** beforeBreadcrumb: navigation (from/to) and fetch/xhr (url) breadcrumbs. */
export function scrubBreadcrumb<T extends BreadcrumbLike>(breadcrumb: T): T {
  if (breadcrumb.data) {
    for (const key of URL_KEYS) {
      if (key in breadcrumb.data) breadcrumb.data[key] = scrubUrl(breadcrumb.data[key]);
    }
  }
  return breadcrumb;
}

/** beforeSend: the page address of the event and of its breadcrumbs. */
export function scrubEvent<T extends EventLike>(event: T): T {
  if (event.request?.url) event.request.url = withoutFragment(event.request.url);
  event.breadcrumbs?.forEach(scrubBreadcrumb);
  return event;
}

/** beforeSendSpan: every `url.*` attribute, and the fragment one dropped. */
export function scrubSpan<T extends SpanLike>(span: T): T {
  if (typeof span.name === 'string') span.name = withoutFragment(span.name);
  const attributes = span.attributes;
  if (attributes) {
    delete attributes['url.fragment'];
    for (const key of Object.keys(attributes)) {
      if (key.startsWith('url.') || key === 'http.url') attributes[key] = scrubUrl(attributes[key]);
    }
  }
  return span;
}
