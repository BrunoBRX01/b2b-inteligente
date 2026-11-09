/**
 * Cliente mínimo do Ollama (IA local). As chamadas são enfileiradas: o modelo
 * roda na CPU e atender uma requisição por vez é mais rápido do que várias juntas.
 */
import { spawn } from 'node:child_process';
import { existsSync } from 'node:fs';
import { homedir } from 'node:os';
import { join } from 'node:path';

const baseUrl = () => (process.env.OLLAMA_URL || 'http://127.0.0.1:11434').replace(/\/$/, '');
export const aiModel = () => process.env.AI_MODEL || 'qwen2.5:7b';
export const aiEnabled = () => (process.env.AI_PROVIDER || 'ollama') === 'ollama';

let queue = Promise.resolve();
function enqueue(job) {
  const run = queue.then(job, job);
  queue = run.catch(() => {});
  return run;
}

export async function aiAvailable() {
  if (!aiEnabled()) return false;
  try {
    const response = await fetch(`${baseUrl()}/api/tags`, { signal: AbortSignal.timeout(2500) });
    if (!response.ok) return false;
    const { models = [] } = await response.json();
    return models.some((m) => m.name === aiModel() || m.model === aiModel());
  } catch { return false; }
}

/**
 * Envia mensagens ao modelo. Retorna { content, toolCalls }.
 * `tools` segue o formato de function calling do Ollama/OpenAI.
 */
export function chat(messages, { tools, temperature = 0.2, maxTokens = 700, timeoutMs = 240000, json = false } = {}) {
  return enqueue(async () => {
    const response = await fetch(`${baseUrl()}/api/chat`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        model: aiModel(),
        messages,
        tools: tools?.length ? tools : undefined,
        stream: false,
        format: json ? 'json' : undefined,
        keep_alive: '30m',
        options: { temperature, num_predict: maxTokens, num_ctx: 8192 }
      }),
      signal: AbortSignal.timeout(timeoutMs)
    });
    const payload = await response.json().catch(() => ({}));
    if (!response.ok || payload.error) throw new Error(`IA local indisponível: ${payload.error || `HTTP ${response.status}`}`);
    return {
      content: String(payload.message?.content || '').trim(),
      toolCalls: (payload.message?.tool_calls || []).map((c) => ({
        name: c.function?.name,
        arguments: typeof c.function?.arguments === 'string' ? safeJson(c.function.arguments) : (c.function?.arguments || {})
      }))
    };
  });
}

function safeJson(text) { try { return JSON.parse(text); } catch { return {}; } }

/** Se o Ollama não estiver rodando, tenta iniciá-lo em segundo plano. */
export async function ensureOllama() {
  if (!aiEnabled()) return false;
  const ping = async () => { try { return (await fetch(`${baseUrl()}/api/version`, { signal: AbortSignal.timeout(1500) })).ok; } catch { return false; } };
  if (await ping()) return true;
  const candidates = [process.env.OLLAMA_BIN, join(homedir(), '.local', 'bin', 'ollama'), join(homedir(), 'AppData', 'Local', 'Programs', 'Ollama', 'ollama.exe'), 'ollama'].filter(Boolean);
  const bin = candidates.find((c) => c === 'ollama' || existsSync(c));
  try {
    const host = new URL(baseUrl()).host;
    const child = spawn(bin, ['serve'], { detached: true, stdio: 'ignore', env: { ...process.env, OLLAMA_HOST: host }, windowsHide: true });
    child.on('error', () => {});
    child.unref();
  } catch { return false; }
  for (let i = 0; i < 20; i++) { await new Promise((r) => setTimeout(r, 500)); if (await ping()) { console.log('Ollama iniciado automaticamente.'); return true; } }
  console.warn('Não foi possível iniciar o Ollama. A IA ficará offline até ele ser iniciado.');
  return false;
}
