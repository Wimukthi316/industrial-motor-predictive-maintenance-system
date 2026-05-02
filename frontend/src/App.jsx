import { useCallback, useEffect, useMemo, useState } from 'react'
import axios from 'axios'
import {
  Activity,
  AlertTriangle,
  Bot,
  CheckCircle,
  RefreshCw,
} from 'lucide-react'
import {
  CartesianGrid,
  Legend,
  Line,
  LineChart,
  ResponsiveContainer,
  Scatter,
  ScatterChart,
  Tooltip,
  XAxis,
  YAxis,
} from 'recharts'

const API_BASE = 'http://127.0.0.1:8000'

const chartMargin = { top: 8, right: 16, left: 0, bottom: 8 }

const axisTick = { fill: '#94a3b8', fontSize: 11 }
const axisLine = { stroke: '#475569' }
const gridStroke = '#334155'

const tooltipStyle = {
  backgroundColor: '#1e293b',
  border: '1px solid #334155',
  borderRadius: '8px',
  color: '#e2e8f0',
  fontSize: '12px',
}

function formatTickTime(value) {
  if (value == null) return ''
  const s = String(value)
  return s.length > 16 ? s.slice(5, 16) : s
}

/** Loading gate: full-screen spinner + status copy. */
function LoadingView() {
  return (
    <div className="flex h-screen flex-col items-center justify-center bg-[#0f172a] text-slate-300">
      <div
        className="mb-4 h-12 w-12 animate-spin rounded-full border-2 border-slate-600 border-t-cyan-500"
        role="status"
        aria-label="Loading"
      />
      <p className="max-w-md animate-pulse px-4 text-center text-sm tracking-wide text-slate-400">
        Initializing AI Models &amp; Loading Telemetry...
      </p>
    </div>
  )
}

/** Recoverable error state with retry. */
function ErrorView({ message, onRetry }) {
  return (
    <div className="flex h-screen flex-col items-center justify-center bg-[#0f172a] px-6 text-center text-slate-200">
      <AlertTriangle className="mb-4 h-12 w-12 text-amber-500" aria-hidden />
      <h1 className="mb-2 text-lg font-semibold text-white">
        Unable to reach telemetry API
      </h1>
      <p className="mb-6 max-w-md text-sm text-slate-400">{message}</p>
      <button
        type="button"
        onClick={onRetry}
        className="inline-flex items-center gap-2 rounded-lg bg-cyan-600 px-4 py-2 text-sm font-medium text-white shadow-lg transition hover:bg-cyan-500 focus:outline-none focus:ring-2 focus:ring-cyan-400 focus:ring-offset-2 focus:ring-offset-[#0f172a]"
      >
        <RefreshCw className="h-4 w-4" aria-hidden />
        Retry
      </button>
    </div>
  )
}

function KpiCard({
  title,
  value,
  icon: Icon,
  iconClassName = 'text-cyan-400',
  cardClassName = '',
  titleClassName = 'text-slate-500',
  valueClassName = 'text-white',
}) {
  return (
    <div
      className={`rounded-xl border border-slate-700/80 bg-slate-900/50 p-5 shadow-lg backdrop-blur-sm ${cardClassName}`}
    >
      <div className="flex items-start justify-between gap-3">
        <div>
          <p
            className={`text-xs font-medium uppercase tracking-wider ${titleClassName}`}
          >
            {title}
          </p>
          <p
            className={`mt-2 text-3xl font-semibold tabular-nums ${valueClassName}`}
          >
            {value?.toLocaleString?.() ?? value ?? '—'}
          </p>
        </div>
        <div
          className={`rounded-lg bg-slate-800/80 p-2.5 ${iconClassName}`}
          aria-hidden
        >
          <Icon className="h-6 w-6" strokeWidth={1.75} />
        </div>
      </div>
    </div>
  )
}

function ChartCard({ title, subtitle, children }) {
  return (
    <div className="rounded-xl border border-slate-700/80 bg-slate-900/40 p-4 shadow-md">
      <h3 className="text-sm font-semibold text-white">{title}</h3>
      {subtitle ? (
        <p className="mt-0.5 text-xs text-slate-500">{subtitle}</p>
      ) : null}
      <div className="mt-3 h-64 min-h-[256px] w-full min-w-0 shrink-0">
        {children}
      </div>
    </div>
  )
}

