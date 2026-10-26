import importlib.util
import json
import tempfile
import unittest
from pathlib import Path

spec = importlib.util.spec_from_file_location('backup', Path(__file__).resolve().parents[1] / 'scripts/backup-history.py')
backup = importlib.util.module_from_spec(spec)
spec.loader.exec_module(backup)


class IncrementalBackupTests(unittest.TestCase):
    def setUp(self):
        self.directory = tempfile.TemporaryDirectory()
        self.addCleanup(self.directory.cleanup)
        backup.WORK = Path(self.directory.name)
        self.record = {'source':'codex-local','id':'fixture','title':'Synthetic only',
                       'coverage':'Visible message fixture','errors':[],
                       'messages':[{'id':'m1','role':'user','text':'Original evidence','timestamp':'2026-10-17T01:00:00Z'}]}
        self.nodes = {}
        self.ledger = {}
        self.imports = 0
        self.bad_readback = False
        def api(route, data=None):
            if route == 'import':
                existing = next((n for n in self.nodes.values() if n['body']==data['body']), None)
                if existing:
                    return {'node':existing,'duplicate':True}
                self.imports += 1
                node = {'id':'v'+str(self.imports),'path':'Vault/'+data['name'],'body':data['body'],'hash':backup.digest(data['body'])}
                self.nodes[node['id']] = node
                return {'node':node,'duplicate':False}
            if route.startswith('node?id='):
                node = dict(self.nodes[route.split('=',1)[1]])
                if self.bad_readback:
                    node['body'] = 'corrupt fixture'
                return node
            self.fail('Unexpected write: '+route)
        backup.api = api
        backup.incremental_upsert(self.record, self.ledger, [], True)
        self.original = dict(self.nodes['v1'])

    def updated(self, text='New evidence'):
        return {**self.record,'messages':self.record['messages']+[{'id':'m2','role':'assistant','text':text,'timestamp':'2026-10-21T01:00:00Z'}]}

    def test_only_new_messages_enter_the_new_batch_and_repeat_run_is_idle(self):
        r=backup.incremental_upsert(self.updated(),self.ledger,[],True)
        self.assertEqual(r['newMessages'],1)
        self.assertNotIn('Original evidence',self.nodes['v2']['body'])
        self.assertIn('New evidence',self.nodes['v2']['body'])
        self.assertEqual(self.nodes['v1'],self.original)
        again=backup.incremental_upsert(self.updated(),self.ledger,[],True)
        self.assertEqual(again['newMessages'],0)
        self.assertEqual(self.imports,2)
        self.assertEqual(len(self.ledger['codex-local:fixture']['incrementalBatches']),1)

    def test_failed_readback_never_advances_the_cache_and_retry_reuses_the_same_import(self):
        self.bad_readback=True
        with self.assertRaisesRegex(ValueError,'readback'):
            backup.incremental_upsert(self.updated(),self.ledger,[],True)
        cache=backup.WORK/'messages'/(backup.digest('codex-local:fixture')+'.json')
        self.assertEqual(len(json.loads(cache.read_text())['messages']),1)
        self.bad_readback=False
        r=backup.incremental_upsert(self.updated(),self.ledger,[],True)
        self.assertEqual(self.imports,2)
        self.assertEqual(r['status'],'unchanged')
        self.assertEqual(len(json.loads(cache.read_text())['messages']),2)

    def test_revision_is_a_delta_and_metadata_only_changes_do_not_repeat_extraction(self):
        revised={**self.record,'messages':[{**self.record['messages'][0],'text':'Original evidence amended'}]}
        r=backup.incremental_upsert(revised,self.ledger,[],True)
        self.assertEqual(r['revisedMessages'],1)
        shorter={**self.record,'messages':[{**self.record['messages'][0],'text':'short','timestamp':None}]}
        r=backup.incremental_upsert(shorter,self.ledger,[],True)
        self.assertEqual(r['newMessages']+r['revisedMessages'],0)
        self.assertEqual(self.nodes['v1'],self.original)

    def test_duplicate_or_reordered_attachment_references_are_not_content_revisions(self):
        record=self.updated()
        ref={'tag':'IMG','url':'https://example.invalid/synthetic.png'}
        record['messages'][-1]['attachments']=[ref,ref,ref]
        backup.incremental_upsert(record,self.ledger,[],True)
        record['messages'][-1]['attachments']=[ref]
        r=backup.incremental_upsert(record,self.ledger,[],True)
        self.assertEqual(r['revisedMessages'],0)
        self.assertEqual(self.imports,2)

    def test_dry_run_does_not_advance_checkpoints_and_missing_baseline_is_not_replayed(self):
        r=backup.incremental_upsert(self.updated(),self.ledger,[],False)
        self.assertEqual(r['status'],'staged')
        self.assertEqual(self.imports,1)
        cache=backup.WORK/'messages'/(backup.digest('codex-local:fixture')+'.json')
        self.assertEqual(len(json.loads(cache.read_text())['messages']),1)
        cache.unlink()
        with self.assertRaisesRegex(ValueError,'消息基线'):
            backup.incremental_upsert(self.updated(),self.ledger,[],True)


    def test_deleted_incremental_batch_is_an_explicit_skip_not_an_import_error(self):
        before_api = backup.api
        def skipped(route, data=None):
            if route == 'import':
                self.assertTrue(data['automatic'])
                return {'skippedUserDeleted': True, 'reason': 'User deleted this exact version'}
            return before_api(route, data)
        backup.api = skipped
        result = backup.incremental_upsert(self.updated(), self.ledger, [], True)
        self.assertEqual(result['status'], 'skipped-user-deleted')
        self.assertNotIn('vaultId', result)
        self.assertEqual(len(self.ledger['codex-local:fixture']['suppressedBatches']), 1)
        again = backup.incremental_upsert(self.updated(), self.ledger, [], True)
        self.assertEqual(again['newMessages'], 0)
        self.assertEqual(self.imports, 1)

    def test_deleted_initial_snapshot_does_not_create_a_phantom_ledger(self):
        before_api = backup.api
        def skipped(route, data=None):
            if route == 'import':
                return {'skippedUserDeleted': True, 'reason': 'User deleted this exact version'}
            return before_api(route, data)
        backup.api = skipped
        other = {**self.record, 'id':'other-synthetic'}
        result = backup.incremental_upsert(other, self.ledger, [], True)
        self.assertEqual(result['status'], 'skipped-user-deleted')
        self.assertNotIn('codex-local:other-synthetic', self.ledger)

if __name__ == '__main__':
    unittest.main()
