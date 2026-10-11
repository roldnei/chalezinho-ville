export const DEV_PROJECT='pxfqmnhqodqyaaqeyjgr';
export const PROD_PROJECT='irxsaladqhbzhkoaclxy';
export const consultationActions=new Set(['config','property_media','stay_offers','search','quote','stay_showcase','villegram_quote','villegram_offer','legal_documents']);
export const launchAdminActions=new Set(['admin_calendar','admin_hub','admin_property_action','admin_availability','experience_admin','experience_admin_action','stay_offer_action','admin_access_metrics']);
export function releaseTarget(url:string){const host=new URL(url).hostname;if(host===DEV_PROJECT+'.supabase.co')return 'development';if(host===PROD_PROJECT+'.supabase.co')return 'production';throw Error('unknown_release_target');}
export function consultationAction(action:string){if(!consultationActions.has(action))throw Error('consultation_operation_not_allowed');return 'consult_'+action;}
export function commercialItem(item:any){return !/(\[DEV\]|\[QA|\bQA\b|fict[ií]ci|sint[eé]tic)/i.test(String(item.name||''))&&!/^(dev_|qa_)/i.test(String(item.code||''));}
