import { DataProviderProvider, AppLayout } from '@email-app/ui';
import { ElectronDataProvider } from './providers/electron-data-provider';

const provider = new ElectronDataProvider();

export function App() {
  return (
    <DataProviderProvider provider={provider}>
      <AppLayout />
    </DataProviderProvider>
  );
}
