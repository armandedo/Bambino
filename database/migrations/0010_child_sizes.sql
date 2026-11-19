-- Add age guidance only; no invented adolescent measurement chart.
-- Existing size definitions and catalogue records remain unchanged.
INSERT INTO sizes (code, label, sort_order, min_age_days, max_age_days)
SELECT age || '-' || (age + 1) || 'Y', age || '-' || (age + 1) || ' years',
       (SELECT GREATEST(COALESCE(MAX(sort_order), 0), 7) FROM sizes) + age - 1,
       ROUND(age * 365.25), ROUND((age + 1) * 365.25)
FROM generate_series(2, 17) AS age
ON CONFLICT (code) DO NOTHING;
