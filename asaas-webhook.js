// netlify/functions/asaas-webhook.js
// Recebe a confirmacao de pagamento do Asaas e dispara a automacao:
//  - grava/atualiza a linha na planilha (Google Sheets via Apps Script)
//  - manda o pedido pro Kommo, onde um gatilho envia o WhatsApp "Reserva confirmada"
// Configure a URL desta funcao no painel do Asaas (Integracoes > Webhooks).

const WEBHOOK_TOKEN = process.env.ASAAS_WEBHOOK_TOKEN; // mesmo valor que voce cadastra no painel do Asaas
const SHEETS_URL    = process.env.SHEETS_WEBHOOK_URL;  // opcional
const KOMMO_URL     = process.env.KOMMO_WEBHOOK_URL;   // opcional

exports.handler = async (event) => {
  if (event.httpMethod !== "POST") return { statusCode: 405, body: "Metodo nao permitido" };

  // O Asaas envia o token que voce definiu no header. Validamos para ninguem falsificar.
  const h = event.headers || {};
  const token = h["asaas-access-token"] || h["Asaas-Access-Token"];
  if (WEBHOOK_TOKEN && token !== WEBHOOK_TOKEN) return { statusCode: 401, body: "Token invalido" };

  let body;
  try { body = JSON.parse(event.body || "{}"); }
  catch { return { statusCode: 400, body: "JSON invalido" }; }

  const evento = body.event;
  const pay = body.payment || {};

  // Só age quando o pagamento foi confirmado ou recebido.
  if (evento !== "PAYMENT_CONFIRMED" && evento !== "PAYMENT_RECEIVED") {
    return { statusCode: 200, body: "ignorado" };
  }

  // pay.description carrega comprador, participantes e o numero do pedido (definidos ao criar o link).
  const registro = {
    tipo: "pagamento_confirmado",
    status: "pago",
    evento: evento,
    pagamentoId: pay.id,
    linkId: pay.paymentLink,
    valor: pay.value,
    formaPagamento: pay.billingType,
    descricao: pay.description,
    clienteAsaasId: pay.customer,
    data: pay.confirmedDate || pay.paymentDate || new Date().toISOString()
  };

  // 1) Planilha
  if (SHEETS_URL) {
    try { await fetch(SHEETS_URL, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(registro) }); }
    catch (e) { /* segue mesmo se a planilha falhar */ }
  }
  // 2) Kommo (la o gatilho de etapa dispara o WhatsApp de "Reserva confirmada")
  if (KOMMO_URL) {
    try { await fetch(KOMMO_URL, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(registro) }); }
    catch (e) { /* segue mesmo se o Kommo falhar */ }
  }

  // Responda 200 rapido para o Asaas nao reenfileirar o evento.
  return { statusCode: 200, body: "ok" };
};
