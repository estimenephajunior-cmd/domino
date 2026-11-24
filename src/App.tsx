import { Lobby } from './components/Lobby';
import { Table } from './components/Table';
import { SocketBridge } from './net/socket';
import { useTableStore } from './state/tableStore';

/**
 * Application shell. The socket bridge owns the transport; this component
 * only decides what to show — the lobby (and the waiting room once seated)
 * until a hand is dealt, then the table.
 */
export function App() {
  const view = useTableStore((s) => s.view);

  return (
    <>
      <SocketBridge />
      {view ? (
        <div className="flex h-dvh flex-col overflow-hidden">
          <Table />
        </div>
      ) : (
        <Lobby />
      )}
    </>
  );
}
