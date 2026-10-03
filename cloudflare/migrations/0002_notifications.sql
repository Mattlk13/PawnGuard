CREATE TABLE notifications (
  id TEXT PRIMARY KEY,
  shop_id TEXT NOT NULL REFERENCES shops(id),
  alert_id TEXT REFERENCES alerts(id),
  item_id TEXT REFERENCES inventory_items(id),
  channel TEXT NOT NULL CHECK(channel IN ('in_app','webhook','email','sms')),
  destination_ref TEXT,
  subject TEXT NOT NULL,
  body TEXT NOT NULL,
  state TEXT NOT NULL CHECK(state IN ('pending','delivered','read','failed')),
  created_at TEXT NOT NULL,
  delivered_at TEXT,
  read_at TEXT,
  failure_reason TEXT
);
CREATE INDEX notifications_shop_state ON notifications(shop_id,state,created_at);

CREATE TABLE disposition_events (
  id TEXT PRIMARY KEY,
  shop_id TEXT NOT NULL REFERENCES shops(id),
  item_id TEXT NOT NULL REFERENCES inventory_items(id),
  from_status TEXT NOT NULL,
  to_status TEXT NOT NULL,
  reason TEXT,
  actor_user_id TEXT NOT NULL,
  occurred_at TEXT NOT NULL
);
CREATE INDEX disposition_item_time ON disposition_events(item_id,occurred_at);
