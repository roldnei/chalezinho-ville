// Retired: reservation mutations require authenticated booking-engine actions.
export default function handler(req,res){
 res.setHeader('Cache-Control','no-store');
 return res.status(410).json({ok:false,error:'legacy_reservation_endpoint_retired'});
}
