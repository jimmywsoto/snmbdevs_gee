/// Código para la descarga de alertas RADD en función de las Zonas, Subzonas y cuadrentes de monitoreo del SNMB ///

//Asset con los cuadrantes de monitoreo //
var zona = ee.FeatureCollection("users/juanespinosageography/SATA-2022/cuadrantes_monitoreo_V2");
// Selecci{on de los cuadrantes a evaluar //
var table = zona.filter(ee.Filter.inList('zona', ['11', '12', '13']));

//Map.addLayer(table);


//Exporting RADD forest disturbance alert as GeoTiff (Reiche et al.,2021)
//Website: http://radd-alert.wur.nl
//Citation: Reiche et al. (2021): Forest disturbance alerts for the Congo Basin using Sentinel-1, ERL.

//Instructions for exporting:
//   Before running this script, (1) define a region of interest (roi) to be exported as GeoTiff. The roi can either  
//   be coded as an ee.Geometry, or be drawn in the map window (using the tools provided in the upper left corner
//   of the map window). (2) create/ensure the output folder exisits in google drive to store the exported image(s).
//   Then run the script. When complete, the export task can then be found under 'Tasks' in the  
//   upper right corner. Run this task to export your data.
//    
//   Note 1: If your roi is too large, the data will be split into multiple tiles, which can be merged later into
//           a full coverage GeoTiff in your GIS software of choice, or in Python with gdal_merge:
//           (https://gdal.org/programs/gdal_merge.html).


 
//---------------------------
//Access RADD image collection and define region(s) of interest to be exported as GeoTiff
//---------------------------
var roi = table; //  define region(s) of interest, this can either be drawn in the map window, or be coded as an ee.Geometry
var geography = 'sa'; // 'sa' (south america), 'africa' (africa), 'asia' (asia & pacific)
var scale = 10; //pixel spacing [m]; default is 10 m.
var google_drive_folder = 'test'; //the name of a google drive folder to export images to.  

var radd = ee.ImageCollection('projects/radar-wur/raddalert/v1');
print('RADD image collection:', radd);
 
//----------------------------------------
//Forest baseline
//Primary humid tropical forest mask 2001 from Turubanova et al (2018) with annual (Africa: 2001-2018; Asia: 2001 - 2019) forest loss (Hansen et al 2013) and mangroves (Bunting et al 2018) removed
//----------------------------------------
var forest_baseline = ee.Image(radd.filterMetadata('layer','contains','forest_baseline')
                            .filterMetadata('geography','contains',geography).first());

print('Forest baseline '+ geography + ':',  forest_baseline);

Map.addLayer(forest_baseline, {palette:['black'], opacity: 0.3},'Forest baseline');

//-----------------
//Latest RADD alert
//-----------------
var latest_radd_alert =  ee.Image(radd.filterMetadata('layer','contains','alert')
                            .filterMetadata('geography','contains',geography)
                            .sort('system:time_end', false).first());

print('Latest RADD alert '+ geography+':',latest_radd_alert);

//RADD alert: 2 = unconfirmed (low confidence) alert; 3 = confirmed (high confidence) alert
Map.addLayer(latest_radd_alert.select('Alert'), {min:2,max:3,palette:['blue','coral']}, 'RADD alert');

//RADD alert date: yyDOY (e.g. 21001 = 1 Jan 2021)
Map.addLayer(latest_radd_alert.select('Date'), {min:19000,max:25120, palette: ['violet','red','orange','yellow','green','blue']}, 'RADD alert date');


///--- Cargar la máscara de bosques 2020 ---///
//var bos2020 = ee.Image("users/juanespinosageography/MCUT2020V1_raster");
var bos2020 = ee.Image("users/ecuadorbfast/SATAASSEST/manglar_2022");

var bosque2020 = bos2020.clip(table);

///--- Multiplicar los cambios detectados por la máscara de bosques ---///
var cambiosbosques = (latest_radd_alert.multiply(bosque2020).int32());

///--- Visualizar la máscara de bosques y los cambios seleccionados con el valor DN ---///
Map.addLayer(bosque2020,{min:0.0, max:1.0,palette:['229512']},'máscara bosques 2020');
Map.addLayer(cambiosbosques.select('Date'),{palette:"yellow"},'cambios en bosque 2020');



//Visuaisation paramter
Map.setOptions('Satellite');
Map.centerObject(roi);

//------------------------------------------
//Export the data as GeoTiff to Google Drive
//------------------------------------------

//get version date
var version_date = latest_radd_alert.get('version_date').getInfo();

/*Export.image.toDrive({
  image: latest_radd_alert,
  description: 'radd_alert_'+geography+'_roi_v'+version_date,
  folder:google_drive_folder,
  region: roi,
  scale: scale,
  maxPixels: 10e12,
  crs: 'EPSG:4326'
  });*/

Export.image.toDrive({
  image: cambiosbosques,
  description: 'radd_BOSQUES_'+'_CUADRANTES_v'+version_date,
  folder:google_drive_folder,
  region: roi,
  scale: scale,
  maxPixels: 10e12,
  crs: 'EPSG:4326'
  });  

