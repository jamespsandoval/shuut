-- Support newest-first seek pagination without sorting the entire reSHÜÜT table.
CREATE INDEX IF NOT EXISTS shuut_post_reshuuts_feed_created_id_idx
  ON shuut_post_reshuuts (created_at, id);