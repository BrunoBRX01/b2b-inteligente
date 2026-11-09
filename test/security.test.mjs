import test from 'node:test';
import assert from 'node:assert/strict';
import { hashPassword, verifyPassword, normalizeEmail, validEmail, validCorporateEmail, opaqueToken, tokenDigest, parseCookies, validCsrf } from '../src/security.mjs';

test('e-mail é normalizado e validado', () => {
  assert.equal(normalizeEmail('  Ana.Silva@Empresa.com  '), 'ana.silva@empresa.com');
  assert.equal(validEmail('ana.silva@empresa.com'), true);
  assert.equal(validEmail('sem-dominio'), false);
  assert.equal(validEmail('a'.repeat(250) + '@b.com'), false);
});

test('domínios corporativos são opcionais e comparados exatamente quando configurados', () => {
  const original = process.env.ALLOWED_EMAIL_DOMAINS;
  try {
    delete process.env.ALLOWED_EMAIL_DOMAINS;
    assert.equal(validCorporateEmail('ana@empresa.com.br'), true);
    process.env.ALLOWED_EMAIL_DOMAINS = 'empresa.com.br, @empresa.com';
    assert.equal(validCorporateEmail('ana@empresa.com.br'), true);
    assert.equal(validCorporateEmail('ana@empresa.com'), true);
    assert.equal(validCorporateEmail('ana@sub.empresa.com.br'), false);
    assert.equal(validCorporateEmail('ana@empresa-externa.com.br'), false);
  } finally {
    if (original === undefined) delete process.env.ALLOWED_EMAIL_DOMAINS;
    else process.env.ALLOWED_EMAIL_DOMAINS = original;
  }
});

test('senha é armazenada como derivação scrypt e não aceita texto incorreto', async () => {
  const hash = await hashPassword('uma-senha-forte-de-teste-2026');
  assert.match(hash, /^scrypt\$32768\$8\$1\$/);
  assert.equal(hash.includes('uma-senha-forte-de-teste-2026'), false);
  assert.equal(await verifyPassword('uma-senha-forte-de-teste-2026', hash), true);
  assert.equal(await verifyPassword('senha-incorreta', hash), false);
});

test('tokens de sessão são opacos e somente seu digest é apropriado para persistência', () => {
  const token = opaqueToken();
  assert.equal(token.length, 43);
  assert.equal(tokenDigest(token).length, 64);
  assert.notEqual(tokenDigest(token), token);
});

test('CSRF usa comparação entre cookie e cabeçalho e rejeita valores divergentes', () => {
  assert.deepEqual(parseCookies('a=1; b2b_csrf=token%2D123'), { a: '1', b2b_csrf: 'token-123' });
  assert.equal(validCsrf({ headers: { cookie: 'b2b_csrf=abc123', 'x-csrf-token': 'abc123' } }), true);
  assert.equal(validCsrf({ headers: { cookie: 'b2b_csrf=abc123', 'x-csrf-token': 'different' } }), false);
  assert.equal(validCsrf({ headers: { cookie: '', 'x-csrf-token': 'abc123' } }), false);
});
