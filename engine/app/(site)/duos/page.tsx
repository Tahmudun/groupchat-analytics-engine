import { Suspense } from 'react';
import { getProfilePickList } from '@/lib/flix/data';
import { DuosClient } from './DuosClient';

export const dynamic = 'force-dynamic';

export default async function DuosPage() {
  const senders = await getProfilePickList(200).catch(() => []);
  return (
    <Suspense fallback={<div className="flx-empty" style={{ paddingTop: 80 }}>Loading…</div>}>
      <DuosClient members={senders.map(s => ({ username: s.username, displayName: s.displayName }))} />
    </Suspense>
  );
}
