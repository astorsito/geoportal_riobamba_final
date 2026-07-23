"use strict";

/*
  Este archivo controla el funcionamiento general del geoportal:
  inicializa el mapa, carga el límite urbano, muestra las vías,
  obtiene los reportes desde GeoServer y aplica los filtros.
*/
const CONFIGURACION = {
    urlGeoServer: "https://beverages-wings-joke-championships.trycloudflare.com/geoserver/geoalerta",
    intervaloActualizacion: 30000,

    /*
      Durante la demostración local se muestran los datos completos.
      Para publicar el geoportal, cambia este valor a false para
      ocultar parcialmente cédulas y números telefónicos.
    */
    mostrarDatosSensibles: true,
};

/* Referencias a los elementos principales de la interfaz. */
const elementos = {
    estadoServidor: document.getElementById(
        "estadoServidor",
    ),

    textoEstadoServidor: document.getElementById(
        "textoEstadoServidor",
    ),

    totalReportes: document.getElementById(
        "totalReportes",
    ),

    reportesVisibles: document.getElementById(
        "reportesVisibles",
    ),

    formularioFiltros: document.getElementById(
        "formularioFiltros",
    ),

    filtroTipo: document.getElementById(
        "filtroTipo",
    ),

    filtroGenero: document.getElementById(
        "filtroGenero",
    ),

    edadMinima: document.getElementById(
        "edadMinima",
    ),

    edadMaxima: document.getElementById(
        "edadMaxima",
    ),

    fechaDesde: document.getElementById(
        "fechaDesde",
    ),

    fechaHasta: document.getElementById(
        "fechaHasta",
    ),

    horaDesde: document.getElementById(
        "horaDesde",
    ),

    horaHasta: document.getElementById(
        "horaHasta",
    ),

    botonLimpiar: document.getElementById(
        "botonLimpiar",
    ),

    botonActualizar: document.getElementById(
        "botonActualizar",
    ),

    listaReportes: document.getElementById(
        "listaReportes",
    ),

    textoUltimaActualizacion: document.getElementById(
        "textoUltimaActualizacion",
    ),

    notificacion: document.getElementById(
        "notificacion",
    ),

    panelLateral: document.getElementById(
        "panelLateral",
    ),

    botonAbrirPanel: document.getElementById(
        "botonAbrirPanel",
    ),

    botonCerrarPanel: document.getElementById(
        "botonCerrarPanel",
    ),
};

/* Variables que almacenan los reportes y marcadores. */
let reportesOriginales = [];
let marcadoresPorId = new Map();
let primeraCarga = true;
let temporizadorNotificacion = null;

/* Inicializa el mapa centrado en Riobamba. */
const mapa = L.map("mapa", {
    center: [-1.6605, -78.6515],
    zoom: 13,
    zoomControl: false,
    preferCanvas: true,
});

/* Coloca los botones de zoom en la esquina superior derecha. */
L.control.zoom({
    position: "topright",
}).addTo(mapa);

/*
  Carga OpenStreetMap como mapa base.
  La clase mapa-base reduce ligeramente la intensidad del fondo
  para que las capas del proyecto sean más visibles.
*/
const mapaBase = L.tileLayer(
    "https://tile.openstreetmap.org/{z}/{x}/{y}.png",
    {
        maxZoom: 19,
        className: "mapa-base",
        attribution:
            '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors',
    },
).addTo(mapa);

/* Dirección del servicio WMS de GeoServer. */
const urlWms =
    `${CONFIGURACION.urlGeoServer}/wms`;

/*
  Se crean paneles independientes para controlar el orden
  visual de las capas.
*/
mapa.createPane("panelVias");
mapa.getPane("panelVias").style.zIndex = "410";
mapa.getPane("panelVias").style.pointerEvents = "none";

mapa.createPane("panelLimiteHalo");
mapa.getPane("panelLimiteHalo").style.zIndex = "425";
mapa.getPane("panelLimiteHalo").style.pointerEvents = "none";

