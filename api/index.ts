import { Hono } from 'hono';
import { handle } from 'hono/vercel';
import { adaptHandler } from './_lib/honoAdapter.js';

// Import handlers from the private endpoints folder
import account from './_endpoints/account.js';
import extract from './_endpoints/extract.js';
import findImage from './_endpoints/find-image.js';
import nutrition from './_endpoints/nutrition.js';
import scale from './_endpoints/scale.js';
import share from './_endpoints/share.js';
import shopping from './_endpoints/shopping.js';
import suggest from './_endpoints/suggest.js';
import tag from './_endpoints/tag.js';
import translate from './_endpoints/translate.js';

const app = new Hono().basePath('/api');

// Map all routes to their adapted handlers (supporting both POST and OPTIONS)
app.all('/account', adaptHandler(account));
app.all('/extract', adaptHandler(extract));
app.all('/find-image', adaptHandler(findImage));
app.all('/nutrition', adaptHandler(nutrition));
app.all('/scale', adaptHandler(scale));
app.all('/share', adaptHandler(share));
app.all('/shopping', adaptHandler(shopping));
app.all('/suggest', adaptHandler(suggest));
app.all('/tag', adaptHandler(tag));
app.all('/translate', adaptHandler(translate));

// Export Vercel handler
export default handle(app);
