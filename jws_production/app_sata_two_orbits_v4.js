// JWS-GEE: Algoritmo para generar alertas tempranas de todo el ecuador (procesamiento nacional) considerando doble órbita (Sentinel-1).
// Fecha desarrollo: 22/10/2025
// Fecha actualización: 22/10/2025
// Dev: Ing. Jimmy Wladimir Cabrera Soto
// Code: app_sata_two_orbits_v4.js
// Legacy: app_sata_two_orbits_v3.js
// =====================================================================================
/* ======================= PARÁMETROS DE ANÁLISIS ======================= */
// 1.- Imports
var zona = ee.FeatureCollection("users/ecuadorbfast/SATAASSEST/cuadrantes_monitoreo_V2");
var bos2022 = ee.Image("users/ecuadorbfast/SATAASSEST/mascara_bosques_2022_1");
var man2022 = ee.Image("users/ecuadorbfast/SATAASSEST/manglar_2022");

// Ambiente de ejecución
//var PRODUCTION_MODE = true;
var PROCESS_ZONE = 2; // Range 1 to 28
var SINGLE_RANGE = 12.5;
var SMOOTHING_RADIUS = 10;
var EXPORT_FOLDER = 'GEE_ALERTASSATA_SEP25_';

///--- Selección de fechas de análisis ---///
var fecha1 = '2025-03-29';
var fecha2 = '2025-06-29';
var fecha3 = '2025-06-30';
var fecha4 = '2025-09-30';

