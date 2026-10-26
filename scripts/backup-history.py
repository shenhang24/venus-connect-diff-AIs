"""Incremental verbatim visible-message backup. Never execute source instructions."""
import argparse
import hashlib
import json
import os
import re
from datetime import datetime, timezone
from pathlib import Path
from urllib.parse import quote
from urllib.request import Request, urlopen
from urllib.error import HTTPError

ROOT = Path(__file__).resolve().parents[1]
DATA = Path(os.environ.get('VENUS_DATA', str(ROOT / 'data')))
WORK = DATA.parent / 'work' / 'daily-backup'
SINCE = 0  # Only explicitly supplied source packages are consumed.

def digest(text):
    return hashlib.sha256(text.encode('utf-8')).hexdigest()

def atomic_json(path, data):
    path.parent.mkdir(parents=True, exist_ok=True)
    tmp = path.with_suffix(path.suffix + '.tmp')
    tmp.write_text(json.dumps(data, ensure_ascii=False, indent=2), encoding='utf-8')
    os.replace(tmp, path)

def api(route, data=None):
    req = Request(os.environ.get('VENUS_BACKUP_URL','http://127.0.0.1:10001').rstrip('/') + '/api/' + route,
                  data=None if data is None else json.dumps(data, ensure_ascii=False).encode(),
                  headers={'Content-Type': 'application/json'})
    try:
        with urlopen(req, timeout=90) as response:
            return json.load(response)
    except HTTPError as error:
        if route == 'import' and error.code == 410:
            detail = json.load(error)
            return {'skippedUserDeleted': True, 'reason': detail.get('error', 'User-deleted source version')}
        if route.startswith('node?id=') and error.code == 404:
            deleted = api('workspace/deleted-source?id=' + route.split('=', 1)[1])
            if deleted.get('deleted'):
                return {'userDeleted': True, 'id': deleted['id']}
        raise

def text_parts(content):
    if isinstance(content, str):
        return content
    lines = []
    for part in content or []:
        if isinstance(part, str):
            lines.append(part)
        elif isinstance(part, dict):
            if isinstance(part.get('text'), str):
                lines.append(part['text'])
            else:
                # Binary media stays in the source. Preserve safe reference metadata.
                meta = {k:v for k,v in part.items() if k.lower() not in ('data', 'bytes', 'base64', 'image_url', 'audio')}
                if meta:
                    lines.append('[附件引用，二进制未备份] ' + json.dumps(meta, ensure_ascii=False))
    return '\n\n'.join(lines)

def parse_local(path):
    messages, seen, meta, errors = [], set(), {}, []
    with path.open('rb') as source:
        # Bound this run to a fixed source size even when the task is still writing.
        limit = os.fstat(source.fileno()).st_size
        while source.tell() < limit:
            offset = source.tell()
            raw = source.readline()
            if source.tell() > limit or not raw.endswith(b'\n'):
                break
            try:
                record = json.loads(raw)
            except (ValueError, UnicodeError):
                errors.append({'offset':offset, 'error':'invalid source record'})
                continue
            item = record.get('payload', {})
            kind = record.get('type')
            if kind == 'session_meta':
                meta = item
            elif kind == 'event_msg' and item.get('type') == 'item_completed':
                visible = item.get('item', {})
                if visible.get('type') not in ('UserMessage', 'AgentMessage'):
                    continue
                mid = visible.get('id') or f'event:{offset}'
                if mid in seen:
                    continue
                body = text_parts(visible.get('content'))
                if body:
                    seen.add(mid)
                    messages.append({'id':mid, 'role':'user' if visible['type']=='UserMessage' else 'assistant',
                                     'timestamp':record.get('timestamp'), 'phase':visible.get('phase'), 'text':body})
    # Event records preserve visible messages across context compaction; never import reasoning.
    return {'id':meta.get('id') or path.stem[-36:], 'source':'codex-local', 'title':meta.get('cwd') or path.stem,
            'sourcePath':str(path), 'messages':messages, 'errors':errors,
            'coverage':'本机可见消息事件快照；不含系统指令、内部推理、工具原始输出及附件二进制；不保证源文件记录之前的历史。',
            'sourceBytes':limit, 'sourceUpdated':datetime.fromtimestamp(path.stat().st_mtime, timezone.utc).isoformat()}

