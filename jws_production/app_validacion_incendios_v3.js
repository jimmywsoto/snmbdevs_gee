// Cargar el shapefile de alertas tempranas
var alertas = ee.FeatureCollection('projects/snmbdevs/assets/alertas_incendios_unach_pfn_JIMMY');

// === PARÁMETROS DE CONTROL ===
var fechaInicio = '2024-01-01';
var fechaFin = '2024-01-29';
var bufferBbox = 5000; // 2.5 km de buffer

// === VARIABLES GLOBALES ===
var nombresAreas = alertas.aggregate_array('cod');

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
      var scaled = img.select(['SR_B6', 'SR_B5', 'SR_B2', 'SR_B4', 'SR_B7'])
        .multiply(0.0000275).add(-0.2);
      return scaled.copyProperties(img, ['system:time_start']);
    });
}

function procesarSentinel(buffer) {
  return ee.ImageCollection('COPERNICUS/S2_SR')
    .filterBounds(buffer)
    .filterDate(fechaInicio, fechaFin)
    .map(maskS2)
    .select(['B11', 'B8A', 'B2', 'B8', 'B4', 'B12']);
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

// PANEL UI
// PanelGeneral
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
    width: '95%',
    padding: '10px',
    margin: '5px',
    border: '1px solid #5499c7',
    borderRadius: '5px',
    position: 'bottom-right',
    maxHeight: '500px',
    fontSize: '14px',
    fontFamily: 'Arial, sans-serif'
  }
});

// Label para el título 1
var label1PI = ui.Label({
  value: 'Ministerio del Ambiente, Agua y Transición Ecológica',
  style: { fontWeight: 'bold', fontSize: '24px', margin: '8px 8px', color: '#32266B' }
});

// Label para el título 2
var label2PI = ui.Label({
  value: 'VALIDACIÓN VISUAL DE ALERTAS TEMPRANAS AMBIENTALES (SATA)',
  style: { fontWeight: 'bold', fontSize: '20px', margin: '8px 8px', color: '#FFC600' }
});

panelGeneral.add(label1PI);
panelGeneral.add(label2PI);

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

