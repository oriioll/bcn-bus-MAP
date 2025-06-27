// Coordenadas del área permitida (suroeste y noreste)
const southWest = L.latLng(41.30, 2.05);
const northEast = L.latLng(41.48, 2.25);
const bounds = L.latLngBounds(southWest, northEast);

// Crear el mapa centrado en Barcelona
const map = L.map('map', {
  minZoom: 13,
  maxZoom: 18,
  maxBounds: bounds,
  preferCanvas: true,
  fadeAnimation: false,
  markerZoomAnimation: false
}).setView([41.407597, 2.170374], 13);

// Añadir capa base de OpenStreetMap
L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
  attribution: '&copy; <a href="https://www.openstreetmap.org/">OpenStreetMap</a> contributors',
}).addTo(map);

// Forzar a mantenerse dentro de los límites
map.on('drag', function() {
  map.panInsideBounds(bounds, { animate: false });
});

// Definir icono personalizado
const customIcon = L.icon({
  iconUrl: 'https://cdn0.iconfinder.com/data/icons/small-n-flat/24/678111-map-marker-512.png',
  iconSize: [30, 30],
  className: 'custom-marker-icon'
});

// Crear cluster group con el icono personalizado
const markersCluster = L.markerClusterGroup({
  spiderfyOnMaxZoom: false,
  showCoverageOnHover: false,
  zoomToBoundsOnClick: false,
  maxClusterRadius: 60,
  animate: false,
  animateAddingMarkers: false,
  disableClusteringAtZoom: 17,
  iconCreateFunction: function(cluster) {
    return customIcon;
  }
});
map.addLayer(markersCluster);

// Variables de la API
const app_id = 'fbcb09a7';
const app_key = '267dcd3f102a0cfa4af2575975339ab6';

// Función para obtener información en tiempo real de una parada
function getTiemposRealParada(codiParada, nombreParada) {
  return fetch(`https://api.tmb.cat/v1/ibus/stops/${codiParada}?app_id=${app_id}&app_key=${app_key}`)
    .then(response => {
      if (!response.ok) throw new Error('Error en la respuesta de la API');
      return response.json();
    })
    .then(data => {
      let content = `<div class="popup-content">
        <h3>${nombreParada}</h3>
        <p><strong>Código:</strong> ${codiParada}</p>`;
      
      if (data.data?.ibus?.length > 0) {
        content += `<div class="bus-list">
          <h4>Próximos buses:</h4>
          <table>
            <tr>
              <th>Línea</th>
              <th>Destino</th>
              <th>Llega en</th>
            </tr>`;
        
        data.data.ibus.forEach(bus => {
          const linea = bus.line;
          const destino = bus.destination;
          const tiempo = bus['t-in-min'] <= 0 ? 'AHORA' : `${bus['t-in-min']} min`;
          
          content += `<tr>
            <td><span class="linea-bus">${linea}</span></td>
            <td>${destino}</td>
            <td><strong>${tiempo}</strong></td>
          </tr>`;
        });
        
        content += `</table></div>`;
      } else {
        content += '<p class="no-buses">No hay buses próximos</p>';
      }
      
      content += `<p class="update-time">Actualizado: ${new Date().toLocaleTimeString()}</p></div>`;
      return content;
    })
    .catch(error => {
      console.error('Error obteniendo tiempos reales:', error);
      return `<div class="popup-content error">
        <h3>${nombreParada}</h3>
        <p><strong>Código:</strong> ${codiParada}</p>
        <p class="error-message">Error al cargar información en tiempo real</p>
      </div>`;
    });
}

// Función para cargar paradas con lazy loading
function loadParadas() {
  const loader = L.control({position: 'topright'});
  loader.onAdd = function() {
    this._div = L.DomUtil.create('div', 'loader-control');
    this._div.innerHTML = '<div class="loader">Cargando paradas...</div>';
    return this._div;
  };
  loader.addTo(map);
  
  // Desactivar temporalmente el clustering para mejor rendimiento
  markersCluster.suspendWork();
  
  fetch(`https://api.tmb.cat/v1/transit/parades?app_id=${app_id}&app_key=${app_key}`)
    .then(res => res.json())
    .then(data => {
      const paradas = data.features;
      const markers = [];
      
      // Crear todos los marcadores
      paradas.forEach(parada => {
        const coords = parada.geometry.coordinates;
        const lat = coords[1];
        const lon = coords[0];
        const nombre = parada.properties.NOM_PARADA;
        const codi = parada.properties.CODI_PARADA;
        
        const marker = L.marker([lat, lon], {
          title: nombre,
          codi_parada: codi,
          icon: customIcon
        });
        
        // Configurar el popup con información básica inicial
        marker.bindPopup(`
          <div class="popup-content">
            <h3>${nombre}</h3>
            <p><strong>Código:</strong> ${codi}</p>
            <div class="loading-info">
              <p>Cargando información de buses...</p>
            </div>
          </div>
        `, { maxWidth: 300, minWidth: 250 });
        
        // Evento al abrir el popup
        marker.on('popupopen', function() {
          // Obtener información en tiempo real
          getTiemposRealParada(codi, nombre)
            .then(content => {
              marker.setPopupContent(content);
            });
        });
        
        markers.push(marker);
      });
      
      // Añadir todos los marcadores al cluster
      markersCluster.addLayers(markers);
      markersCluster.resumeWork();
      map.removeControl(loader);
    })
    .catch(err => {
      console.error('Error cargando paradas:', err);
      markersCluster.resumeWork();
      map.removeControl(loader);
      L.control.notice('Error al cargar paradas. Inténtalo de nuevo más tarde.').addTo(map);
    });
}

// Cargar paradas cuando el mapa esté listo
map.whenReady(() => {
  let loadTimeout;
  
  const delayedLoad = () => {
    if (loadTimeout) clearTimeout(loadTimeout);
    loadTimeout = setTimeout(loadParadas, 500);
  };
  
  map.on('moveend', delayedLoad);
  delayedLoad();
});

// Manejar clic en clusters
markersCluster.on('clusterclick', function(a) {
  const cluster = a.layer;
  const markers = cluster.getAllChildMarkers();
  
  let content = '<div class="cluster-popup"><h4>Paradas en esta zona:</h4><ul>';
  
  markers.slice(0, 10).forEach(marker => {
    content += `<li>${marker.options.title} (${marker.options.codi_parada})</li>`;
  });
  
  if (markers.length > 10) {
    content += `<li>...y ${markers.length - 10} más</li>`;
  }
  
  content += '</ul><p>Haz clic en una parada para ver los buses</p></div>';
  
  cluster.bindPopup(content, { maxWidth: 300 }).openPopup();
});