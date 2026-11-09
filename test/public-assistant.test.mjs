import test from 'node:test';
import assert from 'node:assert/strict';
import { answerPublicAssistant, getCuratedPublicAnswer } from '../src/public-assistant.mjs';

test('responde quais informações são necessárias para iniciar uma importação', () => {
  const answer = getCuratedPublicAnswer('Quais informações preciso para importar um produto?');
  assert.match(answer, /país de origem/i);
  assert.match(answer, /destino no Brasil/i);
  assert.match(answer, /volume aproximado/i);
});

test('orienta como iniciar uma solicitação de cotação sem prometer cotação final', () => {
  const answer = getCuratedPublicAnswer('Como faço para solicitar uma cotação?');
  assert.match(answer, /Solicitar cotação/i);
  assert.match(answer, /não é uma cotação comercial final/i);
});

test('informa que não existe rastreamento ou consulta pública nesta fase', () => {
  const answer = getCuratedPublicAnswer('Como acompanho minha solicitação?');
  assert.match(answer, /não oferece login de cliente/i);
  assert.match(answer, /rastreamento online/i);
});

test('não inventa resposta determinística para assunto fora da base aprovada', () => {
  assert.equal(getCuratedPublicAnswer('Qual é o horário de funcionamento do escritório?'), null);
});

test('não informa preço ou prazo sem cotação da equipe', () => {
  const answer = getCuratedPublicAnswer('Quanto custa o frete e qual o prazo?');
  assert.match(answer, /não publica preços ou prazos/i);
  assert.match(answer, /não calcula valores/i);
});

test('usa fallback seguro para perguntas abertas quando a IA não está configurada', async () => {
  const previousProvider = process.env.AI_PROVIDER;
  process.env.AI_PROVIDER = 'off';
  try {
    const result = await answerPublicAssistant([{ role: 'user', content: 'Qual é o horário de funcionamento do escritório?' }]);
    assert.equal(result.mode, 'fallback');
    assert.match(result.answer, /não tenho informação confirmada/i);
  } finally {
    if (previousProvider === undefined) delete process.env.AI_PROVIDER; else process.env.AI_PROVIDER = previousProvider;
  }
});
