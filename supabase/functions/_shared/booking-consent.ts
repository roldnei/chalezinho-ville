const requiredTypes=['hosting_terms','property_rules','privacy_policy'];
export function bookingDocuments(docs:any[],development:boolean){
 return requiredTypes.map(type=>docs.filter(d=>d.document_type===type&&(d.status==='active'||development&&d.status==='draft'))
  .sort((a,b)=>Number(b.status==='active')-Number(a.status==='active')||String(b.version).localeCompare(String(a.version),undefined,{numeric:true})||String(a.id).localeCompare(String(b.id)))[0]).filter(Boolean);
}
export function assertBookingConsent(body:any,needsGuarantee:boolean,docs:any[],policyId:string){
 if(needsGuarantee&&(body.guarantee_card_consent!==true||body.guarantee_renewal_consent!==true||body.guarantee_consent_version!=='guarantee-v2'))throw new Error('guarantee_consent_required');
 if(docs.length!==requiredTypes.length)throw new Error('booking_terms_unavailable');
 const accepted=Array.isArray(body.accepted_document_ids)?body.accepted_document_ids:[];
 if(body.terms_consent!==true||!policyId||![policyId,...docs.map(d=>d.id)].every(id=>accepted.includes(id)))throw new Error('policy_acceptance_required');
}
