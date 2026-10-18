import test from 'node:test';import assert from 'node:assert/strict';
import {parseAirbnbCSV} from '../costs-airbnb-import.js';
test('imports only Airbnb service fees, preserving confirmation identity and cents',()=>{
 const text='Data,Tipo,Código de Confirmação,Anúncio,Taxa de serviço,Valor\r\n10/16/2026,Payout,,,,684.72\r\n10/16/2026,Reserva,HMJYRH2FNW,Ville Signature,"152,48",684.72\r\n10/12/2026,Ajuste de Resolução,HMMJTCNPMT,Ville Essenza,,"-1176,64"\r\n';
 assert.deepEqual(parseAirbnbCSV(text),[{reference:'HMJYRH2FNW',listing:'Ville Signature',paid_on:'2026-10-16',amount_cents:15248}]);
});
test('rejects duplicate reservation codes and missing columns',()=>{
 assert.throws(()=>parseAirbnbCSV('Data,Tipo,Código de Confirmação,Anúncio,Taxa de serviço\n10/16/2026,Reserva,ABC123,One,"1,20"\n10/16/2026,Reserva,ABC123,One,"1,20"'),/repetido/);
 assert.throws(()=>parseAirbnbCSV('Data,Tipo\n10/16/2026,Reserva'),/CSV de transações/);
});
