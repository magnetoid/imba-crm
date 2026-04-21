import { useState, useEffect, useCallback } from 'react'
import { supabase } from '@/lib/supabase'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Textarea } from '@/components/ui/textarea'

import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from '@/components/ui/dialog'
import { Separator } from '@/components/ui/separator'
import toast from 'react-hot-toast'
import {
  Receipt, Loader2, Plus, Trash2, Send, CheckCircle2, AlertCircle,
  DollarSign, Clock, RefreshCw, ExternalLink, Copy, Check, CreditCard,
} from 'lucide-react'

interface CRMLead {
  id: string
  name: string
  email?: string
  company?: string
  stage: string
  value?: number
}

interface Proposal {
  id: string
  lead_id: string
  title: string
  amount: number | null
  status: string
}

interface Invoice {
  id: string
  lead_id: string
  proposal_id: string | null
  invoice_number: string
  amount: number
  tax: number
  total: number
  currency: string
  status: string
  due_date: string | null
  paid_at: string | null
  stripe_invoice_id: string | null
  stripe_payment_url: string | null
  notes: string | null
  created_at: string
  updated_at: string
  crm_leads?: { name: string; company: string; email: string } | null
}

const STATUS_META: Record<string, { label: string; color: string; bg: string }> = {
  draft:     { label: 'Draft',     color: 'text-muted-foreground', bg: 'bg-muted/20' },
  sent:      { label: 'Sent',      color: 'text-blue-400', bg: 'bg-blue-500/10' },
  paid:      { label: 'Paid',      color: 'text-emerald-400', bg: 'bg-emerald-500/10' },
  overdue:   { label: 'Overdue',   color: 'text-red-400', bg: 'bg-red-500/10' },
  cancelled: { label: 'Cancelled', color: 'text-muted-foreground/50', bg: 'bg-muted/10' },
}

function generateInvoiceNumber() {
  const now = new Date()
  const y = now.getFullYear().toString().slice(2)
  const m = (now.getMonth() + 1).toString().padStart(2, '0')
  const seq = Math.floor(Math.random() * 900 + 100)
  return `INV-${y}${m}-${seq}`
}

