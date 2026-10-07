const express = require('express');
const http = require('http');
const { Server } = require('socket.io');
const cors = require('cors');
const dotenv = require('dotenv');
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
dotenv.config();

const db = require('./db');

const authRoutes = require('./routes/auth');
const apiRoutes = require('./routes/api');

const app = express();
const server = http.createServer(app);
const allowedOrigins = ['http://localhost:5173', 'http://127.0.0.1:5173'];
const io = new Server(server, {
  cors: {
    origin: allowedOrigins,
    methods: ['GET', 'POST', 'PUT'],
    credentials: true
  }
});

app.use(cors({ origin: allowedOrigins, credentials: true }));
app.use(express.json());

// Attach io to app so routes can use it
app.set('io', io);

// Basic HTTP cookie parser (manual parsing for simple use case or use cookie-parser pkg)
app.use(require('cookie-parser')());

app.use('/api/auth', authRoutes);

app.post('/api/device/telemetry', async (req, res) => {
  const providedKey = req.get('x-device-key') || '';
  const { device_id, temperature, humidity, mq135_ppm, fan_status, peripherals = [] } = req.body;
  if (!Number.isInteger(Number(device_id)) || ![temperature, humidity, mq135_ppm].every((value) => Number.isFinite(Number(value))) || typeof fan_status !== 'boolean' || !Array.isArray(peripherals) || peripherals.some((item) => !Number.isInteger(Number(item.id)) || typeof item.working !== 'boolean')) {
    return res.status(400).json({ error: 'Send device_id, temperature, humidity, mq135_ppm, and boolean fan_status.' });
  }
  if (!/^[a-f0-9]{64}$/i.test(providedKey)) return res.status(401).json({ error: 'Invalid device key.' });
  try {
    const deviceResult = await db.query(
      `UPDATE devices SET last_seen = NOW(), is_working = TRUE
       WHERE id = $1 AND api_key_hash = $2 AND device_type = 'esp32' AND is_active = TRUE RETURNING id`,
      [Number(device_id), crypto.createHash('sha256').update(providedKey).digest('hex')]
    );
    if (!deviceResult.rowCount) return res.status(404).json({ error: 'Active ESP32 device not found.' });
    const logResult = await db.query(
      `INSERT INTO sensor_logs (temperature, humidity, mq135_ppm, fan_status, device_id)
       VALUES ($1, $2, $3, $4, $5) RETURNING *`,
      [Number(temperature), Number(humidity), Number(mq135_ppm), fan_status, Number(device_id)]
    );
    const reading = logResult.rows[0];
    for (const peripheral of peripherals) {
      await db.query(
        `UPDATE devices SET is_working = $1, last_seen = NOW()
         WHERE id = $2 AND parent_device_id = $3 AND device_type IN ('fan', 'filter')`,
        [peripheral.working, Number(peripheral.id), Number(device_id)]
      );
    }
    if (peripherals.length) req.app.get('io').emit('devices_update');
    const settingsResult = await db.query('SELECT * FROM settings WHERE id = 1');
    const settings = settingsResult.rows[0];
    if (settings?.auto_mode) {
      const shouldRunFan = Number(temperature) > settings.temp_threshold
        || Number(humidity) > settings.humidity_threshold
        || Number(mq135_ppm) > settings.aqi_threshold;
      await db.query('UPDATE devices SET desired_fan_status = $1 WHERE id = $2', [shouldRunFan, Number(device_id)]);
      req.app.get('io').emit('relay_command', { device_id: Number(device_id), fan_status: shouldRunFan });
    }
    req.app.get('io').emit('sensor_update', reading);
    res.status(201).json({ received: true, reading });
  } catch (err) {
    console.error('Device telemetry failed:', err.message);
    res.status(500).json({ error: 'Failed to store device telemetry.' });
  }
});

app.get('/api/device/command/:id', async (req, res) => {
  const providedKey = req.get('x-device-key') || '';
  if (!/^[a-f0-9]{64}$/i.test(providedKey)) return res.status(401).json({ error: 'Invalid device key.' });
  try {
    const result = await db.query(
      `UPDATE devices SET last_seen = NOW()
       WHERE id = $1 AND api_key_hash = $2 AND device_type = 'esp32' AND is_active = TRUE
       RETURNING desired_fan_status`,
      [req.params.id, crypto.createHash('sha256').update(providedKey).digest('hex')]
    );
    if (!result.rowCount) return res.status(404).json({ error: 'Active ESP32 device not found.' });
    res.json({ fan_status: result.rows[0].desired_fan_status });
  } catch (err) {
    console.error('Device command poll failed:', err.message);
    res.status(500).json({ error: 'Failed to read device command.' });
  }
});

app.use('/api', apiRoutes);

io.on('connection', (socket) => {
  console.log('Client connected:', socket.id);
  socket.on('disconnect', () => {
    console.log('Client disconnected:', socket.id);
  });
});

const PORT = process.env.PORT || 5000;
async function startServer() {
  try {
    const schema = fs.readFileSync(path.join(__dirname, 'db', 'schema.sql'), 'utf8');
    await db.query(schema);
    server.listen(PORT, () => console.log(`Server running on port ${PORT}`));
  } catch (err) {
    console.error('Database startup failed:', err.message);
    process.exitCode = 1;
  }
}

startServer();
