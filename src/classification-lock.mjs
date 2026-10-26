import fs from 'node:fs';
import path from 'node:path';

export function classificationLockPath(root) {
  return path.resolve(root, '../work/precise-classification-20261022/executor.lock');
}

// Only a live owner reserves the analyzer; stale locks remain available for audit.
export function classificationExecutorActive(root) {
  try {
    const lock = JSON.parse(fs.readFileSync(classificationLockPath(root), 'utf8'));
    if (!Number.isInteger(lock.pid) || lock.pid <= 0) return false;
    process.kill(lock.pid, 0);
    return true;
  } catch { return false; }
}

export function classificationExecutorOwned(root, ownerToken) {
  if (typeof ownerToken !== 'string' || ownerToken.length < 16) return false;
  try {
    const lock=JSON.parse(fs.readFileSync(classificationLockPath(root),'utf8'));
    return lock.ownerToken===ownerToken && lock.model==='gpt-6-astra' && classificationExecutorActive(root);
  } catch { return false; }
}
