// Popula o banco com dados FICTÍCIOS de demonstração: clientes, contatos,
// embarques, interações e solicitações de cotação.
//
//   node --env-file=.env scripts/seed-demo-data.mjs           (só roda com carteira vazia)
//   node --env-file=.env scripts/seed-demo-data.mjs --reset   (apaga e gera de novo)
//
// Todos os nomes, CNPJs, e-mails e telefones são inventados. Os e-mails usam
// domínios *.exemplo.com.br para não coincidir com empresas reais.
import { randomUUID } from 'node:crypto';
import { closeDatabase, migrate, pool } from '../src/db.mjs';

const CLIENTS = 160;
const MONTHS_OF_HISTORY = 18;
const reset = process.argv.includes('--reset');

// Gerador determinístico: a mesma semente gera sempre os mesmos dados.
let seed = 20261109;
const rand = () => { seed = (seed * 1664525 + 1013904223) >>> 0; return seed / 2 ** 32; };
const int = (min, max) => Math.floor(rand() * (max - min + 1)) + min;
const pick = (list) => list[Math.floor(rand() * list.length)];
const chance = (p) => rand() < p;
const money = (min, max) => Math.round((min + rand() * (max - min)) * 100) / 100;
const pad = (n, size) => String(n).padStart(size, '0');
const slug = (s) => s.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '');
const sqlDate = (d) => d.toISOString().slice(0, 19).replace('T', ' ');
const addDays = (d, n) => new Date(d.getTime() + n * 86400000);

