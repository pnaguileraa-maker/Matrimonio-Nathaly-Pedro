// Bot conversacional de RSVP por WhatsApp (Nathaly & Pedro).
// Backend: Google Apps Script actuando como webhook de WhatsApp Cloud API (Meta),
// leyendo/escribiendo la hoja "Invitados".
//
// PUESTA EN MARCHA
// 1. La hoja "Invitados" debe tener estas columnas en este orden exacto (fila 1 = encabezados):
//    A Nombre invitado | B Telefono | C Cupos | D Link invitacion | E Boton enviar (sin usar por el bot) |
//    F Estado (casilla de verificacion, dispara el envio) | G Estado de confirmacion de asistencia |
//    H Confirmados | I EstadoConversacion | J UltimoContacto
//    - Columna F debe ser de tipo casilla de verificacion (Insertar > Casilla de verificacion).
//    - Telefono en formato E.164 sin "+" (ej: 56912345678).
// 2. Extensiones > Apps Script, pega este archivo. Vincula el proyecto al Sheet.
// 3. En Meta for Developers crea una app de WhatsApp Business, obten:
//    WHATSAPP_TOKEN (token permanente), PHONE_NUMBER_ID, y define un VERIFY_TOKEN propio.
//    Guardalos en Extensiones > Propiedades del proyecto > Propiedades del script
//    (NUNCA los hardcodees en el codigo).
// 4. Implementar > Nueva implementacion > Aplicacion web > Acceso: Cualquier usuario.
//    Usa esa URL como "Callback URL" del webhook de WhatsApp, con el mismo VERIFY_TOKEN.
// 5. El primer contacto con cada invitado exige un Template aprobado por Meta
//    (WhatsApp Manager > Plantillas de mensajes). Verifica que TEMPLATE_INVITACION
//    abajo coincida con el nombre/idioma del template ya aprobado.
// 6. Crea un trigger INSTALABLE (no uno simple) para onEditInvitados:
//    Editor de Apps Script > Activadores (reloj) > Añadir activador >
//    Funcion: onEditInvitados > Fuente del evento: Desde la hoja de calculo > Tipo: Al editar.
//    Esto es necesario porque onEdit simple no puede llamar a la API de WhatsApp.
// 7. Para enviar una invitacion: marca la casilla de la columna F en la fila de ese invitado.
//    El bot se encarga del resto (template, seguimiento de respuestas, actualizar la hoja).

// ===================== CONFIGURACION =====================

const SHEET_NAME = 'Invitados';

const PROPS = PropertiesService.getScriptProperties();
const WHATSAPP_TOKEN = PROPS.getProperty('WHATSAPP_TOKEN');
const PHONE_NUMBER_ID = PROPS.getProperty('PHONE_NUMBER_ID');
const VERIFY_TOKEN = PROPS.getProperty('VERIFY_TOKEN');
const WHATSAPP_API_URL = `https://graph.facebook.com/v21.0/${PHONE_NUMBER_ID}/messages`;

// Posicion de cada columna en la hoja "Invitados" (A=1, B=2, ...).
const COL = {
  NOMBRE: 1,
  TELEFONO: 2,
  CUPOS: 3,
  LINK: 4,
  BOTON_ENVIAR: 5, // link manual "Enviar por WhatsApp", el bot no lo usa
  ENVIAR: 6, // casilla de verificacion que dispara el envio
  ESTADO: 7,
  CONFIRMADOS: 8,
  ESTADO_CONV: 9,
  ULTIMO_CONTACTO: 10
};
const TOTAL_COLUMNAS = 10;

const ESTADO_CONV = {
  INICIAL: 'ESPERANDO_INICIAL',
  TODOS_O_MENOS: 'ESPERANDO_TODOS_O_MENOS',
  CANTIDAD: 'ESPERANDO_CANTIDAD',
  COMPLETADO: 'COMPLETADO'
};

