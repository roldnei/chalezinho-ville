import {
  createPagBankOrder, getPagBankCharge, getPagBankOrderCharge, changePagBankCharge, pagBankOrder,
  verifyPagBankNotification, verifyPagBankSignedNotification,
} from '../../booking-engine/pagbank.ts';

export type PaymentInput = Parameters<typeof pagBankOrder>[0] & {description?:string};
export type ProviderCharge = Awaited<ReturnType<typeof getPagBankCharge>> & {readSource?:'charge'|'order'};
export interface PaymentGateway {
  readonly id: string;
  readonly capabilities: { multipleCaptures: boolean; partialRefunds: boolean; multipleRefunds: boolean; releaseRemainderConfirmed: boolean };
  validatePayment(input:PaymentInput):void;
  createPix(input: PaymentInput): ReturnType<typeof createPagBankOrder>;
  createCardPayment(input: PaymentInput): ReturnType<typeof createPagBankOrder>;
  authorizeCard(input: PaymentInput): ReturnType<typeof createPagBankOrder>;
  captureAuthorization(id: string, cents: number, key: string): ReturnType<typeof changePagBankCharge>;
  cancelAuthorization(id: string, cents: number, key: string): ReturnType<typeof changePagBankCharge>;
  refund(id: string, cents: number, key: string): ReturnType<typeof changePagBankCharge>;
  getPayment(id: string,orderId?:string): Promise<ProviderCharge>;
  getRefund(id: string,orderId?:string): Promise<ProviderCharge>;
  authenticateWebhook(raw: string, headers: Headers): Promise<boolean>;
}

// Environment is selected on the server. No frontend field can enable production.
export function paymentGateway(provider: string, token: string, fetcher: typeof fetch = fetch): PaymentGateway {
  if (provider !== 'pagbank_sandbox') throw new Error('gateway_not_enabled');
  const create = (input: PaymentInput) => {
    const order=pagBankOrder(input);
    if(input.description){order.items[0].name=input.description;if(order.charges?.[0])order.charges[0].description=input.description;}
    return createPagBankOrder('sandbox', token, order, fetcher);
  };
  const change = (id: string, operation: 'capture' | 'cancel', cents: number, key: string) =>
    changePagBankCharge(token, id, operation, cents, key, fetcher);
  const read = async(id: string,orderId?:string):Promise<ProviderCharge> => {
    try{return {...await getPagBankCharge(token,id,fetcher),readSource:'charge'}}
    catch(error){if(!orderId)throw error;return {...await getPagBankOrderCharge(token,orderId,id,fetcher),readSource:'order'}}
  };
  return {
    id: provider,
    validatePayment: input => {pagBankOrder(input);},
    capabilities: {multipleCaptures:false, partialRefunds:true, multipleRefunds:true, releaseRemainderConfirmed:false},
    createPix: input => create({...input,method:'pix',preAuthorize:false}),
    createCardPayment: input => create({...input,method:'card',preAuthorize:false}),
    authorizeCard: input => create({...input,method:'card',preAuthorize:true,installments:1}),
    captureAuthorization: (id,cents,key) => change(id,'capture',cents,key),
    cancelAuthorization: (id,cents,key) => change(id,'cancel',cents,key),
    refund: (id,cents,key) => change(id,'cancel',cents,key),
    getPayment: read, getRefund: read,
    async authenticateWebhook(raw,headers) {
      const signature=headers.get('x-authenticity-token')||'';
      if(await verifyPagBankNotification(token,raw,signature)) return true;
      const signed=headers.get('x-payload-signature');
      return Boolean(signed && await verifyPagBankSignedNotification(token,raw,signed));
    },
  };
}
