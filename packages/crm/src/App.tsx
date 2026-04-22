import { Routes, Route, Navigate } from 'react-router-dom'
import ErrorBoundary from '@/components/ErrorBoundary'
import { RequireAuth } from '@imba/shared/auth'
import Login from '@/pages/Login'
import CRMLayout from '@/layouts/CRMLayout'
import { MODULES } from '@/modules/registry'

export default function App() {
  return (
    <ErrorBoundary>
      <Routes>
        <Route path="/" element={<Login />} />
        <Route
          element={
            <RequireAuth redirectTo="/">
              <CRMLayout />
            </RequireAuth>
          }
        >
          {MODULES.map(m => (
            <Route key={m.id} path={m.id}>
              {m.routes.map((r, i) => {
                const Comp = r.component
                return r.index || r.path === '' ? (
                  <Route key={`${m.id}-index-${i}`} index element={
                    <RequireAuth redirectTo="/" roles={m.roles}>
                      <Comp />
                    </RequireAuth>
                  } />
                ) : (
                  <Route key={`${m.id}-${r.path}`} path={r.path} element={
                    <RequireAuth redirectTo="/" roles={m.roles}>
                      <Comp />
                    </RequireAuth>
                  } />
                )
              })}
            </Route>
          ))}
          <Route path="/dashboard" element={<Navigate to="/pipeline" replace />} />
        </Route>
        <Route path="*" element={<Navigate to="/" replace />} />
      </Routes>
    </ErrorBoundary>
  )
}