function ThermalTrendChart({ data }) {
  return (
    <ResponsiveContainer width="100%" height={256}>
      <LineChart data={data} margin={chartMargin}>
        <defs>
          <linearGradient id="thermalLineGradient" x1="0" y1="0" x2="1" y2="0">
            <stop offset="0%" stopColor="#fb923c" />
            <stop offset="100%" stopColor="#ef4444" />
          </linearGradient>
        </defs>
        <CartesianGrid strokeDasharray="3 3" stroke={gridStroke} opacity={0.6} />
        <XAxis
          dataKey="timestamp"
          tick={axisTick}
          tickLine={axisLine}
          axisLine={axisLine}
          tickFormatter={formatTickTime}
          interval="preserveStartEnd"
          minTickGap={28}
        />
        <YAxis
          dataKey="motor_temp"
          tick={axisTick}
          tickLine={axisLine}
          axisLine={axisLine}
          width={36}
          label={{
            value: '°C',
            angle: -90,
            position: 'insideLeft',
            fill: '#64748b',
            fontSize: 11,
          }}
        />
        <Tooltip
          contentStyle={tooltipStyle}
          labelFormatter={(label) => String(label)}
        />
        <Line
          type="monotone"
          dataKey="motor_temp"
          name="Motor temp"
          stroke="url(#thermalLineGradient)"
          strokeWidth={2.5}
          dot={false}
          activeDot={{ r: 5, fill: '#f97316' }}
        />
      </LineChart>
    </ResponsiveContainer>
  )
}

function VibrationTrendChart({ data }) {
  return (
    <ResponsiveContainer width="100%" height={256}>
      <LineChart data={data} margin={{ ...chartMargin, bottom: 28 }}>
        <CartesianGrid strokeDasharray="3 3" stroke={gridStroke} opacity={0.6} />
        <XAxis
          dataKey="timestamp"
          tick={axisTick}
          tickLine={axisLine}
          axisLine={axisLine}
          tickFormatter={formatTickTime}
          interval="preserveStartEnd"
          minTickGap={28}
        />
        <YAxis
          tick={axisTick}
          tickLine={axisLine}
          axisLine={axisLine}
          width={36}
        />
        <Tooltip contentStyle={tooltipStyle} labelFormatter={(l) => String(l)} />
        <Legend
          wrapperStyle={{ fontSize: '12px', paddingTop: '8px' }}
          formatter={(value) => (
            <span className="text-slate-300">{value}</span>
          )}
        />
        <Line
          type="monotone"
          dataKey="vib_x"
          name="Vib X"
          stroke="#22d3ee"
          strokeWidth={2}
          dot={false}
        />
        <Line
          type="monotone"
          dataKey="vib_y"
          name="Vib Y"
          stroke="#a78bfa"
          strokeWidth={2}
          dot={false}
        />
        <Line
          type="monotone"
          dataKey="vib_z"
          name="Vib Z"
          stroke="#fbbf24"
          strokeWidth={2}
          dot={false}
        />
      </LineChart>
    </ResponsiveContainer>
  )
}

/**
 * Isolation Forest outcomes: anomaly_score -1 → red, larger dot; 1 → slate, smaller.
 */
function scatterShape(props) {
  const { cx, cy, payload } = props
  if (cx == null || cy == null || !payload) return null
  const isAnomaly = payload.anomaly_score === -1
  const r = isAnomaly ? 6 : 3.5
  const fill = isAnomaly ? '#ef4444' : '#64748b'
  return <circle cx={cx} cy={cy} r={r} fill={fill} fillOpacity={0.92} />
}

function AnomalyScatterPanel({ data }) {
  return (
    <div className="rounded-xl border border-slate-700/80 bg-slate-900/40 p-4 shadow-md">
      <h3 className="text-sm font-semibold text-white">
        Current vs temperature (anomaly overlay)
      </h3>
      <p className="mt-0.5 text-xs text-slate-500">
        Red: Isolation Forest anomaly (&minus;1) &middot; Slate: normal (1)
      </p>
      <div className="mt-3 h-80 min-h-[320px] w-full min-w-0 shrink-0">
        <ResponsiveContainer width="100%" height={320}>
          <ScatterChart margin={{ top: 8, right: 16, left: 8, bottom: 8 }}>
            <CartesianGrid strokeDasharray="3 3" stroke={gridStroke} opacity={0.6} />
            <XAxis
              type="number"
              dataKey="motor_temp"
              name="Motor temp"
              unit="°C"
              tick={axisTick}
              tickLine={axisLine}
              axisLine={axisLine}
            />
            <YAxis
              type="number"
              dataKey="amp"
              name="Amps"
              tick={axisTick}
              tickLine={axisLine}
              axisLine={axisLine}
              width={40}
            />
            <Tooltip
              cursor={{ strokeDasharray: '3 3' }}
              contentStyle={tooltipStyle}
              formatter={(value, name) => [value, name]}
              labelFormatter={() => 'Reading'}
            />
            <Scatter name="Motors" data={data} shape={scatterShape} />
          </ScatterChart>
        </ResponsiveContainer>
      </div>
    </div>
  )
}

