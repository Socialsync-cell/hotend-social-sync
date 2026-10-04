process.env.DEMO_MODE = 'true';
process.env.HOST = '127.0.0.1';
process.env.APP_URL = `http://localhost:${process.env.PORT || 3000}`;
await import('./server.js');