mapa.createPane("panelLimite");
mapa.getPane("panelLimite").style.zIndex = "430";
mapa.getPane("panelLimite").style.pointerEvents = "none";

/* Carga las vías urbanas mediante WMS. */
const capaVias = L.tileLayer.wms(
    urlWms,
    {
        layers: "geoalerta:riobamba_vias_urbanas",
        styles: "vias_geoalerta",
        format: "image/png",
        transparent: true,
        version: "1.1.1",
        tiled: true,
        opacity: 0.82,
        pane: "panelVias",
    },
).addTo(mapa);

/* Configuración de las capas del límite urbano por WFS. */
const capaLimiteHalo = L.geoJSON(
    null,
    {
        pane: "panelLimiteHalo",
        interactive: false,
        style: {
            color: "#FFFFFF",
            weight: 8,
            opacity: 0.96,
            fillOpacity: 0,
            lineCap: "round",
            lineJoin: "round",
        },
    },
);

const capaLimitePrincipal = L.geoJSON(
    null,
    {
        pane: "panelLimite",
        interactive: false,
        style: {
            color: "#6D28D9",
            weight: 4,
            opacity: 1,
            fillColor: "#6D28D9",
            fillOpacity: 0.025,
            lineCap: "round",
            lineJoin: "round",
        },
    },
);

const capaLimite = L.layerGroup([
    capaLimiteHalo,
    capaLimitePrincipal,
]).addTo(mapa);

const capaReportes =
    L.layerGroup().addTo(mapa);

/* Control de capas. */
L.control.layers(
    {
        OpenStreetMap: mapaBase,
    },
    {
        "Límite urbano": capaLimite,
        "Vías urbanas": capaVias,
        "Reportes de emergencia": capaReportes,
    },
    {
        position: "topright",
        collapsed: true,
    },
).addTo(mapa);

let limitesRiobamba =
    L.latLngBounds(
        [-1.69570877, -78.69778183],
        [-1.62336187, -78.62355404],
    );

mapa.fitBounds(
    limitesRiobamba,
    { padding: [25, 25] },
);

function normalizarTexto(valor) {
    return String(valor ?? "")
        .normalize("NFD")
        .replace(/[\u0300-\u036f]/g, "")
        .trim()
        .toLowerCase();
}

function escaparHtml(valor) {
    return String(valor ?? "")
        .replaceAll("&", "&amp;")
        .replaceAll("<", "&lt;")
        .replaceAll(">", "&gt;")
        .replaceAll('"', "&quot;")
        .replaceAll("'", "&#039;");
}

function obtenerCategoria(tipoReporte) {
    const tipo = normalizarTexto(tipoReporte);

    if (tipo.includes("emergencia")) {
        return {
            clase: "medica",
            titulo: "Emergencia médica",
            icono: "fa-kit-medical",
        };
    }

    if (tipo.includes("accidente")) {
        return {
            clase: "accidente",
            titulo: "Accidente",
            icono: "fa-car-burst",
        };
    }

    if (tipo.includes("asalto")) {
        return {
            clase: "asalto",
            titulo: "Asalto",
            icono: "fa-triangle-exclamation",
        };
    }

    return {
        clase: "otro",
        titulo: tipoReporte || "Otro reporte",
        icono: "fa-circle-exclamation",
    };
}

function crearIconoReporte(tipoReporte) {
    const categoria = obtenerCategoria(tipoReporte);
    return L.divIcon({
        className: "",
        html: `
            <div class="marcador-geoalerta ${categoria.clase}">
                <i class="fa-solid ${categoria.icono}"></i>
            </div>
        `,
        iconSize: [36, 36],
        iconAnchor: [18, 34],
        popupAnchor: [0, -31],
    });
}

function formatearFecha(fechaOriginal) {
    if (!fechaOriginal) return "Fecha no disponible";
    const fecha = new Date(fechaOriginal);
    if (Number.isNaN(fecha.getTime())) return String(fechaOriginal);

    return new Intl.DateTimeFormat("es-EC", {
        dateStyle: "medium",
        timeStyle: "short",
    }).format(fecha);
}

