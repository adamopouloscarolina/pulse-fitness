// Vite dev server config + tiny in-memory /api/health-steps endpoint.
//
// The Apple Shortcut on the iPhone POSTs today's step count here:
//   POST /api/health-steps   body: { "steps": 8432 }
// Pulse polls GET /api/health-steps to display the latest value.
//
// In-memory only — restart the dev server and it's gone. For real
// production this becomes a Vercel/Cloudflare function with KV storage.

let lastSync = { steps: null, syncedAt: null };

function stepsApiPlugin() {
  return {
    name: 'pulse-steps-api',
    configureServer(server) {
      server.middlewares.use('/api/health-steps', (req, res, next) => {
        // CORS so the iPhone Shortcut (different origin) can post.
        res.setHeader('Access-Control-Allow-Origin', '*');
        res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
        res.setHeader('Access-Control-Allow-Headers', 'Content-Type');

        if (req.method === 'OPTIONS') { res.statusCode = 204; res.end(); return; }

        if (req.method === 'GET') {
          res.setHeader('Content-Type', 'application/json');
          res.end(JSON.stringify(lastSync));
          return;
        }

        if (req.method === 'POST') {
          let body = '';
          req.on('data', c => (body += c));
          req.on('end', () => {
            try {
              const parsed = JSON.parse(body || '{}');
              const steps = Number(parsed.steps);
              if (!Number.isFinite(steps) || steps < 0) throw new Error('invalid steps');
              lastSync = { steps: Math.floor(steps), syncedAt: Date.now() };
              res.setHeader('Content-Type', 'application/json');
              res.statusCode = 200;
              res.end(JSON.stringify({ ok: true, ...lastSync }));
            } catch (e) {
              res.statusCode = 400;
              res.end(JSON.stringify({ ok: false, error: e.message }));
            }
          });
          return;
        }

        next();
      });
    },
  };
}

export default {
  plugins: [stepsApiPlugin()],
  server: {
    host: true,  // expose on the LAN so the iPhone can reach us
    port: 5173,
  },
};
