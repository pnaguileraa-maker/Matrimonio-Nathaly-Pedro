// Backend de RSVP para la boda de Nathaly & Pedro.
// Recibe las confirmaciones enviadas por el formulario conversacional del sitio
// (index.html, tarjeta "Confirma tu Asistencia") via fetch POST, y las registra
// en la hoja "Invitados". No depende de Meta / WhatsApp Business API: el envio
// del resumen por WhatsApp lo hace el propio navegador del invitado abriendo
// wa.me, este script solo deja la respuesta guardada en la planilla.
//
// PUESTA EN MARCHA
// 1. La hoja "Invitados" debe tener (al menos) estas columnas en este orden:
//    A Nombre invitado | B Telefono | C Cupos | D Link invitacion | E Boton enviar |
//    F Estado de confirmacion de asistencia | G Confirmados | H Titular | I Acompanantes |
//    J UltimoContacto
//    - H (Titular) lleva el nombre del invitado principal con su menu entre parentesis,
//      ej. "Camila Rios (Menú Normal)".
//    - I (Acompanantes) lista a cada acompanante igual, nombre + su propio menu entre
//      parentesis, separados por " | ", ej. "Juan Soto (Vegetariano/Vegano) | Ana Diaz (Menú Normal)".
// 2. Extensiones > Apps Script, pega este archivo. Vincula el proyecto al Sheet.
// 3. Implementar > Nueva implementacion > Aplicacion web > Acceso: Cualquier usuario.
//    Copia esa URL y pegala como APPS_SCRIPT_URL en index.html.
// 4. Cada vez que edites este archivo: Implementar > Administrar implementaciones >
//    (lapiz) Editar > Version: Nueva version > Implementar. Así la URL no cambia.

const SHEET_NAME = 'Invitados';

// Posicion de cada columna en la hoja "Invitados" (A=1, B=2, ...).
const COL = {
  NOMBRE: 1,
  TELEFONO: 2,
  CUPOS: 3,
  LINK: 4,
  BOTON_ENVIAR: 5,
  ESTADO: 6,
  CONFIRMADOS: 7,
  TITULAR: 8,
  ACOMPANANTES: 9,
  ULTIMO_CONTACTO: 10
};

function doGet(e) {
  return ContentService.createTextOutput('Backend RSVP activo.');
}

function doPost(e) {
  try {
    // OJO: e.postData.contents / e.postData.getBytes() corrompen tildes y ñ en Apps Script
    // (bug conocido de la plataforma: el body crudo de un POST se decodifica mal y los
    // caracteres multibyte se pierden, mostrando el símbolo � en la hoja). e.parameter SÍ
    // decodifica UTF-8 correctamente, por eso el sitio manda el JSON como un parametro de
    // formulario ("payload") en vez de como texto plano.
    const data = JSON.parse(e.parameter.payload || '{}');
    const rowIndex = guardarConfirmacion(data);
    return ContentService.createTextOutput(JSON.stringify({ ok: true, fila: rowIndex }))
      .setMimeType(ContentService.MimeType.JSON);
  } catch (err) {
    // Antes esto quedaba solo en el log y el cliente igual recibia {ok:true}, asi que un
    // fallo real (ej. hoja no encontrada) pasaba inadvertido. Ahora el error se ve en
    // Ejecuciones (Apps Script) Y se devuelve al cliente para poder diagnosticar sin adivinar.
    console.error('doPost error: ' + err);
    return ContentService.createTextOutput(JSON.stringify({ ok: false, error: String(err) }))
      .setMimeType(ContentService.MimeType.JSON);
  }
}

function guardarConfirmacion(data) {
  const nombre = String(data.nombre || '').trim() || 'Invitado sin nombre';
  const estado = data.estado === 'Rechazado' ? 'Rechazado' : 'Aceptado';
  const menuPrincipal = String(data.menuPrincipal || '').trim();
  const acompanantes = (Array.isArray(data.acompanantes) ? data.acompanantes : [])
    .map(a => ({ nombre: String((a && a.nombre) || '').trim(), menu: String((a && a.menu) || '').trim() }))
    .filter(a => a.nombre);

  const confirmados = estado === 'Aceptado' ? 1 + acompanantes.length : 0;
  const titularTexto = estado === 'Aceptado' ? `${nombre} (${menuPrincipal})` : `${nombre} (No asiste)`;
  const acompanantesTexto = acompanantes.map(a => `${a.nombre} (${a.menu})`).join(' | ');

  const sheet = getSheet();
  if (!sheet) {
    throw new Error(`No se encontro la hoja "${SHEET_NAME}" en esta planilla.`);
  }

  let rowIndex = findGuestRowByName(sheet, nombre);
  if (rowIndex === -1) {
    rowIndex = sheet.getLastRow() + 1;
    sheet.getRange(rowIndex, COL.NOMBRE).setValue(nombre);
  }

  updateGuestRow(rowIndex, {
    [COL.ESTADO]: estado,
    [COL.CONFIRMADOS]: confirmados,
    [COL.TITULAR]: titularTexto,
    [COL.ACOMPANANTES]: acompanantesTexto,
    [COL.ULTIMO_CONTACTO]: new Date()
  });

  return rowIndex;
}

// ===================== SHEET HELPERS =====================

function getSheet() {
  return SpreadsheetApp.getActiveSpreadsheet().getSheetByName(SHEET_NAME);
}

function findGuestRowByName(sheet, nombre) {
  const lastRow = sheet.getLastRow();
  if (lastRow < 2) return -1;

  const nombres = sheet.getRange(2, COL.NOMBRE, lastRow - 1, 1).getValues();
  const normalizado = nombre.trim().toLowerCase();

  for (let i = 0; i < nombres.length; i++) {
    if (String(nombres[i][0]).trim().toLowerCase() === normalizado) return i + 2;
  }
  return -1;
}

function updateGuestRow(rowIndex, updates) {
  const sheet = getSheet();
  Object.keys(updates).forEach(col => {
    sheet.getRange(rowIndex, Number(col)).setValue(updates[col]);
  });
}
