# Bot de Pedidos para Daatcs Studio

Este es un bot de WhatsApp diseñado para ayudar a los administradores de "Daatcs Studio" a gestionar los pedidos de los clientes directamente en un grupo de WhatsApp.

## Requisitos

- **Node.js**: Se recomienda la versión 16 o superior.

## Instalación

1.  **Descargar el código**: Asegúrate de tener todos los archivos del bot en una carpeta en tu computadora o servidor.
2.  **Instalar dependencias**: Abre una terminal o consola en la carpeta del bot y ejecuta el siguiente comando. Esto descargará todas las librerías necesarias para que el bot funcione.
    ```bash
    npm install
    ```

## Configuración

Antes de iniciar el bot, **es crucial que configures correctamente el archivo `config.js`**.

1.  **`groupId`**: Aquí debes poner el ID del grupo de WhatsApp "PEDIDOS DAATCS".
    -   *¿Cómo obtener el ID?* Una forma fácil es ejecutar el bot una vez sin el filtro de grupo. Cuando alguien escriba en el grupo, el ID aparecerá en la consola del bot. Se ve algo como `120363041234567890@g.us`.
2.  **`adminNumbers`**: Esta es la lista de los números de teléfono de los administradores que podrán usar los comandos del bot.
    -   El formato debe ser el número de país, seguido del número de teléfono, y terminado en `@s.whatsapp.net`.
    -   **Ejemplo**: Si un administrador en Colombia tiene el número `310 123 4567`, el formato correcto sería `'573101234567@s.whatsapp.net'`.

## Ejecución

1.  Abre una terminal en la carpeta del bot.
2.  Ejecuta el siguiente comando:
    ```bash
    node index.js
    ```
3.  La primera vez que lo ejecutes, aparecerá un **código QR** en la terminal. Abre WhatsApp en tu teléfono, ve a `Dispositivos vinculados` y escanea el código.
4.  Una vez escaneado, el bot se conectará y verás el mensaje "¡Conexión abierta! Bot listo para trabajar." en la terminal. El bot guardará la sesión, por lo que no necesitarás escanear el código cada vez que lo inicies.

## Referencia de Comandos

**Todos los comandos deben ser enviados por un administrador en el grupo configurado.**

---

### `.nuevopedido`

Crea un nuevo pedido. **Importante:** Debes usar este comando al **responder** al mensaje de un cliente.

-   **Sintaxis**: `.nuevopedido producto:"Nombre del Producto" cantidad:<Número>`
-   **Ejemplo**: `.nuevopedido producto:"Mug mágico" cantidad:3`

---

### `.agregarproducto`

Añade un nuevo producto al catálogo interno del bot.

-   **Sintaxis**: `.agregarproducto nombre:"Nombre del Producto" precio:<Número>`
-   **Ejemplo**: `.agregarproducto nombre:"Gorra Sublimable" precio:25000`

---

### `.todospedidos`

Muestra una lista de todos los pedidos registrados con su estado actual.

-   **Sintaxis**: `.todospedidos`

---

### `.cambiarestado`

Actualiza el estado de un pedido existente.

-   **Sintaxis**: `.cambiarestado <ID_DEL_PEDIDO> <Nuevo Estado>`
-   **Ejemplo**: `.cambiarestado PED-001 Sublimando`

---

### `.estadisticas` o `.reporte`

Muestra un resumen de ventas, incluyendo el número total de pedidos, ingresos estimados y un desglose de pedidos por estado.

-   **Sintaxis**: `.estadisticas`

---

### `.notificar`

Envía un mensaje de notificación a todo el grupo.

-   **Sintaxis**: `.notificar <Tu mensaje aquí>`
-   **Ejemplo**: `.notificar Recordatorio: Mañana no hay servicio.`
