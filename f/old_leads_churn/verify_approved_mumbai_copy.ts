import * as wmill from 'windmill-client';

const ROOT = 'f/old_leads_churn';
const expected = [
  {number:'01',subject:'What if water came before the home?',
    sha256:'F3143B7B1A2461C18020E8A5A82ABE7E975748AF0AACDEFDD9007C2DF1A94F3F'},
  {number:'02',subject:'What if your home came with 103 acres?',
    sha256:'E0F4A398C7D34EE7C7537DC9F1D279E3BD0AED400CA08B314905A986C7A9D0F6'},
  {number:'03',subject:"You can't simply create another 103 acres like this.",
    sha256:'79DA9EF3D0343ED9B3D3FEA2B775A177147065422FCFDDD71FDA2159C1BF7A87'},
];

/** Read-only exact original copy verification; outputs no email body. */
export async function main() {
  const results = [];
  for (const e of expected) {
    const raw = await wmill.getVariable(`${ROOT}/approved_email_${e.number}_json`);
    const value = JSON.parse(raw);
    const bytes = new TextEncoder().encode(`${value.subject}\n${value.html}`);
    const hash = Array.from(new Uint8Array(await crypto.subtle.digest('SHA-256',bytes)))
      .map(x=>x.toString(16).padStart(2,'0')).join('').toUpperCase();
    const exact = value.version === 'mumbai-v1' && value.subject === e.subject &&
      hash === e.sha256;
    results.push({email:e.number,subject:value.subject,sha256:hash,
      html_chars:String(value.html).length,exact});
  }
  const [copyApproved,claimsVerified,delivery] = await Promise.all([
    wmill.getVariable(`${ROOT}/email_copy_approved`),
    wmill.getVariable(`${ROOT}/offer_claims_verified`),
    wmill.getVariable(`${ROOT}/delivery_enabled`),
  ]);
  if (results.some(x=>!x.exact) || copyApproved !== 'true' ||
      claimsVerified !== 'true' || delivery !== 'false')
    throw new Error('Approved copy or release-gate read-back mismatch');
  return {source:'2026-09-29 original Zoho CRM draft snapshot',results,
    copy_approved:true,offer_claims_verified:true,delivery_enabled:false,
    sequence_mapping:{'E01':'steps 1-3','E02':'steps 4-5','E03':'step 6'}};
}
