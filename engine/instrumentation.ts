/**
 * Runs once per server instance, before it serves requests. In demo mode the
 * configured chat must be synthetic or the server refuses to start — see
 * lib/demoGuard.ts. The NEXT_RUNTIME branch is the documented pattern: it
 * lets the edge bundle drop the Node-only DB import entirely.
 */
export async function register(): Promise<void> {
  if (process.env.NEXT_RUNTIME === 'nodejs' && process.env.DEMO_MODE === 'true') {
    const { verifyDemoChat } = await import('@/lib/demoGuard');
    await verifyDemoChat();
  }
}
