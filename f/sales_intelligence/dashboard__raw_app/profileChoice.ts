export type ProfileChoice={url:string;title:string;snippet:string;probability:number;index:number;uncertain:boolean};

const personProfile=(url:unknown)=>/^https:\/\/(?:www\.)?linkedin\.com\/in\/[A-Za-z0-9_-]+/i.test(String(url??''));

export function bestProfile(match:any,candidates:any):ProfileChoice|null {
 if(!Array.isArray(candidates))return null;
 let best:ProfileChoice|null=null;
 for(const [index,candidate] of candidates.slice(0,5).entries()){
  if(!personProfile(candidate?.url))continue;
  const probability=Number(match?.probabilities?.[`candidate_${index+1}`]??0);
  if(!Number.isFinite(probability)||probability<0.5)continue;
  if(!best||probability>best.probability)best={url:candidate.url,title:String(candidate.title||''),snippet:String(candidate.snippet||''),probability,index,uncertain:match?.status!=='likely_profile'};
 }
 return best;
}
