export function teamInvitationSite(projectUrl:string,configured?:string){
 if(new URL(projectUrl).hostname==='irxsaladqhbzhkoaclxy.supabase.co')return 'https://chalezinhoville.com.br';
 return (configured||'https://chalezinho-ville-git-feature-team-insp-9351ae-roldneicosta-4140.vercel.app').replace(/\/$/,'');
}
export function invitationError(error:any){
 if(['over_email_send_rate_limit','over_request_rate_limit'].includes(error?.code))return 'invite_rate_limited';
 if(error?.code==='email_address_not_authorized')return 'invite_email_not_authorized';
 return 'invite_send_failed';
}
export async function inviteNewTeamUser(admin:any,invitation:any,site:string){
 // This row is private and created only after the Edge has verified an administrator.
 const now=new Date().toISOString();
 const {error:recordError}=await admin.from('pms_team_invitations').upsert({...invitation,status:'pending',invited_user_id:null,accepted_at:null,cancelled_at:null,expires_at:new Date(Date.now()+7*86400000).toISOString(),updated_at:now},{onConflict:'email'});
 if(recordError)return {user:null,error:'invitation_record_failed'};
 const {data,error}=await admin.auth.admin.inviteUserByEmail(invitation.email,{data:{full_name:invitation.full_name,onboarding:'pms_team'},redirectTo:`${site}/auth-callback.html?next=conferencias.html`});
 if(error||!data?.user){
  // Do not leave a live identity exception when Auth/email delivery failed.
  await admin.from('pms_team_invitations').update({status:'cancelled',cancelled_at:now,updated_at:now}).eq('email',invitation.email).is('invited_user_id',null);
  return {user:null,error:invitationError(error)};
 }
 return {user:data.user,error:null};
}
