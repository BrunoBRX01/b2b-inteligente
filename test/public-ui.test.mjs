import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile, access } from 'node:fs/promises';
import { constants } from 'node:fs';

const read = (path) => readFile(new URL(`../${path}`, import.meta.url), 'utf8');
const exists = (path) => access(new URL(`../${path}`, import.meta.url), constants.F_OK);

test('página pública referencia CSS e JavaScript separados para o chatbot', async () => {
  const html = await read('public/index.html');
  assert.match(html, /href="\/assets\/site\.css"/);
  assert.match(html, /href="\/assets\/chatbot\.css"/);
  assert.match(html, /src="\/assets\/site\.js" defer/);
  assert.match(html, /src="\/assets\/chatbot\.js" defer/);
  await Promise.all([
    exists('public/assets/site.css'),
    exists('public/assets/chatbot.css'),
    exists('public/assets/site.js'),
    exists('public/assets/chatbot.js')
  ]);
});

test('páginas públicas e internas usam o logotipo SVG local', async () => {
  const files = [
    'public/index.html', 'public/login.html',
    'private/dashboard.html', 'private/requests.html', 'private/users.html'
  ];
  for (const file of files) {
    const html = await read(file);
    assert.match(html, /\/assets\/logo\.svg/);
    assert.doesNotMatch(html, /logo\.png/);
  }
  const logo = await read('public/assets/logo.svg');
  assert.match(logo, /<svg[\s>]/);
  assert.match(logo, /#173b55/i);
});

test('abertura do chatbot não foca automaticamente o campo de texto', async () => {
  const js = await read('public/assets/chatbot.js');
  const openPanel = js.match(/function openPanel\(\) \{([\s\S]*?)\n  \}/)?.[1];
  assert.ok(openPanel, 'função openPanel encontrada');
  assert.match(openPanel, /closeButton\?\.focus/);
  assert.doesNotMatch(openPanel, /input\.focus/);
});
