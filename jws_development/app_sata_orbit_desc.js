// JWS-GEE: Algoritmo para generar alertas tempranas de todo el ecuador (procesamiento por zonas) considerando la orbita descendente (Sentinel-1).
// Fecha desarrollo: 08/05/2025
// Dev: Ing. Jimmy Wladimir Cabrera Soto
// Code: app_sata_orbit_desc.js
// Legacy: APP_SATA (Dev: Fabricio Garcés)
// =====================================================================================
//La siguiente seccion es para identificar el espacio demuestreo
var zona = ee.FeatureCollection("projects/eesata-fabriciogarcesmaate/assets/cuadrantes_monitoreo_V2");

///--- Selección de fechas de análisis ---///
var fecha1 = '2024-10-01';
var fecha2 = '2024-12-31';
var fecha3 = '2025-01-01';
var fecha4 = '2025-04-30';

// Zonificación
var processPerZone = {
  "ZP01": { zonas: ['01', '02', '03'], name: '01-03'},
  "ZP02": { zonas: ['04', '05'], name: '04-05'},
  "ZP03": { zonas: ['06', '07'], name: '06-07'},
  "ZP04": { zonas: ['08', '09', '10'], name: '08-10'},
  "ZP05": { zonas: ['11', '12', '13'], name: '11-13'},
  "ZP06": { zonas: ['14', '15'], name: '14-15'},
  "ZP07": { zonas: ['16', '17'], name: '16-17'},
  "ZP08": { zonas: ['18', '19'], name: '18-19'},
  "ZP09": { zonas: ['20', '21', '22'], name: '20-22'},
  "ZP10": { zonas: ['23', '24'], name: '23-24'},
  "ZP11": { zonas: ['25', '26'], name: '25-26'},
  "ZP12": { zonas: ['27', '28', '29'], name: '27-29'},
  "ZP13": { zonas: ['30', '31', '32'], name: '30-32'},
  "ZP14": { zonas: ['33', '34'], name: '33-34'},
  "ZP15": { zonas: ['35', '36'], name: '35-36'},
  "ZP16": { zonas: ['37', '38', '39'], name: '37-39'},
  "ZP17": { zonas: ['40', '41'], name: '40-41'},
  "ZP18": { zonas: ['42', '43'], name: '42-43'},
  "ZP19": { zonas: ['44', '45'], name: '44-45'},
  "ZP20": { zonas: ['46', '47', '48'], name: '46-48'},
  "ZP21": { zonas: ['49', '50', '51'], name: '49-51'},
  "ZP22": { zonas: ['52', '53'], name: '52-53'},
  "ZP23": { zonas: ['54', '55', '56'], name: '54-56'},
  "ZP24": { zonas: ['57', '58'], name: '57-58'},
  "ZP25": { zonas: ['59', '60', '61'], name: '59-61'},
  "ZP26": { zonas: ['62', '63'], name: '62-63'},
  "ZP27": { zonas: ['64', '65'], name: '64-65'},
  "ZP28": { zonas: ['66', '67', '68', '69', '70'], name: '66-70'}
}

