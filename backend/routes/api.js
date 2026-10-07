const { Router } = require('express');
const crypto = require('crypto');
const db = require('../db');
const { requireAuth } = require('../middleware/authMiddleware');

const router = Router();
router.use(requireAuth);

router.get('/sensor-logs', async (req, res) => {
  const { date } = req.query;
  try {
    const result = date
      ? await db.query(
          `SELECT * FROM sensor_logs
           WHERE timestamp >= $1::date AND timestamp < $1::date + INTERVAL '1 day'
           ORDER BY timestamp ASC`,
          [date]
        )
      : await db.query('SELECT * FROM sensor_logs ORDER BY timestamp DESC LIMIT 500');
    res.json(date ? result.rows : result.rows.reverse());
  } catch (err) {
    console.error('Sensor history query failed:', err.message);
    res.status(500).json({ error: 'Failed to fetch sensor history' });
  }
});

router.get('/settings', async (_req, res) => {
  try {
    const result = await db.query('SELECT * FROM settings WHERE id = 1');
    res.json(result.rows[0] || null);
  } catch (err) {
    console.error('Settings query failed:', err.message);
    res.status(500).json({ error: 'Failed to fetch settings' });
  }
});

router.put('/settings', async (req, res) => {
  const { auto_mode, temp_threshold, humidity_threshold, aqi_threshold } = req.body;
  try {
    const result = await db.query(
      `UPDATE settings SET auto_mode = $1, temp_threshold = $2,
       humidity_threshold = $3, aqi_threshold = $4, updated_at = CURRENT_TIMESTAMP
       WHERE id = 1 RETURNING *`,
      [Boolean(auto_mode), Number(temp_threshold), Number(humidity_threshold), Number(aqi_threshold)]
    );
    res.json(result.rows[0]);
  } catch (err) {
    console.error('Settings update failed:', err.message);
    res.status(500).json({ error: 'Failed to update settings' });
  }
});

router.get('/devices', async (_req, res) => {
  try {
    const result = await db.query(
      `SELECT d.id, d.name, d.device_type, d.is_active, d.is_working, d.last_seen, d.created_at,
       d.parent_device_id,
       (CASE WHEN d.device_type = 'esp32' THEN d.last_seen ELSE parent.last_seen END >= NOW() - INTERVAL '30 seconds') AS connected
       FROM devices d LEFT JOIN devices parent ON parent.id = d.parent_device_id
       ORDER BY d.created_at DESC`
    );
    const devices = result.rows;
    res.json({
      devices,
      counts: {
        total: devices.length,
        connected: devices.filter((device) => device.connected).length,
        active: devices.filter((device) => device.is_active && device.is_working && device.connected).length,
        fans: devices.filter((device) => device.device_type === 'fan').length,
        connectedFans: devices.filter((device) => device.device_type === 'fan' && device.connected).length,
        activeFans: devices.filter((device) => device.device_type === 'fan' && device.connected && device.is_active && device.is_working).length,
        filters: devices.filter((device) => device.device_type === 'filter').length,
        connectedFilters: devices.filter((device) => device.device_type === 'filter' && device.connected).length,
        activeFilters: devices.filter((device) => device.device_type === 'filter' && device.connected && device.is_active && device.is_working).length,
        esp32: devices.filter((device) => device.device_type === 'esp32').length,
      },
    });
  } catch (err) {
    console.error('Device query failed:', err.message);
    res.status(500).json({ error: 'Failed to fetch devices' });
  }
});

