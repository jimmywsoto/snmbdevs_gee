// Cargar el shapefile de alertas tempranas
var alertas = ee.FeatureCollection('projects/snmbdevs/assets/alerta_test');

// TEMPORAL
// === VARIABLES DE CONTROL ===
var indiceActual = 0;
var polygonList = alertas.toList(alertas.size());
var numFeatures = polygonList.size();

// === FUNCIONES ===

// Función para obtener el polígono por índice
function getPolygon(i) {
  return ee.Feature(polygonList.get(i));
}

function getSentinelImage(polygon) {
    var geometry = polygon.geometry().buffer(2500).bounds(); // 2.5 km de buffer
    var image = ee.ImageCollection("COPERNICUS/S2_SR")
      .filterBounds(geometry)
      .filterDate('2024-01-01', '2025-04-30')
      .filter(ee.Filter.lt('CLOUDY_PIXEL_PERCENTAGE', 20))
      .sort('system:time_start', false)
      .first()
      .clip(geometry);
  
    return image.visualize({
      bands: ['B4', 'B3', 'B2'],
      min: 0,
      max: 3000,
      gamma: 0.5,
      opacity: 1.0
    });
}

function getLandsatImage(polygon) {
    var geometry = polygon.geometry().buffer(2500).bounds();
    var image = ee.ImageCollection("LANDSAT/LC08/C02/T1_L2")
      .filterBounds(geometry)
      .filterDate('2024-01-01', '2025-04-30')
      .filter(ee.Filter.lt('CLOUD_COVER', 70))
      .sort('system:time_start', false)
      .first();
  
    // Verificar si realmente hay una imagen de Landsat 8
    if (image !== null) {
        // Escala bandas SR (multiplica por factor de escala)
        var srBands = image.select(['SR_B4', 'SR_B3', 'SR_B2']).multiply(0.0000275).add(-0.2);

        return srBands.visualize({
        min: 0,
        max: 0.3,
        opacity: 1.0 
        }).clip(geometry);
    } else {
        // Si no hay imágenes, devolvemos un color de fondo o algo informativo
        print('No hay imágenes de Landsat 8 disponibles para esta zona.');
        return ee.Image().paint(geometry, 0, 2).visualize({color: '000000'}); 
    }
}


// TEMPORAL

// Cargar las imágenes NICFI - Planet de los últimos 4 meses
var fechaActual = ee.Date(Date.now());
var mes1 = fechaActual.advance(-2, 'month');
var mes2 = fechaActual.advance(-3, 'month');

// Función para actualizar la visualización
function actualizarVisualizacion(feature) {
  var geometry = ee.Geometry(feature.geometry());
  var coordinates = geometry.coordinates();
  var line = ee.Geometry.LineString(coordinates.get(0));
  
  // Centrar el mapa en la geometría de la alerta
  Map.centerObject(geometry, 17);
  
  // Limpiar los mapas anteriores
  //Map.layers().reset([layer4, layer3, layer2, layer1, geometryLayerl]);
  
  // Actualizar el label con el campo "cod" de la feature actual
  var cod = feature.get('cod').getInfo(); // Obtener el valor del campo "cod"
  labelCod.setValue('Código de alerta: ' + cod); // Actualizar el label
  
  // Actualizar el estado de los checkboxes según el valor actual de la feature
  var estadoActual = feature.get('validacion').getInfo(); // Obtener el valor del campo "validacion"
  uicheckND.setValue(estadoActual === 0);
  uicheckb.setValue(estadoActual === 1);
  uichecknb.setValue(estadoActual === 2);
  uicheckd.setValue(estadoActual === 3);
  uichecks.setValue(estadoActual === 5);

  // TEMPORAL
  var currentPolygon = getPolygon(indiceActual);
  var sentinel = getSentinelImage(currentPolygon);
  var landsat = getLandsatImage(currentPolygon);

  mapPanel.layers().reset(); // Limpiamos capas anteriores

  mapPanel.addLayer(sentinel, {}, 'Sentinel-2');
  mapPanel.addLayer(landsat, {}, 'Landsat 8');
  mapPanel.addLayer(currentPolygon, {color: 'red'}, 'Alerta');

  mapPanel.centerObject(currentPolygon, 13);
  labelAlert.setValue('Alerta ' + (indiceActual + 1) + ' de ' + numFeatures.getInfo());
  // TEMPORAL
}
// === UI ===
var mapPanel = ui.Map();
mapPanel.setCenter(-70, -10, 4);
mapPanel.style().set('cursor', 'crosshair');

// Crear la interfaz de usuario
var panel = ui.Panel({
  style: {
    position: 'bottom-right',
    padding: '8px',
    height: '100%',
    width: '300px'
  }
});
ui.root.clear();
ui.root.add(mapPanel);
ui.root.add(panel);

