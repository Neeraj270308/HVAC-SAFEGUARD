import { useCallback, useContext, useEffect, useMemo, useState } from 'react';
import axios from 'axios';
import { io } from 'socket.io-client';
import { AuthContext } from '../context/AuthContext';
import StatCard from '../components/StatCard';
import LiveChart from '../components/LiveChart';
import {
  Activity, Bot, CalendarDays, Check, ChevronDown, CircleHelp, Droplets,
  Fan, Filter, LogOut, Plus, Send, ShieldCheck, Thermometer, Wifi, WifiOff, Wind, X,
} from 'lucide-react';

const API = 'http://localhost:5000/api';
const today = () => {
  const now = new Date();
  return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-${String(now.getDate()).padStart(2, '0')}`;
};
const timeLabel = (value) => new Date(value).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', second: '2-digit' });

function DeviceStatus({ connected, active }) {
  const label = !connected ? 'Offline' : active ? 'Online · working' : 'Online · idle';
  return <span className={`inline-flex items-center gap-1.5 rounded-full px-2.5 py-1 text-xs font-semibold ${connected ? 'bg-emerald-100 text-emerald-800' : 'bg-rose-100 text-rose-700'}`}>
    <span className={`h-1.5 w-1.5 rounded-full ${connected ? 'bg-emerald-500' : 'bg-rose-500'}`} />{label}
  </span>;
}

function Assistant({ onClose, selectedDate }) {
  const [question, setQuestion] = useState('');
  const [busy, setBusy] = useState(false);
  const [messages, setMessages] = useState([{ role: 'assistant', text: 'Hi! Ask me about your latest readings, device status, or how to use this dashboard.' }]);
  const send = async (event) => {
    event.preventDefault();
    if (!question.trim() || busy) return;
    const prompt = question.trim();
    setQuestion('');
    setMessages((items) => [...items, { role: 'user', text: prompt }]);
    setBusy(true);
    try {
      const response = await axios.post(`${API}/assistant`, { question: prompt, date: selectedDate });
      setMessages((items) => [...items, { role: 'assistant', text: response.data.answer, source: response.data.source }]);
    } catch (error) {
      setMessages((items) => [...items, { role: 'assistant', text: error.response?.data?.error || 'I could not reach the app data. Please try again.' }]);
    } finally { setBusy(false); }
  };
  return <section className="fixed bottom-5 right-5 z-40 flex h-[min(530px,calc(100vh-40px))] w-[min(390px,calc(100vw-32px))] flex-col overflow-hidden rounded-3xl border border-white/80 bg-white/95 shadow-2xl backdrop-blur-xl">
    <div className="flex items-center justify-between bg-gradient-to-r from-sky-500 to-violet-500 px-5 py-4 text-white">
      <div className="flex items-center gap-3"><span className="rounded-xl bg-white/20 p-2"><Bot size={20} /></span><div><h2 className="font-bold">HVAC assistant</h2><p className="text-xs text-white/80">App data · AI when configured</p></div></div>
      <button onClick={onClose} aria-label="Close assistant" className="rounded-lg p-2 hover:bg-white/15"><X size={19} /></button>
    </div>
    <div className="flex-1 space-y-3 overflow-y-auto p-4" aria-live="polite">
      {messages.map((message, index) => <div key={`${index}-${message.role}`} className={`max-w-[88%] rounded-2xl px-4 py-3 text-sm leading-6 ${message.role === 'user' ? 'ml-auto bg-sky-100 text-slate-800' : 'bg-slate-100 text-slate-700'}`}>{message.text}{message.source && <span className="mt-1 block text-[10px] uppercase tracking-wide text-slate-400">{message.source}</span>}</div>)}
      {busy && <p className="text-sm text-slate-400">Checking app data…</p>}
    </div>
    <form onSubmit={send} className="flex items-center gap-2 border-t border-slate-100 p-3">
      <input value={question} onChange={(event) => setQuestion(event.target.value)} placeholder="Ask about readings or devices…" className="min-w-0 flex-1 rounded-xl bg-slate-100 px-3 py-2.5 text-sm outline-none focus:ring-2 focus:ring-sky-300" aria-label="Ask the HVAC assistant" />
      <button disabled={busy || !question.trim()} className="rounded-xl bg-sky-500 p-2.5 text-white hover:bg-sky-600 disabled:opacity-50" aria-label="Send message"><Send size={17} /></button>
    </form>
  </section>;
}

const Dashboard = () => {
  const { user, logout } = useContext(AuthContext);
  const [logs, setLogs] = useState([]);
  const [settings, setSettings] = useState(null);
  const [fleet, setFleet] = useState({ devices: [], counts: { total: 0, connected: 0, active: 0, fans: 0, connectedFans: 0, activeFans: 0, filters: 0, connectedFilters: 0, activeFilters: 0, esp32: 0 } });
  const [selectedDate, setSelectedDate] = useState(today);
  const [socketOnline, setSocketOnline] = useState(false);
  const [pageError, setPageError] = useState('');
  const [showAssistant, setShowAssistant] = useState(false);
  const [showAddDevice, setShowAddDevice] = useState(false);
  const [newDevice, setNewDevice] = useState({ name: '', device_type: 'esp32', parent_device_id: '' });
  const [newDeviceKey, setNewDeviceKey] = useState('');
  const [adding, setAdding] = useState(false);
  const current = logs.at(-1) || null;

  const refreshFleet = useCallback(async () => {
    const response = await axios.get(`${API}/devices`);
    setFleet(response.data);
  }, []);
  const refreshLogs = useCallback(async (date) => {
    const response = await axios.get(`${API}/sensor-logs`, { params: { date } });
    setLogs(response.data);
  }, []);
  const refreshSettings = useCallback(async () => {
    const response = await axios.get(`${API}/settings`);
    setSettings(response.data);
  }, []);

  useEffect(() => {
    let mounted = true;
    Promise.all([refreshLogs(selectedDate), refreshFleet(), refreshSettings()]).catch((error) => {
      if (mounted) setPageError(error.response?.data?.error || 'Could not load dashboard data. Check the backend connection.');
    });
    const socket = io('http://localhost:5000', { withCredentials: true, reconnection: true });
    socket.on('connect', () => setSocketOnline(true));
    socket.on('disconnect', () => setSocketOnline(false));
    socket.on('sensor_update', (reading) => {
      if (reading.timestamp?.slice(0, 10) === selectedDate) {
        setLogs((items) => [...items, reading]);
      }
      refreshFleet().catch(() => {});
    });
    socket.on('relay_update', () => refreshFleet().catch(() => {}));
    socket.on('devices_update', () => refreshFleet().catch(() => {}));
    const poll = window.setInterval(() => refreshFleet().catch(() => {}), 10000);
    return () => { mounted = false; window.clearInterval(poll); socket.disconnect(); };
  }, [refreshFleet, refreshLogs, refreshSettings, selectedDate]);

  const summary = useMemo(() => {
    if (!logs.length) return null;
    const avg = (key) => logs.reduce((sum, log) => sum + Number(log[key]), 0) / logs.length;
    return { count: logs.length, avgTemp: avg('temperature'), avgHumidity: avg('humidity'), avgAqi: avg('mq135_ppm') };
  }, [logs]);

  const updateSettings = async (event) => {
    event.preventDefault();
    try {
      const response = await axios.put(`${API}/settings`, settings);
      setSettings(response.data);
      setPageError('');
    } catch (error) { setPageError(error.response?.data?.error || 'Could not save settings.'); }
  };
  const toggleFan = async () => {
    if (settings?.auto_mode || !current) return;
    try {
      await axios.post(`${API}/relay`, { fan_status: !current.fan_status });
      await refreshFleet();
    } catch (error) { setPageError(error.response?.data?.error || 'Could not send the fan command.'); }
  };
  const addDevice = async (event) => {
    event.preventDefault();
    setAdding(true);
    try {
      const response = await axios.post(`${API}/devices`, newDevice);
      if (response.data.api_key) setNewDeviceKey(`Device ID: ${response.data.id}\nAPI key: ${response.data.api_key}`);
      setNewDevice({ name: '', device_type: 'esp32', parent_device_id: '' });
      await refreshFleet();
    } catch (error) { setPageError(error.response?.data?.error || 'Could not add device.'); }
    finally { setAdding(false); }
  };
  const toggleDevice = async (device) => {
    try {
      await axios.patch(`${API}/devices/${device.id}`, { is_active: !device.is_active });
      await refreshFleet();
    } catch (error) { setPageError(error.response?.data?.error || 'Could not update device.'); }
  };

  return <main className="min-h-screen px-4 py-6 text-slate-800 sm:px-7 lg:px-10">
    <div className="mx-auto max-w-7xl">
      <header className="mb-8 flex flex-wrap items-center justify-between gap-5">
        <div className="flex items-center gap-4">
          <div className="rounded-2xl bg-gradient-to-br from-sky-500 to-violet-500 p-3 text-white shadow-lg shadow-sky-200"><Activity size={25} /></div>
          <div><p className="text-xs font-bold uppercase tracking-[.22em] text-sky-600">Climate control</p><h1 className="text-2xl font-extrabold tracking-tight text-slate-800 sm:text-3xl">HVAC SafeGuard</h1><p className="mt-0.5 text-sm text-slate-500">Live environment and device health</p></div>
        </div>
        <div className="flex items-center gap-3">
          <div className={`flex items-center gap-2 rounded-full border px-3 py-2 text-sm font-semibold ${socketOnline ? 'border-emerald-200 bg-emerald-50 text-emerald-700' : 'border-amber-200 bg-amber-50 text-amber-700'}`}>
            {socketOnline ? <Wifi size={16} /> : <WifiOff size={16} />}{socketOnline ? 'Dashboard live' : 'Reconnecting'}
          </div>
          <span className="hidden text-sm text-slate-500 sm:inline">Hi, {user?.username}</span>
          <button onClick={logout} className="rounded-xl border border-slate-200 bg-white p-2.5 text-slate-500 hover:text-rose-600" aria-label="Sign out" title="Sign out"><LogOut size={18} /></button>
        </div>
      </header>

      {pageError && <div role="alert" className="mb-5 flex items-center justify-between rounded-2xl border border-rose-200 bg-rose-50 px-4 py-3 text-sm text-rose-700">{pageError}<button onClick={() => setPageError('')} aria-label="Dismiss"><X size={16} /></button></div>}

      <section className="mb-6 grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-6">
        {[
          { label: 'Registered', value: fleet.counts.total, icon: ShieldCheck, tone: 'from-sky-100 to-cyan-50 text-sky-700' },
          { label: 'Connected now', value: fleet.counts.connected, icon: Wifi, tone: 'from-emerald-100 to-teal-50 text-emerald-700' },
          { label: 'Working', value: fleet.counts.active, icon: Check, tone: 'from-violet-100 to-fuchsia-50 text-violet-700' },
          { label: 'ESP32 boards', value: fleet.counts.esp32, icon: Activity, tone: 'from-indigo-100 to-sky-50 text-indigo-700' },
          { label: 'Fans', value: fleet.counts.fans, detail: `${fleet.counts.connectedFans} connected · ${fleet.counts.activeFans} working`, icon: Fan, tone: 'from-amber-100 to-orange-50 text-amber-700' },
          { label: 'Filters', value: fleet.counts.filters, detail: `${fleet.counts.connectedFilters} connected · ${fleet.counts.activeFilters} working`, icon: Filter, tone: 'from-rose-100 to-pink-50 text-rose-700' },
        ].map(({ label, value, detail, icon: Icon, tone }) => <div key={label} className={`rounded-2xl bg-gradient-to-br ${tone} p-4 shadow-sm`}><div className="flex items-center justify-between"><span className="text-xs font-semibold opacity-80">{label}</span><Icon size={17} /></div><p className="mt-2 text-2xl font-extrabold">{value}</p>{detail && <p className="mt-0.5 text-[10px] font-medium opacity-75">{detail}</p>}</div>)}
      </section>

      <section className="mb-6 grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <StatCard title="Temperature" value={current ? Number(current.temperature).toFixed(1) : '—'} unit="°C" icon={Thermometer} isWarning={Boolean(current && settings && current.temperature > settings.temp_threshold)} />
        <StatCard title="Humidity" value={current ? Number(current.humidity).toFixed(1) : '—'} unit="%" icon={Droplets} isWarning={Boolean(current && settings && current.humidity > settings.humidity_threshold)} />
        <StatCard title="Air quality" value={current ? Number(current.mq135_ppm).toFixed(0) : '—'} unit="ppm" icon={Wind} isWarning={Boolean(current && settings && current.mq135_ppm > settings.aqi_threshold)} />
        <div className="rounded-3xl border border-white/80 bg-white/80 p-5 shadow-sm backdrop-blur"><div className="flex items-center justify-between"><p className="text-sm font-semibold text-slate-500">Cooling fan</p><span className="rounded-xl bg-sky-50 p-2 text-sky-600"><Fan size={19} /></span></div><div className="mt-3 flex items-end justify-between"><div><p className="text-2xl font-extrabold text-slate-800">{current ? (current.fan_status ? 'Running' : 'Stopped') : 'No data'}</p><p className="text-xs text-slate-400">Reported by sensor</p></div><button onClick={toggleFan} disabled={!current || settings?.auto_mode} className="rounded-xl bg-gradient-to-r from-sky-500 to-violet-500 px-3 py-2 text-xs font-bold text-white disabled:cursor-not-allowed disabled:opacity-40">{settings?.auto_mode ? 'Auto mode' : current?.fan_status ? 'Turn off' : 'Turn on'}</button></div></div>
      </section>

      <div className="mb-4 flex flex-wrap items-end justify-between gap-3">
        <div><h2 className="text-xl font-extrabold text-slate-800">Sensor history</h2><p className="text-sm text-slate-500">Stored readings for the selected day</p></div>
        <label className="flex items-center gap-2 rounded-xl border border-slate-200 bg-white px-3 py-2 text-sm font-medium text-slate-600 shadow-sm"><CalendarDays size={17} className="text-sky-600" /><span className="sr-only">Choose history date</span><input type="date" value={selectedDate} max={today()} onChange={(event) => setSelectedDate(event.target.value)} className="bg-transparent outline-none" /></label>
      </div>
      {summary && <div className="mb-4 flex flex-wrap gap-x-5 gap-y-2 rounded-2xl border border-sky-100 bg-gradient-to-r from-sky-50 via-violet-50 to-rose-50 px-4 py-3 text-sm text-slate-600"><span><b className="text-slate-800">{summary.count}</b> readings</span><span>Average temp <b className="text-slate-800">{summary.avgTemp.toFixed(1)} °C</b></span><span>Average humidity <b className="text-slate-800">{summary.avgHumidity.toFixed(1)}%</b></span><span>Average AQI <b className="text-slate-800">{summary.avgAqi.toFixed(0)} ppm</b></span></div>}

      <section className="mb-6 grid gap-4 xl:grid-cols-3">
        <div className="xl:col-span-2"><LiveChart data={logs} dataKey="temperature" color="#f59e0b" name="Temperature · °C" /></div>
        <LiveChart data={logs} dataKey="mq135_ppm" color="#8b5cf6" name="Air quality · ppm" />
        <div className="xl:col-span-3"><LiveChart data={logs} dataKey="humidity" color="#0ea5e9" name="Humidity · %" /></div>
      </section>

      <section className="mb-6 overflow-hidden rounded-3xl border border-white/80 bg-white/85 shadow-sm backdrop-blur">
        <div className="flex flex-wrap items-center justify-between gap-3 border-b border-slate-100 px-5 py-4"><div><h2 className="font-extrabold text-slate-800">Daily readings</h2><p className="text-xs text-slate-500">{selectedDate} · {logs.length} saved entries</p></div><ChevronDown className="text-slate-400" size={18} /></div>
        <div className="max-h-80 overflow-auto"><table className="w-full min-w-[620px] text-left text-sm"><thead className="sticky top-0 bg-slate-50 text-xs uppercase tracking-wide text-slate-500"><tr><th className="px-5 py-3">Time</th><th className="px-4 py-3">Temperature</th><th className="px-4 py-3">Humidity</th><th className="px-4 py-3">Air quality</th><th className="px-4 py-3">Fan</th></tr></thead><tbody>{logs.length ? [...logs].reverse().map((log) => <tr key={log.id} className="border-t border-slate-50 text-slate-600"><td className="px-5 py-3">{timeLabel(log.timestamp)}</td><td className="px-4 py-3 font-semibold text-slate-800">{Number(log.temperature).toFixed(1)} °C</td><td className="px-4 py-3">{Number(log.humidity).toFixed(1)}%</td><td className="px-4 py-3">{Number(log.mq135_ppm).toFixed(0)} ppm</td><td className="px-4 py-3">{log.fan_status ? 'Running' : 'Stopped'}</td></tr>) : <tr><td colSpan="5" className="px-5 py-12 text-center text-slate-400">No readings saved for this day. When the ESP32 reports, readings will appear here.</td></tr>}</tbody></table></div>
      </section>

      <section className="mb-6 overflow-hidden rounded-3xl border border-white/80 bg-white/85 shadow-sm backdrop-blur">
        <div className="flex flex-wrap items-center justify-between gap-3 border-b border-slate-100 px-5 py-4"><div><h2 className="font-extrabold text-slate-800">Device fleet</h2><p className="text-xs text-slate-500">ESP32 connection is based on a heartbeat received within 30 seconds</p></div><button onClick={() => { setShowAddDevice((visible) => !visible); setNewDeviceKey(''); }} className="inline-flex items-center gap-2 rounded-xl bg-gradient-to-r from-sky-500 to-violet-500 px-3.5 py-2 text-sm font-bold text-white shadow-sm"><Plus size={16} />Add device</button></div>
        {showAddDevice && <form onSubmit={addDevice} className="grid gap-3 border-b border-slate-100 bg-sky-50/60 p-4 sm:grid-cols-[1fr_180px_auto]"><input value={newDevice.name} onChange={(event) => setNewDevice({ ...newDevice, name: event.target.value })} required maxLength={100} placeholder="Device name" className="rounded-xl border border-slate-200 bg-white px-3 py-2 text-sm outline-none focus:border-sky-400" /><select value={newDevice.device_type} onChange={(event) => setNewDevice({ ...newDevice, device_type: event.target.value })} className="rounded-xl border border-slate-200 bg-white px-3 py-2 text-sm"><option value="esp32">ESP32 board</option><option value="fan">Fan</option><option value="filter">Filter</option></select>{newDevice.device_type !== 'esp32' && <select required value={newDevice.parent_device_id} onChange={(event) => setNewDevice({ ...newDevice, parent_device_id: event.target.value })} className="rounded-xl border border-slate-200 bg-white px-3 py-2 text-sm"><option value="">Choose reporting ESP32</option>{fleet.devices.filter((device) => device.device_type === 'esp32' && device.is_active).map((device) => <option key={device.id} value={device.id}>{device.name}</option>)}</select>}<button disabled={adding} className="rounded-xl bg-slate-800 px-4 py-2 text-sm font-bold text-white disabled:opacity-50">{adding ? 'Adding…' : 'Register'}</button>{newDeviceKey && <div className="flex items-start gap-2 rounded-xl border border-emerald-200 bg-white p-3 text-xs text-slate-600 sm:col-span-3"><Check size={16} className="shrink-0 text-emerald-600" /><p><b>Save this ESP32 key now; it is only shown once.</b><code className="mt-1 block break-all">{newDeviceKey}</code> Send it in the <code>x-device-key</code> header with telemetry to <code>POST /api/device/telemetry</code>.</p><button type="button" onClick={() => navigator.clipboard?.writeText(newDeviceKey)} className="ml-auto shrink-0 rounded-lg bg-slate-100 px-2 py-1">Copy</button></div>}</form>}
        <div className="divide-y divide-slate-100">{fleet.devices.length ? fleet.devices.map((device) => <div key={device.id} className="flex flex-wrap items-center justify-between gap-3 px-5 py-4"><div className="flex items-center gap-3"><span className="rounded-xl bg-gradient-to-br from-sky-100 to-violet-100 p-2.5 text-sky-700">{device.device_type === 'fan' ? <Fan size={18} /> : device.device_type === 'filter' ? <Filter size={18} /> : <Activity size={18} />}</span><div><p className="font-bold text-slate-800">{device.name}</p><p className="text-xs capitalize text-slate-400">{device.device_type} · {device.last_seen ? `last seen ${new Date(device.last_seen).toLocaleString()}` : 'never connected'}</p></div></div><div className="flex items-center gap-3"><DeviceStatus connected={device.connected} active={device.is_working} /><button onClick={() => toggleDevice(device)} className="rounded-lg border border-slate-200 px-2.5 py-1.5 text-xs font-semibold text-slate-600">{device.is_active ? 'Disable' : 'Enable'}</button></div></div>) : <div className="px-5 py-10 text-center text-sm text-slate-400">No devices registered yet. Add an ESP32, fan, or filter to start tracking your fleet.</div>}</div>
      </section>

      {settings && <section className="mb-8 rounded-3xl border border-white/80 bg-white/85 p-5 shadow-sm backdrop-blur"><div className="mb-4 flex items-center gap-2"><ShieldCheck size={19} className="text-violet-600" /><div><h2 className="font-extrabold text-slate-800">Automation settings</h2><p className="text-xs text-slate-500">Set thresholds used by the dashboard</p></div></div><form onSubmit={updateSettings} className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4"><label className="flex items-center gap-3 rounded-xl bg-violet-50 px-3 py-2.5 text-sm font-semibold"><input type="checkbox" checked={settings.auto_mode} onChange={(event) => setSettings({ ...settings, auto_mode: event.target.checked })} className="accent-violet-600" />Automatic mode</label>{[['temp_threshold', 'Max temperature', '°C', 15, 50, 0.5], ['humidity_threshold', 'Max humidity', '%', 30, 90, 1], ['aqi_threshold', 'Max air quality', 'ppm', 100, 1000, 10]].map(([key, label, unit, min, max, step]) => <label key={key} className="text-xs font-semibold text-slate-500">{label}: <b className="text-slate-800">{settings[key]} {unit}</b><input type="range" min={min} max={max} step={step} value={settings[key]} onChange={(event) => setSettings({ ...settings, [key]: Number(event.target.value) })} className="mt-2 block w-full accent-sky-500" /></label>)}<button className="rounded-xl bg-gradient-to-r from-sky-500 to-violet-500 px-4 py-2 text-sm font-bold text-white sm:col-span-2 xl:col-span-4">Save settings</button></form></section>}
      <footer className="pb-4 text-center text-xs text-slate-400">Sensor readings are stored in PostgreSQL. ESP32 online status expires after 30 seconds without telemetry.</footer>
    </div>
    <button onClick={() => setShowAssistant((open) => !open)} className="fixed bottom-5 right-5 z-30 inline-flex items-center gap-2 rounded-full bg-gradient-to-r from-sky-500 to-violet-500 px-5 py-3 font-bold text-white shadow-xl shadow-violet-200 hover:-translate-y-0.5" aria-label="Open HVAC assistant"><Bot size={19} />Ask HVAC helper<CircleHelp size={16} /></button>
    {showAssistant && <Assistant selectedDate={selectedDate} onClose={() => setShowAssistant(false)} />}
  </main>;
};

export default Dashboard;
