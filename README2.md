# Cooking Chaos v2

Archivos (mantenlos en la misma carpeta): `cooking-chaos.html` (cliente), `server.js` (servidor), `package.json`, `render.yaml`.
`cooking-chaos-v1-backup.html` es la versión anterior.

## Ejecutar
1. Instala Node.js 18 o superior. No hay dependencias que instalar.
2. `node server.js` (o `PORT=3000 node server.js`).
3. Abre `http://localhost:8080`. El cliente carga Three.js y la fuente desde internet.
- Solitario: botón "Jugar en solitario".
- Online: uno pulsa "Crear partida online" y comparte el código de 4 letras; los demás escriben el código y "Unirse". En la sala se elige color; los invitados pulsan "Estoy listo" y el anfitrión "Empezar partida".

## Desplegar online
El servidor sirve la página y el WebSocket por el mismo puerto, y el cliente usa wss:// en páginas https.
- Render: sube la carpeta a un repositorio de GitHub, "New > Blueprint" y apunta a `render.yaml`. Los amigos abren la URL pública.
- Railway/Fly/cualquier VPS: `node server.js` con la variable PORT que te asigne la plataforma.
Nota: la versión alojada como artefacto de Claude no puede conectar con tu servidor (bloquea conexiones externas); usa la URL del servidor.

## Cómo funciona
El servidor es la autoridad: movimiento, colisiones, objetos, cocción, pedidos, puntuación y temporizador. Los clientes solo envían entrada (dirección, picar, acción) y dibujan los snapshots (15/s) con interpolación. Si un jugador se cae, su chef queda parado 30 s y puede reconectar automáticamente.

## Añadir recetas
Añade la receta en `RECIPES` de `cooking-chaos.html` y de `server.js` (deben coincidir) y un dibujo en `DISH`.
