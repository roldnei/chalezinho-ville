export default async function handler(req, res) {
  res.setHeader('Cache-Control', 'no-store');

  if (req.method !== 'GET') {
    return res.status(405).json({ ok: false, error: 'method_not_allowed' });
  }

  const url = process.env.SUPABASE_URL;
  const key = process.env.SUPABASE_SECRET_KEY;

  if (!url || !key) {
    return res.status(500).json({
      ok: false,
      error: 'missing_supabase_environment_variables'
    });
  }

  try {
    const response = await fetch(
      url.replace(/\/$/, '') + '/rest/v1/properties?select=id,code,name,cleaning_fee,max_guests&order=id.asc',
      {
        headers: {
          apikey: key,
          Authorization: 'Bearer ' + key,
          Accept: 'application/json'
        }
      }
    );

    const raw = await response.text();
    let data;
    try { data = JSON.parse(raw); } catch { data = raw; }

    if (!response.ok) {
      return res.status(response.status).json({
        ok: false,
        error: 'supabase_error',
        details: data
      });
    }

    return res.status(200).json({
      ok: true,
      total: Array.isArray(data) ? data.length : 0,
      properties: data
    });
  } catch (error) {
    return res.status(502).json({
      ok: false,
      error: 'supabase_unreachable'
    });
  }
}
