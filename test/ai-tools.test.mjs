import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { randomUUID } from 'node:crypto';

test('ferramentas da IA: total real nas listas e sem troca de cliente', async () => {
  const folder = await mkdtemp(join(tmpdir(), 'b2b-ai-tools-'));
  process.env.B2B_DB_PATH = join(folder, 'b2b.sqlite');
  const { migrate, pool, closeDatabase } = await import('../src/db.mjs');
  const { executeTool } = await import('../src/ai/tools.mjs');
  try {
    await migrate();
    const clientIds = [];
    for (let i = 1; i <= 8; i++) {
      const id = randomUUID(); clientIds.push(id);
      await pool.execute(
        "INSERT INTO clients (id, code, legal_name, trade_name, cnpj, segment, company_size, city, state) VALUES (?, ?, ?, ?, ?, 'Varejo', 'pequena', 'Curitiba', 'PR')",
        [id, `CLI-${String(i).padStart(4, '0')}`, `Estação ${i} Ltda.`, `Estação ${i}`, `00.000.000/000${i}-00`]
      );
    }
    for (let i = 1; i <= 7; i++) {
      await pool.execute(
        "INSERT INTO quote_requests (id, contact_name, company_name, email, phone, origin_country, product_summary, destination, matched_client_id) VALUES (?, 'Contato', ?, 'c@empresa.com.br', '0000', 'China', 'Peças', 'Curitiba/PR', ?)",
        [randomUUID(), i === 1 ? 'Estação 1 Ltda.' : `Prospect ${i} S.A.`, i === 1 ? clientIds[0] : null]
      );
    }
    const ctx = { userId: null, source: 'chat' };

    const clientes = await executeTool('buscar_clientes', {}, ctx);
    assert.equal(clientes.total_encontrado, 8);
    assert.equal(clientes.mostrando, 5);

    const cotacoes = await executeTool('listar_cotacoes', { limite: 3 }, ctx);
    assert.equal(cotacoes.total_encontrado, 7);
    assert.equal(cotacoes.mostrando, 3);
    const todas = await executeTool('listar_cotacoes', { limite: 30 }, ctx);
    assert.equal(todas.cotacoes.filter((q) => q.cliente_codigo === 'CLI-0001').length, 1);
    assert.equal(todas.cotacoes.filter((q) => q.cliente_codigo === 'não é cliente cadastrado').length, 6);
    const semResultado = await executeTool('listar_cotacoes', { status: 'closed' }, ctx);
    assert.equal(semResultado.total_encontrado, 0);
    assert.match(semResultado.aviso, /Existem 7 cotações no total/);

    const [[{ antes }]] = await pool.query('SELECT COUNT(*) AS antes FROM client_interactions');
    const naoExiste = await executeTool('registrar_interacao', { cliente: 'Prospect 3 S.A.', tipo: 'ligacao', resumo: 'teste' }, ctx);
    assert.match(naoExiste.error, /Não use outro cliente/);
    const ambiguo = await executeTool('registrar_interacao', { cliente: 'Estação', tipo: 'ligacao', resumo: 'teste' }, ctx);
    assert.match(ambiguo.error, /Não escolha por conta própria/);
    const [[{ depois }]] = await pool.query('SELECT COUNT(*) AS depois FROM client_interactions');
    assert.equal(depois, antes, 'nenhuma interação deve ser gravada quando o cliente não é identificado');

    const certo = await executeTool('registrar_interacao', { cliente: 'CLI-0002', tipo: 'ligacao', resumo: 'teste' }, ctx);
    assert.equal(certo.ok, true);
    assert.match(certo.action, /Estação 2/);
  } finally {
    await closeDatabase().catch(() => {});
    await rm(folder, { recursive: true, force: true });
  }
});
