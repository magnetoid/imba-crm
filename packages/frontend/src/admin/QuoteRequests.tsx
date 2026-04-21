import { useEffect, useState } from 'react'
import { supabase } from '@/lib/supabase'
import type { QuoteRequest } from '@/lib/supabase'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import {
  Table, TableHeader, TableBody, TableHead, TableRow, TableCell,
} from '@/components/ui/table'
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter,
} from '@/components/ui/dialog'
import {
  Select, SelectContent, SelectItem, SelectTrigger,
} from '@/components/ui/select'
import { Loader2, MessageSquare, Trash2, Eye } from 'lucide-react'

const STATUSES = [
  { value: 'new',            label: 'New',            variant: 'default'     as const },
  { value: 'contacted',      label: 'Contacted',      variant: 'warning'     as const },
  { value: 'proposal_sent',  label: 'Proposal Sent',  variant: 'secondary'   as const },
  { value: 'closed_won',     label: 'Closed Won',     variant: 'success'     as const },
  { value: 'closed_lost',    label: 'Closed Lost',    variant: 'destructive' as const },
]

function statusVariant(status?: string) {
  return STATUSES.find(s => s.value === status)?.variant ?? 'secondary'
}
function statusLabel(status?: string) {
  return STATUSES.find(s => s.value === status)?.label ?? (status ?? 'New')
}

export default function QuoteRequests() {
  const [rows, setRows] = useState<QuoteRequest[]>([])
  const [loading, setLoading] = useState(true)
  const [selected, setSelected] = useState<QuoteRequest | null>(null)
  const [updatingId, setUpdatingId] = useState<string | null>(null)

  async function load() {
    setLoading(true)
    const { data } = await supabase
      .from('quote_requests')
      .select('*')
      .order('created_at', { ascending: false })
    if (data) setRows(data)
    setLoading(false)
  }

  useEffect(() => { load() }, [])

  async function updateStatus(id: string, status: string) {
    setUpdatingId(id)
    await supabase.from('quote_requests').update({ status }).eq('id', id)
    setUpdatingId(null)
    load()
  }

  async function handleDelete(id: string) {
    if (!confirm('Delete this quote request?')) return
    await supabase.from('quote_requests').delete().eq('id', id)
    if (selected?.id === id) setSelected(null)
    load()
  }

  return (
    <div className="p-8">
      <div className="mb-8">
        <h1 className="text-2xl font-semibold text-foreground">Quote Requests</h1>
        <p className="text-muted-foreground text-sm mt-1">Inbound project inquiries from potential clients</p>
      </div>

      {loading ? (
        <div className="flex items-center justify-center py-16 text-muted-foreground">
          <Loader2 className="h-6 w-6 animate-spin" />
        </div>
      ) : rows.length === 0 ? (
        <div className="flex flex-col items-center justify-center py-16 border border-border rounded-lg">
          <MessageSquare className="h-10 w-10 text-muted-foreground mb-3" />
          <p className="text-muted-foreground text-sm">No requests yet</p>
        </div>
      ) : (
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Name</TableHead>
              <TableHead>Email</TableHead>
              <TableHead>Company</TableHead>
              <TableHead>Service</TableHead>
              <TableHead>Budget</TableHead>
              <TableHead>Status</TableHead>
              <TableHead>Date</TableHead>
              <TableHead className="text-right">Actions</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {rows.map(r => (
              <TableRow key={r.id}>
                <TableCell className="font-medium text-foreground">{r.full_name}</TableCell>
                <TableCell className="text-muted-foreground text-sm">{r.email}</TableCell>
                <TableCell className="text-muted-foreground text-sm">{r.company || '—'}</TableCell>
                <TableCell className="text-muted-foreground text-sm">{r.service_type || '—'}</TableCell>
                <TableCell className="text-muted-foreground text-sm">{r.budget_range || '—'}</TableCell>
                <TableCell>
                  <div className="w-36">
                    {updatingId === r.id ? (
                      <Loader2 className="h-4 w-4 animate-spin text-muted-foreground" />
                    ) : (
                      <Select
                        value={r.status || 'new'}
                        onValueChange={val => r.id && updateStatus(r.id, val)}
                      >
                        <SelectTrigger className="h-7 text-xs border-0 p-0 bg-transparent focus:ring-0 w-auto gap-1">
                          <Badge variant={statusVariant(r.status)}>
                            {statusLabel(r.status)}
                          </Badge>
                        </SelectTrigger>
                        <SelectContent>
                          {STATUSES.map(s => (
                            <SelectItem key={s.value} value={s.value}>{s.label}</SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                    )}
                  </div>
                </TableCell>
                <TableCell className="text-muted-foreground text-sm font-mono text-xs">
                  {r.created_at ? new Date(r.created_at).toLocaleDateString() : '—'}
                </TableCell>
                <TableCell>
                  <div className="flex items-center justify-end gap-2">
                    <Button variant="ghost" size="icon" onClick={() => setSelected(r)}>
                      <Eye className="h-4 w-4" />
                    </Button>
                    <Button variant="ghost" size="icon" onClick={() => r.id && handleDelete(r.id)}>
                      <Trash2 className="h-4 w-4 text-destructive" />
                    </Button>
                  </div>
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      )}

      {/* Detail dialog */}
      <Dialog open={!!selected} onOpenChange={open => { if (!open) setSelected(null) }}>
        <DialogContent className="max-w-lg">
          <DialogHeader>
            <DialogTitle>Quote Request — {selected?.full_name}</DialogTitle>
          </DialogHeader>
          {selected && (
            <div className="flex flex-col gap-3 text-sm">
              <div className="grid grid-cols-2 gap-x-4 gap-y-2">
                {[
                  ['Email', selected.email],
                  ['Company', selected.company || '—'],
                  ['Service', selected.service_type || '—'],
                  ['Budget', selected.budget_range || '—'],
                  ['Status', statusLabel(selected.status)],
                  ['Date', selected.created_at ? new Date(selected.created_at).toLocaleString() : '—'],
                ].map(([k, v]) => (
                  <div key={k}>
                    <div className="text-xs text-muted-foreground mb-0.5">{k}</div>
                    <div className="text-foreground">{v}</div>
                  </div>
                ))}
              </div>
              {selected.message && (
                <div>
                  <div className="text-xs text-muted-foreground mb-1">Message</div>
                  <p className="text-foreground bg-muted/40 rounded-md p-3 text-sm leading-relaxed whitespace-pre-wrap">{selected.message}</p>
                </div>
              )}
            </div>
          )}
          <DialogFooter>
            <Button variant="ghost" onClick={() => setSelected(null)}>Close</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  )
}
