export default {
  port: 3080,
  host: 'localhost',
  maxInstances: 5,
  projectsRoot: 'E:\\Code',
  projectMarker: 'CLAUDE.md',
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
