// Production-only replacement for obsolete financial QA endpoints.
// The current checkout and finance implementations remain in the DEV project.
const headers={'Content-Type':'application/json','Cache-Control':'no-store','Access-Control-Allow-Origin':'*'};
Deno.serve(()=>new Response(JSON.stringify({ok:false,error:'public_checkout_disabled'}),{status:410,headers}));
