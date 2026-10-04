import { Suspense } from 'react';
import { RewindClient } from './RewindClient';

export const dynamic = 'force-dynamic';

export default function RewindPage() {
  return (
    <Suspense fallback={null}>
      <RewindClient />
    </Suspense>
  );
}
