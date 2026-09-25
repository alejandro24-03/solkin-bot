// ============================================================
//  Sol-Kin Tours — Bot de WhatsApp (webhook)
//  Basado en el prototipo: menú, tours, cotización, reserva,
//  política de cancelación y derivación a un asesor humano.
// ============================================================

const express = require('express');
const app = express();
app.use(express.json());

// ---------- Variables de entorno (se configuran en Render) ----------
const VERIFY_TOKEN = process.env.VERIFY_TOKEN;       // tú lo inventas, ej: "solkin2026"
const WHATSAPP_TOKEN = process.env.WHATSAPP_TOKEN;   // el token que copiaste de Meta
const PHONE_NUMBER_ID = process.env.PHONE_NUMBER_ID; // el "Phone Number ID" que copiaste

// ---------- Catálogo de tours (igual que el prototipo) ----------
const TOURS = [
  { id: 'ci-cenote', name: 'Chichén Itzá – Cenote', includes: ['Transporte redondo', 'Entrada al cenote', 'Guía certificado'], notIncluded: ['Entrada a la zona arqueológica de Chichén Itzá'], price: 1450 },
  { id: 'ci-express', name: 'Chichén Itzá Express', includes: ['Transporte redondo', 'Guía certificado (3 hrs)'], notIncluded: ['Entrada a la zona arqueológica de Chichén Itzá'], price: 1100 },
  { id: 'ci-ekbalam', name: 'Chichén Itzá – Cenote – Ek Balam', includes: ['Transporte redondo', 'Entrada al cenote', 'Guía certificado'], notIncluded: ['Entrada a la zona arqueológica de Chichén Itzá'], price: 2110 },
  { id: 'tulum-yaaxmul', name: 'Tulum – Cenote Yaaxmul', includes: ['Transporte redondo', 'Entrada a las ruinas de Tulum', 'Entrada al cenote', 'Guía certificado', 'Comida y una bebida en Tulum'], notIncluded: [], price: 1950 },
  { id: 'tulum-coba', name: 'Tulum – Cobá – Cenote', includes: ['Transporte redondo', 'Entrada a ruinas de Tulum y Cobá', 'Bicicleta en Cobá', 'Guía certificado', 'Comida buffet', 'Entrada al cenote'], notIncluded: [], price: 1900 },
  { id: 'coba-express', name: 'Cobá Express', includes: ['Transporte redondo', 'Guía certificado', 'Bicicleta en Cobá', 'Comida', 'Entrada a ruinas de Cobá'], notIncluded: [], price: 1500 },
  { id: 'coba-punta', name: 'Cobá – Punta Laguna', includes: ['Transporte redondo', 'Entrada a la reserva', 'Guía certificado'], notIncluded: [], price: null },
  { id: 'rio-lagartos', name: 'Río Lagartos – Coloradas', includes: ['Transporte redondo', 'Guía certificado', 'Recorrido en lancha', 'Reserva de flamencos', 'Playa', 'Baño de lodo maya'], notIncluded: ['Boleto para entrar al Banco de Sal'], price: 2050 },
  { id: 'valladolid', name: 'Valladolid – 2 Cenotes', includes: ['Transporte redondo', 'Guía certificado', 'Entrada a los cenotes'], notIncluded: ['Comida'], price: 1000 },
];

const AGENT = { name: 'Elías Hernández', phone: '529982932976' }; // formato wa.me sin "+"

// ---------- "Base de datos" de conversaciones en memoria ----------
// OJO: se borra si el servidor se reinicia. Para la demo es suficiente.
const sessions = {};

function getSession(userId) {
  if (!sessions[userId]) {
    sessions[userId] = { step: 'menu', selectedTour: null, travelers: null, date: null };
  }
  return sessions[userId];
}

function money(n) {
  return '$' + n.toLocaleString('es-MX') + ' MXN';
}