// Valores que el bot escribe en la columna F (Estado de confirmacion de asistencia).
// Configura la validacion de datos de esa columna con estas 3 opciones exactas
// (Datos > Validacion de datos > Lista de elementos) para que el desplegable
// quede sincronizado con lo que el bot escribe automaticamente.
const ESTADO_INVITADO = {
  PENDIENTE: 'Pendiente',
  ACEPTADO: 'Aceptado',
  RECHAZADO: 'Rechazado'
};

const EVENTO = {
  pareja: 'Nathaly & Pedro',
  fecha: '06 de febrero de 2027',
  hora: '18:30 hrs',
  direccion: 'Pasaje Los Olivos, Km 14 camino a Huape, Chillan, Chile'
};

// Template aprobado en Meta (WhatsApp Manager > Plantillas de mensajes).
// Sin variables: el texto es fijo para todos los invitados.
// Los botones de respuesta rapida llegan por el webhook con type:"button",
// donde button.payload == el texto exacto del boton (ver BOTON_INICIAL abajo).
const TEMPLATE_INVITACION = { name: 'invitacion_boda', language: 'es_CL' };

// OJO: estos dos textos deben coincidir EXACTO (con tildes) con los botones
// reales del template aprobado en Meta, o el bot no va a reconocer la respuesta.
const BOTON_INICIAL = {
  SI: 'Sí, confirmo',
  NO: 'No podré asistir'
};

// ===================== DISPARADOR: CASILLA "ENVIAR" =====================

function onEditInvitados(e) {
  const sheet = e.range.getSheet();
  if (sheet.getName() !== SHEET_NAME) return;
  if (e.range.getRow() === 1) return; // encabezados
  if (e.range.getColumn() !== COL.ENVIAR) return; // solo nos importa la columna "Enviar"
  if (String(e.value).toUpperCase() !== 'TRUE') return; // solo al marcar, no al desmarcar

  const rowIndex = e.range.getRow();
  const rowData = sheet.getRange(rowIndex, 1, 1, TOTAL_COLUMNAS).getValues()[0];
  const estadoConv = rowData[COL.ESTADO_CONV - 1];

  if (estadoConv) return; // ya se le envio antes, evita reenvios por error

  const nombre = rowData[COL.NOMBRE - 1];
  const telefono = rowData[COL.TELEFONO - 1];
  const cupos = rowData[COL.CUPOS - 1];

  sendInviteMessage(telefono);
  updateGuestRow(rowIndex, {
    [COL.ESTADO]: ESTADO_INVITADO.PENDIENTE,
    [COL.ESTADO_CONV]: ESTADO_CONV.INICIAL,
    [COL.ULTIMO_CONTACTO]: new Date()
  });
}

// ===================== WEBHOOK =====================

function doGet(e) {
  if (e.parameter['hub.mode'] === 'subscribe' && e.parameter['hub.verify_token'] === VERIFY_TOKEN) {
    return ContentService.createTextOutput(e.parameter['hub.challenge']);
  }
  return ContentService.createTextOutput('Token invalido');
}

function doPost(e) {
  try {
    const body = JSON.parse(e.postData.contents);
    const value = body.entry && body.entry[0] && body.entry[0].changes && body.entry[0].changes[0] && body.entry[0].changes[0].value;
    const message = value && value.messages && value.messages[0];

    if (message) {
      // Util para depurar en Ejecuciones si un boton no se reconoce como se esperaba.
      console.log('Mensaje entrante: ' + JSON.stringify(message));
      routeMessage(message.from, message);
    }
  } catch (err) {
    console.error('doPost error: ' + err);
  }
  return ContentService.createTextOutput('ok');
}

// ===================== ENVIO DE INVITACIONES =====================

