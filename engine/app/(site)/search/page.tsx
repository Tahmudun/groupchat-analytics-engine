import { Suspense } from 'react';
import { getProfilePickList, getTopSearchMembers } from '@/lib/flix/data';
import { SearchClient } from './SearchClient';

export const dynamic = 'force-dynamic';

export default async function SearchPage() {
  const [senders, topMembers] = await Promise.all([
    getProfilePickList(40).catch(() => []),
    getTopSearchMembers().catch(() => []),
  ]);
  return (
    <Suspense fallback={<div className="flx-empty" style={{ paddingTop: 80 }}>Loading search…</div>}>
      <SearchClient senders={senders.map(s => s.username)} topMembers={topMembers} />
    </Suspense>
  );
}
