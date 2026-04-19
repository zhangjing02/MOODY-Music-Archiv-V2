create table if not exists posts (
  id bigserial primary key,
  author_uid text not null,
  author_name text not null,
  album_id bigint,
  content text not null check (char_length(content) between 1 and 2000),
  status text not null default 'active',
  created_at timestamptz not null default now()
);

create index if not exists idx_posts_album_created
  on posts (album_id, created_at desc);

create table if not exists comments (
  id bigserial primary key,
  post_id bigint not null references posts(id) on delete cascade,
  author_uid text not null,
  author_name text not null,
  content text not null check (char_length(content) between 1 and 1000),
  status text not null default 'active',
  created_at timestamptz not null default now()
);

create index if not exists idx_comments_post_created
  on comments (post_id, created_at asc);
