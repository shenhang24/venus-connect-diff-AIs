import importlib.util, pathlib, unittest
spec=importlib.util.spec_from_file_location('backup',pathlib.Path(__file__).parents[1]/'scripts/backup-history.py');backup=importlib.util.module_from_spec(spec);spec.loader.exec_module(backup)
class TimestampTests(unittest.TestCase):
 def test_normalized_retains_precise_and_null_timestamps(self):
  r={'id':'fixture','source':'codex-local','coverage':'synthetic','messages':[{'id':'a','role':'user','text':'literal','timestamp':'2026-10-21T03:00:00.123+11:00'},{'id':'b','role':'assistant','text':'literal response','timestamp':None}]};self.assertEqual(backup.parse_normalized_record(r)['messages'],r['messages'])
 def test_api_preserves_message_time_and_labels_fallback(self):
  pages=[{'thread':{'id':'fixture','kind':'chatgpt','title':'synthetic'},'turns':[{'startedAt':'turn-time','items':[{'id':'a','type':'userMessage','timestamp':'precise-message-time','content':['literal']},{'id':'b','type':'agentMessage','text':'literal response'}]}]}];m=backup.parse_pages(pages)['messages'];self.assertEqual(m[0]['timestamp'],'precise-message-time');self.assertEqual(m[0]['timestampSource'],'message');self.assertEqual(m[1]['timestampSource'],'turn-start-fallback')
 def test_conflicting_duplicate_ids_stop(self):
  r={'id':'fixture','source':'chatgpt','messages':[{'id':'a','role':'user','text':'first'},{'id':'a','role':'user','text':'other'}]}
  with self.assertRaisesRegex(ValueError,'conflicting'):backup.parse_normalized_record(r)
if __name__=='__main__':unittest.main()