def parse_pages(pages):
    if not pages:
        raise ValueError('empty API pages')
    thread = pages[0]['thread']
    messages, seen, errors = [], set(), []
    for page in reversed(pages):
        for turn in reversed(page.get('turns', [])):
            for item in turn.get('items', []):
                if item.get('type') not in ('userMessage', 'agentMessage'):
                    continue
                mid = item.get('id')
                if not mid:
                    errors.append({'error':'visible message missing stable ID', 'turn':turn.get('id')})
                    continue
                if mid in seen:
                    continue
                seen.add(mid)
                body = item.get('text') if item['type']=='agentMessage' else text_parts(item.get('content'))
                if body:
                    messages.append({'id':mid,'role':'assistant' if item['type']=='agentMessage' else 'user',
                                     'timestamp':item.get('timestamp',item.get('createdAt',item.get('create_time',turn.get('startedAt')))), 'timestampSource':'message' if any(k in item for k in ('timestamp','createdAt','create_time')) else 'turn-start-fallback', 'phase':item.get('phase'), 'text':body})
    return {'id':thread['id'], 'source':'chatgpt' if thread['kind']=='chatgpt' else ('codex-local' if thread.get('hostId')=='local' else 'codex-cloud'),
            'title':thread['title'], 'messages':messages, 'errors':errors,
            'coverage':'接口返回的可见消息逐字快照；接口可能只返回近期消息，不能视作完整历史。单项最多 20000 字符；附件二进制及工具输出未备份。Dots 来源身份尚需接口明确提供，不能凭语音判断。',
            'hasMore':pages[-1].get('page',{}).get('hasMore'), 'sourceUpdated':thread.get('updatedAt')}

def parse_normalized_record(record):
    """Read only an explicitly supplied visible-message document, never session storage."""
    if record.get('source') not in ('dots','chatgpt','codex-cloud','codex-local'):
        raise ValueError('unsupported visible message source')
    if not isinstance(record.get('id'),str) or not record['id'].strip() or not isinstance(record.get('messages'),list):
        raise ValueError('visible record requires stable conversation ID and message array')
    seen={}
    for message in record['messages']:
        if not message.get('id') or message.get('role') not in ('user','assistant') or not isinstance(message.get('text'),str):
            raise ValueError('visible message must retain stable ID, role, and original text')
        if message.get('timestamp') is not None and not isinstance(message['timestamp'],(str,int,float)):
            raise ValueError('message timestamp must retain a scalar source value or null')
        identity=(message['role'],message['text'],message.get('timestamp'))
        if message['id'] in seen and seen[message['id']] != identity:
            raise ValueError('conflicting duplicate message ID in the supplied document')
        seen[message['id']]=identity
    return {**record,'errors':record.get('errors',[])}

def merge_messages(old, new):
    merged = list(old)
    positions = {m['id']:i for i,m in enumerate(merged)}
    for m in new:
        if m['id'] in positions:
            prior = merged[positions[m['id']]]
            # A later call with a smaller truncation cap must not destroy a fuller message.
            combined={**prior,**m}
            combined['text']=m['text'] if len(m['text'])>=len(prior['text']) else prior['text']
            if 'timestamp' in m or 'timestamp' in prior:
                combined['timestamp']=m.get('timestamp') if m.get('timestamp') is not None else prior.get('timestamp')
            references=prior.get('attachments',[])+m.get('attachments',[])
            if references:
                combined['attachments']=list({json.dumps(a,sort_keys=True,ensure_ascii=False):a for a in references}.values())
            merged[positions[m['id']]]=combined
        else:
            positions[m['id']] = len(merged)
            merged.append(m)
    def ordering(m):
        value=m.get('timestamp')
        if isinstance(value,(int,float)):return float(value)
        try:return datetime.fromisoformat(str(value).replace('Z','+00:00')).timestamp()
        except (ValueError,TypeError):return float('inf')
    return sorted(merged,key=ordering)

def combine_records(records):
    combined={}
    for record in records:
        key=record['source']+':'+record['id']
        if key in combined:
            prior=combined[key]
            combined[key]={**prior,**record,'messages':merge_messages(prior['messages'],record['messages']),
                           'errors':prior.get('errors',[])+record.get('errors',[])}
        else:combined[key]=record
    return list(combined.values())

