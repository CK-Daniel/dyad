-- Add WordPress support fields to apps table
ALTER TABLE apps ADD COLUMN app_type TEXT DEFAULT 'react' CHECK(app_type IN ('react', 'wordpress'));
ALTER TABLE apps ADD COLUMN mysql_port INTEGER;
ALTER TABLE apps ADD COLUMN php_port INTEGER;