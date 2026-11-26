Deno.serve(() => new Response(
  JSON.stringify({ error: 'Endpoint retirado. Usa la función ingest-reading.' }),
  { status: 410, headers: { 'Content-Type': 'application/json' } },
))
