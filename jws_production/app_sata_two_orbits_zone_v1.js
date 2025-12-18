// JWS-GEE: Algoritmo para generar alertas tempranas satelitales por zonas considerando doble órbita (Sentinel-1).
// Fecha desarrollo: 08/06/2025
// Fecha actualización: 24/07/2025
// Dev: Ing. Jimmy Wladimir Cabrera Soto
// Code: app_sata_two_orbits_zone_v1.js
// Legacy: APP_SATA (Dev: Fabricio Garcés)
// =====================================================================================

/* ======================= PARÁMETROS DE ANÁLISIS ======================= */
// 1.- Imports
var zona = ee.FeatureCollection("projects/eesata-fabriciogarcesmaate/assets/cuadrantes_monitoreo_V2");
var bos2022 = ee.Image("users/ecuadorbfast/SATAASSEST/mascara_bosques_2022_1");
var man2022 = ee.Image("users/ecuadorbfast/SATAASSEST/manglar_2022");

///--- Selección de fechas de análisis ---///
var fecha1 = '2024-12-31';
var fecha2 = '2025-03-30';
var fecha3 = '2025-03-31';
var fecha4 = '2025-06-30';

// Zonas de análisis
var zonasAnalisis = ['30', '31'];

// Umbral de identificación
var RANGO = 12.5;

///--- Parámetros de visualización de las imágenes Sentinel 2 ---///
var rgbVis = {
    min: 0.11,
    max: 0.28,
    //gamma: 0.1,
    //contrast: 2.0,
    //contrast:2,
    bands: ['B4', 'B3', 'B2'],
};

/* ======================= FUNCIONES AUXILIARES ======================= */
function exportImage(imageComposed, name, folder, scale, exportRegion){
    Export.image.toDrive({
        image: imageComposed,
        description: name,
        folder: folder,
        scale: scale,
        region: exportRegion,
        maxPixels: 1e13,
        fileFormat: 'GeoTIFF'
    });
}

function exportTable(data_collection, name, folder, format){
    Export.table.toDrive({
        collection: data_collection,
        description: name,
        folder: folder,
        fileFormat: format,
        selectors: ['dn','date']
    });
}