// Util como respaldo manual: envia a todos los invitados con la casilla "Enviar"
// marcada que por alguna razon no hayan quedado procesados (ej. el trigger no estaba
// instalado todavia). El flujo normal es marcar la casilla fila por fila.
function reenviarPendientes() {
  const sheet = getSheet();
  const rows = sheet.getDataRange().getValues();

  for (let i = 1; i < rows.length; i++) {
    const row = rows[i];
    const rowIndex = i + 1;
    const enviar = row[COL.ENVIAR - 1];
    const estadoConv = row[COL.ESTADO_CONV - 1];

    if (enviar === true && !estadoConv) {
      const telefono = row[COL.TELEFONO - 1];
      sendInviteMessage(telefono);
      updateGuestRow(rowIndex, {
        [COL.ESTADO]: ESTADO_INVITADO.PENDIENTE,
        [COL.ESTADO_CONV]: ESTADO_CONV.INICIAL,
        [COL.ULTIMO_CONTACTO]: new Date()
      });
    }
  }
}

function sendInviteMessage(telefono) {
  // Primer contacto con el invitado: WhatsApp exige un Template aprobado por Meta
  // para iniciar la conversacion (un mensaje libre/interactivo fallaria). El template
  // actual no tiene variables, asi que se envia tal cual, sin personalizar
  // (la personalizacion queda para el resumen final, una vez que el invitado responde).
  callWhatsAppApi({
    messaging_product: 'whatsapp',
    to: telefono,
    type: 'template',
    template: {
      name: TEMPLATE_INVITACION.name,
      language: { code: TEMPLATE_INVITACION.language }
    }
  });
}

// ===================== RUTEO DE RESPUESTAS =====================

function routeMessage(telefono, message) {
  const sheet = getSheet();
  const rowIndex = findGuestRow(sheet, telefono);
  if (rowIndex === -1) return;

  const rowData = sheet.getRange(rowIndex, 1, 1, TOTAL_COLUMNAS).getValues()[0];
  const estadoConv = rowData[COL.ESTADO_CONV - 1] || ESTADO_CONV.INICIAL;
  const nombre = rowData[COL.NOMBRE - 1];
  const cupos = Number(rowData[COL.CUPOS - 1]);

  const replyId = getReplyId(message);
  const textBody = message.type === 'text' && message.text ? message.text.body : null;

  switch (estadoConv) {
    case ESTADO_CONV.INICIAL:
      handleInicial(sheet, rowIndex, telefono, nombre, cupos, replyId, textBody);
      break;
    case ESTADO_CONV.TODOS_O_MENOS:
      handleTodosOMenos(sheet, rowIndex, telefono, nombre, cupos, replyId);
      break;
    case ESTADO_CONV.CANTIDAD:
      handleCantidad(sheet, rowIndex, telefono, nombre, cupos, replyId);
      break;
    default:
      // Conversacion ya completada: cualquier mensaje nuevo recibe el resumen actual.
      const confirmados = rowData[COL.CONFIRMADOS - 1];
      const estado = rowData[COL.ESTADO - 1];
      sendWhatsAppText(telefono, buildResumenMessage(nombre, estado, confirmados, cupos));
  }
}

