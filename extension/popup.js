document.getElementById("fill").addEventListener("click", async () => {
  const msg = document.getElementById("msg");
  let order;
  try { order = JSON.parse(document.getElementById("json").value); } catch { msg.textContent = "Invalid JSON"; return; }
  const idx = Number(document.getElementById("idx").value) || 0;
  const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
  const res = await chrome.tabs.sendMessage(tab.id, { type: "FILL", order, idx }).catch((e) => ({ error: String(e) }));
  msg.textContent = res?.error ? res.error : `Filled ${res.filled} fields, ${res.missed.length} not found: ${res.missed.join(", ")}`;
});
