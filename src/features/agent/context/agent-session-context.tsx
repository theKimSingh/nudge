import { createContext, type ReactNode, useContext } from 'react';

import { useAgentSession, type UseAgentSessionResult } from '../hooks/use-agent-session';

const AgentSessionContext = createContext<UseAgentSessionResult | null>(null);

export function AgentSessionProvider({ children }: { children: ReactNode }) {
  const session = useAgentSession();
  return (
    <AgentSessionContext.Provider value={session}>{children}</AgentSessionContext.Provider>
  );
}

export function useAgentSessionCtx(): UseAgentSessionResult {
  const v = useContext(AgentSessionContext);
  if (!v) throw new Error('useAgentSessionCtx must be used within AgentSessionProvider');
  return v;
}
