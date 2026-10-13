(()=>{
 const key='ville-moments-chalet-interest',day=86400000;
 const disabled=()=>navigator.globalPrivacyControl||navigator.doNotTrack==='1';
 function read(){try{if(disabled())return {};const value=JSON.parse(localStorage.getItem(key)||'{}');return value&&typeof value==='object'?value:{}}catch{return {}}}
 function score(code){const item=read()[code];if(!item||!Number.isFinite(item.at)||!Number.isFinite(item.count))return 0;const age=Math.max(0,(Date.now()-item.at)/day);return age>=30?0:Math.min(8,4+item.count)*Math.exp(-age/7)}
 function visit(code){if(disabled()||!['CH1','CH2','CH3'].includes(code))return;try{const data=read(),now=Date.now();for(const k of Object.keys(data))if(!data[k]||now-data[k].at>30*day)delete data[k];const previous=data[code];if(previous&&now-previous.at<60000)return;data[code]={at:now,count:Math.min(4,(previous?.count||0)+1)};localStorage.setItem(key,JSON.stringify(data))}catch{}}
 window.VillegramPreferences={score,visit};
 const pages={'chale-premium.html':'CH1','chale-com-hidro.html':'CH2','chale-romantico.html':'CH3'};
 visit(document.querySelector('main[data-property-code]')?.dataset.propertyCode||pages[location.pathname.split('/').pop()]||(location.pathname.endsWith('/imovel.html')?new URLSearchParams(location.search).get('chalet'):null));
})();