function AiDiagnosticsPanel({
  chatHistory,
  chatInput,
  onChatInputChange,
  onSubmit,
  isChatLoading,
}) {
  return (
    <aside className="flex h-full min-h-0 w-1/4 shrink-0 flex-col border-l border-slate-700/80 bg-[#1e293b] shadow-xl">
      <div className="flex items-center gap-2 border-b border-slate-700/80 px-4 py-3">
        <Bot className="h-5 w-5 text-cyan-400" aria-hidden />
        <h2 className="text-sm font-semibold tracking-tight text-white">
          AI Diagnostics
        </h2>
      </div>
      <div className="min-h-0 flex-1 space-y-3 overflow-y-auto px-4 py-4">
        {chatHistory.map((entry, index) => (
          <div
            key={`${entry.sender}-${index}`}
            className={`flex w-full ${entry.sender === 'user' ? 'justify-end' : 'justify-start'}`}
          >
            {entry.sender === 'user' ? (
              <div className="max-w-[88%] rounded-lg rounded-tr-sm bg-sky-900/60 px-3 py-2.5 text-left text-sm text-slate-100 shadow-md ring-1 ring-sky-700/40">
                <p className="text-[10px] font-medium uppercase tracking-wide text-sky-300/90">
                  You
                </p>
                <p className="mt-1 whitespace-pre-wrap leading-relaxed">
                  {entry.text}
                </p>
              </div>
            ) : (
              <div className="max-w-[88%] rounded-lg rounded-tl-sm border border-slate-600/80 bg-transparent px-3 py-2.5 text-sm text-slate-200 shadow-sm">
                <p className="text-[10px] font-medium uppercase tracking-wide text-cyan-500/90">
                  AI
                </p>
                <p className="mt-1 whitespace-pre-wrap leading-relaxed text-slate-300">
                  {entry.text}
                </p>
              </div>
            )}
          </div>
        ))}
        {isChatLoading ? (
          <p className="pl-1 text-xs italic text-slate-500">Agent is thinking...</p>
        ) : null}
      </div>
      <div className="border-t border-slate-700/80 p-3">
        <form onSubmit={onSubmit} className="flex gap-2">
          <input
            type="text"
            value={chatInput}
            onChange={onChatInputChange}
            disabled={isChatLoading}
            placeholder="Ask about motor telemetry..."
            className="min-w-0 flex-1 rounded-lg border border-slate-600 bg-slate-800/80 px-3 py-2.5 text-sm text-slate-200 placeholder:text-slate-500 focus:border-cyan-600 focus:outline-none focus:ring-1 focus:ring-cyan-600 disabled:cursor-not-allowed disabled:opacity-60"
            aria-label="Chat message"
          />
          <button
            type="submit"
            disabled={isChatLoading}
            className="shrink-0 rounded-lg bg-cyan-600 px-3 py-2 text-sm font-medium text-white shadow hover:bg-cyan-500 focus:outline-none focus:ring-2 focus:ring-cyan-400 focus:ring-offset-2 focus:ring-offset-[#1e293b] disabled:cursor-not-allowed disabled:opacity-50"
          >
            Send
          </button>
        </form>
      </div>
    </aside>
  )
}

function AppHeader() {
  return (
    <header className="flex shrink-0 items-center border-b border-slate-800 bg-slate-950/80 px-6 py-3 backdrop-blur-md">
      <div className="flex items-center gap-3">
        <div className="h-2 w-2 animate-pulse rounded-full bg-emerald-500 shadow-[0_0_10px_#10b981]" />
        <h1 className="text-base font-semibold tracking-tight text-white md:text-lg">
          Predictive Maintenance System - Plant 01
        </h1>
      </div>
      <span className="ml-auto hidden text-xs text-slate-500 sm:inline">
        Live telemetry
      </span>
    </header>
  )
}

