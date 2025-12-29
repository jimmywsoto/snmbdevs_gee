// GENERADOR DE CLASIFICACIÓN SUPERVISADA 
// =====================================================================================
// JWS-GEE: Aplicativo GEE para clasificar imágenes satelitales Sentinel-2 ingresando 
// coordenadas de un punto y asignando una clasificación a puntos de muestreo (8 clases).
// Fecha desarrollo: 16/09/2025
// Última actualización: 24/09/2025
// Dev: Ing. Jimmy Wladimir Cabrera Soto
// Code: app_clasificacion_supervisada_v2.js
// =====================================================================================
// Variables globales
// =============================
var clases = {
    'Bosque': '006400',
    'Cuerpo de Agua': '10a3e9',
    'Otras Tierras': 'd195ff',
    'Sin Información': '474747',
    'Tierra Agropecuaria': '8b7500',
    'Vegetación Arbustiva': '98c859',
    'Zona Antrópica': 'FF0000',
    'Nubes': 'FFFFFF'
};

var muestras = {};
Object.keys(clases).forEach(function (nombre) {
    muestras[nombre] = ee.FeatureCollection([]);
});

var ratioBuffer = 5000; // 5km
var claseActiva = null;
var muestreoHabilitado = false;
var mejorImg = null;

var todasMuestras = ee.FeatureCollection([]);
var clasificacionEtiquetada = null;

var botonesClases = [];
var contadorLabels = {};

// =============================
// Panel Izquierdo
// =============================
var mainLabel = ui.Label({
    value: 'MINISTERIO DE AMBIENTE Y ENERGÍA DEL ECUADOR',
    style: {
        fontWeight: 'bold',
        fontSize: '24px',
        textAlign: 'center',
        margin: '8px',
        color: '#32266B',
        stretch: 'horizontal'
    }
});

