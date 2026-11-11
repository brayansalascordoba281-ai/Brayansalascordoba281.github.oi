// ===== Base de datos SQLite (archivo: data/barberia.db) =====
// Usa el módulo SQLite incluido en Node 22.13+ (no hay que instalar nada).
import { DatabaseSync } from 'node:sqlite';
import { mkdirSync } from 'node:fs';
import { dirname, join } from 'node:path';

const file = process.env.DB_PATH || join(import.meta.dirname, 'data', 'barberia.db');
mkdirSync(dirname(file), { recursive: true });
export const db = new DatabaseSync(file);

db.exec(`
PRAGMA journal_mode=WAL;
CREATE TABLE IF NOT EXISTS services(id TEXT PRIMARY KEY,name TEXT NOT NULL,price INTEGER NOT NULL,duration TEXT DEFAULT '',icon TEXT DEFAULT 'clasico',active INTEGER DEFAULT 1,sort INTEGER DEFAULT 0);
CREATE TABLE IF NOT EXISTS extras(id TEXT PRIMARY KEY,name TEXT NOT NULL,price INTEGER NOT NULL,emoji TEXT DEFAULT '✨',active INTEGER DEFAULT 1,sort INTEGER DEFAULT 0);
CREATE TABLE IF NOT EXISTS barbers(id INTEGER PRIMARY KEY AUTOINCREMENT,name TEXT NOT NULL,active INTEGER DEFAULT 1);
CREATE TABLE IF NOT EXISTS bookings(
  id INTEGER PRIMARY KEY AUTOINCREMENT, code TEXT UNIQUE NOT NULL,
  name TEXT NOT NULL, phone TEXT NOT NULL,
  service_id TEXT, service_name TEXT NOT NULL, extras TEXT DEFAULT '',
  barber_id INTEGER NOT NULL, barber_name TEXT NOT NULL,
  date TEXT NOT NULL, time TEXT NOT NULL, price INTEGER NOT NULL, note TEXT DEFAULT '',
  status TEXT NOT NULL DEFAULT 'confirmed',   -- confirmed | done | noshow | cancelled
  created_at TEXT DEFAULT CURRENT_TIMESTAMP);
-- Impide por base de datos que dos clientes tomen la misma hora con el mismo barbero
CREATE UNIQUE INDEX IF NOT EXISTS ux_slot ON bookings(date,time,barber_id) WHERE status!='cancelled';
CREATE INDEX IF NOT EXISTS ix_date ON bookings(date);
CREATE TABLE IF NOT EXISTS blocks(id INTEGER PRIMARY KEY AUTOINCREMENT,date TEXT NOT NULL,time TEXT NOT NULL,barber_id INTEGER NOT NULL DEFAULT 0,reason TEXT DEFAULT '');
CREATE TABLE IF NOT EXISTS reviews(id INTEGER PRIMARY KEY AUTOINCREMENT,name TEXT NOT NULL,stars INTEGER NOT NULL,text TEXT DEFAULT '',created_at TEXT DEFAULT CURRENT_TIMESTAMP);
CREATE TABLE IF NOT EXISTS gallery(id INTEGER PRIMARY KEY AUTOINCREMENT,title TEXT NOT NULL,file TEXT NOT NULL,created_at TEXT DEFAULT CURRENT_TIMESTAMP);
CREATE TABLE IF NOT EXISTS settings(key TEXT PRIMARY KEY,value TEXT NOT NULL);
`);

// ----- Datos iniciales (solo la primera vez). Todo se edita luego desde /admin -----
if (!db.prepare('SELECT COUNT(*) n FROM services').get().n) {
  const s = db.prepare('INSERT INTO services(id,name,price,duration,icon,sort) VALUES(?,?,?,?,?,?)');
  [['clasico', 'Corte clásico', 25000, '30 min', 'clasico'], ['fade', 'Fade / degradé', 30000, '45 min', 'fade'],
   ['barba', 'Corte + barba', 40000, '60 min', 'barba'], ['vip', 'Corte VIP', 50000, '75 min', 'vip']]
    .forEach((r, i) => s.run(...r, i));
  const e = db.prepare('INSERT INTO extras(id,name,price,emoji,sort) VALUES(?,?,?,?,?)');
  [['cejas', 'Perfilado de cejas', 5000, '👁️'], ['lavado', 'Lavado de cabello', 8000, '🚿'],
   ['mascarilla', 'Mascarilla negra', 10000, '🖤'], ['masaje', 'Masaje relajante', 10000, '💆']]
    .forEach((r, i) => e.run(...r, i));
  const b = db.prepare('INSERT INTO barbers(name) VALUES(?)');
  ['Barbero 1', 'Barbero 2', 'Barbero 3'].forEach(n => b.run(n));
}
if (!db.prepare("SELECT 1 FROM settings WHERE key='config'").get()) {
  const cfg = {
    open: '09:00', close: '20:00', slot: 30, daysAhead: 14, closedDays: [0], // 0 = domingo
    whatsapp: '', address: '', instagram: '', loyal: 5,
    promos: [{ n: 'Combo parceros', d: '2 cortes clásicos el mismo día', p: '$45.000' },
             { n: 'Padre e hijo', d: 'Un corte para papá y otro para el peque', p: '$45.000' },
             { n: 'Cliente nuevo', d: 'Pregunta por tu descuento de bienvenida', p: '' }]
  };
  db.prepare("INSERT INTO settings(key,value) VALUES('config',?)").run(JSON.stringify(cfg));
}