function protegerDato(valor, tipo) {
    const texto = String(valor ?? "");
    if (CONFIGURACION.mostrarDatosSensibles || texto.length === 0) {
        return texto || "No registrado";
    }

    if (tipo === "cedula") {
        if (texto.length <= 4) return "****";
        return `${texto.slice(0, 2)}******${texto.slice(-2)}`;
    }

    if (tipo === "telefono") {
        if (texto.length <= 4) return "****";
        return `******${texto.slice(-4)}`;
    }

    return texto;
}

function generarPopup(propiedades, coordenadas) {
    const categoria = obtenerCategoria(propiedades.tipo_reporte);
    const nombreCompleto = [
        propiedades.nombres,
        propiedades.apellidos,
    ].filter(Boolean).join(" ");

    const latitud = Number(coordenadas[1]);
    const longitud = Number(coordenadas[0]);

    return `
        <article class="popup-reporte">
            <header class="popup-encabezado ${categoria.clase}">
                <div class="popup-encabezado-icono">
                    <i class="fa-solid ${categoria.icono}"></i>
                </div>
                <div>
                    <h3>${escaparHtml(categoria.titulo)}</h3>
                    <p>Reporte #${escaparHtml(propiedades.id ?? "S/N")} · ${escaparHtml(formatearFecha(propiedades.fecha_hora))}</p>
                </div>
            </header>
            <div class="popup-cuerpo">
                <p class="popup-descripcion">${escaparHtml(propiedades.descripcion || "Sin descripción registrada.")}</p>
                <div class="popup-dato">
                    <i class="fa-solid fa-user"></i>
                    <div><strong>Ciudadano:</strong> ${escaparHtml(nombreCompleto || "No registrado")}</div>
                </div>
                <div class="popup-dato">
                    <i class="fa-solid fa-id-card"></i>
                    <div><strong>Cédula:</strong> ${escaparHtml(protegerDato(propiedades.cedula, "cedula"))}</div>
                </div>
                <div class="popup-dato">
                    <i class="fa-solid fa-venus-mars"></i>
                    <div><strong>Género y edad:</strong> ${escaparHtml(propiedades.genero || "No registrado")} · ${escaparHtml(propiedades.edad ?? "No registrada")}</div>
                </div>
                <div class="popup-dato">
                    <i class="fa-solid fa-phone"></i>
                    <div><strong>Celular:</strong> ${escaparHtml(protegerDato(propiedades.celular, "telefono"))}</div>
                </div>
                <div class="popup-dato">
                    <i class="fa-solid fa-phone-volume"></i>
                    <div><strong>Contacto de emergencia:</strong> ${escaparHtml(protegerDato(propiedades.celular_contacto_emergencia, "telefono"))}</div>
                </div>
                <div class="popup-coordenadas">
                    Latitud: ${Number.isFinite(latitud) ? latitud.toFixed(6) : "N/D"}<br>
                    Longitud: ${Number.isFinite(longitud) ? longitud.toFixed(6) : "N/D"}
                </div>
            </div>
        </article>
    `;
}

function obtenerSoloFecha(fechaHora) {
    return String(fechaHora ?? "").slice(0, 10);
}

function obtenerSoloHora(fechaHora) {
    return String(fechaHora ?? "").slice(11, 16);
}

function obtenerFiltros() {
    return {
        tipo: normalizarTexto(elementos.filtroTipo.value),
        genero: normalizarTexto(elementos.filtroGenero.value),
        edadMinima: elementos.edadMinima.value === "" ? null : Number(elementos.edadMinima.value),
        edadMaxima: elementos.edadMaxima.value === "" ? null : Number(elementos.edadMaxima.value),
        fechaDesde: elementos.fechaDesde.value,
        fechaHasta: elementos.fechaHasta.value,
        horaDesde: elementos.horaDesde.value,
        horaHasta: elementos.horaHasta.value,
    };
}

