// A public projection: calendar URLs, private integration settings and guest data never leave the service.
export function listingSettings(input:any){
 if(!input||typeof input!=='object'||Array.isArray(input))throw Error('invalid_listing');
 const text=(key:string,max:number)=>{const value=String(input[key]??'').trim();if(value.length>max)throw Error('invalid_'+key);return value};
 const result:any={collection:'homes',published:input.published===true,location_label:text('location_label',100),eyebrow:text('eyebrow',100),notes:text('notes',2000)};
 for(const key of ['bedrooms','beds','bathrooms']){const value=Number(input[key]);if(!Number.isInteger(value)||value<0||value>50)throw Error('invalid_'+key);result[key]=value}
 for(const key of ['parking','air_conditioning','linen']){if(typeof input[key]!=='boolean')throw Error('invalid_'+key);result[key]=input[key]}
 if(result.published&&(!result.location_label||result.bedrooms<1||result.bathrooms<1))throw Error('listing_incomplete');
 return result;
}
export function publicRental(p:any){
 const l=listingSettings(p.features?.public_listing);
 return {id:Number(p.id),code:p.code,slug:p.slug,name:p.name,property_type:p.property_type,max_guests:Number(p.max_guests),tagline:p.tagline,summary:p.summary,cover_image:p.cover_image,gallery:(Array.isArray(p.gallery)?p.gallery:[]).map((x:any)=>typeof x==='string'?x:x?.url).filter((x:any)=>typeof x==='string'),amenities:Array.isArray(p.features?.amenities)?p.features.amenities.filter((x:any)=>typeof x==='string'):[],listing:l};
}
export function isPublicRental(p:any){return p.active===true&&['apartment','house','studio'].includes(p.property_type)&&p.features?.public_listing?.collection==='homes'&&p.features.public_listing.published===true}
export function rentalSearchInput(input:any){
 const start=String(input.start||''),end=String(input.end||''),guests=Number(input.guests);
 const valid=(s:string)=>/^\d{4}-\d{2}-\d{2}$/.test(s)&&Number.isFinite(Date.parse(s))&&new Date(s+'T12:00:00Z').toISOString().slice(0,10)===s;
 const nights=(Date.parse(end)-Date.parse(start))/86400000;
 if(!valid(start)||!valid(end)||!Number.isInteger(nights)||nights<1||nights>90||!Number.isInteger(guests)||guests<1||guests>12)throw Error('invalid_search');
 return {start,end,guests};
}
export function rentalResult(property:any,result:any){
 const value=Number(result?.from_stay_price),cents=Math.round(value*100);
 const available=result?.available===true&&Number.isFinite(value)&&value>0&&Number.isSafeInteger(cents);
 return {...property,available,requestable:result?.requestable===true,total_cents:available?cents:null,min_stay:Number(result?.min_stay)||1,unavailable_reason:available?null:result?.unavailable_reason||'rate_unavailable'};
}
