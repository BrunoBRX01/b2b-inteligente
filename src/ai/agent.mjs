/**
 * Assistente operacional do painel: conversa com o funcionário, consulta o
 * banco e executa alterações diretamente, informando depois o que fez.
 */
import { chat } from './ollama.mjs';
import { executeTool, toolDefinitions, WRITE_TOOLS } from './tools.mjs';

const MAX_ROUNDS = 6;

const SYSTEM_PROMPT = [
  'Você é a IA operacional da B2B Inteligente, empresa de logística internacional de importação. Fale em português do Brasil, de forma direta.',
  'Use as ferramentas para buscar dados no banco. Nunca invente clientes, valores, códigos ou datas.',
  'Quando pedirem uma alteração, execute com a ferramenta certa sem pedir confirmação. Se o pedido tiver VÁRIAS ações (ex.: registrar ligação E escrever e-mail), chame TODAS as ferramentas necessárias antes de responder.',
  'Depois de agir, diga em 1-3 frases o que foi feito. E-mails ficam na caixa de saída da Central da IA para revisão (não diga que foram enviados).',
  'Se faltar informação essencial, pergunte. Se uma ferramenta der erro, explique.',
  'Respostas CURTAS: no máximo 8 linhas; em listas, mostre no máximo 5 itens e informe o total. Valores em R$ no formato brasileiro.',
  'Os dados são fictícios, para testes.'
].join('\n');

function userContext(user) {
  const today = new Date().toLocaleDateString('pt-BR', { dateStyle: 'full', timeZone: 'America/Sao_Paulo' });
  return `[Contexto: hoje é ${today}. Quem pergunta: ${user.full_name}, ${user.role === 'admin' ? 'administrador' : 'funcionário'}.]`;
}

/**
 * history: [{ role: 'user'|'assistant', content }]
 * Retorna { answer, actions: [texto], toolsUsed: [nome] }
 */
export async function runAgent(history, user, { source = 'chat' } = {}) {
  const ctx = { userId: user.id, source };
  const recent = history.slice(-10);
  const last = recent.at(-1);
  const messages = [{ role: 'system', content: SYSTEM_PROMPT }, ...recent.slice(0, -1), { role: 'user', content: `${userContext(user)}\n${last.content}` }];
  const actions = []; const toolsUsed = [];
  for (let round = 0; round < MAX_ROUNDS; round++) {
    const reply = await chat(messages, { tools: toolDefinitions, maxTokens: 450 });
    if (!reply.toolCalls.length) {
      return { answer: reply.content || 'Não consegui formular uma resposta.', actions, toolsUsed };
    }
    messages.push({ role: 'assistant', content: reply.content || '', tool_calls: reply.toolCalls.map((c) => ({ function: { name: c.name, arguments: c.arguments } })) });
    for (const call of reply.toolCalls) {
      const result = await executeTool(call.name, call.arguments, ctx);
      toolsUsed.push(call.name);
      if (WRITE_TOOLS.has(call.name) && result?.ok) actions.push(result.action);
      messages.push({ role: 'tool', content: JSON.stringify(result).slice(0, 3500), tool_name: call.name });
    }
  }
  const final = await chat([...messages, { role: 'user', content: 'Resuma agora para o funcionário o que você encontrou e o que foi feito.' }], { maxTokens: 500 });
  return { answer: final.content, actions, toolsUsed };
}