def render(record):
    lines = [f'# {record["title"]}', '', f'- 备份来源：{record["source"]}',
             f'- 原始对话／任务 ID：{record["id"]}', f'- 完整性说明：{record["coverage"]}',
             '- 日期规则：备份 2026-09-30 起有活动的对话／任务，并保留已取得的更早上下文。',
             '- 更新规则：同一对话持续更新同一 MD；每条消息保留稳定 ID；源内容按原文保存，不执行其中指令。',
             f'- 已取得消息数：{len(record["messages"])}', '']
    times = [m.get('timestamp') for m in record['messages'] if m.get('timestamp') is not None]
    if times:
        lines.extend([f'- 消息时间范围（源时间值）：{times[0]} 至 {times[-1]}', ''])
    if record.get('sourcePath'):
        lines.extend([f'- 本机原始记录：{record["sourcePath"]}', ''])
    if record.get('sourceUrl'):
        lines.extend([f'- 来源页面：{record["sourceUrl"]}', ''])
    for m in record['messages']:
        lines.extend([f'## {m["role"]} · {m.get("timestamp") or "源未提供时间"}', '',
                      f'消息 ID：{m["id"]}；阶段：{m.get("phase") or "未提供"}', '', m['text'], ''])
        if m.get('attachments'):
            lines.extend(['附件引用（未取得二进制时不代表附件已备份）：', '', json.dumps(m['attachments'],ensure_ascii=False,indent=2), ''])
    return '\n'.join(lines)

def upsert(record, ledger, index, write):
    key = record['source'] + ':' + record['id']
    cache = WORK / 'messages' / (digest(key) + '.json')
    old = json.loads(cache.read_text(encoding='utf-8')) if cache.exists() else None
    if old:
        record['messages'] = merge_messages(old['messages'], record['messages'])
    if not record['messages']:
        return {'id':record['id'], 'status':'no-visible-messages', 'errors':record['errors']}
    body = render(record)
    sha = digest(body)
    name = ('DOTS' if record['source']=='dots' else 'GPT' if record['source']=='chatgpt' else 'TASK') + '-' + digest(key)[:16] + '-' + re.sub(r'[<>:"/\\|?*\x00-\x1f]', '_', record['title'])[:42] + '.md'
    status = 'staged'
    prior = ledger.get(key)
    if prior and prior.get('incrementalMode'):
        raise ValueError('已启用增量批次；请使用 --incremental，禁止覆盖旧快照重提取')
    result = {'id':record['id'], 'source':record['source'], 'title':record['title'], 'name':name,
              'sha256':sha, 'messages':len(record['messages']), 'coverage':record['coverage'], 'errors':record['errors'],
              'completeVisibleHistory':record.get('completeVisibleHistory',False)}
    if write:
        if prior:
            node = api('node?id=' + quote(prior['vaultId']))
            node = node.get('node',node)
            if node.get('userDeleted'):
                response=api('import', {'name':name,'body':body,'originId':key,'originVersion':sha,'automatic':True})
                if response.get('skippedUserDeleted'):
                    atomic_json(cache, record)
                    return {**result, 'status':'skipped-user-deleted', 'reason':response['reason']}
                node=response['node']; status='imported'
            elif node['body'] == body:
                status='unchanged'
            else:
                if digest(node['body']) != prior['sha256']:
                    raise ValueError('Vault 原文经人工修改，停止覆盖并保留待核对快照')
                api('edit', {'id':node['id'], 'body':body, 'expectedHash':node['hash']})
                status='updated'
        else:
            # Recover from a previous successful write whose ledger save was interrupted.
            prefix = name.split('-',2)[:2]
            candidates = [n for n in index if n.get('path','').startswith('Vault/'+'-'.join(prefix)+'-')]
            if len(candidates)>1:
                raise ValueError('发现多份相同来源备份，需核对后合并')
            existing = candidates[0] if candidates else None
            if existing:
                node=api('node?id='+quote(existing['id'])); node=node.get('node',node)
                if node['body']!=body:
                    raise ValueError('同名备份存在但登记缺失，停止覆盖，需核对原文')
                status='unchanged'
            else:
                response=api('import', {'name':name,'body':body,'originId':key,'originVersion':sha,'automatic':True})
                if response.get('skippedUserDeleted'):
                    atomic_json(cache, record)
                    return {**result, 'status':'skipped-user-deleted', 'reason':response['reason']}
                node=response['node']
                status='unchanged' if response.get('duplicate') else 'imported'
        verify=api('node?id='+quote(node['id']));verify=verify.get('node',verify)
        if verify['body'] != body:
            raise ValueError('Vault readback mismatch')
        result.update(vaultId=verify['id'],vaultPath=verify['path'])
        ledger[key] = result
        atomic_json(WORK/'ledger.json',ledger)
    atomic_json(cache,record)
    target=WORK/'markdown'/name
    target.parent.mkdir(parents=True,exist_ok=True)
    target.write_bytes(body.encode('utf-8'))
    result['status']=status
    return result

