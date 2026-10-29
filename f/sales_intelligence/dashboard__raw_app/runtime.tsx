import {backend} from './wmill';
export async function callBackend(name:string,args:Record<string,unknown>):Promise<any>{
 return (backend as any)[name](args);
}