//var indiceActual = 0;
var totalAlertas = alertas.size().getInfo();

// Label para el título 1
var label1PI = ui.Label({
  value: 'Ministerio del Ambiente, Agua y Transición Ecológica',
  style: {fontWeight: 'bold', fontSize: '24px', margin: '8px 8px', color: '#32266B'}
});

// Label para el título 2
var label2PI = ui.Label({
  value: 'GENERADOR DE ALERTAS TEMPRANAS AMBIENTALES (SATA)',
  style: {fontWeight: 'bold', fontSize: '20px', margin: '8px 8px', color: '#FFC600'}
});

// Label para mostrar el recuento de alertas
//var labelAlert = ui.Label('Polígono 1 de ' + numFeatures.getInfo());
var labelAlert = ui.Label({
    value: 'Alerta 1 de ' + numFeatures.getInfo(),
    style: {fontSize: '14px', margin: '8px 8px', color: 'black', fontStyle: 'italic'}
});

// Label para mostrar el campo "cod"
var labelCod = ui.Label({
  value: 'Código de alerta: ',
  style: {fontSize: '16px', margin: '8px 8px', color: 'black'}
});

// Checkboxes
var uicheckND = ui.Checkbox('0. No definido', false);
var uicheckb = ui.Checkbox('1. Bosque', false);
var uichecknb = ui.Checkbox('2. No Bosque', false);
var uicheckd = ui.Checkbox('3. Deforestacion', false);
var uichecks = ui.Checkbox('5. Seguimiento', false);

// Función para manejar la selección exclusiva de checkboxes
function manejarSeleccion(checkboxSeleccionado) {
  var checkboxes = [uicheckND, uicheckb, uichecknb, uicheckd, uichecks];
  checkboxes.forEach(function(checkbox) {
    if (checkbox !== checkboxSeleccionado) {
      checkbox.setValue(false);
    }
  });
  
  // Obtener el valor seleccionado como número entero
  var valorSeleccionado = checkboxSeleccionado.getValue() ? parseInt(checkboxSeleccionado.getLabel().split('.')[0]) : null;
  
  // Actualizar la feature actual con el valor seleccionado
  var featureActual = ee.Feature(alertas.toList(1, indiceActual).get(0));
  featureActual = featureActual.set('validacion', valorSeleccionado);
  
  // Reemplazar la feature en la FeatureCollection
  alertas = alertas.map(function(feature) {
    return ee.Algorithms.If(
      ee.String(feature.get('cod')).compareTo(ee.String(featureActual.get('cod'))),
      feature,
      featureActual
    );
  });
  
  print('Estado actualizado:', featureActual);
}

// Asignar eventos a los checkboxes
uicheckND.onChange(function() { manejarSeleccion(uicheckND); });
uicheckb.onChange(function() { manejarSeleccion(uicheckb); });
uichecknb.onChange(function() { manejarSeleccion(uichecknb); });
uicheckd.onChange(function() { manejarSeleccion(uicheckd); });
uichecks.onChange(function() { manejarSeleccion(uichecks); });

// Botón para la alerta anterior
var botonAnterior = ui.Button({
  label: 'Anterior',
  onClick: function() {
    if (indiceActual > 0) {
      indiceActual--;
      var feature = ee.Feature(alertas.toList(1, indiceActual).get(0));
      actualizarVisualizacion(feature);
    }
  }
});

// Botón para la siguiente alerta
var botonSiguiente = ui.Button({
  label: 'Siguiente',
  onClick: function() {
    if (indiceActual < totalAlertas - 1) {
      indiceActual++;
      var feature = ee.Feature(alertas.toList(1, indiceActual).get(0));
      actualizarVisualizacion(feature);
    }
  }
});

// Botón para descargar el shapefile actualizado
var botonDescargar = ui.Button({
  label: 'Descargar Shapefile',
  onClick: function() {
    Export.table.toDrive({
      collection: alertas,
      description: 'Alertas_Validacion',
      fileFormat: 'SHP', // Formato shapefile
      folder: 'GEE_Exports', // Carpeta en Google Drive
      fileNamePrefix: 'alertas_validacion'
    });
    
    // Notificar al usuario
    print('Exportación iniciada. Revisa tu Google Drive en la carpeta "GEE_Exports".');
    print('Una vez que el archivo esté en Google Drive, puedes compartirlo generando un enlace.');
  }
});

// Añadir elementos al panel
panel.add(label1PI).add(label2PI).add(labelAlert).add(labelCod).add(botonAnterior).add(botonSiguiente);
panel.add(uicheckND).add(uicheckb).add(uichecknb).add(uicheckd).add(uichecks).add(botonDescargar);

// Inicializar con la primera alerta
var primeraAlerta = ee.Feature(alertas.first());
actualizarVisualizacion(primeraAlerta);