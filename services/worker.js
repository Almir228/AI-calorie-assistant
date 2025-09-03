async function callWorker(url, payload) {
  const r = await fetch(url, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(payload)
  });
  const text = await r.text();
  try { return JSON.parse(text); } catch { return { error: "Bad JSON from worker", raw: text }; }
}

module.exports = { callWorker };

