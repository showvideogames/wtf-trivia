// Interactive psql connections to the same disposable container as helpers.mjs.
// Barriers use PostgreSQL lock metadata, not assumed timing between requests.
import { spawn } from 'node:child_process';
import { once } from 'node:events';
import { sql, stack } from './helpers.mjs';

export async function session(name) {
  stack();
  const child = spawn('docker', ['exec', '-i', 'supabase_db_wtf-trivia', 'psql', '-U', 'postgres', '-d', 'postgres', '-X', '-qAt', '-v', 'ON_ERROR_STOP=1'], { stdio: ['pipe','pipe','pipe'] });
  let output = '', errors = '', serial = 0;
  child.stdout.on('data', chunk => { output += chunk; });
  child.stderr.on('data', chunk => { errors += chunk; });
  const exit = once(child, 'exit');
  async function query(text) {
    const marker = `session_barrier_${++serial}`;
    child.stdin.write(`${text}\n\\echo ${marker}\n`);
    const deadline = Date.now() + 12000;
    while (!output.includes(marker)) {
      if (child.exitCode !== null) throw new Error(`psql exited: ${errors}`);
      if (Date.now() > deadline) throw new Error(`psql timeout: ${errors}`);
      await new Promise(resolve => setTimeout(resolve, 20));
    }
    return output;
  }
  await query(`set application_name='${name}'; set statement_timeout='10s'; set deadlock_timeout='100ms';`);
  return {
    query,
    async close() {
      if (child.exitCode === null) child.stdin.end('rollback;\n\\q\n');
      await exit;
    },
  };
}

export async function blocked(name) {
  const deadline = Date.now() + 8000;
  while (Date.now() < deadline) {
    if (sql(`select exists(select 1 from pg_stat_activity where application_name='${name}' and wait_event_type='Lock' and cardinality(pg_blocking_pids(pid))>0)`) === 't') return;
    await new Promise(resolve => setTimeout(resolve, 30));
  }
  throw new Error(`${name} never reached the expected PostgreSQL lock barrier`);
}
