'use client';
import { Fragment, useCallback, useEffect, useState } from 'react';
import { apiJson } from '../client';

type Member = {
  username: string;
  display_name: string | null;
  status: string;
  message_count: number;
  mention_count: number;
  aliases: Array<{ alias: string; type: string }>;
};

const ALIAS_TYPES = ['nickname', 'handle', 'real_name', 'roast'] as const;

const initials = (m: Member) =>
  (m.display_name ?? m.username)
    .split(/\s+/)
    .slice(0, 2)
    .map(w => [...w][0] ?? '')
    .join('')
    .toUpperCase();

export function MembersPanel(props: { chat: string; onError: (msg: string | null) => void }) {
  const { chat, onError } = props;
  const [members, setMembers] = useState<Member[]>([]);
  const [includeInactive, setIncludeInactive] = useState(false);
  const [search, setSearch] = useState('');
  const [open, setOpen] = useState<string | null>(null);
  const [newAlias, setNewAlias] = useState('');
  const [newType, setNewType] = useState<string>('nickname');
  const [warning, setWarning] = useState<string | null>(null);

  const load = useCallback(async () => {
    try {
      setMembers(await apiJson<Member[]>(
        `/api/admin/members?chat=${encodeURIComponent(chat)}&include_inactive=${includeInactive}`,
      ));
      onError(null);
    } catch (err) {
      onError(err instanceof Error ? err.message : String(err));
    }
  }, [chat, includeInactive, onError]);

  useEffect(() => { void load(); }, [load]);

  const addAlias = async (member: string) => {
    if (!newAlias.trim()) return;
    // Server stores the alias trimmed + lowercased; mirror that locally so the
    // optimistic chip matches what the reload will return.
    const alias = newAlias.trim().toLowerCase();
    const type = newType;
    try {
      const res = await apiJson<{ inserted: boolean; warning: string | null }>('/api/admin/aliases', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ chat, member, alias, type }),
      });
      setWarning(res.warning);
      setNewAlias('');
      if (res.inserted) {
        // Show the chip instantly instead of blocking on the ~11s members
        // refetch; the background reload reconciles.
        setMembers(prev => prev.map(m =>
          m.username === member && !m.aliases.some(a => a.alias === alias)
            ? { ...m, aliases: [...m.aliases, { alias, type }] }
            : m,
        ));
      }
      void load();
    } catch (err) {
      onError(err instanceof Error ? err.message : String(err));
    }
  };

  const removeAlias = async (member: string, alias: string) => {
    try {
      await apiJson('/api/admin/aliases', {
        method: 'DELETE',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ chat, member, alias }),
      });
      setMembers(prev => prev.map(m =>
        m.username === member
          ? { ...m, aliases: m.aliases.filter(a => a.alias !== alias) }
          : m,
      ));
      void load();
    } catch (err) {
      onError(err instanceof Error ? err.message : String(err));
    }
  };

  const q = search.trim().toLowerCase();
  const visible = q
    ? members.filter(m =>
        m.username.toLowerCase().includes(q) ||
        (m.display_name ?? '').toLowerCase().includes(q) ||
        m.aliases.some(a => a.alias.includes(q)))
    : members;

  return (
    <section>
      <h2>members</h2>
      <div className="row">
        <input placeholder="search name / alias…" value={search} onChange={e => setSearch(e.target.value)} />
        <label>
          <input type="checkbox" checked={includeInactive} onChange={e => setIncludeInactive(e.target.checked)} />
          {' '}include inactive
        </label>
        <span className="muted">{Math.min(visible.length, 200)} shown{visible.length > 200 ? ` of ${visible.length}` : ''}</span>
      </div>
      <div className="table-wrap">
      <table>
        <thead>
          <tr><th>member</th><th>status</th><th>msgs</th><th>mentioned</th><th>aliases</th></tr>
        </thead>
        <tbody>
          {visible.slice(0, 200).map(m => (
            <Fragment key={m.username}>
              <tr
                className={open === m.username ? 'open' : ''}
                onClick={() => { setOpen(open === m.username ? null : m.username); setWarning(null); setNewAlias(''); }}
              >
                <td>
                  <span className="who">
                    <span className="avatar">{initials(m)}</span>
                    <span>{m.display_name ?? m.username} <span className="muted">@{m.username}</span></span>
                  </span>
                </td>
                <td>{m.status}</td>
                <td>{m.message_count.toLocaleString()}</td>
                <td>{m.mention_count.toLocaleString()}</td>
                <td>{m.aliases.length}</td>
              </tr>
              {open === m.username && (
                <tr className="detail">
                  <td colSpan={5}>
                    <ul className="aliases">
                      {m.aliases.map(a => (
                        <li key={a.alias}>
                          <code>{a.alias}</code> <span className="muted">{a.type}</span>
                          <button onClick={e => { e.stopPropagation(); void removeAlias(m.username, a.alias); }}>×</button>
                        </li>
                      ))}
                      {m.aliases.length === 0 && <li className="muted">no aliases yet</li>}
                    </ul>
                    <div className="row" onClick={e => e.stopPropagation()}>
                      <input
                        placeholder="new alias (e.g. zibble)"
                        value={newAlias}
                        onChange={e => setNewAlias(e.target.value)}
                        onKeyDown={e => { if (e.key === 'Enter') void addAlias(m.username); }}
                      />
                      <select value={newType} onChange={e => setNewType(e.target.value)}>
                        {ALIAS_TYPES.map(t => <option key={t} value={t}>{t}</option>)}
                      </select>
                      <button onClick={() => void addAlias(m.username)}>add</button>
                    </div>
                    {warning && <p className="banner warn">{warning}</p>}
                    <p className="muted">aliases apply to future mention extraction — hit “Run mentions” to re-scan existing messages.</p>
                  </td>
                </tr>
              )}
            </Fragment>
          ))}
        </tbody>
      </table>
      </div>
    </section>
  );
}