function handleInicial(sheet, rowIndex, telefono, nombre, cupos, replyId, textBody) {
  // replyId viene del boton de respuesta rapida del Template "invitacion_boda"
  // (type:"button", payload == texto exacto del boton, ver BOTON_INICIAL).
  // Si el invitado escribio en vez de tocar el boton (ej. "si" o "no"), textMatch
  // intenta reconocer esa respuesta libre como respaldo.
  if (!replyId && textBody) {
    replyId = matchYesNoText(textBody) || replyId;
  }

  if (replyId === BOTON_INICIAL.NO) {
    updateGuestRow(rowIndex, {
      [COL.ESTADO]: ESTADO_INVITADO.RECHAZADO,
      [COL.CONFIRMADOS]: 0,
      [COL.ESTADO_CONV]: ESTADO_CONV.COMPLETADO
    });
    sendWhatsAppText(telefono,
      `Gracias por avisarnos, ${nombre}. Lamentamos que no puedas acompañarnos, ` +
      `pero agradecemos mucho tu cariño y tu respuesta. Un abrazo enorme!`);
    return;
  }

  if (replyId === BOTON_INICIAL.SI) {
    if (cupos <= 1) {
      updateGuestRow(rowIndex, {
        [COL.ESTADO]: ESTADO_INVITADO.ACEPTADO,
        [COL.CONFIRMADOS]: 1,
        [COL.ESTADO_CONV]: ESTADO_CONV.COMPLETADO
      });
      sendWhatsAppText(telefono, buildResumenMessage(nombre, ESTADO_INVITADO.ACEPTADO, 1, cupos));
      return;
    }

    sendWhatsAppButtons(telefono, `Genial, ${nombre}! Reservamos ${cupos} cupos para ti. Iran los ${cupos} cupos reservados?`, [
      { id: 'TODOS', title: `Si, todos (${cupos})` },
      { id: 'MENOS', title: 'Iran menos' }
    ]);
    updateGuestRow(rowIndex, { [COL.ESTADO_CONV]: ESTADO_CONV.TODOS_O_MENOS });
    return;
  }

  // Mensaje de texto libre sin boton reconocido: reenvia el template de invitacion.
  sendInviteMessage(telefono);
}

function handleTodosOMenos(sheet, rowIndex, telefono, nombre, cupos, replyId) {
  if (replyId === 'TODOS') {
    updateGuestRow(rowIndex, {
      [COL.ESTADO]: ESTADO_INVITADO.ACEPTADO,
      [COL.CONFIRMADOS]: cupos,
      [COL.ESTADO_CONV]: ESTADO_CONV.COMPLETADO
    });
    sendWhatsAppText(telefono, buildResumenMessage(nombre, ESTADO_INVITADO.ACEPTADO, cupos, cupos));
    return;
  }

  if (replyId === 'MENOS') {
    const opciones = [];
    const maxOpciones = Math.min(cupos - 1, 10); // limite de 10 filas por lista en WhatsApp
    for (let n = 1; n <= maxOpciones; n++) {
      opciones.push({ id: `CANT_${n}`, title: n === 1 ? '1 persona' : `${n} personas` });
    }
    sendWhatsAppList(telefono, 'Cuantas personas en total asistiran?', 'Elegir cantidad', opciones);
    updateGuestRow(rowIndex, { [COL.ESTADO_CONV]: ESTADO_CONV.CANTIDAD });
  }
}

function handleCantidad(sheet, rowIndex, telefono, nombre, cupos, replyId) {
  const match = /^CANT_(\d+)$/.exec(replyId || '');
  if (!match) return;

  const confirmados = Number(match[1]);
  updateGuestRow(rowIndex, {
    [COL.ESTADO]: ESTADO_INVITADO.ACEPTADO,
    [COL.CONFIRMADOS]: confirmados,
    [COL.ESTADO_CONV]: ESTADO_CONV.COMPLETADO
  });
  sendWhatsAppText(telefono, buildResumenMessage(nombre, ESTADO_INVITADO.ACEPTADO, confirmados, cupos));
}

// Reconoce un "si"/"no" escrito a mano (sin tocar los botones del template) como
// respaldo. Solo cubre el primer contacto; las etapas siguientes (TODOS_O_MENOS,
// CANTIDAD) siguen exigiendo boton/lista porque ahi la respuesta es ambigua en texto libre.
function matchYesNoText(texto) {
  const normalizado = texto
    .toLowerCase()
    .normalize('NFD').replace(/[̀-ͯ]/g, '') // quita tildes: "si" -> "si"
    .trim();

  if (/^(si|sip|sisi|confirmo|asisto|voy|claro|obvio)\b/.test(normalizado)) {
    return BOTON_INICIAL.SI;
  }
  if (/^no\b/.test(normalizado)) {
    return BOTON_INICIAL.NO;
  }
  return null;
}

