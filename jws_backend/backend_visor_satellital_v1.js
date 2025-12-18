// VISOR INTEGRAL PARA ANÁLISIS SATELITAL
// =====================================================================================
// JWS-GEE: Aplicativo GEE para visualizar imágenes satelitales compuestas (RGB, mosaicos, ratioRGB) 
// utilizando Sentinel-2, Landsat-8 y Landsat-9.
// Fecha desarrollo: 02/07/2025
// Última actualización: 05/11/2025
// Dev: Ing. Jimmy Wladimir Cabrera Soto
// Code: backend_visor_satelital_v1.js
// Reference code: app_visor_satelital_v3.js (31/10/2025)
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
//var nombresAreas = null;
//var listaOrdenada = null;
//var alertas = null;
//var campo = null;
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

function agregarGrupo(fechaLista, nombreFuente, panel) {
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
function actualizarVisualizacion(nombre, modeCheckbox, fechaInicioInput, fechaFinInput, nubosidadSelector, alertas, campo, bufferSelector, s2RatioInput, l89RatioInput, l8Mosaiclink, l9Mosaiclink, s2Mosaiclink, l8Imagelink, l9Imagelink, s2Imagelink, downloadPanel, primaryLinksPanel, secondaryLinksPanel, panel) {
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

    agregarGrupo(extraerFechasFormateadas(s2), 'Sentinel-2', panel);
    agregarGrupo(extraerFechasFormateadas(l8), 'Landsat 8', panel);
    agregarGrupo(extraerFechasFormateadas(l9), 'Landsat 9', panel);
}

exports.actualizarVisualizacion = actualizarVisualizacion;
