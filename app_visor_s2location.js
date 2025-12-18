// VISOR SATELITAL DE IMÁGENES SENTINEL-2 ALREDEDOR DE UNA UBICACIÓN GEOGRÁFICA
// =====================================================================================
// JWS-GEE: Aplicativo GEE para visualizar imágenes satelitales Sentinel-2 ingresando 
// coordenadas de un punto.
// Fecha desarrollo: 26/08/2025
// Última actualización: 12/12/2025
// Dev: Ing. Jimmy Wladimir Cabrera Soto
// Code: app_visor_s2location_v4.js
// =====================================================================================
// === PARÁMETROS DE CONTROL ===
var CLIP_BUFFER = true;

// Interfaz de Usuario
// =============================
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

var panelBuffer = ui.Panel({
    widgets: [bufferLabel, bufferSelector],
    layout: ui.Panel.Layout.flow('horizontal'),
    style: {stretch: 'horizontal', margin: '2px 4px'}
});

// ----------------------------------------------------- Checkbox: Scene / Buffer Mode
var modeCheckbox = ui.Checkbox({
    label: 'Clip Buffer',
    value: true, // true = Clip Buffer; false: Scene Mode.
    style: { stretch: 'horizontal' },
});

// ----------------------------------------------------- Run Button
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
        panelBuffer,
        modeCheckbox,
        runButton,
        messageLabel,
        exportLabel
    ],
    layout: ui.Panel.Layout.flow('vertical'),
    style: { width: '300px' }
});

ui.root.insert(0, panel);

