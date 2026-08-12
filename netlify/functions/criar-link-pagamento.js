// Cria um Link de Pagamento no Asaas com o valor exato do pedido.

const ASAAS_BASE = process.env.ASAAS_BASE || "https://api.asaas.com/v3";
const ASAAS_KEY  = process.env.ASAAS_API_KEY;
const SHEETS_URL = process.env.SHEETS_WEBHOOK_URL;

const cors = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "Content-Type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
  "Content-Type": "application/json"
};

exports.handler = async (event) => {
  if (event.httpMethod === "OPTIONS") return { statusCode: 204, headers: cors, body: "" };
  if (event.httpMethod !== "POST")   return { statusCode: 405, headers: cors, body: JSON.stringify({ error: "Metodo nao permitido" }) };

  console.log("TEM_CHAVE:", ASAAS_KEY ? "sim" : "nao", "| BASE:", ASAAS_BASE);
  if (!ASAAS_KEY) return { statusCode: 500, headers: cors, body: JSON.stringify({ error: "ASAAS_API_KEY nao configurada no Netlify" }) };

  let body;
  try { body = JSON.parse(event.body || "{}"); }
  catch { return { statusCode: 400, headers: cors, body: JSON.stringify({ error: "JSON invalido" }) }; }

  const { orderId, total, description, comprador, participantes, downwind, successUrl } = body;
  const value = Number(total);
  if (!value || value <= 0) return { statusCode: 400, headers: cors, body: JSON.stringify({ error: "Total invalido" }) };

  const desc = [
    description || "Paradiso WKND 2026",
    comprador && comprador.name ? "Comprador: " + comprador.name : null,
    participantes && participantes.length ? "Ingressos: " + participantes.join("; ") : null,
    orderId ? "Pedido: " + orderId : null
  ].filter(Boolean).join(" | ").slice(0, 500);

  const payload = {
    name: "Paradiso WKND 2026",
    description: desc,
    value: value,
    billingType: "UNDEFINED",
    chargeType: "DETACHED",
    dueDateLimitDays: 3,
    notificationEnabled: true
  };
  if (successUrl) payload.callback = { successUrl: successUrl, autoRedirect: true };

  try {
    const resp = await fetch(ASAAS_BASE + "/paymentLinks", {
      method: "POST",
      headers: { "Content-Type": "application/json", "access_token": ASAAS_KEY, "User-Agent": "ParadisoWKND" },
      body: JSON.stringify(payload)
    });

    const texto = await resp.text();
    console.log("ASAAS_STATUS:", resp.status);
    console.log("ASAAS_RESPOSTA:", texto);

    let data = {};
    try { data = JSON.parse(texto); } catch (e) {}

    if (!resp.ok) {
      const msg = (data && data.errors && data.errors[0] && data.errors[0].description) || ("Asaas recusou (status " + resp.status + ")");
      return { statusCode: resp.status, headers: cors, body: JSON.stringify({ error: msg, status: resp.status, asaas: data }) };
    }

    if (SHEETS_URL) {
      try {
        await fetch(SHEETS_URL, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            tipo: "pedido_criado", status: "aguardando_pagamento",
            orderId: orderId, total: value, comprador: comprador, participantes: participantes,
            downwind: downwind || null, linkId: data.id, criadoEm: new Date().toISOString()
          })
        });
      } catch (e) {}
    }

    return { statusCode: 200, headers: cors, body: JSON.stringify({ url: data.url, id: data.id }) };
  } catch (e) {
    console.log("ERRO_CONEXAO:", e.message);
    return { statusCode: 502, headers: cors, body: JSON.stringify({ error: "Falha de conexao com o Asaas: " + e.message }) };
  }
};
