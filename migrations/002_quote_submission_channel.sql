ALTER TABLE quote_requests ADD COLUMN submission_channel TEXT NOT NULL DEFAULT 'website_form'
  CHECK (submission_channel IN ('website_form', 'chatbot'));
