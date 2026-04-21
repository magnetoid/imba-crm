import { createContext, useContext, useState } from 'react'
import type { ReactNode } from 'react'

interface QuoteModalContextValue {
  open: boolean
  preselectedService: string
  openModal: (service?: string) => void
  closeModal: () => void
}

const Ctx = createContext<QuoteModalContextValue>({
  open: false,
  preselectedService: '',
  openModal: () => {},
  closeModal: () => {},
})

export function QuoteModalProvider({ children }: { children: ReactNode }) {
  const [open, setOpen] = useState(false)
  const [preselectedService, setPreselectedService] = useState('')

  return (
    <Ctx.Provider value={{
      open,
      preselectedService,
      openModal: (service = '') => { setPreselectedService(service); setOpen(true) },
      closeModal: () => { setOpen(false); setPreselectedService('') },
    }}>
      {children}
    </Ctx.Provider>
  )
}

export const useQuoteModal = () => useContext(Ctx)