/* ======================== FUNCIÓN PRINCIPAL ========================= */
function processZone() {
    var table = zona.filter(ee.Filter.inList('zona', zonasAnalisis));

    // ---- Selección de la colección de imágenes Sentinel 1 ---- //
    var imgVV = ee.ImageCollection('COPERNICUS/S1_GRD')
        .filterBounds(table)
        .filter(ee.Filter.listContains('transmitterReceiverPolarisation', 'VH'))
        .filter(ee.Filter.eq('instrumentMode', 'IW'))
        .select('VH')
        .map(function (image) {
            var edge = image.lt(-30.0);
            var maskedImage = image.mask().and(edge.not());
            return image.updateMask(maskedImage);
        });

    //--- Selección de la órbitas ---//
    var descVH = imgVV.filter(ee.Filter.eq('orbitProperties_pass', 'DESCENDING'));
    var ascVH = imgVV.filter(ee.Filter.eq('orbitProperties_pass', 'ASCENDING'));

    //--- Selección de las fechas de las imágenes Sentinel 1 --- //
    var date1VH = ee.Filter.date(fecha1, fecha2);
    var date2VH = ee.Filter.date(fecha3, fecha4);

    //--- Cálculo de la media de cada periodo --- //
    var desc_date1 = descVH.filter(date1VH).mean();
    var desc_date2 = descVH.filter(date2VH).mean();
    var asc_date1 = ascVH.filter(date1VH).mean();
    var asc_date2 = ascVH.filter(date2VH).mean();

    // SUMATORIA DE ÓRBITAS //
    var sum1 = (desc_date1.add(asc_date1)).divide(2).clip(table);
    var sum2 = (desc_date2.add(asc_date2)).divide(2).clip(table);

    // RAZÓN ENTRE LAS SUMATORIAS DE ÓRBITAS //
    var raz = sum2.divide(sum1);

    //--- Concatenar en una imagen de 3 bandas los periodos 1, 2 y la razón entre ellos ---//
    var S1_Change = ee.Image.cat(sum1, sum2, raz.multiply(-10));

    //--- Radio de suavizado de la imagen --- //
    var SMOOTHING_RADIUS = 10;

    //--- Aplicación de la media focal del radio de suavizado --- //
    var S1_Filter = S1_Change.focal_mean(SMOOTHING_RADIUS, 'circle', 'meters').clip(table);

    //--- Evitar los valores negativos --- //
    var asc_desc = (S1_Filter.multiply(-1));
    var dif = asc_desc.select('VH_2');

    //--- Rango para el enmascaramiento de los cambios ---//
    //var RANGO = 12.5; // ESTO ES LO IMPORTANTE <<<<==========================
    var dif_par = dif.gt(RANGO);

    //---- Extracción de las fechas para combinar con la máscara de cambios ----//
    //--- Agregar datos de Fecha y convertir colección a lista ---//
    var col_finaldate = descVH.filter(date2VH);
    var lista = col_finaldate.toList(col_finaldate.size());
    var size = lista.size().getInfo();

    ///--- Crear listas vacias para ir almacenando las imágenes y features con sus id ---///
    var lista_acum = ee.List([]);
    var lista_features = ee.List([]);

    ///--- Añadir banda con valor ordinal (id) aplicando un loop a lista ---///
    for (var i = 0; i < size; i++) {
        var image = ee.Image(lista.get(i)).toInt8();
        var id = ee.Image.constant(i + 1).toInt8();
        id = id.updateMask(image.select('VH').mask()).rename('dn');
        image = image.addBands(id);
        //Agregar imagen a la lista acumulativa
        lista_acum = lista_acum.add(image);
        //Generar Feature por cada image y acumularlos en una lista
        var feature = ee.Feature(null, { 'dn': (i + 1), 'date': image.date().format('yyyy-MM-dd'), 'image_id': image.get('system:index') });
        lista_features = lista_features.add(feature);
    }

    ///--- Convertir listas a colecciones de imágenes y features para facilitar ---///
    ///--- la exportación de resultados ---///
    var coll_images = ee.ImageCollection.fromImages(lista_acum);
    var coll_features = ee.FeatureCollection(lista_features);

    ///--- Cálcular media de la colección de imágenes y extraer la banda de fechas ---///
    var fin_mean_id = coll_images.mean().select('dn').toInt();

    ///--- Crear imagen de cambios con valor de id fechas ---///
    var cambios = fin_mean_id.updateMask(dif_par).clip(table);

    ///--- Cortar con la máscara de bosques 2022 ---///
    var bosque2022 = bos2022.clip(table);

    ///--- Multiplicar los cambios detectados por la máscara de bosques ---///
    var cambiosbosques = (cambios.multiply(bosque2022).int32());

    //TEMPORAL --------------------------------------------------
    // Obtener el valor máximo de cada banda en la región
    var maxValues = cambiosbosques.reduceRegion({
        reducer: ee.Reducer.max(),
        geometry: table,
        scale: 10,
        maxPixels: 1e9,
        bestEffort: true
    });

    // Imprimir los valores máximos en la consola
    print('Valores máximos por banda: ', maxValues);
    //TEMPORAL --------------------------------------------------

    ///--- Cortar la máscara de manglares 2022 ---///
    var manglar2022 = man2022.clip(table);

    ///--- Multiplicar los cambios detectados por la máscara de manglares ---///
    var cambiosmanglares = (cambios.multiply(manglar2022).int32());

    ////---- Selección de la colección de imágenes Sentinel 2 para la comprobación de resultados ----////
    ///--- Función de enmascaramiento de las nubes ---///
    // Los Bits 10 y 11 son nubes y cirros, respectivamente ---///
    var cloudBitMask = 1 << 10;
    var cirrusBitMask = 1 << 11;
    // Ambas señas deben ser configuradas como cero, indicando condiciones libres de nubes ---///
    function maskS2clouds(image) {
        //var qa = image.select('QA60');
        var qa = image.select('MSK_CLDPRB');
        var mask = qa.bitwiseAnd(cloudBitMask).eq(0)
            .and(qa.bitwiseAnd(cirrusBitMask).eq(0));
        return image.updateMask(mask).divide(10000);
    }

    ///--- Selección de las fechas de las imágenes Sentinel 2 y el porcentaje de nubes de la escena ---///
    ///--- Periodo 1 ---///
    var dataset1 = ee.ImageCollection('COPERNICUS/S2_SR')
        .filterDate(fecha1, fecha2)
        // Pre-filter to get less cloudy granules.
        .filter(ee.Filter.lt('CLOUDY_PIXEL_PERCENTAGE', 20))
        .map(maskS2clouds);

    ///--- Periodo 2 ---///
    var dataset2 = ee.ImageCollection('COPERNICUS/S2_SR')
        .filterDate(fecha3, fecha4)
        // Pre-filter to get less cloudy granules.
        .filter(ee.Filter.lt('CLOUDY_PIXEL_PERCENTAGE', 20))
        .map(maskS2clouds);

    ///--- Selección de bandas ---///
    var sentinel1 = dataset1.mean()
        .select('B2', 'B3', 'B4', 'B8', 'B11')
        .clip(table);

    var sentinel2 = dataset2.mean()
        .select('B2', 'B3', 'B4', 'B8', 'B11')
        .clip(table);

    /* ============================= LAYERS =============================== */
    Map.addLayer(table, {}, 'Cuadrantes: ' + zonasAnalisis)

    ///--- Visualización de las capas ---///
    Map.addLayer(sum1, { min: -25, max: 5 }, 'Sentinel1 periodo 1', 0);
    Map.addLayer(sum2, { min: -25, max: 5 }, 'Sentinel1 periodo 2', 0);
    Map.addLayer(asc_desc, { min: -3, max: 20, gamma: 0.4, contrast: 10 }, 'RGB S1', 1);
    Map.addLayer(sentinel1, rgbVis, 'RGB S2 periodo 1', 0);
    Map.addLayer(sentinel2, rgbVis, 'RGB S2 periodo 2', 0);

    ///--- Visualizar la máscara de cambios con el valor DN ---///
    Map.addLayer(cambios, { palette: "red" }, 'Cambios_detectados_DN', 0);

    ///--- Visualizar la máscara de bosques y manglares junto con los cambios seleccionados con el valor DN ---///
    Map.addLayer(bosque2022, { min: 0.0, max: 1.0, palette: ['229512'] }, 'Máscara bosques 2022');
    Map.addLayer(manglar2022, { min: 0.0, max: 1.0, palette: ['13ada3'] }, 'Máscara manglares 2022');
    Map.addLayer(cambiosbosques, { palette: "yellow" }, 'Cambios en bosque 2022');
    Map.addLayer(cambiosmanglares, { palette: "f500e4" }, 'Cambios en manglares 2022');

    /* ======================= EXPORTACIÓN DE DATOS ======================= */
    var nameTableFechas = 'fechas_' + fecha4;
    var nameCambiosBosques = 'cambios_bosque_' + fecha4;
    var nameCambiosManglar = 'cambios_manglar_' + fecha4;
    var nameS2Period1 = 'Sentinel2_periodo_1' ;
    var nameS2Period2 = 'Sentinel2_periodo_2';
    var nameS1RGB = 'Sentinel1_RGB';

    exportTable(coll_features, nameTableFechas, 'ALERTAS_SATA', 'CSV');
    exportImage(cambiosbosques, nameCambiosBosques, 'ALERTAS_SATA', 10, table);
    exportImage(cambiosmanglares, nameCambiosManglar, 'ALERTAS_SATA', 10, table);
    //exportImage(sentinel1, nameS2Period1,'IMSAT_SATA', 10, table);
    //exportImage(sentinel2, nameS2Period2,'IMSAT_SATA', 10, table);
    //exportImage(asc_desc, nameS1RGB,'IMSAT_SATA', 10, table);
}

// Procesamiento de Zona
processZone();
