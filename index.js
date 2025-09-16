const {
    default: makeWASocket,
    useMultiFileAuthState,
    DisconnectReason,
    fetchLatestBaileysVersion
} = require('@whiskeysockets/baileys');
const pino = require('pino');
const fs = require('fs');
const { Boom } = require('@hapi/boom');
const config = require('./config');
const readline = require('readline');

// Configuración del logger
const logger = pino({ level: 'silent' });

// Interfaz para preguntar al usuario en la consola
const rl = readline.createInterface({
    input: process.stdin,
    output: process.stdout
});
const question = (text) => new Promise((resolve) => rl.question(text, resolve));

// Función principal para conectar a WhatsApp
async function connectToWhatsApp() {
    const { state, saveCreds } = await useMultiFileAuthState('baileys_auth_info');
    const { version, isLatest } = await fetchLatestBaileysVersion();
    console.log(`Usando WhatsApp v${version.join('.')}, es la última versión: ${isLatest}`);

    const sock = makeWASocket({
        version,
        logger,
        printQRInTerminal: false, // <-- Desactivamos el QR en la terminal
        auth: state,
        browser: ['DaatcsBot', 'Chrome', '1.0.0'],
        generateHighQualityLinkPreview: true
    });

    // Lógica para el código de emparejamiento
    if (!sock.authState.creds.registered) {
        const phoneNumber = await question('Por favor, introduce el número de teléfono del bot (ej: 573101234567): ');
        const code = await sock.requestPairingCode(phoneNumber);
        console.log(`Tu código de emparejamiento es: ${code}`);
    }

    sock.ev.on('connection.update', (update) => {
        const { connection, lastDisconnect } = update;
        if (connection === 'close') {
            const shouldReconnect = (lastDisconnect.error instanceof Boom)?.output?.statusCode !== DisconnectReason.loggedOut;
            console.log('Conexión cerrada debido a:', lastDisconnect.error, ', reconectando:', shouldReconnect);
            if (shouldReconnect) {
                connectToWhatsApp();
            }
        } else if (connection === 'open') {
            console.log('¡Conexión abierta! Bot listo para trabajar.');
            rl.close(); // Cerramos la interfaz de preguntas una vez conectado
        }
    });

    sock.ev.on('creds.update', saveCreds);

    // Listener de mensajes (sin cambios)
    sock.ev.on('messages.upsert', async (m) => {
        const msg = m.messages[0];
        if (!msg.message || !msg.key.remoteJid.endsWith('@g.us')) return;

        const groupJid = msg.key.remoteJid;
        const senderJid = msg.key.participant;

        if (groupJid !== config.groupId) {
            return;
        }

        const isAdmin = config.adminNumbers.includes(senderJid);
        const body = msg.message.conversation || msg.message.extendedTextMessage?.text || '';

        if (isAdmin && body.startsWith('.')) {
            const args = body.slice(1).trim().split(/ +/);
            const command = args.shift().toLowerCase();

            switch (command) {
                case 'nuevopedido':
                    try {
                        const contextInfo = msg.message.extendedTextMessage?.contextInfo;
                        if (!contextInfo || !contextInfo.quotedMessage) {
                            sock.sendMessage(groupJid, { text: '❌ Error: Debes responder al mensaje de un cliente para crear un nuevo pedido.' });
                            return;
                        }
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
                        const pedidosData = fs.readFileSync('./pedidos.json');
                        const pedidos = JSON.parse(pedidosData);
                        const newId = `PED-${(pedidos.length + 1).toString().padStart(3, '0')}`;
                        const newOrder = {
                            id: newId,
                            cliente: contextInfo.participant,
                            producto: orderArgs.producto,
                            cantidad: parseInt(orderArgs.cantidad),
                            estado: 'Confirmado',
                            fechaCreacion: new Date().toISOString()
                        };
                        pedidos.push(newOrder);
                        fs.writeFileSync('./pedidos.json', JSON.stringify(pedidos, null, 2));
                        const confirmationText = `✅ ¡Pedido Creado con Éxito!\n- ID: ${newOrder.id}\n- Cliente: @${newOrder.cliente.split('@')[0]}\n- Producto: ${newOrder.producto}\n- Cantidad: ${newOrder.cantidad}\n- Estado: ${newOrder.estado}`;
                        sock.sendMessage(groupJid, { text: confirmationText, mentions: [newOrder.cliente] });
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
                        const confirmationText = `🔄 *Actualización de Estado*\n- ID: ${pedidos[orderIndex].id}\n- Cliente: @${clienteJid.split('@')[0]}\n- Nuevo Estado: *${newState}*`;
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
                            const price = priceMap.get(pedido.producto.toLowerCase()) || 0;
                            totalRevenue += price * pedido.cantidad;
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
