/**
 * True only on the instance that should run scheduled jobs.
 *
 * Under PM2 cluster mode every worker boots the Nest app — and with it every
 * @Cron schedule — so without this guard each job fires once per instance
 * (duplicate notification blasts, double digests, ...). PM2 sets
 * NODE_APP_INSTANCE per worker; we let only instance 0 run crons.
 * In fork mode / plain `node dist/main` the var is unset → guard passes.
 */
export function isPrimaryInstance(): boolean {
  const inst = process.env.NODE_APP_INSTANCE;
  return inst === undefined || inst === '0';
}