// === FUNCIÓN PARA ACTUALIZAR TODO ===
function actualizarVisualizacion(nombre) {
  var feature = alertas.filter(ee.Filter.eq('cod', nombre)).first();
  var buffer = feature.geometry().buffer(bufferBbox);

  Map.centerObject(buffer, 13);
  Map.clear();

  Map.addLayer(buffer, { color: 'red' }, 'Área: ' + nombre);

  // Procesamiento
  var s2 = procesarSentinel(buffer);
  var l8 = procesarLandsat(ee.ImageCollection('LANDSAT/LC08/C02/T1_L2'), buffer);
  var l9 = procesarLandsat(ee.ImageCollection('LANDSAT/LC09/C02/T1_L2'), buffer);

  var s2Mosaic = s2.median().clip(buffer);
  var l8Mosaic = l8.median().clip(buffer);
  var l9Mosaic = l9.median().clip(buffer);

  // Ratios
  var ratioImageSentinel = ratioImage(s2Mosaic, 'B12/B4', 'B8/B4', 'B11/B12');
  Map.addLayer(ratioImageSentinel, {
    bands: ['ratioR', 'ratioG', 'ratioB'],
    min: 0,
    max: 2,  // Puedes ajustar esto según la región y época
  }, 'S2: Band Ratios RGB');

  var ratioImageLansat8 = ratioImage(l8Mosaic, 'SR_B7/SR_B4', 'SR_B5/SR_B4', 'SR_B6/SR_B7');
  Map.addLayer(ratioImageLansat8, {
    bands: ['ratioR', 'ratioG', 'ratioB'],
    min: 0,
    max: 2,  // Puedes ajustar esto según la región y época
  }, 'L8: Band Ratios RGB');

  var ratioImageLansat9 = ratioImage(l9Mosaic, 'SR_B7/SR_B4', 'SR_B5/SR_B4', 'SR_B6/SR_B7');
  Map.addLayer(ratioImageLansat9, {
    bands: ['ratioR', 'ratioG', 'ratioB'],
    min: 0,
    max: 2,  // Puedes ajustar esto según la región y época
  }, 'L9: Band Ratios RGB');

  // === EXPORTACIONES ===
  var exportRegion = buffer.bounds(); // región de exportación

  Export.image.toDrive({
    image: s2Mosaic,
    description: 'Sentinel2_' + nombre,
    folder: 'Exportaciones_SATA',
    scale: 10,
    region: exportRegion,
    maxPixels: 1e13,
    fileFormat: 'GeoTIFF'
  });

  Export.image.toDrive({
    image: l8Mosaic,
    description: 'Landsat8_' + nombre,
    folder: 'Exportaciones_SATA',
    scale: 30,
    region: exportRegion,
    maxPixels: 1e13,
    fileFormat: 'GeoTIFF'
  });

 Export.image.toDrive({
    image: l9Mosaic,
    description: 'Landsat9_' + nombre,
    folder: 'Exportaciones_SATA',
    scale: 30,
    region: exportRegion,
    maxPixels: 1e13,
    fileFormat: 'GeoTIFF'
 });

  Map.addLayer(s2Mosaic, { min: 0, max: 3000, gamma: 0.5 }, 'Sentinel-2');
  Map.addLayer(l8Mosaic, { min: 0, max: 0.3 }, 'Landsat 8');
  Map.addLayer(l9Mosaic, { min: 0, max: 0.3 }, 'Landsat 9');
  Map.addLayer(feature.geometry(), { color: 'red' }, 'Alerta: ' + nombre);

  panel.clear();
  panel.add(ui.Label('🗓 Fechas de imágenes:', { fontWeight: 'bold', fontSize: '16px' }));
  agregarGrupo(extraerFechasFormateadas(s2), 'Sentinel-2');
  agregarGrupo(extraerFechasFormateadas(l8), 'Landsat 8');
  agregarGrupo(extraerFechasFormateadas(l9), 'Landsat 9');
}

// === BUSQUEDA DE ALERTA
nombresAreas.evaluate(function (listaNombres) {
  // Verifica que es un array
  if (!Array.isArray(listaNombres)) {
    print('Error: listaNombres no es un array JS:', listaNombres);
    return;
  }

  // === SELECTOR DESPLEGABLE ===
  var selector = ui.Select({
    items: listaNombres,
    placeholder: 'Selecciona una alerta',
    onChange: function (codigo) {
      buscador.setValue(codigo); // sincroniza campo de búsqueda
      actualizarVisualizacion(codigo);
    },
    style: { stretch: 'horizontal' }
  });

  // === TEXTBOX DE BÚSQUEDA MANUAL ===
  var buscador = ui.Textbox({style: { stretch: 'horizontal' }});

  var botonBuscar = ui.Button({
    label: 'Buscar',
    onClick: function () {
      var codigo = buscador.getValue();
      if (listaNombres.indexOf(codigo) !== -1) {
        selector.setValue(codigo);
      } else {
        print('⚠️ Código "' + codigo + '" no encontrado.', 'warning');
      }
    },
    style: { stretch: 'horizontal' }
  });

  // PANEL DEL SELECTOR
  var selectorPanel = ui.Panel([
    ui.Label('📍 Selecciona una alerta:'),
    selector
  ], 'flow');

  // PANEL DE BÚSQUEDA
  var buscadorPanel = ui.Panel([
    ui.Label('🔎 Buscar alerta por código:'),
    buscador,
    botonBuscar
  ], 'flow');

  // Añadir al panel principal
  panelGeneral.add(selectorPanel);
  panelGeneral.add(buscadorPanel);
  panelGeneral.add(panel);

  // Ejecutar visualización inicial
  var valorInicial = listaNombres[0];
  selector.setValue(valorInicial);
  buscador.setValue(valorInicial);
});

ui.root.widgets().add(panelGeneral);
