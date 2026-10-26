import test from 'node:test';
import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import { once } from 'node:events';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

test('真正重启后台并保留资料；关闭后端口释放且管理进程退出', {timeout:60000}, async (t) => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'venus-lifecycle-'));
  const child = spawn(process.execPath, ['src/supervisor.mjs'], {
    env: {...process.env, VENUS_PORT:'0', VENUS_DATA:root, VENUS_ANALYSIS:'0'}, windowsHide:true,
  });
  t.after(() => { child.kill(); fs.rmSync(root, {recursive:true, force:true}); });
  let output = '', diagnostics = '';
  child.stderr.on('data',chunk=>diagnostics+=chunk);
  child.stdout.on('data', (chunk) => { output += chunk; });
  async function address(index) {
    for (let n=0; n<400; n++) {
      if(child.exitCode!==null)throw new Error("隔离测试后台已退出: "+child.exitCode+" "+diagnostics);
      const matches = [...output.matchAll(/http:\/\/127\.0\.0\.1:\d+/g)];
      if (matches[index]) return matches[index][0];
      await new Promise(r=>setTimeout(r,50));
    }
    throw new Error('隔离测试后台未就绪: '+output+' '+diagnostics);
  }
  const url = await address(0);
  const post = (base, route, body, origin) => fetch(base+route, {method:'POST', headers:{'Content-Type':'application/json', ...(origin?{Origin:origin}:{})}, body:JSON.stringify(body)});
  await post(url, '/api/import', {name:'重启保留', body:'已保存的资料'});
  assert.equal((await post(url,'/api/lifecycle',{action:'shutdown'},'https://example.com')).status,403);
  assert.equal((await post(url,'/api/lifecycle',{action:'invalid'})).status,400);
  assert.equal((await post(url,'/api/lifecycle',{action:'restart'})).status,200);
  const replacement = await address(1);
  const state = await (await fetch(replacement+'/api/state')).json();
  assert.equal(state.nodes.length,1);
  assert.equal((await fetch(replacement+'/style.css')).headers.get('cache-control'),'no-store');
  const exited = once(child,'exit');
  assert.equal((await post(replacement,'/api/lifecycle',{action:'shutdown'})).status,200);
  assert.equal((await exited)[0],0);
  await assert.rejects(fetch(replacement+'/api/state'));
});
