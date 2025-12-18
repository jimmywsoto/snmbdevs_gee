// VISOR INTEGRAL PARA ANÁLISIS SATELITAL
// =====================================================================================
// JWS-GEE: Aplicativo GEE para visualizar imágenes satelitales compuestas (RGB, mosaicos, ratioRGB) 
// utilizando Sentinel-2, Landsat-8 y Landsat-9.
// Fecha desarrollo: 02/07/2025
// Última actualización: 05/11/2025
// Dev: Ing. Jimmy Wladimir Cabrera Soto
// Code: frontend_visor_satelital_v1.js
// Reference code: app_visor_satelital_v3.js (31/10/2025)
// =====================================================================================
var backend = require('users/jwsingenieria/APP_SATA_JWS:jws_backend/backend_visor_satelital_v1');
var nombresAreas = null;
var listaOrdenada = null;
var alertas = null;
var campo = null;

// ----------------------------------------------------- Panel General
var panelGeneral = ui.Panel({
    style: {
        position: 'bottom-right',
        padding: '8px',
        height: '100%',
        width: '300px'
    }
});

var panel = ui.Panel({
    style: {
        padding: '10px',
        margin: '2px 8px',
        border: '1px solid #D9D9D9',
        borderRadius: '5px',
        position: 'bottom-right',
        maxHeight: '300px',
        fontSize: '12px',
        fontFamily: 'Arial, sans-serif',
        stretch: 'horizontal',
        shown: false
    }
});

var mainLabel = ui.Label({
    value: 'MINISTERIO DE AMBIENTE Y ENERGÍA DEL ECUADOR',
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
    value: 'VALIDACIÓN VISUAL DE ALERTAS TEMPRANAS AMBIENTALES (SATA)',
    style: {
        fontWeight: 'bold',
        fontSize: '14px',
        textAlign: 'center',
        margin: '4px 2px',
        color: '#FFC600',
        stretch: 'horizontal'
    }
});

var assetLabel = ui.Label('Ingrese Asset ID:')
var assetId = ui.Textbox({ 
    placeholder: 'projects/snmbdevs/assets/ASSET_FEATURES',
    style: { stretch: 'horizontal', margin: '2px 8px' } 
});

// ----------------------------------------------------- Selector Código
var fieldLabel = ui.Label({
    value:'Campo ID:',
    style: {
        backgroundColor: '#F5F5F5',
        stretch: 'horizontal', 
        margin: '2px',
        padding: '4px'
    }
})
var assetField = ui.Textbox({ 
    placeholder: 'Campo de identificación',
    value: 'cod',
    style: { stretch: 'horizontal', margin: '2px' } 
});

var runButton = ui.Button({
    label: 'Iniciar búsqueda de imágenes!',
    style: { stretch: 'horizontal', margin: '2px 8px' }
});

// ----------------------------------------------------- Selector Buffer
var bufferLabel = ui.Label({
    value:'Buffer:',
    style: {
        backgroundColor: '#F5F5F5',
        stretch: 'horizontal', 
        margin: '2px',
        padding: '4px'
    }
})
var bufferSelector = ui.Select({
    items: ['5 km', '10 km', '25 km'],
    value: '5 km',
    placeholder: 'Distancia de Buffer (km)',
    style: { stretch: 'horizontal', margin: '0px 2px' },
});

// ----------------------------------------------------- Selector Nubosidad
var nubosidadLabel = ui.Label({
    value:'Nubosidad:',
    style: {
        backgroundColor: '#F5F5F5',
        stretch: 'horizontal', 
        margin: '2px',
        padding: '4px'
    }
})
var nubosidadSelector = ui.Select({
    items: ['10 %', '25 %', '50 %', '75 %'],
    value: '25 %',
    placeholder: '% de nubes',
    style: { stretch: 'horizontal', margin: '0px 2px' },
});

// ----------------------------------------------------- Label de fecha de inicio
var finicioLabel = ui.Label({
    value:'Fecha Inicial:',
    style: {
        backgroundColor: '#F5F5F5',
        stretch: 'horizontal', 
        margin: '2px',
        padding: '4px'
    }
})
var fechaInicioInput = ui.Textbox({ 
    placeholder: '2025-06-05',
    style: { stretch: 'horizontal', margin: '2px' } 
});