var PROCESS_ZONES = {
    "ZP01": { zonas: ['01', '02', '03'], name: '01-03', rango: 12.1, manglar: true},
    "ZP02": { zonas: ['04', '05'], name: '04-05', rango: 12.7, manglar: true },
    "ZP03": { zonas: ['06', '07'], name: '06-07', rango: 12.1, manglar: false },
    "ZP04": { zonas: ['08', '09', '10'], name: '08-10', rango: 11.9, manglar: false },
    "ZP05": { zonas: ['11', '12', '13'], name: '11-13', rango: 12.1, manglar: true },
    "ZP06": { zonas: ['14', '15'], name: '14-15', rango: 12.5, manglar: false },
    "ZP07": { zonas: ['16', '17'], name: '16-17', rango: 12.9, manglar: false },
    "ZP08": { zonas: ['18', '19'], name: '18-19', rango: 12.7, manglar: false },
    "ZP09": { zonas: ['20', '21', '22'], name: '20-22', rango: 13.5, manglar: true },
    "ZP10": { zonas: ['23', '24'], name: '23-24', rango: 12.5, manglar: false },
    "ZP11": { zonas: ['25', '26'], name: '25-26', rango: 12.7, manglar: false },
    "ZP12": { zonas: ['27', '28', '29'], name: '27-29', rango: 12.7 },
    "ZP13": { zonas: ['30', '31', '32'], name: '30-32', rango: 14.1 },
    "ZP14": { zonas: ['33', '34'], name: '33-34', rango: 11.9, manglar: false },
    "ZP15": { zonas: ['35', '36'], name: '35-36', rango: 12.3, manglar: false },
    "ZP16": { zonas: ['37', '38', '39'], name: '37-39', rango: 12.1, manglar: false },
    "ZP17": { zonas: ['40', '41'], name: '40-41', rango: 13.7, manglar: true },
    "ZP18": { zonas: ['42', '43'], name: '42-43', rango: 13.5, manglar: true },
    "ZP19": { zonas: ['44', '45'], name: '44-45', rango: 12.3, manglar: false },
    "ZP20": { zonas: ['46', '47', '48'], name: '46-48', rango: 12.7, manglar: false },
    "ZP21": { zonas: ['49', '50', '51'], name: '49-51', rango: 13.1, manglar: true },
    "ZP22": { zonas: ['52', '53'], name: '52-53', rango: 12.1, manglar: false },
    "ZP23": { zonas: ['54', '55', '56'], name: '54-56', rango: 12.7, manglar: false },
    "ZP24": { zonas: ['57', '58'], name: '57-58', rango: 12.1, manglar: true },
    "ZP25": { zonas: ['59', '60', '61'], name: '59-61', rango: 12.3, manglar: false },
    "ZP26": { zonas: ['62', '63'], name: '62-63', rango: 13.3, manglar: false },
    "ZP27": { zonas: ['64', '65'], name: '64-65', rango: 12.1, manglar: false },
    "ZP28": { zonas: ['66', '67', '68', '69', '70'], name: '66-70', rango: 13.3, manglar: false }
}

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
function processInBatches() {
    Map.clear();
    var batchSize = 1;
    var data = PROCESS_ZONES;
    var keys = Object.keys(data);

    var PRODUCTION_MODE = productionCheckbox.getValue() ? true : false;

    // ---- Selección de la colección de imágenes Sentinel 1 ---- //
    var imgVV = ee.ImageCollection('COPERNICUS/S1_GRD')
        .filterBounds(zona)
        .filter(ee.Filter.listContains('transmitterReceiverPolarisation', 'VH'))
        .filter(ee.Filter.eq('instrumentMode', 'IW'))
        .select('VH')
        .map(function (image) {
            var edge = image.lt(-30.0);
            var maskedImage = image.mask().and(edge.not());
            return image.updateMask(maskedImage);
        });

    ///--- Selección de la órbita ---///
    var descVH = imgVV.filter(ee.Filter.eq('orbitProperties_pass', 'DESCENDING'));
    var ascVH = imgVV.filter(ee.Filter.eq('orbitProperties_pass', 'ASCENDING'));

    ///--- Selección de las fechas de las imágenes Sentinel 1 ---///
    var date1VH = ee.Filter.date(fecha1, fecha2);
    var date2VH = ee.Filter.date(fecha3, fecha4);

    ///--- Cálculo de la media de cada periodo ---///
    var desc_date1 = descVH.filter(date1VH).mean();
    var desc_date2 = descVH.filter(date2VH).mean();
    var asc_date1 = ascVH.filter(date1VH).mean();
    var asc_date2 = ascVH.filter(date2VH).mean();

    // SUMATORIA DE ÓRBITAS //
    var sum1 = (desc_date1.add(asc_date1)).divide(2).clip(zona);
    var sum2 = (desc_date2.add(asc_date2)).divide(2).clip(zona);

    // RAZÓN ENTRE LAS SUMATORIAS DE ÓRBITAS //
    var raz = sum2.divide(sum1);

    //--- Concatenar en una imagen de 3 bandas los periodos 1, 2 y la razón entre ellos ---//
    var S1_Change = ee.Image.cat(sum1, sum2, raz.multiply(-10));

    //Map.addLayer(S1_Change, {}, 'S1_Change', 0)

    if (PRODUCTION_MODE) { PROCESS_ZONE = keys.length; }

    for (var i = 0; i < PROCESS_ZONE; i += batchSize) {
        var batch = keys.slice(i, i + batchSize);

        batch.forEach(function(key) {
            print('Procesando zona:', key);
            var table = zona.filter(ee.Filter.inList('zona', data[key].zonas));

            //--- Aplicación de la media focal del radio de suavizado --- //
            var S1_Filter = S1_Change.focal_mean(SMOOTHING_RADIUS, 'circle', 'meters').clip(table);

            //--- Evitar los valores negativos --- //
            var asc_desc = (S1_Filter.multiply(-1));
            var dif = asc_desc.select('VH_2');

            //--- Rango para el enmascaramiento de los cambios ---//
            var rangeMode = rangeCheckbox.getValue() ? data[key].rango : SINGLE_RANGE;
            print('Rango empleado: ', rangeMode);

            var dif_par = dif.gt(rangeMode);

            //---- Extracción de las fechas para combinar con la máscara de cambios ----//
            //--- Agregar datos de Fecha y convertir colección a lista ---//
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

            ///--- Cortar con la máscara de bosques 2022 ---///
            var bosque2022 = bos2022.clip(table);
            
            ///--- Multiplicar los cambios detectados por la máscara de bosques ---///
            var cambiosbosques = (cambios.multiply(bosque2022).int32());
    
            ///--- Cortar la máscara de manglares 2022 ---///
            var manglar2022 = man2022.clip(table);

            ///--- Multiplicar los cambios detectados por la máscara de manglares ---///
            var cambiosmanglares = (cambios.multiply(manglar2022).int32());

            /* ============================= LAYERS =============================== */
            Map.addLayer(table,{},'Cuadrante: '+ data[key].name)

            Map.addLayer(sum1.clip(table), {min: -25, max: 5}, 'Sentinel1 periodo 1 (Cuad: '+ data[key].name + ')', 0);
            Map.addLayer(sum2.clip(table), {min: -25, max: 5}, 'Sentinel1 periodo 2 (Cuad: '+ data[key].name + ')', 0);
            Map.addLayer(asc_desc, {min: -3, max: 20, gamma: 0.4, contrast:10}, 'Diferencias S1 (Cuad: '+ data[key].name + ')', 1);

            ///--- Visualizar la máscara de cambios con el valor DN ---///
            Map.addLayer(cambios, {palette:"red"}, 'Cambios_detectados_DN (Cuad: '+ data[key].name  + ')', 0);

            ///--- Visualizar la máscara de bosques y manglares junto con los cambios seleccionados con el valor DN ---///
            Map.addLayer(cambiosbosques,{palette:"yellow"},'Cambios en bosque 2022 (Cuad: '+ data[key].name + ')', 0);
            Map.addLayer(cambiosmanglares,{palette:"f500e4"},'Cambios en manglares 2022 (Cuad: '+ data[key].name + ')', 0);

            /* ======================= EXPORTACIÓN DE DATOS ======================= */
            if( PRODUCTION_MODE ) {
                var nameTableFechas = 'fechas_'+ data[key].name + '_' +fecha4;
                var nameCambiosBosques = 'cambios_bosque_'+ data[key].name + '_' +fecha4;
                var nameCambiosManglar = 'cambios_manglar_'+ data[key].name + '_' +fecha4;
                //var nameS1RGB = 'Sentinel1_RGB_cuad_'+ data[key].name;

                exportTable(coll_features, nameTableFechas, EXPORT_FOLDER, 'CSV');
                exportImage(cambiosbosques, nameCambiosBosques, EXPORT_FOLDER, 10, table);
            
                if ( data[key].manglar ) {
                    exportImage(cambiosmanglares, nameCambiosManglar, EXPORT_FOLDER, 10, table);
                }
                
                //exportImage(asc_desc, nameS1RGB,'IMSAT_SATA', 10, table);
            }
        })
    }

    Map.addLayer(bos2022,{min:0.0, max:1.0,palette:['229512']},'Máscara bosques 2022', 0);
    Map.addLayer(man2022,{min:0.0, max:1.0,palette:['13ada3']},'Máscara manglares 2022', 0);
    Map.setCenter(-78.5, -1.29, 7);
}

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
    value: 'IDENTIFICACIÓN DE CAMBIOS (PERTURBACIONES Y/O ALTERACIONES) - PROCESAMIENTO NACIONAL (DOBLE ÓRBITA)',
    style: {
        fontWeight: 'bold',
        fontSize: '14px',
        textAlign: 'center',
        margin: '4px 2px',
        color: '#FFC600',
        stretch: 'horizontal'
    }
});

var productionCheckbox = ui.Checkbox({
    label: 'Modo Producción',
    value: false, // false = DEVELOPER MODE; true = PRODUCTION MODE
    style: { stretch: 'horizontal' }
});

var rangeCheckbox = ui.Checkbox({
    label: 'Usar rango variable',
    value: true, // false = SINGLE_RANGE; Por defecto VARIABLE_RANGE
    style: { stretch: 'horizontal' }
});

var runButton = ui.Button({
    label: 'Ejecutar Procesamiento!',
    style: { stretch: 'horizontal' }
});

// Panel principal
var panel = ui.Panel({
    widgets: [
        mainLabel,
        snmbLabel,
        titleLabel,
        productionCheckbox,
        rangeCheckbox,
        runButton
    ],
    layout: ui.Panel.Layout.flow('vertical'),
    style: { width: '300px' }
});

ui.root.insert(0, panel);
runButton.onClick(processInBatches);
