//MODULOS
var funindexnbr = require('users/bosquesecuador2022/SATA:APP_INCENDIOS/backend.js');

//funcion para la inicializacion de la app
function inicialize(){
  //limpiamos las capas del mapa
  Map.clear();
  var contorno = ee.FeatureCollection('projects/eesata-fabriciogarcesmaate/assets/CONTORNO_ECU');
  Map.centerObject(contorno,6);
  Map.setOptions('HYBRID');
  //creamos el panel
  var panelprincipal = ui.Panel({
    layout: ui.Panel.Layout.flow('vertical'),
    style: {width: '400px', height: '100%', position: 'top-left', margin: '8px 8px'}
  });
  var panelparametros = ui.Panel({layout: ui.Panel.Layout.flow('vertical'), style: {width: '350px', border: '2px solid black', position: 'top-left', margin: '8px 8px'}});
  //añadimos a la raiz de la interfaz
  ui.root.add(panelprincipal);
  //TEXTOS PRINCIPALES
  var label1PD = ui.Label({value: 'Ministerio del Ambiente, Agua y Transición Ecológica', style: {fontWeight: 'bold', fontSize: '24px', margin: '8px 8px', color: '#32266B'}});
  var label2PD= ui.Label({value: 'PLATAFORMA PARA LA GENERACION DE SUPERFICIES DE QUEMA',style: {fontWeight: 'bold', fontSize: '20px', margin: '8px 8px', color:'#FFC600'}});
  panelprincipal.add(label1PD).add(label2PD);
  //TEXTOS PARA FECHAS
  var label3PD= ui.Label({value: 'Ingrese la fecha de fin del Incendio: ', style: {fontWeight: 'bold', fontSize: '12px', margin: '8px 8px', color:'black'}});
  var date1 = ui.DateSlider({start: ee.Date(Date.now()).advance(-10, 'year'),end: ee.Date(Date.now()).advance(-2, 'day'),onChange: fundate});
  //Declaracion de variables globales
  var fecha1, fecha2, sensor, feature;
  function fundate() {
    var fechafin = date1.getValue();
    fecha1 = ee.Date(fechafin[0]).format('yyyy-MM-dd');
    fecha2 = ee.Date(fechafin[0]).advance(21, 'day').format('yyyy-MM-dd');
    label5PD.style().set('shown', true);
    selectSensor.style().set('shown', true);
  }
  //dicionario de sensores para el calculo
  var dicSensor={'Sentinel 2': [1],'Lansat 8': [2]};
  var label5PD= ui.Label({value: 'Seleccione el sensor para los calculos: ', style: {fontWeight: 'bold', fontSize: '12px', margin: '8px 8px', color:'black', shown: false}});
  //selector de sensor
  var selectSensor = ui.Select({
    items:Object.keys(dicSensor),
    placeholder:'Seleccione el sensor',
    onChange: function(){
      sensor = selectSensor.getValue();
      label6PD.style().set('shown', true);
      nubesSlider.style().set('shown', true);
    },
    style: {position:'top-center', shown: false}
  });
  //Texto para coberturas de nubes
  var label6PD= ui.Label({value: 'Ingrese el porcentaje de cobertura de nubes: ', style: {fontWeight: 'bold', fontSize: '12px', margin: '8px 8px', color:'black', shown: false}});
  var nubesSlider = ui.Slider({
    min: 20,
    max: 90,
    step: 5,
    value: 70,
    onChange: function(){
      label7PD.style().set('shown', true);
      selectAre.style().set('shown', true);
    }, style: {position:'top-center', shown: false}
  });
  var label7PD= ui.Label({value: 'Seleccione el método ROI: ', style: {fontWeight: 'bold', fontSize: '12px', margin: '8px 8px', color:'black', shown: false}});
  var dicAre={'En base a cuadrantes': [1],'Dibujo sobre el mapa': [2]};
  var label9PD= ui.Label({value: 'Seleccione el área de interés: ', style: {fontWeight: 'bold', fontSize: '12px', margin: '8px 8px', color:'black', shown: false}});
  var selectAre = ui.Select({
    items:Object.keys(dicAre),
    placeholder:'Seleccione el metodo de obtencion de ROI',
    onChange: function(){
      var metROI = selectAre.getValue();
      if(metROI==="En base a cuadrantes"){
        label9PD.style().set('shown', true);
        selectfield.style().set('shown', true);
        //mostrarCuadrantes();
      }else if(metROI==="Dibujo sobre el mapa"){
       label9PD.style().set('shown', true);
       btn_start.style().set('shown', true);
       btn_restart.style().set('shown', true);
       btn_stop.style().set('shown', true);
       btn_run.style().set('shown', true);
       
    }else{
      print("ERROR LOGICO");
    }
    },
    style: {position: 'top-center', shown: false}
    });
  var labelroi= ui.Label({
                value: '',
                style: {fontWeight: 'bold', fontSize: '12px', margin: '8px 8px', color:'black', shown: false}
              });
  var boxfield = ui.Textbox({placeholder: 'Ingrese la zona de estudio', value: '', onChange: function(){
                var cuadrantes = ee.FeatureCollection('projects/ee-bosquesecuador2022/assets/SATA/cuadrantes_v3_gee_32717');
                var table = boxfield.getValue().split(',').map(function(item){
                return item.trim()});
                feature = cuadrantes.filter(ee.Filter.inList(campo, table));
                btn_run.style().set('shown', true);
              }, style:{shown: false}});
  var campo;
  var dicsec={'Zona': [1],'Subzona': [2], 'Cuadrantes':[3]};
  var selectfield = ui.Select({
          items:Object.keys(dicsec),
          placeholder:'Seleccione el campo',
          onChange: function(){
            var field = selectfield.getValue();
            if(field==="Zona"){
              labelroi.setValue('Ingrese la zona de estudio');
              boxfield.setValue('Ejm. 01, 02, 03....');
              campo = 'zona';
            }else if(field==="Subzona"){
              labelroi.setValue('Ingrese la subzona de estudio');
              boxfield.setValue('Ejm. 01A, 01B, 01C....');
              campo = 'subzona';
            }else if(field==="Cuadrantes"){
              labelroi.setValue('Ingrese los cuadrantes de estudio');
              boxfield.setValue('Ejm. 01A01, 01A02, 01A03....');
              campo = 'cod_cuadra';
            }else{
              print('No selecciono nada');
            }
            labelroi.style().set('shown', true);
            boxfield.style().set('shown', true);
          },
          style: {position:'top-center', shown: false}});
  /*function mostrarCuadrantes(){
    var cuadrantes = ee.FeatureCollection('projects/eesata-fabriciogarcesmaate/assets/cuadrantes_v3_gee_32717');
    // var label8PD= ui.Label({value: 'Seleccione el área de interés: ', style: {fontWeight: 'bold', fontSize: '12px', margin: '8px 8px', color:'black'}});
    label9PD.style().set('shown', true);
    var dicsec={'Zona': [1],'Subzona': [2], 'Cuadrantes':[3]};
    var selectfield = ui.Select({
          items:Object.keys(dicsec),
          placeholder:'Seleccione el campo',
          onChange: function(){
            var field = selectfield.getValue();
            var txt_label_field, txt_field, campo;
            if(field==="Zona"){
              txt_label_field='Ingrese la zona de estudio'; 
              txt_field = 'Ejm. 01, 02, 03....';
              campo = 'zona';
            }else if(field==="Subzona"){
              txt_label_field='Ingrese la subzona de estudio'; 
              txt_field = 'Ejm. 01A, 01B, 01C....';
              campo = 'subzona';
            }else if(field==="Cuadrantes"){
              txt_label_field='Ingrese los cuadrantes de estudio'; 
              txt_field = 'Ejm. 01A01, 01A02, 01A03....';
              campo = 'cod_cuadra';
            }
            var labelroi= ui.Label({
                value: txt_label_field,
                style: {fontWeight: 'bold', fontSize: '12px', margin: '8px 8px', color:'black'}
              });
            var boxfield = ui.Textbox({placeholder: 'Ingrese la zona de estudio', value: txt_field,
              onChange: function(){
                var table = boxfield.getValue().split(',').map(function(item){
                return item.trim()});
                feature = cuadrantes.filter(ee.Filter.inList(campo, table));
                //panelparametros.add(btn_run);
                btn_run.style().set('shown', true);
              }
            });
            panelparametros.add(labelroi).add(boxfield);
          },
          style: {position: 'top-center'}
    });
    label9PD.style().set('shown', true);
    selectfield.style().set('shown', true);
    panelparametros.add(selectfield);
  }  */
  //var btn_draw = ui.Button({label: 'Herramienta de dibujo'+ ' 📍', onClick:drawPolygon});
  
  // Initialize drawing tools
  var drawingTools = Map.drawingTools();
  drawingTools.setShown(false);
  
  // Buttons to control drawing and calculation
  var btn_start = ui.Button({
    label: 'Dibuje el área de interés 🌎',
    onClick: function() {
      startDrawing(); // Call the function to start drawing
    }, style: {shown: false}
  });
  
  var btn_stop = ui.Button({
    label: 'Finalizar dibujo 🛑', 
    onClick: function() {
      stopDrawing(); // Call the function to stop drawing
    }, style: {shown: false}
  });
  
  var btn_restart = ui.Button({
    label: 'Borrar/reiniciar dibujo 🔄',
    onClick: function() {
      restartDrawing(); // Call the function to restart drawing
    }, style: {shown: false}
  });
  
  // Function to start drawing the rectangle
  function startDrawing() {
    clearGeometry(); // Clear any previous geometry before starting
    drawingTools.setShape('rectangle'); // Set shape to rectangle
    drawingTools.setShown(false); // Show the drawing tools
    drawingTools.draw(); // Initiate the drawing
  
    // Event listener for when drawing is completed
    drawingTools.onDraw(function() {
      styleGeometry(); // Apply the style to the drawn geometry
      
    });
  
    // Hide the calculate button when starting to draw
    btn_run.style().set('shown', false);
  }

  // Function to apply style to the drawn geometry
  function styleGeometry() {
    var layers = drawingTools.layers();
    if (layers.length() > 0) {
      var geometryLayer = layers.get(0); // Get the geometry layer
      geometryLayer.setColor('white'); // Outline color
    }
  }
  
  
  // Function to stop drawing
  function stopDrawing() {
    drawingTools.stop();
    drawingTools.setShown(false);// Hide drawing tools
    feature = getDrawnGeometry();
    btn_run.style().set('shown', true); // Show the calculate button
  }
  
  // Function to restart drawing
  function restartDrawing() {
    clearGeometry(); // Clear the geometry layer
    btn_run.style().set('shown', false);
  }
  
  // Function to clear existing geometry
  function clearGeometry() {
    // Remove all layers from the drawing tool
    drawingTools.layers().reset();
    drawingTools.stop(); // Ensure any ongoing drawing is stopped
  }
  
  // Function to get the drawn geometry
  function getDrawnGeometry() {
    var layers = drawingTools.layers();
    if (layers.length() > 0 && layers.get(0).geometries().length() > 0) {
      return layers.get(0).geometries().get(0);
    } else {
      print('No hay polígono dibujado.');
      return null;
    }
  }

  

  var btn_run = ui.Button({
    label: 'Calcular 🔥',
    onClick: function(){
      var nubes = nubesSlider.getValue();
      var metROI = selectAre.getValue();
      // Validación de todos los parámetros
      if (!fecha1 || !fecha2 || !sensor || !feature) {
        print("Por favor, complete todos los parámetros antes de continuar.");
        return;
      }
      if (metROI === "Dibujo sobre el mapa") {
        var drawnGeom = getDrawnGeometry();
        if (!drawnGeom) {
          print("No se ha seleccionado ninguna geometría.");
          return;
        }
        feature = ee.FeatureCollection(drawnGeom);
      }
      
      if(selectSensor.getValue()==="Sentinel 2"){
        funindexnbr.indexnbrs2(fecha1, fecha2, nubesSlider.getValue(), sensor, feature, panel_resultados);
      }
      else if(selectSensor.getValue()==="Lansat 8"){
        funindexnbr.indexnbrl8(fecha1, fecha2, nubesSlider.getValue(), sensor, feature, panel_resultados);
      }
      else {
        print("Faltan parametros");
      }
            //panelparametros.add(btn_reset);
    },
  style: {shown: false}
  });
  var btn_reset = ui.Button({
    label: 'Reset',
    style: {width: '200px', color: '#EB7B59', padding: '5px 5px 15px 5px',},
    onClick: function(){
      print('reset');
      Map.clear();
      panelparametros.clear();
      drawingTools.layers().reset;
      drawingTools.setShape(null);
      feature = null;
      inicialize();
    }
  });
  var btn_download = ui.Button({
    label: 'Download',
    style: {width: '200px', color: '#EB7B59', padding: '5px 5px 15px 5px',},
    onClick: function(){
      print('Download');
      var firstFeature = ee.Feature(feature.first());
      funindexnbr.downloadImg(firstFeature);
    }
  });
  
  panelparametros.add(label3PD).add(date1).add(label5PD).add(selectSensor).add(label6PD).add(nubesSlider).add(label7PD).add(selectAre)
                  .add(label9PD).add(btn_start).add(btn_restart).add(btn_stop).add(selectfield).add(labelroi).add(boxfield).add(btn_run).add(btn_download);
  
  var panel_resultados = ui.Panel({layout: ui.Panel.Layout.flow('vertical'),style: {width: '400px', height: 'auto', position: 'top-left'}});
  panelprincipal.add(panelparametros).add(panel_resultados);
}


inicialize();