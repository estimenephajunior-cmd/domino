import { MessageCircle, X } from 'lucide-react';
import { useState } from 'react';
import { useTableStore } from '../state/tableStore';

/**
 * Table chat. Messages arrive over the socket and are rendered newest-last.
 */
export function ChatPanel() {
  const chat = useTableStore((s) => s.chat);
  const sendChat = useTableStore((s) => s.sendChat);
  const showChat = useTableStore((s) => s.showChat);
  const toggleChat = useTableStore((s) => s.toggleChat);
  const [draft, setDraft] = useState('');

  if (!showChat) {
    return (
      <button
        type="button"
        data-testid="chat-toggle"
        onClick={toggleChat}
        aria-label="Open chat"
        className="table-fab"
      >
        <MessageCircle size={20} />
        {chat.length > 0 && (
          <span className="ml-2 rounded-full bg-[#D4AF37] px-1.5 text-xs text-slate-950">
            {chat.length}
          </span>
        )}
      </button>
    );
  }

  function submit(event: React.FormEvent): void {
    event.preventDefault();
    sendChat(draft);
    setDraft('');
  }

  return (
    <aside
      data-testid="chat-panel"
      className="fixed bottom-4 right-4 flex max-h-[22rem] w-72 flex-col rounded-xl border border-slate-700 bg-slate-900/95 shadow-2xl"
    >
      <div className="flex items-center justify-between border-b border-slate-800 px-3 py-2">
        <span className="text-sm font-medium text-slate-200">Table chat</span>
        <button
          type="button"
          onClick={toggleChat}
          aria-label="Close chat"
          className="text-xs text-slate-400 hover:text-white"
        >
          <X size={17} />
        </button>
      </div>
      <ul className="flex-1 space-y-1 overflow-y-auto px-3 py-2 text-sm">
        {chat.length === 0 && <li className="text-xs text-slate-500">No messages yet.</li>}
        {chat.map((entry, i) => (
          <li key={`${entry.at}-${i}`} className="text-slate-300">
            <span className="font-medium text-[#D4AF37]">{entry.name}</span>{' '}
            <span>{entry.text}</span>
          </li>
        ))}
      </ul>
      <form onSubmit={submit} className="flex gap-1 border-t border-slate-800 p-2">
        <input
          value={draft}
          onChange={(e) => setDraft(e.target.value)}
          maxLength={500}
          placeholder="Say something…"
          aria-label="Chat message"
          className="min-w-0 flex-1 rounded-lg border border-slate-700 bg-slate-950/70 px-2 py-1 text-sm text-slate-100 outline-none focus:border-[#D4AF37]"
        />
        <button
          type="submit"
          className="rounded-lg bg-[#D4AF37] px-3 py-1 text-sm font-semibold text-slate-950"
        >
          Send
        </button>
      </form>
    </aside>
  );
}