function reporteCumpleFiltros(reporte, filtros) {
    const propiedades = reporte.properties || {};
    const tipo = normalizarTexto(propiedades.tipo_reporte);
    const genero = normalizarTexto(propiedades.genero);
    const edad = Number(propiedades.edad);
    const fecha = obtenerSoloFecha(propiedades.fecha_hora);
    const hora = obtenerSoloHora(propiedades.fecha_hora);

    if (filtros.tipo && !tipo.includes(filtros.tipo)) return false;
    if (filtros.genero && !genero.includes(filtros.genero)) return false;
    if (filtros.edadMinima !== null && (Number.isNaN(edad) || edad < filtros.edadMinima)) return false;
    if (filtros.edadMaxima !== null && (Number.isNaN(edad) || edad > filtros.edadMaxima)) return false;
    if (filtros.fechaDesde && fecha < filtros.fechaDesde) return false;
    if (filtros.fechaHasta && fecha > filtros.fechaHasta) return false;
    if (filtros.horaDesde && hora < filtros.horaDesde) return false;
    if (filtros.horaHasta && hora > filtros.horaHasta) return false;

    return true;
}

function actualizarEstadoServidor(correcto, texto) {
    elementos.estadoServidor.classList.toggle("error", !correcto);
    elementos.textoEstadoServidor.textContent = texto;
}

function mostrarNotificacion(mensaje, tipo = "correcto") {
    clearTimeout(temporizadorNotificacion);
    elementos.notificacion.textContent = mensaje;
    elementos.notificacion.className = `notificacion visible ${tipo}`;

    temporizadorNotificacion = setTimeout(() => {
        elementos.notificacion.className = "notificacion";
    }, 3200);
}

function ordenarPorFecha(reportes) {
    return [...reportes].sort((reporteA, reporteB) => {
        const fechaA = new Date(reporteA.properties?.fecha_hora || 0).getTime();
        const fechaB = new Date(reporteB.properties?.fecha_hora || 0).getTime();
        return fechaB - fechaA;
    });
}

function representarReportes(reportes) {
    capaReportes.clearLayers();
    marcadoresPorId.clear();
    let totalMarcadoresValidos = 0;

    reportes.forEach((reporte, indice) => {
        const geometria = reporte.geometry;
        const propiedades = reporte.properties || {};

        if (!geometria || geometria.type !== "Point" || !Array.isArray(geometria.coordinates)) {
            return;
        }

        const [longitud, latitud] = geometria.coordinates;
        if (!Number.isFinite(Number(latitud)) || !Number.isFinite(Number(longitud))) {
            return;
        }

        const marcador = L.marker([Number(latitud), Number(longitud)], {
            icon: crearIconoReporte(propiedades.tipo_reporte),
            title: propiedades.tipo_reporte || "Reporte de emergencia",
            riseOnHover: true,
        });

        marcador.bindPopup(generarPopup(propiedades, geometria.coordinates), {
            maxWidth: 330,
            closeButton: true,
        });

        marcador.addTo(capaReportes);
        totalMarcadoresValidos += 1;

        const identificador = String(propiedades.id ?? reporte.id ?? indice);
        marcadoresPorId.set(identificador, marcador);
    });

    elementos.reportesVisibles.textContent = String(totalMarcadoresValidos);
}

