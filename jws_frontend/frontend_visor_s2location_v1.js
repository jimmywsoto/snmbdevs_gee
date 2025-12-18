var backend = require('users/jwsingenieria/APP_SATA_JWS:jws_backend/backend_visor_s2location_v1');
// VISOR SATELITAL DE IMÁGENES SENTINEL-2 ALREDEDOR DE UNA UBICACIÓN GEOGRÁFICA
// =====================================================================================
// JWS-GEE: Aplicativo GEE para visualizar imágenes satelitales Sentinel-2 ingresando 
// coordenadas de un punto.
// Fecha desarrollo: 26/08/2025
// Última actualización: 16/10/2025
// Dev: Ing. Jimmy Wladimir Cabrera Soto
// Code: app_visor_s2location_v3.js
// =====================================================================================
// Interfaz de Usuario
// =============================
var mainLabel = ui.Label({
    value: 'MINISTERIO DEL AMBIENTE Y ENERGÍA DEL ECUADOR',
    style: {
        fontWeight: 'bold',
        fontSize: '24px',
        textAlign: 'center',
        margin: '8px 8px',
        color: '#32266B',
        stretch: 'horizontal'
    }
});

var snmbLabel = ui.Label({
    value: 'SISTEMA NACIONAL DE MONITOREO DE BOSQUES',
    style: {
        fontWeight: 'bold',
        fontSize: '16px',
        textAlign: 'center',
        margin: '2px 8px',
        color: '#216821ff',
        stretch: 'horizontal'
    }
});

var titleLabel = ui.Label({
    value: 'VISOR SATELITAL DE IMÁGENES SENTINEL-2 ALREDEDOR DE UNA UBICACIÓN GEOGRÁFICA',
    style: {
        fontWeight: 'bold',
        fontSize: '14px',
        textAlign: 'center',
        margin: '4px 2px',
        color: '#FFC600',
        stretch: 'horizontal'
    }
});

var coordLabel = ui.Label('Ingrese coordenadas (lon, lat):');
var coordInput = ui.Textbox({
    placeholder: '-78.5, -0.2',
    style: { stretch: 'horizontal' }
});

var startLabel = ui.Label('Fecha inicio (YYYY-MM-DD):');
var startDate = ui.Textbox({
    placeholder: '2022-01-01',
    style: { stretch: 'horizontal' }
});

var endLabel = ui.Label('Fecha final (YYYY-MM-DD):');
var endDate = ui.Textbox({
    placeholder: '2025-01-01',
    style: { stretch: 'horizontal' }
});

var runButton = ui.Button({
    label: 'Iniciar búsqueda de imágenes!',
    style: { stretch: 'horizontal' }
});

var messageLabel = ui.Label('');
var labelStyle = messageLabel.style();
messageLabel.style().set({
  stretch: 'horizontal',
  textAlign: 'center',
  fontSize: '12px',
  color: 'gray',
  padding: '7px',
  backgroundColor: 'white',
  border: '1px solid #ccc',
  borderRadius: '5px',
  fontFamily: 'monospace',
  shown: false,
});

var exportLabel = ui.Label('Las imagenes se encuentran listas para exportar, revisa el panel de tareas.');
var exportStyle = exportLabel.style();
exportLabel.style().set({
  stretch: 'horizontal',
  textAlign: 'center',
  fontSize: '12px',
  color: '279FF5',
  padding: '7px',
  backgroundColor: 'white',
  border: '1px solid #9ACAED',
  borderRadius: '5px',
  fontFamily: 'monospace',
  shown: false,
});

// Panel principal
var panel = ui.Panel({
    widgets: [
        mainLabel,
        snmbLabel,
        titleLabel,
        coordLabel,
        coordInput,
        startLabel,
        startDate,
        endLabel,
        endDate,
        runButton,
        messageLabel,
        exportLabel
    ],
    layout: ui.Panel.Layout.flow('vertical'),
    style: { width: '300px' }
});

ui.root.insert(0, panel);

function init() {
    backend.getSentinelCollectionLocal(coordInput, messageLabel, labelStyle, startDate, endDate, exportStyle, panel )
}

// Vincular función al botón
runButton.onClick(init);
