# Level Three Barbería · Plataforma de reservas

Web de clientes + panel de administrador + servidor + base de datos, todo en un solo proyecto.
**No necesita instalar paquetes** (cero dependencias): solo Node.js 22.13 o superior.

## Qué incluye

| Parte | Dónde | Qué hace |
|---|---|---|
| Web de clientes | `/` | Reservar (servicio, extras, barbero, día y hora), precios, cortes, promos, local, reseñas, mis citas |
| Panel admin | `/admin` | Dashboard, reservas con WhatsApp y llamada, servicios y precios, horarios, bloqueos, fotos, reseñas, exportar CSV |
| Servidor / API | `server.js` | Reglas de reservas, login del admin, subida de fotos |
| Base de datos | `data/barberia.db` | SQLite, se crea sola la primera vez |

## Iniciar (3 pasos)

1. Instala Node.js 22.13+ desde https://nodejs.org (versión LTS o superior). Comprueba con `node -v`.
2. Copia `.env.example` como `.env` y **cambia `ADMIN_PASSWORD`** por tu clave.
3. En la carpeta del proyecto ejecuta:

```bash
npm start
```

Abre http://localhost:3000 (clientes) y http://localhost:3000/admin (administrador).
Para probar que todo funciona: `npm test` (crea una base temporal y revisa 21 casos).

## Primeros pasos en el panel (`/admin`)

1. **Horarios:** hora de apertura/cierre, minutos por cita, días cerrados, tu WhatsApp (con 57), dirección e Instagram.
2. **Servicios:** pon los nombres reales de tus barberos y ajusta precios y extras.
3. **Fotos:** sube fotos reales de cortes; salen en "Cortes" y en el carrusel del Inicio.

El WhatsApp del negocio hace aparecer el botón "Avisar por WhatsApp" al confirmar la reserva del cliente.

## Base de datos

SQLite en `data/barberia.db`. Tablas: `services`, `extras`, `barbers`, `bookings`, `blocks`, `reviews`, `gallery`, `settings`.
Un índice único impide que dos clientes tomen la misma hora con el mismo barbero, aunque reserven al mismo tiempo.
Las fotos se guardan en `data/uploads/`.

**Copia de seguridad:** copia la carpeta `data/` completa (con el servidor apagado, o usando `sqlite3 data/barberia.db ".backup copia.db"`). Desde el panel puedes exportar las reservas en CSV.

## API (por si quieres conectar otra app)

Públicas: `GET /api/config` · `GET /api/availability?date=AAAA-MM-DD` · `POST /api/bookings` · `POST /api/bookings/cancel` · `GET|POST /api/reviews` · `GET /api/gallery`
Admin (requieren sesión por cookie tras `POST /api/admin/login`): `summary`, `bookings` (GET/PATCH), `export`, `catalog`, `settings`, `blocks`, `gallery`, `reviews`.

## Publicar en internet

El servidor necesita **disco persistente** para `data/` (si no, pierdes reservas al reiniciar).

- **VPS (recomendado, ej. DigitalOcean/Hetzner):** instala Node 22, copia el proyecto, `npm start` con `pm2` o `systemd`, y pon Nginx/Caddy con HTTPS delante. Usa `COOKIE_SECURE=1` y `TRUST_PROXY=1`.
- **Render / Railway / Fly.io:** crea un servicio Node con comando `npm start`, **agrega un volumen/disco montado en `/app/data`** (o define `DB_PATH` y `UPLOADS_DIR` apuntando al disco), y define las variables del `.env`. Usa `TRUST_PROXY=1` y `COOKIE_SECURE=1`.
- **Docker:** `docker build -t level-three .` y `docker run -p 3000:3000 -v $(pwd)/data:/app/data --env-file .env level-three`.

GitHub Pages **no sirve** para esto (solo aloja páginas estáticas, no ejecuta el servidor).

## Seguridad (ya incluida)

Clave de admin por variable de entorno, cookie `HttpOnly` firmada que vence a las 12 h, límite de intentos de login, límite de reservas/reseñas por IP, precios calculados siempre en el servidor, validación de imágenes, protección contra rutas maliciosas y cabeceras de seguridad. Publica siempre con **HTTPS**.

## Estructura

```
server.js        API, login, archivos estáticos
db.js            tablas y datos iniciales
test.js          pruebas automáticas (npm test)
public/index.html + js/app.js     web de clientes
public/admin.html + js/admin.js   panel de administrador
public/css/styles.css             diseño (colores en :root)
```
