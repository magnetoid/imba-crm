import { useState, useEffect, useCallback } from 'react'
import { supabase } from '@imba/shared/supabase'
import { callAIJSON, getCRMRuntimeSettings } from '@imba/shared/lib/ai'
import { logGeneration } from '@/lib/aiGenerations'
import { Button } from '@imba/shared/ui/button'
import { Separator } from '@imba/shared/ui/separator'
import toast from 'react-hot-toast'
import {
  BarChart2, Loader2, TrendingUp, Users, Mail,
  Target, RefreshCw, Brain, DollarSign, Wallet, PieChart,
} from 'lucide-react'
import { forecastRevenue } from '@/lib/crm-utils'

interface LiveStats {
  totalLeads: number
  newLeads: number
  qualifiedLeads: number
  convertedLeads: number
  totalEmails: number
  sentEmails: number
  openedEmails: number
  repliedEmails: number
  avgScore: number
  stageBreakdown: { stage: string; count: number }[]
  forecast: { committed: number; weighted: number; pipeline: number }
  health: { green: number; yellow: number; red: number }
  attribution: { channel: string; touches: number; closed: number }[]
}

const STAGE_COLORS: Record<string, string> = {
  new: '#6C7AE0', qualified: '#3CBFAE', proposal: '#C9A96E',
  negotiation: '#E87A2A', won: '#22c55e', lost: '#64748b',
}

function BarRow({ label, value, max, color }: { label: string; value: number; max: number; color: string }) {
  const pct = max > 0 ? Math.round((value / max) * 100) : 0
  return (
    <div>
      <div className="flex justify-between text-xs text-muted-foreground mb-1.5">
        <span className="capitalize">{label}</span>
        <span className="font-mono">{value}</span>
      </div>
      <div className="h-2 bg-muted rounded-full overflow-hidden">
        <div className="h-full rounded-full transition-all duration-700" style={{ width: `${pct}%`, backgroundColor: color }} />
      </div>
    </div>
  )
}