// ----------------------------------------------------- Label de fecha de fin
var ffinLabel = ui.Label({
  value:'Fecha Final:',
    style: {
        backgroundColor: '#F5F5F5',
        stretch: 'horizontal', 
        margin: '2px',
        padding: '4px'
    }
})

var fechaFinInput= ui.Textbox({ 
    placeholder: '2025-10-27',
    style: { stretch: 'horizontal', margin: '2px' } 
});

// ----------------------------------------------------- Panel Fechas (labels)
var fechaLabels = ui.Panel({
  widgets: [fieldLabel, finicioLabel, ffinLabel, bufferLabel, nubosidadLabel],
  layout: ui.Panel.Layout.flow('vertical'),
  style: {stretch: 'horizontal', margin: '2px 0'}
});

// ----------------------------------------------------- Panel Fechas (inputs)
var fechaInputs = ui.Panel({
  widgets: [assetField, fechaInicioInput, fechaFinInput, bufferSelector, nubosidadSelector],
  layout: ui.Panel.Layout.flow('vertical'),
  style: {stretch: 'horizontal', margin: '2px 0'}
});

// ----------------------------------------------------- Panel principal (fechas)
var panelFechas = ui.Panel({
  widgets: [fechaLabels, fechaInputs],
  layout: ui.Panel.Layout.flow('horizontal'),
  style: {
    stretch: 'horizontal',
    margin: '2px 6px'
  }
});

// ----------------------------------------------------- Selector
var selector = ui.Select({
    items: listaOrdenada,
    placeholder: 'Selecciona una alerta',
    onChange: function (codigo) {
        buscador.setValue(codigo);
        backend.actualizarVisualizacion(codigo, modeCheckbox, fechaInicioInput, fechaFinInput, nubosidadSelector, alertas, campo, bufferSelector, s2RatioInput, l89RatioInput, l8Mosaiclink, l9Mosaiclink, s2Mosaiclink, l8Imagelink, l9Imagelink, s2Imagelink, downloadPanel, primaryLinksPanel, secondaryLinksPanel, panel);
    },
    style: { stretch: 'horizontal', margin: '2px 8px' }
});

var selectorPanel = ui.Panel([
    ui.Label('Selecciona una alerta:'),
    selector
], 'flow');
selectorPanel.style().set('shown', false);

// ----------------------------------------------------- Buscador
var buscador = ui.Textbox({ 
    placeholder: 'Código / identificador de feature',
    style: { 
        stretch: 'horizontal', 
        margin: '2px 8px' 
    } 
});
var botonBuscar = ui.Button({
    label: 'Buscar',
    onClick: function () {
        var codigo = buscador.getValue();
        if (listaOrdenada.indexOf(codigo) !== -1) {
            selector.setValue(codigo);
        } else {
            print('⚠️ Código "' + codigo + '" no encontrado.', 'warning');
        }
    },
    style: { stretch: 'horizontal', margin: '2px 8px' }
});
var buscadorPanel = ui.Panel([
    ui.Label('Buscar alerta por código:'),
    buscador,
    botonBuscar
], 'flow');
buscadorPanel.style().set('shown', false);

// ----------------------------------------------------- Checkbox: Full / Single Mode
var modeCheckbox = ui.Checkbox({
    label: 'Full Mode',
    value: false, // false = S2/L8/L9 & S2/L8/L9 Mosaics; true: adiciona ratios.
    style: { stretch: 'horizontal' },
    onChange: function (e) {
        s2RatioPanel.style().set('shown', e);
        l89RatioPanel.style().set('shown', e)
    }
});

// ----------------------------------------------------- Ratio Expressions
var s2RatioLabel = ui.Label('Expresión de Ratio RGB (Sentinel-2)');
var s2RatioInput = ui.Textbox({ 
    placeholder: 'Expresión de razón de bandas (ratios):',
    value: ['B12/B4', 'B8/B4', 'B11/B12'],
    style: { 
        stretch: 'horizontal', 
        margin: '2px 8px' 
    } 
});
var s2RatioPanel = ui.Panel({
  widgets: [s2RatioLabel, s2RatioInput],
  layout: ui.Panel.Layout.flow('vertical'),
  style: {stretch: 'horizontal', margin: '2px 0', shown: false}
});

