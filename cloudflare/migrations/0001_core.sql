PRAGMA foreign_keys=ON;

CREATE TABLE shops (
  id TEXT PRIMARY KEY,
  legal_name TEXT NOT NULL,
  display_name TEXT NOT NULL,
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE locations (
  id TEXT PRIMARY KEY,
  shop_id TEXT NOT NULL REFERENCES shops(id),
  name TEXT NOT NULL,
  address_json TEXT NOT NULL CHECK(json_valid(address_json)),
  active INTEGER NOT NULL DEFAULT 1 CHECK(active IN (0,1))
);

CREATE TABLE actors (
  issuer TEXT NOT NULL,
  subject TEXT NOT NULL,
  user_id TEXT NOT NULL,
  shop_id TEXT NOT NULL REFERENCES shops(id),
  role TEXT NOT NULL CHECK(role IN ('clerk','manager','compliance','admin','auditor')),
  location_ids TEXT NOT NULL CHECK(json_valid(location_ids)),
  disabled INTEGER NOT NULL DEFAULT 0 CHECK(disabled IN (0,1)),
  PRIMARY KEY(issuer, subject)
);

CREATE TABLE customers (
  id TEXT PRIMARY KEY,
  shop_id TEXT NOT NULL REFERENCES shops(id),
  full_name TEXT NOT NULL,
  id_type TEXT,
  id_last4 TEXT,
  date_of_birth TEXT,
  contact_json TEXT CHECK(contact_json IS NULL OR json_valid(contact_json)),
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE transactions (
  id TEXT PRIMARY KEY,
  shop_id TEXT NOT NULL REFERENCES shops(id),
  location_id TEXT NOT NULL REFERENCES locations(id),
  customer_id TEXT NOT NULL REFERENCES customers(id),
  kind TEXT NOT NULL CHECK(kind IN ('pawn','purchase')),
  status TEXT NOT NULL CHECK(status IN ('draft','accepted','declined','redeemed','forfeited','sold','void')),
  amount_cents INTEGER,
  occurred_at TEXT NOT NULL,
  created_by TEXT NOT NULL
);

CREATE TABLE inventory_items (
  id TEXT PRIMARY KEY,
  shop_id TEXT NOT NULL REFERENCES shops(id),
  location_id TEXT NOT NULL REFERENCES locations(id),
  transaction_id TEXT NOT NULL REFERENCES transactions(id),
  status TEXT NOT NULL CHECK(status IN ('intake','active','hold','redeemed','sold','released','evidence')),
  category TEXT NOT NULL,
  manufacturer TEXT,
  model TEXT,
  serial_normalized TEXT,
  imei_normalized TEXT,
  vin_normalized TEXT,
  upc_normalized TEXT,
  description TEXT,
  distinctive_marks TEXT,
  photo_manifest TEXT CHECK(photo_manifest IS NULL OR json_valid(photo_manifest)),
  intake_at TEXT NOT NULL,
  last_screened_at TEXT,
  created_by TEXT NOT NULL
);
CREATE INDEX inventory_serial ON inventory_items(serial_normalized);
CREATE INDEX inventory_imei ON inventory_items(imei_normalized);
CREATE INDEX inventory_vin ON inventory_items(vin_normalized);
CREATE INDEX inventory_status ON inventory_items(shop_id,status);

CREATE TABLE stolen_signals (
  id TEXT PRIMARY KEY,
  provider TEXT NOT NULL,
  provider_record_ref TEXT NOT NULL,
  authority_level TEXT NOT NULL CHECK(authority_level IN ('informational','authorized_feed','law_enforcement_report','law_enforcement_hold')),
  case_number TEXT,
  category TEXT,
  manufacturer TEXT,
  model TEXT,
  serial_normalized TEXT,
  imei_normalized TEXT,
  vin_normalized TEXT,
  upc_normalized TEXT,
  description TEXT,
  distinctive_marks TEXT,
  reported_at TEXT NOT NULL,
  source_received_at TEXT NOT NULL,
  source_payload_hash TEXT NOT NULL,
  active INTEGER NOT NULL DEFAULT 1 CHECK(active IN (0,1)),
  UNIQUE(provider,provider_record_ref)
);
CREATE INDEX signals_serial ON stolen_signals(serial_normalized,active);
CREATE INDEX signals_imei ON stolen_signals(imei_normalized,active);
CREATE INDEX signals_vin ON stolen_signals(vin_normalized,active);

CREATE TABLE screening_runs (
  id TEXT PRIMARY KEY,
  shop_id TEXT NOT NULL REFERENCES shops(id),
  item_id TEXT NOT NULL REFERENCES inventory_items(id),
  mode TEXT NOT NULL CHECK(mode IN ('intake','scheduled','feed_event','manual')),
  started_at TEXT NOT NULL,
  completed_at TEXT,
  result TEXT CHECK(result IN ('clear','review','possible_match','confirmed_hold','error')),
  match_count INTEGER NOT NULL DEFAULT 0,
  provider_summary TEXT CHECK(provider_summary IS NULL OR json_valid(provider_summary))
);

CREATE TABLE alerts (
  id TEXT PRIMARY KEY,
  shop_id TEXT NOT NULL REFERENCES shops(id),
  item_id TEXT NOT NULL REFERENCES inventory_items(id),
  signal_id TEXT NOT NULL REFERENCES stolen_signals(id),
  screening_run_id TEXT NOT NULL REFERENCES screening_runs(id),
  severity TEXT NOT NULL CHECK(severity IN ('review','possible_match','confirmed_hold')),
  score INTEGER NOT NULL CHECK(score BETWEEN 0 AND 100),
  reason_json TEXT NOT NULL CHECK(json_valid(reason_json)),
  state TEXT NOT NULL CHECK(state IN ('open','acknowledged','escalated','resolved','false_positive')),
  created_at TEXT NOT NULL,
  acknowledged_at TEXT,
  resolved_at TEXT,
  resolution_note TEXT,
  UNIQUE(item_id,signal_id)
);

CREATE TABLE holds (
  id TEXT PRIMARY KEY,
  shop_id TEXT NOT NULL REFERENCES shops(id),
  item_id TEXT NOT NULL REFERENCES inventory_items(id),
  alert_id TEXT REFERENCES alerts(id),
  authority_type TEXT NOT NULL CHECK(authority_type IN ('internal_review','law_enforcement')),
  agency_name TEXT,
  officer_name TEXT,
  officer_identifier TEXT,
  case_number TEXT,
  issued_at TEXT NOT NULL,
  expires_at TEXT,
  document_manifest TEXT CHECK(document_manifest IS NULL OR json_valid(document_manifest)),
  state TEXT NOT NULL CHECK(state IN ('active','released','expired'))
);

CREATE TABLE audit_events (
  sequence INTEGER PRIMARY KEY AUTOINCREMENT,
  shop_id TEXT,
  actor_user_id TEXT,
  event_type TEXT NOT NULL,
  entity_type TEXT NOT NULL,
  entity_id TEXT,
  occurred_at TEXT NOT NULL,
  correlation_id TEXT NOT NULL,
  payload TEXT NOT NULL CHECK(json_valid(payload))
);
CREATE INDEX audit_shop_seq ON audit_events(shop_id,sequence);

CREATE TRIGGER audit_no_update BEFORE UPDATE ON audit_events
BEGIN SELECT RAISE(ABORT, 'append_only_audit'); END;
CREATE TRIGGER audit_no_delete BEFORE DELETE ON audit_events
BEGIN SELECT RAISE(ABORT, 'append_only_audit'); END;
