const q = (s) => document.querySelector(s);

async function api(path) {
  const response = await fetch(path, { headers: { accept: "application/json" } });
  const payload = await response.json().catch(() => ({}));
  if (!response.ok) throw new Error(payload?.error?.message || ("HTTP " + response.status));
  return payload;
}

function clear(node) {
  while (node.firstChild) node.removeChild(node.firstChild);
}

function renderTable(target, rows, columns) {
  clear(target);
  if (!rows.length) {
    const empty = document.createElement("p");
    empty.textContent = "No records.";
    target.appendChild(empty);
    return;
  }

  const table = document.createElement("table");
  const head = document.createElement("thead");
  const headRow = document.createElement("tr");
  for (const column of columns) {
    const th = document.createElement("th");
    th.textContent = column.label;
    headRow.appendChild(th);
  }
  head.appendChild(headRow);
  table.appendChild(head);

  const body = document.createElement("tbody");
  for (const row of rows) {
    const tr = document.createElement("tr");
    for (const column of columns) {
      const td = document.createElement("td");
      td.textContent = String(column.value(row) ?? "—");
      tr.appendChild(td);
    }
    body.appendChild(tr);
  }
  table.appendChild(body);
  target.appendChild(table);
}

async function load() {
  try {
    const [me, alerts, inventory] = await Promise.all([
      api("/v1/me"),
      api("/v1/alerts"),
      api("/v1/inventory")
    ]);

    q("#identity").textContent = me.data.role + " · " + me.data.shopId;
    q("#alertCount").textContent = String(alerts.data.length);
    q("#inventoryCount").textContent = String(inventory.data.length);

    renderTable(q("#alerts"), alerts.data, [
      { label: "Severity", value: (r) => r.severity },
      { label: "Item", value: (r) => [r.manufacturer, r.model, r.category].filter(Boolean).join(" ") },
      { label: "Identifier", value: (r) => r.serial_normalized || r.imei_normalized || r.vin_normalized },
      { label: "Provider", value: (r) => r.provider },
      { label: "Case", value: (r) => r.case_number },
      { label: "Score", value: (r) => r.score },
      { label: "State", value: (r) => r.state }
    ]);

    renderTable(q("#inventory"), inventory.data, [
      { label: "Status", value: (r) => r.status },
      { label: "Category", value: (r) => r.category },
      { label: "Maker", value: (r) => r.manufacturer },
      { label: "Model", value: (r) => r.model },
      { label: "Serial / IMEI / VIN", value: (r) => r.serial_normalized || r.imei_normalized || r.vin_normalized },
      { label: "Last screened", value: (r) => r.last_screened_at || "Not yet" }
    ]);
  } catch (error) {
    q("#identity").textContent = "Access required";
    clear(q("#alerts"));
    const message = document.createElement("p");
    message.textContent = error instanceof Error ? error.message : "Unable to load data.";
    q("#alerts").appendChild(message);
    clear(q("#inventory"));
    const note = document.createElement("p");
    note.textContent = "Protected inventory data is unavailable until authentication succeeds.";
    q("#inventory").appendChild(note);
  }
}

q("#refresh").addEventListener("click", load);
load();
