import {test} from 'node:test';import assert from 'node:assert/strict';import {readFileSync} from 'node:fs';import vm from 'node:vm';
const s=readFileSync('auth.js','utf8'),ctx={};vm.runInNewContext(s.slice(s.indexOf('const authMessage='),s.indexOf('const panes='))+';this.explain=authMessage;',ctx);
test('login differentiates network failure from rejected credentials without reflecting raw errors',()=>{assert.match(ctx.explain({name:'AuthRetryableFetchError',message:'Failed to fetch'},'login'),/senha ainda não foi validada/);assert.match(ctx.explain({code:'invalid_credentials'}),/E-mail ou senha incorretos/);assert.match(ctx.explain({status:503}),/temporariamente indisponível/);assert.doesNotMatch(ctx.explain({message:'sensitive arbitrary content'}),/sensitive/)});

test('retryable HTTP 500 during signup is a server failure, not a connection or password error',()=>{
 const message=ctx.explain({name:'AuthRetryableFetchError',status:500,message:'Database error saving new user'},'signup');
 assert.match(message,/e-mail ou documento/);assert.match(message,/Entrar/);assert.doesNotMatch(message,/conexão|senha ainda não foi validada|Database/);
 assert.match(ctx.explain({name:'AuthRetryableFetchError',status:500},'login'),/temporariamente indisponível/);
 assert.match(ctx.explain({name:'AuthRetryableFetchError',message:'Failed to fetch'},'signup'),/serviço de cadastro/);
});
