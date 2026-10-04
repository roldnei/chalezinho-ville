window.CHALEZINHO_CONFIG={
  supabaseUrl:"https://pxfqmnhqodqyaaqeyjgr.supabase.co",
  supabaseKey:"sb_publishable_0LrKl5kbEu7wN_fAhjxesg_eSOSh6SW",
  bookingEngine:"https://pxfqmnhqodqyaaqeyjgr.supabase.co/functions/v1/booking-engine",
  refundEngine:"https://pxfqmnhqodqyaaqeyjgr.supabase.co/functions/v1/booking-engine",
  guaranteeEngine:"https://pxfqmnhqodqyaaqeyjgr.supabase.co/functions/v1/guarantee-preview",
  environment:"development"
};

// Shared session policy for every page on this origin. No passwords are stored.
(()=>{
 const preference='ville_remember_session';
 const persistent=()=>localStorage.getItem(preference)!=='false';
 const storage={
  getItem(key){return (persistent()?localStorage:sessionStorage).getItem(key)},
  setItem(key,value){const target=persistent()?localStorage:sessionStorage;target.setItem(key,value);(persistent()?sessionStorage:localStorage).removeItem(key)},
  removeItem(key){localStorage.removeItem(key);sessionStorage.removeItem(key)}
 };
 window.VilleSession={
  remembered:()=>localStorage.getItem(preference)==='true',
  choose(remember){
   const prefix='sb-'+new URL(window.CHALEZINHO_CONFIG.supabaseUrl).hostname.split('.')[0]+'-auth-token';
   const previous=persistent()?localStorage:sessionStorage,target=remember?localStorage:sessionStorage;
   for(const key of [prefix,prefix+'-code-verifier',prefix+'-user']){const value=previous.getItem(key);if(value!==null)target.setItem(key,value);if(previous!==target)previous.removeItem(key)}
   localStorage.setItem(preference,String(remember));
  }
 };
 window.CHALEZINHO_CONFIG.authOptions={auth:{persistSession:true,autoRefreshToken:true,detectSessionInUrl:true,storage}};
})();
