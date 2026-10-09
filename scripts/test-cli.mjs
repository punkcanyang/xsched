// Capture CLI evidence via regular files: some sandboxes deny child-process pipes.
// Keep exit status, actual stderr and spawn errors; never skip CLI assertions.
import { spawnSync } from 'node:child_process';
import { mkdtempSync, openSync, closeSync, readFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
export function runNode(args, options = {}) {
  const dir = mkdtempSync(join(tmpdir(), 'xsched-cli-'));
  const out = join(dir, 'stdout');
  const err = join(dir, 'stderr');
  const output = openSync(out, 'w');
  const errors = openSync(err, 'w');
  try {
    const result = spawnSync(process.execPath, args, { timeout: 10000, ...options, stdio: ['ignore', output, errors] });
    if (result.error) throw result.error;
    return { status: result.status, stdout: readFileSync(out, 'utf8'), stderr: readFileSync(err, 'utf8') };
  } finally {
    closeSync(output);
    closeSync(errors);
    rmSync(dir, { recursive: true, force: true });
  }
}