function App() {
  const [motorData, setMotorData] = useState([])
  const [stats, setStats] = useState(null)
  const [isLoading, setIsLoading] = useState(true)
  const [error, setError] = useState(null)

  const [chatInput, setChatInput] = useState('')
  const [chatHistory, setChatHistory] = useState([
    {
      sender: 'ai',
      text: "Hello! I am the Human-in-the-Loop Escalation Agent. How can I assist you with the motor data today?",
    },
  ])
  const [isChatLoading, setIsChatLoading] = useState(false)

  const loadData = useCallback(async () => {
    setError(null)
    setIsLoading(true)
    try {
      const [statsRes, motorRes] = await Promise.all([
        axios.get(`${API_BASE}/api/stats`),
        axios.get(`${API_BASE}/api/motor-data`),
      ])
      setStats(statsRes.data)
      setMotorData(Array.isArray(motorRes.data) ? motorRes.data : [])
    } catch (err) {
      const msg =
        err?.response?.data?.detail ||
        err?.message ||
        'Network error — is the FastAPI backend running on port 8000?'
      setError(typeof msg === 'string' ? msg : 'Request failed')
      setStats(null)
      setMotorData([])
    } finally {
      setIsLoading(false)
    }
  }, [])

  useEffect(() => {
    loadData()
  }, [loadData])

  const chartData = useMemo(() => motorData.slice(-150), [motorData])

  const handleSendMessage = async (e) => {
    e.preventDefault()
    const text = chatInput.trim()
    if (!text) return

    setChatHistory((prev) => [...prev, { sender: 'user', text }])
    setChatInput('')
    setIsChatLoading(true)

    try {
      const res = await axios.post(`${API_BASE}/api/chat`, { message: text })
      const reply = res.data?.response
      const aiText =
        reply != null && reply !== ''
          ? String(reply)
          : 'No response from the agent.'
      setChatHistory((prev) => [...prev, { sender: 'ai', text: aiText }])
    } catch (err) {
      const fromApi = err?.response?.data?.response
      const details =
        typeof fromApi === 'string'
          ? fromApi
          : err?.message || 'Network error — could not reach the chat API.'
      setChatHistory((prev) => [
        ...prev,
        {
          sender: 'ai',
          text: `Sorry, I could not complete that request. ${details}`,
        },
      ])
    } finally {
      setIsChatLoading(false)
    }
  }

  if (isLoading) {
    return <LoadingView />
  }

  if (error) {
    return <ErrorView message={error} onRetry={loadData} />
  }

  return (
    <div className="flex h-screen flex-col overflow-hidden bg-[#0f172a] text-slate-200">
      <AppHeader />
      <div className="flex min-h-0 flex-1">
        <main className="flex w-3/4 min-w-0 flex-col overflow-y-auto">
          <div className="space-y-6 p-6 pb-10">
            <section className="grid grid-cols-1 gap-4 md:grid-cols-3">
              <KpiCard
                title="Total records"
                value={stats?.total_records ?? 0}
                icon={Activity}
                iconClassName="text-cyan-400"
              />
              <KpiCard
                title="Normal state"
                value={stats?.normal_count ?? 0}
                icon={CheckCircle}
                iconClassName="text-emerald-400"
              />
              <KpiCard
                title="Critical anomalies"
                value={stats?.anomaly_count ?? 0}
                icon={AlertTriangle}
                iconClassName="text-red-500"
                titleClassName="text-red-500"
                valueClassName="text-red-500"
                cardClassName="border-red-500/40 shadow-[0_0_24px_rgba(239,68,68,0.12)]"
              />
            </section>

            <section className="grid grid-cols-1 gap-4 lg:grid-cols-2">
              <ChartCard
                title="Thermal trend"
                subtitle="Last 150 samples — motor temperature"
              >
                <ThermalTrendChart data={chartData} />
              </ChartCard>
              <ChartCard
                title="Vibration triaxial"
                subtitle="Vib X, Y, Z — last 150 samples"
              >
                <VibrationTrendChart data={chartData} />
              </ChartCard>
            </section>

            <section>
              <AnomalyScatterPanel data={chartData} />
            </section>
          </div>
        </main>
        <AiDiagnosticsPanel
          chatHistory={chatHistory}
          chatInput={chatInput}
          onChatInputChange={(e) => setChatInput(e.target.value)}
          onSubmit={handleSendMessage}
          isChatLoading={isChatLoading}
        />
      </div>
    </div>
  )
}

export default App