// Función que procesa por lotes
function processInBatches(data, batchSize) {
  var keys = Object.keys(data);
  
  for (var i = 0; i < keys.length; i += batchSize) { // var i = 0; i < keys.length; i += batchSize
      var batch = keys.slice(i, i + batchSize);
      
      batch.forEach(function(key) {
            print('  Procesando zona:', key);

            var table = zona.filter(ee.Filter.inList('zona', data[key].zonas));
            Map.addLayer(table,{},'Cuadrante: '+ data[key].name)

            // PROCESAMIENTO INICIO
            /////----- Código para la detección de cambios sobre la cobertura de la tierra -----/////
            /////----- aplicado para posibles afectaciones sobre la cobertura de bosques naturales -----/////
            /////----- con el uso de imágenes Sentinel 1 -----/////

            ////---- Selección de la colección de imágenes Sentinel 1 ----////
            var imgVV = ee.ImageCollection('COPERNICUS/S1_GRD')
            .filterBounds(table)
            .filter(ee.Filter.listContains('transmitterReceiverPolarisation', 'VH'))
            .filter(ee.Filter.eq('instrumentMode', 'IW'))
            .select('VH')
            .map(function(image) {
            var edge = image.lt(-30.0);
            var maskedImage = image.mask().and(edge.not());
            return image.updateMask(maskedImage);
            });

            ///--- Selección de la órbita descendente ---///
            var descVH = imgVV.filter(ee.Filter.eq('orbitProperties_pass', 'DESCENDING'));

            ///--- Selección de las fechas de las imágenes Sentinel 1 ---///
            var date1VH = ee.Filter.date(fecha1, fecha2);
            var date2VH = ee.Filter.date(fecha3, fecha4);

            ///--- Cálculo de la media de cada periodo ---///
            var desc_date1 = descVH.filter(date1VH).mean();
            var desc_date2 = descVH.filter(date2VH).mean();

            ///--- Definición de las variables de las fechas ---///
            var fecha = imgVV.first()
            var date = fecha.date()

            ///--- Concatenar las imágenes de los dos periodos ---///
            var cat_desc = ee.Image.cat(
            desc_date1,
            desc_date2);
            
            ///--- Razón entre el periodo 2 y el periodo 1 ---///
            var raz_descVH = desc_date2.divide(desc_date1);

            ///--- Concatenar en una imagen de 3 bandas los periodos 1, 2 y la razón entre ellos ---///
            var descVHChange = ee.Image.cat(
                    desc_date1,
                    desc_date2,
                    raz_descVH.multiply(-10));

            ///--- Radio de suavizado de la imagen ---///
            var SMOOTHING_RADIUS = 10;

            ///--- Aplicación de la media focal del radio de suavizado ---///
            var descVHClip = descVHChange.focal_mean(SMOOTHING_RADIUS, 'circle', 'meters').clip(table);

            ///--- Evitar los valores negativos ---///
            var asc_desc = (descVHClip.multiply(-1));
            var dif = asc_desc.select('VH_2');

            ///--- Rango para el enmascaramiento de los cambios ---///
            var RANGO = 12.5;
            var dif_par = dif.gt(RANGO);

            ///--- Visualización de las capas ---///
            Map.addLayer(desc_date1, {min: -25, max: 5}, 'Órbita descendente Periodo 1 (Cuad: '+ data[key].name + ')', 0);
            Map.addLayer(desc_date2, {min: -25, max: 5}, 'Órbita descendente Periodo 2 (Cuad: '+ data[key].name + ')', 0);
            Map.addLayer(asc_desc, {min: -3, max: 20, gamma: 0.4, contrast:10}, 'RGB Sentinel 1 Descendente (Cuad: '+ data[key].name + ')', 1);

            ////---- Extracción de las fechas para combinar con la máscara de cambios ----////
            ///--- Agregar datos de Fecha y convertir colección a lista ---///
            var col_finaldate = descVH.filter(date2VH);
            var lista = col_finaldate.toList(col_finaldate.size());
            var size = lista.size().getInfo();

            ///--- Crear listas vacias para ir almacenando las imágenes y features con sus id ---///
            var lista_acum=ee.List([]);
            var lista_features = ee.List([]);

            ///--- Añadir banda con valor ordinal (id) aplicando un loop a lista ---///
            for(var i = 0; i < size; i++){
                var image = ee.Image(lista.get(i)).toInt8();
                var id = ee.Image.constant(i+1).toInt8();
                id = id.updateMask(image.select('VH').mask()).rename('dn');
                image = image.addBands(id);
                //Agregar imagen a la lista acumulativa
                lista_acum=lista_acum.add(image);
                //Generar Feature por cada image y acumularlos en una lista
                var feature = ee.Feature(null, {'dn': (i+1),'date': image.date().format('yyyy-MM-dd'), 'image_id': image.get('system:index')});
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

            ///--- Visualizar la máscara de cambios con el valor DN ---///
            Map.addLayer(cambios, {palette:"red"}, 'Cambios_fecha_DN_VH_Desc_XXXX');

            ///--- Cargar la máscara de bosques 2022 ---///
            var bos2022 = ee.Image("users/ecuadorbfast/SATAASSEST/mascara_bosques_2022_1");
            var bosque2022 = bos2022.clip(table);

            ///--- Multiplicar los cambios detectados por la máscara de bosques ---///
            var cambiosbosques = (cambios.multiply(bosque2022).int32());

            ///--- Cargar la máscara de manglares 2022 ---///
            var man2022 = ee.Image("users/ecuadorbfast/SATAASSEST/manglar_2022");
            var manglar2022 = man2022.clip(table);

            ///--- Multiplicar los cambios detectados por la máscara de manglares ---///
            var cambiosmanglares = (cambios.multiply(manglar2022).int32());

            ///--- Visualizar la máscara de bosques y manglares junto con los cambios seleccionados con el valor DN ---///
            Map.addLayer(bosque2022,{min:0.0, max:1.0,palette:['229512']},'Máscara bosques 2022 (Cuad: '+ data[key].name + ')');
            Map.addLayer(manglar2022,{min:0.0, max:1.0,palette:['13ada3']},'Máscara manglares 2022 (Cuad: '+ data[key].name + ')');
            Map.addLayer(cambiosbosques,{palette:"yellow"},'Cambios en bosque 2022 (Cuad: '+ data[key].name + ')');
            Map.addLayer(cambiosmanglares,{palette:"f500e4"},'Cambios en manglares 2022 (Cuad: '+ data[key].name + ')');

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
                            .select('B2','B3','B4','B8','B11')
                            .clip(table);
            var sentinel2 = dataset2.mean()
                            .select('B2','B3','B4','B8','B11')
                            .clip(table);

            ///--- Parámetros de visualización de las imágenes Sentinel 2 ---///
            var rgbVis = {
            min: 0.11,
            max: 0.28,
            //gamma: 0.1,
            //contrast: 2.0,
            //contrast:2,
            bands: ['B4', 'B3', 'B2'],
            };

            ///--- Visualización de las imágenes Sentinel 2 ---///
            Map.addLayer(sentinel1, rgbVis, 'RGB periodo 1 (Cuad: '+ data[key].name + ')',0);
            Map.addLayer(sentinel2, rgbVis, 'RGB periodo 2 (Cuad: '+ data[key].name + ')',0);

            //Exportar la tabla de fechas como CSV
            Export.table.toDrive({
                collection: coll_features,
                description: 'fechas_desc_'+ data[key].name + '_' +fecha4,
                fileFormat: "CSV",
                selectors: ['dn','date']
            });

            // Exportar las imágenes Sentinel 2.
            /*Export.image.toDrive({
                image: sentinel1,
                description: 'Sentinel2_periodo_1_cuad'+ data[key].name,
                scale: 10,
                region: table,
                fileFormat: 'GeoTIFF',
                maxPixels: 1E13
            });
            
            Export.image.toDrive({
                image: sentinel2,
                description: 'Sentinel2_periodo_2_cuad'+ data[key].name,
                scale: 10,
                region: table,
                fileFormat: 'GeoTIFF',
                maxPixels: 1E13
            });*/

            // Exportar el ráster con las zonas de cambio y valor DN.
            Export.image.toDrive({
                image: cambiosbosques,
                description: 'cambios_bosques_VH_desc_'+ data[key].name + '_' +fecha4,
                scale: 10,
                region: table,
                fileFormat: 'GeoTIFF',
                maxPixels: 1E13
            });
            
            // Exportar el ráster con las zonas de cambio y valor DN.
            Export.image.toDrive({
                image: cambiosmanglares,
                description: 'cambios_manglares_VH_desc_'+ data[key].name + '_' +fecha4,
                scale: 10,
                region: table,
                fileFormat: 'GeoTIFF',
                maxPixels: 1E13,
            });

            ///--- Exportar la imagen RGB de Sentinel 1 a Google Drive ---///
            /*Export.image.toDrive({
                image: asc_desc,
                description: 'RGB_Sentinel_1_Descendente',
                scale: 10,
                maxPixels:1e13,
                region: table,
            });*/

            // PROCESAMIENTO FIN

            // Descarga directa (efectivo para exportar por Procesos listados: ZP01, ZP02, etc)
            /*var zona4326 = table.geometry().transform('EPSG:4326', 1);
            var downloadUrl = cambiosbosques.clip(table).getDownloadURL({
                name: 'Cambios bosque',
                region: zona4326,
                scale: 10,
                crs: 'EPSG:4326',
                format: 'GEO_TIFF'
            });

            print('Descargar Diferencia MMRI:', downloadUrl);*/
    });
  }
}

// Procesamiento por Lotes
processInBatches(processPerZone, 1);