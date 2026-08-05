-- Migration to fix security vulnerabilities: Enable Row Level Security (RLS) on public.rate_limits and public.sipwise_token_blacklist

-- Enable RLS on rate_limits
alter table public.rate_limits enable row level security;

-- Enable RLS on sipwise_token_blacklist
alter table public.sipwise_token_blacklist enable row level security;
