import { createContext, useContext, type ReactNode } from 'react';
import type { DataProvider } from '@email-app/shared';

const DataProviderContext = createContext<DataProvider | null>(null);

export function DataProviderProvider({
  provider,
  children,
}: {
  provider: DataProvider;
  children: ReactNode;
}) {
  return (
    <DataProviderContext.Provider value={provider}>
      {children}
    </DataProviderContext.Provider>
  );
}

export function useDataProvider(): DataProvider {
  const ctx = useContext(DataProviderContext);
  if (!ctx)
    throw new Error('useDataProvider must be used inside DataProviderProvider');
  return ctx;
}