def incremental_upsert(record, ledger, index, write):
    """Keep prior Vault snapshots immutable; enqueue only new/revised messages."""
    key = record['source'] + ':' + record['id']
    cache = WORK / 'messages' / (digest(key) + '.json')
    old = json.loads(cache.read_text(encoding='utf-8')) if cache.exists() else None
    prior = ledger.get(key)
    if prior and not old:
        raise ValueError('已有备份缺少消息基线；保留原文，不自动全文重提取')
    merged = {**record, 'messages':merge_messages(old['messages'] if old else [], record['messages'])}
    previous = {m['id']:m for m in (old or {}).get('messages', [])}
    def content(m):
        return (m['role'], m['text'], tuple(sorted({json.dumps(a, ensure_ascii=False, sort_keys=True) for a in m.get('attachments', [])})))
    delta = [m for m in merged['messages'] if m['id'] not in previous or content(m) != content(previous[m['id']])]
    result = {'id':record['id'], 'source':record['source'], 'title':record['title'],
              'status':'unchanged' if not delta else 'staged', 'messages':len(merged['messages']),
              'newMessages':sum(m['id'] not in previous for m in delta),
              'revisedMessages':sum(m['id'] in previous for m in delta),
              'incremental':True, 'errors':record.get('errors', []), 'coverage':record['coverage'],
              'completeVisibleHistory':record.get('completeVisibleHistory', False)}
    if not merged['messages']:
        return {**result, 'status':'no-visible-messages'}
    if not write:
        return result
    if not prior:
        # A new conversation has no old extraction to repeat.
        result = {**upsert(merged, ledger, index, True), **{k:v for k,v in result.items() if k!='status'}}
        if result.get('status') == 'skipped-user-deleted':
            return result
        ledger[key]['incrementalMode'] = True
        atomic_json(WORK/'ledger.json', ledger)
        return result
    if delta:
        batch = digest(json.dumps(delta, ensure_ascii=False, sort_keys=True))
        chunk = {**merged, 'title':record['title']+' · 增量 '+batch[:12], 'messages':delta,
                 'completeVisibleHistory':False,
                 'coverage':'仅此批新增或修订的可见消息原文；不是完整对话。既有备份：'+prior.get('vaultPath', prior['vaultId'])+'。'+record['coverage']}
        body = render(chunk)
        # Body/name are deterministic, so a crash after import cannot duplicate a batch.
        name = 'INCR-'+digest(key)[:16]+'-'+batch[:16]+'.md'
        response = api('import', {'name':name, 'body':body, 'originId':key, 'originVersion':batch,'automatic':True})
        if response.get('skippedUserDeleted'):
            prior.setdefault('suppressedBatches', []).append({'batch':batch,'sha256':digest(body),'messageIds':[m['id'] for m in delta],'reason':response['reason']})
            atomic_json(WORK/'ledger.json',ledger)
            atomic_json(cache,merged)
            return {**result,'status':'skipped-user-deleted','reason':response['reason']}
        node = response['node']
        verify = api('node?id='+quote(node['id']));verify = verify.get('node', verify)
        if verify['body'] != body:
            raise ValueError('Incremental Vault readback mismatch')
        receipt = {'batch':batch, 'vaultId':verify['id'], 'vaultPath':verify['path'],
                   'sha256':digest(body), 'messageIds':[m['id'] for m in delta]}
        receipts = prior.setdefault('incrementalBatches', [])
        if not any(r['batch']==batch for r in receipts):
            receipts.append(receipt)
        prior['incrementalMode'] = True
        prior['messages'] = len(merged['messages'])
        atomic_json(WORK/'ledger.json', ledger)
        target = WORK/'markdown'/name;target.parent.mkdir(parents=True,exist_ok=True);target.write_bytes(body.encode('utf-8'))
        result.update(status='unchanged' if response.get('duplicate') else 'imported', **receipt)
    else:
        result.update(vaultId=prior['vaultId'], vaultPath=prior['vaultPath'])
    atomic_json(cache, merged)
    return result

