import {describe,test,expect,mock,beforeEach,afterEach,setSystemTime} from 'bun:test';

const testCode='05102026';
let variableReads:string[]=[],dbReads=0,backendCalls:any[]=[];
mock.module('windmill-client',()=>({
 getVariable:async(key:string)=>{variableReads.push(key);return 'true';},
 datatable:()=>{dbReads++;return ()=>({fetch:async()=>[],fetchOne:async()=>null});},
 runScriptByPath:async(path:string,args:any)=>{backendCalls.push({path,args});if(args.dashboard_passcode!==testCode)throw new Error('Incorrect dashboard password');return {read_only:true,recipients:[]};}
}));
const {main:read}=await import('../f/old_leads_churn/read_mumbai_nurture_dashboard');
const {main:serve,preprocessor}=await import('../f/old_leads_churn/serve_mumbai_churn_dashboard');
beforeEach(()=>{setSystemTime(new Date('2026-10-05T08:00:00Z'));variableReads=[];dbReads=0;backendCalls=[];globalThis.fetch=mock(async()=>new Response('',{status:503})) as any;});
afterEach(()=>setSystemTime());
describe('Mumbai dashboard access',()=>{
 for(const code of ['','wrong-password','01102026','04102026','0510202','05/10/2026'])test(`rejects invalid input ${JSON.stringify(code)} before data access`,async()=>{
  await expect(read(code)).rejects.toThrow('Incorrect dashboard password');
  expect(dbReads).toBe(0);expect(variableReads).toEqual([]);
 });
 test('valid password allows the existing read-only reader',async()=>{
  const result=await read(testCode);expect(result.read_only).toBe(true);expect(dbReads).toBe(1);expect(result.recipients).toEqual([]);
 });
 test('URL password cannot bypass the request header',async()=>{
  const args=await preprocessor({kind:'http',query:{__data:'1',dashboard_passcode:testCode}});
  expect(args.dashboard_passcode).toBe('');await expect(serve(args.query,args.dashboard_passcode)).rejects.toThrow();
 });
 test('header password reaches only the protected reader',async()=>{
  const args=await preprocessor({kind:'http',query:{__data:'1'},headers:{'X-MUMBAI-CHURN-PASSCODE':testCode}});
  const result=await serve(args.query,args.dashboard_passcode);expect(result.windmill_content_type).toContain('application/json');
  expect((result.result as any).read_only).toBe(true);expect((result.result as any).recipients).toEqual([]);expect(backendCalls).toHaveLength(0);expect(dbReads).toBe(1);
 });
 test('anonymous shell reads no data',async()=>{
  const result=await serve();expect(result.windmill_content_type).toContain('text/html');expect(backendCalls).toHaveLength(0);expect(dbReads).toBe(0);expect(variableReads).toHaveLength(0);
 });
 test('code rolls over at midnight in India, while UTC is still the previous date',async()=>{
  setSystemTime(new Date('2026-10-05T18:29:59Z'));
  expect((await read('05102026')).read_only).toBe(true);
  setSystemTime(new Date('2026-10-05T18:30:00Z'));
  await expect(read('05102026')).rejects.toThrow('Incorrect dashboard password');
  expect((await read('06102026')).read_only).toBe(true);
 });
});
