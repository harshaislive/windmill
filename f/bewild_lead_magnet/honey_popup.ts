import * as wmill from 'windmill-client';
import { createHash, randomBytes, randomUUID } from 'node:crypto';
import { parsePhoneNumberFromString } from 'libphonenumber-js/max';

const ORIGINS = ['https://beforest.co', 'https://www.beforest.co'];
const CAMPAIGN = 'coffee_blossom_honey_202609';
const CONSENT_VERSION = 'honey_whatsapp_v1_2026-09-09';
const CONSENT_TEXT = 'I agree to receive the Coffee Blossom Honey story and purchase link from Bewild on WhatsApp.';
const KEY_PATH = 'f/bewild_lead_magnet/interakt_api_key';
const MATON_KEY_PATH = 'f/sales/maton_api_key';
const SHEET_ID = '1GZc7CrwY9QLvFsToucmFHwzb5V3AfU6rfziaqCMvmhI';
const SHEET_TAB = 'Sheet1';
const TEMPLATES: Record<string, string> = {
 landscape_return: 'bewild_honey_promised_story_v1',
 honey_unplanned: 'bewild_honey_promised_story_v1',
};
// Image from the user reference; promised-story definition verified live in Bewild Interakt.
const REFERENCE: any = {"image_source":"https://cdn.shopify.com/s/files/1/0367/0831/9276/files/ed311ba7-453c-4d03-ae72-8ff382ff735d.png?v=1788933879","definitions":[{"display_name":"bewild_honey_promised_story_v1","wa_template_id":"952096320544710","body":"Hi {{1}}, here’s the story we promised.\n\nCoffee flowers don’t stay for long. The bees make the most of them.\n\nAt Poomaale, our collective in Coorg, that brief flowering gives us Coffee Blossom Honey. Bewild brings it to you raw and unfiltered.\n\nA jar to open at breakfast, knowing a little more about where it came from.\n\nThis is a small seasonal batch, not something we can promise to keep replenishing.","buttons":[{"type":"URL","text":"If you’d like a jar","url":"https://bewild.life/products/coffee-blossom-honey-200g-small-batch-harvest-single-origin"}]}]};
const MAX_BYTES = 4096;
const POW_BITS = 18;
type HttpInput = { raw: string; origin: string; content_type: string; method: string; ip_hint: string };
export const sha256 = (s: string) => createHash('sha256').update(s).digest('hex');
class InputError extends Error { constructor(public code: string, public http = 400) { super(code); } }

export function response(origin: string, http: number, body: any, retryAfter?: number) {
 return {
  wm_status_code: http, wm_content_type: 'application/json',
  wm_headers: {
   'Cache-Control': 'no-store', 'Vary': 'Origin', 'X-Content-Type-Options': 'nosniff',
   ...(ORIGINS.includes(origin) ? { 'Access-Control-Allow-Origin': origin } : {}),
   ...(retryAfter ? { 'Retry-After': String(retryAfter) } : {}),
  }, result: body,
 };
}

export async function preprocessor(event: any) {
 const h: Record<string,string> = {};
 for (const [k,v] of Object.entries(event?.headers || {})) h[k.toLowerCase()] = String(v);
 const raw = typeof event?.raw_string === 'string' ? event.raw_string : typeof event?.body === 'string' ? event.body : JSON.stringify(event?.body ?? null);
 // Headers come from HTTP event metadata, never from user-supplied body parameters.
 return { input: { raw, origin: h.origin || '', content_type: h['content-type'] || '', method: String(event?.method || '').toUpperCase(),
  ip_hint: (h['x-real-ip'] || h['x-forwarded-for']?.split(',')[0] || 'unknown').trim().slice(0,100) } };
}

