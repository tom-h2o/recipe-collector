import { Hono } from 'hono';
import { cors } from 'hono/cors';
import { handle } from './_lib/vercelAdapter.js';

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

app.use('*', cors({
  origin: process.env.ALLOWED_ORIGIN || '*',
  credentials: true,
  allowMethods: ['GET', 'POST', 'DELETE', 'OPTIONS'],
  allowHeaders: ['Content-Type', 'Authorization'],
}));

app.on(['GET', 'DELETE'], '/account', account);
app.post('/extract', extract);
app.post('/find-image', findImage);
app.post('/nutrition', nutrition);
app.post('/scale', scale);
app.post('/share', share);
app.post('/shopping', shopping);
app.post('/suggest', suggest);
app.post('/tag', tag);
app.post('/translate', translate);

export default handle(app);
