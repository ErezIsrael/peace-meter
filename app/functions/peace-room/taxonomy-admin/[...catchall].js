// Block stale taxonomy-admin assets from a previous direct upload
// These files were removed from git but persist in Cloudflare's asset store
export function onRequest() {
  return new Response(null, { status: 404 });
}
