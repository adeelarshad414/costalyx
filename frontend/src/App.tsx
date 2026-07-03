import { IngestionOverview } from './features/ingestion/IngestionOverview';

export function App() {
  return (
    <main className="app-shell">
      <header className="app-header">
        <p>Costalyx</p>
        <h1>Cloud spend, normalized at the source</h1>
      </header>
      <IngestionOverview />
    </main>
  );
}
