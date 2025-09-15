const config = {
  // Coloca aquí el ID del grupo de WhatsApp "PEDIDOS DAATCS".
  // El ID se parece a esto: '120363041234567890@g.us'
  groupId: 'ID_DEL_GRUPO@g.us',

  // Agrega aquí los números de los administradores del bot.
  // Deben estar en formato internacional, sin el '+' y seguidos de '@s.whatsapp.net'.
  // Ejemplo: ['573101234567@s.whatsapp.net', '573117654321@s.whatsapp.net']
  adminNumbers: [
    'NUMERO_ADMIN_1@s.whatsapp.net',
    'NUMERO_ADMIN_2@s.whatsapp.net'
  ],

  // Lista de estados de pedido válidos
  orderStatuses: [
    'En construcción',
    'Confirmado',
    'Creando diseño',
    'En producción',
    'Sublimando',
    'Control de calidad',
    'Listo para entrega',
    'Enviado',
    'Entregado'
  ]
};

module.exports = config;