def main():
    parser=argparse.ArgumentParser()
    parser.add_argument('--import-vault', action='store_true')
    parser.add_argument('--skip-local', action='store_true')
    parser.add_argument('--incremental', action='store_true', help='Import only new/revised messages; preserve existing Vault snapshots')
    args=parser.parse_args()
    WORK.mkdir(parents=True, exist_ok=True)
    # OS lock releases automatically if a run crashes; no stale lock cleanup race.
    lock=(WORK/'backup.lock').open('a+b');lock.seek(0);lock.write(b'0');lock.flush();lock.seek(0)
    import msvcrt
    msvcrt.locking(lock.fileno(),msvcrt.LK_NBLCK,1)
    try:
        state=api('state?summary=1') if args.import_vault else {}
        if args.import_vault and Path(state.get('root','')).resolve() != DATA.resolve():
            raise ValueError('Unexpected Venus root')
        ledger_path=WORK/'ledger.json'
        ledger=json.loads(ledger_path.read_text(encoding='utf-8')) if ledger_path.exists() else {}
        indexfile=WORK/'thread-index.json'
        rawindex=json.loads(indexfile.read_text(encoding='utf-8')) if indexfile.exists() else {}
        titles={t['id']:t['title'] for t in rawindex.get('threads',[])+rawindex.get('pinnedThreads',[])}
        report={'startedAt':datetime.now(timezone.utc).isoformat(),'since':'2026-09-30T00:00:00+10:00',
                'records':[], 'errors':[], 'gaps':['普通 GPT 的接口只返回近期片段；网页更早消息尚未成功加载，不能称完整历史。',
                'Dots 网页可见文字已读到欢迎消息；通话结束条目不包含完整录音或转写，网页新增附件目前保存引用。',
                '两个云端任务仍有超大单轮无法读取；已保存其余可取得轮次。',
                '进行中任务是截至采集时间的快照；不包含之后新增的消息。']}
        report['mode']='incremental-message-batches' if args.incremental else 'whole-conversation-snapshots'
        fetch_file=WORK/'fetch-report.json'
        if fetch_file.exists():
            fetch_report=json.loads(fetch_file.read_text(encoding='utf-8'))
            report['gaps']=fetch_report.get('gaps',report['gaps'])
        records=[]
        if not args.skip_local:
            for path in sorted((Path.home()/'.codex'/'sessions').rglob('*.jsonl')):
                if path.stat().st_mtime < SINCE:
                    continue
                try:
                    stable_id=path.stem[-36:]
                    cached_path=WORK/'messages'/(digest('codex-local:'+stable_id)+'.json')
                    cached=json.loads(cached_path.read_text(encoding='utf-8')) if cached_path.exists() else None
                    stamp=datetime.fromtimestamp(path.stat().st_mtime, timezone.utc).isoformat()
                    record=cached if cached and cached.get('sourceBytes')==path.stat().st_size and cached.get('sourceUpdated')==stamp else parse_local(path)
                    record['title']=titles.get(record['id'],record['title'])
                    records.append(record)
                except Exception as error:
                    report['errors'].append({'file':str(path),'error':str(error)})
        for path in sorted((WORK/'api-pages').glob('*.json')):
            try:
                records.append(parse_pages(json.loads(path.read_text(encoding='utf-8'))))
            except Exception as error:
                report['errors'].append({'file':str(path),'error':str(error)})
        for path in sorted((WORK/'web-records').glob('*.json')):
            try:
                records.append(parse_normalized_record(json.loads(path.read_text(encoding='utf-8'))))
            except Exception as error:
                report['errors'].append({'file':str(path),'error':str(error)})
        for record in combine_records(records):
            try:
                report['records'].append((incremental_upsert if args.incremental else upsert)(record,ledger,state.get('nodes',[]),args.import_vault))
            except Exception as error:
                report['errors'].append({'id':record['id'],'error':str(error)})
            atomic_json(WORK/'latest-report.json',report)
        report['completedAt']=datetime.now(timezone.utc).isoformat()
        report['counts']={s:sum(r['status']==s for r in report['records']) for s in ('imported','updated','unchanged','staged','no-visible-messages','skipped-user-deleted')}
        atomic_json(WORK/'latest-report.json',report)
        atomic_json(WORK/'runs'/(report['startedAt'].replace(':','-')+'.json'),report)
        print(json.dumps({'counts':report['counts'],'errors':report['errors'],'records':len(report['records'])},ensure_ascii=True))
        return 1 if report['errors'] else 0
    finally:
        lock.seek(0);msvcrt.locking(lock.fileno(),msvcrt.LK_UNLCK,1);lock.close()

if __name__=='__main__':
    raise SystemExit(main())
