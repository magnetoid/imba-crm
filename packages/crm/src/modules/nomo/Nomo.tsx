// Nomo — full-page module. Two-column thread browser + active chat.
// Routes:
//   /nomo            — empty browser (or last opened thread)
//   /nomo/:threadId  — opens that thread

import { useEffect } from 'react'
import { useParams, useNavigate } from 'react-router-dom'
import { Plus, Archive, MessageSquare, Pin } from 'lucide-react'
import { Button } from '@imba/shared/ui/button'
import { useNomo } from './useNomo'
import { NomoChat } from './NomoChat'

export default function Nomo() {
  const { threadId: routeThreadId } = useParams<{ threadId?: string }>()
  const navigate = useNavigate()
  const nomo = useNomo()

  useEffect(() => {
    if (routeThreadId && routeThreadId !== nomo.threadId) {
      void nomo.openThread(routeThreadId)
    }
  }, [routeThreadId, nomo])

  function startNew() {
    nomo.newThread()
    navigate('/nomo')
  }

  return (
    <div className="h-[calc(100vh-0px)] flex">
      {/* Thread list */}
      <aside className="w-72 border-r border-border bg-card flex-shrink-0 flex flex-col">
        <div className="p-4 border-b border-border">
          <div className="flex items-center justify-between mb-3">
            <h1 className="text-lg font-semibold tracking-tight flex items-center gap-2">
              <span className="text-primary font-display">N</span> Nomo
            </h1>
            <Button size="sm" variant="outline" onClick={startNew} className="gap-1.5">
              <Plus className="h-3.5 w-3.5" /> New
            </Button>
          </div>
          <p className="text-[11px] text-muted-foreground">
            Your in-app copilot. Threads persist across sessions.
          </p>
        </div>

        <div className="flex-1 overflow-y-auto">
          {nomo.threads.length === 0 ? (
            <div className="text-center text-muted-foreground p-8">
              <MessageSquare className="h-8 w-8 mx-auto opacity-30 mb-3" />
              <p className="text-xs">No threads yet — start one on the right.</p>
            </div>
          ) : (
            <div className="p-2 space-y-1">
              {nomo.threads.map(t => {
                const active = t.id === nomo.threadId
                return (
                  <button
                    key={t.id}
                    onClick={() => navigate(`/nomo/${t.id}`)}
                    className={`w-full text-left rounded-md px-3 py-2.5 transition-colors ${
                      active
                        ? 'bg-primary/10 text-primary'
                        : 'hover:bg-muted text-foreground'
                    }`}
                  >
                    <div className="flex items-center gap-1.5 mb-0.5">
                      {t.pinned_lead_id && <Pin className="h-3 w-3 flex-shrink-0 text-amber-600" />}
                      <p className="text-sm font-medium truncate">{t.title || 'Untitled'}</p>
                    </div>
                    <p className="text-[11px] text-muted-foreground font-mono">
                      {new Date(t.last_message_at).toLocaleString()}
                    </p>
                  </button>
                )
              })}
            </div>
          )}
        </div>

        {nomo.threadId && (
          <div className="p-2 border-t border-border">
            <Button
              variant="ghost"
              size="sm"
              onClick={() => nomo.threadId && void nomo.archive(nomo.threadId)}
              className="w-full justify-start gap-2 text-xs text-muted-foreground"
            >
              <Archive className="h-3.5 w-3.5" /> Archive this thread
            </Button>
          </div>
        )}
      </aside>

      {/* Active chat */}
      <main className="flex-1 min-w-0 flex flex-col">
        <NomoChat
          messages={nomo.messages}
          streaming={nomo.streaming}
          error={nomo.error}
          onSend={nomo.send}
          onCancel={nomo.cancel}
          onDecide={nomo.decide}
        />
      </main>
    </div>
  )
}
