// VISOR INTEGRAL PARA ANÁLISIS SATELITAL
// =====================================================================================
// JWS-GEE: Aplicativo GEE para visualizar imágenes satelitales compuestas (RGB, mosaicos, ratioRGB) 
// utilizando Sentinel-2, Landsat-8 y Landsat-9.
// Fecha desarrollo: 02/07/2025
// Última actualización: 31/10/2025
// Dev: Ing. Jimmy Wladimir Cabrera Soto
// Code: app_visor_satelital_v3.js
// =====================================================================================
// Cargar el shapefile de alertas tempranas
//var assetId = 'projects/snmbdevs/assets/alertas_sata_01-03_2025-09-30';

// === PARÁMETROS DE CONTROL ===
var FULL_MODE = false;
// ----------------------------------------------------- Expresiones para definir Ratios RGB
var ratiosSentinel = ['B12/B4', 'B8/B4', 'B11/B12'];
var ratiosLandsat8 = ['SR_B7/SR_B4', 'SR_B5/SR_B4', 'SR_B6/SR_B7'];
var ratiosLandsat9 = ['SR_B7/SR_B4', 'SR_B5/SR_B4', 'SR_B6/SR_B7'];

// === VARIABLES GLOBALES ===
var nombresAreas = null;
var listaOrdenada = null;
var alertas = null;
var campo = null;
var cloudySentinel = null; // Porcentaje de nubes en la Imagen Sentinel-2
var cloudyLandsat = null; // Porcentaje de nubes en la Imagen Landsat-8 / Lansdat-9
var fechaInicio = '2025-06-05';
var fechaFin = '2025-10-27';


var rgbvisSentinel = { min: 0, max: 3000, gamma: 0.5, bands: ['B4', 'B3', 'B2'] };
var rgbvisLandsat = { min: 0, max: 0.3, bands: ['SR_B4', 'SR_B3', 'SR_B2'] };
var rgbvisRatio = { min: 0, max: 2, bands: ['ratioR', 'ratioG', 'ratioB'] }

// === FUNCIONES DE ENMASCARAMIENTO ===
function maskS2(image) {
    var scl = image.select('SCL');
    var mask = scl.neq(3).and(scl.neq(8)).and(scl.neq(9)).and(scl.neq(10));
    return image.updateMask(mask);
}

function maskLandsat(image) {
    var cloudShadowBitMask = (1 << 3);
    var cloudsBitMask = (1 << 5);
    var qa = image.select('QA_PIXEL');
    var mask = qa.bitwiseAnd(cloudShadowBitMask).eq(0)
        .and(qa.bitwiseAnd(cloudsBitMask).eq(0));
    return image.updateMask(mask);
}

// === FUNCIONES DE PROCESAMIENTO ===
function procesarLandsat(collection, buffer) {
    return collection
        .filterBounds(buffer)
        .filterDate(fechaInicio, fechaFin)
        .map(maskLandsat)
        .map(function (img) {
            var scaled = img.select(['SR_B2', 'SR_B3', 'SR_B4', 'SR_B5', 'SR_B6', 'SR_B7'])
                .multiply(0.0000275).add(-0.2);
            return scaled.copyProperties(img, ['system:time_start']);
        });
}

function procesarSentinel(buffer) {
    return ee.ImageCollection('COPERNICUS/S2_SR')
        .filterBounds(buffer)
        .filterDate(fechaInicio, fechaFin)
        .map(maskS2)
        .select(['B2', 'B3', 'B4', 'B8', 'B8A', 'B11', 'B12']);
}

function ratio(image, expression, name) {
    var compose = expression.split('/');
    var ratio = image.expression('Banda_A/Banda_B', {
        'Banda_A': image.select(compose[0]),
        'Banda_B': image.select(compose[1]),
    }).rename(name);

    return ratio;
}

function ratioImage(image, R, G, B) {
    var ratioR = ratio(image, R, 'ratioR');
    var ratioG = ratio(image, G, 'ratioG');
    var ratioB = ratio(image, B, 'ratioB');

    var rgbImage = ratioR.addBands(ratioG).addBands(ratioB);

    return rgbImage;
}

function extraerFechasFormateadas(collection) {
    return collection.aggregate_array('system:time_start').map(function (ts) {
        return ee.Date(ts).format('YYYY-MM-dd');
    });
}

