import { fileURLToPath } from 'url';
import { dirname, join } from 'path';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

export default {
  port: 3080,
  host: 'localhost',
  maxInstances: 5,
  projectsRoot: 'E:\\Code',
  projectMarker: 'CLAUDE.md',
  templatesPath: 'E:\\Code\\.claude-templates',
  templatesRepo: 'https://github.com/affaan-m/everything-claude-code',
  skillsLibraryPath: join(__dirname, '..', 'skills-library'),
  pty: {
    shell: process.env.COMSPEC || 'cmd.exe',
    args: ['/c', 'claude'],
    env: process.env,
  },
  terminal: {
    defaultCols: 120,
    defaultRows: 30,
  },
  gracefulShutdownTimeout: 5000,
};