export function validate(raw: string, origin: string) {
 if (Buffer.byteLength(raw,'utf8') > MAX_BYTES) throw new InputError('payload_too_large',413);
 let b: any; try { b=JSON.parse(raw); } catch { throw new InputError('invalid_json'); }
 if (!b || Array.isArray(b) || typeof b !== 'object') throw new InputError('invalid_payload');
 const keys=['action','name','whatsapp','whatsapp_consent','consent_version','copy_variant','source_page','request_id','website','challenge_id','proof_nonce'];
 if (Object.keys(b).some(k=>!keys.includes(k))) throw new InputError('unknown_field');
 if (!['challenge','submit'].includes(b.action)) throw new InputError('invalid_action');
 if (b.website !== '') throw new InputError('invalid_submission');
 if (typeof b.name !== 'string') throw new InputError('invalid_name');
 const name=b.name.normalize('NFC').trim().replace(/ +/g,' ');
 if (name.length<2 || name.length>80 || !/^[\p{L}\p{M} .’'\-]+$/u.test(name) || !/\p{L}/u.test(name)) throw new InputError('invalid_name');
 if (typeof b.whatsapp!=='string' || !/^\+[1-9]\d{7,14}$/.test(b.whatsapp)) throw new InputError('invalid_whatsapp');
 const phone=parsePhoneNumberFromString(b.whatsapp);
 if (!phone?.isValid() || phone.number!==b.whatsapp) throw new InputError('invalid_whatsapp');
 if (b.whatsapp_consent!==true) throw new InputError('whatsapp_consent_required');
 if (b.consent_version!==CONSENT_VERSION) throw new InputError('unsupported_consent_version');
 if (typeof b.copy_variant!=='string' || !Object.hasOwn(TEMPLATES,b.copy_variant)) throw new InputError('invalid_copy_variant');
 if (typeof b.request_id!=='string' || !/^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(b.request_id)) throw new InputError('invalid_request_id');
 if (typeof b.source_page!=='string' || b.source_page.length>1024) throw new InputError('invalid_source_page');
 let page: URL; try {page=new URL(b.source_page)} catch {throw new InputError('invalid_source_page')}
 if (page.origin!==origin || page.username || page.password || page.hash || page.search) throw new InputError('invalid_source_page');
 const p={request_id:b.request_id.toLowerCase(),name,phone:phone.number,whatsapp_consent:true,consent_version:CONSENT_VERSION,consent_text:CONSENT_TEXT,
  copy_variant:b.copy_variant,source_page:page.href,origin,template_name:TEMPLATES[b.copy_variant]};
 if (b.action==='submit' && (typeof b.challenge_id!=='string' || !/^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(b.challenge_id) || typeof b.proof_nonce!=='string' || !/^\d{1,12}$/.test(b.proof_nonce))) throw new InputError('invalid_proof');
 if (b.action==='challenge' && ('challenge_id' in b || 'proof_nonce' in b)) throw new InputError('unknown_field');
 return {b,p,fingerprint:sha256(JSON.stringify(p))};
}

export function proofValid(challenge: string, nonce: string) {
 const digest=createHash('sha256').update(`${challenge}:${nonce}`).digest();
 return digest[0]===0 && digest[1]===0 && (digest[2]&0xc0)===0;
}
export function templateMatches(t: any, name: string) {
 const expected=REFERENCE.definitions.find((x:any)=>x.display_name===name);
 let buttons: any; try {buttons=typeof t?.buttons==='string'?JSON.parse(t.buttons):t?.buttons} catch{return false}
 return !!expected && t?.name===name && String(t.wa_template_id)===expected.wa_template_id && t.approval_status==='APPROVED' && t.language==='en' && t.header_format==='IMAGE' && t.body===expected.body &&
  Array.isArray(buttons) && buttons.length===1 && buttons[0].type==='URL' && buttons[0].text===expected.buttons[0].text && buttons[0].url===expected.buttons[0].url && !t.is_archived;
}
export function providerPayload(p: any,id: string) {
 const phone=parsePhoneNumberFromString(p.phone)!;
 return {countryCode:`+${phone.countryCallingCode}`,phoneNumber:phone.nationalNumber,type:'Template',callbackData:`honey:${id}`,
  template:{name:p.template_name,languageCode:'en',headerValues:[REFERENCE.image_source],bodyValues:[p.name.split(' ').find((part:string)=>/\p{L}/u.test(part))]}};
}

async function appendLeadToSheet(p: any, id: string, status: string) {
 const key = await wmill.getVariable(MATON_KEY_PATH);
 const range = encodeURIComponent(`${SHEET_TAB}!A:Z`);
 const row = [[new Date().toISOString(), id, p.request_id, p.name, p.phone, p.whatsapp_consent, p.consent_version, p.consent_text, p.copy_variant, p.source_page, p.origin, CAMPAIGN, p.template_name, status]];
 const r = await fetch(`https://api.maton.ai/google-sheets/v4/spreadsheets/${SHEET_ID}/values/${range}:append?valueInputOption=RAW&insertDataOption=INSERT_ROWS`, {method:'POST', headers:{Authorization:`Bearer ${key}`,'Maton-Connection':'6463e553-eab2-4cb9-a46f-b1a5665c0031','Content-Type':'application/json'}, body:JSON.stringify({majorDimension:'ROWS',values:row}), signal:AbortSignal.timeout(8000)});
 if (!r.ok) throw new Error(`sheet_http_${r.status}`);
}
export function classifyProvider(http: number, b: any) {
 if (http>=200 && http<300 && b?.result===true && typeof b.id==='string' && b.id.length>0 && b.id.length<=128)
  return {status:'provider_accepted',id:b.id,error:null};
 if (http>=400 && http<500 && http!==408) return {status:'provider_rejected',id:null,error:`interakt_http_${http}`};
 return {status:'send_unknown',id:null,error:'interakt_ambiguous_response'};
}

async function takeLimit(sql: any,bucket: string,max: number,expires: Date) {
 const r=await sql`SELECT public.bewild_honey_take_limit(${bucket},${max}::integer,${expires.toISOString()}::timestamptz) AS allowed`.fetchOne();
 return r?.allowed===true;
}
function duplicate(origin: string,requestId: string,status: string) {
 return response(origin,200,{ok:true,status:'duplicate',request_id:requestId,submission_status:status,message:'This campaign submission is already recorded. No additional WhatsApp was requested.'});
}

// No caller-controlled dry_run, credentials, template names, image URLs or send switches.
export async function handle(input: HttpInput, deps: {sql: any; getKey: ()=>Promise<string>; fetch: typeof fetch}) {
 const origin=input?.origin || '';
 try {
  if (!ORIGINS.includes(origin)) throw new InputError('origin_not_allowed',403);
  if (input.method!=='POST') throw new InputError('method_not_allowed',405);
  if (!/^application\/json(?:\s*;|$)/i.test(input.content_type)) throw new InputError('unsupported_media_type',415);
  if (typeof input.raw!=='string' || Buffer.byteLength(input.raw,'utf8')>MAX_BYTES) throw new InputError('payload_too_large',413);
  const sql=deps.sql;
  const now=Date.now(), minute=Math.floor(now/60000), hour=Math.floor(now/3600000), day=Math.floor(now/86400000);
  // Global DB counters are authoritative; IP hints are supplementary and never trusted as identity.
  if (!await takeLimit(sql,`http:${minute}`,120,new Date(now+120000))) throw new InputError('rate_limited',429);
  if (!await takeLimit(sql,`ip:${minute}:${sha256(input.ip_hint || 'unknown')}`,20,new Date(now+120000))) throw new InputError('rate_limited',429);
  const {b,p,fingerprint}=validate(input.raw,origin);
  const prior=await sql`SELECT r.fingerprint,s.status FROM public.bewild_honey_requests r JOIN public.bewild_honey_submissions s ON s.id=r.submission_id WHERE r.request_id=${p.request_id}::uuid`.fetchOne();
  if (prior) {
   if(prior.fingerprint!==fingerprint) throw new InputError('request_id_conflict',409);
   return duplicate(origin,p.request_id,prior.status);
  }
  if (b.action==='challenge') {
   if (!await takeLimit(sql,`challenge:${minute}`,30,new Date(now+120000)) || !await takeLimit(sql,`phone:${hour}:${sha256(p.phone)}`,6,new Date(now+7200000))) throw new InputError('rate_limited',429);
   await sql`DELETE FROM public.bewild_honey_challenges WHERE expires_at<now()-interval '1 hour'`.execute();
   await sql`DELETE FROM public.bewild_honey_limits WHERE expires_at<now()`.execute();
   const id=randomUUID(),challenge=randomBytes(32).toString('hex');
   await sql`INSERT INTO public.bewild_honey_challenges(id,challenge,fingerprint) VALUES(${id}::uuid,${challenge},${fingerprint})`.execute();
   return response(origin,200,{ok:true,status:'challenge',request_id:p.request_id,challenge_id:id,challenge,algorithm:'SHA-256',difficulty_bits:POW_BITS,minimum_wait_ms:2000,expires_in_seconds:300});
  }
  const challenge=await sql`SELECT challenge FROM public.bewild_honey_challenges WHERE id=${b.challenge_id}::uuid AND fingerprint=${fingerprint} AND used_at IS NULL AND issued_at<=now()-interval '2 seconds' AND expires_at>now()`.fetchOne();
  if (!challenge || !proofValid(challenge.challenge,b.proof_nonce)) {
   // A concurrent identical request may have consumed the challenge and committed first.
   const raced=await sql`SELECT r.fingerprint,s.status FROM public.bewild_honey_requests r JOIN public.bewild_honey_submissions s ON s.id=r.submission_id WHERE r.request_id=${p.request_id}::uuid`.fetchOne();
   if(raced?.fingerprint===fingerprint) return duplicate(origin,p.request_id,raced.status);
   if(raced) throw new InputError('request_id_conflict',409);
   throw new InputError('invalid_or_expired_challenge',403);
  }
  const claimRow=await sql`SELECT public.bewild_honey_claim(${JSON.stringify(p)}::jsonb,${fingerprint},${b.challenge_id}::uuid,${randomUUID()}::uuid) AS claim`.fetchOne();
  const claim=claimRow?.claim;
  if (claim?.outcome==='conflict') throw new InputError('request_id_conflict',409);
  if (claim?.outcome==='invalid_challenge') throw new InputError('invalid_or_expired_challenge',403);
  if (claim?.outcome==='duplicate') return duplicate(origin,p.request_id,claim.status);
  if (claim?.outcome!=='claimed') throw new Error('claim_failed');
  const id=claim.id;
  async function block(status: string,error: string) {
   await sql`UPDATE public.bewild_honey_submissions SET status=${status},sanitized_error=${error},updated_at=now() WHERE id=${id}::uuid AND status='claimed'`.execute();
   return response(origin,503,{ok:false,status:'error',code:error,request_id:p.request_id,retryable:false});
  }
  let authorization: string;
  try {const key=await deps.getKey(); if(!key) throw Error(); authorization=/^Basic /i.test(key)?key:`Basic ${key}`;} catch {return await block('blocked_configuration','sender_unavailable')}
  try {
   const r=await deps.fetch('https://api.interakt.ai/v1/public/track/organization/templates',{headers:{Authorization:authorization},signal:AbortSignal.timeout(8000)});
   if(!r.ok) return await block('blocked_template','template_unavailable');
   const inventory=await r.json();
   const template=inventory?.results?.templates?.find((t:any)=>t.name===p.template_name);
   if(!templateMatches(template,p.template_name)) return await block('blocked_template','template_unavailable');
   await sql`UPDATE public.bewild_honey_submissions SET template_checked_at=now(),updated_at=now() WHERE id=${id}::uuid`.execute();
  } catch {return await block('blocked_template','template_unavailable')}
  if(!await takeLimit(sql,`send:${minute}`,10,new Date(now+120000)) || !await takeLimit(sql,`send:${day}:day`,200,new Date(now+172800000))) return await block('blocked_quota','campaign_rate_limited');
  const taken=await sql`UPDATE public.bewild_honey_submissions SET status='sending',send_started_at=now(),updated_at=now() WHERE id=${id}::uuid AND status='claimed' RETURNING id`.fetchOne();
  if(!taken) return duplicate(origin,p.request_id,'processing');
  // The durable sending claim precedes the sole provider POST. Any interruption suppresses retries.
  let result: {status:string;id:string|null;error:string|null};
  try {
   const r=await deps.fetch('https://api.interakt.ai/v1/public/message/',{method:'POST',headers:{Authorization:authorization,'Content-Type':'application/json'},body:JSON.stringify(providerPayload(p,id)),signal:AbortSignal.timeout(10000)});
   const body=await r.json().catch(()=>null);
   result=classifyProvider(r.status,body);
  } catch {result={status:'send_unknown',id:null,error:'interakt_transport_unknown'}}
  try {
   await sql`UPDATE public.bewild_honey_submissions SET status=${result.status},interakt_message_id=${result.id},sanitized_error=${result.error},provider_accepted_at=CASE WHEN ${result.status}='provider_accepted' THEN now() ELSE NULL END,updated_at=now() WHERE id=${id}::uuid AND status='sending'`.execute();
  } catch {return response(origin,503,{ok:false,status:'error',code:'send_outcome_unknown',request_id:p.request_id,retryable:false})}
  if(result.status==='provider_accepted') {
   try { await appendLeadToSheet(p, id, result.status); } catch { /* sheet sync is best-effort; ledger remains authoritative */ }
   return response(origin,202,{ok:true,status:'accepted',request_id:p.request_id,message:'Interakt accepted the WhatsApp request. Delivery is not confirmed.'});
  }
  return response(origin,502,{ok:false,status:'error',code:result.status==='send_unknown'?'send_outcome_unknown':'provider_rejected',request_id:p.request_id,retryable:false});
 } catch(e) {
  if(e instanceof InputError) return response(origin,e.http,{ok:false,status:'error',code:e.code,retryable:e.http===429},e.http===429?60:undefined);
  // Do not expose DB errors, raw provider messages, tokens, payloads or stack traces.
  return response(origin,503,{ok:false,status:'error',code:'service_unavailable',retryable:false});
 }
}

export async function main(input: HttpInput) {
 return handle(input,{sql:wmill.datatable('main'),getKey:()=>wmill.getVariable(KEY_PATH),fetch});
}