function getSentinelImage(buffer) {
    var collection = ee.ImageCollection("COPERNICUS/S2_SR")
        .filterBounds(buffer)
        .filterDate(fechaInicio, fechaFin)
        .filter(ee.Filter.lt('CLOUDY_PIXEL_PERCENTAGE', parseInt(cloudySentinel) ));

    var meanImage = collection.mean().clip(buffer);

    return meanImage
}

function getLandsatImage(collection, buffer) {
    var collectionLandsat = collection
        .filterBounds(buffer)
        .filterDate(fechaInicio, fechaFin)
        .filter(ee.Filter.lt('CLOUD_COVER', parseInt(cloudyLandsat) ));

    var count = collectionLandsat.size();

    var emptyImage = ee.Image.constant([255, 255, 255])
        .rename(['SR_B4', 'SR_B3', 'SR_B2'])
        .clip(buffer);

    var meanImage = ee.Image(ee.Algorithms.If(
        count.gt(0),
        collectionLandsat.select(['SR_B4', 'SR_B3', 'SR_B2'])
            .mean()
            .multiply(0.0000275)
            .add(-0.2)
            .clip(buffer),
        emptyImage
    ));

    return meanImage;
}

function agregarGrupo(fechaLista, nombreFuente) {
    fechaLista.evaluate(function (lista) {
        panel.add(ui.Label("📷 " + nombreFuente + " (" + lista.length + " imágenes)", {
            fontWeight: 'bold',
            margin: '10px 0 4px 0',
            color: '#1d5a7a'
        }));
        lista.forEach(function (fecha) {
            panel.add(ui.Label(fecha, { margin: '0 0 0 10px' }));
        });
    });
}

function exportImage(imageComposed, prefix, name, folder, scale, exportRegion) {
    Export.image.toDrive({
        image: imageComposed,
        description: prefix + name,
        folder: folder,
        scale: scale,
        region: exportRegion,
        maxPixels: 1e13,
        fileFormat: 'GeoTIFF'
    });
}

function getUrlImage (imageComposed, name, scale, bands, exportRegion) {
    var url = imageComposed.getDownloadURL({ 
        name: name, 
        bands: bands, 
        region: exportRegion, 
        scale: scale, 
        format: 'ZIPPED_GEO_TIFF' 
    });

    return url;
}

