// NomoPanel — slide-out from the right edge, mounted globally in the
// CRM layout so it's available on every page. Shares state with the
// full-page module via the useNomo hook.

import { useMemo } from 'react'
import { Link } from 'react-router-dom'
import { X, Plus, ExternalLink, Zap } from 'lucide-react'
import { Button } from '@imba/shared/ui/button'
import { useNomo } from './useNomo'
import { NomoChat } from './NomoChat'

interface Props {
  open: boolean
  onClose: () => void
  /** Optional pinned lead context. The hook will pass it to the API. */
  leadId?: string
  leadLabel?: string
}

export default function NomoPanel({ open, onClose, leadId, leadLabel }: Props) {
  const nomo = useNomo()

  const send = (text: string) => nomo.send(text, leadId ? { lead_id: leadId } : undefined)

  const usage = useMemo(() => {
    let inTok = 0, outTok = 0
    for (const m of nomo.messages) {
      inTok  += m.tokens_in  ?? 0
      outTok += m.tokens_out ?? 0
    }
    return { inTok, outTok }
  }, [nomo.messages])

  return (
    <>
      {/* Backdrop on small screens. Doesn't dim the desktop view since
          the panel is non-modal there. */}
      {open && (
        <div
          className="fixed inset-0 bg-black/20 z-40 lg:hidden"
          onClick={onClose}
        />
      )}
      <aside
        className={`fixed top-0 right-0 h-screen w-full sm:w-[420px] bg-background border-l border-border z-50 transform transition-transform duration-200 ${
          open ? 'translate-x-0' : 'translate-x-full'
        }`}
      >
        <div className="flex items-center justify-between px-4 py-3 border-b border-border">
          <div className="flex items-center gap-2">
            <div className="w-7 h-7 rounded-md bg-primary/10 flex items-center justify-center">
              <span className="text-primary font-display text-sm">N</span>
            </div>
            <div>
              <p className="text-sm font-medium leading-tight">Nomo</p>
              <p className="text-[11px] text-muted-foreground leading-tight flex items-center gap-1">
                {nomo.threadId ? 'Thread' : 'New chat'}
                {(usage.inTok > 0 || usage.outTok > 0) && (
                  <span className="flex items-center gap-1 ml-1 font-mono">
                    <Zap className="h-2.5 w-2.5" />
                    {usage.inTok}/{usage.outTok}
                  </span>
                )}
              </p>
            </div>
          </div>
          <div className="flex items-center gap-1">
            <Button variant="ghost" size="sm" onClick={nomo.newThread} title="New chat" className="h-7 px-2">
              <Plus className="h-3.5 w-3.5" />
            </Button>
            <Link to={nomo.threadId ? `/nomo/${nomo.threadId}` : '/nomo'} onClick={onClose} title="Open in full">
              <Button variant="ghost" size="sm" className="h-7 px-2">
                <ExternalLink className="h-3.5 w-3.5" />
              </Button>
            </Link>
            <Button variant="ghost" size="sm" onClick={onClose} title="Close" className="h-7 px-2">
              <X className="h-3.5 w-3.5" />
            </Button>
          </div>
        </div>

        <div className="h-[calc(100vh-49px)]">
          <NomoChat
            messages={nomo.messages}
            streaming={nomo.streaming}
            error={nomo.error}
            onSend={send}
            onCancel={nomo.cancel}
            onDecide={nomo.decide}
            compact
            pinnedLabel={leadLabel ? `Pinned to: ${leadLabel}` : undefined}
          />
        </div>
      </aside>
    </>
  )
}
