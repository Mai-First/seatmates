-- Force PostgREST to pick up the message_likes table + its relationship to
-- messages. `db push` applies DDL directly and doesn't always trigger the
-- same automatic schema-cache reload the dashboard SQL editor does.
NOTIFY pgrst, 'reload schema';
