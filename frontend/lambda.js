const express = require('express');
const serverless = require('serverless-http');
const next = require('next');

const app = next({ dev: false, conf: { distDir: '.next' } });
const handle = app.getRequestHandler();

let handler;

async function bootstrap() {
  if (!handler) {
    await app.prepare();
    const server = express();
    server.all('*', (req, res) => handle(req, res));
    handler = serverless(server);
  }
  return handler;
}

exports.handler = async (event, context) => {
  const h = await bootstrap();
  return h(event, context);
};
