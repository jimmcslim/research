import { Database } from "bun:sqlite";
import type { CommentRecord, SubmissionRecord } from "./types";

function getTableColumns(db: Database, tableName: string): string[] {
  const rows = db.query(`PRAGMA table_info(${tableName})`).all() as Array<{ name?: string }>;
  return rows.map((row) => row.name).filter((name): name is string => Boolean(name));
}

function createSubmissionsTable(db: Database): void {
  db.exec(`
    CREATE TABLE IF NOT EXISTS submissions (
      item_id INTEGER PRIMARY KEY,
      title TEXT NOT NULL,
      source_url TEXT,
      item_url TEXT,
      points INTEGER,
      submitted_by TEXT,
      submitted_at TEXT,
      comments_count INTEGER,
      scraped_at TEXT NOT NULL
    );
  `);
}

function createCommentsTable(db: Database): void {
  db.exec(`
    CREATE TABLE IF NOT EXISTS comments (
      item_id INTEGER PRIMARY KEY,
      submitted_by TEXT,
      submitted_at TEXT,
      item_url TEXT,
      comment_html TEXT NOT NULL,
      comment_text TEXT NOT NULL,
      parent_item_url TEXT,
      scraped_at TEXT NOT NULL
    );
  `);
}

function migrateLegacySubmissionsTable(db: Database): void {
  const columns = getTableColumns(db, "submissions");
  if (columns.length === 0 || columns.includes("source_url")) {
    createSubmissionsTable(db);
    return;
  }

  db.exec(`ALTER TABLE submissions RENAME TO submissions_legacy;`);
  createSubmissionsTable(db);
  db.exec(`
    INSERT INTO submissions (
      item_id, title, source_url, item_url, points, submitted_by, submitted_at, comments_count, scraped_at
    )
    SELECT
      item_id,
      title,
      item_url,
      COALESCE(age_url, hn_item_url),
      points,
      author,
      NULL,
      comments_count,
      scraped_at
    FROM submissions_legacy;
    DROP TABLE submissions_legacy;
  `);
}

function migrateLegacyCommentsTable(db: Database): void {
  const columns = getTableColumns(db, "comments");
  if (columns.length === 0 || columns.includes("submitted_by")) {
    createCommentsTable(db);
    return;
  }

  db.exec(`ALTER TABLE comments RENAME TO comments_legacy;`);
  createCommentsTable(db);
  db.exec(`
    INSERT INTO comments (
      item_id, submitted_by, submitted_at, item_url, comment_html, comment_text, parent_item_url, scraped_at
    )
    SELECT
      item_id,
      author,
      NULL,
      age_url,
      comment_html,
      comment_text,
      parent_item_url,
      scraped_at
    FROM comments_legacy;
    DROP TABLE comments_legacy;
  `);
}

export function initDb(path: string): Database {
  const db = new Database(path);
  migrateLegacySubmissionsTable(db);
  migrateLegacyCommentsTable(db);
  return db;
}

export function clearScrapedData(db: Database): void {
  db.exec(`
    DELETE FROM submissions;
    DELETE FROM comments;
  `);
}

export function saveSubmissions(db: Database, submissions: SubmissionRecord[]) {
  const insert = db.prepare(`
    INSERT INTO submissions (
      item_id, title, source_url, item_url, points, submitted_by, submitted_at, comments_count, scraped_at
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
    ON CONFLICT(item_id) DO UPDATE SET
      title=excluded.title,
      source_url=excluded.source_url,
      item_url=excluded.item_url,
      points=excluded.points,
      submitted_by=excluded.submitted_by,
      submitted_at=excluded.submitted_at,
      comments_count=excluded.comments_count,
      scraped_at=excluded.scraped_at;
  `);

  for (const row of submissions) {
    insert.run(
      row.itemId,
      row.title,
      row.sourceUrl,
      row.itemUrl,
      row.points,
      row.submittedBy,
      row.submittedAt,
      row.commentsCount,
      row.scrapedAt,
    );
  }
}

export function saveComments(db: Database, comments: CommentRecord[]) {
  const insert = db.prepare(`
    INSERT INTO comments (
      item_id, submitted_by, submitted_at, item_url, comment_html, comment_text, parent_item_url, scraped_at
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?)
    ON CONFLICT(item_id) DO UPDATE SET
      submitted_by=excluded.submitted_by,
      submitted_at=excluded.submitted_at,
      item_url=excluded.item_url,
      comment_html=excluded.comment_html,
      comment_text=excluded.comment_text,
      parent_item_url=excluded.parent_item_url,
      scraped_at=excluded.scraped_at;
  `);

  for (const row of comments) {
    insert.run(
      row.itemId,
      row.submittedBy,
      row.submittedAt,
      row.itemUrl,
      row.commentHtml,
      row.commentText,
      row.parentItemUrl,
      row.scrapedAt,
    );
  }
}

export function hasSubmission(db: Database, itemId: number): boolean {
  return Boolean(db.query("SELECT 1 FROM submissions WHERE item_id = ? LIMIT 1").get(itemId));
}

export function hasComment(db: Database, itemId: number): boolean {
  return Boolean(db.query("SELECT 1 FROM comments WHERE item_id = ? LIMIT 1").get(itemId));
}
