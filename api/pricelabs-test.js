export default async function handler(req, res) {
  res.setHeader('Cache-Control', 'no-store');
  if (req.method !== 'GET') return res.status(405).json({ ok:false, error:'method_not_allowed' });
  const key = process.env.PRICELABS_API_KEY;
  if (!key) return res.status(500).json({ ok:false, error:'missing_pricelabs_key' });
  try {
    const r = await fetch('https://api.pricelabs.co/v1/listings_minimal', {
      headers: { 'X-API-Key': key, 'Accept': 'application/json' }
    });
    const data = await r.json().catch(() => null);
    if (!r.ok) return res.status(r.status).json({ ok:false, error:'pricelabs_error', status:r.status, details:data });
    const listings = Array.isArray(data?.listings) ? data.listings : [];
    return res.status(200).json({
      ok:true,
      total_listings:data?.total_listings ?? listings.length,
      listings:listings.map(x=>({
        listing_id:x.listing_id,
        listing_name:x.listing_name,
        property_name:x.property_name,
        pms_name:x.pms_name,
        channels:x.channel_listing_details || []
      }))
    });
  } catch (e) {
    return res.status(502).json({ ok:false, error:'pricelabs_unreachable' });
  }
}