// ---------- Enviar mensaje de texto por WhatsApp ----------
async function sendText(to, body) {
  await fetch(`https://graph.facebook.com/v21.0/${PHONE_NUMBER_ID}/messages`, {
    method: 'POST',
    headers: {
      'Authorization': `Bearer ${WHATSAPP_TOKEN}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      messaging_product: 'whatsapp',
      to,
      type: 'text',
      text: { body },
    }),
  });
}

// ---------- Lógica de respuesta (la misma idea que el prototipo) ----------
async function handleMessage(from, text) {
  const session = getSession(from);
  const lower = text.trim().toLowerCase();

  // Comandos globales, funcionan en cualquier paso
  if (/^(hola|buenas|inicio|menu|menú)$/.test(lower)) {
    session.step = 'menu';
    return showMainMenu(from, true);
  }
  if (/asesor|humano|agente|persona/.test(lower)) {
    return escalateToHuman(from);
  }

  switch (session.step) {
    case 'menu':
      return handleMenuChoice(from, lower);

    case 'choosing_tour_list':
      return handleTourSelection(from, lower);

    case 'choosing_tour_for_quote':
      return handleTourSelection(from, lower, true);

    case 'asking_travelers':
      return handleTravelers(from, lower);

    case 'asking_date':
      session.date = text.trim();
      session.step = 'asking_name';
      return sendText(from, 'Genial. Por último, ¿a nombre de quién hago la reserva?');

    case 'asking_name':
      return confirmBooking(from, text.trim());

    default:
      session.step = 'menu';
      return showMainMenu(from, true);
  }
}

async function showMainMenu(to, intro) {
  const saludo = intro
    ? '¡Hola! 👋 Bienvenido a *Sol-Kin Tours* 🌴\n"Donde viajar es una experiencia"\n\nSoy el asistente virtual de la agencia. ¿En qué te ayudo hoy?'
    : '¿En qué más te puedo ayudar?';
  const opciones =
    '\n\n1️⃣ Ver tours e itinerarios\n2️⃣ Cotizar mi viaje\n3️⃣ Política de cancelación\n4️⃣ Hablar con un asesor\n\nResponde con el número de la opción.';
  await sendText(to, saludo + opciones);
}

async function handleMenuChoice(from, lower) {
  const session = getSession(from);
  if (lower === '1' || /tour|itinerario|paseo|excursi/.test(lower)) {
    session.step = 'choosing_tour_list';
    return showTourList(from);
  }
  if (lower === '2' || /cotiz|precio|cuanto|cuánto/.test(lower)) {
    session.step = 'choosing_tour_for_quote';
    return sendText(from, 'Con gusto te ayudo a cotizar 🙂 ¿Para cuál tour? Escribe el número:\n\n' + listTours());
  }
  if (lower === '3' || /cancel/.test(lower)) {
    return showCancellationPolicy(from);
  }
  if (lower === '4') {
    return escalateToHuman(from);
  }
  await sendText(from, 'No entendí tu mensaje 🤔 Responde con 1, 2, 3 o 4 según el menú, o escribe "menú" para verlo de nuevo.');
}

function listTours() {
  return TOURS.map((t, i) => `${i + 1}. ${t.name}`).join('\n');
}

async function showTourList(to) {
  await sendText(to, 'Estos son nuestros tours disponibles:\n\n' + listTours() + '\n\nEscribe el número del tour que te interesa.');
}

async function handleTourSelection(from, lower, isForQuote = false) {
  const session = getSession(from);
  const idx = parseInt(lower, 10) - 1;
  if (isNaN(idx) || !TOURS[idx]) {
    return sendText(from, 'No reconocí ese número. Escribe el número del tour de la lista, o "menú" para regresar.');
  }
  const t = TOURS[idx];
  session.selectedTour = t.id;

  if (isForQuote) {
    session.step = 'asking_travelers';
    return sendText(from, `Perfecto, *${t.name}*. ¿Para cuántos viajeros sería la reserva? (escribe un número, o "grupo" si son 5 o más)`);
  }

  const inc = t.includes.map(i => '✅ ' + i).join('\n');
  const notInc = t.notIncluded.length ? '\n\nNo incluye:\n' + t.notIncluded.map(i => '❌ ' + i).join('\n') : '';
  const priceLine = t.price ? `\n\n💵 Precio: ${money(t.price)} por persona` : '\n\n💵 Precio: sujeto a confirmación con un asesor';
  await sendText(from, `*${t.name}*\n\nIncluye:\n${inc}${notInc}${priceLine}\n\nEscribe "cotizar" si quieres una cotización, o "menú" para regresar.`);
  session.step = 'menu';
}

async function handleTravelers(from, lower) {
  const session = getSession(from);
  const t = TOURS.find(x => x.id === session.selectedTour);

  if (/grupo/.test(lower)) {
    await sendText(from, '¡Qué buena noticia, un grupo! 🎉 Para 5 personas o más manejamos tarifas especiales, así que te voy a conectar con un asesor.');
    return escalateToHuman(from, `Cotización de grupo para "${t.name}".`);
  }

  const n = parseInt(lower, 10);
  if (isNaN(n) || n < 1) {
    return sendText(from, 'Escribe un número de viajeros válido, por favor (ej. 2), o "grupo" si son 5 o más.');
  }
  session.travelers = n;

  if (!t.price) {
    await sendText(from, `Para *${t.name}* el precio se confirma con un asesor. Te conecto para darte el costo exacto.`);
    return escalateToHuman(from, `Solicita precio para "${t.name}" (${n} persona(s)).`);
  }

  const total = t.price * n;
  let msg = `Aquí tienes tu cotización:\n\n*${t.name}*\n${n} persona(s) × ${money(t.price)}\n\n*Total estimado: ${money(total)}*`;
  if (t.notIncluded.length) {
    msg += `\n\n⚠️ No incluye:\n${t.notIncluded.map(i => '• ' + i).join('\n')}`;
  }
  msg += '\n\nEscribe "reservar" para apartar tu lugar, o "menú" para regresar.';
  session.step = 'awaiting_reserve_confirm';
  await sendText(from, msg);
}

async function confirmBooking(from, name) {
  const session = getSession(from);
  const t = TOURS.find(x => x.id === session.selectedTour);
  const total = t.price * session.travelers;
  const folio = 'SK-' + Math.floor(1000 + Math.random() * 9000);
  await sendText(from, `✅ *¡Reserva registrada, ${name}!*\n\n*${t.name}*\n👥 ${session.travelers} persona(s)\n📅 ${session.date}\n💵 Total: ${money(total)}\n🔖 Folio: ${folio}\n\n¡Gracias por viajar con Sol-Kin Tours! 🌴`);
  session.step = 'menu';
}

async function showCancellationPolicy(to) {
  await sendText(to, 'Política de cancelación:\n\n🟢 Cancelación gratuita hasta 24 h antes.\n🟡 Entre 24 y 12 h antes: cargo del 50%.\n🔴 Menos de 12 h antes o "no show": sin reembolso.\n🌦️ Mal clima: reagenda sin costo o reembolso 100%.\n\nEscribe "menú" para regresar.');
}

async function escalateToHuman(to, note) {
  await sendText(to, 'Entiendo perfectamente, este caso lo puede atender mejor una persona del equipo. 🙏');
  await sendText(to, `Te conecto con *${AGENT.name}*, guía certificado: https://wa.me/${AGENT.phone}`);
  const session = getSession(to);
  session.step = 'menu';
}

// Palabra clave "reservar" y "cotizar" sueltas, fuera del switch principal
async function checkKeywords(from, text) {
  const lower = text.trim().toLowerCase();
  const session = getSession(from);
  if (lower === 'reservar' && session.step === 'awaiting_reserve_confirm') {
    session.step = 'asking_date';
    await sendText(from, '¡Excelente elección! 📅 ¿Para qué fecha te gustaría reservar? (escríbela, ej. "12 de octubre")');
    return true;
  }
  if (lower === 'cotizar') {
    session.step = 'choosing_tour_for_quote';
    await sendText(from, 'Claro, ¿para cuál tour? Escribe el número:\n\n' + listTours());
    return true;
  }
  return false;
}

// ============================================================
//  RUTAS DEL SERVIDOR
// ============================================================

// Verificación del webhook (Meta la llama una sola vez, al configurarlo)
app.get('/webhook', (req, res) => {
  const mode = req.query['hub.mode'];
  const token = req.query['hub.verify_token'];
  const challenge = req.query['hub.challenge'];

  if (mode === 'subscribe' && token === VERIFY_TOKEN) {
    console.log('Webhook verificado ✅');
    res.status(200).send(challenge);
  } else {
    res.sendStatus(403);
  }
});

// Recepción de mensajes reales de WhatsApp
app.post('/webhook', async (req, res) => {
  try {
    const entry = req.body.entry?.[0];
    const change = entry?.changes?.[0];
    const message = change?.value?.messages?.[0];

    if (message && message.type === 'text') {
      const from = message.from; // número del usuario
      const text = message.text.body;

      const handledKeyword = await checkKeywords(from, text);
      if (!handledKeyword) {
        await handleMessage(from, text);
      }
    }
    res.sendStatus(200);
  } catch (err) {
    console.error('Error en webhook:', err);
    res.sendStatus(200); // siempre 200 para que Meta no reintente en bucle
  }
});

app.get('/', (req, res) => {
  res.send('Sol-Kin Tours bot está corriendo ✅');
});

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => console.log(`Servidor corriendo en puerto ${PORT}`));