function representarListado(reportes) {
    const ordenados = ordenarPorFecha(reportes);
    const recientes = ordenados.slice(0, 5);

    if (recientes.length === 0) {
        elementos.listaReportes.innerHTML = `
            <div class="estado-vacio">
                <i class="fa-regular fa-folder-open"></i>
                <p>No existen reportes para estos filtros.</p>
            </div>
        `;
        return;
    }

    elementos.listaReportes.innerHTML = recientes.map((reporte, indice) => {
        const propiedades = reporte.properties || {};
        const categoria = obtenerCategoria(propiedades.tipo_reporte);
        const identificador = String(propiedades.id ?? reporte.id ?? indice);
        const nombre = [propiedades.nombres, propiedades.apellidos].filter(Boolean).join(" ");

        return `
            <article class="reporte-lista" data-reporte-id="${escaparHtml(identificador)}" tabindex="0" role="button">
                <div class="reporte-lista-icono ${categoria.clase}">
                    <i class="fa-solid ${categoria.icono}"></i>
                </div>
                <div class="reporte-lista-contenido">
                    <strong>${escaparHtml(categoria.titulo)}</strong>
                    <span>${escaparHtml(formatearFecha(propiedades.fecha_hora))}</span>
                    <span>${escaparHtml(nombre || "Usuario no registrado")}</span>
                </div>
                <span class="reporte-lista-id">#${escaparHtml(propiedades.id ?? "S/N")}</span>
            </article>
        `;
    }).join("");

    document.querySelectorAll(".reporte-lista").forEach((elemento) => {
        const abrirReporte = () => {
            const identificador = elemento.dataset.reporteId;
            const marcador = marcadoresPorId.get(identificador);
            if (!marcador) return;

            mapa.setView(marcador.getLatLng(), 17, { animate: true });
            marcador.openPopup();

            if (window.innerWidth <= 900) {
                elementos.panelLateral.classList.remove("abierto");
            }
        };

        elemento.addEventListener("click", abrirReporte);
        elemento.addEventListener("keydown", (evento) => {
            if (evento.key === "Enter" || evento.key === " ") {
                evento.preventDefault();
                abrirReporte();
            }
        });
    });
}

function aplicarFiltros(mostrarMensaje = true) {
    const filtros = obtenerFiltros();

    if (filtros.edadMinima !== null && filtros.edadMaxima !== null && filtros.edadMinima > filtros.edadMaxima) {
        mostrarNotificacion("La edad mínima no puede ser mayor que la máxima.", "error");
        return;
    }

    if (filtros.fechaDesde && filtros.fechaHasta && filtros.fechaDesde > filtros.fechaHasta) {
        mostrarNotificacion("La fecha inicial no puede ser posterior a la final.", "error");
        return;
    }

    if (filtros.horaDesde && filtros.horaHasta && filtros.horaDesde > filtros.horaHasta) {
        mostrarNotificacion("La hora inicial no puede ser posterior a la final.", "error");
        return;
    }

    const reportesFiltrados = reportesOriginales.filter((reporte) =>
        reporteCumpleFiltros(reporte, filtros)
    );

    representarReportes(reportesFiltrados);
    representarListado(reportesFiltrados);

    if (mostrarMensaje) {
        mostrarNotificacion(`${reportesFiltrados.length} reporte(s) visible(s).`);
    }
}

function limpiarFiltros() {
    elementos.formularioFiltros.reset();
    representarReportes(reportesOriginales);
    representarListado(reportesOriginales);
    mapa.fitBounds(limitesRiobamba, { padding: [25, 25] });
    mostrarNotificacion("Filtros eliminados correctamente.");
}

function construirUrlWfsCapa(nombreCapa) {
    const parametros = new URLSearchParams({
        service: "WFS",
        version: "2.0.0",
        request: "GetFeature",
        typeNames: `geoalerta:${nombreCapa}`,
        outputFormat: "application/json",
        srsName: "EPSG:4326",
    });
    return `${CONFIGURACION.urlGeoServer}/ows?` + parametros.toString();
}

async function cargarLimiteUrbano() {
    const respuesta = await fetch(construirUrlWfsCapa("riobamba_limite_urbano"), {
        method: "GET",
        cache: "no-store",
        headers: { Accept: "application/json" },
    });

    if (!respuesta.ok) {
        throw new Error(`No se pudo cargar el límite urbano. Código ${respuesta.status}.`);
    }

    const geojson = await respuesta.json();
    if (geojson.type !== "FeatureCollection" || !Array.isArray(geojson.features)) {
        throw new Error("La capa del límite urbano no devolvió un GeoJSON válido.");
    }

    capaLimiteHalo.clearLayers();
    capaLimitePrincipal.clearLayers();
    capaLimiteHalo.addData(geojson);
    capaLimitePrincipal.addData(geojson);

    const limitesReales = capaLimitePrincipal.getBounds();
    if (limitesReales.isValid()) {
        limitesRiobamba = limitesReales;
        mapa.fitBounds(limitesRiobamba, { padding: [25, 25] });
    }
}

