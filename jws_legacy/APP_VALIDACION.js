// Cargar el shapefile de alertas tempranas
var alertas = ee.FeatureCollection('projects/snmbdevs/assets/alerta_test');

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

// Cargar las imágenes NICFI - Planet de los últimos 4 meses
var fechaActual = ee.Date(Date.now());
var mes1 = fechaActual.advance(-2, 'month');
var mes2 = fechaActual.advance(-3, 'month');
var mes3 = fechaActual.advance(-4, 'month');
var mes4 = fechaActual.advance(-8, 'month');
var imagenMes1 = ee.ImageCollection('COPERNICUS/S2_SR').filterDate(mes1, fechaActual).filter(ee.Filter.lt('CLOUDY_PIXEL_PERCENTAGE', 20)).map(maskS2clouds);
var imagenMes2 = ee.ImageCollection('COPERNICUS/S2_SR').filterDate(mes2, mes1).filter(ee.Filter.lt('CLOUDY_PIXEL_PERCENTAGE', 20)).map(maskS2clouds);
var imagenMes3 = ee.ImageCollection('COPERNICUS/S2_SR').filterDate(mes3, mes2).filter(ee.Filter.lt('CLOUDY_PIXEL_PERCENTAGE', 20)).map(maskS2clouds);
var imagenMes4 = ee.ImageCollection('COPERNICUS/S2_SR').filterDate(mes4, mes3).filter(ee.Filter.lt('CLOUDY_PIXEL_PERCENTAGE', 20)).map(maskS2clouds);

// Función para actualizar la visualización
function actualizarVisualizacion(feature) {
  var geometry = ee.Geometry(feature.geometry());
  var coordinates = geometry.coordinates();
  var line = ee.Geometry.LineString(coordinates.get(0));
  
  // Centrar el mapa en la geometría de la alerta
  Map.centerObject(geometry, 17);
  
  // Crear las capas para cada mes
  var visParams = {'bands': ['R', 'G', 'B'], 'min': 64, 'max': 5454, 'gamma': 1.8};
  
  var layer1 = ui.Map.Layer(imagenMes1, visParams, imagenMes1.get('system:index').getInfo().slice(-14));
  var layer2 = ui.Map.Layer(imagenMes2, visParams, imagenMes2.get('system:index').getInfo().slice(-14));
  var layer3 = ui.Map.Layer(imagenMes3, visParams, imagenMes3.get('system:index').getInfo().slice(-14));
  var layer4 = ui.Map.Layer(imagenMes4, visParams, imagenMes4.get('system:index').getInfo().slice(-14));
  
  var geometryLayerl = ui.Map.Layer(line, {color: 'red'}, 'Alerta');
  
  // Limpiar los mapas anteriores
  Map.layers().reset([layer4, layer3, layer2, layer1, geometryLayerl]);
  
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
}

// Crear la interfaz de usuario
var panel = ui.Panel({
  style: {
    position: 'bottom-right',
    padding: '8px',
    height: '100%',
    width: '300px'
  }
});
ui.root.add(panel);

var indiceActual = 0;
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
panel.add(label1PI).add(label2PI).add(labelCod).add(botonAnterior).add(botonSiguiente);
panel.add(uicheckND).add(uicheckb).add(uichecknb).add(uicheckd).add(uichecks).add(botonDescargar);

// Inicializar con la primera alerta
var primeraAlerta = ee.Feature(alertas.first());
actualizarVisualizacion(primeraAlerta);