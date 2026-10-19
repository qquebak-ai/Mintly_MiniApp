-- Адресная книга: кроме TON и Solana — сети EVM (BNB Chain, Base, Ethereum).
alter table public.address_book drop constraint if exists address_book_chain_check;
alter table public.address_book add constraint address_book_chain_check check (chain in ('sol', 'ton', 'bsc', 'base', 'eth'));
