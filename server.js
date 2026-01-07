import express from 'express';
import { createServer } from 'http';
import { WebSocketServer } from 'ws';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';
import { existsSync, statSync, readdirSync, readFileSync } from 'fs';
import { homedir } from 'os';
import config from './src/config.js';
import PtyManager from './src/pty-manager.js';
import claudeUsage from './src/claude-usage.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

const app = express();
const server = createServer(app);
const wss = new WebSocketServer({ server });

const ptyManager = new PtyManager();

// Middleware
app.use(express.json());
app.use(express.static(join(__dirname, 'public')));

// API Routes

// List all instances
app.get('/api/instances', (req, res) => {
  res.json({ instances: ptyManager.list() });
});

// Get instance details
app.get('/api/instances/:id', (req, res) => {
  const instance = ptyManager.get(req.params.id);
  if (!instance) {
    return res.status(404).json({ error: 'Instance not found' });
  }
  res.json({
    id: instance.id,
    cwd: instance.cwd,
    status: instance.status,
    createdAt: instance.createdAt,
  });
});

// Create new instance
app.post('/api/instances', (req, res) => {
  const { cwd } = req.body;

  if (!cwd) {
    return res.status(400).json({ error: 'cwd is required' });
  }

  // Validate path
  if (!existsSync(cwd)) {
    return res.status(400).json({ error: 'Directory does not exist' });
  }

  const stats = statSync(cwd);
  if (!stats.isDirectory()) {
    return res.status(400).json({ error: 'Path is not a directory' });
  }

  try {
    const instance = ptyManager.create(cwd);
    res.status(201).json(instance);
  } catch (error) {
    if (error.message.includes('Maximum instances')) {
      return res.status(429).json({ error: error.message });
    }
    res.status(500).json({ error: error.message });
  }
});

// Delete instance
app.delete('/api/instances/:id', async (req, res) => {
  try {
    await ptyManager.close(req.params.id);
    res.json({ success: true });
  } catch (error) {
    if (error.message.includes('not found')) {
      return res.status(404).json({ error: error.message });
    }
    res.status(500).json({ error: error.message });
  }
});

// Scan for projects with CLAUDE.md
function scanProjects(rootDir, marker, maxDepth = 3) {
  const projects = [];

  function scan(dir, depth) {
    if (depth > maxDepth) return;

    try {
      const entries = readdirSync(dir, { withFileTypes: true });

      // Check if this directory has the marker file
      const hasMarker = entries.some(
        (e) => e.isFile() && e.name.toLowerCase() === marker.toLowerCase()
      );

      if (hasMarker) {
        const name = dir.split(/[/\\]/).pop();
        projects.push({ name, path: dir });
      }

      // Scan subdirectories
      for (const entry of entries) {
        if (entry.isDirectory() && !entry.name.startsWith('.') && entry.name !== 'node_modules') {
          scan(join(dir, entry.name), depth + 1);
        }
      }
    } catch (error) {
      // Ignore permission errors
    }
  }

  scan(rootDir, 0);
  return projects;
}

// List detected projects
app.get('/api/projects', (req, res) => {
  try {
    const projects = scanProjects(config.projectsRoot, config.projectMarker);
    res.json({ projects, root: config.projectsRoot });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// Get usage stats from Claude API
app.get('/api/usage', async (req, res) => {
  try {
    const usage = await claudeUsage.getUsage();
    res.json(usage);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// Get cookie status
app.get('/api/cookie/status', (req, res) => {
  res.json(claudeUsage.getCookieStatus());
});

// Set cookie
app.post('/api/cookie', (req, res) => {
  const { cookie } = req.body;
  if (!cookie || typeof cookie !== 'string') {
    return res.status(400).json({ error: 'Cookie string is required' });
  }
  claudeUsage.setCookie(cookie);
  res.json({ success: true, message: 'Cookie saved' });
});

// WebSocket handling
wss.on('connection', (ws, req) => {
  const url = new URL(req.url, `http://${req.headers.host}`);
  const pathParts = url.pathname.split('/');

  // Expected path: /terminal/:instanceId
  if (pathParts[1] !== 'terminal' || !pathParts[2]) {
    ws.close(4000, 'Invalid path');
    return;
  }

  const instanceId = pathParts[2];
  const instance = ptyManager.get(instanceId);

  if (!instance) {
    ws.close(4001, 'Instance not found');
    return;
  }

  // Send current output on connection
  const dataDisposable = ptyManager.onData(instanceId, (data) => {
    if (ws.readyState === ws.OPEN) {
      ws.send(JSON.stringify({ type: 'output', data }));
    }
  });

  // Handle exit events
  const exitListener = (event) => {
    if (ws.readyState === ws.OPEN) {
      ws.send(JSON.stringify(event));
    }
  };
  ptyManager.addListener(instanceId, exitListener);

  // Handle incoming messages
  ws.on('message', (message) => {
    try {
      const msg = JSON.parse(message.toString());

      // Check if instance still exists
      const currentInstance = ptyManager.get(instanceId);
      if (!currentInstance || currentInstance.status === 'exited') {
        return;
      }

      switch (msg.type) {
        case 'input':
          ptyManager.write(instanceId, msg.data);
          break;
        case 'resize':
          if (msg.cols && msg.rows) {
            ptyManager.resize(instanceId, msg.cols, msg.rows);
          }
          break;
        default:
          console.warn('Unknown message type:', msg.type);
      }
    } catch (error) {
      // Only log if not an "instance not found" error
      if (!error.message.includes('not found')) {
        console.error('Error processing message:', error);
        if (ws.readyState === ws.OPEN) {
          ws.send(JSON.stringify({ type: 'error', message: error.message }));
        }
      }
    }
  });

  // Cleanup on close
  ws.on('close', () => {
    dataDisposable.dispose();
    ptyManager.removeListener(instanceId, exitListener);
  });

  ws.on('error', (error) => {
    console.error('WebSocket error:', error);
  });
});

// Graceful shutdown
const shutdown = async () => {
  console.log('\nShutting down...');

  await ptyManager.closeAll();

  server.close(() => {
    console.log('Server closed');
    process.exit(0);
  });

  // Force exit after timeout
  setTimeout(() => {
    console.error('Forced shutdown');
    process.exit(1);
  }, config.gracefulShutdownTimeout + 1000);
};

process.on('SIGINT', shutdown);
process.on('SIGTERM', shutdown);

// Start server
server.listen(config.port, config.host, () => {
  console.log(`Claude Code UI running on http://${config.host}:${config.port}`);
});
