import { LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer } from 'recharts';
const LiveChart = ({ data, dataKey, color, name }) => {
  const formatTime = (timeStr) => new Date(timeStr).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });

  return (
    <div className="h-80 rounded-3xl border border-white/80 bg-white/85 p-5 shadow-sm backdrop-blur">
      <h3 className="mb-4 text-sm font-bold text-slate-700">{name}</h3>
      <div className="h-64">
        <ResponsiveContainer width="100%" height="100%">
          <LineChart data={data}>
            <CartesianGrid strokeDasharray="3 3" stroke="#e2e8f0" vertical={false} />
            <XAxis 
              dataKey="timestamp" 
              tickFormatter={formatTime} 
              stroke="#94a3b8"
              tick={{ fill: '#64748b', fontSize: 11 }}
            />
            <YAxis 
              stroke="#94a3b8"
              tick={{ fill: '#64748b', fontSize: 11 }}
            />
            <Tooltip 
              contentStyle={{ backgroundColor: '#ffffff', border: '1px solid #e2e8f0', borderRadius: '12px', boxShadow: '0 12px 24px rgba(15,23,42,.1)' }}
              labelStyle={{ color: '#334155', fontWeight: 700 }}
              labelFormatter={formatTime}
            />
            <Line 
              type="monotone" 
              dataKey={dataKey} 
              stroke={color} 
              strokeWidth={3}
              dot={false}
              activeDot={{ r: 6, fill: color, stroke: '#ffffff', strokeWidth: 2 }}
              isAnimationActive={false}
            />
          </LineChart>
        </ResponsiveContainer>
      </div>
    </div>
  );
};

export default LiveChart;
