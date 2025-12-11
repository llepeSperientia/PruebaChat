$(function () {

    // =========================
    // CONFIGURACIÓN
    // =========================
    // ocultar en backend en versión producción
    var WEBHOOK_URL = 'https://hook.us1.make.com/fld3vofootr5aimg6jy0r5m1ob8ed352';
    var POS_WEBHOOK_URL = 'https://hook.us1.make.com/udoxfuc53ng3axncfwssqpvc3kbmdr09';
    var PROJECT_WEBHOOK_URL = 'https://hook.us1.make.com/0em229nad8e86arsx3wzede7fq3mpc14';

    // 🔹 ID por defecto para el Alineador (se envía a Make)
    var DEFAULT_POS_ID = 'alineador';

    // 🔹 Textos fijos para el header del Alineador
    var DEFAULT_CHAT_NAME = 'Alineador';
    var DEFAULT_CHAT_SUBTITLE = 'Interpretación de insumos con el Marco MEPI®';
    var DEFAULT_AVATAR_URL = 'https://i.ibb.co/Rp0SHKRT/alineador.png';

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

    function getTokenEmpresa() {
        var urlParams = new URLSearchParams(window.location.search);
        var recordID = urlParams.get('recordID');

        if (recordID) {
            try {
                localStorage.setItem(CACHE_KEY_TOKEN_EMPRESA, recordID);
                console.log('Token de empresa guardado en caché:', recordID);
            } catch (e) {
                console.error('Error al guardar token en caché:', e);
            }
            return recordID;
        }

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
    // GESTIÓN DE CACHE Y POS (se mantiene por compatibilidad)
    // =========================
    function imageUrlToBase64(imageUrl) {
        return new Promise(function (resolve) {
            var img = new Image();
            img.crossOrigin = 'Anonymous';

            img.onload = function () {
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
                    resolve('https://mehedihtml.com/chatbox/assets/img/user.png');
                }
            };

            img.onerror = function () {
                console.error('Error al cargar imagen:', imageUrl);
                resolve('https://mehedihtml.com/chatbox/assets/img/user.png');
            };

            img.src = imageUrl;
        });
    }

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

    function savePOSToCache(posData) {
        try {
            localStorage.setItem(CACHE_KEY_POS, JSON.stringify(posData));
            localStorage.setItem(CACHE_KEY_TIMESTAMP, new Date().getTime().toString());
            console.log('Datos guardados en caché');
        } catch (e) {
            console.error('Error al guardar en caché:', e);
        }
    }

    function fetchPOSFromMake(forceRefresh) {
        return new Promise(function (resolve, reject) {
            var tokenEmpresa = getTokenEmpresa();

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

            if (!forceRefresh) {
                var cachedPOS = getPOSFromCache();
                if (cachedPOS) {
                    resolve(cachedPOS);
                    return;
                }
            }

            console.log('Consultando webhook de Make para obtener POS...');

            var urlWithParams = POS_WEBHOOK_URL + '?IdEmpresa=' + encodeURIComponent(tokenEmpresa);

            fetch(urlWithParams, {
                method: 'GET'
            })
                .then(function (response) {
                    console.log('Status de respuesta POS:', response.status, response.statusText);

                    if (!response.ok) {
                        throw new Error('Error en la respuesta del servidor: ' + response.status);
                    }

                    return response.text().then(function (text) {
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
                .then(function (data) {
                    console.log('Respuesta POS recibida:', data);

                    if (data && data.error) {
                        throw new Error(data.error);
                    }

                    if (!Array.isArray(data)) {
                        throw new Error('La respuesta no es un array válido. Recibido: ' + typeof data);
                    }

                    console.log('POS recibidos:', data.length);
                    var posArray = data;

                    var imagePromises = posArray.map(function (pos) {
                        if (pos.Imagen) {
                            return imageUrlToBase64(pos.Imagen).then(function (base64Image) {
                                return {
                                    Id: pos.Id,
                                    Imagen: base64Image,
                                    Nombre: pos.Nombre,
                                    Descripcion: pos.Descripcion
                                };
                            });
                        } else {
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
                .then(function (posWithBase64Images) {
                    savePOSToCache(posWithBase64Images);
                    console.log('POS procesados y guardados en caché:', posWithBase64Images.length);
                    resolve(posWithBase64Images);
                })
                .catch(function (error) {
                    console.error('Error al obtener POS:', error);

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
            '<div class="d-flex justify-content-end align-items-center gap-2">' +
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

        var avatarSrc = imageSrc || DEFAULT_AVATAR_URL || 'https://mehedihtml.com/chatbox/assets/img/user.png';
        $head.find('.pos-avatar').attr('src', avatarSrc);

        $('.chatbox .msg-head').remove();
        $('.chatbox .modal-content').prepend($head);
    }

    // =========================
    // RENDER MENSAJES
    // =========================
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

        var $msgBody = $('.chatbox .msg-body');
        $msgBody.scrollTop($msgBody.prop('scrollHeight'));
    }

    // =========================
    // AÑADIR UN MENSAJE
    // =========================
    function appendMessage(type, text, time, isLoading) {
        var $li;

        var fullTimestamp = new Date().toISOString();

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
        } else {
            var liClass = type === 'sender' ? 'sender' : 'repaly';
            var loadingClass = isLoading ? ' loading-message' : '';

            $li = $('<li class="' + liClass + loadingClass + '">' +
                '<div class="message-content"></div>' +
                '<span class="time" data-timestamp=""></span>' +
                '</li>');

            $li.find('.message-content').html(text || '');
            $li.find('.time').text(time || '').attr('data-timestamp', fullTimestamp);
        }

        $li.css('opacity', '0').css('transform', type === 'error' ? 'scale(0.95)' : 'translateY(10px)');

        var $ul = $('.chatbox .msg-body > ul');
        if ($ul.length) {
            $ul.append($li);

            setTimeout(function () {
                $li.css('transition', type === 'error'
                    ? 'all 0.4s cubic-bezier(0.68, -0.55, 0.265, 1.55)'
                    : 'all 0.3s ease');
                $li.css('opacity', '1');
                $li.css('transform', type === 'error' ? 'scale(1)' : 'translateY(0)');
            }, 10);

            var $msgBody = $('.chatbox .msg-body');
            $msgBody.animate({ scrollTop: $msgBody.prop('scrollHeight') }, 300);
        }

        return $li;
    }

    function removeLoadingMessage() {
        $('.chatbox .msg-body > ul .loading-message').fadeOut(200, function () {
            $(this).remove();
        });
    }

    // =========================
    // GUARDAR COMO PROYECTO
    // =========================
    function saveAsProject(projectName, posId, messages) {
        return new Promise(function (resolve, reject) {
            var tokenEmpresa = getTokenEmpresa();

            if (!tokenEmpresa) {
                reject(new Error('Token de empresa no disponible'));
                return;
            }

            if (!posId) {
                reject(new Error('ID del POS no disponible'));
                return;
            }

            var formattedMessages = messages.map(function (msg) {
                var isClient = msg.type === 'repaly';
                var fecha = msg.timestamp || new Date().toISOString();

                return {
                    Contenido: msg.html,
                    EsCliente: isClient,
                    Fecha: fecha
                };
            });

            var payload = {
                IdPOS: posId,
                IdEmpresa: tokenEmpresa,
                ProyectoNombre: projectName,
                Mensajes: formattedMessages
            };

            console.log('Enviando proyecto:', payload);

            fetch(PROJECT_WEBHOOK_URL, {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json'
                },
                body: JSON.stringify(payload)
            })
                .then(function (response) {
                    console.log('Status de respuesta proyecto:', response.status, response.statusText);

                    if (response.status >= 400) {
                        throw new Error('Error del servidor: ' + response.status + ' - ' + response.statusText);
                    }

                    return response.text().then(function (text) {
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
                .then(function (data) {
                    console.log('Datos parseados proyecto:', data);

                    if (data && data.error) {
                        throw new Error(data.error);
                    }

                    if (!data || !data.ProyectoID) {
                        throw new Error('Respuesta del servidor no contiene ProyectoID');
                    }

                    resolve(data);
                })
                .catch(function (error) {
                    console.error('Error completo en saveAsProject:', error);
                    reject(error);
                });
        });
    }

    // Botón "Guardar conversación" visible
    $('.chatbox').on('click', '.btn-save-conversation', function (e) {
        e.preventDefault();
        $('.chatbox .save-as-project').trigger('click');
    });

    // =========================
    // ENVÍO A MAKE
    // =========================
    function sendToMake(userText, posId, files) {
        return new Promise(function (resolve, reject) {
            var tokenEmpresa = getTokenEmpresa();

            if (!tokenEmpresa) {
                reject(new Error('Token de empresa no disponible'));
                return;
            }

            if (!posId) {
                reject(new Error('ID del POS no disponible'));
                return;
            }

            var formData = new FormData();
            formData.append('message', userText);
            formData.append('posId', posId);
            formData.append('idEmpresa', tokenEmpresa);
            formData.append('conversationId', currentConversationId || '');

            if (files && files.length > 0) {
                for (var i = 0; i < files.length; i++) {
                    formData.append('files', files[i]);
                }
            }

            fetch(WEBHOOK_URL, {
                method: 'POST',
                body: formData
            })
                .then(function (response) {
                    console.log('Status de respuesta:', response.status, response.statusText);

                    if (!response.ok) {
                        throw new Error('Error del servidor: ' + response.status + ' - ' + response.statusText);
                    }

                    return response.text().then(function (text) {
                        console.log('Respuesta del servidor (raw):', text);

                        if (!text || text.trim() === '') {
                            throw new Error('El servidor respondió con una respuesta vacía');
                        }

                        try {
                            var data = JSON.parse(text);
                            return data;
                        } catch (parseError) {
                            console.error('Error al parsear JSON:', parseError);
                            console.error('Texto recibido:', text);

                            if (text.trim().startsWith('<')) {
                                throw new Error('El servidor respondió con HTML en lugar de JSON. Verifica la configuración del webhook.');
                            }

                            if (text.length < 500) {
                                throw new Error('Respuesta no válida: ' + text.substring(0, 100));
                            }

                            throw new Error('El servidor respondió con un formato no válido. Esperaba JSON pero recibió: ' + typeof text);
                        }
                    });
                })
                .then(function (data) {
                    console.log('Datos parseados:', data);

                    if (data && data.error) {
                        throw new Error(data.error);
                    }

                    if (!data || !data.message) {
                        if (typeof data === 'string') {
                            resolve({ message: data });
                            return;
                        }

                        var keys = data ? Object.keys(data).join(', ') : 'ninguna';
                        throw new Error('Respuesta sin mensaje. Propiedades recibidas: ' + keys);
                    }

                    resolve(data);
                })
                .catch(function (error) {
                    console.error('Error completo en sendToMake:', error);
                    reject(error);
                });
        });
    }

    // =========================
    // RENDER SEND BOX
    // =========================
    function renderSendBox(readOnly, posId) {
        if (typeof readOnly === 'undefined') readOnly = false;
        var disabledAttr = readOnly ? 'disabled' : '';
        var disabledClass = readOnly ? ' read-only' : '';

        var $send = $(
            '<div class="send-box' + disabledClass + '">' +
            '<input type="hidden" class="current-pos-id" value="' + (posId || '') + '">' +
            '<form action="#" onsubmit="return false;" class="send-form">' +
            '<div class="send-row d-flex align-items-center">' +
'<button type="button" class="btn-attach" ' + disabledAttr + ' ' +
    (readOnly
        ? 'title="Chat archivado: no se pueden adjuntar archivos"'
        : 'title="Adjuntar archivo"') + '>' +
    '<i class="fa fa-paperclip" aria-hidden="true"></i>' +
'</button>' +

            '<input type="file" name="upload" id="upload" class="upload-box" aria-label="Subir archivo" ' +
            disabledAttr + ' style="display: none;" multiple>' +
            '<div class="input-wrapper flex-grow-1">' +
            '<input type="text" class="form-control send-input" aria-label="message…" ' +
            'placeholder="Pregúntame lo que quieras…" ' + disabledAttr + '>' +
            '</div>' +
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
            var selectedFiles = null;

            $('.btn-attach').off('click').on('click', function (e) {
                e.preventDefault();
                $('#upload').trigger('click');
            });

            $('#upload').off('change').on('change', function (e) {
                var files = e.target.files;
                if (files.length > 0) {
                    selectedFiles = files;
                    console.log('Archivos seleccionados:', files.length);

                    var fileNames = [];
                    for (var i = 0; i < files.length; i++) {
                        fileNames.push(files[i].name);
                    }

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

                if (!posId) {
                    Swal.fire({
                        icon: 'error',
                        title: 'Error',
                        text: 'No se ha seleccionado un POS válido',
                        confirmButtonText: 'Aceptar'
                    });
                    return;
                }

                var timeUser = formatTime();
                var displayText = text || '📎 Archivo(s) adjunto(s)';
                if (text && selectedFiles && selectedFiles.length > 0) {
                    displayText = text + ' <span style="color: #6c757d; font-size: 12px;">📎 ' +
                        selectedFiles.length + ' archivo(s)</span>';
                }
                appendMessage('repaly', displayText, timeUser);

                $('.send-input').val('');
                var filesToSend = selectedFiles;
                selectedFiles = null;
                $('#upload').val('');
                $('.btn-attach').css('color', '').attr('title', 'Adjuntar archivo');

                $('.send-input, .btn-send, .btn-attach').prop('disabled', true);
                $('.btn-send').html('<i class="fa fa-spinner fa-spin" aria-hidden="true"></i>');

                var $loadingMsg = appendMessage(
                    'sender',
                    '<i class="fa fa-circle" aria-hidden="true" style="font-size: 6px; margin: 0 2px; animation: blink 1.4s infinite;"></i>' +
                    '<i class="fa fa-circle" aria-hidden="true" style="font-size: 6px; margin: 0 2px; animation: blink 1.4s infinite 0.2s;"></i>' +
                    '<i class="fa fa-circle" aria-hidden="true" style="font-size: 6px; margin: 0 2px; animation: blink 1.4s infinite 0.4s;"></i>',
                    '',
                    true
                );

                if ($('#blink-animation').length === 0) {
                    $('head').append(
                        '<style id="blink-animation">' +
                        '@keyframes blink { 0%, 60%, 100% { opacity: 0.3; } 30% { opacity: 1; } }' +
                        '</style>'
                    );
                }

                sendToMake(text || 'Archivo adjunto', posId, filesToSend)
                    .then(function (data) {
                        removeLoadingMessage();

                        if (data.conversationId) {
                            currentConversationId = data.conversationId;
                            console.log('ConversationId actualizado:', currentConversationId);
                        }

                        var replyText = data.message || 'Respuesta recibida';
                        var timeBot = formatTime();

                        appendMessage('sender', replyText, timeBot);
                    })
                    .catch(function (err) {
                        console.error('Error webhook:', err);
                        console.error('Stack trace:', err.stack);

                        removeLoadingMessage();

                        var errorTitle = 'Error al enviar mensaje';
                        var errorMessage = 'Error desconocido';
                        var errorDetails = '';

                        if (err.message) {
                            errorMessage = err.message;

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

                        var errorHTML = '<div class="error-title">' + errorTitle + '</div>' +
                            '<div class="error-message">' + errorMessage + '</div>';

                        if (errorDetails) {
                            errorHTML += '<div class="error-details">' + errorDetails + '</div>';
                        }

                        errorHTML += '<div class="error-footer">Si el problema persiste, contacta al administrador</div>';

                        appendMessage('error', errorHTML, formatTime());
                    })
                    .finally(function () {
                        $('.send-input, .btn-send, .btn-attach').prop('disabled', false);
                        $('.btn-send').html('<i class="fa fa-paper-plane" aria-hidden="true"></i> Enviar');
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
    // FUNCIÓN CENTRAL: NUEVA CONVERSACIÓN
    // =========================
    function openNewConversation() {
        // quitar selección de guardados
        $('.chat-lists .chat-list a').removeClass('active-chat');

        // reset conversationId
        currentConversationId = '';
        console.log('Nueva conversación de Alineador - conversationId limpiado');

        prepareForOpen();
        $('.chatbox').addClass('has-conversation');

        if (isMobile()) {
            $('.chatbox').addClass('showbox');
            $('.chatlist').addClass('hide-on-mobile');
        }

        showLoading().then(function () {
            renderHeader(DEFAULT_CHAT_NAME, DEFAULT_CHAT_SUBTITLE, DEFAULT_AVATAR_URL);
            renderMessages();
            renderSendBox(false, DEFAULT_POS_ID);
            $('.chatbox .msg-body').focus();
        });
    }

    // =========================
    // ABRIR CONVERSACIÓN (GUARDADOS)
    // =========================
    $('.chat-lists').on('click', '.chat-list a', function (e) {
        e.preventDefault();
        var $a = $(this);

        // marcar visualmente
        $('.chat-lists .chat-list a').removeClass('active-chat');
        $a.addClass('active-chat');

        var name = getPreferredText($a.find('h3'));
        var desc = getPreferredText($a.find('p'));
        var isArchived = $a.closest('.tab-pane').is('#Archivado') || true; // en Alineador son guardados
        currentConversationId = '';
        console.log('Conversación guardada abierta - conversationId limpiado');

        // para guardados no necesitamos un POS distinto
        var posId = $a.attr('data-pos-id') || DEFAULT_POS_ID;
        var posImage = $a.find('img').attr('src') || DEFAULT_AVATAR_URL;

        prepareForOpen();
        $('.chatbox').addClass('has-conversation');

        if (isMobile()) {
            $('.chatbox').addClass('showbox');
            $('.chatlist').addClass('hide-on-mobile');
        }

        showLoading().then(function () {
            renderHeader(name || DEFAULT_CHAT_NAME, desc || DEFAULT_CHAT_SUBTITLE, posImage);
            renderMessages();
            renderSendBox(isArchived, posId);
            $('.chatbox .msg-body').focus();
        });
    });

    // =========================
    // BOTÓN "+" EN SIDEBAR → NUEVA CONVERSACIÓN
    // =========================
    $('.chat-header').on('click', '.add', function (e) {
        e.preventDefault();
        openNewConversation();
    });

    // =========================
    // GUARDAR COMO PROYECTO (EVENTO)
    // =========================
    $('.chatbox').on('click', '.save-as-project', function (e) {
        e.preventDefault();

        var posId = $('.current-pos-id').val() || DEFAULT_POS_ID;

        if (!posId) {
            Swal.fire({
                icon: 'error',
                title: 'Error',
                text: 'No se ha seleccionado un POS válido',
                confirmButtonText: 'Aceptar'
            });
            return;
        }

        var clientMessages = [];
        $('.chatbox .msg-body > ul > li.repaly').each(function () {
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

        if (clientMessages.length === 0) {
            Swal.fire({
                icon: 'warning',
                title: 'Sin mensajes',
                text: 'No hay mensajes enviados en esta conversación para guardar como proyecto.',
                confirmButtonText: 'Aceptar'
            });
            return;
        }

        var allMessages = [];
        $('.chatbox .msg-body > ul > li').each(function () {
            var $li = $(this);

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
            preConfirm: function () {
                var projectName = document.getElementById('swal-project-name').value.trim();

                if (!projectName) {
                    Swal.showValidationMessage('Debes escribir un nombre para el proyecto');
                    return false;
                }

                return projectName;
            },
            didOpen: function () {
                document.getElementById('swal-project-name').focus();
            }
        }).then(function (result) {
            if (result.isConfirmed && result.value) {
                var projectName = result.value;

                Swal.fire({
                    title: 'Guardando proyecto...',
                    html: 'Por favor espera',
                    allowOutsideClick: false,
                    allowEscapeKey: false,
                    showConfirmButton: false,
                    didOpen: function () {
                        Swal.showLoading();
                    }
                });

                saveAsProject(projectName, posId, allMessages)
                    .then(function (data) {
                        console.log('Proyecto guardado exitosamente:', data);

                        Swal.fire({
                            icon: 'success',
                            title: '¡Proyecto guardado!',
                            html: '<strong>Proyecto:</strong> ' + data.ProyectoNombre + '<br>' +
                                '<strong>ID:</strong> ' + data.ProyectoID,
                            confirmButtonText: 'Aceptar'
                        });
                    })
                    .catch(function (error) {
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
    // BOTÓN VOLVER (flecha móvil)
    // =========================
    $('.chatbox').on('click', '.chat-icon img', function () {
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
    // ESTADO INICIAL
    // =========================

    if (isMobile()) {
        $('.chatlist').show();
        $('.chatbox').removeClass('showbox');
    }

    // 👉 Al cargar, abrimos directamente una nueva conversación del Alineador
    openNewConversation();

    // (Opcional) seguir cargando POS dinámicos si los usas en el futuro
    fetchPOSFromMake(false).then(function (posArray) {
        console.log('POS cargados:', posArray.length);

        var $posList = $('#POS .chat-list');
        if (!$posList.length) return;

        $posList.empty();

        posArray.forEach(function (pos) {
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

            $posItem.find('img').attr('src', pos.Imagen);
            $posList.append($posItem);
        });

        console.log('POS renderizados en el HTML:', posArray.length);
    }).catch(function (error) {
        console.error('No se pudieron cargar los POS:', error);
        // si no tienes sección #POS, este bloque simplemente no hará nada visible
    });

});
