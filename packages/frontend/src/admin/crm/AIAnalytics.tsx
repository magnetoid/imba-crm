import { useState, useEffect, useCallback } from 'react'
import { supabase } from '@/lib/supabase'
import { callAIJSON } from '@/lib/ai'
import { Button } from '@/components/ui/button'
import { Separator } from '@/components/ui/separator'
import toast from 'react-hot-toast'
import {
  BarChart2, Loader2, TrendingUp, Users, Mail,
  Target, RefreshCw, Brain, DollarSign, Wallet, PieChart,
} from 'lucide-react'
import { forecastRevenue } from './crm-utils'

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
    const [leadsRes, emailsRes, analyticsRes] = await Promise.all([
      supabase.from('crm_leads').select('stage, ai_score, value, probability'),
      supabase.from('crm_outreach_emails').select('status'),
      supabase.from('crm_analytics_snapshots').select('ai_insights').order('snapshot_date', { ascending: false }).limit(1).maybeSingle(),
    ])

    const leads = leadsRes.data || []
    const emails = emailsRes.data || []
    const stageMap: Record<string, number> = {}
    leads.forEach(l => { stageMap[l.stage] = (stageMap[l.stage] || 0) + 1 })
    const totalScore = leads.reduce((s, l) => s + (l.ai_score || 0), 0)
    const forecast = forecastRevenue(leads)

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
      const arr = await callAIJSON<string[]>(prompt, { maxTokens: 800 })
      setInsights(arr)
      const today = new Date().toISOString().split('T')[0]
      await supabase.from('crm_analytics_snapshots').upsert({ snapshot_date: today, total_leads: stats.totalLeads, qualified_leads: stats.qualifiedLeads, emails_sent: stats.sentEmails, emails_opened: stats.openedEmails, emails_replied: stats.repliedEmails, ai_insights: arr })
      toast.success('Insights generated')
    } catch (error) { toast.error(error instanceof Error ? error.message : 'Failed to generate insights') }
    setGeneratingInsights(false)
  }

  const openRate = stats?.sentEmails ? Math.round((stats.openedEmails / stats.sentEmails) * 100) : 0
  const replyRate = stats?.sentEmails ? Math.round((stats.repliedEmails / stats.sentEmails) * 100) : 0
  const convRate = stats?.totalLeads ? Math.round((stats.convertedLeads / stats.totalLeads) * 100) : 0

  return (
    <div className="p-8 max-w-5xl mx-auto">
      <div className="flex items-center justify-between mb-1">
        <div className="flex items-center gap-3">
          <BarChart2 className="h-5 w-5 text-amber-500" />
          <h1 className="text-2xl font-semibold">Analytics</h1>
        </div>
        <div className="flex gap-2">
          <Button variant="outline" size="sm" onClick={load} className="gap-2">
            <RefreshCw className="h-3.5 w-3.5" /> Refresh
          </Button>
          <Button size="sm" className="gap-2 bg-amber-500 hover:bg-amber-600 text-black" onClick={generateInsights} disabled={generatingInsights}>
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
          <div className="grid grid-cols-2 lg:grid-cols-4 gap-4 mb-8">
            {[
              { label: 'Total Leads',   value: stats.totalLeads,   icon: Users,       color: 'text-amber-400' },
              { label: 'Avg AI Score',  value: `${stats.avgScore}`, icon: Target,      color: 'text-blue-400' },
              { label: 'Emails Sent',   value: stats.sentEmails,   icon: Mail,        color: 'text-emerald-400' },
              { label: 'Converted',     value: stats.convertedLeads, icon: TrendingUp, color: 'text-purple-400' },
            ].map(kpi => (
              <div key={kpi.label} className="bg-card border border-border rounded-lg p-4">
                <div className="flex items-center justify-between mb-3">
                  <p className="text-xs text-muted-foreground">{kpi.label}</p>
                  <kpi.icon className={`h-4 w-4 ${kpi.color}`} />
                </div>
                <p className={`text-3xl font-mono font-bold ${kpi.color}`}>{kpi.value}</p>
              </div>
            ))}
          </div>

          {/* Revenue Forecast */}
          <div className="bg-card border border-border rounded-lg p-5 mb-8">
            <div className="flex items-center gap-2 mb-5">
              <DollarSign className="h-4 w-4 text-emerald-400" />
              <p className="text-sm font-medium">Revenue Forecast</p>
              <span className="text-xs text-muted-foreground">— weighted by stage & probability</span>
            </div>
            <div className="grid grid-cols-3 gap-4">
              <div className="bg-emerald-500/5 border border-emerald-500/20 rounded-lg p-4">
                <div className="flex items-center gap-2 mb-1.5">
                  <Wallet className="h-3.5 w-3.5 text-emerald-400" />
                  <p className="text-xs text-muted-foreground">Committed (Won)</p>
                </div>
                <p className="text-2xl font-mono font-bold text-emerald-400">${stats.forecast.committed.toLocaleString()}</p>
              </div>
              <div className="bg-amber-500/5 border border-amber-500/20 rounded-lg p-4">
                <div className="flex items-center gap-2 mb-1.5">
                  <PieChart className="h-3.5 w-3.5 text-amber-400" />
                  <p className="text-xs text-muted-foreground">Weighted Forecast</p>
                </div>
                <p className="text-2xl font-mono font-bold text-amber-400">${stats.forecast.weighted.toLocaleString()}</p>
              </div>
              <div className="bg-muted/20 border border-border rounded-lg p-4">
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
                  <p className="text-2xl font-mono font-bold text-emerald-400">{openRate}%</p>
                  <p className="text-xs text-muted-foreground mt-0.5">Open rate</p>
                </div>
                <div className="text-center">
                  <p className="text-2xl font-mono font-bold text-purple-400">{replyRate}%</p>
                  <p className="text-xs text-muted-foreground mt-0.5">Reply rate</p>
                </div>
                <div className="text-center">
                  <p className="text-2xl font-mono font-bold text-amber-400">{convRate}%</p>
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
          <div className="bg-card border border-border rounded-lg p-6">
            <div className="flex items-center gap-2 mb-5">
              <Brain className="h-4 w-4 text-amber-500" />
              <p className="text-sm font-medium">AI Sales Insights</p>
              {insights.length === 0 && (
                <span className="text-xs text-muted-foreground ml-1">— click "AI Insights" to generate</span>
              )}
            </div>
            {insights.length > 0 ? (
              <div className="flex flex-col gap-3">
                {insights.map((insight, i) => (
                  <div key={i} className="flex gap-3 p-3 bg-amber-500/5 border border-amber-500/10 rounded-lg">
                    <div className="w-5 h-5 rounded-full bg-amber-500/15 flex items-center justify-center flex-shrink-0 mt-0.5">
                      <span className="text-[10px] font-mono font-bold text-amber-500">{i + 1}</span>
                    </div>
                    <p className="text-sm text-muted-foreground leading-relaxed">{insight}</p>
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
