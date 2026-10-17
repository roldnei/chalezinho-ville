"""Checks evaluation isolation and scoring rather than model implementation details."""
import json,pathlib,unittest
from evaluate import distance,normalize
class EvaluationTests(unittest.TestCase):
 def test_labels_have_document_level_isolation(self):
  data=json.loads(pathlib.Path(__file__).with_name('reviewed-labels.json').read_text())['documents'];roles={role:{d for d,v in data.items() if v['split']==role} for role in ['train','validation','test']}
  for a,b in [('train','validation'),('train','test'),('validation','test')]:self.assertFalse(roles[a]&roles[b])
  self.assertEqual(sum(len(v['lines']) for v in data.values() if v['split']=='train'),82)
 def test_scoring_keeps_financial_and_character_errors(self):
  self.assertEqual(distance('48,90','48,50'),1);self.assertEqual(distance('CNPJ','CNPI'),1);self.assertNotEqual(normalize('TOTAL 18,90'),normalize('TOTAL 18,99'));self.assertEqual(normalize('São  Paulo\n'),normalize('São Paulo'))
if __name__=='__main__':unittest.main()
