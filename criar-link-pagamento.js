netlify/functions/criar-link-pagamento.js
// Cria um Link de Pagamento no Asaas com o valor exato do pedido.
// O site (paradiso-wknd.html) chama esta função ao clicar em "Ir para o pagamento".
// Ela devolve { url } com a página de pagamento hospedada pelo Asaas (PIX ou cartão).

const ASAAS_BASE = process.env.ASAAS_BASE || "https://api.asaas.com/v3"; // Sandbox: https://api-sandbox.asaas.com/v3
const ASAAS_KEY  = process.env.ASAAS_API_KEY;                            // sua chave de API do Asaas
const SHEETS_URL = process.env.SHEETS_WEBHOOK_URL;                       // opcional: grava o pedido na planilha ao criar

const cors = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "Content-Type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
  "Content-Type": "application/json"
};

exports.handler = async (event) => {
  if (event.httpMethod === "OPTIONS") return { statusCode: 204, headers: cors, body: "" };
  if (event.httpMethod !== "POST")   return { statusCode: 405, headers: cors, body: JSON.stringify({ error: "Metodo nao permitido" }) };
  if (!ASAAS_KEY)                    return { statusCode: 500, headers: cors, body: JSON.stringify({ error: "ASAAS_API_KEY nao configurada" }) };

  let body;
  try { body = JSON.parse(event.body || "{}"); }
  catch { return { statusCode: 400, headers: cors, body: JSON.stringify({ error: "JSON invalido" }) }; }

  const { orderId, total, description, comprador, participantes, downwind, successUrl } = body;
  const value = Number(total);
  if (!value || value <= 0) return { statusCode: 400, headers: cors, body: JSON.stringify({ error: "Total invalido" }) };

  // A descricao aparece na tela do Asaas e nos relatorios. Guardamos aqui o comprador,
  // os participantes e o numero do pedido para conciliacao.
  const desc = [
    description || "Paradiso WKND 2026",
    comprador && comprador.name ? `Comprador: ${comprador.name}` : null,
    participantes && participantes.length ? `Participantes: ${participantes.join("; ")}` : null,
    orderId ? `Pedido: ${orderId}` : null
  ].filter(Boolean).join(" | ").slice(0, 500);

  const payload = {
    name: "Paradiso WKND 2026",
    description: desc,
    value: value,
    billingType: "UNDEFINED",   // deixa o cliente escolher PIX ou cartao na tela do Asaas
    chargeType: "DETACHED",     // cobranca avulsa (um pagamento unico)
    dueDateLimitDays: 3,
    notificationEnabled: true
  };
  if (successUrl) payload.callback = { successUrl: successUrl, autoRedirect: true };

  try {
    const resp = await fetch(`${ASAAS_BASE}/paymentLinks`, {
      method: "POST",
      headers: { "Content-Type": "application/json", "access_token": ASAAS_KEY, "User-Agent": "ParadisoWKND" },
      body: JSON.stringify(payload)
    });
    const data = await resp.json();

    if (!resp.ok) {
      const msg = (data && data.errors && data.errors[0] && data.errors[0].description) || "Erro ao criar o link no Asaas";
      return { statusCode: resp.status, headers: cors, body: JSON.stringify({ error: msg, asaas: data }) };
    }

    // Opcional: registra o pedido (com respostas do downwind) na planilha, ja como "aguardando pagamento".
    if (SHEETS_URL) {
      try {
        await fetch(SHEETS_URL, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            tipo: "pedido_criado", status: "aguardando_pagamento",
            orderId, total: value, comprador, participantes, downwind: downwind || null,
            linkId: data.id, criadoEm: new Date().toISOString()
          })
        });
      } catch (e) { /* nao bloqueia o pagamento se a planilha falhar */ }
    }

    // data.url = pagina de pagamento do Asaas | data.id = id do link (aparece no webhook como paymentLink)
    return { statusCode: 200, headers: cors, body: JSON.stringify({ url: data.url, id: data.id }) };
  } catch (e) {
    return { statusCode: 502, headers: cors, body: JSON.stringify({ error: "Falha de conexao com o Asaas" }) };
  }
};