// =============================
// Función principal
// =============================
function getSentinelCollectionLocal() {
    Map.clear();
    // Leer coordenadas
    CLIP_BUFFER = modeCheckbox.getValue();
    var coords = coordInput.getValue();
    if (!coords) {
        messageLabel.setValue('Debe ingresar coordenadas en formato: lon, lat');
        labelStyle.set({
            color: 'E04D2F',
            border: '1px solid #EDC4BE',
            shown: true,
        });
        return;
    }

    var parts = coords.split(',');
    if (parts.length !== 2) {
        messageLabel.setValue('Formato inválido. Use: lon, lat');
        labelStyle.set({
            color: 'E04D2F',
            border: '1px solid #EDC4BE',
            shown: true,
        });
        return;
    }

    var lon = parseFloat(parts[0].trim());
    var lat = parseFloat(parts[1].trim());
    var point = ee.Geometry.Point([lon, lat]);

    // Buffer
    var buffer = point.buffer(parseInt(bufferSelector.getValue())*1000);

    // Fechas
    var start = startDate.getValue();
    var end = endDate.getValue();
    if (!start || !end) {
        messageLabel.setValue('Debe ingresar fechas en formato YYYY-MM-DD');
        labelStyle.set({
            color: 'E04D2F',
            border: '1px solid #EDC4BE',
            shown: true,
        });
        return;
    }

    // Colección Sentinel-2
    var collection = ee.ImageCollection("COPERNICUS/S2_SR_HARMONIZED")
        .filterBounds(buffer)
        .filterDate(start, end)
        .sort('system:time_start');

    print('Colección Sentinel-2:', collection)
    
    var withDateStr = collection.map(function(img) {
        var dateStr = ee.Date(img.get('system:time_start')).format('YYYY-MM-dd');
        return img.set('date_str', dateStr);
    });

    var uniqueDates = withDateStr.aggregate_array('date_str').distinct();

    // ---------------------------------- Optimización para casos donde geométricamente interseca pero no hay datos.
    var mosaicList = uniqueDates.map(function (dateStr) {
        dateStr = ee.String(dateStr);

        var sameDateImgs = withDateStr
            .filter(ee.Filter.eq('date_str', dateStr))
            .toList(50);   // Conversión a lista para filtrar

        // Filtro de imágenes con datos
        var imgsWithData = sameDateImgs.map(function (img) {
            img = ee.Image(img);

            var count = img.reduceRegion({
                reducer: ee.Reducer.count(),
                geometry: buffer,
                scale: 20,
                maxPixels: 1e9
            }).values().get(0);

            // Datos → imagen; No data → null
            return ee.Algorithms.If(ee.Number(count).gt(0), img, null);
        });

        // Convertir a lista y eliminar nulls
        imgsWithData = ee.List(imgsWithData).removeAll([null]);

        return ee.Algorithms.If(
            imgsWithData.size().gt(0),
            ee.ImageCollection.fromImages(imgsWithData).mosaic()
                .set('system:time_start', ee.Date(dateStr).millis())
                .set('date_str', dateStr),
            null
        );
    });

    // Colección final SIN nulls
    var mosaicCollection = ee.ImageCollection.fromImages(
        ee.List(mosaicList).removeAll([null])
    );

    // Fragmento de código para ver los 5 primeros mosaicos formados emparejando fechas.
    /*var list = mosaicCollection.toList(mosaicCollection.size());

    for (var i = 0; i < 5; i++) {
        var img = ee.Image(list.get(i));
        var dateStr = img.get('date_str').getInfo();
        Map.addLayer(img, {}, 'Mosaico ' + dateStr);
    }*/

    
    // ---- Calcular nubes localmente dentro del buffer ----
    function addLocalCloudPerc(img) {
        // Usamos la banda SCL: clase 9 = nubes altas, 8 = nubes medias, 7 = sombras de nubes
        var scl = img.select('SCL');
        var cloudMask = scl.eq(7).or(scl.eq(8)).or(scl.eq(9));

        var stats = cloudMask.reduceRegion({
            reducer: ee.Reducer.mean(),
            geometry: buffer,
            scale: 20,
            maxPixels: 1e9
        });

        // Porcentaje de nubes dentro del buffer
        var cloudPerc = ee.Number(stats.get('SCL')).multiply(100);

        if ( CLIP_BUFFER ) {
            return img.clip(buffer).set('localCloudPerc', cloudPerc);
        } else {
            return img.set('localCloudPerc', cloudPerc);
        }
    }

    // ------------------------------------------------------------------------------------

    var collectionClipped = mosaicCollection.map(addLocalCloudPerc);
    print('Colección Filtrada (Mosaicos):', collectionClipped)

    // Ordenamiento por porcentaje de nubes local
    var sorted = collectionClipped.sort('localCloudPerc');

    // Cantidad de imágenes
    var cantidad = sorted.size();
    print('Cantidad de imágenes encontradas:', cantidad);

    // Si hay >=3 toma 3, si no toma la cantidad disponible
    var lista = ee.List(
        ee.Algorithms.If(
            cantidad.gte(3),
            sorted.toList(3),
            sorted.toList(cantidad)
        )
    );

    // Número de imágenes que realmente vamos a mostrar
    var nt = cantidad.getInfo();

    // Visualización RGB
    var vis = { bands: ['B4', 'B3', 'B2'], min: 0, max: 3000 };

    // Conversión a FeatureCollection para graficar solo borde
    var bufferFC = ee.FeatureCollection([ee.Feature(buffer)]);

    var bufferStyled = bufferFC.style({
        color: 'FF0000',
        width: 2,
        fillColor: '00000000'
    });
    Map.centerObject(buffer, 12);
    

    // ImageCollection con metadatos
    var imgList = ee.ImageCollection(
        ee.List(lista).map(function (img) {
            img = ee.Image(img);
            var fecha = ee.Date(img.get('system:time_start')).format('YYYY-MM-dd');
            var nube = ee.Number(img.get('localCloudPerc'));
            return img
            .select(['B4', 'B3', 'B2', 'SCL'])
            .set({
                'fecha': fecha,
                'nubes': nube
            });
        })
    );

    // Obtención de listas de metadatos
    var fechas = imgList.aggregate_array('fecha').getInfo();
    var nubes = imgList.aggregate_array('nubes').getInfo();

    // Mostrar en consola
    print('Fechas:', fechas);
    print('Porcentaje de nubes:', nubes);

    // -----------------------------
    // Mostrar imágenes en el mapa
    // -----------------------------
    for (var i = 0; i < fechas.length; i++) {
        var img = ee.Image(imgList.toList(fechas.length).get(i));
        var fecha = fechas[i];
        var nube = nubes[i];

        Map.addLayer(img, vis, 'Imagen ' + (i + 1) + ' (' + fecha + ') nubes=' + nube.toFixed(2) + '%', false);

        // Exportación
        var imgLocal = img.select(['B4','B3','B2']).toUint16();
        exportImage(imgLocal, 'S2_Image_' + (i + 1) + '_', fecha, 'GEE Exports', 10, bufferFC);
    }

    // Mejor imagen (menor nubosidad local)
    var mejorImg = ee.Image(lista.get(0));
    var fechaMejorImg = fechas[0];
    var nubesMejorImg = nubes[0].toFixed(2);

    Map.addLayer(mejorImg, vis, 'Mejor imagen (menos nubes)');
    Map.addLayer(bufferStyled, {}, 'Buffer 5km');
    //Map.addLayer(table, {color: 'yellow'}, 'Alertas')

    print('Fecha mejor imagen:', fechaMejorImg);
    print('Porcentaje de nubes local mejor imagen:', nubesMejorImg);

    // Finally
    messageLabel.setValue('Se han encontrado ' + nt + ' imágenes en el periodo seleccionado. La mejor imagen (Porcentaje de nubes:' + nubesMejorImg + '%' + ')' + ' corresponde a la fecha ' + fechaMejorImg + '.');
    labelStyle.set({
        color: '79C96D',
        border: '1px solid #C4EDBE',
        shown: true,
    });

    // Export Best Image
    var exportImg = mejorImg.select(['B4','B3','B2']).toUint16();
    exportImage(exportImg, 'S2_BestImage_', fechaMejorImg, 'GEE Exports', 10, bufferFC);
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

    exportStyle.set({
        shown: true,
    });
}

// Vincular función al botón
runButton.onClick(getSentinelCollectionLocal);
