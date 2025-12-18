function getSentinelCollectionLocal(coordInput, messageLabel, labelStyle, startDate, endDate, exportStyle, panel) {
    Map.clear();
    // Leer coordenadas
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

    // Buffer de 5 km
    var buffer = point.buffer(5000);

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

    // ---- calcular nubes localmente dentro del buffer ----
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

        // porcentaje de nubes dentro del buffer
        var cloudPerc = ee.Number(stats.get('SCL')).multiply(100);

        return img.clip(buffer).set('localCloudPerc', cloudPerc);
    }

    var collectionClipped = mosaicCollection.map(addLocalCloudPerc);

    // ordenar por porcentaje de nubes local
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
    Map.addLayer(bufferStyled, {}, 'Buffer 5km');

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
        exportImage(imgLocal, 'S2_Image_' + (i + 1) + '_', fecha, 'GEE Exports', 10, bufferFC, exportStyle);
    }

    // Mejor imagen (menor nubosidad local)
    var mejorImg = ee.Image(lista.get(0));
    var fechaMejorImg = fechas[0];
    var nubesMejorImg = nubes[0].toFixed(2);

    Map.addLayer(mejorImg, vis, 'Mejor imagen (menos nubes)');
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
    exportImage(exportImg, 'S2_BestImage_', fechaMejorImg, 'GEE Exports', 10, bufferFC, exportStyle);
    getUrlImage(exportImg, 'S2_BestImage_' + fechaMejorImg, 10, bufferFC, panel);
}

function exportImage(imageComposed, prefix, name, folder, scale, exportRegion, exportStyle) {
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

function getUrlImage (imageComposed, name, scale, exportRegion, panel) {
    var url = imageComposed.getDownloadURL({ 
        name: name, 
        bands: ['B4','B3','B2'], 
        region: exportRegion.geometry(), 
        scale: scale, 
        format: 'ZIPPED_GEO_TIFF' 
    });
    var link = ui.Label({ value: 'Descargar Mejor Imagen' });
    link.setUrl(url);
    panel.add(link);
}

exports.getSentinelCollectionLocal = getSentinelCollectionLocal;
