/**
 * Cloudflare Worker — proxy sftg.in → safe-tag.onrender.com
 *
 * Deploy this to a Worker and set the route: sftg.in/*
 * Also add: *.sftg.in/* if you want www to work too.
 */

const ORIGIN = 'https://safe-tag.onrender.com';

export default {
  async fetch(request) {
    const url = new URL(request.url);

    // Rewrite to Render origin, keep path + query string
    url.hostname = 'safe-tag.onrender.com';
    url.protocol = 'https:';

    const proxied = new Request(url.toString(), {
      method:  request.method,
      headers: request.headers,
      body:    ['GET', 'HEAD'].includes(request.method) ? undefined : request.body,
      redirect: 'manual',   // handle redirects ourselves so we can rewrite Location
    });

    const response = await fetch(proxied);

    // Rewrite Location header in redirects so browser stays on sftg.in
    if (response.status >= 300 && response.status < 400) {
      const loc = response.headers.get('Location');
      if (loc) {
        const headers = new Headers(response.headers);
        headers.set('Location',
          loc
            .replace('https://safe-tag.onrender.com', 'https://sftg.in')
            .replace('http://safe-tag.onrender.com',  'https://sftg.in')
        );
        return new Response(response.body, { status: response.status, headers });
      }
    }

    return response;
  },
};
