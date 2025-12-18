// JWS-GEE: Algoritmo para generar alertas tempranas de todo el ecuador (procesamiento por zonas) considerando una órbita (Sentinel-1).
// Fecha desarrollo: 21/10/2025
// Fecha actualización: 21/10/2025
// Dev: Ing. Jimmy Wladimir Cabrera Soto
// Code: app_sata_one_orbit_v2.js
// Legacy: app_sata_one_orbit_v1.js
// =====================================================================================

/* ======================= PARÁMETROS DE ANÁLISIS ======================= */
// 1.- Imports
var zona = ee.FeatureCollection("users/ecuadorbfast/SATAASSEST/cuadrantes_monitoreo_V2");
var bos2022 = ee.Image("users/ecuadorbfast/SATAASSEST/mascara_bosques_2022_1");
var man2022 = ee.Image("users/ecuadorbfast/SATAASSEST/manglar_2022");

var ZONES = ['33', '34'];
var ORBIT = 'DESCENDING'; //DESCENDING - ASCENDING

// Ambiente de ejecución
var PRODUCTION_MODE = true;

var SINGLE_RANGE = 12.5;
var SMOOTHING_RADIUS = 10;
var EXPORT_FOLDER = 'ALERTAS_SATA_SEPTIEMBRE';

///--- Selección de fechas de análisis ---///
var fecha1 = '2025-03-29';
var fecha2 = '2025-06-29';
var fecha3 = '2025-06-30';
var fecha4 = '2025-09-30';

// Zonas
var nam = ZONES[0] + '-' + ZONES[ZONES.length - 1];
var table = zona.filter(ee.Filter.inList('zona', ZONES));

///--- Parámetros de visualización de las imágenes Sentinel 2 ---///
var rgbVis = {
  min: 0.11,
  max: 0.28,
  bands: ['B4', 'B3', 'B2'],
};

/* ======================= FUNCIONES AUXILIARES ======================= */
function exportImage(imageComposed, name, folder, scale, exportRegion) {
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

function exportTable(data_collection, name, folder, format) {
  Export.table.toDrive({
    collection: data_collection,
    description: name,
    folder: folder,
    fileFormat: format,
    selectors: ['dn', 'date']
  });
}

/* ======================== FUNCIÓN PRINCIPAL ========================= */
function processSingle() {
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

  ///--- Selección de la órbita ---///
  var descVH = imgVV.filter(ee.Filter.eq('orbitProperties_pass', ORBIT));

  ///--- Selección de las fechas de las imágenes Sentinel 1 ---///
  var date1VH = ee.Filter.date(fecha1, fecha2);
  var date2VH = ee.Filter.date(fecha3, fecha4);

  ///--- Cálculo de la media de cada periodo ---///
  var desc_date1 = descVH.filter(date1VH).mean();
  var desc_date2 = descVH.filter(date2VH).mean();

  ///--- Razón entre el periodo 2 y el periodo 1 ---///
  var raz_descVH = desc_date2.divide(desc_date1);

  ///--- Concatenar en una imagen de 3 bandas los periodos 1, 2 y la razón entre ellos ---///
  var descVHChange = ee.Image.cat(
    desc_date1,
    desc_date2,
    raz_descVH.multiply(-10));

  ///--- Aplicación de la media focal del radio de suavizado ---///
  var descVHClip = descVHChange.focal_mean(SMOOTHING_RADIUS, 'circle', 'meters').clip(table);

  ///--- Evitar los valores negativos ---///
  var asc_desc = (descVHClip.multiply(-1));
  var dif = asc_desc.select('VH_2');

  ///--- Rango para el enmascaramiento de los cambios ---///
  var dif_par = dif.gt(SINGLE_RANGE);

  ////---- Extracción de las fechas para combinar con la máscara de cambios ----////
  ///--- Agregar datos de Fecha y convertir colección a lista ---///
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
  var cambios = fin_mean_id.updateMask(dif_par);

  ///--- Cargar la máscara de bosques 2020 ---///
  var bosque2022 = bos2022.clip(table);

  ///--- Multiplicar los cambios detectados por la máscara de bosques ---///
  var cambiosbosques = (cambios.multiply(bosque2022).int32());

  ///--- Cargar la máscara de manglares 2022 ---///
  var manglar2022 = man2022.clip(table);

  ///--- Multiplicar los cambios detectados por la máscara de manglares ---///
  var cambiosmanglares = (cambios.multiply(manglar2022).int32());

  /* ============================= LAYERS =============================== */
  Map.addLayer(desc_date1, { min: -25, max: 5 }, 'Sentinel-1 Periodo 1', 0);
  Map.addLayer(desc_date2, { min: -25, max: 5 }, 'Sentinel-1 Periodo 2', 0);
  Map.addLayer(asc_desc, { min: -3, max: 20, gamma: 0.4, contrast: 10 }, 'RGB Sentinel 1', 1);

  ///--- Visualizar la máscara de cambios con el valor DN ---///
  Map.addLayer(cambios, { palette: 'red' }, 'Cambios detectados DN');

  ///--- Visualizar la máscara de bosques y los cambios seleccionados con el valor DN ---///
  Map.addLayer(cambiosbosques, { palette: "yellow" }, 'Cambios en bosque 2020', 0);
  Map.addLayer(cambiosmanglares, { palette: "f500e4" }, 'Cambios en manglares 2022', 0);

  Map.addLayer(bos2022,{min:0.0, max:1.0,palette:['229512']},'Máscara bosques 2022', 0);
  Map.addLayer(man2022,{min:0.0, max:1.0,palette:['13ada3']},'Máscara manglares 2022', 0);

  /* ======================= EXPORTACIÓN DE DATOS ======================= */
  if (PRODUCTION_MODE) {
    var nameTableFechas = 'fechas_' + nam + '_' + fecha4;
    var nameCambiosBosques = 'cambios_bosque_' + nam + '_' + fecha4;
    var nameCambiosManglar = 'cambios_manglar_' + nam + '_' + fecha4;

    exportTable(coll_features, nameTableFechas, EXPORT_FOLDER, 'CSV');
    exportImage(cambiosbosques, nameCambiosBosques, EXPORT_FOLDER, 10, table);
    exportImage(cambiosmanglares, nameCambiosManglar, EXPORT_FOLDER, 10, table);
  }
}

processSingle();