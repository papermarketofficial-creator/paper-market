import 'dotenv/config';
import { instrumentRepository } from '@/lib/instruments/repository';

await instrumentRepository.ensureInitialized();

const fut = instrumentRepository.getFutures('NIFTY');
const opt = instrumentRepository.getOptions('NIFTY');
const exp = instrumentRepository.getExpiries('NIFTY');

console.log(JSON.stringify({
  futuresCount: fut.length,
  optionsCount: opt.length,
  expiriesCount: exp.length,
  futuresSample: fut.slice(0,3).map(x => x.tradingsymbol),
  optionsSample: opt.slice(0,3).map(x => x.tradingsymbol),
  expiriesSample: exp.slice(0,3).map(d => d.toISOString())
}, null, 2));