router.post('/devices', async (req, res) => {
  const name = req.body.name?.trim();
  const { device_type, parent_device_id } = req.body;
  if (!name || !['esp32', 'fan', 'filter'].includes(device_type)) {
    return res.status(400).json({ error: 'Provide a name and a device type: esp32, fan, or filter.' });
  }
  if (device_type !== 'esp32' && !Number.isInteger(Number(parent_device_id))) {
    return res.status(400).json({ error: 'Choose the ESP32 board that reports this fan or filter.' });
  }
  try {
    if (device_type !== 'esp32') {
      const parent = await db.query("SELECT id FROM devices WHERE id = $1 AND device_type = 'esp32' AND is_active = TRUE", [Number(parent_device_id)]);
      if (!parent.rowCount) return res.status(400).json({ error: 'The selected parent must be an active ESP32 board.' });
    }
    const apiKey = device_type === 'esp32' ? crypto.randomBytes(32).toString('hex') : null;
    const keyHash = apiKey ? crypto.createHash('sha256').update(apiKey).digest('hex') : null;
    const result = await db.query(
      `INSERT INTO devices (name, device_type, api_key_hash, parent_device_id) VALUES ($1, $2, $3, $4)
       RETURNING id, name, device_type, is_active, is_working, last_seen, created_at, parent_device_id`,
      [name, device_type, keyHash, device_type === 'esp32' ? null : Number(parent_device_id)]
    );
    res.status(201).json({ ...result.rows[0], api_key: apiKey });
  } catch (err) {
    console.error('Device registration failed:', err.message);
    res.status(500).json({ error: 'Failed to add device' });
  }
});

router.patch('/devices/:id', async (req, res) => {
  if (typeof req.body.is_active !== 'boolean') {
    return res.status(400).json({ error: 'is_active must be true or false.' });
  }
  try {
    const result = await db.query(
      'UPDATE devices SET is_active = $1 WHERE id = $2 RETURNING *',
      [req.body.is_active, req.params.id]
    );
    if (!result.rowCount) return res.status(404).json({ error: 'Device not found.' });
    res.json(result.rows[0]);
  } catch (err) {
    console.error('Device update failed:', err.message);
    res.status(500).json({ error: 'Failed to update device' });
  }
});

router.post('/relay', async (req, res) => {
  if (typeof req.body.fan_status !== 'boolean') {
    return res.status(400).json({ error: 'fan_status must be true or false.' });
  }
  try {
    const settings = await db.query('SELECT auto_mode FROM settings WHERE id = 1');
    if (settings.rows[0]?.auto_mode) {
      return res.status(400).json({ error: 'Turn off Auto Mode before manual control.' });
    }
    const result = await db.query(
      `UPDATE devices SET desired_fan_status = $1 WHERE device_type = 'esp32' AND is_active = TRUE`,
      [req.body.fan_status]
    );
    req.app.get('io').emit('relay_update', { fan_status: req.body.fan_status });
    res.json({ message: 'Relay command queued for active ESP32 boards', fan_status: req.body.fan_status, devices_updated: result.rowCount });
  } catch (err) {
    console.error('Relay update failed:', err.message);
    res.status(500).json({ error: 'Failed to update relay status' });
  }
});