function buildResumenMessage(nombre, estado, confirmados, cupos) {
  if (estado === ESTADO_INVITADO.RECHAZADO) {
    return `${nombre}, ya registramos que no podras acompañarnos. Gracias por responder!`;
  }
  return (
    `Gracias por confirmar, ${nombre}!\n\n` +
    `Resumen de tu confirmacion:\n` +
    `- Asistentes: ${confirmados} de ${cupos} cupos reservados\n\n` +
    `Nos vemos el ${EVENTO.fecha} a las ${EVENTO.hora} en ${EVENTO.direccion}. ` +
    `Sera una noche inolvidable!`
  );
}

// ===================== API DE WHATSAPP =====================

function sendWhatsAppText(telefono, texto) {
  callWhatsAppApi({
    messaging_product: 'whatsapp',
    to: telefono,
    type: 'text',
    text: { body: texto }
  });
}

function sendWhatsAppButtons(telefono, texto, botones) {
  callWhatsAppApi({
    messaging_product: 'whatsapp',
    to: telefono,
    type: 'interactive',
    interactive: {
      type: 'button',
      body: { text: texto },
      action: {
        buttons: botones.map(b => ({ type: 'reply', reply: { id: b.id, title: b.title } }))
      }
    }
  });
}

function sendWhatsAppList(telefono, texto, botonTexto, opciones) {
  callWhatsAppApi({
    messaging_product: 'whatsapp',
    to: telefono,
    type: 'interactive',
    interactive: {
      type: 'list',
      body: { text: texto },
      action: {
        button: botonTexto,
        sections: [{ title: 'Opciones', rows: opciones.map(o => ({ id: o.id, title: o.title })) }]
      }
    }
  });
}

function callWhatsAppApi(payload) {
  const response = UrlFetchApp.fetch(WHATSAPP_API_URL, {
    method: 'post',
    contentType: 'application/json',
    headers: { Authorization: `Bearer ${WHATSAPP_TOKEN}` },
    payload: JSON.stringify(payload),
    muteHttpExceptions: true
  });

  // Sin esto, un token vencido o un numero mal formado fallan en silencio: no hay
  // excepcion (muteHttpExceptions) y el invitado nunca recibe nada, sin pista de por que.
  const code = response.getResponseCode();
  if (code >= 400) {
    console.error(`Error WhatsApp API (HTTP ${code}) para ${payload.to}: ${response.getContentText()}`);
  }
}

function getReplyId(message) {
  // Boton de respuesta rapida de un Template aprobado (ej. invitacion_boda):
  // el payload llega igual al texto del boton, no como id interno.
  if (message.type === 'button' && message.button) {
    return message.button.payload || message.button.text || null;
  }
  // Boton/lista de un mensaje interactivo creado por el propio bot (sendWhatsAppButtons/List).
  if (message.type === 'interactive') {
    const interactive = message.interactive;
    if (interactive.button_reply) return interactive.button_reply.id;
    if (interactive.list_reply) return interactive.list_reply.id;
  }
  return null;
}

// ===================== SHEET HELPERS =====================

function getSheet() {
  return SpreadsheetApp.getActiveSpreadsheet().getSheetByName(SHEET_NAME);
}

function findGuestRow(sheet, telefono) {
  const telefonos = sheet.getRange(2, COL.TELEFONO, sheet.getLastRow() - 1, 1).getValues();
  const normalizado = normalizePhone(telefono);

  for (let i = 0; i < telefonos.length; i++) {
    if (normalizePhone(telefonos[i][0]) === normalizado) return i + 2;
  }
  return -1;
}

function updateGuestRow(rowIndex, updates) {
  const sheet = getSheet();
  Object.keys(updates).forEach(col => {
    sheet.getRange(rowIndex, Number(col)).setValue(updates[col]);
  });
}

function normalizePhone(telefono) {
  return String(telefono).replace(/\D/g, '');
}