export default function AIAnalytics() {
    const [stats, setStats] = useState<LiveStats | null>(null)
  const [insights, setInsights] = useState<string[]>([])
  const [loading, setLoading] = useState(true)
  const [generatingInsights, setGeneratingInsights] = useState(false)

  const load = useCallback(async () => {
    setLoading(true)
    const [leadsRes, emailsRes, analyticsRes, journeyRes] = await Promise.all([
      supabase.from('crm_leads').select('id, stage, ai_score, value, probability, deal_health'),
      supabase.from('crm_outreach_emails').select('status'),
      supabase.from('crm_analytics_snapshots').select('ai_insights').order('snapshot_date', { ascending: false }).limit(1).maybeSingle(),
      supabase.from('crm_deal_journey').select('lead_id, channel, kind').limit(2000),
    ])

    const leads = leadsRes.data || []
    const emails = emailsRes.data || []
    const journey = (journeyRes.data || []) as Array<{ lead_id: string; channel: string; kind: string }>
    const stageMap: Record<string, number> = {}
    leads.forEach(l => { stageMap[l.stage] = (stageMap[l.stage] || 0) + 1 })
    const totalScore = leads.reduce((s, l) => s + (l.ai_score || 0), 0)
    const forecast = forecastRevenue(leads)

    // Deal health distribution.
    const health = { green: 0, yellow: 0, red: 0 }
    leads.forEach(l => {
      const h = (l as { deal_health?: string }).deal_health
      if (h === 'red')         health.red++
      else if (h === 'yellow') health.yellow++
      else                     health.green++
    })

    // Multi-touch attribution: count touches per channel and how many of
    // those touches sit on closed-won leads.
    const wonIds = new Set(leads.filter(l => l.stage === 'won').map(l => l.id as string))
    const attrMap: Record<string, { touches: number; closed: number }> = {}
    for (const t of journey) {
      const key = (t.channel || 'other').toLowerCase()
      if (!attrMap[key]) attrMap[key] = { touches: 0, closed: 0 }
      attrMap[key].touches++
      if (wonIds.has(t.lead_id)) attrMap[key].closed++
    }
    const attribution = Object.entries(attrMap)
      .map(([channel, v]) => ({ channel, ...v }))
      .sort((a, b) => b.touches - a.touches)

    setStats({
      totalLeads: leads.length,
      newLeads: leads.filter(l => l.stage === 'new').length,
      qualifiedLeads: leads.filter(l => l.stage === 'qualified').length,
      convertedLeads: leads.filter(l => l.stage === 'won').length,
      totalEmails: emails.length,
      sentEmails: emails.filter(e => ['sent','opened','replied'].includes(e.status)).length,
      openedEmails: emails.filter(e => ['opened','replied'].includes(e.status)).length,
      repliedEmails: emails.filter(e => e.status === 'replied').length,
      avgScore: leads.length > 0 ? Math.round(totalScore / leads.length) : 0,
      stageBreakdown: Object.entries(stageMap).map(([stage, count]) => ({ stage, count })),
      forecast,
      health,
      attribution,
    })

    if (analyticsRes.data?.ai_insights) {
      setInsights(analyticsRes.data.ai_insights as string[])
    }
    setLoading(false)
  }, [])

  useEffect(() => { load() }, [load])

  async function generateInsights() {
    if (!stats) return
    setGeneratingInsights(true)
    const prompt = `You are a B2B sales analyst for Imba Production. Analyze these CRM metrics and provide 5 specific actionable insights.

Lead Pipeline:
- Total leads: ${stats.totalLeads} | New: ${stats.newLeads} | Qualified: ${stats.qualifiedLeads} | Converted: ${stats.convertedLeads}
- Avg AI score: ${stats.avgScore}/100
- Stage breakdown: ${stats.stageBreakdown.map(s => `${s.stage}: ${s.count}`).join(', ')}

Email Outreach:
- Total emails: ${stats.totalEmails} | Sent: ${stats.sentEmails} | Opened: ${stats.openedEmails} | Replied: ${stats.repliedEmails}

Return ONLY a valid JSON array of 5 insight strings.`
    try {
      const runtime = await getCRMRuntimeSettings()
      const arr = await callAIJSON<string[]>(prompt, { maxTokens: 800 })
      setInsights(arr)
      const today = new Date().toISOString().split('T')[0]
      await supabase.from('crm_analytics_snapshots').upsert({ snapshot_date: today, total_leads: stats.totalLeads, qualified_leads: stats.qualifiedLeads, emails_sent: stats.sentEmails, emails_opened: stats.openedEmails, emails_replied: stats.repliedEmails, ai_insights: arr })
      void logGeneration({
        feature: 'analytics_insights',
        taskType: 'reasoning',
        input: prompt,
        output: JSON.stringify(arr),
        inputMeta: { snapshot_date: today, stats },
        provider: runtime.active_ai_provider,
        model: runtime.active_ai_model,
      })
      toast.success('Insights generated')
    } catch (error) {
      void logGeneration({
        feature: 'analytics_insights',
        taskType: 'reasoning',
        input: prompt,
        error: error instanceof Error ? error.message : String(error),
      })
      toast.error(error instanceof Error ? error.message : 'Failed to generate insights')
    }
    setGeneratingInsights(false)
  }

  const openRate = stats?.sentEmails ? Math.round((stats.openedEmails / stats.sentEmails) * 100) : 0
  const replyRate = stats?.sentEmails ? Math.round((stats.repliedEmails / stats.sentEmails) * 100) : 0
  const convRate = stats?.totalLeads ? Math.round((stats.convertedLeads / stats.totalLeads) * 100) : 0

  return (
    <div className="p-8 max-w-5xl mx-auto">
      <div className="flex items-center justify-between mb-1">
        <div className="flex items-center gap-3">
          <BarChart2 className="h-5 w-5 text-primary" />
          <h1 className="text-2xl font-semibold tracking-tight">Analytics</h1>
        </div>
        <div className="flex gap-2">
          <Button variant="outline" size="sm" onClick={load} className="gap-2">
            <RefreshCw className="h-3.5 w-3.5" /> Refresh
          </Button>
          <Button size="sm" className="gap-2" onClick={generateInsights} disabled={generatingInsights}>
            {generatingInsights ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Brain className="h-3.5 w-3.5" />}
            AI Insights
          </Button>
        </div>
      </div>
      <p className="text-muted-foreground text-sm mb-8">Live pipeline metrics and AI-generated sales recommendations.</p>

      {loading ? (
        <div className="flex justify-center py-24"><Loader2 className="h-6 w-6 animate-spin text-muted-foreground" /></div>
      ) : stats ? (
        <>
          {/* KPI Grid */}
          <div className="grid grid-cols-2 lg:grid-cols-4 gap-3 mb-8">
            {[
              { label: 'Total Leads',   value: stats.totalLeads,   icon: Users,      color: 'text-primary' },
              { label: 'Avg AI Score',  value: `${stats.avgScore}`, icon: Target,     color: 'text-blue-600' },
              { label: 'Emails Sent',   value: stats.sentEmails,   icon: Mail,       color: 'text-emerald-600' },
              { label: 'Converted',     value: stats.convertedLeads, icon: TrendingUp, color: 'text-violet-600' },
            ].map(kpi => (
              <div key={kpi.label} className="bg-card border border-border rounded-lg p-4 shadow-sm">
                <div className="flex items-center justify-between mb-3">
                  <p className="text-xs text-muted-foreground">{kpi.label}</p>
                  <kpi.icon className={`h-4 w-4 ${kpi.color}`} />
                </div>
                <p className={`text-3xl font-mono font-bold tracking-tight text-foreground`}>{kpi.value}</p>
              </div>
            ))}
          </div>

          {/* Deal-health distribution + multi-touch attribution */}
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-6 mb-8">
            <div className="bg-card border border-border rounded-lg p-5 shadow-sm">
              <p className="text-sm font-medium mb-1">Deal health</p>
              <p className="text-xs text-muted-foreground mb-4">Where your active deals sit. Red deals need a nudge today.</p>
              {(() => {
                const total = stats.health.green + stats.health.yellow + stats.health.red || 1
                return (
                  <>
                    <div className="flex h-3 rounded-full overflow-hidden mb-4">
                      <div style={{ width: `${(stats.health.green / total) * 100}%`,  background: '#22c55e' }} />
                      <div style={{ width: `${(stats.health.yellow / total) * 100}%`, background: '#f59e0b' }} />
                      <div style={{ width: `${(stats.health.red / total) * 100}%`,    background: '#ef4444' }} />
                    </div>
                    <div className="grid grid-cols-3 gap-3 text-center">
                      <div><p className="text-xl font-mono font-bold text-emerald-600">{stats.health.green}</p><p className="text-xs text-muted-foreground">Green</p></div>
                      <div><p className="text-xl font-mono font-bold text-amber-600">{stats.health.yellow}</p><p className="text-xs text-muted-foreground">Yellow</p></div>
                      <div><p className="text-xl font-mono font-bold text-red-600">{stats.health.red}</p><p className="text-xs text-muted-foreground">Red</p></div>
                    </div>
                  </>
                )
              })()}
            </div>

            <div className="bg-card border border-border rounded-lg p-5 shadow-sm">
              <p className="text-sm font-medium mb-1">Channel attribution</p>
              <p className="text-xs text-muted-foreground mb-4">Touches per channel, with the share that landed on a closed-won deal.</p>
              {stats.attribution.length === 0 ? (
                <p className="text-sm text-muted-foreground">No journey data yet — run a sequence and let it cook.</p>
              ) : (
                <div className="flex flex-col gap-3">
                  {(() => {
                    const max = Math.max(1, ...stats.attribution.map(a => a.touches))
                    return stats.attribution.slice(0, 8).map(a => {
                      const wonPct = a.touches > 0 ? Math.round((a.closed / a.touches) * 100) : 0
                      return (
                        <div key={a.channel}>
                          <div className="flex justify-between text-xs mb-1">
                            <span className="capitalize text-foreground">{a.channel.replace(/_/g, ' ')}</span>
                            <span className="font-mono text-muted-foreground">{a.touches} touches · {wonPct}% on won</span>
                          </div>
                          <div className="h-2 bg-muted rounded-full overflow-hidden relative">
                            <div className="h-full bg-slate-300" style={{ width: `${(a.touches / max) * 100}%` }} />
                            <div className="h-full bg-emerald-500 absolute top-0 left-0" style={{ width: `${(a.closed / max) * 100}%` }} />
                          </div>
                        </div>
                      )
                    })
                  })()}
                </div>
              )}
            </div>
          </div>

          {/* Revenue Forecast */}
          <div className="bg-card border border-border rounded-lg p-5 mb-8 shadow-sm">
            <div className="flex items-center gap-2 mb-5">
              <DollarSign className="h-4 w-4 text-emerald-600" />
              <p className="text-sm font-medium">Revenue Forecast</p>
              <span className="text-xs text-muted-foreground">— weighted by stage &amp; probability</span>
            </div>
            <div className="grid grid-cols-3 gap-3">
              <div className="bg-emerald-50 border border-emerald-200 rounded-lg p-4">
                <div className="flex items-center gap-2 mb-1.5">
                  <Wallet className="h-3.5 w-3.5 text-emerald-700" />
                  <p className="text-xs text-emerald-900">Committed (Won)</p>
                </div>
                <p className="text-2xl font-mono font-bold text-emerald-700">${stats.forecast.committed.toLocaleString()}</p>
              </div>
              <div className="bg-amber-50 border border-amber-200 rounded-lg p-4">
                <div className="flex items-center gap-2 mb-1.5">
                  <PieChart className="h-3.5 w-3.5 text-amber-700" />
                  <p className="text-xs text-amber-900">Weighted Forecast</p>
                </div>
                <p className="text-2xl font-mono font-bold text-amber-700">${stats.forecast.weighted.toLocaleString()}</p>
              </div>
              <div className="bg-muted/40 border border-border rounded-lg p-4">
                <div className="flex items-center gap-2 mb-1.5">
                  <TrendingUp className="h-3.5 w-3.5 text-muted-foreground" />
                  <p className="text-xs text-muted-foreground">Active Pipeline</p>
                </div>
                <p className="text-2xl font-mono font-bold text-foreground">${stats.forecast.pipeline.toLocaleString()}</p>
              </div>
            </div>
          </div>

          <div className="grid grid-cols-1 lg:grid-cols-2 gap-6 mb-8">
            {/* Email Funnel */}
            <div className="bg-card border border-border rounded-lg p-5">
              <p className="text-sm font-medium mb-5">Email Funnel</p>
              <div className="flex flex-col gap-4 mb-5">
                <BarRow label="All emails" value={stats.totalEmails} max={stats.totalEmails || 1} color="#6C7AE0" />
                <BarRow label="Sent" value={stats.sentEmails} max={stats.totalEmails || 1} color="#3CBFAE" />
                <BarRow label="Opened" value={stats.openedEmails} max={stats.sentEmails || 1} color="#C9A96E" />
                <BarRow label="Replied" value={stats.repliedEmails} max={stats.sentEmails || 1} color="#22c55e" />
              </div>
              <Separator className="mb-4" />
              <div className="flex gap-6">
                <div className="text-center">
                  <p className="text-2xl font-mono font-bold text-emerald-600">{openRate}%</p>
                  <p className="text-xs text-muted-foreground mt-0.5">Open rate</p>
                </div>
                <div className="text-center">
                  <p className="text-2xl font-mono font-bold text-violet-600">{replyRate}%</p>
                  <p className="text-xs text-muted-foreground mt-0.5">Reply rate</p>
                </div>
                <div className="text-center">
                  <p className="text-2xl font-mono font-bold text-amber-600">{convRate}%</p>
                  <p className="text-xs text-muted-foreground mt-0.5">Conv. rate</p>
                </div>
              </div>
            </div>

            {/* Pipeline */}
            <div className="bg-card border border-border rounded-lg p-5">
              <p className="text-sm font-medium mb-5">Leads by Stage</p>
              {stats.stageBreakdown.length === 0 ? (
                <p className="text-sm text-muted-foreground">No leads yet — use AI Lead Finder to get started.</p>
              ) : (
                <div className="flex flex-col gap-4">
                  {stats.stageBreakdown.map(row => (
                    <BarRow key={row.stage} label={row.stage} value={row.count} max={stats.totalLeads || 1} color={STAGE_COLORS[row.stage] || '#6C7AE0'} />
                  ))}
                </div>
              )}
            </div>
          </div>

          {/* AI Insights */}
          <div className="bg-card border border-border rounded-lg p-6 shadow-sm">
            <div className="flex items-center gap-2 mb-5">
              <Brain className="h-4 w-4 text-primary" />
              <p className="text-sm font-medium">AI Sales Insights</p>
              {insights.length === 0 && (
                <span className="text-xs text-muted-foreground ml-1">— click "AI Insights" to generate</span>
              )}
            </div>
            {insights.length > 0 ? (
              <div className="flex flex-col gap-3">
                {insights.map((insight, i) => (
                  <div key={i} className="flex gap-3 p-3 bg-amber-50 border border-amber-200 rounded-lg">
                    <div className="w-5 h-5 rounded-full bg-amber-200 flex items-center justify-center flex-shrink-0 mt-0.5">
                      <span className="text-[10px] font-mono font-bold text-amber-700">{i + 1}</span>
                    </div>
                    <p className="text-sm text-foreground leading-relaxed">{insight}</p>
                  </div>
                ))}
              </div>
            ) : (
              <div className="text-center py-8 text-muted-foreground">
                <Brain className="h-10 w-10 mx-auto mb-3 opacity-20" />
                <p className="text-sm">Generate AI insights to get personalized recommendations based on your pipeline.</p>
              </div>
            )}
          </div>
        </>
      ) : null}
    </div>
  )
}