// === FUNCIÓN PARA ACTUALIZAR TODO ===
function actualizarVisualizacion(nombre) {
    FULL_MODE = modeCheckbox.getValue();
    fechaInicio = fechaInicioInput.getValue();
    fechaFin = fechaFinInput.getValue();
    cloudySentinel = nubosidadSelector.getValue();
    cloudyLandsat = nubosidadSelector.getValue();

    var feature = alertas.filter(ee.Filter.eq(campo, nombre)).first();
    var buffer = feature.geometry().buffer(parseInt(bufferSelector.getValue())*1000);

    Map.centerObject(buffer, 13);
    Map.clear();

    Map.addLayer(buffer, { color: 'gray' }, 'Área de Interés: ' + nombre);

    // Procesamiento Imágenes
    var sentinelImage = getSentinelImage(buffer);
    var landsat8Image = getLandsatImage(ee.ImageCollection('LANDSAT/LC08/C02/T1_L2'), buffer);
    var landsat9Image = getLandsatImage(ee.ImageCollection('LANDSAT/LC09/C02/T1_L2'), buffer);

    // Procesamiento Mosaicos
    var s2 = procesarSentinel(buffer);
    var l8 = procesarLandsat(ee.ImageCollection('LANDSAT/LC08/C02/T1_L2'), buffer);
    var l9 = procesarLandsat(ee.ImageCollection('LANDSAT/LC09/C02/T1_L2'), buffer);
    var s2Mosaic = s2.median().clip(buffer);
    
    var exportRegion = buffer.bounds();

    if ( FULL_MODE ) {
        var l8Mosaic = l8.median().clip(buffer);
        var l9Mosaic = l9.median().clip(buffer);

        ratiosSentinel = s2RatioInput.getValue();
        ratiosLandsat8 = l89RatioInput.getValue();
        ratiosLandsat9 = l89RatioInput.getValue();

        // Procesamiento Ratios
        var ratioImageSentinel = ratioImage(s2Mosaic, ratiosSentinel[0], ratiosSentinel[1], ratiosSentinel[2]);
        var ratioImageLansat8 = ratioImage(l8Mosaic, ratiosLandsat8[0], ratiosLandsat8[1], ratiosLandsat8[2]);
        var ratioImageLansat9 = ratioImage(l9Mosaic, ratiosLandsat9[0], ratiosLandsat9[1], ratiosLandsat9[2]);

        // Adición Layers
        Map.addLayer(ratioImageLansat9, rgbvisRatio, 'L9: Band Ratios RGB');
        Map.addLayer(ratioImageLansat8, rgbvisRatio, 'L8: Band Ratios RGB');
        Map.addLayer(ratioImageSentinel, rgbvisRatio, 'S2: Band Ratios RGB');

        Map.addLayer(l9Mosaic, rgbvisLandsat, 'Mosaic Landsat 9');
        Map.addLayer(l8Mosaic, rgbvisLandsat, 'Mosaic Landsat 8');

        exportImage(l8Mosaic, 'MosaicLandsat8_', nombre, 'Exportaciones_SATA', 30, exportRegion);
        exportImage(l9Mosaic, 'MosaicLandsat9_', nombre, 'Exportaciones_SATA', 30, exportRegion);

        var l8MosaicUrl = getUrlImage(l8Mosaic, 'MosaicLandsat8_' + nombre, 30, ['SR_B4', 'SR_B3', 'SR_B2'], exportRegion);
        var l9MosaicUrl = getUrlImage(l9Mosaic, 'MosaicLandsat9_' + nombre, 30, ['SR_B4', 'SR_B3', 'SR_B2'], exportRegion);

        l8Mosaiclink.setUrl(l8MosaicUrl);
        l9Mosaiclink.setUrl(l9MosaicUrl);
    }

    Map.addLayer(s2Mosaic, rgbvisSentinel, 'Mosaic Sentinel-2');
    Map.addLayer(landsat9Image, rgbvisLandsat, 'Landsat-9');
    Map.addLayer(landsat8Image, rgbvisLandsat, 'Landsat-8');
    Map.addLayer(sentinelImage, rgbvisSentinel, 'Sentinel-2');
    Map.addLayer(alertas, {color: 'yellow'}, 'Bloque de Alertas');
    Map.addLayer(feature.geometry(), { color: 'red' }, 'Alerta: ' + nombre);

    // Exportación de Imágenes
    exportImage(s2Mosaic, 'MosaicSentinel2_', nombre, 'Exportaciones_SATA', 10, exportRegion);
    exportImage(landsat9Image, 'ImageLandsat9_', nombre, 'Exportaciones_SATA', 30, exportRegion);
    exportImage(landsat8Image, 'ImageLandsat8_', nombre, 'Exportaciones_SATA', 30, exportRegion);
    exportImage(sentinelImage, 'ImageSentinel2_', nombre, 'Exportaciones_SATA', 10, exportRegion);
    
    var l9ImageUrl = getUrlImage(landsat9Image, 'ImageLandsat9_' + nombre, 30, ['SR_B4', 'SR_B3', 'SR_B2'], exportRegion);
    var l8ImageUrl = getUrlImage(landsat8Image, 'ImageLandsat8_' + nombre, 30, ['SR_B4', 'SR_B3', 'SR_B2'], exportRegion);
    var s2ImageUrl = getUrlImage(sentinelImage, 'ImageSentinel2_' + nombre, 10, ['B4','B3','B2'], exportRegion);
    var s2MosaicUrl = getUrlImage(s2Mosaic, 'MosaicSentinel2_' + nombre, 10, ['B4','B3','B2'], exportRegion);
    
    s2Mosaiclink.setUrl(s2MosaicUrl);
    l9Imagelink.setUrl(l9ImageUrl);
    l8Imagelink.setUrl(l8ImageUrl);
    s2Imagelink.setUrl(s2ImageUrl);

    downloadPanel.style().set('shown', true);
    primaryLinksPanel.style().set('shown', true);
    secondaryLinksPanel.style().set('shown', true);

    panel.clear();
    panel.add(ui.Label('🗓 Fechas de imágenes:', { fontWeight: 'bold', fontSize: '16px' }));

    agregarGrupo(extraerFechasFormateadas(s2), 'Sentinel-2');
    agregarGrupo(extraerFechasFormateadas(l8), 'Landsat 8');
    agregarGrupo(extraerFechasFormateadas(l9), 'Landsat 9');
}


// === PANEL UI ===
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
        actualizarVisualizacion(codigo);
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
