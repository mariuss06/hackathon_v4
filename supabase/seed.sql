-- Reference data only. No company, no invoice and no score is seeded: every company is added by the user
-- in step 1 and its data comes from real sources (ANAF, bilanțuri, VIES, portal.just.ro) and uploaded e-Factura XML.
-- The sector benchmark values below are ORIENTATIVE reference values (see src/lib/data/benchmarks.ts), not official statistics.
begin;

insert into public.sector_benchmarks (caen_code, short_label, label, seasonal, companies, dso_p25, dso_median, dso_p75, top_client_p25, top_client_median, top_client_p75, credit_notes_p25, credit_notes_median, credit_notes_p75, seasonality_p25, seasonality_median, seasonality_p75, gross_margin_p25, gross_margin_median, gross_margin_p75) values
  ('5610', 'HoReCa / Restaurante', 'Restaurante, hoteluri și catering (HoReCa)', true, 1280, 5, 12, 25, 6, 12, 22, 0.4, 1.1, 2.4, 1.3, 1.7, 2.3, 55, 63, 70),
  ('4639', 'Distribuție / Comerț en-gros', 'Comerț cu ridicata nespecializat de alimente, băuturi și tutun', false, 412, 30, 42, 58, 16, 24, 35, 1.2, 2.5, 4.5, 1.35, 1.6, 1.95, 14, 19, 24),
  ('4711', 'Retail / Comerț cu amănuntul', 'Comerț cu amănuntul în magazine nespecializate (alimentar)', false, 960, 3, 8, 18, 5, 10, 20, 0.3, 0.9, 2, 1.2, 1.4, 1.7, 18, 23, 28),
  ('1071', 'Producție alimentară', 'Fabricarea pâinii și a produselor alimentare proaspete', true, 530, 20, 32, 48, 18, 28, 42, 1.5, 3, 5.5, 1.15, 1.3, 1.55, 28, 35, 42),
  ('0111', 'Agricultură', 'Cultivarea cerealelor, plantelor leguminoase și a plantelor oleaginoase', true, 2140, 25, 40, 65, 25, 38, 55, 0.3, 1, 2.5, 2, 3.2, 5, 18, 26, 34),
  ('4941', 'Transport rutier', 'Transporturi rutiere de mărfuri', false, 1710, 35, 50, 70, 20, 32, 48, 0.8, 1.8, 3.5, 1.2, 1.4, 1.75, 22, 30, 38),
  ('4120', 'Construcții', 'Lucrări de construcții a clădirilor rezidențiale și nerezidențiale', true, 1530, 35, 55, 80, 25, 40, 60, 0.5, 1.5, 3, 1.5, 2, 2.8, 15, 22, 30),
  ('6201', 'IT / Software', 'Activități de realizare a software-ului la comandă', false, 880, 25, 38, 55, 25, 40, 60, 0.2, 0.8, 2, 1.15, 1.35, 1.7, 45, 60, 75),
  ('IMM', 'General IMM', 'General IMM (toate sectoarele, medie națională)', false, 9400, 20, 35, 55, 15, 27, 42, 0.5, 1.5, 3, 1.25, 1.5, 1.9, 18, 27, 38)
on conflict (caen_code) do update set short_label = excluded.short_label, label = excluded.label, seasonal = excluded.seasonal, companies = excluded.companies, dso_p25 = excluded.dso_p25, dso_median = excluded.dso_median, dso_p75 = excluded.dso_p75, top_client_p25 = excluded.top_client_p25, top_client_median = excluded.top_client_median, top_client_p75 = excluded.top_client_p75, credit_notes_p25 = excluded.credit_notes_p25, credit_notes_median = excluded.credit_notes_median, credit_notes_p75 = excluded.credit_notes_p75, seasonality_p25 = excluded.seasonality_p25, seasonality_median = excluded.seasonality_median, seasonality_p75 = excluded.seasonality_p75, gross_margin_p25 = excluded.gross_margin_p25, gross_margin_median = excluded.gross_margin_median, gross_margin_p75 = excluded.gross_margin_p75, updated_at = now();

-- Older versions seeded a fictional demo company with a synthetic invoice history: remove it if present.
delete from public.companies where id = '00000000-0000-4000-8000-000000004639';

commit;
