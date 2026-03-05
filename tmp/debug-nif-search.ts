import 'dotenv/config';
import { instrumentRepository } from '@/lib/instruments/repository';

await instrumentRepository.ensureInitialized();
const raw = await instrumentRepository.search('NIF', 800);
const fut = raw.filter((inst:any)=> inst.segment === 'NSE_FO' && String(inst.instrumentType||'').toUpperCase()==='FUTURE');
console.log(JSON.stringify({rawCount: raw.length, futCount: fut.length, fut: fut.slice(0,10).map((x:any)=>x.tradingsymbol)}, null, 2));
