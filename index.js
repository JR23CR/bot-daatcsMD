const {
    default: makeWASocket,
    useMultiFileAuthState,
    DisconnectReason,
    fetchLatestBaileysVersion,
    makeInMemoryStore,
    jidDecode
} = require('@whiskeysockets/baileys');
const pino = require('pino');
const fs = require('fs'); // <--- Módulo File System añadido
const { Boom } = require('@hapi/boom');
const config = require('./config');

// Configuración del logger para mostrar los mensajes en la consola
const logger = pino({ level: 'silent' }); // Puedes cambiar a 'info' o 'debug' para más detalles

// Función principal para conectar a WhatsApp
async function connectToWhatsApp() {
    // Cargar estado de autenticación desde archivos. Esto guarda la sesión.
    const { state, saveCreds } = await useMultiFileAuthState('baileys_auth_info');

    // Crear el socket (la instancia del bot)
    const sock = makeWASocket({
        logger,
        printQRInTerminal: true, // Imprime el QR en la terminal
        auth: state,
        browser: ['DaatcsBot', 'Chrome', '1.0.0'] // Info del "navegador" del bot
    });

    // Listener para eventos de conexión
    sock.ev.on('connection.update', (update) => {
        const { connection, lastDisconnect, qr } = update;

        if (qr) {
            console.log('Escanea este código QR con tu teléfono.');
        }

        if (connection === 'close') {
            const shouldReconnect = (lastDisconnect.error instanceof Boom)?.output?.statusCode !== DisconnectReason.loggedOut;
            console.log('Conexión cerrada debido a:', lastDisconnect.error, ', reconectando:', shouldReconnect);

            // Si no es un cierre de sesión, reconectar
            if (shouldReconnect) {
                connectToWhatsApp();
            }
        } else if (connection === 'open') {
            console.log('¡Conexión abierta! Bot listo para trabajar.');
        }
    });

    // Guardar las credenciales cada vez que se actualicen
    sock.ev.on('creds.update', saveCreds);

    // Listener para nuevos mensajes
    sock.ev.on('messages.upsert', async (m) => {
        const msg = m.messages[0];
        // Ignorar si no hay mensaje o no viene de un grupo
        if (!msg.message || !msg.key.remoteJid.endsWith('@g.us')) return;

        const groupJid = msg.key.remoteJid;
        const senderJid = msg.key.participant;

        // Solo procesar mensajes del grupo de pedidos configurado
        if (groupJid !== config.groupId) {
            return;
        }

        const isAdmin = config.adminNumbers.includes(senderJid);
        const body = msg.message.conversation || msg.message.extendedTextMessage?.text || '';

        // Si el mensaje viene de un admin y empieza con '.', es un comando
        if (isAdmin && body.startsWith('.')) {
            const args = body.slice(1).trim().split(/ +/);
            const command = args.shift().toLowerCase();

            // La lógica para ejecutar cada comando se añadirá aquí
            switch (command) {
                case 'nuevopedido':
                    try {
                        // 1. Verificar si es una respuesta a un mensaje
                        const contextInfo = msg.message.extendedTextMessage?.contextInfo;
                        if (!contextInfo || !contextInfo.quotedMessage) {
                            sock.sendMessage(groupJid, { text: '❌ Error: Debes responder al mensaje de un cliente para crear un nuevo pedido.' });
                            return;
                        }

                        // 2. Parsear argumentos (ej: producto:"Mug" cantidad:2)
                        const orderArgs = {};
                        args.forEach(arg => {
                            const parts = arg.split(':');
                            if (parts.length === 2) {
                                orderArgs[parts[0].toLowerCase()] = parts[1].replace(/"/g, '').trim();
                            }
                        });

                        if (!orderArgs.producto || !orderArgs.cantidad) {
                            sock.sendMessage(groupJid, { text: '❌ Error: Faltan argumentos. Formato: .nuevopedido producto:"Nombre" cantidad:2' });
                            return;
                        }

                        // 3. Leer la base de datos de pedidos
                        const pedidosData = fs.readFileSync('./pedidos.json');
                        const pedidos = JSON.parse(pedidosData);

                        // 4. Generar nuevo ID de pedido
                        const newId = `PED-${(pedidos.length + 1).toString().padStart(3, '0')}`;

                        // 5. Crear el objeto del nuevo pedido
                        const newOrder = {
                            id: newId,
                            cliente: contextInfo.participant, // JID del cliente
                            producto: orderArgs.producto,
                            cantidad: parseInt(orderArgs.cantidad),
                            estado: 'Confirmado',
                            fechaCreacion: new Date().toISOString()
                        };

                        // 6. Guardar en la base de datos
                        pedidos.push(newOrder);
                        fs.writeFileSync('./pedidos.json', JSON.stringify(pedidos, null, 2));

                        // 7. Enviar confirmación
                        const confirmationText = `✅ ¡Pedido Creado con Éxito!
- ID: ${newOrder.id}
- Cliente: @${newOrder.cliente.split('@')[0]}
- Producto: ${newOrder.producto}
- Cantidad: ${newOrder.cantidad}
- Estado: ${newOrder.estado}`;

                        sock.sendMessage(groupJid, {
                            text: confirmationText,
                            mentions: [newOrder.cliente] // Mencionar al cliente
                        });

                    } catch (error) {
                        console.error('Error al crear nuevo pedido:', error);
                        sock.sendMessage(groupJid, { text: '❌ Ocurrió un error inesperado al crear el pedido.' });
                    }
                    break;

                case 'agregarproducto':
                    try {
                        const productArgs = {};
                        args.forEach(arg => {
                            const parts = arg.split(':');
                            if (parts.length === 2) {
                                productArgs[parts[0].toLowerCase()] = parts[1].replace(/"/g, '').trim();
                            }
                        });

                        if (!productArgs.nombre || !productArgs.precio) {
                            sock.sendMessage(groupJid, { text: '❌ Error: Faltan argumentos. Formato: .agregarproducto nombre:"Producto" precio:15000' });
                            return;
                        }

                        const productosData = fs.readFileSync('./productos.json');
                        const productos = JSON.parse(productosData);

                        const newProduct = {
                            id: productos.length + 1,
                            nombre: productArgs.nombre,
                            precio: parseFloat(productArgs.precio)
                        };

                        productos.push(newProduct);
                        fs.writeFileSync('./productos.json', JSON.stringify(productos, null, 2));

                        sock.sendMessage(groupJid, { text: `✅ Producto "${newProduct.nombre}" agregado al catálogo.` });

                    } catch (error) {
                        console.error('Error al agregar producto:', error);
                        sock.sendMessage(groupJid, { text: '❌ Ocurrió un error inesperado al agregar el producto.' });
                    }
                    break;

                case 'todospedidos':
                    try {
                        const pedidosData = fs.readFileSync('./pedidos.json');
                        const pedidos = JSON.parse(pedidosData);

                        if (pedidos.length === 0) {
                            sock.sendMessage(groupJid, { text: 'No hay pedidos registrados por el momento.' });
                            return;
                        }

                        let response = '📋 *Lista de Pedidos Activos*\n\n';
                        const mentions = [];
                        pedidos.forEach(p => {
                            response += `*ID:* ${p.id}\n*Producto:* ${p.producto}\n*Estado:* ${p.estado}\n*Cliente:* @${p.cliente.split('@')[0]}\n--------------------\n`;
                            if (!mentions.includes(p.cliente)) {
                                mentions.push(p.cliente);
                            }
                        });

                        sock.sendMessage(groupJid, { text: response, mentions });

                    } catch (error) {
                        console.error('Error al listar pedidos:', error);
                        sock.sendMessage(groupJid, { text: '❌ Ocurrió un error al obtener la lista de pedidos.' });
                    }
                    break;

                case 'cambiarestado':
                    try {
                        const [orderId, ...newStateParts] = args;
                        const newState = newStateParts.join(' ');

                        if (!orderId || !newState) {
                            sock.sendMessage(groupJid, { text: '❌ Error: Formato incorrecto. Usa: .cambiarestado <ID_PEDIDO> <NUEVO_ESTADO>' });
                            return;
                        }

                        // Validar que el estado sea uno de los permitidos
                        if (!config.orderStatuses.includes(newState)) {
                            let validStatuses = '❌ Estado no válido. Los estados permitidos son:\n';
                            config.orderStatuses.forEach(s => validStatuses += `- ${s}\n`);
                            sock.sendMessage(groupJid, { text: validStatuses });
                            return;
                        }

                        const pedidosData = fs.readFileSync('./pedidos.json');
                        const pedidos = JSON.parse(pedidosData);

                        const orderIndex = pedidos.findIndex(p => p.id.toLowerCase() === orderId.toLowerCase());

                        if (orderIndex === -1) {
                            sock.sendMessage(groupJid, { text: `❌ Error: No se encontró ningún pedido con el ID "${orderId}".` });
                            return;
                        }

                        pedidos[orderIndex].estado = newState;
                        fs.writeFileSync('./pedidos.json', JSON.stringify(pedidos, null, 2));

                        const clienteJid = pedidos[orderIndex].cliente;
                        const confirmationText = `🔄 *Actualización de Estado*
- ID: ${pedidos[orderIndex].id}
- Cliente: @${clienteJid.split('@')[0]}
- Nuevo Estado: *${newState}*`;

                        sock.sendMessage(groupJid, { text: confirmationText, mentions: [clienteJid] });

                    } catch (error) {
                        console.error('Error al cambiar estado:', error);
                        sock.sendMessage(groupJid, { text: '❌ Ocurrió un error inesperado al cambiar el estado.' });
                    }
                    break;

                case 'reporte':
                case 'estadisticas':
                    try {
                        const pedidosData = fs.readFileSync('./pedidos.json');
                        const pedidos = JSON.parse(pedidosData);

                        const productosData = fs.readFileSync('./productos.json');
                        const productos = JSON.parse(productosData);
                        const priceMap = new Map(productos.map(p => [p.nombre.toLowerCase(), p.precio]));

                        if (pedidos.length === 0) {
                            sock.sendMessage(groupJid, { text: 'No hay pedidos para generar estadísticas.' });
                            return;
                        }

                        let totalRevenue = 0;
                        const statusCounts = {};

                        pedidos.forEach(pedido => {
                            // Calcular ingresos
                            const price = priceMap.get(pedido.producto.toLowerCase()) || 0;
                            totalRevenue += price * pedido.cantidad;

                            // Contar estados
                            statusCounts[pedido.estado] = (statusCounts[pedido.estado] || 0) + 1;
                        });

                        let statsMessage = `📊 *Estadísticas de Ventas*\n\n`;
                        statsMessage += `*Total de Pedidos:* ${pedidos.length}\n`;
                        statsMessage += `*Ingresos Totales Estimados:* $${totalRevenue.toLocaleString('es-CO')}\n\n`;
                        statsMessage += `*Pedidos por Estado:*\n`;
                        for (const status in statusCounts) {
                            statsMessage += `- ${status}: ${statusCounts[status]}\n`;
                        }

                        sock.sendMessage(groupJid, { text: statsMessage });

                    } catch (error) {
                        console.error('Error al generar estadísticas:', error);
                        sock.sendMessage(groupJid, { text: '❌ Ocurrió un error al generar las estadísticas.' });
                    }
                    break;

                case 'notificar':
                    const messageToNotify = args.join(' ');
                    if (!messageToNotify) {
                        sock.sendMessage(groupJid, { text: '❌ Error: Debes escribir un mensaje para notificar. Ejemplo: .notificar ¡Nuevos productos disponibles!' });
                        return;
                    }
                    const notification = `📢 *Notificación de DAATCS Studio* 📢\n\n${messageToNotify}`;
                    sock.sendMessage(groupJid, { text: notification });
                    break;

                default:
                    sock.sendMessage(groupJid, { text: `Comando ".${command}" no reconocido.` });
                    break;
            }
        }
    });
}

// Iniciar la conexión
connectToWhatsApp();