const firstNames = ['Ana', 'Bruna', 'Carla', 'Daniela', 'Eduarda', 'Fernanda', 'Gabriela', 'Helena', 'Isabela', 'Juliana', 'Larissa', 'Mariana', 'Natália', 'Patrícia', 'Renata', 'Sabrina', 'Tatiane', 'Vanessa', 'Alexandre', 'Bernardo', 'Caio', 'Diego', 'Eduardo', 'Felipe', 'Gustavo', 'Henrique', 'Igor', 'João', 'Leonardo', 'Marcelo', 'Nicolas', 'Otávio', 'Paulo', 'Rafael', 'Rodrigo', 'Sérgio', 'Thiago', 'Vinícius', 'William', 'Lucas', 'Camila', 'Beatriz', 'Letícia', 'Marcos', 'André', 'Priscila', 'Fábio', 'Simone'];
const lastNames = ['Almeida', 'Barbosa', 'Cardoso', 'Carvalho', 'Castro', 'Costa', 'Dias', 'Fernandes', 'Ferreira', 'Gomes', 'Lima', 'Lopes', 'Martins', 'Melo', 'Mendes', 'Moreira', 'Nascimento', 'Oliveira', 'Pereira', 'Pinto', 'Ribeiro', 'Rocha', 'Rodrigues', 'Santos', 'Silva', 'Souza', 'Teixeira', 'Vieira', 'Azevedo', 'Campos', 'Freitas', 'Monteiro', 'Nunes', 'Ramos', 'Correia', 'Duarte'];
const namePrefixes = ['Norte', 'Sul', 'Horizonte', 'Aurora', 'Vale Verde', 'Ponto Certo', 'Estação', 'Delta', 'Atlântico', 'Serra Azul', 'Pioneira', 'Alvorada', 'Cruzeiro', 'Planalto', 'Litoral', 'Imperial', 'Primavera', 'Bandeirantes', 'Nova Era', 'Monte Alto', 'Rio Claro', 'Tropical', 'Continental', 'Brasil Sul', 'Ipê', 'Jequitibá', 'Araucária', 'Sertão', 'Marajó', 'Pantanal', 'Cerrado', 'Guanabara', 'Paraná', 'Tietê', 'Iguaçu', 'Vitória', 'Capital', 'Central', 'União', 'Real'];
const segments = [
  { name: 'Eletrônicos', suffix: ['Eletrônicos', 'Tech', 'Digital'], products: [['Componentes eletrônicos (placas e chips)', '8542.31.90'], ['Smartphones e acessórios', '8517.13.00'], ['Monitores LED', '8528.52.20'], ['Cabos e conectores', '8544.42.00']] },
  { name: 'Autopeças', suffix: ['Autopeças', 'Auto Parts', 'Motors'], products: [['Pastilhas de freio', '8708.30.90'], ['Rolamentos automotivos', '8482.10.10'], ['Faróis LED automotivos', '8512.20.11'], ['Filtros de óleo', '8421.23.00']] },
  { name: 'Têxtil e confecção', suffix: ['Têxtil', 'Confecções', 'Moda'], products: [['Tecidos de algodão', '5208.52.00'], ['Fios sintéticos', '5402.33.00'], ['Vestuário esportivo', '6211.33.00'], ['Botões e zíperes', '9607.11.00']] },
  { name: 'Alimentos e bebidas', suffix: ['Alimentos', 'Distribuidora', 'Foods'], products: [['Azeite de oliva extravirgem', '1509.20.00'], ['Vinhos tintos', '2204.21.00'], ['Bacalhau salgado', '0305.62.00'], ['Frutas secas', '0813.50.00']] },
  { name: 'Máquinas e equipamentos', suffix: ['Máquinas', 'Equipamentos', 'Industrial'], products: [['Tornos CNC', '8458.11.99'], ['Compressores de ar', '8414.80.12'], ['Empilhadeiras elétricas', '8427.10.19'], ['Bombas hidráulicas', '8413.60.19']] },
  { name: 'Químicos', suffix: ['Química', 'Químicos', 'Insumos'], products: [['Resinas plásticas PET', '3907.61.00'], ['Pigmentos inorgânicos', '3206.41.00'], ['Solventes industriais', '3814.00.00'], ['Adesivos industriais', '3506.91.90']] },
  { name: 'Cosméticos', suffix: ['Cosméticos', 'Beauty', 'Perfumaria'], products: [['Fragrâncias concentradas', '3302.90.19'], ['Embalagens para cosméticos', '3923.30.00'], ['Cremes dermatológicos', '3304.99.90']] },
  { name: 'Móveis e decoração', suffix: ['Móveis', 'Decor', 'Casa'], products: [['Cadeiras de escritório', '9401.30.90'], ['Luminárias decorativas', '9405.11.90'], ['Revestimentos cerâmicos', '6907.21.00']] },
  { name: 'Saúde e hospitalar', suffix: ['Hospitalar', 'Med', 'Saúde'], products: [['Luvas de nitrila', '4015.12.00'], ['Equipamentos de ultrassom', '9018.12.10'], ['Seringas descartáveis', '9018.31.19']] },
  { name: 'Agronegócio', suffix: ['Agro', 'Agrícola', 'Rural'], products: [['Fertilizantes NPK', '3105.20.00'], ['Peças para tratores', '8708.99.90'], ['Sementes de hortaliças', '1209.91.00']] },
  { name: 'Varejo', suffix: ['Comercial', 'Magazine', 'Atacado'], products: [['Utilidades domésticas', '7323.93.00'], ['Brinquedos', '9503.00.99'], ['Artigos de papelaria', '4820.10.00']] },
  { name: 'Construção civil', suffix: ['Construções', 'Materiais', 'Engenharia'], products: [['Porcelanato', '6907.22.00'], ['Ferramentas elétricas', '8467.29.99'], ['Tubos de aço', '7306.30.00']] }
];
const legalSuffixes = ['Ltda.', 'Ltda.', 'Ltda.', 'S.A.', 'Eireli', 'Comércio e Importação Ltda.'];
const cities = [
  ['São Paulo', 'SP', '01'], ['Campinas', 'SP', '13'], ['Santos', 'SP', '11'], ['Sorocaba', 'SP', '18'], ['Ribeirão Preto', 'SP', '14'],
  ['Rio de Janeiro', 'RJ', '20'], ['Niterói', 'RJ', '24'], ['Belo Horizonte', 'MG', '30'], ['Uberlândia', 'MG', '38'], ['Curitiba', 'PR', '80'],
  ['Londrina', 'PR', '86'], ['Joinville', 'SC', '89'], ['Itajaí', 'SC', '88'], ['Florianópolis', 'SC', '88'], ['Porto Alegre', 'RS', '90'],
  ['Caxias do Sul', 'RS', '95'], ['Goiânia', 'GO', '74'], ['Brasília', 'DF', '70'], ['Salvador', 'BA', '40'], ['Recife', 'PE', '50'],
  ['Fortaleza', 'CE', '60'], ['Manaus', 'AM', '69'], ['Vitória', 'ES', '29'], ['Belém', 'PA', '66'], ['Cuiabá', 'MT', '78']
];
const streets = ['Av. Paulista', 'Rua das Indústrias', 'Av. Brasil', 'Rua XV de Novembro', 'Av. das Nações', 'Rua do Comércio', 'Rod. Anhanguera, km', 'Av. Portuária', 'Rua dos Importadores', 'Av. Getúlio Vargas', 'Rua Sete de Setembro', 'Av. Industrial'];
const districts = ['Centro', 'Distrito Industrial', 'Jardim América', 'Vila Nova', 'Bela Vista', 'Zona Portuária', 'Parque Industrial', 'Boa Vista'];
const origins = [
  ['China', ['Xangai', 'Shenzhen', 'Ningbo', 'Qingdao'], 0.38], ['Estados Unidos', ['Miami', 'Houston', 'Los Angeles'], 0.12],
  ['Alemanha', ['Hamburgo', 'Bremerhaven'], 0.09], ['Itália', ['Gênova', 'La Spezia'], 0.07], ['Portugal', ['Lisboa', 'Leixões'], 0.05],
  ['Espanha', ['Valência', 'Barcelona'], 0.05], ['Japão', ['Yokohama', 'Kobe'], 0.04], ['Coreia do Sul', ['Busan'], 0.05],
  ['Índia', ['Nhava Sheva', 'Chennai'], 0.05], ['Vietnã', ['Ho Chi Minh', 'Haiphong'], 0.04], ['México', ['Manzanillo'], 0.03], ['Argentina', ['Buenos Aires'], 0.03]
];
const destPorts = [['Santos', 'SP'], ['Paranaguá', 'PR'], ['Itajaí', 'SC'], ['Rio de Janeiro', 'RJ'], ['Suape', 'PE'], ['Manaus', 'AM'], ['Rio Grande', 'RS'], ['Vitória', 'ES']];
const airports = ['Guarulhos (GRU)', 'Viracopos (VCP)', 'Galeão (GIG)', 'Confins (CNF)'];
const incoterms = ['FOB', 'FOB', 'FOB', 'CIF', 'CIF', 'EXW', 'FCA', 'DAP', 'CFR'];
const jobTitles = [['Gerente de Compras', 'Compras'], ['Comprador(a) Sênior', 'Compras'], ['Analista de Comércio Exterior', 'Comex'], ['Coordenador(a) de Logística', 'Logística'], ['Diretor(a) Financeiro(a)', 'Financeiro'], ['Analista Fiscal', 'Fiscal'], ['Diretor(a) Comercial', 'Comercial'], ['Sócio(a)-administrador(a)', 'Diretoria'], ['Supervisor(a) de Suprimentos', 'Suprimentos']];
const leadSources = ['Indicação de cliente', 'Site institucional', 'Chatbot do site', 'Feira de comércio exterior', 'LinkedIn', 'Prospecção ativa', 'Parceiro despachante'];
const interactionTemplates = {
  ligacao: ['Ligação para alinhar previsão de embarque.', 'Cliente ligou pedindo status da carga no porto.', 'Follow-up sobre cotação enviada.', 'Retorno sobre documentação pendente (BL e fatura).'],
  email: ['Envio de proposta comercial atualizada.', 'Enviado checklist de documentos para o desembaraço.', 'Confirmação de booking com o armador.', 'Envio do relatório mensal de embarques.'],
  reuniao: ['Reunião trimestral de resultados.', 'Reunião para planejamento de importações do próximo semestre.', 'Apresentação de nova rota marítima com menor transit time.'],
  visita: ['Visita técnica ao armazém do cliente.', 'Visita comercial com a diretoria.', 'Visita para negociação de contrato anual.'],
  whatsapp: ['Cliente pediu foto da carga no armazém.', 'Aviso de chegada do navio enviado.', 'Confirmação rápida de dados para emissão da DI.']
};