var l89RatioLabel = ui.Label('Expresión de Ratio RGB (Landsat-8/9):');
var l89RatioInput = ui.Textbox({ 
    placeholder: 'Expresión de razón de bandas (ratios)',
    value: ['SR_B7/SR_B4', 'SR_B5/SR_B4', 'SR_B6/SR_B7'],
    style: { 
        stretch: 'horizontal', 
        margin: '2px 8px' 
    } 
});
var l89RatioPanel = ui.Panel({
  widgets: [l89RatioLabel, l89RatioInput],
  layout: ui.Panel.Layout.flow('vertical'),
  style: {stretch: 'horizontal', margin: '2px 0', shown: false}
});

// ----------------------------------------------------- Download Links
var downloadPanel = ui.Label({ value: 'Links de Descarga: (M: Mosaic, I: Image)', style:{stretch: 'horizontal', shown: false} });
var s2Mosaiclink = ui.Label({ value: 'S2-M', style:{stretch: 'horizontal', margin: '2px 8px',} });
var l8Mosaiclink = ui.Label({ value: 'L8-M', style:{stretch: 'horizontal', margin: '2px 8px',} });
var l9Mosaiclink = ui.Label({ value: 'L9-M', style:{stretch: 'horizontal', margin: '2px 8px',} });
var s2Imagelink = ui.Label({ value: 'S2-I', style:{stretch: 'horizontal', margin: '2px 8px',} });
var l8Imagelink = ui.Label({ value: 'L8-I', style:{stretch: 'horizontal', margin: '2px 8px',} });
var l9Imagelink = ui.Label({ value: 'L9-I', style:{stretch: 'horizontal', margin: '2px 8px',} });

var primaryLinksPanel = ui.Panel({
    widgets: [s2Mosaiclink, s2Imagelink, l8Imagelink, l9Imagelink],
    layout: ui.Panel.Layout.flow('horizontal'),
    style: {stretch: 'horizontal', margin: '2px 0', shown: false}
});

var secondaryLinksPanel = ui.Panel({
    widgets: [l8Mosaiclink, l9Mosaiclink],
    layout: ui.Panel.Layout.flow('horizontal'),
    style: {stretch: 'horizontal', margin: '2px 0', shown: false}
});

panelGeneral.add(mainLabel);
panelGeneral.add(snmbLabel);
panelGeneral.add(titleLabel);
panelGeneral.add(assetLabel);
panelGeneral.add(assetId);
panelGeneral.add(panelFechas);
panelGeneral.add(modeCheckbox);
panelGeneral.add(s2RatioPanel);
panelGeneral.add(l89RatioPanel);
panelGeneral.add(runButton);
panelGeneral.add(selectorPanel);
panelGeneral.add(buscadorPanel);
panelGeneral.add(downloadPanel);
panelGeneral.add(primaryLinksPanel);
panelGeneral.add(secondaryLinksPanel);
panelGeneral.add(panel);

// === BUSQUEDA DE IMÁGENES
function searchImages() {
    Map.clear();
    alertas = ee.FeatureCollection(assetId.getValue());
    campo = assetField.getValue();
    nombresAreas = alertas.aggregate_array(campo);

    nombresAreas.evaluate(function (listaNombres) {
        if (!Array.isArray(listaNombres)) {
            print('Error: listaNombres no es un array JS:', listaNombres);
            return;
        }

        // Ordenar lista por últimos 4 dígitos
        listaOrdenada = listaNombres.slice().sort(function (a, b) {
            try {
                var aCodigo = parseInt(a.split('_')[2], 10);
                var bCodigo = parseInt(b.split('_')[2], 10);
                if (isNaN(aCodigo) || isNaN(bCodigo)) throw 'Código inválido';
                return aCodigo - bCodigo;
            } catch (e) {
                return 0;
            }
        });

        selector.items().reset(listaOrdenada);  
        selector.setValue(listaOrdenada[0]);
        buscador.setValue(listaOrdenada[0]);
    });

    selectorPanel.style().set('shown', true);
    buscadorPanel.style().set('shown', true);
    panel.style().set('shown', true);
    
}

ui.root.widgets().add(panelGeneral);
runButton.onClick(searchImages);
