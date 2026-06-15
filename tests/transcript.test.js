'use strict';

const test = require('node:test');
const assert = require('node:assert');
const fs = require('fs');
const os = require('os');
const path = require('path');

const { reconcile, parseTranscript } = require('../lib/transcript');

function writeTranscript(lines) {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'tab-tr-'));
  const p = path.join(dir, 'session.jsonl');
  fs.writeFileSync(p, lines.map((o) => JSON.stringify(o)).join('\n'));
  return p;
}

// Testing criterion 2: token fields reconcile with the session JSONL.
test('reconcile fills non-zero tokens and matches transcript totals', () => {
  const tp = writeTranscript([
    {
      type: 'assistant',
      message: {
        model: 'claude-sonnet-4-6',
        usage: { input_tokens: 100, output_tokens: 10, cache_creation_input_tokens: 0, cache_read_input_tokens: 50 },
        content: [{ type: 'tool_use', id: 't1', name: 'Read', input: {} }]
      }
    },
    { type: 'tool_result', tool_use_id: 't1', content: [{ type: 'text', text: 'x' }] },
    {
      type: 'assistant',
      message: {
        model: 'claude-sonnet-4-6',
        usage: { input_tokens: 200, output_tokens: 20, cache_creation_input_tokens: 5, cache_read_input_tokens: 80 },
        content: [{ type: 'tool_use', id: 't2', name: 'Bash', input: {} }]
      }
    },
    { type: 'tool_result', tool_use_id: 't2', content: [{ type: 'text', text: 'y' }] }
  ]);

  const events = [{ tool_use_id: 't1', tokens_in: null }, { tool_use_id: 't2', tokens_in: null }];
  const { events: enriched, totals } = reconcile(events, tp);

  assert.strictEqual(enriched[0].tokens_in, 100);
  assert.strictEqual(enriched[0].cache_read, 50);
  assert.strictEqual(enriched[0].model, 'claude-sonnet-4-6');
  assert.strictEqual(enriched[1].tokens_in, 205); // 200 input + 5 cache_creation
  assert.strictEqual(enriched[1].cache_read, 80);

  assert.ok(enriched.every((e) => e.tokens_in > 0));

  const sumIn = enriched.reduce((s, e) => s + e.tokens_in, 0);
  assert.strictEqual(sumIn, totals.tokens_in); // exact reconciliation (305)
  assert.strictEqual(totals.tokens_in, 305);
});

// Multiple tool calls in one assistant turn split that turn's usage so the
// per-event sum still reconciles with the transcript.
test('splits usage across tool calls sharing a turn', () => {
  const tp = writeTranscript([
    {
      type: 'assistant',
      message: {
        usage: { input_tokens: 100, output_tokens: 0, cache_read_input_tokens: 0 },
        content: [
          { type: 'tool_use', id: 'a', name: 'Read', input: {} },
          { type: 'tool_use', id: 'b', name: 'Read', input: {} }
        ]
      }
    }
  ]);
  const { events, totals } = reconcile([{ tool_use_id: 'a' }, { tool_use_id: 'b' }], tp);
  assert.strictEqual(events[0].tokens_in, 50);
  assert.strictEqual(events[1].tokens_in, 50);
  assert.strictEqual(totals.tokens_in, 100);
});

test('parseTranscript skips malformed lines and non-assistant messages', () => {
  const tp = writeTranscript([{ type: 'user', content: 'hi' }]);
  fs.appendFileSync(tp, '\nnot-json{\n');
  assert.deepStrictEqual(parseTranscript(tp), []);
});