function cnpj(base) {
  const digits = String(base).padStart(8, '0').split('').map(Number).concat([0, 0, 0, 1]);
  const dv = (nums, weights) => { const r = nums.reduce((s, n, i) => s + n * weights[i], 0) % 11; return r < 2 ? 0 : 11 - r; };
  const d1 = dv(digits, [5, 4, 3, 2, 9, 8, 7, 6, 5, 4, 3, 2]);
  const d2 = dv([...digits, d1], [6, 5, 4, 3, 2, 9, 8, 7, 6, 5, 4, 3, 2]);
  const s = [...digits, d1, d2].join('');
  return `${s.slice(0, 2)}.${s.slice(2, 5)}.${s.slice(5, 8)}/${s.slice(8, 12)}-${s.slice(12)}`;
}
const phone = (ddd) => `(${ddd}) ${int(2, 3)}${pad(int(0, 999), 3)}-${pad(int(0, 9999), 4)}`;
const mobile = (ddd) => `(${ddd}) 9${pad(int(6000, 9999), 4)}-${pad(int(0, 9999), 4)}`;
const ddds = { SP: ['11', '19', '13', '15', '16'], RJ: ['21'], MG: ['31', '34'], PR: ['41', '43'], SC: ['47', '48'], RS: ['51', '54'], GO: ['62'], DF: ['61'], BA: ['71'], PE: ['81'], CE: ['85'], AM: ['92'], ES: ['27'], PA: ['91'], MT: ['65'] };
function weightedOrigin() {
  let r = rand(); for (const o of origins) { r -= o[2]; if (r <= 0) return o; } return origins[0];
}

