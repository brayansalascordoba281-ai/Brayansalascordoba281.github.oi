// Prueba automática: levanta el servidor con una base temporal y revisa todo el flujo.  Uso: npm test
import { spawn } from 'node:child_process';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import assert from 'node:assert/strict';

const dir = mkdtempSync(join(tmpdir(), 'l3-')), PORT = 3900 + Math.floor(Math.random() * 90), B = `http://localhost:${PORT}`;
const srv = spawn(process.execPath, ['--disable-warning=ExperimentalWarning', 'server.js'], {
  cwd: import.meta.dirname, stdio: 'pipe',
  env: { ...process.env, PORT, DB_PATH: join(dir, 't.db'), UPLOADS_DIR: join(dir, 'up'), ADMIN_PASSWORD: 'clave-test', BOOK_LIMIT: '500', SESSION_SECRET: 'x'.repeat(20) }
});
let log = ''; srv.stdout.on('data', d => log += d); srv.stderr.on('data', d => log += d);
await new Promise(r => setTimeout(r, 1200));

let cookie = '', n = 0;
const call = async (m, u, body, hdr = {}) => {
  const r = await fetch(B + u, { method: m, headers: { 'Content-Type': 'application/json', ...(cookie ? { Cookie: cookie } : {}), ...hdr }, body: body ? JSON.stringify(body) : undefined });
  const sc = r.headers.get('set-cookie'); if (sc && sc.includes('lt_admin=') && !sc.includes('Max-Age=0')) cookie = sc.split(';')[0];
  const t = await r.text(); let j; try { j = JSON.parse(t); } catch { j = t; } return { s: r.status, j, h: r.headers };
};
const ok = (name, fn) => fn().then(() => { n++; console.log('  ✓', name); }, e => { console.log('  ✗', name, '\n   ', e.message); process.exitCode = 1; });
const day = (k = 1) => { const d = new Date(); d.setDate(d.getDate() + k); while (d.getDay() === 0) d.setDate(d.getDate() + 1); return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`; };
const D = day(2); let code, phone = '3001234567', cfg, bid;

try {
  await ok('páginas y archivos estáticos', async () => {
    for (const u of ['/', '/admin', '/js/app.js', '/js/admin.js', '/css/styles.css']) assert.equal((await call('GET', u)).s, 200, u);
    assert.equal((await call('GET', '/../server.js')).s, 404); assert.equal((await call('GET', '/%2e%2e/server.js')).s, 404);
  });
  await ok('config pública (servicios, extras, barberos)', async () => { const r = await call('GET', '/api/config'); cfg = r.j; assert.equal(r.j.services.length, 4); assert.equal(r.j.barbers.length, 3); assert.equal(r.j.services[0].price, 25000); });
  await ok('disponibilidad del día', async () => { const r = await call('GET', '/api/availability?date=' + D); assert.equal(r.j.slots.length, 22); assert.equal(r.j.slots[0].free.length, 3); });
  await ok('rechaza domingo y fechas pasadas', async () => { const d = new Date(); d.setDate(d.getDate() + ((7 - d.getDay()) % 7 || 7)); const sun = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`; assert.equal((await call('GET', '/api/availability?date=' + sun)).s, 400); assert.equal((await call('GET', '/api/availability?date=2020-01-01')).s, 400); });
  await ok('crear reserva con extras (precio calculado en servidor)', async () => {
    const r = await call('POST', '/api/bookings', { name: 'Juan Pérez', phone: phone, serviceId: 'fade', extraIds: ['cejas', 'masaje'], barberId: 1, date: D, time: '10:00', note: 'degradé bajo', price: 1 });
    assert.equal(r.s, 200); assert.equal(r.j.price, 45000); assert.equal(r.j.barber, 'Barbero 1'); code = r.j.code; assert.equal(code.length, 6);
  });
  await ok('misma hora y mismo barbero → 409', async () => { assert.equal((await call('POST', '/api/bookings', { name: 'Otro', phone: '3009998888', serviceId: 'clasico', barberId: 1, date: D, time: '10:00' })).s, 409); });
  await ok('"cualquiera" reparte entre barberos y se llena', async () => {
    for (let i = 0; i < 2; i++) assert.equal((await call('POST', '/api/bookings', { name: 'Cliente ' + i, phone: '31000000' + i + '1', serviceId: 'clasico', barberId: 0, date: D, time: '10:00' })).s, 200);
    assert.equal((await call('POST', '/api/bookings', { name: 'Cuarto', phone: '3100000099', serviceId: 'clasico', barberId: 0, date: D, time: '10:00' })).s, 409);
    const a = await call('GET', '/api/availability?date=' + D); assert.equal(a.j.slots.find(s => s.time === '10:00').free.length, 0);
  });
  await ok('carrera: 5 reservas simultáneas, solo 1 gana', async () => {
    const rs = await Promise.all([1, 2, 3, 4, 5].map(i => call('POST', '/api/bookings', { name: 'Race ' + i, phone: '320000000' + i, serviceId: 'clasico', barberId: 2, date: D, time: '11:00' })));
    assert.equal(rs.filter(r => r.s === 200).length, 1);
  });
  await ok('validaciones (nombre, celular, servicio, hora)', async () => {
    const base = { name: 'Ana', phone: '3001112233', serviceId: 'clasico', date: D, time: '12:00' };
    for (const bad of [{ name: '' }, { phone: '12' }, { serviceId: 'nada' }, { time: '03:00' }, { date: 'x' }]) assert.equal((await call('POST', '/api/bookings', { ...base, ...bad })).s, 400, JSON.stringify(bad));
  });
  await ok('cancelar: teléfono incorrecto 404, correcto libera la hora', async () => {
    assert.equal((await call('POST', '/api/bookings/cancel', { code, phone: '3999999999' })).s, 404);
    assert.equal((await call('POST', '/api/bookings/cancel', { code, phone })).s, 200);
    assert.equal((await call('POST', '/api/bookings', { name: 'Reuso', phone: '3012223344', serviceId: 'clasico', barberId: 1, date: D, time: '10:00' })).s, 200);
  });
  await ok('API admin sin sesión → 401', async () => { for (const u of ['/api/admin/summary', '/api/admin/bookings', '/api/admin/export', '/api/admin/catalog']) assert.equal((await call('GET', u)).s, 401, u); assert.equal((await call('POST', '/api/admin/gallery', { dataUrl: 'x' })).s, 401); });
  await ok('login: clave mala 401, buena 200 con cookie HttpOnly', async () => {
    assert.equal((await call('POST', '/api/admin/login', { password: 'mala' })).s, 401);
    const r = await call('POST', '/api/admin/login', { password: 'clave-test' }); assert.equal(r.s, 200); assert.ok(/HttpOnly/.test(r.h.get('set-cookie'))); assert.ok(cookie);
  });
  await ok('resumen del dashboard', async () => { const r = await call('GET', '/api/admin/summary'); assert.equal(r.s, 200); assert.equal(r.j.total.n, 4); assert.ok(r.j.clientes >= 4); assert.ok(r.j.porServicio.length); });
  await ok('lista de reservas y cambio de estado', async () => {
    const l = (await call('GET', '/api/admin/bookings?scope=all')).j; assert.ok(l.length >= 5); const id = l.find(b => b.status === 'confirmed').id;
    assert.equal((await call('PATCH', '/api/admin/bookings/' + id, { status: 'done' })).s, 200); assert.equal((await call('PATCH', '/api/admin/bookings/' + id, { status: 'raro' })).s, 400);
  });
  await ok('exportar CSV', async () => { const r = await call('GET', '/api/admin/export'); assert.equal(r.s, 200); assert.ok(r.j.includes('Juan Pérez')); });
  await ok('editar precios y agregar servicio/barbero', async () => {
    const c = (await call('GET', '/api/admin/catalog')).j; c.services[0].price = 28000; c.services.push({ name: 'Diseño', price: 15000, duration: '20 min', icon: 'fade' }); c.barbers.push({ name: 'Barbero 4' });
    assert.equal((await call('PUT', '/api/admin/catalog', c)).s, 200);
    const p = (await call('GET', '/api/config')).j; assert.equal(p.services[0].price, 28000); assert.equal(p.services.length, 5); assert.equal(p.barbers.length, 4);
  });
  await ok('horarios: bloquear una hora y ya no se puede reservar', async () => {
    assert.equal((await call('POST', '/api/admin/blocks', { date: D, time: '15:00', barberId: 0, reason: 'almuerzo' })).s, 200);
    assert.equal((await call('POST', '/api/bookings', { name: 'Blq', phone: '3001110000', serviceId: 'clasico', barberId: 0, date: D, time: '15:00' })).s, 409);
    const b = (await call('GET', '/api/admin/blocks')).j; assert.equal((await call('DELETE', '/api/admin/blocks/' + b[0].id)).s, 200);
  });
  await ok('ajustes: horario, WhatsApp, validación', async () => {
    assert.equal((await call('PUT', '/api/admin/settings', { whatsapp: '+57 300 111 2233', close: '19:00' })).s, 200);
    const s = (await call('GET', '/api/config')).j.settings; assert.equal(s.whatsapp, '573001112233'); assert.equal(s.close, '19:00');
    assert.equal((await call('PUT', '/api/admin/settings', { open: '25:00' })).s, 400); assert.equal((await call('PUT', '/api/admin/settings', { open: '20:00' })).s, 400);
  });
  await ok('fotos: subir PNG, aparece, se sirve y se borra; rechaza falsos', async () => {
    const png = 'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==';
    const r = await call('POST', '/api/admin/gallery', { title: 'Fade bajo', dataUrl: 'data:image/png;base64,' + png }); assert.equal(r.s, 200);
    const g = (await call('GET', '/api/gallery')).j; assert.equal(g.length, 1); assert.equal((await call('GET', g[0].url)).s, 200);
    assert.equal((await call('POST', '/api/admin/gallery', { dataUrl: 'data:image/png;base64,' + Buffer.from('<script>alert(1)</script>').toString('base64') })).s, 400);
    assert.equal((await call('DELETE', '/api/admin/gallery/' + g[0].id)).s, 200); assert.equal((await call('GET', '/api/gallery')).j.length, 0);
  });
  await ok('reseñas: crear, listar, borrar', async () => {
    assert.equal((await call('POST', '/api/reviews', { name: 'Luis', stars: 5, text: 'Excelente' })).s, 200);
    assert.equal((await call('POST', '/api/reviews', { name: 'Luis', stars: 9 })).s, 400);
    const r = (await call('GET', '/api/reviews')).j; assert.equal(r.list.length, 1); assert.equal(r.avg, 5);
    assert.equal((await call('DELETE', '/api/admin/reviews/' + r.list[0].id)).s, 200);
  });
  await ok('logout cierra la sesión', async () => { await call('POST', '/api/admin/logout'); cookie = ''; assert.equal((await call('GET', '/api/admin/summary')).s, 401); });
} finally {
  srv.kill(); rmSync(dir, { recursive: true, force: true });
  console.log(process.exitCode ? '\n❌ Hay pruebas fallidas' : `\n✅ ${n} pruebas OK`); if (process.exitCode) console.log(log);
}