export default function Invoices() {
  const [leads, setLeads] = useState<CRMLead[]>([])
  const [proposals, setProposals] = useState<Proposal[]>([])
  const [invoices, setInvoices] = useState<Invoice[]>([])
  const [loading, setLoading] = useState(true)
  const [statusFilter, setStatusFilter] = useState('all')
  const [copied, setCopied] = useState<string | null>(null)
  const [creatingStripe, setCreatingStripe] = useState<string | null>(null)

  // Create dialog
  const [createOpen, setCreateOpen] = useState(false)
  const [selectedLead, setSelectedLead] = useState('')
  const [selectedProposal, setSelectedProposal] = useState('')
  const [invoiceNumber, setInvoiceNumber] = useState('')
  const [amount, setAmount] = useState('')
  const [tax, setTax] = useState('0')
  const [currency, setCurrency] = useState('USD')
  const [dueDate, setDueDate] = useState('')
  const [notes, setNotes] = useState('')
  const [saving, setSaving] = useState(false)

  const load = useCallback(async () => {
    setLoading(true)
    const [leadsRes, proposalsRes, invoicesRes] = await Promise.all([
      supabase.from('crm_leads').select('id,name,email,company,stage,value').order('created_at', { ascending: false }),
      supabase.from('crm_proposals').select('id,lead_id,title,amount,status').eq('status', 'signed'),
      supabase.from('crm_invoices').select('*, crm_leads(name,company,email)').order('created_at', { ascending: false }),
    ])
    setLeads((leadsRes.data as CRMLead[]) || [])
    setProposals((proposalsRes.data as Proposal[]) || [])
    setInvoices((invoicesRes.data as Invoice[]) || [])
    setLoading(false)
  }, [])

  useEffect(() => { load() }, [load])

  function openCreate(leadId?: string) {
    setSelectedLead(leadId || '')
    setSelectedProposal('')
    setInvoiceNumber(generateInvoiceNumber())
    setAmount('')
    setTax('0')
    setCurrency('USD')
    setDueDate('')
    setNotes('')
    setCreateOpen(true)
  }

  // Auto-fill from proposal
  useEffect(() => {
    if (selectedProposal) {
      const p = proposals.find(x => x.id === selectedProposal)
      if (p?.amount) {
        setAmount(p.amount.toString())
        if (!selectedLead) setSelectedLead(p.lead_id)
      }
    }
  }, [selectedProposal, proposals, selectedLead])

  async function saveInvoice() {
    if (!selectedLead || !invoiceNumber || !amount) return
    const amountNum = parseFloat(amount) || 0
    const taxNum = parseFloat(tax) || 0
    setSaving(true)
    const { error } = await supabase.from('crm_invoices').insert({
      lead_id: selectedLead,
      proposal_id: selectedProposal || null,
      invoice_number: invoiceNumber,
      amount: amountNum,
      tax: taxNum,
      total: amountNum + taxNum,
      currency,
      due_date: dueDate || null,
      notes: notes || null,
      status: 'draft',
    })
    setSaving(false)
    if (error) { toast.error(error.message || 'Failed to save'); return }
    toast.success('Invoice created')
    setCreateOpen(false)
    load()
  }

  async function updateStatus(id: string, status: string, extra?: Record<string, unknown>) {
    await supabase.from('crm_invoices').update({ status, ...extra }).eq('id', id)
    setInvoices(prev => prev.map(i => i.id === id ? { ...i, status, ...extra } as Invoice : i))
    toast.success(`Marked as ${status}`)
  }

  async function deleteInvoice(id: string) {
    if (!confirm('Delete this invoice?')) return
    await supabase.from('crm_invoices').delete().eq('id', id)
    setInvoices(prev => prev.filter(i => i.id !== id))
    toast.success('Deleted')
  }

  async function createStripeLink(inv: Invoice) {
    setCreatingStripe(inv.id)
    try {
      const { data, error } = await supabase.functions.invoke('stripe-checkout', {
        body: { invoice_id: inv.id },
      })
      if (error) throw error
      if (data?.error) throw new Error(data.error)
      if (!data?.url) throw new Error('No payment URL returned')
      setInvoices(prev => prev.map(i => i.id === inv.id ? { ...i, stripe_payment_url: data.url, stripe_invoice_id: data.session_id, status: i.status === 'draft' ? 'sent' : i.status } : i))
      toast.success('Stripe payment link created')
      window.open(data.url, '_blank')
    } catch (e) {
      const msg = e instanceof Error ? e.message : 'Failed to create Stripe link'
      toast.error(msg)
    }
    setCreatingStripe(null)
  }

  function copyInvoice(inv: Invoice) {
    const text = `Invoice: ${inv.invoice_number}\nClient: ${inv.crm_leads?.company || inv.crm_leads?.name}\nAmount: $${inv.amount.toLocaleString()}\nTax: $${inv.tax.toLocaleString()}\nTotal: $${inv.total.toLocaleString()}\nDue: ${inv.due_date || 'N/A'}\n${inv.notes ? `\nNotes: ${inv.notes}` : ''}`
    navigator.clipboard.writeText(text)
    setCopied(inv.id)
    setTimeout(() => setCopied(null), 2000)
  }

  const filtered = statusFilter === 'all' ? invoices : invoices.filter(i => i.status === statusFilter)
  const totalRevenue = invoices.filter(i => i.status === 'paid').reduce((s, i) => s + i.total, 0)
  const outstanding = invoices.filter(i => ['sent', 'overdue'].includes(i.status)).reduce((s, i) => s + i.total, 0)

  // Check for overdue invoices
  useEffect(() => {
    const now = new Date()
    invoices.forEach(inv => {
      if (inv.status === 'sent' && inv.due_date && new Date(inv.due_date) < now) {
        supabase.from('crm_invoices').update({ status: 'overdue' }).eq('id', inv.id)
        setInvoices(prev => prev.map(i => i.id === inv.id ? { ...i, status: 'overdue' } : i))
      }
    })
  }, [invoices.length]) // Only re-run when count changes, not on every state update

  const leadProposals = proposals.filter(p => p.lead_id === selectedLead)

  return (
    <div className="p-8 max-w-6xl mx-auto">
      <div className="flex items-center justify-between mb-1">
        <div className="flex items-center gap-3">
          <Receipt className="h-5 w-5 text-amber-500" />
          <h1 className="text-2xl font-semibold">Invoices</h1>
        </div>
        <div className="flex gap-2">
          <Button variant="outline" size="sm" onClick={load} className="gap-2">
            <RefreshCw className="h-3.5 w-3.5" /> Refresh
          </Button>
          <Button size="sm" className="gap-2 bg-amber-500 hover:bg-amber-600 text-black" onClick={() => openCreate()}>
            <Plus className="h-4 w-4" /> New invoice
          </Button>
        </div>
      </div>
      <p className="text-muted-foreground text-sm mb-8">Create invoices from signed proposals. Track payments and revenue. Stripe-ready.</p>

      {/* Stats */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3 mb-8">
        {[
          { label: 'Total invoices', value: invoices.length, icon: Receipt },
          { label: 'Revenue', value: totalRevenue ? `$${totalRevenue.toLocaleString()}` : '$0', icon: DollarSign, color: 'text-emerald-400' },
          { label: 'Outstanding', value: outstanding ? `$${outstanding.toLocaleString()}` : '$0', icon: Clock, color: outstanding > 0 ? 'text-amber-400' : undefined },
          { label: 'Overdue', value: invoices.filter(i => i.status === 'overdue').length, icon: AlertCircle, color: invoices.some(i => i.status === 'overdue') ? 'text-red-400' : undefined },
        ].map(s => (
          <div key={s.label} className="bg-card border border-border rounded-lg px-4 py-3">
            <div className="flex items-center gap-2 mb-1">
              <s.icon className="h-3.5 w-3.5 text-muted-foreground" />
              <span className="text-xs text-muted-foreground">{s.label}</span>
            </div>
            <p className={`text-2xl font-mono font-bold ${s.color || 'text-foreground'}`}>{s.value}</p>
          </div>
        ))}
      </div>

      {/* Quick-create from signed proposals */}
      {proposals.filter(p => !invoices.some(i => i.proposal_id === p.id)).length > 0 && (
        <div className="mb-6">
          <p className="text-xs font-mono tracking-widest uppercase text-muted-foreground/50 mb-2">Signed proposals — ready to invoice</p>
          <div className="flex gap-2 flex-wrap">
            {proposals.filter(p => !invoices.some(i => i.proposal_id === p.id)).map(p => {
              const lead = leads.find(l => l.id === p.lead_id)
              return (
                <button key={p.id} onClick={() => { openCreate(p.lead_id); setSelectedProposal(p.id); setAmount(p.amount?.toString() || '') }}
                  className="flex items-center gap-1.5 px-3 py-1.5 bg-card border border-border hover:border-emerald-500/40 rounded-md text-sm transition-all">
                  <CheckCircle2 className="h-3.5 w-3.5 text-emerald-500" />
                  {lead?.company || lead?.name || 'Lead'}
                  {p.amount && <span className="text-xs font-mono text-muted-foreground ml-1">${p.amount.toLocaleString()}</span>}
                </button>
              )
            })}
          </div>
        </div>
      )}

      <Separator className="mb-5" />

      {/* Filter chips */}
      <div className="flex items-center gap-2 mb-5 flex-wrap">
        {['all', ...Object.keys(STATUS_META)].map(s => (
          <button key={s} onClick={() => setStatusFilter(s)}
            className={`px-2.5 py-1 rounded text-xs font-mono transition-colors ${statusFilter === s ? 'bg-amber-500/15 text-amber-400' : 'text-muted-foreground hover:text-foreground'}`}>
            {s === 'all' ? `All (${invoices.length})` : `${STATUS_META[s]?.label || s} (${invoices.filter(i => i.status === s).length})`}
          </button>
        ))}
      </div>

      {/* Invoice list */}
      {loading ? (
        <div className="flex justify-center py-24"><Loader2 className="h-6 w-6 animate-spin text-muted-foreground" /></div>
      ) : filtered.length === 0 ? (
        <div className="text-center py-24 text-muted-foreground">
          <Receipt className="h-10 w-10 mx-auto mb-3 opacity-20" />
          <p className="text-sm">No invoices yet. Create one from a signed proposal or manually.</p>
        </div>
      ) : (
        <div className="flex flex-col gap-3">
          {filtered.map(inv => {
            const meta = STATUS_META[inv.status] || STATUS_META.draft
            const isOverdue = inv.status === 'overdue'
            return (
              <div key={inv.id} className={`bg-card border rounded-lg p-5 hover:border-border/60 transition-all ${isOverdue ? 'border-red-500/30' : 'border-border'}`}>
                <div className="flex items-start justify-between gap-4">
                  <div className="min-w-0 flex-1">
                    <div className="flex items-center gap-2 mb-1 flex-wrap">
                      <span className="text-sm font-mono font-medium">{inv.invoice_number}</span>
                      <span className="text-sm text-muted-foreground">—</span>
                      <span className="text-sm">{inv.crm_leads?.company || inv.crm_leads?.name || '—'}</span>
                    </div>
                    <div className="flex items-center gap-4 mt-1 text-xs text-muted-foreground">
                      <span className="font-mono text-lg font-bold text-foreground">${inv.total.toLocaleString()}</span>
                      {inv.tax > 0 && <span>(${inv.amount.toLocaleString()} + ${inv.tax.toLocaleString()} tax)</span>}
                      <span>{inv.currency}</span>
                      {inv.due_date && (
                        <span className={isOverdue ? 'text-red-400 font-medium' : ''}>
                          {isOverdue ? 'Overdue — ' : 'Due '}
                          {new Date(inv.due_date).toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric' })}
                        </span>
                      )}
                    </div>
                  </div>
                  <span className={`text-xs font-mono flex-shrink-0 px-2 py-0.5 rounded ${meta.bg} ${meta.color}`}>{meta.label}</span>
                </div>

                {inv.notes && <p className="text-xs text-muted-foreground mt-2 line-clamp-1">{inv.notes}</p>}

                <div className="flex items-center gap-1.5 mt-3 pt-3 border-t border-border flex-wrap">
                  <Button variant="ghost" size="sm" className="h-7 text-xs gap-1" onClick={() => copyInvoice(inv)}>
                    {copied === inv.id ? <><Check className="h-3 w-3 text-emerald-400" />Copied</> : <><Copy className="h-3 w-3" />Copy</>}
                  </Button>
                  {inv.stripe_payment_url ? (
                    <a href={inv.stripe_payment_url} target="_blank" rel="noopener noreferrer">
                      <Button variant="ghost" size="sm" className="h-7 text-xs gap-1 text-violet-400">
                        <ExternalLink className="h-3 w-3" /> Open Stripe link
                      </Button>
                    </a>
                  ) : (
                    !['paid', 'cancelled'].includes(inv.status) && inv.total > 0 && (
                      <Button variant="ghost" size="sm" className="h-7 text-xs gap-1 text-violet-400"
                        disabled={creatingStripe === inv.id}
                        onClick={() => createStripeLink(inv)}>
                        {creatingStripe === inv.id ? <Loader2 className="h-3 w-3 animate-spin" /> : <CreditCard className="h-3 w-3" />}
                        Create Stripe link
                      </Button>
                    )
                  )}
                  {inv.status === 'draft' && (
                    <Button size="sm" className="h-7 text-xs gap-1 bg-blue-500/10 text-blue-400 hover:bg-blue-500/20 border border-blue-500/20"
                      onClick={() => updateStatus(inv.id, 'sent')}>
                      <Send className="h-3 w-3" /> Mark sent
                    </Button>
                  )}
                  {['sent', 'overdue'].includes(inv.status) && (
                    <Button size="sm" className="h-7 text-xs gap-1 bg-emerald-500/10 text-emerald-400 hover:bg-emerald-500/20 border border-emerald-500/20"
                      onClick={() => updateStatus(inv.id, 'paid', { paid_at: new Date().toISOString() })}>
                      <CheckCircle2 className="h-3 w-3" /> Mark paid
                    </Button>
                  )}
                  {!['paid', 'cancelled'].includes(inv.status) && (
                    <Button size="sm" variant="ghost" className="h-7 text-xs gap-1 text-muted-foreground"
                      onClick={() => updateStatus(inv.id, 'cancelled')}>
                      Cancel
                    </Button>
                  )}
                  <div className="flex-1" />
                  <Button variant="ghost" size="sm" className="h-7 w-7 p-0 text-destructive hover:text-destructive" onClick={() => deleteInvoice(inv.id)}>
                    <Trash2 className="h-3.5 w-3.5" />
                  </Button>
                </div>
              </div>
            )
          })}
        </div>
      )}

      {/* Create invoice dialog */}
      <Dialog open={createOpen} onOpenChange={setCreateOpen}>
        <DialogContent className="max-w-lg max-h-[90vh] overflow-y-auto">
          <DialogHeader><DialogTitle>Create invoice</DialogTitle></DialogHeader>
          <div className="flex flex-col gap-4 py-2">
            <div className="flex flex-col gap-1.5">
              <Label>Lead *</Label>
              <Select value={selectedLead} onValueChange={v => { setSelectedLead(v); setSelectedProposal('') }}>
                <SelectTrigger><SelectValue placeholder="Select client" /></SelectTrigger>
                <SelectContent>
                  {leads.map(l => (
                    <SelectItem key={l.id} value={l.id}>{l.company || l.name} — {l.name}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            {leadProposals.length > 0 && (
              <div className="flex flex-col gap-1.5">
                <Label>From proposal (optional)</Label>
                <Select value={selectedProposal} onValueChange={setSelectedProposal}>
                  <SelectTrigger><SelectValue placeholder="Link to proposal" /></SelectTrigger>
                  <SelectContent>
                    {leadProposals.map(p => (
                      <SelectItem key={p.id} value={p.id}>{p.title} {p.amount ? `— $${p.amount.toLocaleString()}` : ''}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            )}

            <div className="grid grid-cols-2 gap-4">
              <div className="flex flex-col gap-1.5">
                <Label>Invoice # *</Label>
                <Input value={invoiceNumber} onChange={e => setInvoiceNumber(e.target.value)} className="font-mono" />
              </div>
              <div className="flex flex-col gap-1.5">
                <Label>Currency</Label>
                <Select value={currency} onValueChange={setCurrency}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    {['USD', 'EUR', 'GBP', 'SEK', 'NOK', 'DKK'].map(c => <SelectItem key={c} value={c}>{c}</SelectItem>)}
                  </SelectContent>
                </Select>
              </div>
            </div>

            <div className="grid grid-cols-2 gap-4">
              <div className="flex flex-col gap-1.5">
                <Label>Amount *</Label>
                <Input type="number" value={amount} onChange={e => setAmount(e.target.value)} placeholder="10000" />
              </div>
              <div className="flex flex-col gap-1.5">
                <Label>Tax</Label>
                <Input type="number" value={tax} onChange={e => setTax(e.target.value)} placeholder="0" />
              </div>
            </div>

            {(amount || tax) && (
              <p className="text-sm font-mono">
                Total: <span className="font-bold text-foreground">${((parseFloat(amount) || 0) + (parseFloat(tax) || 0)).toLocaleString()}</span> {currency}
              </p>
            )}

            <div className="flex flex-col gap-1.5">
              <Label>Due date</Label>
              <Input type="date" value={dueDate} onChange={e => setDueDate(e.target.value)} />
            </div>

            <div className="flex flex-col gap-1.5">
              <Label>Notes</Label>
              <Textarea value={notes} onChange={e => setNotes(e.target.value)} rows={3} placeholder="Payment terms, bank details…" />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setCreateOpen(false)}>Cancel</Button>
            <Button onClick={saveInvoice} disabled={saving || !selectedLead || !invoiceNumber || !amount}>
              {saving && <Loader2 className="h-4 w-4 animate-spin mr-2" />} Create invoice
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  )
}
