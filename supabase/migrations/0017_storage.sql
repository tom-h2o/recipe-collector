-- Storage bucket for recipe images
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values (
  'recipe-images',
  'recipe-images',
  true,
  5242880, -- 5 MB
  array['image/jpeg', 'image/png', 'image/webp', 'image/gif']
)
on conflict (id) do nothing;

-- Authenticated users can upload
create policy "recipe_images_insert"
  on storage.objects for insert
  to authenticated
  with check (bucket_id = 'recipe-images');

-- Anyone can read (bucket is public)
create policy "recipe_images_select"
  on storage.objects for select
  to public
  using (bucket_id = 'recipe-images');

-- Users can delete their own uploads
create policy "recipe_images_delete"
  on storage.objects for delete
  to authenticated
  using (bucket_id = 'recipe-images' and owner = auth.uid());
