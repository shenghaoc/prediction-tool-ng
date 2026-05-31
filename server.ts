import { APP_BASE_HREF } from '@angular/common';
import { CommonEngine } from '@angular/ssr/node';
import express from 'express';
import { fileURLToPath } from 'node:url';
import { dirname, join, resolve } from 'node:path';
import bootstrap from './src/main.server';

// The Express app is exported so that it can be used by serverless Functions.
export function app(): express.Express {
  const server = express();

  // Security enhancements
  server.disable('x-powered-by');
  server.use((req, res, next) => {
    res.setHeader('X-Content-Type-Options', 'nosniff');
    res.setHeader('X-Frame-Options', 'DENY');
    next();
  });

  const serverDistFolder = dirname(fileURLToPath(import.meta.url));
  const browserDistFolder = resolve(serverDistFolder, '../browser');
  const indexHtml = join(serverDistFolder, 'index.server.html');

  const commonEngine = new CommonEngine();

  server.set('view engine', 'html');
  server.set('views', browserDistFolder);

  // Example Express Rest API endpoints
  // server.get('/api/**', (req, res) => { });
  // Serve static files from /browser
  server.get('*.*', express.static(browserDistFolder, {
    maxAge: '1y'
  }));

  // All regular routes use the Angular engine
  server.get('*', (req, res, next) => {
    const { protocol, originalUrl, baseUrl, headers } = req;

    commonEngine
      .render({
        bootstrap,
        documentFilePath: indexHtml,
        url: `${protocol}://${headers.host}${originalUrl}`,
        publicPath: browserDistFolder,
        providers: [{ provide: APP_BASE_HREF, useValue: baseUrl }],
      })
      .then((html) => res.send(html))
      .catch((err) => next(err));
  });

  // Security: Global error handler to prevent leaking stack traces
  // Must be after all other routes
  server.use((err: any, req: express.Request, res: express.Response, next: express.NextFunction) => {
    // Log the full error (including stack) server-side for debugging; only the
    // generic body below is ever sent to the client.
    console.error('Server error:', err);

    // If the response has already started (e.g. during streaming), defer to
    // the default Express error handler instead of throwing ERR_HTTP_HEADERS_SENT.
    if (res.headersSent) {
      return next(err);
    }

    // Preserve client-error statuses classified by Express/middleware
    // (e.g. malformed URLs surface as 400) instead of masking them as 500.
    const status = err.status ?? err.statusCode;
    const resolvedStatus =
      typeof status === 'number' && status >= 400 && status < 600 ? status : 500;
    // For 5xx keep the body generic to avoid leaking internals; for 4xx the
    // client error message is safe to surface (and 'Bad Request' would mislabel
    // 401/403/404 etc.).
    res
      .status(resolvedStatus)
      .send(resolvedStatus >= 500 ? 'Internal Server Error' : (err.message || 'Client Error'));
  });

  return server;
}

function run(): void {
  const port = process.env['PORT'] || 4000;

  // Start up the Node server
  const server = app();
  server.listen(port, () => {
    console.log(`Node Express server listening on http://localhost:${port}`);
  });
}

run();