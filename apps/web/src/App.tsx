import { DataProviderProvider, AppLayout } from '@email-app/ui';
import { WebDataProvider } from './providers/web-data-provider';

const provider = new WebDataProvider();

export function App() {
  return (
    <DataProviderProvider provider={provider}>
      <AppLayout />
    </DataProviderProvider>
  );
}
