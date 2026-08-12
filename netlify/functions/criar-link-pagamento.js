// Recebe a confirmacao de pagamento do Asaas e dispara a automacao.

const WEBHOOK_TOKEN = process.env.ASAAS_WEBHOOK_TOKEN;
const SHEETS_URL    = process.env.SHEETS_WEBHOOK_URL;
const KOMMO_URL     = process.env.KOMMO_WEBHOOK_URL;

exports.handler = async (event) => {
  if (event.httpMethod !== "POST") return { statusCode: 405, body: "Metodo nao permitido" };

  const h = event.headers || {};
  const token = h["asaas-access-token"] || h["Asaas-Access-Token"];
  if (WEBHOOK_TOKEN && token !== WEBHOOK_TOKEN) return { statusCode: 401, body: "Token invalido" };

  let body;
  try { body = JSON.parse(event.body || "{}"); }
  catch { return { statusCode: 400, body: "JSON invalido" }; }

  const evento = body.event;
  const pay = body.payment || {};

  if (evento !== "PAYMENT_CONFIRMED" && evento !== "PAYMENT_RECEIVED") {
    return { statusCode: 200, body: "ignorado" };
  }

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

  if (SHEETS_URL) {
    try { await fetch(SHEETS_URL, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(registro) }); }
    catch (e) {}
  }
  if (KOMMO_URL) {
    try { await fetch(KOMMO_URL, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(registro) }); }
    catch (e) {}
  }

  return { statusCode: 200, body: "ok" };
};