router.post('/assistant', async (req, res) => {
  const rawQuestion = typeof req.body.question === 'string' ? req.body.question.trim() : '';
  const question = rawQuestion?.toLowerCase();
  const selectedDate = /^\d{4}-\d{2}-\d{2}$/.test(req.body.date || '') ? req.body.date : null;
  if (!rawQuestion) return res.status(400).json({ error: 'Enter a question.' });
  if (rawQuestion.length > 500) return res.status(400).json({ error: 'Keep questions under 500 characters.' });
  try {
    const [latestResult, historyResult, deviceResult] = await Promise.all([
      db.query('SELECT * FROM sensor_logs ORDER BY timestamp DESC LIMIT 1'),
      selectedDate
        ? db.query(`SELECT * FROM sensor_logs WHERE timestamp >= $1::date AND timestamp < $1::date + INTERVAL '1 day' ORDER BY timestamp ASC`, [selectedDate])
        : db.query('SELECT * FROM sensor_logs ORDER BY timestamp DESC LIMIT 100'),
      db.query(`SELECT device_type, is_active, is_working,
        (last_seen >= NOW() - INTERVAL '30 seconds') AS connected FROM devices`),
    ]);
    const latest = latestResult.rows[0];
    const history = historyResult.rows;
    const devices = deviceResult.rows;
    let answer;
    if (/device|esp32|fan|filter|connect|online|offline/.test(question)) {
      const online = devices.filter((device) => device.connected).length;
      const active = devices.filter((device) => device.is_active && device.is_working && device.connected).length;
      const fans = devices.filter((d) => d.device_type === 'fan');
      const filters = devices.filter((d) => d.device_type === 'filter');
      answer = `There are ${devices.length} registered devices. ${online} are connected now and ${active} are active and reporting as working. Fans: ${fans.filter((d) => d.connected).length}/${fans.length} connected, ${fans.filter((d) => d.connected && d.is_working).length} working. Filters: ${filters.filter((d) => d.connected).length}/${filters.length} connected, ${filters.filter((d) => d.connected && d.is_working).length} working. ESP32 boards: ${devices.filter((d) => d.device_type === 'esp32' && d.connected).length}/${devices.filter((d) => d.device_type === 'esp32').length} connected.`;
    } else if (/air|quality|aqi|pollution/.test(question)) {
      answer = latest
        ? `The latest recorded air quality reading is ${Number(latest.mq135_ppm).toFixed(0)} ppm, logged ${new Date(latest.timestamp).toLocaleString()}. The chart and date picker show the stored readings for each day.`
        : 'No sensor readings have been stored yet. Connect an ESP32 and send telemetry to start the history.';
    } else if (/temperature|humidity|reading|sensor|data|value/.test(question)) {
      answer = latest
        ? `Latest stored values: temperature ${Number(latest.temperature).toFixed(1)} °C, humidity ${Number(latest.humidity).toFixed(1)}%, and air quality ${Number(latest.mq135_ppm).toFixed(0)} ppm. Reading time: ${new Date(latest.timestamp).toLocaleString()}.`
        : 'There are no stored readings yet. The dashboard begins filling when a device sends telemetry.';
    } else {
      answer = 'I can look up the latest sensor readings and device connection counts. Use the date selector for a day’s stored history, and add devices in the Device fleet panel. ESP32 boards send JSON telemetry to POST /api/device/telemetry using the configured device key.';
    }
    let aiAnswer = null;
    let source = 'application data helper';
    if (process.env.OPENAI_API_KEY) {
      try {
        const aiResponse = await fetch('https://api.openai.com/v1/responses', {
          method: 'POST',
          headers: { Authorization: `Bearer ${process.env.OPENAI_API_KEY}`, 'Content-Type': 'application/json' },
          body: JSON.stringify({
            model: process.env.OPENAI_MODEL || 'gpt-6-astra',
            store: false,
            max_output_tokens: 280,
            instructions: 'You are the HVAC SafeGuard in-app assistant. Answer questions about this app using only the supplied application data and app features. Be concise. Never invent readings or device state. If a value is absent, say it has not been recorded. For hardware setup questions, explain the app HTTP telemetry contract; do not claim that a physical device is connected unless its heartbeat says so.',
            input: `Selected history date: ${selectedDate || 'latest 100 saved readings'}\nQuestion: ${rawQuestion}\nLatest reading: ${JSON.stringify(latest || null)}\nSelected date readings (${history.length}): ${JSON.stringify(history.slice(-100))}\nDevices and status: ${JSON.stringify(devices)}`,
          }),
        });
        if (aiResponse.ok) {
          const payload = await aiResponse.json();
          aiAnswer = payload.output_text || payload.output?.flatMap((item) => item.content || []).filter((part) => part.type === 'output_text').map((part) => part.text).join('\n');
          if (aiAnswer) source = 'AI with application data';
        } else {
          console.error('AI assistant provider returned:', aiResponse.status);
        }
      } catch (err) {
        console.error('AI assistant request failed:', err.message);
      }
    }
    res.json({ answer: aiAnswer || answer, source });
  } catch (err) {
    console.error('Assistant data query failed:', err.message);
    res.status(500).json({ error: 'The assistant could not read application data.' });
  }
});

module.exports = router;
