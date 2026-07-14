'use strict';

// Minimal OpenAI-compatible stub provider for the live integration tests.
// opencode talks to it like a real endpoint; every request body (including
// the tool schema opencode offers the model) is captured for assertions,
// and a per-test `route` function scripts what the "model" replies:
//   { text: "..." }                         -> plain assistant message
//   { tool: { name, args } }                -> a single tool call
// No real model, no API key, no network beyond loopback.

const http = require('node:http');

function sseWrite(res, payload) {
  res.write('data: ' + JSON.stringify(payload) + '\n\n');
}

function chunk(model, delta, finish = null) {
  return {
    id: 'chatcmpl-fake',
    object: 'chat.completion.chunk',
    created: 1,
    model,
    choices: [{ index: 0, delta, finish_reason: finish }],
  };
}

class FakeProvider {
  /** @param {(body: object, index: number) => {text?: string, tool?: {name: string, args: object}}} route */
  constructor(route) {
    this.route = route;
    this.requests = [];
    this.server = http.createServer((req, res) => this.#handle(req, res));
  }

  /** Starts listening on an ephemeral loopback port; resolves with the baseURL. */
  start() {
    return new Promise((resolve) => {
      this.server.listen(0, '127.0.0.1', () => {
        resolve(`http://127.0.0.1:${this.server.address().port}/v1`);
      });
    });
  }

  stop() {
    return new Promise((resolve) => this.server.close(resolve));
  }

  #handle(req, res) {
    let raw = '';
    req.on('data', (c) => (raw += c));
    req.on('end', () => {
      if (!req.url.includes('/chat/completions')) {
        res.writeHead(404, { 'Content-Type': 'application/json' });
        res.end('{}');
        return;
      }
      let body = {};
      try {
        body = JSON.parse(raw);
      } catch {}
      this.requests.push(body);
      const reply = this.route(body, this.requests.length - 1) || { text: 'ok' };
      if (body.stream) {
        this.#streamReply(res, body.model, reply);
      } else {
        this.#jsonReply(res, body.model, reply);
      }
    });
  }

  #streamReply(res, model, reply) {
    res.writeHead(200, { 'Content-Type': 'text/event-stream', 'Cache-Control': 'no-cache' });
    if (reply.tool) {
      sseWrite(
        res,
        chunk(model, {
          role: 'assistant',
          tool_calls: [
            {
              index: 0,
              id: 'call_fake_1',
              type: 'function',
              function: { name: reply.tool.name, arguments: JSON.stringify(reply.tool.args) },
            },
          ],
        })
      );
      sseWrite(res, chunk(model, {}, 'tool_calls'));
    } else {
      sseWrite(res, chunk(model, { role: 'assistant', content: reply.text }));
      sseWrite(res, chunk(model, {}, 'stop'));
    }
    res.write('data: [DONE]\n\n');
    res.end();
  }

  #jsonReply(res, model, reply) {
    const message = reply.tool
      ? {
          role: 'assistant',
          content: null,
          tool_calls: [
            {
              id: 'call_fake_1',
              type: 'function',
              function: { name: reply.tool.name, arguments: JSON.stringify(reply.tool.args) },
            },
          ],
        }
      : { role: 'assistant', content: reply.text };
    res.writeHead(200, { 'Content-Type': 'application/json' });
    res.end(
      JSON.stringify({
        id: 'chatcmpl-fake',
        object: 'chat.completion',
        created: 1,
        model,
        choices: [{ index: 0, message, finish_reason: reply.tool ? 'tool_calls' : 'stop' }],
        usage: { prompt_tokens: 1, completion_tokens: 1, total_tokens: 2 },
      })
    );
  }
}

/** Tool names offered to the model in a captured request, or null for
    requests that carry no tool schema (e.g. title generation). */
function toolNames(body) {
  if (!Array.isArray(body.tools)) return null;
  return body.tools.map((t) => (t.function && t.function.name) || t.name).sort();
}

/** Concatenated system-message text of a captured request. */
function systemText(body) {
  return (body.messages || [])
    .filter((m) => m.role === 'system')
    .map((m) => (typeof m.content === 'string' ? m.content : JSON.stringify(m.content)))
    .join('\n');
}

/** All tool-result messages of a captured request. */
function toolResults(body) {
  return (body.messages || []).filter((m) => m.role === 'tool');
}

module.exports = { FakeProvider, toolNames, systemText, toolResults };
