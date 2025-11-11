

$(function () {

    // eliminar las secciones de conversación existentes al cargar (según requisito)
    function removeExistingConversationUI() {
        $('.chatbox .msg-head, .chatbox .modal-body, .chatbox .send-box').remove();
        $('.chatbox').removeClass('has-conversation');
    }
    removeExistingConversationUI();

    // util: obtener texto preferente (title si existe, si no text())
    function getPreferredText($el) {
        if (!$el || $el.length === 0) return '';
        var title = $el.attr('title');
        if (title && title.trim()) return title.trim();
        return $el.text().trim();
    }

    // mostrar overlay de carga dentro de .chatbox y simular petición de 1s
    function showLoading() {
        return new Promise(function (resolve) {
            // crear overlay
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

            // keyframes inlined via <style> si no existe
            if ($('#chat-loading-keyframes').length === 0) {
                $('head').append('<style id="chat-loading-keyframes">@keyframes chat-rotate{from{transform:rotate(0)}to{transform:rotate(360deg)}}.chat-loading-overlay{font-family:inherit;color:#444}</style>');
            }

            $overlay.append($spinner, $msg);
            // asegurarse que .chatbox esté en posición relativa para overlay absoluto
            $('.chatbox').css('position', 'relative').append($overlay);

            // simular petición 1s
            setTimeout(function () {
                clearInterval(dotsInterval);
                $overlay.remove();
                resolve();
            }, 1000);
        });
    }

    // crear el header (msg-head) usando nombre y descripción
    function renderHeader(name, description) {
        var $head = $(
            '<div class="msg-head">' +
                '<div class="row">' +
                    '<div class="col-8">' +
                        '<div class="d-flex align-items-center">' +
                            '<span class="chat-icon"><img class="img-fluid" src="https://mehedihtml.com/chatbox/assets/img/arroleftt.svg" alt="volver" role="button"></span>' +
                            '<div class="flex-shrink-0"><img class="img-fluid" src="https://mehedihtml.com/chatbox/assets/img/user.png" alt="user img"></div>' +
                            '<div class="flex-grow-1 ms-3"><h3></h3><p></p></div>' +
                        '</div>' +
                    '</div>' +
                    '<div class="col-4">' +
                        '<ul class="moreoption"><li class="navbar nav-item dropdown">' +
                            '<a class="nav-link dropdown-toggle" href="#" role="button" data-bs-toggle="dropdown" aria-expanded="false"><i class="fa fa-ellipsis-v" aria-hidden="true"></i></a>' +
                            '<ul class="dropdown-menu"><li><a class="dropdown-item" href="#">Action</a></li><li><a class="dropdown-item" href="#">Another action</a></li><li><hr class="dropdown-divider"></li><li><a class="dropdown-item" href="#">Something else here</a></li></ul>' +
                        '</li></ul>' +
                    '</div>' +
                '</div>' +
            '</div>'
        );

        $head.find('h3').text(name);
        $head.find('p').text(description);

        // Si ya existiera uno, reemplazar
        $('.chatbox .msg-head').remove();
        $('.chatbox .modal-content').prepend($head);
    }

    // crear la lista de mensajes (modal-body con .msg-body). por ahora contenido predeterminado
    function renderMessages() {
        var $modalBody = $(
            '<div class="modal-body">' +
                '<div class="msg-body" tabindex="0" aria-live="polite">' +
                    '<ul>' +
                        '<li class="sender"><p>Hey, ¿estás ahí?</p><span class="time">10:06 am</span></li>' +
                        '<li class="repaly"><p>¡Sí! Aquí estoy.</p><span class="time">10:20 am</span></li>' +
                        '<li class="sender"><p>Perfecto, empecemos.</p><span class="time">10:26 am</span></li>' +
                        '<li><div class="divider"><h6>Hoy</h6></div></li>' +
                        '<li class="repaly"><p>Listo, enviado</p><span class="time">10:36 am</span></li>' +
                    '</ul>' +
                '</div>' +
            '</div>'
        );

        // reemplazar si existe
        $('.chatbox .modal-body').remove();
        // insertar después del msg-head si existe, si no al inicio de .modal-content
        var $content = $('.chatbox .modal-content');
        var $head = $content.find('.msg-head');
        if ($head.length) $head.after($modalBody);
        else $content.prepend($modalBody);
    }

    // crear send-box
    function renderSendBox() {
        var $send = $(
            '<div class="send-box">' +
                '<form action="#" onsubmit="return false;" class="send-form">' +
                    '<input type="text" class="form-control send-input" aria-label="message…" placeholder="Escribe un mensaje…">' +
                    '<button type="button" class="btn-send"><i class="fa fa-paper-plane" aria-hidden="true"></i> Enviar</button>' +
                '</form>' +
                '<div class="send-btns"><div class="attach"><div class="button-wrapper"><span class="label"><img class="img-fluid" src="https://mehedihtml.com/chatbox/assets/img/upload.svg" alt="upload"> archivo adjunto</span><input type="file" name="upload" id="upload" class="upload-box" aria-label="Subir archivo"></div></div></div>' +
            '</div>'
        );

        $('.chatbox .send-box').remove();
        $('.chatbox .modal-content').append($send);

        // handler para enviar mensaje (añade al .msg-body ul)
        $('.btn-send').off('click').on('click', function () {
            var text = $('.send-input').val().trim();
            if (!text) return;
            var $li = $('<li class="repaly"><p></p><span class="time"></span></li>');
            $li.find('p').text(text);
            var now = new Date();
            var hh = now.getHours();
            var mm = String(now.getMinutes()).padStart(2, '0');
            var suffix = hh >= 12 ? 'pm' : 'am';
            var hh12 = ((hh + 11) % 12) + 1;
            $li.find('.time').text(hh12 + ':' + mm + ' ' + suffix);
            var $ul = $('.chatbox .msg-body ul');
            if ($ul.length) {
                $ul.append($li);
                // limpiar input
                $('.send-input').val('');
                // desplazar scroll hacia abajo
                var $msgBody = $('.chatbox .msg-body');
                $msgBody.animate({ scrollTop: $msgBody.prop('scrollHeight') }, 200);
            }
        });

        // permitir enviar con Enter
        $('.send-input').off('keypress').on('keypress', function (e) {
            if (e.key === 'Enter') {
                e.preventDefault();
                $('.btn-send').trigger('click');
            }
        });
    }

    // función principal que abre conversación a partir del <a> clickeado
    function openConversation($anchor) {
        // obtener nombre y descripción desde h3 y p dentro del anchor
        var name = getPreferredText($anchor.find('h3'));
        var desc = getPreferredText($anchor.find('p'));

        // esconder chat-empty (añadir clase has-conversation)
        $('.chatbox').addClass('has-conversation');

        // mostrar loader simulado y luego renderizar UI
        showLoading().then(function () {
            // crear UI
            renderHeader(name || 'Sin nombre', desc || '');
            renderMessages();
            renderSendBox();

            // mover foco al msg-body
            $('.chatbox .msg-body').focus();
        });
    }

    // limpiar cualquier UI previa antes de abrir otra conversación
    function prepareForOpen() {
        // remover msg-head/modal-body/send-box si existen (se recrearán)
        $('.chatbox .msg-head, .chatbox .modal-body, .chatbox .send-box').remove();
    }

    // manejar clics sobre items de las listas SOP / Archivado
    $('.chat-lists').on('click', '.chat-list a', function (e) {
        e.preventDefault();
        var $a = $(this);
        prepareForOpen();
        openConversation($a);
        return false;
    });

    // comportamiento del icono volver (flecha) para ocultar conversación y mostrar empty
    // se delega ya que .msg-head se crea dinámicamente
    $('.chatbox').on('click', '.chat-icon img', function () {
        // eliminar UI de conversación y mostrar estado empty
        removeExistingConversationUI();
    });

    // si hay elementos ya clickables en el header por defecto (ej. .chat-icon) se asegura su funcionamiento
    // (no es necesario más código aquí; delegación cubre dinámicos)

});