try {
  await migrate();
  const [[{ count }]] = await pool.query('SELECT COUNT(*) AS count FROM clients');
  if (count > 0 && !reset) throw new Error(`Já existem ${count} clientes. Use --reset para apagar e gerar de novo.`);
  const [users] = await pool.query('SELECT id FROM users WHERE is_active = 1');
  const now = new Date();
  const connection = await pool.getConnection();
  const totals = { clients: 0, contacts: 0, shipments: 0, interactions: 0, quotes: 0 };
  try {
    await connection.beginTransaction();
    if (reset) {
      await connection.exec('DELETE FROM client_interactions; DELETE FROM shipments; DELETE FROM client_contacts; DELETE FROM clients;');
      await connection.execute("DELETE FROM quote_requests WHERE email LIKE '%.exemplo.com.br'");
    }
    const usedNames = new Set();
    let shipmentSeq = 10000;
    for (let i = 0; i < CLIENTS; i++) {
      const seg = pick(segments);
      let trade;
      do { trade = `${pick(namePrefixes)} ${pick(seg.suffix)}`; } while (usedNames.has(trade));
      usedNames.add(trade);
      const [city, uf, cepPrefix] = pick(cities);
      const ddd = pick(ddds[uf]);
      const size = pick(['micro', 'pequena', 'pequena', 'media', 'media', 'media', 'grande', 'grande']);
      const employees = { micro: int(3, 9), pequena: int(10, 49), media: int(50, 499), grande: int(500, 4500) }[size];
      const revenue = { micro: money(2e5, 3.6e5), pequena: money(3.6e5, 4.8e6), media: money(4.8e6, 3e8), grande: money(3e8, 2.5e9) }[size];
      const status = pick(['active', 'active', 'active', 'active', 'active', 'active', 'prospect', 'prospect', 'inactive', 'blocked']);
      const since = addDays(now, -int(60, 365 * 9));
      const domain = `${slug(trade)}.exemplo.com.br`;
      const clientId = randomUUID();
      const scale = { micro: 0.3, pequena: 0.7, media: 1.4, grande: 3 }[size];
      await connection.execute(
        `INSERT INTO clients (id, code, legal_name, trade_name, cnpj, state_registration, segment, company_size, employees,
          annual_revenue_brl, credit_limit_brl, payment_terms_days, street, number, district, city, state, zip_code, website,
          phone, email, account_manager_id, status, rating, nps_score, lead_source, notes, client_since)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
        [clientId, `CLI-${pad(i + 1, 4)}`, `${trade} ${pick(legalSuffixes)}`, trade, cnpj(10000000 + i * 7919),
          `${pad(int(100, 999), 3)}.${pad(int(0, 999), 3)}.${pad(int(0, 999), 3)}.${pad(int(0, 999), 3)}`,
          seg.name, size, employees, revenue, Math.round(revenue * money(0.01, 0.06) / 1000) * 1000, pick([15, 28, 30, 30, 45, 60, 90]),
          pick(streets), String(int(10, 4999)), pick(districts), city, uf, `${cepPrefix}${pad(int(0, 999), 3)}-${pad(int(0, 999), 3)}`,
          `https://www.${domain}`, phone(ddd), `contato@${domain}`, users.length ? pick(users).id : null, status,
          status === 'prospect' ? null : pick(['A', 'A', 'B', 'B', 'B', 'C', 'C', 'D']), status === 'prospect' ? null : int(3, 10),
          pick(leadSources), chance(0.35) ? pick(['Exige seguro internacional em todas as cargas.', 'Prefere comunicação por e-mail.', 'Sazonalidade forte no 2º semestre.', 'Possui habilitação RADAR ilimitada.', 'Negociar frete consolidado (LCL).', 'Cliente estratégico — prioridade no atendimento.']) : null,
          sqlDate(since).slice(0, 10)]
      );
      totals.clients++;

      const contactCount = int(1, 4);
      for (let c = 0; c < contactCount; c++) {
        const fn = pick(firstNames); const ln = `${pick(lastNames)}${chance(0.4) ? ' ' + pick(lastNames) : ''}`;
        const [title, dept] = pick(jobTitles);
        await connection.execute(
          `INSERT INTO client_contacts (id, client_id, full_name, job_title, department, email, phone, mobile, is_primary, birthday)
           VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
          [randomUUID(), clientId, `${fn} ${ln}`, title, dept, `${slug(fn)}.${slug(ln.split(' ')[0])}@${domain}`, phone(ddd), mobile(ddd), c === 0 ? 1 : 0,
            `${int(1965, 2000)}-${pad(int(1, 12), 2)}-${pad(int(1, 28), 2)}`]
        );
        totals.contacts++;
      }

      if (status !== 'prospect') {
        const monthly = { micro: 0.4, pequena: 0.9, media: 1.8, grande: 3.5 }[size] * money(0.5, 1.5);
        const historyStart = Math.max(since.getTime(), addDays(now, -MONTHS_OF_HISTORY * 30).getTime());
        const historyEnd = status === 'active' ? now.getTime() : addDays(now, -int(60, 200)).getTime();
        const n = Math.max(0, Math.round(monthly * (historyEnd - historyStart) / (30 * 86400000)));
        for (let s = 0; s < n; s++) {
          const ordered = new Date(historyStart + rand() * (historyEnd - historyStart));
          const [country, ports] = weightedOrigin();
          const mode = chance(0.72) ? 'maritimo' : chance(0.8) ? 'aereo' : 'rodoviario';
          const finalMode = mode === 'rodoviario' && !['Argentina'].includes(country) ? 'maritimo' : mode;
          const transit = finalMode === 'maritimo' ? int(28, 55) : finalMode === 'aereo' ? int(3, 9) : int(5, 12);
          const eta = addDays(ordered, transit + int(3, 10));
          const age = (now - ordered) / 86400000;
          let st; let delivered = null;
          if (chance(0.03)) st = 'cancelled';
          else if (eta < now) {
            if (age > transit + 25 || chance(0.88)) { st = 'delivered'; delivered = addDays(eta, chance(0.8) ? -int(0, 3) : int(1, 12)); if (delivered > now) delivered = now; }
            else st = 'delayed';
          } else st = age < 3 ? 'pending' : (eta - now) / 86400000 < 6 ? 'customs' : 'in_transit';
          const [product, ncm] = pick(seg.products);
          const goods = money(8000, 140000) * scale;
          const [dport, duf] = finalMode === 'aereo' ? [pick(airports), 'SP'] : pick(destPorts);
          await connection.execute(
            `INSERT INTO shipments (id, code, client_id, origin_country, origin_port, destination_port, destination_city, transport_mode,
              incoterm, product_description, ncm, weight_kg, volume_m3, containers, goods_value_usd, freight_brl, service_fee_brl,
              status, ordered_at, eta, delivered_at)
             VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
            [randomUUID(), `IMP-${ordered.getFullYear()}-${shipmentSeq++}`, clientId, country, finalMode === 'aereo' ? `Aeroporto de ${pick(ports)}` : pick(ports),
              dport, `${city}/${uf}`, finalMode, pick(incoterms), product, ncm,
              Math.round(finalMode === 'aereo' ? money(80, 2500) : money(2000, 26000) * scale), Math.round(money(2, 68) * 10) / 10,
              finalMode === 'maritimo' ? Math.max(1, Math.round(int(1, 4) * scale)) : 0, Math.round(goods * 100) / 100,
              Math.round(goods * money(0.06, 0.14) * 5.4 * (finalMode === 'aereo' ? 2.2 : 1)), Math.round(money(1800, 7500) * Math.sqrt(scale)),
              st, sqlDate(ordered), sqlDate(eta).slice(0, 10), delivered ? sqlDate(delivered) : null]
          );
          totals.shipments++;
        }
      }

      const nInteractions = status === 'prospect' ? int(1, 3) : int(2, 9);
      for (let k = 0; k < nInteractions; k++) {
        const kind = pick(Object.keys(interactionTemplates));
        await connection.execute(
          'INSERT INTO client_interactions (id, client_id, user_id, kind, summary, occurred_at) VALUES (?, ?, ?, ?, ?, ?)',
          [randomUUID(), clientId, users.length ? pick(users).id : null, kind, pick(interactionTemplates[kind]), sqlDate(addDays(now, -int(0, 360)))]
        );
        totals.interactions++;
      }
    }

    for (let q = 0; q < 70; q++) {
      const seg = pick(segments); const [product] = pick(seg.products); const [country] = weightedOrigin();
      const [city, uf] = pick(cities); const company = `${pick(namePrefixes)} ${pick(seg.suffix)} ${pick(['Ltda.', 'S.A.', 'ME'])}`;
      const fn = pick(firstNames); const ln = pick(lastNames); const age = int(0, 120);
      await connection.execute(
        `INSERT INTO quote_requests (id, contact_name, company_name, email, phone, origin_country, product_summary, estimated_volume,
          destination, details, status, submission_channel, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
        [randomUUID(), `${fn} ${ln}`, company, `${slug(fn)}.${slug(ln)}@${slug(company)}.exemplo.com.br`, mobile(pick(ddds[uf])), country, product,
          pick(['1 contêiner 20\'', '2 contêineres 40\'', 'Carga fracionada (LCL) ~8 m³', '500 kg aéreo', '4 contêineres 40\' HC por trimestre', '1,2 tonelada']),
          `${city}/${uf}`, chance(0.5) ? pick(['Primeira importação da empresa.', 'Precisamos de apoio com licença de importação.', 'Comparando propostas até o fim do mês.', 'Carga com urgência para reposição de estoque.']) : null,
          age < 7 ? pick(['new', 'new', 'reviewing']) : age < 30 ? pick(['reviewing', 'contacted', 'contacted', 'new']) : pick(['contacted', 'closed', 'closed']),
          chance(0.3) ? 'chatbot' : 'website_form', sqlDate(addDays(now, -age)), sqlDate(addDays(now, -Math.max(0, age - int(0, 5))))]
      );
      totals.quotes++;
    }
    await connection.commit();
  } catch (error) {
    await connection.rollback().catch(() => {});
    throw error;
  } finally { connection.release(); }
  console.log('Dados fictícios gerados:', totals);
} catch (error) {
  console.error(error.message);
  process.exitCode = 1;
} finally {
  await closeDatabase().catch(() => {});
}
