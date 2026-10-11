begin;

create or replace function public.storage_report()
returns jsonb
language sql
stable
security definer
set search_path = public
as $$
  with mine as (
    select bucket_id, (metadata->>'size')::bigint as bytes
    from storage.objects
    where owner = auth.uid()
       or (storage.foldername(name))[1] = auth.uid()::text
  ),
  bucket_agg as (
    select bucket_id, coalesce(sum(bytes), 0) as bytes, count(*) as objects
    from mine
    group by bucket_id
  )
  select jsonb_build_object(
    'database_bytes', pg_database_size(current_database()),
    'storage_bytes', coalesce((select sum(bytes) from bucket_agg), 0),
    'storage_objects', coalesce((select sum(objects) from bucket_agg), 0),
    'buckets', coalesce(
      (select jsonb_agg(jsonb_build_object(
        'bucket', bucket_id,
        'bytes', bytes,
        'objects', objects
      ) order by bytes desc)
       from bucket_agg),
      '[]'::jsonb
    )
  );
$$;

revoke all on function public.storage_report() from public;
grant execute on function public.storage_report() to authenticated;

commit;
