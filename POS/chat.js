$(function () {

    // =========================
    // CONFIGURACIÓN
    // =========================
    // ocultar en backend en versión producción
    var WEBHOOK_URL = 'https://hook.us1.make.com/fld3vofootr5aimg6jy0r5m1ob8ed352';
    var POS_WEBHOOK_URL = 'https://hook.us1.make.com/udoxfuc53ng3axncfwssqpvc3kbmdr09';
    var PROJECT_WEBHOOK_URL = 'https://hook.us1.make.com/0em229nad8e86arsx3wzede7fq3mpc14';
    
    // =========================
    // LIBRERÍA RECOMENDADA PARA PREVIEW DE ARCHIVOS
    // =========================
    // FilePond: https://pqina.nl/filepond/
    // - Características: Preview de imágenes, drag & drop, validación, múltiples archivos
    // - CDN CSS: https://unpkg.com/filepond/dist/filepond.css
    // - CDN JS: https://unpkg.com/filepond/dist/filepond.js
    // - Plugins útiles:
    //   * Image Preview: https://unpkg.com/filepond-plugin-image-preview/dist/filepond-plugin-image-preview.js
    //   * Image Preview CSS: https://unpkg.com/filepond-plugin-image-preview/dist/filepond-plugin-image-preview.css
    //   * File Validate Type: https://unpkg.com/filepond-plugin-file-validate-type/dist/filepond-plugin-file-validate-type.js
    //   * File Validate Size: https://unpkg.com/filepond-plugin-file-validate-size/dist/filepond-plugin-file-validate-size.js
    //
    // Alternativa: Dropzone.js (https://www.dropzone.dev/)
    // - Más simple, también con preview y drag & drop
    // - CDN: https://unpkg.com/dropzone@5/dist/min/dropzone.min.css
    // - CDN JS: https://unpkg.com/dropzone@5/dist/min/dropzone.min.js
    // =========================
    var CACHE_KEY_POS = 'pos_cache_data';
    var CACHE_KEY_TIMESTAMP = 'pos_cache_timestamp';
    var CACHE_KEY_TOKEN_EMPRESA = 'token_empresa';
    var CACHE_DURATION_MS = 24 * 60 * 60 * 1000; // 24 horas

    // Variable global para conversationId (se pierde al refrescar)
    var currentConversationId = '';

    // =========================
    // UTILIDADES
    // =========================
    function isMobile() {
        return $(window).width() <= 767;
    }

    /**
     * Obtiene el token de empresa desde la URL o el caché
     * @returns {string|null} - Token de empresa o null si no existe
     */
    function getTokenEmpresa() {
        // Intentar obtener de la URL (parámetro recordID)
        var urlParams = new URLSearchParams(window.location.search);
        var recordID = urlParams.get('recordID');
        
        if (recordID) {
            // Guardar en caché permanente
            try {
                localStorage.setItem(CACHE_KEY_TOKEN_EMPRESA, recordID);
                console.log('Token de empresa guardado en caché:', recordID);
            } catch (e) {
                console.error('Error al guardar token en caché:', e);
            }
            return recordID;
        }
        
        // Si no está en URL, intentar obtener del caché
        try {
            var cachedToken = localStorage.getItem(CACHE_KEY_TOKEN_EMPRESA);
            if (cachedToken) {
                console.log('Token de empresa obtenido del caché:', cachedToken);
                return cachedToken;
            }
        } catch (e) {
            console.error('Error al leer token del caché:', e);
        }
        
        return null;
    }

    // =========================
    // GESTIÓN DE CACHE Y POS
    // =========================
    
    /**
     * Convierte una imagen URL a base64 usando CORS proxy
     * @param {string} imageUrl - URL de la imagen a convertir
     * @returns {Promise<string>} - Imagen en formato base64
     */
    function imageUrlToBase64(imageUrl) {
        return new Promise(function(resolve, reject) {
            var img = new Image();
            img.crossOrigin = 'Anonymous';
            
            img.onload = function() {
                var canvas = document.createElement('canvas');
                canvas.width = img.width;
                canvas.height = img.height;
                var ctx = canvas.getContext('2d');
                ctx.drawImage(img, 0, 0);
                
                try {
                    var dataURL = canvas.toDataURL('image/jpeg', 0.8);
                    resolve(dataURL);
                } catch (e) {
                    console.error('Error al convertir imagen:', e);
                    // Si falla la conversión, devolver URL genérica
                    resolve('https://mehedihtml.com/chatbox/assets/img/user.png');
                }
            };
            
            img.onerror = function() {
                console.error('Error al cargar imagen:', imageUrl);
                // Devolver imagen por defecto si falla
                resolve('https://mehedihtml.com/chatbox/assets/img/user.png');
            };
            
            // Usar la imagen directamente (si el servidor soporta CORS)
            // o usar un proxy CORS si es necesario
            img.src = imageUrl;
        });
    }

    /**
     * Verifica si el caché sigue siendo válido (menos de 24 horas)
     * @returns {boolean} - true si el caché es válido
     */
    function isCacheValid() {
        try {
            var timestamp = localStorage.getItem(CACHE_KEY_TIMESTAMP);
            if (!timestamp) return false;
            
            var cacheTime = parseInt(timestamp, 10);
            var currentTime = new Date().getTime();
            var timeDiff = currentTime - cacheTime;
            
            return timeDiff < CACHE_DURATION_MS;
        } catch (e) {
            console.error('Error al verificar caché:', e);
            return false;
        }
    }

    /**
     * Obtiene los POS del caché si está disponible y válido
     * @returns {Array|null} - Array de POS o null si no hay caché válido
     */
    function getPOSFromCache() {
        try {
            if (!isCacheValid()) {
                console.log('Caché expirado o no existe');
                return null;
            }
            
            var cachedData = localStorage.getItem(CACHE_KEY_POS);
            if (!cachedData) return null;
            
            console.log('Usando datos del caché');
            return JSON.parse(cachedData);
        } catch (e) {
            console.error('Error al leer caché:', e);
            return null;
        }
    }

    /**
     * Guarda los POS en el caché con timestamp
     * @param {Array} posData - Array de objetos POS
     */
    function savePOSToCache(posData) {
        try {
            localStorage.setItem(CACHE_KEY_POS, JSON.stringify(posData));
            localStorage.setItem(CACHE_KEY_TIMESTAMP, new Date().getTime().toString());
            console.log('Datos guardados en caché');
        } catch (e) {
            console.error('Error al guardar en caché:', e);
        }
    }

    /**
     * Obtiene los POS desde Make y los cachea con imágenes descargadas
     * @param {boolean} forceRefresh - Si es true, ignora el caché y fuerza actualización
     * @returns {Promise<Array>} - Array de objetos POS con imágenes en base64
     */
    function fetchPOSFromMake(forceRefresh) {
        return new Promise(function(resolve, reject) {
            // Obtener token de empresa
            var tokenEmpresa = getTokenEmpresa();
            
            // Validar que existe el token
            if (!tokenEmpresa) {
                Swal.fire({
                    icon: 'error',
                    title: 'Token no válido',
                    text: 'No se ha enviado el token correcto. Accede a la función desde la aplicación para actualizarlo.',
                    confirmButtonText: 'Aceptar'
                });
                reject(new Error('Token de empresa no disponible'));
                return;
            }

            // Verificar caché primero si no se fuerza actualización
            if (!forceRefresh) {
                var cachedPOS = getPOSFromCache();
                if (cachedPOS) {
                    resolve(cachedPOS);
                    return;
                }
            }

            console.log('Consultando webhook de Make para obtener POS...');
            
            // Construir URL con el parámetro IdEmpresa
            var urlWithParams = POS_WEBHOOK_URL + '?IdEmpresa=' + encodeURIComponent(tokenEmpresa);
            
            // Llamar al webhook
            fetch(urlWithParams, {
                method: 'GET'
            })
            .then(function(response) {
                console.log('Status de respuesta POS:', response.status, response.statusText);
                
                if (!response.ok) {
                    throw new Error('Error en la respuesta del servidor: ' + response.status);
                }
                
                // Intentar parsear la respuesta como JSON con manejo de errores
                return response.text().then(function(text) {
                    console.log('Respuesta POS (raw):', text.substring(0, 200));
                    
                    if (!text || text.trim() === '') {
                        throw new Error('El servidor respondió con una respuesta vacía');
                    }
                    
                    try {
                        return JSON.parse(text);
                    } catch (parseError) {
                        console.error('Error al parsear JSON de POS:', parseError);
                        
                        if (text.trim().startsWith('<')) {
                            throw new Error('El servidor respondió con HTML. Verifica la URL del webhook.');
                        }
                        
                        throw new Error('Formato de respuesta inválido del servidor de POS');
                    }
                });
            })
            .then(function(data) {
                console.log('Respuesta POS recibida:', data);
                
                // Verificar si hay un error en la respuesta
                if (data && data.error) {
                    throw new Error(data.error);
                }
                
                // Verificar que sea un array válido
                if (!Array.isArray(data)) {
                    throw new Error('La respuesta no es un array válido. Recibido: ' + typeof data);
                }

                console.log('POS recibidos:', data.length);
                var posArray = data;

                // Descargar y convertir todas las imágenes a base64
                var imagePromises = posArray.map(function(pos) {
                    if (pos.Imagen) {
                        return imageUrlToBase64(pos.Imagen).then(function(base64Image) {
                            return {
                                Id: pos.Id,
                                Imagen: base64Image,
                                Nombre: pos.Nombre,
                                Descripcion: pos.Descripcion
                            };
                        });
                    } else {
                        // Si no hay imagen, usar la por defecto
                        return Promise.resolve({
                            Id: pos.Id,
                            Imagen: 'https://mehedihtml.com/chatbox/assets/img/user.png',
                            Nombre: pos.Nombre,
                            Descripcion: pos.Descripcion
                        });
                    }
                });

                return Promise.all(imagePromises);
            })
            .then(function(posWithBase64Images) {
                // Guardar en caché
                savePOSToCache(posWithBase64Images);
                console.log('POS procesados y guardados en caché:', posWithBase64Images.length);
                resolve(posWithBase64Images);
            })
            .catch(function(error) {
                console.error('Error al obtener POS:', error);
                
                // Intentar usar caché aunque esté expirado como fallback
                var cachedPOS = localStorage.getItem(CACHE_KEY_POS);
                if (cachedPOS) {
                    console.log('Usando caché expirado como fallback');
                    
                    Swal.fire({
                        icon: 'warning',
                        title: 'Usando datos guardados',
                        text: 'No se pudieron obtener datos actualizados. Mostrando última versión guardada.',
                        confirmButtonText: 'Aceptar'
                    });
                    
                    try {
                        resolve(JSON.parse(cachedPOS));
                    } catch (e) {
                        Swal.fire({
                            icon: 'error',
                            title: 'Error crítico',
                            text: 'No se pudieron cargar los datos. Por favor, intenta nuevamente.',
                            confirmButtonText: 'Aceptar'
                        });
                        reject(error);
                    }
                } else {
                    Swal.fire({
                        icon: 'error',
                        title: 'Error desconocido',
                        text: 'No se pudieron cargar los datos y no hay información guardada. Si el problema persiste contacta a un administrador.',
                        confirmButtonText: 'Aceptar'
                    });
                    reject(error);
                }
            });
        });
    }

    function getPreferredText($el) {
        if (!$el || $el.length === 0) return '';
        var title = $el.attr('title');
        if (title && title.trim()) return title.trim();
        return $el.text().trim();
    }

    function formatTime(date) {
        var now = date || new Date();
        var hh = now.getHours();
        var mm = String(now.getMinutes()).padStart(2, '0');
        var suffix = hh >= 12 ? 'pm' : 'am';
        var hh12 = ((hh + 11) % 12) + 1;
        return hh12 + ':' + mm + ' ' + suffix;
    }


    // =========================
    // LOADER ANIMADO
    // =========================
    function showLoading() {
        return new Promise(function (resolve) {
            var $overlay = $('<div>', { class: 'chat-loading-overlay', 'aria-hidden': 'false' }).css({
                position: 'absolute',
                inset: 0,
                display: 'flex',
                'align-items': 'center',
                'justify-content': 'center',
                'background': 'rgba(255,255,255,0.85)',
                'z-index': 9999,
                'flex-direction': 'column',
                'gap': '8px',
                padding: '20px'
            });

            var $spinner = $('<div>').css({
                width: '48px',
                height: '48px',
                'border-radius': '50%',
                border: '5px solid #e9e9e9',
                'border-top-color': '#007bff',
                animation: 'chat-rotate 1s linear infinite'
            });

            var $msg = $('<div>', { class: 'chat-loading-msg' }).text('Cargando conversación');
            var dots = 0;
            var dotsInterval = setInterval(function () {
                dots = (dots + 1) % 4;
                $msg.text('Cargando conversación' + '.'.repeat(dots));
            }, 300);

            if ($('#chat-loading-keyframes').length === 0) {
                $('head').append(
                    '<style id="chat-loading-keyframes">' +
                    '@keyframes chat-rotate{from{transform:rotate(0)}to{transform:rotate(360deg)}}' +
                    '.chat-loading-overlay{font-family:inherit;color:#444}' +
                    '</style>'
                );
            }

            $overlay.append($spinner, $msg);
            $('.chatbox').append($overlay);

            setTimeout(function () {
                clearInterval(dotsInterval);
                $overlay.remove();
                resolve();
            }, 1000);
        });
    }


// =========================
// RENDER HEADER
// =========================
function renderHeader(name, description, imageSrc) {
    var $head = $(
        '<div class="msg-head">' +
            '<div class="row">' +
                '<div class="col-8">' +
                    '<div class="d-flex align-items-center">' +
                        '<span class="chat-icon">' +
                            '<img class="img-fluid" src="https://mehedihtml.com/chatbox/assets/img/arroleftt.svg" alt="volver" role="button">' +
                        '</span>' +
                        '<div class="flex-shrink-0">' +
                            '<img class="img-fluid pos-avatar" src="" alt="user img" style="width: 45px; height: 45px; object-fit: cover; border-radius: 50%;">' +
                        '</div>' +
                        '<div class="flex-grow-1 ms-3">' +
                            '<h3></h3>' +
                            '<p></p>' +
                        '</div>' +
                    '</div>' +
                '</div>' +
                '<div class="col-4">' +
                    // 🔹 NUEVO: contenedor con botón + menú
                    '<div class="d-flex justify-content-end align-items-center gap-2">' +
                        // 🔹 NUEVO: botón visible "Guardar conversación"
                        '<button type="button" class="btn-save-conversation">' +
                            '<i class="fa fa-floppy-o" aria-hidden="true"></i> Guardar conversación' +
                        '</button>' +
                    '</div>' +
                '</div>' +
            '</div>' +
        '</div>'
    );

    $head.find('h3').text(name);
    $head.find('p').text(description);
    
    // Establecer imagen del POS o usar por defecto
    var avatarSrc = imageSrc || 'https://mehedihtml.com/chatbox/assets/img/user.png';
    $head.find('.pos-avatar').attr('src', avatarSrc);

    $('.chatbox .msg-head').remove();
    $('.chatbox .modal-content').prepend($head);
}


    // =========================
    // RENDER MENSAJES (DINÁMICO)
    // =========================
    // messages: array de objetos { type: 'sender' | 'repaly' | 'divider', text?, time?, label? }
    function renderMessages(messages) {
        var $modalBody = $(
            '<div class="modal-body">' +
                '<div class="msg-body" tabindex="0" aria-live="polite">' +
                    '<ul></ul>' +
                '</div>' +
            '</div>'
        );

        var $ul = $modalBody.find('ul');

        (messages || []).forEach(function (msg) {
            if (msg.type === 'divider') {
                var $liDiv = $('<li><div class="divider"><h6></h6></div></li>');
                $liDiv.find('h6').text(msg.label || '');
                $ul.append($liDiv);
                return;
            }

            var liClass = msg.type === 'sender' ? 'sender' : 'repaly';
            var $li = $('<li class="' + liClass + '"><p></p><span class="time"></span></li>');
            $li.find('p').text(msg.text || '');
            $li.find('.time').text(msg.time || '');
            $ul.append($li);
        });

        $('.chatbox .modal-body').remove();
        var $content = $('.chatbox .modal-content');
        var $head = $content.find('.msg-head');
        if ($head.length) $head.after($modalBody);
        else $content.prepend($modalBody);

        // scroll al final
        var $msgBody = $('.chatbox .msg-body');
        $msgBody.scrollTop($msgBody.prop('scrollHeight'));
    }


    // =========================
    // AÑADIR UN MENSAJE AL CHAT
    // =========================
    /**
     * Añade un mensaje al chat con animación
     * @param {string} type - 'sender' (POS/Bot responde), 'repaly' (usuario envía), o 'error' (mensaje de error)
     * @param {string} text - Texto/HTML del mensaje
     * @param {string} time - Hora del mensaje
     * @param {boolean} isLoading - Si es un mensaje de carga temporal
     */
    function appendMessage(type, text, time, isLoading) {
        var $li;
        
        // Generar timestamp completo con milisegundos
        var fullTimestamp = new Date().toISOString();
        
        // Mensaje de error especial
        if (type === 'error') {
            $li = $('<li class="message-error">' +
                '<div class="error-container">' +
                    '<div class="error-icon">' +
                        '<i class="fa fa-exclamation-triangle" aria-hidden="true"></i>' +
                    '</div>' +
                    '<div class="error-content"></div>' +
                    '<span class="error-time"></span>' +
                '</div>' +
            '</li>');
            
            $li.find('.error-content').html(text || 'Error desconocido');
            $li.find('.error-time').text(time || '');
        }
        // Mensajes normales (sender o reply)
        else {
            var liClass = type === 'sender' ? 'sender' : 'repaly';
            var loadingClass = isLoading ? ' loading-message' : '';
            
            $li = $('<li class="' + liClass + loadingClass + '">' +
                '<div class="message-content"></div>' +
                '<span class="time" data-timestamp=""></span>' +
            '</li>');
            
            $li.find('.message-content').html(text || '');
            $li.find('.time').text(time || '').attr('data-timestamp', fullTimestamp);
        }
        
        // Agregar animación de entrada
        $li.css('opacity', '0').css('transform', type === 'error' ? 'scale(0.95)' : 'translateY(10px)');

        // Usar selector de hijo directo para evitar conflictos con <ul> dentro del contenido HTML
        var $ul = $('.chatbox .msg-body > ul');
        if ($ul.length) {
            $ul.append($li);
            
            // Animar entrada
            setTimeout(function() {
                $li.css('transition', type === 'error' ? 'all 0.4s cubic-bezier(0.68, -0.55, 0.265, 1.55)' : 'all 0.3s ease');
                $li.css('opacity', '1');
                $li.css('transform', type === 'error' ? 'scale(1)' : 'translateY(0)');
            }, 10);
            
            var $msgBody = $('.chatbox .msg-body');
            $msgBody.animate({ scrollTop: $msgBody.prop('scrollHeight') }, 300);
        }
        
        return $li;
    }
    
    /**
     * Remueve mensaje de carga temporal
     */
    function removeLoadingMessage() {
        // Usar selector de hijo directo para evitar conflictos con <ul> dentro del contenido HTML
        $('.chatbox .msg-body > ul .loading-message').fadeOut(200, function() {
            $(this).remove();
        });
    }


    // =========================
    // GUARDAR COMO PROYECTO
    // =========================
    /**
     * Guarda la conversación actual como proyecto
     * @param {string} projectName - Nombre del proyecto
     * @param {string} posId - ID del POS
     * @param {Array} messages - Array de mensajes {type, text, time}
     * @returns {Promise} - Promesa con la respuesta del servidor
     */
    function saveAsProject(projectName, posId, messages) {
        return new Promise(function(resolve, reject) {
            var tokenEmpresa = getTokenEmpresa();
            
            if (!tokenEmpresa) {
                reject(new Error('Token de empresa no disponible'));
                return;
            }
            
            if (!posId) {
                reject(new Error('ID del POS no disponible'));
                return;
            }
            
            // Convertir mensajes al formato requerido
            var formattedMessages = messages.map(function(msg) {
                // Determinar si es cliente (repaly) o POS (sender)
                var isClient = msg.type === 'repaly';
                
                // Usar timestamp exacto si está disponible, sino usar ISO actual
                var fecha = msg.timestamp || new Date().toISOString();
                
                return {
                    Contenido: msg.html,
                    EsCliente: isClient,
                    Fecha: fecha
                };
            });
            
            // Construir el payload
            var payload = {
                IdPOS: posId,
                IdEmpresa: tokenEmpresa,
                ProyectoNombre: projectName,
                Mensajes: formattedMessages
            };
            
            console.log('Enviando proyecto:', payload);
            
            // Enviar petición
            fetch(PROJECT_WEBHOOK_URL, {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json'
                },
                body: JSON.stringify(payload)
            })
            .then(function(response) {
                console.log('Status de respuesta proyecto:', response.status, response.statusText);
                
                // Verificar errores HTTP
                if (response.status >= 400) {
                    throw new Error('Error del servidor: ' + response.status + ' - ' + response.statusText);
                }
                
                return response.text().then(function(text) {
                    console.log('Respuesta del servidor proyecto (raw):', text);
                    
                    if (!text || text.trim() === '') {
                        throw new Error('El servidor respondió con una respuesta vacía');
                    }
                    
                    try {
                        var data = JSON.parse(text);
                        return data;
                    } catch (parseError) {
                        console.error('Error al parsear JSON:', parseError);
                        
                        if (text.trim().startsWith('<')) {
                            throw new Error('El servidor respondió con HTML. Verifica la configuración del webhook.');
                        }
                        
                        throw new Error('Respuesta no válida del servidor');
                    }
                });
            })
            .then(function(data) {
                console.log('Datos parseados proyecto:', data);
                
                // Verificar si hay un error en la respuesta
                if (data && data.error) {
                    throw new Error(data.error);
                }
                
                // Verificar que tenga los campos esperados
                if (!data || !data.ProyectoID) {
                    throw new Error('Respuesta del servidor no contiene ProyectoID');
                }
                
                resolve(data);
            })
            .catch(function(error) {
                console.error('Error completo en saveAsProject:', error);
                reject(error);
            });
        });
    }

    // =========================
// BOTÓN "GUARDAR CONVERSACIÓN" VISIBLE
// =========================
$('.chatbox').on('click', '.btn-save-conversation', function (e) {
    e.preventDefault();
    // Reutilizamos exactamente el mismo flujo del menú
    $('.chatbox .save-as-project').trigger('click');
});

    // =========================
    // LLAMAR WEBHOOK DE MAKE
    // =========================
    /**
     * Envía mensaje al webhook de Make con todos los datos necesarios
     * @param {string} userText - Mensaje del usuario
     * @param {string} posId - ID del POS actual
     * @param {FileList} files - Archivos adjuntos (opcional)
     * @returns {Promise} - Promesa con la respuesta del servidor
     */
    function sendToMake(userText, posId, files) {
        return new Promise(function(resolve, reject) {
            // Obtener token de empresa
            var tokenEmpresa = getTokenEmpresa();
            
            if (!tokenEmpresa) {
                reject(new Error('Token de empresa no disponible'));
                return;
            }
            
            if (!posId) {
                reject(new Error('ID del POS no disponible'));
                return;
            }
            
            // Crear FormData para enviar archivos y datos
            var formData = new FormData();
            formData.append('message', userText);
            formData.append('posId', posId);
            formData.append('idEmpresa', tokenEmpresa);
            formData.append('conversationId', currentConversationId || '');
            
            // Agregar archivos si existen
            if (files && files.length > 0) {
                for (var i = 0; i < files.length; i++) {
                    formData.append('files', files[i]);
                }
            }
            
            // Enviar petición
            fetch(WEBHOOK_URL, {
                method: 'POST',
                body: formData
            })
            .then(function(response) {
                console.log('Status de respuesta:', response.status, response.statusText);
                
                // Verificar si la respuesta es exitosa (status 200-299)
                if (!response.ok) {
                    throw new Error('Error del servidor: ' + response.status + ' - ' + response.statusText);
                }
                
                // Intentar obtener el texto de la respuesta primero
                return response.text().then(function(text) {
                    console.log('Respuesta del servidor (raw):', text);
                    
                    // Verificar si la respuesta está vacía
                    if (!text || text.trim() === '') {
                        throw new Error('El servidor respondió con una respuesta vacía');
                    }
                    
                    // Intentar parsear como JSON
                    try {
                        var data = JSON.parse(text);
                        return data;
                    } catch (parseError) {
                        console.error('Error al parsear JSON:', parseError);
                        console.error('Texto recibido:', text);
                        
                        // Si el texto parece HTML (error de servidor)
                        if (text.trim().startsWith('<')) {
                            throw new Error('El servidor respondió con HTML en lugar de JSON. Verifica la configuración del webhook.');
                        }
                        
                        // Si es texto plano, intentar usarlo como mensaje
                        if (text.length < 500) {
                            throw new Error('Respuesta no válida: ' + text.substring(0, 100));
                        }
                        
                        throw new Error('El servidor respondió con un formato no válido. Esperaba JSON pero recibió: ' + typeof text);
                    }
                });
            })
            .then(function(data) {
                console.log('Datos parseados:', data);
                
                // Verificar si hay un error en la respuesta JSON
                if (data && data.error) {
                    throw new Error(data.error);
                }
                
                // Verificar si hay un mensaje en la respuesta
                if (!data || !data.message) {
                    // Si data es un string, usarlo como mensaje
                    if (typeof data === 'string') {
                        resolve({ message: data });
                        return;
                    }
                    
                    // Si data es un objeto pero no tiene message, dar más detalles
                    var keys = data ? Object.keys(data).join(', ') : 'ninguna';
                    throw new Error('Respuesta sin mensaje. Propiedades recibidas: ' + keys);
                }
                
                resolve(data);
            })
            .catch(function(error) {
                console.error('Error completo en sendToMake:', error);
                reject(error);
            });
        });
    }


    // =========================
    // RENDER SEND BOX (con readOnly)
    // =========================
    function renderSendBox(readOnly, posId) {
        if (typeof readOnly === 'undefined') readOnly = false;

        var disabledAttr = readOnly ? 'disabled' : '';
        var disabledClass = readOnly ? ' read-only' : '';

var $send = $(
    '<div class="send-box' + disabledClass + '">' +
        '<input type="hidden" class="current-pos-id" value="' + (posId || '') + '">' +
        '<form action="#" onsubmit="return false;" class="send-form">' +
            // NUEVO layout
            '<div class="send-row d-flex align-items-center">' +

                // Botón + redondo
'<button type="button" class="btn-attach" ' + disabledAttr + ' ' +
    (readOnly
        ? 'title="Chat archivado: no se pueden adjuntar archivos"'
        : 'title="Adjuntar archivo"') + '>' +
    '<i class="fa fa-paperclip" aria-hidden="true"></i>' +
'</button>' +


                // Input file oculto (se sigue usando en el JS)
                '<input type="file" name="upload" id="upload" class="upload-box" aria-label="Subir archivo" ' +
                    disabledAttr + ' style="display: none;" multiple>' +

                // Caja de texto larga y redondeada
                '<div class="input-wrapper flex-grow-1">' +
                    '<input type="text" class="form-control send-input" aria-label="message…" ' +
                        'placeholder="Pregúntame lo que quieras…" ' + disabledAttr + '>' +
                '</div>' +

                // Botón ENVIAR fuera
                '<button type="button" class="btn-send" ' + disabledAttr + '>' +
                    '<i class="fa fa-paper-plane" aria-hidden="true"></i> Enviar' +
                '</button>' +

            '</div>' +
        '</form>' +
    '</div>'
);


        $('.chatbox .send-box').remove();
        $('.chatbox .modal-content').append($send);

        if (!readOnly) {
            // Variable para almacenar archivos seleccionados
            var selectedFiles = null;
            
            // Trigger file input when label is clicked
            $('.btn-attach').off('click').on('click', function (e) {
                e.preventDefault();
                $('#upload').trigger('click');
            });

            // Handle file selection
            $('#upload').off('change').on('change', function (e) {
                var files = e.target.files;
                if (files.length > 0) {
                    selectedFiles = files;
                    console.log('Archivos seleccionados:', files.length);
                    
                    // Mostrar indicador visual de archivos adjuntos
                    var fileNames = [];
                    for (var i = 0; i < files.length; i++) {
                        fileNames.push(files[i].name);
                    }
                    
                    // Cambiar color del botón para indicar que hay archivos
                    $('.btn-attach').css('color', '#28a745').attr('title', 'Archivos: ' + fileNames.join(', '));
                    
                    Swal.fire({
                        icon: 'success',
                        title: 'Archivos adjuntados',
                        text: fileNames.join(', '),
                        timer: 2000,
                        showConfirmButton: false,
                        toast: true,
                        position: 'top-end'
                    });
                }
            });

            $('.btn-send').off('click').on('click', function () {
                var text = $('.send-input').val().trim();
                var posId = $('.current-pos-id').val();
                
                // Validar que haya texto o archivos
                if (!text && (!selectedFiles || selectedFiles.length === 0)) {
                    Swal.fire({
                        icon: 'warning',
                        title: 'Mensaje vacío',
                        text: 'Escribe un mensaje o adjunta un archivo',
                        timer: 2000,
                        showConfirmButton: false,
                        toast: true,
                        position: 'top-end'
                    });
                    return;
                }
                
                // Validar POS ID
                if (!posId) {
                    Swal.fire({
                        icon: 'error',
                        title: 'Error',
                        text: 'No se ha seleccionado un POS válido',
                        confirmButtonText: 'Aceptar'
                    });
                    return;
                }

                // 1) Mostrar mensaje del usuario inmediatamente
                var timeUser = formatTime();
                var displayText = text || '📎 Archivo(s) adjunto(s)';
                if (text && selectedFiles && selectedFiles.length > 0) {
                    displayText = text + ' <span style="color: #6c757d; font-size: 12px;">📎 ' + selectedFiles.length + ' archivo(s)</span>';
                }
                appendMessage('repaly', displayText, timeUser);
                
                // Limpiar input y resetear archivos
                $('.send-input').val('');
                var filesToSend = [...(selectedFiles?.length ? selectedFiles : [])]; // clonar FileList
                selectedFiles = null;
                $('#upload').val('');
                $('.btn-attach').css('color', '').attr('title', 'Adjuntar archivo');
                
                // Deshabilitar input mientras se procesa
                $('.send-input, .btn-send, .btn-attach').prop('disabled', true);
                $('.btn-send').html('<i class="fa fa-spinner fa-spin" aria-hidden="true"></i>');

                // 2) Mostrar indicador de "escribiendo..."
                var $loadingMsg = appendMessage('sender', '<i class="fa fa-circle" aria-hidden="true" style="font-size: 6px; margin: 0 2px; animation: blink 1.4s infinite;"></i><i class="fa fa-circle" aria-hidden="true" style="font-size: 6px; margin: 0 2px; animation: blink 1.4s infinite 0.2s;"></i><i class="fa fa-circle" aria-hidden="true" style="font-size: 6px; margin: 0 2px; animation: blink 1.4s infinite 0.4s;"></i>', '', true);
                
                // Agregar animación de parpadeo si no existe
                if ($('#blink-animation').length === 0) {
                    $('head').append(
                        '<style id="blink-animation">' +
                        '@keyframes blink { 0%, 60%, 100% { opacity: 0.3; } 30% { opacity: 1; } }' +
                        '</style>'
                    );
                }

                // 3) Llamar al webhook para obtener respuesta
                sendToMake(text || 'Archivo adjunto', posId, filesToSend)
                    .then(function (data) {
                        // Remover mensaje de carga
                        removeLoadingMessage();
                        
                        // Actualizar conversationId si viene en la respuesta
                        if (data.conversationId) {
                            currentConversationId = data.conversationId;
                            console.log('ConversationId actualizado:', currentConversationId);
                        }
                        
                        var replyText = data.message || 'Respuesta recibida';
                        var timeBot = formatTime();
                        
                        // POS responde como "sender"
                        appendMessage('sender', replyText, timeBot);
                    })
                    .catch(function (err) {
                        console.error('Error webhook:', err);
                        console.error('Stack trace:', err.stack);
                        
                        // Remover mensaje de carga
                        removeLoadingMessage();
                        
                        // Determinar el mensaje de error más apropiado
                        var errorTitle = 'Error al enviar mensaje';
                        var errorMessage = 'Error desconocido';
                        var errorDetails = '';
                        
                        if (err.message) {
                            errorMessage = err.message;
                            
                            // Personalizar mensajes según el tipo de error
                            if (err.message.includes('JSON') || err.message.includes('formato')) {
                                errorTitle = 'Respuesta inválida';
                                errorDetails = 'El servidor no respondió en el formato esperado. Verifica la configuración del webhook.';
                            } else if (err.message.includes('Failed to fetch') || err.message.includes('NetworkError') || err.message.includes('conexión')) {
                                errorTitle = 'Sin conexión';
                                errorDetails = 'No se pudo conectar con el servidor. Verifica tu conexión a internet.';
                            } else if (err.message.includes('Token') || err.message.includes('autenticación')) {
                                errorTitle = 'Error de autenticación';
                                errorDetails = 'Problema con el token. Recarga la página desde la aplicación.';
                            } else if (err.message.includes('POS')) {
                                errorTitle = 'POS no encontrado';
                                errorDetails = 'No se encontró el ID del POS. Selecciona nuevamente la conversación.';
                            } else if (err.message.includes('servidor')) {
                                errorTitle = 'Error del servidor';
                                errorDetails = 'El servidor encontró un problema al procesar tu mensaje.';
                            }
                        }
                        
                        // Construir HTML del error
                        var errorHTML = '<div class="error-title">' + errorTitle + '</div>' +
                                       '<div class="error-message">' + errorMessage + '</div>';
                        
                        if (errorDetails) {
                            errorHTML += '<div class="error-details">' + errorDetails + '</div>';
                        }
                        
                        errorHTML += '<div class="error-footer">Si el problema persiste, contacta al administrador</div>';
                        
                        // Mostrar error en el chat con el nuevo sistema
                        appendMessage('error', errorHTML, formatTime());
                    })
                    .finally(function() {
                        // Rehabilitar input
                        $('.send-input, .btn-send, .btn-attach').prop('disabled', false);
                        $('.btn-send').html('<i class="fa fa-paper-plane" aria-hidden="true"></i>');
                        $('.send-input').focus();
                    });
            });

            $('.send-input').off('keypress').on('keypress', function (e) {
                if (e.key === 'Enter') {
                    e.preventDefault();
                    $('.btn-send').trigger('click');
                }
            });
        }
    }


    // =========================
    // LIMPIAR UI ANTES DE ABRIR
    // =========================
    function prepareForOpen() {
        $('.chatbox .msg-head, .chatbox .modal-body, .chatbox .send-box').remove();
    }


    // =========================
    // ABRIR CONVERSACIÓN
    // =========================
    $('.chat-lists').on('click', '.chat-list a', function (e) {
        e.preventDefault();
        var $a = $(this);

        var name = getPreferredText($a.find('h3'));
        var desc = getPreferredText($a.find('p'));
        var isArchived = $a.closest('.tab-pane').is('#Archivado');
        
        // Limpiar conversationId al abrir nueva conversación
        currentConversationId = '';
        console.log('Nueva conversación iniciada - conversationId limpiado');
        
        // Obtener ID del POS (si existe)
        var posId = $a.attr('data-pos-id') || '';
        
        // Obtener imagen del POS
        var posImage = $a.find('img').attr('src') || '';

        prepareForOpen();
        $('.chatbox').addClass('has-conversation');

        if (isMobile()) {
            $('.chatbox').addClass('showbox'); // aquí se desliza el chat en móvil
            $('.chatlist').addClass('hide-on-mobile');
        }

        showLoading().then(function () {
            renderHeader(name || 'Sin nombre', desc || '', posImage);
            renderMessages();
            renderSendBox(isArchived, posId);
            $('.chatbox .msg-body').focus();
        });
    });


    // =========================
    // GUARDAR COMO PROYECTO (EVENTO)
    // =========================
    $('.chatbox').on('click', '.save-as-project', function (e) {
        e.preventDefault();
        
        // Obtener POS ID actual
        var posId = $('.current-pos-id').val();
        
        if (!posId) {
            Swal.fire({
                icon: 'error',
                title: 'Error',
                text: 'No se ha seleccionado un POS válido',
                confirmButtonText: 'Aceptar'
            });
            return;
        }
        
        // Recolectar mensajes del cliente (repaly) usando selector de hijo directo
        var clientMessages = [];
        $('.chatbox .msg-body > ul > li.repaly').each(function() {
            var $li = $(this);
            var $messageContent = $li.find('.message-content');
            var html = $messageContent.html();
            
            if (html && html.trim()) {
                clientMessages.push({
                    type: 'repaly',
                    html: html.trim()
                });
            }
        });
        
        // Validar que haya al menos un mensaje del cliente
        if (clientMessages.length === 0) {
            Swal.fire({
                icon: 'warning',
                title: 'Sin mensajes',
                text: 'No hay mensajes enviados en esta conversación para guardar como proyecto.',
                confirmButtonText: 'Aceptar'
            });
            return;
        }
        
        // Recolectar TODOS los mensajes (cliente y POS) para el proyecto usando selector de hijo directo
        var allMessages = [];
        $('.chatbox .msg-body > ul > li').each(function() {
            var $li = $(this);
            
            // Ignorar divisores y mensajes de error
            if ($li.find('.divider').length > 0 || $li.hasClass('message-error')) {
                return;
            }
            
            var type = $li.hasClass('sender') ? 'sender' : 'repaly';
            var $messageContent = $li.find('.message-content');
            var html = $messageContent.html();
            var $timeSpan = $li.find('.time');
            var timestamp = $timeSpan.attr('data-timestamp') || new Date().toISOString();
            
            if (html && html.trim()) {
                allMessages.push({
                    type: type,
                    html: html.trim(),
                    timestamp: timestamp
                });
            }
        });
        
        // Mostrar diálogo para nombre del proyecto
        Swal.fire({
            title: 'Guardar como proyecto',
            html: '<input id="swal-project-name" class="swal2-input" placeholder="Nombre del proyecto" style="width: 85%;">',
            icon: 'question',
            showCancelButton: true,
            confirmButtonText: '<i class="fa fa-floppy-o"></i> Guardar',
            cancelButtonText: 'Cancelar',
            customClass: {
                confirmButton: 'btn btn-success',
                cancelButton: 'btn btn-secondary'
            },
            preConfirm: function() {
                var projectName = document.getElementById('swal-project-name').value.trim();
                
                if (!projectName) {
                    Swal.showValidationMessage('Debes escribir un nombre para el proyecto');
                    return false;
                }
                
                return projectName;
            },
            didOpen: function() {
                // Focus en el input
                document.getElementById('swal-project-name').focus();
            }
        }).then(function(result) {
            if (result.isConfirmed && result.value) {
                var projectName = result.value;
                
                // Mostrar loading
                Swal.fire({
                    title: 'Guardando proyecto...',
                    html: 'Por favor espera',
                    allowOutsideClick: false,
                    allowEscapeKey: false,
                    showConfirmButton: false,
                    didOpen: function() {
                        Swal.showLoading();
                    }
                });
                
                // Enviar al webhook
                saveAsProject(projectName, posId, allMessages)
                    .then(function(data) {
                        console.log('Proyecto guardado exitosamente:', data);
                        
                        Swal.fire({
                            icon: 'success',
                            title: '¡Proyecto guardado!',
                            html: '<strong>Proyecto:</strong> ' + data.ProyectoNombre + '<br>' +
                                  '<strong>ID:</strong> ' + data.ProyectoID,
                            confirmButtonText: 'Aceptar'
                        });
                    })
                    .catch(function(error) {
                        console.error('Error al guardar proyecto:', error);
                        
                        var errorMessage = 'No se pudo guardar el proyecto';
                        if (error.message) {
                            errorMessage = error.message;
                        }
                        
                        Swal.fire({
                            icon: 'error',
                            title: 'Error al guardar',
                            text: errorMessage,
                            confirmButtonText: 'Aceptar'
                        });
                    });
            }
        });
    });

    // =========================
    // BOTÓN VOLVER (flecha)
    // =========================
    $('.chatbox').on('click', '.chat-icon img', function () {
        // Limpiar conversationId al salir del chat
        currentConversationId = '';
        console.log('Saliendo del chat - conversationId limpiado');
        
        $('.chatbox .msg-head, .chatbox .modal-body, .chatbox .send-box').remove();
        $('.chatbox').removeClass('has-conversation');

        if (isMobile()) {
            $('.chatbox').removeClass('showbox');
            $('.chatlist').removeClass('hide-on-mobile');
            $('.chat-area').scrollTop(0);
        }
    });


    // =========================
    // ESTADO INICIAL EN MÓVIL
    // =========================
    if (isMobile()) {
        $('.chatlist').show();
        $('.chatbox').removeClass('showbox');
    }

    // =========================
    // LIMPIAR UI AL CARGAR
    // =========================
    $('.chatbox .msg-head, .chatbox .modal-body, .chatbox .send-box').remove();
    $('.chatbox').removeClass('has-conversation');

    // =========================
    // CARGAR Y RENDERIZAR POS AL INICIAR
    // =========================

    fetchPOSFromMake(false).then(function(posArray) {
        console.log('POS cargados:', posArray.length);
        
        // Limpiar la lista actual de POS
        var $posList = $('#POS .chat-list');
        $posList.empty();
        
        // Renderizar cada POS en el DOM
        posArray.forEach(function(pos) {
            var $posItem = $(
                '<a href="#" class="d-flex align-items-center" data-pos-id="' + pos.Id + '">' +
                    '<div class="flex-shrink-0">' +
                        '<img class="img-fluid" src="" alt="' + pos.Nombre + '">' +
                        '<span class="active"></span>' +
                    '</div>' +
                    '<div class="flex-grow-1 ms-3">' +
                        '<h3 title="' + pos.Nombre + '">' + pos.Nombre + '</h3>' +
                        '<p title="' + pos.Descripcion + '">' + pos.Descripcion + '</p>' +
                    '</div>' +
                '</a>'
            );
            
            // Establecer la imagen (base64 o URL por defecto)
            $posItem.find('img').attr('src', pos.Imagen);
            
            // Agregar al contenedor
            $posList.append($posItem);
        });
        
        console.log('POS renderizados en el HTML:', posArray.length);
    }).catch(function(error) {
        console.error('No se pudieron cargar los POS:', error);
        // Mostrar mensaje de error en la interfaz
        var $posList = $('#POS .chat-list');
        $posList.html(
            '<div style="display: flex; flex-direction: column; align-items: center; justify-content: center; padding: 40px 20px; min-height: 300px; text-align: center;">' +
                '<svg width="120" height="120" viewBox="0 0 120 120" fill="none" xmlns="http://www.w3.org/2000/svg" style="margin-bottom: 20px; opacity: 0.3;">' +
                    '<circle cx="60" cy="60" r="50" stroke="#E6E9EE" stroke-width="4" fill="none"/>' +
                    '<path d="M60 35v25M60 70v5" stroke="#D1D6E0" stroke-width="6" stroke-linecap="round"/>' +
                    '<circle cx="60" cy="60" r="58" stroke="#F6F7FA" stroke-width="2" fill="none" opacity="0.5"/>' +
                '</svg>' +
                '<h4 style="color: #6c757d; margin: 0 0 10px 0; font-size: 18px; font-weight: 600;">No se pudieron cargar los POS</h4>' +
                '<p style="color: #adb5bd; margin: 0 0 20px 0; font-size: 14px; line-height: 1.5; max-width: 300px;">Hubo un problema.</p>' +
                '<button onclick="location.reload()" style="background: linear-gradient(135deg, #667eea 0%, #764ba2 100%); color: white; border: none; padding: 12px 24px; border-radius: 8px; font-size: 14px; font-weight: 500; cursor: pointer; transition: transform 0.2s, box-shadow 0.2s; box-shadow: 0 4px 12px rgba(102, 126, 234, 0.3);" onmouseover="this.style.transform=\'translateY(-2px)\'; this.style.boxShadow=\'0 6px 16px rgba(102, 126, 234, 0.4)\'" onmouseout="this.style.transform=\'translateY(0)\'; this.style.boxShadow=\'0 4px 12px rgba(102, 126, 234, 0.3)\'">' +
                    '<i class="fa fa-refresh" style="margin-right: 8px;"></i>Recargar página' +
                '</button>' +
            '</div>'
        );
    });

    // Para forzar actualización ignorando caché:
    // fetchPOSFromMake(true).then(...);
});
