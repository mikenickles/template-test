import { db, now } from '../db.ts';

export type ActivityStatus = 'done' | 'failed' | 'declined' | 'waiting';

/** The owner-readable record of everything Arlo did with its tools. */
export function logActivity(tool: string, summary: string, status: ActivityStatus): void {
  db().prepare('insert into activity(at, tool, summary, status) values(?, ?, ?, ?)').run(now(), tool, summary.slice(0, 300), status);
  db().exec('delete from activity where id <= (select max(id) from activity) - 2000');
}

export function recentActivity(limit = 100) {
  return db().prepare('select id, at, tool, summary, status from activity order by id desc limit ?').all(limit);
}

export function notify(title: string, body: string): void {
  db().prepare('insert into notifications(at, title, body) values(?, ?, ?)').run(now(), title.slice(0, 80), body.slice(0, 240));
  db().exec('delete from notifications where id <= (select max(id) from notifications) - 200');
}

export function notificationsAfter(id: number) {
  return db().prepare('select id, at, title, body from notifications where id > ? order by id limit 20').all(id);
}

export function latestNotificationId(): number {
  const row = db().prepare('select max(id) as id from notifications').get() as { id: number | null };
  return row.id ?? 0;
}