function construirUrlWfs() {
    return construirUrlWfsCapa("vista_reportes_emergencia");
}

async function cargarReportes(mostrarMensaje = false) {
    try {
        actualizarEstadoServidor(true, "Actualizando información...");
        const iconoActualizar = elementos.botonActualizar.querySelector("i");
        if (iconoActualizar) iconoActualizar.classList.add("fa-spin");

        const respuesta = await fetch(construirUrlWfs(), {
            method: "GET",
            cache: "no-store",
            headers: { Accept: "application/json" },
        });

        if (!respuesta.ok) {
            throw new Error(`GeoServer respondió con código ${respuesta.status}.`);
        }

        const geojson = await respuesta.json();
        if (geojson.type !== "FeatureCollection" || !Array.isArray(geojson.features)) {
            throw new Error("La respuesta recibida no es un GeoJSON válido.");
        }

        reportesOriginales = geojson.features;
        elementos.totalReportes.textContent = String(reportesOriginales.length);

        aplicarFiltros(false);
        actualizarEstadoServidor(true, "GeoServer conectado");

        elementos.textoUltimaActualizacion.textContent = `Actualizado: ${
            new Intl.DateTimeFormat("es-EC", {
                hour: "2-digit",
                minute: "2-digit",
                second: "2-digit",
            }).format(new Date())
        }`;

        if (primeraCarga) {
            primeraCarga = false;
            mapa.fitBounds(limitesRiobamba, { padding: [25, 25] });
        }

        if (mostrarMensaje) {
            mostrarNotificacion("Información actualizada correctamente.");
        }
    } catch (error) {
        console.error("Error al cargar los reportes:", error);
        actualizarEstadoServidor(false, "No se pudo conectar con GeoServer");
        elementos.listaReportes.innerHTML = `
            <div class="estado-vacio">
                <i class="fa-solid fa-triangle-exclamation"></i>
                <p>No fue posible obtener los reportes. Revisa GeoServer y la configuración CORS.</p>
            </div>
        `;
        mostrarNotificacion(error.message || "No se pudo cargar la información.", "error");
    } finally {
        const iconoActualizar = elementos.botonActualizar.querySelector("i");
        if (iconoActualizar) iconoActualizar.classList.remove("fa-spin");
    }
}

elementos.formularioFiltros.addEventListener("submit", (evento) => {
    evento.preventDefault();
    aplicarFiltros(true);
});

elementos.botonLimpiar.addEventListener("click", limpiarFiltros);
elementos.botonActualizar.addEventListener("click", () => cargarReportes(true));

elementos.botonAbrirPanel.addEventListener("click", () => {
    elementos.panelLateral.classList.add("abierto");
});

elementos.botonCerrarPanel.addEventListener("click", () => {
    elementos.panelLateral.classList.remove("abierto");
});

window.addEventListener("resize", () => {
    mapa.invalidateSize();
});

async function iniciarGeoportal() {
    try {
        actualizarEstadoServidor(true, "Cargando límite urbano...");
        await cargarLimiteUrbano();
        await cargarReportes(false);
    } catch (error) {
        console.error("Error durante la carga inicial del geoportal:", error);
        actualizarEstadoServidor(false, "No se pudo completar la carga del geoportal");
        mostrarNotificacion(error.message || "No se pudo cargar el límite urbano.", "error");
    }
}

iniciarGeoportal();

setInterval(() => {
    cargarReportes(false);
}, CONFIGURACION.intervaloActualizacion);
