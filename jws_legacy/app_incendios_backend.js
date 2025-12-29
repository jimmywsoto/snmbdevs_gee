//Funcion para datos sentinel
var reclasificacion2;

function indexnbrs2(date3, date4, nubes, plataforma, zona, panel){
  //LIMPIAMOS EL PANEL
  panel.clear;
  //centramos el mapa
  Map.centerObject(zona, 10);
  var antes, despues; 
  //Fechas de la temporada de incendios del año anterior
  var datea1 = ee.String(ee.Number(ee.Date(date3).get('year')).subtract(1)).cat('-06-01');
  var datea2 = ee.String(ee.Number(ee.Date(date3).get('year')).subtract(1)).cat('-12-01');
  //parametros para visualizacion
  var rgbVis = {min: 0.0, max: 0.3, bands: ['B4', 'B8', 'B11'],};
  var nbr_vis = {min: -1, max: 1, palette: ['white', 'green', 'yellow', 'orange', 'red'],};
  var reclasVis = {min: 0, max: 5, palette: ['white', 'yellow', 'orange', 'red', 'darkred'],};
  var umbralMsi = 0.75;
  var umbralNBR = -0.20;
  //Funcion para enmascarar nubes s2
  function maskS2clouds(image) {
    var qa = image.select('QA60');
  
    // Bits 10 and 11 are clouds and cirrus, respectively.
    var cloudBitMask = 1 << 10;
    var cirrusBitMask = 1 << 11;
  
    // Both flags should be set to zero, indicating clear conditions.
    var mask = qa.bitwiseAnd(cloudBitMask).eq(0)
        .and(qa.bitwiseAnd(cirrusBitMask).eq(0));
  
    return image.updateMask(mask).divide(10000);
  }
  //importamos la coleccion de imagenes
  var dataset1 = ee.ImageCollection('COPERNICUS/S2_HARMONIZED')
                    .filterDate(datea1, datea2)
                    .filter(ee.Filter.lt('CLOUDY_PIXEL_PERCENTAGE', nubes))
                    .filterBounds(zona)
                    .map(maskS2clouds);
  var dataset2 = ee.ImageCollection('COPERNICUS/S2_HARMONIZED')
                    .filterDate(date3, date4)
                    .filter(ee.Filter.lt('CLOUDY_PIXEL_PERCENTAGE', nubes))
                    .filterBounds(zona)
                    .map(maskS2clouds);

  if (dataset1.size().getInfo()===0){
    var txtsizeantes = ui.Label({value: 'No existe imagenes previo al incendio', style: {fontWeight: 'bold', fontSize: '12px', margin: '8px 8px', color: '#EB7B59'}});
    panel.add(txtsizeantes);
  } else if (dataset1.size().getInfo()>0){
    antes = dataset1.mean().clip(zona);
    Map.addLayer(antes, rgbVis, 'Antes');
  } else {
    print('ERROR LÓGICO: COMUNIQUESE CON SOPORTE TÉNICO');
  }
  
  if (dataset2.size().getInfo()===0){
    var txtsizedesp = ui.Label({value: 'No existe imagenes posterior al incendio', style: {fontWeight: 'bold', fontSize: '12px', margin: '8px 8px', color: '#EB7B59'}});
    panel.add(txtsizedesp);
  } else if (dataset2.size().getInfo()>0){
    despues = dataset2.mean().clip(zona);
    Map.addLayer(despues, rgbVis, 'Despues');
  } else {
    print('ERROR LÓGICO: COMUNIQUESE CON SOPORTE TÉNICO');
  }
  if (dataset1.size().getInfo()>0 || dataset2.size().getInfo()>0){
    var nbrAntes = antes.expression('(NIR-SWIR)/(NIR+SWIR)', {
                                        'NIR': antes.select('B8'),
                                        'SWIR': antes.select('B12'),
                                        }).clip(zona);
    var msiAntes = antes.expression('(SWIR)/(NIR)', {
                                          'NIR': antes.select('B12'),
                                          'SWIR': antes.select('B8'),
                                          }).clip(zona);
        // Cálculo del MSI para poder visualizar la vegetación alterada //
    var nbrDespues = despues.expression('(NIR-SWIR)/(NIR+SWIR)', {
                                        'NIR': despues.select('B8'),
                                        'SWIR': despues.select('B12'),
                                        }).clip(zona);
    var msiDespues = despues.expression('(SWIR)/(NIR)', {
                                          'NIR': despues.select('B12'),
                                          'SWIR': despues.select('B8'),
                                          }).clip(zona);
    // Cálculo del NBR para poder visualizar la vegetación quemada //
    Map.addLayer(nbrAntes, nbr_vis, 'NBR antes', 0);
    Map.addLayer(nbrDespues, nbr_vis, 'NBR Despues', 0);
    var dnbr = nbrAntes.subtract(nbrDespues).multiply(1000).rename('dnbr');
    Map.addLayer(dnbr, {'min': -1, 'max': 1, 'palette': ['red', 'yellow', 'green']}, 'ΔNBR', 0);
    var reclasificacion = dnbr.expression(
      '(b("dnbr") >= 660) ? 5 :' +  // Severidad muy alta (>0.66)
      '(b("dnbr") >= 440) ? 4 :' +  // Alta severidad (0.44 a 0.66)
      '(b("dnbr") >= 270) ? 3 :' +  // Moderada severidad (0.27 a 0.44)
      // '(b("dnbr") >= 100) ? 2 :' +  // Baja severidad (0.1 a 0.27)
      '0',                           // No quemado o sin importancia
      {
        'dnbr': dnbr.select('dnbr')   // Asegúrate de seleccionar la banda correcta
      }
    );
    var reclasificacion1 = reclasificacion.clip(zona.geometry()).rename('rdnbr').lt(270);
    reclasificacion2 = reclasificacion.updateMask(reclasificacion);
    
    // Umbrales para antes
    var umbrMsiAntes = msiAntes.lt(umbralMsi);
    var umbrNBRAntes = nbrAntes.lt(umbralNBR);
    var iMSIAntes = msiAntes.updateMask(umbrMsiAntes);
    var iNBRAntes = nbrAntes.updateMask(umbrNBRAntes);
    // Umbral bajo el cual se presentan las superficies quemadas //
    var umbrMsiDespues = msiDespues.lt(umbralMsi);
    var umbrNBRDespues = nbrDespues.lt(umbralNBR);
    var iMSIdespues = msiDespues.updateMask(umbrMsiDespues);
    var iNBRdespues = nbrDespues.updateMask(umbrNBRDespues);
    
    // Calcular la cantidad de pixeles con datos
    var areaNBR= iNBRdespues.reduceRegion({
      reducer: ee.Reducer.count(),
      geometry: zona, // Limitar el cálculo al área de interés definida por geometrias
      scale: 10, // Escala para el cálculo
      maxPixels: 1e13 // Ajustar el límite de pixeles según sea necesario
    });
    // Extraer el área en metros cuadrados
    var pixelNBR = ee.Number(areaNBR.get('B8'));
    var areNBRha = pixelNBR.divide(100);
    if (areNBRha.getInfo()>2) {
      var txtareNBR = ui.Label({value: 'Area NBR Despues: '+ areNBRha.getInfo().toFixed(2) + ' ha', style: {fontWeight: 'bold', fontSize: '12px', margin: '8px 8px', color: '#32266B'}});
      Map.addLayer(iNBRdespues, {palette:"03d3fc"}, 'NBR Despues MASK', 0);
      panel.add(txtareNBR);
      
    }
    // Calcular el cantidad de pixeles con datos
    var areaMSI= iMSIdespues.reduceRegion({
      reducer: ee.Reducer.count(),
      geometry: zona, // Limitar el cálculo al área de interés definida por geometrias
      scale: 10, // Escala para el cálculo
      maxPixels: 1e13 // Ajustar el límite de pixeles según sea necesario
    });
    // Extraer el área en metros cuadrados
    var pixelMSI = ee.Number(areaMSI.get('B8'));
    var areMSIha = pixelMSI.divide(100);
    if (areMSIha.getInfo()>2){
      var txtareMSI = ui.Label({value: 'Area MSI Despues: '+ areMSIha.getInfo().toFixed(2) + ' ha', style: {fontWeight: 'bold', fontSize: '12px', margin: '8px 8px', color: '#32266B'}});
      Map.addLayer(iMSIdespues, {palette:"FF0000"}, 'MSI Despues MASK', 0);
      panel.add(txtareMSI);
      
    }
    Map.addLayer(reclasificacion2, reclasVis, 'Reclasificación ΔNBR');
    if (areNBRha.getInfo()>2 || areMSIha.getInfo()>2){
      var urlimg = despues.getDownloadURL({filename: 'Imagen',bands: ["B4", "B8", "B11"], region: zona.geometry(), scale: 10, format: 'GEO_TIFF'});
      var linkimg = ui.Label({value: 'Descargar Imagen'});
      linkimg.setUrl(urlimg);
      panel.add(linkimg);
      var urlDnbrReclas = reclasificacion1.getDownloadURL({filename: 'DNBR reclass',bands: ["rdnbr"], region: zona.geometry(), scale: 10, format: 'GEO_TIFF'});
      var linkDnbrReclas = ui.Label({value: 'Descargar DNBR reclasificado'});
      linkDnbrReclas.setUrl(urlDnbrReclas);
      panel.add(linkDnbrReclas);
      print(nbrAntes);
      var urlNbrAntes = nbrAntes.getDownloadURL({filename: 'NBR antes',bands: ["B8"], region: zona.geometry(), scale: 10, format: 'GEO_TIFF'});
      var linkNbrAntes = ui.Label({value: 'Descargar NBR antes'});
      linkNbrAntes.setUrl(urlNbrAntes);
      panel.add(linkNbrAntes);
      var urlNbrDespues = nbrDespues.getDownloadURL({filename: 'NBR Despues',bands: ["B8"], region: zona.geometry(), scale: 10, format: 'GEO_TIFF'});
      var linkNbrDespues = ui.Label({value: 'Descargar NBR Despues'});
      linkNbrDespues.setUrl(urlNbrDespues);
      panel.add(linkNbrDespues);
      var urlDnbr = dnbr.getDownloadURL({filename: 'DNBR',bands: ["dnbr"], region: zona.geometry(), scale: 10, format: 'GEO_TIFF'});
      var linkDnbr = ui.Label({value: 'Descargar DNBR'});
      linkDnbr.setUrl(urlDnbr);
      panel.add(linkDnbr);
    }
  }else{
    var txtNotDownload = ui.Label({value: 'No se han podido generar los links de descarga, revise el tamaño de AOI'});
    panel.add(txtNotDownload); 
  }
}
function indexnbrl8(date3, date4, nubes, plataforma, zona, panel){
  panel.clear();
  Map.centerObject(zona, 10);
  var antes, despues;
  var date4l8 = ee.Date(date4).advance(9, 'day').format('yyyy-MM-dd');
  //Fechas de la temporada de incendios del año anterior
  var datea1 = ee.String(ee.Number(ee.Date(date3).get('year')).subtract(1)).cat('-06-01');
  var datea2 = ee.String(ee.Number(ee.Date(date3).get('year')).subtract(1)).cat('-12-01');
  //parametros para visualizacion
  var rgbVis = {min: 0.0, max: 0.3, bands: ['B4', 'B5', 'B6'],};
  var nbr_vis = {min: -1, max: 1, palette: ['white', 'green', 'yellow', 'orange', 'red'],};
  var reclasVis = {min: 0, max: 5, palette: ['white', 'yellow', 'orange', 'red', 'darkred'],};
  //umbrales
  var umbralMsi = 0.75;
  var umbralNBR = -0.20;
  //funcion para enmascarar nubes en lansat 8
  function maskL8sr(image) {
    // Los bits 3 y 5 son nubes y sombras de nubes, respectivamente.
    var cloudShadowBitMask = 1 << 3;
    var cloudsBitMask = 1 << 5;
    var snowBitMask = 1 << 4;
    // Obtenga la banda de control de calidad de píxeles.
    var qa = image.select('QA_PIXEL');
    // Todos los indicadores deben establecerse en cero, lo que indica condiciones claras o
    // libres de nubes.
    var mask = qa.bitwiseAnd(cloudShadowBitMask).eq(0)
        .and(qa.bitwiseAnd(cloudsBitMask).eq(0))
        .and(qa.bitwiseAnd(snowBitMask).eq(0));
    // Devuelva la imagen enmascarada y escalada a la reflectancia TOA, sin las bandas de QA.
    return image.updateMask(mask);
  }
  //Importamos la coleccion de imagenes
  var dataset1 = ee.ImageCollection('LANDSAT/LC08/C02/T1_TOA')
                    .filterDate(datea1, datea2)
                    .filterMetadata('CLOUD_COVER', 'Less_Than', nubes)
                    .filterBounds(zona)
                    .map(maskL8sr);
  var dataset2 = ee.ImageCollection('LANDSAT/LC08/C02/T1_TOA')
                    .filterDate(date3, date4l8)
                    // Pre-filter to get less cloudy granules.
                    .filterMetadata('CLOUD_COVER', 'Less_Than', nubes)
                    .filterBounds(zona)
                    .map(maskL8sr);
  if (dataset1.size().getInfo()===0){
    var txtsizeantes = ui.Label({value: 'No existe imagenes previo al incendio', style: {fontWeight: 'bold', fontSize: '12px', margin: '8px 8px', color: '#EB7B59'}});
    panel.add(txtsizeantes);
  } else if (dataset1.size().getInfo()>0){
    antes = dataset1.mean().clip(zona);
    Map.addLayer(antes, rgbVis, 'Antes');
  } else {
    print('ERROR LÓGICO: COMUNIQUESE CON SOPORTE TÉNICO');
  }
  
  if (dataset2.size().getInfo()===0){
    var txtsizedesp = ui.Label({value: 'No existe imagenes posterior al incendio', style: {fontWeight: 'bold', fontSize: '12px', margin: '8px 8px', color: '#EB7B59'}});
    panel.add(txtsizedesp);
  } else if (dataset2.size().getInfo()>0){
    despues = dataset2.mean().clip(zona);
    Map.addLayer(despues, rgbVis, 'Despues');
  } else {
    print('ERROR LÓGICO: COMUNIQUESE CON SOPORTE TÉNICO');
  }
  if (dataset1.size().getInfo()>0 || dataset2.size().getInfo()>0){
    //Calculo de NBR antes y despues
    var nbrAntes = antes.expression('(NIR-SWIR)/(NIR+SWIR)', {
                                        'NIR': antes.select('B5'),
                                        'SWIR': antes.select('B6'),
                                        }).clip(zona);
    var msiAntes = antes.expression('(SWIR)/(NIR)', {
                                          'NIR': antes.select('B6'),
                                          'SWIR': antes.select('B5'),
                                          }).clip(zona);
    var nbrDespues = despues.expression('(NIR-SWIR)/(NIR+SWIR)', {
                                        'NIR': despues.select('B5'),
                                        'SWIR': despues.select('B6'),
                                        }).clip(zona);
    var msiDespues = despues.expression('(SWIR)/(NIR)', {
                                          'NIR': despues.select('B6'),
                                          'SWIR': despues.select('B5'),
                                          }).clip(zona);
    //Añadimos las capas de NBR al lienzo del mapa
    Map.addLayer(nbrAntes, nbr_vis, 'NBR antes', 0);
    Map.addLayer(nbrDespues, nbr_vis, 'NBR Despues', 0);
    //Calculo de NBR
    var dnbr = nbrAntes.subtract(nbrDespues).multiply(1000).rename('dnbr');
    //Añadimos el DNBR
    Map.addLayer(dnbr, {'min': -1, 'max': 1, 'palette': ['red', 'yellow', 'green']}, 'ΔNBR', 0);
    //Expresion para reclasificacion del NBR
    var reclasificacion = dnbr.expression(
      '(b("dnbr") >= 660) ? 5 :' +  // Severidad muy alta (>0.66)
      '(b("dnbr") >= 440) ? 4 :' +  // Alta severidad (0.44 a 0.66)
      '(b("dnbr") >= 270) ? 3 :' +  // Moderada severidad (0.27 a 0.44)
      // '(b("dnbr") >= 100) ? 2 :' +  // Baja severidad (0.1 a 0.27)
      '0',                           // No quemado o sin importancia
      {
        'dnbr': dnbr.select('dnbr')   // Asegúrate de seleccionar la banda correcta
      }
    );
    //Corte y renombre de la capa DNRB
    var reclasificacion1 = reclasificacion.clip(zona.geometry()).rename('rdnbr').lt(270);
    reclasificacion2 = reclasificacion.updateMask(reclasificacion);
    // Aplicación de umbrales para antes
    var umbrMsiAntes = msiAntes.lt(umbralMsi);
    var umbrNBRAntes = nbrAntes.lt(umbralNBR);
    var iMSIAntes = msiAntes.updateMask(umbrMsiAntes);
    var iNBRAntes = nbrAntes.updateMask(umbrNBRAntes);
    // Umbral bajo el cual se presentan las superficies quemadas //
    var umbrMsiDespues = msiDespues.lt(umbralMsi);
    var umbrNBRDespues = nbrDespues.lt(umbralNBR);
    var iMSIdespues = msiDespues.updateMask(umbrMsiDespues);
    var iNBRdespues = nbrDespues.updateMask(umbrNBRDespues);
    // Calcular la cantidad de pixeles con datos
    var areaNBR= iNBRdespues.reduceRegion({
      reducer: ee.Reducer.count(),
      geometry: zona, // Limitar el cálculo al área de interés definida por geometrias
      scale: 30, // Escala para el cálculo
      maxPixels: 1e13 // Ajustar el límite de pixeles según sea necesario
    });
    // Extraer el área en metros cuadrados
    var pixelNBR = ee.Number(areaNBR.get('B5'));
    var areNBRha = pixelNBR.divide(11.11);
    if (areNBRha.getInfo()>2) {
      var txtareNBR = ui.Label({value: 'Area NBR Despues: '+ areNBRha.getInfo().toFixed(2) + ' ha', style: {fontWeight: 'bold', fontSize: '12px', margin: '8px 8px', color: '#32266B'}});
      Map.addLayer(iNBRdespues, {palette:"03d3fc"}, 'NBR Despues MASK', 0);
      panel.add(txtareNBR);
    }
    // Calcular el cantidad de pixeles con datos
    var areaMSI= iMSIdespues.reduceRegion({
      reducer: ee.Reducer.count(),
      geometry: zona, // Limitar el cálculo al área de interés definida por geometrias
      scale: 30, // Escala para el cálculo
      maxPixels: 1e13 // Ajustar el límite de pixeles según sea necesario
    });
    // Extraer el área en metros cuadrados
    var pixelMSI = ee.Number(areaMSI.get('B5'));
    var areMSIha = pixelMSI.divide(11.11);
    if (areMSIha.getInfo()>2){
      var txtareMSI = ui.Label({value: 'Area MSI Despues: '+ areMSIha.getInfo().toFixed(2) + ' ha', style: {fontWeight: 'bold', fontSize: '12px', margin: '8px 8px', color: '#32266B'}});
      Map.addLayer(iMSIdespues, {palette:"FF0000"}, 'MSI Despues MASK', 0);
      panel.add(txtareMSI);
    }
    Map.addLayer(reclasificacion2, reclasVis, 'Reclasificación ΔNBR');
    
    if (areNBRha.getInfo()>2 || areMSIha.getInfo()>2){
      
      var urlimg = despues.getDownloadURL({filename: 'Imagen',bands: ["B4", "B5", "B6"], region: zona.geometry(), scale: 30, format: 'GEO_TIFF'});
      var linkimg = ui.Label({value: 'Descargar Imagen'});
      linkimg.setUrl(urlimg);
      panel.add(linkimg);
      var urlDnbrReclas = reclasificacion1.getDownloadURL({filename: 'DNBR reclass',bands: ["rdnbr"], region: zona.geometry(), scale: 30, format: 'GEO_TIFF'});
      var linkDnbrReclas = ui.Label({value: 'Descargar DNBR reclasificado'});
      linkDnbrReclas.setUrl(urlDnbrReclas);
      panel.add(linkDnbrReclas);
      var urlNbrAntes = nbrAntes.getDownloadURL({filename: 'NBR antes',bands: ["B5"], region: zona.geometry(), scale: 30, format: 'GEO_TIFF'});
      var linkNbrAntes = ui.Label({value: 'Descargar NBR antes'});
      linkNbrAntes.setUrl(urlNbrAntes);
      panel.add(linkNbrAntes);
      var urlNbrDespues = nbrDespues.getDownloadURL({filename: 'NBR Despues',bands: ["B5"], region: zona.geometry(), scale: 30, format: 'GEO_TIFF'});
      var linkNbrDespues = ui.Label({value: 'Descargar NBR Despues'});
      linkNbrDespues.setUrl(urlNbrDespues);
      panel.add(linkNbrDespues);
      var urlDnbr = dnbr.getDownloadURL({filename: 'DNBR',bands: ["dnbr"], region: zona.geometry(), scale: 30, format: 'GEO_TIFF'});
      var linkDnbr = ui.Label({value: 'Descargar DNBR'});
      linkDnbr.setUrl(urlDnbr);
      panel.add(linkDnbr);
    }
  }else{
    var txtNotDownload = ui.Label({value: 'No se han podido generar los links de descarga, revise el tamaño de AOI'});
    panel.add(txtNotDownload); 

    
  }

  
}

function downloadImg(feature){
    print('Inicia descarga')
    Export.image.toDrive({
      image: reclasificacion2,
      description: 'Reclasificacion_DNBR',
      scale: 10,
      region: feature.geometry(),
      fileFormat: 'GeoTIFF',
      maxPixels: 1E13
    });
  }
exports.indexnbrs2 = indexnbrs2;
exports.indexnbrl8 = indexnbrl8;
exports.downloadImg = downloadImg;