var titleLabel = ui.Label({
    value: 'CLASIFICACIÓN SUPERVISADA DE IMÁGENES SENTINEL-2 ALREDEDOR DE UNA UBICACIÓN GEOGRÁFICA',
    style: {
        fontWeight: 'bold',
        fontSize: '18px',
        textAlign: 'center',
        margin: '8px 8px',
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

var exportLabel = ui.Label('La mejor imagen se encuentra lista para exportar, revisa el panel de tareas.');
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

// Panel izquierdo
var panel = ui.Panel({
    widgets: [
        mainLabel,
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

// =============================
// Panel Derecho
// =============================
var muestreoLabel = ui.Label({
    value: 'CLASIFICACIÓN SUPERVISADA',
    style: {
        fontWeight: 'bold',
        fontSize: '20px',
        textAlign: 'center',
        margin: '8px',
        color: '#32266B',
        stretch: 'horizontal'
    }
});

var catLabel = ui.Label({
    value: 'Categorías de muestreo:',
    style: { fontWeight: 'bold', margin: '2px 8px', color: 'gray' }
});

var toggleButton = ui.Button({
    label: 'Habilitar Muestreo',
    style: { stretch: 'horizontal', margin: '4px 8px' },
    onClick: function () {
        muestreoHabilitado = !muestreoHabilitado;
        toggleButton.setLabel(muestreoHabilitado ? 'Deshabilitar Muestreo' : 'Habilitar Muestreo');
        if (!muestreoHabilitado) {
            claseActiva = null;
        }
        actualizarEstilosBotones();
    }
});

var algLabel = ui.Label({
    value: 'Método de Clasificación:',
    style: { fontWeight: 'bold', margin: '8px', color: 'gray' }
});

var algSelector = ui.Select({
    items: ['Random Forest', 'CART', 'SVM'],
    placeholder: 'Seleccione un algoritmo...',
    style: { stretch: 'horizontal', margin: '0 8px' }
});

var ejecutarBtn = ui.Button({
    label: 'Ejecutar Clasificación',
    style: { stretch: 'horizontal', margin: '4px 8px' },
});

var exportarButton = ui.Button({
    label: 'Exportar clasificación',
    style: { stretch: 'horizontal', shown: false, margin: '4px 8px', color: '#143582' }
});

var exportarMuestrasButton = ui.Button({
    label: 'Exportar muestras',
    style: { stretch: 'horizontal', shown: true, margin: '0px 4px 4px 8px', color: '#143582' }
});

var resetMuestrasButton = ui.Button({
    label: 'Resetear muestreo',
    style: { stretch: 'horizontal', shown: true, margin: '0px 8px 4px 0px', color: '#E8846F' }
});

var assetLabel = ui.Label({
    value: 'Importa un Asset de muestras:',
    style: { fontWeight: 'bold', margin: '8px', color: 'gray' }
});

var assetInput = ui.Textbox({
    placeholder: 'users/usuario/muestras_exportadas',
    style: { stretch: 'horizontal', margin: '4px 8px' }
});

var importButton = ui.Button({
    label: 'Importar muestras',
    style: { stretch: 'horizontal', color: '#143582', margin: '4px 8px' },
    onClick: function () {
        var assetId = assetInput.getValue();
        if (!assetId) {
            print('Ingresa un ID de asset.');
            return;
        }

        try {
            var importedSamples = ee.FeatureCollection(assetId);

            // Verificar que exista la columna 'clase' o 'validacion'
            importedSamples.first().propertyNames().evaluate(function (list) {
                if (list.indexOf('clase') === -1 && list.indexOf('validacion') === -1) {
                    print('El asset no contiene el campo "clase" ni "validacion". No se puede usar para entrenar.');
                } else {
                    // Si tiene 'validacion', renombramos a 'clase' para compatibilidad
                    if (list.indexOf('validacion') !== -1) {
                        importedSamples = importedSamples.map(function (f) {
                            return f.set('clase', f.get('validacion'));
                        });
                    }

                    print('Muestras importadas correctamente:', importedSamples);

                    resetMuestras();
                    todasMuestras = importedSamples;

                    Object.keys(clases).forEach(function (nombre) {
                        muestras[nombre] = importedSamples.filter(ee.Filter.eq('clase', nombre));
                        contadorLabels[nombre].setValue(muestras[nombre].size().getInfo());
                    });

                    Map.addLayer(importedSamples, {color: 'red'}, 'Muestras Importadas');
                }
            });
        } catch (e) {
            print('Error al cargar el asset:', e);
        }
    }
});

var muestreoBotones = ui.Panel({
    widgets: [exportarMuestrasButton, resetMuestrasButton],
    layout: ui.Panel.Layout.flow('horizontal')
});

var assetBotones = ui.Panel({
    widgets: [assetLabel, assetInput, importButton],
    layout: ui.Panel.Layout.flow('vertical')
});

// Panel derecho
var panelDerecho = ui.Panel({
    widgets: [muestreoLabel, catLabel, toggleButton, muestreoBotones].concat(botonesClases),
    layout: ui.Panel.Layout.flow('vertical'),
    style: { width: '250px', position: 'bottom-right' }
});

Object.keys(clases).forEach(function (nombre) {
    var boton = ui.Button({
        label: nombre,
        style: {
            stretch: 'horizontal',
            color: '#888888',
            border: '',
            margin: '2px 0px 2px 8px',
        },
        onClick: function () {
            if (!muestreoHabilitado) {
                print('Debe habilitar el muestreo primero.');
                return;
            }
            claseActiva = nombre;

            actualizarEstilosBotones();
        }
    });

    // Label contador inicializado en 0
    var contador = ui.Label('0', { margin: '2px 8px', color: '#7c7878bb' });
    contadorLabels[nombre] = contador;

    var fila = ui.Panel({
        widgets: [boton, contador],
        layout: ui.Panel.Layout.flow('horizontal')
    });

    panelDerecho.add(fila);
    botonesClases.push(boton);
});

panelDerecho.add(assetBotones);
panelDerecho.add(algLabel);
panelDerecho.add(algSelector);
panelDerecho.add(ejecutarBtn);
panelDerecho.add(exportarButton);
ui.root.widgets().add(panelDerecho);

// =============================
// Funciones de ejecución
// =============================
function getSentinelCollectionLocal() {
    Map.clear();
    resetMuestras();
    todasMuestras = ee.FeatureCollection([]);
    claseActiva = null;
    muestreoHabilitado = false;

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
    var buffer = point.buffer(ratioBuffer);

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

    // -------------------------------------------------------------------
    /*print(collection)
    // Convertir la colección a una lista y evaluarla en el cliente.
    collection.toList(collection.size()).evaluate(function(imageList) {
      for (var i = 0; i < imageList.length; i++) {
        // Convertir cada objeto a una ee.Image con su ID.
        var image = ee.Image(imageList[i].id);
  
        // Agregar la imagen al mapa con visualización RGB.
        Map.addLayer(image, {min: 0, max: 3000, bands: ['B4', 'B3', 'B2']}, 'Imagen ' + i);
      }
    });*/

    var withDateStr = collection.map(function(img) {
        var dateStr = ee.Date(img.get('system:time_start')).format('YYYY-MM-dd');
        return img.set('date_str', dateStr);
    });

    var uniqueDates = withDateStr.aggregate_array('date_str').distinct();

    var mosaicCollection = ee.ImageCollection(uniqueDates.map(function(dateStr) {
        dateStr = ee.String(dateStr);
        
        var sameDateImgs = withDateStr.filter(ee.Filter.eq('date_str', dateStr));
        
        var mosaic = sameDateImgs.mosaic()
            .set('system:time_start', ee.Date(dateStr).millis())
            .set('date_str', dateStr);
        
        return mosaic;
    }));
    // -------------------------------------------------------------------

    // Calcular nubes localmente dentro del buffer
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

        return img.clip(buffer).set('localCloudPerc', cloudPerc);
        //return img.set('localCloudPerc', cloudPerc);
    }

    var collectionClipped = mosaicCollection.map(addLocalCloudPerc);

    // Ordenar por porcentaje de nubes local
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
    var n = cantidad.min(3).getInfo();

    // Visualización RGB
    var vis = { bands: ['B4', 'B3', 'B2'], min: 0, max: 3000 };

    // Mostrar imágenes en el mapa
    for (var i = 0; i < n; i++) {
        var img = ee.Image(lista.get(i));
        var fecha = ee.Date(img.get('system:time_start')).format('YYYY-MM-dd').getInfo();
        var nubeLocal = img.get('localCloudPerc').getInfo();

        Map.addLayer(img, vis, 'Imagen ' + (i + 1) + ' (' + fecha + ') nubes=' + nubeLocal.toFixed(2) + '%', 0);
    }

    // Mejor imagen (menor nubosidad local)
    mejorImg = ee.Image(lista.get(0));
    var fechaMejorImg = ee.Date(mejorImg.get('system:time_start')).format('YYYY-MM-dd');
    var nubesMejorImg = mejorImg.get('localCloudPerc');
    Map.addLayer(mejorImg, vis, 'Mejor imagen (menos nubes)');

    print('Fecha mejor imagen:', fechaMejorImg);
    print('Porcentaje de nubes local mejor imagen:', nubesMejorImg);

    // Centrar y dibujar buffer
    Map.centerObject(buffer, 12);

    // Conversión a FeatureCollection para graficar solo borde
    var bufferFC = ee.FeatureCollection([ee.Feature(buffer)]);

    var bufferStyled = bufferFC.style({
        color: 'FF0000',
        width: 2,
        fillColor: '00000000'
    });
    Map.addLayer(bufferStyled, {}, 'Buffer 5km');

    // Finally
    messageLabel.setValue('Se han encontrado ' + nt + ' imágenes en el periodo seleccionado. La mejor imagen (Porcentaje de nubes:' + nubesMejorImg.getInfo().toFixed(2) + '%' + ')' + ' corresponde a la fecha ' + fechaMejorImg.getInfo() + '.');
    labelStyle.set({
        color: '79C96D',
        border: '1px solid #C4EDBE',
        shown: true,
    });
    // Export Best Image
    var exportImg = mejorImg.select(['B4', 'B3', 'B2']).toUint16();
    exportImage(exportImg, 'S2_BestImage_', fechaMejorImg.getInfo(), 'GEE Exports', 10, bufferFC);
    Map.onClick(handleMapClick);
}

function executeClassify() {
    if (mejorImg === null) {
        print('Primero genera la mejor imagen en el panel izquierdo.');
        return;
    }

    // -----------------------------
    // Crear máscara de nubes con QA60
    // -----------------------------
    var qa = mejorImg.select('QA60');
    var cloudMask = qa.gt(0).rename('cloud_mask'); // 1 = nube, 0 = despejado

    // Asegurar que la clase "Nubes" exista
    clases['Nubes'] = 'FFFFFF';

    // Combinar todas las muestras (excepto nubes, porque no se muestrean)
    Object.keys(muestras).forEach(function (nombre) {
        todasMuestras = todasMuestras.merge(muestras[nombre]);
    });

    if (todasMuestras.size().getInfo() === 0) {
        print('Debe crear puntos de muestreo antes de ejecutar la clasificación.');
        return;
    }

    var metodo = algSelector.getValue();
    if (!metodo) {
        print('Debe seleccionar un método de clasificación.');
        return;
    }

    print('Ejecutando clasificación con método:', metodo);
    print('Cantidad total de muestras:', todasMuestras.size());

    // -----------------------------
    // Preparar datos de entrenamiento
    // -----------------------------
    var bandas = ['B2', 'B3', 'B4', 'B8', 'B11', 'B12'];
    var imagenEntrenamiento = mejorImg.select(bandas);

    var clasesArray = Object.keys(clases); // ya incluye "Nubes"
    var paleta = [];
    for (var i = 0; i < clasesArray.length; i++) {
        paleta.push(clases[clasesArray[i]]);
    }

    // Convertir clases a numéricas
    var fcNumerico = todasMuestras.map(function (f) {
        var clase = f.get('clase');
        var claseNum = ee.List(clasesArray).indexOf(clase);

        // Si no existe la clase, devuelve -1 → la descartamos
        return ee.Algorithms.If(
            claseNum.gte(0),
            f.set('clase_num', claseNum),
            null
        );
    }).filter(ee.Filter.notNull(['clase_num']));

    var entrenamiento = imagenEntrenamiento.sampleRegions({
        collection: fcNumerico,
        properties: ['clase_num'],
        scale: 10
    });

    // -----------------------------
    // Crear clasificador
    // -----------------------------
    var clasificador;
    switch (metodo) {
        case 'Random Forest': clasificador = ee.Classifier.smileRandomForest(100); break;
        case 'CART': clasificador = ee.Classifier.smileCart(); break;
        case 'SVM': clasificador = ee.Classifier.libsvm(); break;
        default: clasificador = ee.Classifier.smileRandomForest(100);
    }

    clasificador = clasificador.train({
        features: entrenamiento,
        classProperty: 'clase_num',
        inputProperties: bandas
    });

    // -----------------------------
    // Clasificación inicial
    // -----------------------------
    var clasificacion = imagenEntrenamiento.classify(clasificador);

    // -----------------------------
    // Sobrescribir píxeles de nube
    // -----------------------------
    var nubeIndex = ee.List(clasesArray).indexOf('Nubes');
    clasificacion = clasificacion.where(cloudMask.eq(1), nubeIndex);

    // -----------------------------
    // Resultado final
    // -----------------------------
    clasificacionEtiquetada = clasificacion.rename('clase');
    clasificacionEtiquetada = clasificacionEtiquetada.set('nombres_clase', clasesArray);

    Map.addLayer(
        clasificacionEtiquetada,
        { min: 0, max: clasesArray.length - 1, palette: paleta },
        'Clasificación Supervisada (Etiquetada)'
    );

    print('Clasificación completada (con nubes de QA60).');
    exportarButton.style().set('shown', true);
}

function handleMapClick(coords) {
    // coords: {lon, lat}
    if (!muestreoHabilitado) return;
    if (!claseActiva) {
        print('Seleccione una clase antes de muestrear.');
        return;
    }

    var punto = ee.Geometry.Point([coords.lon, coords.lat]);

    var claseLimpia = claseActiva.trim();
    var feature = ee.Feature(punto, { clase: claseLimpia });

    // Agregar al FeatureCollection de la clase
    muestras[claseActiva] = muestras[claseActiva].merge(ee.FeatureCollection([feature]));

    // Redibujar la capa de esa clase (remover antigua si existe)
    var layerName = 'Muestras - ' + claseActiva;
    Map.layers().forEach(function (layer) {
        try {
            if (layer.getName && layer.getName() === layerName) {
                Map.remove(layer);
            }
        } catch (e) { /* ignore */ }
    });

    // Actualizar contador
    var label = contadorLabels[claseActiva];
    var actual = parseInt(label.getValue(), 10);
    label.setValue((actual + 1).toString());

    Map.addLayer(muestras[claseActiva], { color: '#' + clases[claseActiva] }, layerName);
    //print('Nuevo punto agregado a la clase:', claseActiva, punto);
}

function actualizarEstilosBotones() {
    botonesClases.forEach(function (b) {
        var nombre = b.getLabel();
        var esActivo = (claseActiva === nombre);

        b.style().set({
            stretch: 'horizontal',
            color: muestreoHabilitado ? '#' + clases[nombre] : '#888888',
            border: esActivo ? '2px solid gray' : '',
            margin: '2px 8px',
            fontWeight: esActivo ? 'bold' : 'normal'
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

    exportStyle.set({
        shown: true,
    });
}

function exportVector(featureCollection, nombreArchivo, carpetaDestino, formato) {
    Export.table.toDrive({
        collection: featureCollection,
        description: nombreArchivo + '_export',
        folder: carpetaDestino || 'GEE_exports',
        fileNamePrefix: nombreArchivo,
        fileFormat: formato || 'SHP'
    });
}

function resetMuestras() {
    Object.keys(clases).forEach(function (nombre) {
        muestras[nombre] = ee.FeatureCollection([]);
        var label = contadorLabels[nombre];
        label.setValue(0);
    });
}

// =============================
// Vinculación de Eventos
// =============================
Map.onClick(handleMapClick);

runButton.onClick(getSentinelCollectionLocal);
ejecutarBtn.onClick(executeClassify);
resetMuestrasButton.onClick(resetMuestras);

exportarButton.onClick(function () {
    exportImage(
        clasificacionEtiquetada.toUint8(),
        'Clasificacion_Supervisada_',
        Date.now(),
        'GEE_Class',
        10,
        mejorImg.geometry()
    )
});

exportarMuestrasButton.onClick(function () {
    Object.keys(muestras).forEach(function (nombre) {
        todasMuestras = todasMuestras.merge(muestras[nombre]);
    });

    if (todasMuestras.size().getInfo() === 0) {
        print('Debe crear puntos de muestreo antes de exportar la capa.');
        return;
    }

    exportVector(todasMuestras, 'Muestras', 'GEE_muestreo', 'SHP');
})