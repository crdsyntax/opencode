# opencode mobile (apps/mobile)

Cliente movil nativo (React Native / Expo) para opencode. Habla con el HttpApi del servidor
directamente y se empareja con el como dispositivo, de modo que la contrasena del servidor nunca
sale de la maquina que lo aloja.

App verificada en un Infinix X665E (Android 12, SDK 31, arm64-v8a) instalada y operada por adb.

---

## 1. Inventario de funcionalidades

### Implementado y verificado en dispositivo

| Funcionalidad | Estado | Notas |
| --- | --- | --- |
| Emparejamiento por codigo | Funcional | Canjea un codigo de 8 caracteres por un token de dispositivo |
| Autenticacion por token de dispositivo | Funcional | `Authorization: Bearer`, token en SecureStore |
| Autenticacion por contrasena (fallback) | Funcional | Basic auth, por si no se quiere emparejar |
| Estado de conexion en vivo | Funcional | Muestra conectado / conectando / sin conexion |
| Listado de sesiones | Funcional | Sessions del directorio configurado |
| Crear sesion | Funcional | Boton flotante |
| Ver mensajes | Funcional | Renderiza user / assistant / system |
| Enviar mensaje | Funcional | `POST /api/session/:id/prompt` |
| Streaming en vivo | Funcional | SSE por sesion con recarga coalescada a 120 ms |
| Detener generacion | Funcional | `POST /api/session/:id/interrupt` |
| Bandeja de handoffs recibidos | Funcional | Aceptar / rechazar, badge con el contador |
| Enviar sesion a otro dispositivo | Funcional | Selector de dispositivos desde el chat |
| Seleccion de directorio | Funcional | `x-opencode-directory` en todas las peticiones |
| Fin de sesion | Funcional | Borra las credenciales almacenadas |

### No implementado

| Funcionalidad | Por que |
| --- | --- |
| Aprobar permisos | El usuario tendria que responder permisos del agente desde el movil |
| Revision de diffs | Requiere un visor de diffs; se omite a proposito en v1 |
| Terminal (PTY) | El endpoint existe pero necesita WebSocket y ticket |
| Notificaciones push | `expo-notifications` + endpoint en el servidor |
| Escaneo de codigo QR | Hoy se teclea el codigo; falta camara |
| Subida de ficheros adjuntos | El endpoint acepta `files` en el prompt |
| Markdown enriquecido | Se renderiza texto plano |
| Historial infinito | Solo la primera pagina de mensajes |
| Selector de agente | Retirado del flujo de v1 para reducir alcance |

---

## 2. Estructura actual

```
apps/mobile/
  app.json                     Expo config: scheme, paquete Android, cleartext, plugins
  package.json                 entry = expo-router/entry
  tsconfig.json                alias: @/* -> src/*, y tipos del monorepo
  app/                         rutas de expo-router (un fichero = una pantalla)
    _layout.tsx                Stack + ConnectionProvider
    index.tsx                  lista de sesiones
    connect.tsx                servidor, directorio, emparejamiento, contrasena
    handoffs.tsx               bandeja de recibidos
    session/[id].tsx           chat
  src/
    api.ts                     cliente HTTP tipado + SSE
    connection.tsx             contexto de conexion y credenciales
    theme.ts                   paleta
    components/
      MessageRow.tsx           render de mensajes y partes
      DevicePicker.tsx         selector de destino para handoff
```

### Decisiones de arquitectura relevantes

**Fuera del workspace de bun.** El monorepo declara `packages/*`, `packages/console/*`,
`packages/stats/*`, `packages/sdk/js` y `packages/slack`. `apps/mobile` no entra en ninguno, asi
que `bun install` del fork no se ve afectado por las dependencias de React Native. Tambien evita que
`turbo` intente typecheckear la app con el toolchain del monorepo.

**Tipos del monorepo, transporte propio.** `tsconfig.json` mapea `@opencode-ai/client` al cliente
generado, pero solo se importa con `import type`, de modo que TypeScript lo borra al compilar y
Metro nunca lo empaqueta. El transporte es un cliente `fetch` escrito a mano en `src/api.ts`.

Esta decision secciono tras verificar que el cliente generado es `fetch` mas tipos borrados: sus
`import type` significan que el bundle no arrastra Effect ni el monorepo. La alternativa —consumir
el paquete del workspace como dependencia real— exigiria que Metro transformase TypeScript desde
`node_modules` y resolver sus dependencias `workspace:*`, lo que acopla la app al monorepo.

**`expo/fetch` para streaming.** El `fetch` global en Android/iOS ya es WinterCG compliant y
soporta `response.body.getReader()`, que es lo que permite el SSE. En web se usa el `fetch` nativo.

**Sin reducer de eventos.** Al llegar cualquier frame del stream por sesion se recarga la lista de
mensajes, coalescida a 120 ms. Es menos elegante que reducir los ~30 tipos de evento del modelo V2,
pero es correcto y mucho mas simple. Es la deuda tecnica mas clara de la v1.

**Contrato de datos del cliente.** Los tipos exportados del cliente generado son `readonly`, y los
endpoints nuevos no envuelven la respuesta en `{ data }` mientras que `sessions` y `messages` si lo
hacen. Los arrays se declararon `readonly T[]` en el estado para no perder la informacion de
inmutabilidad, y el unwrapping se hace explicito en `src/api.ts`.

**Endpoint de streaming usado.** `GET /api/session/:sessionID/event`, que reproduce eventos durables
desde SQLite a partir de `?after=<seq>` y continua en vivo. Se prefirio al stream global
`GET /api/event` porque este ultimo envia **todos** los eventos del proceso sin filtrar por
cliente, lo que en un movil significa trafico y bateria innecesarios.

---

## 3. Bugs reales encontrados durante la integracion

Documentados porque invalarian suposiciones habituales:

1. **Cierre obsoleto en `pair()` / `signIn()`.** Leian `baseUrl` del estado de React, que en el
   primer render tras editar el campo aun tenia el valor anterior. Resultado:
   `MalformedURLException: no protocol: /api/device/pair`. Corregido pasando la URL explicitamente.

2. **Placeholder disfrazado de valor.** El campo de servidor mostraba `http://127.0.0.1:4096` pero
   era el *placeholder*; el valor real era `""`. Por eso el bug anterior no se veia en la pantalla.
   El estado ahora se inicializa con ese valor por defecto.

3. **`usesCleartextTraffic` en `app.json` no hace nada por si solo.** El prebuild no lo aplica;
   solo funciona a traves del plugin `expo-build-properties`. Sin el, Android release bloquea el
   HTTP plano contra el server local.

4. **`btoa` no existe en Hermes.** La codificacion Basic se implementa a mano en `src/api.ts`.

5. **El dev-server no es fiable via adb.** `expo run:android` dejaba la app en "unable to load
   script" porque el tunel `adb reverse` hacia Metro no se-establishia de forma estable. Se
   compilo un APK **release autonomo** con el bundle embebido, que es lo que se distribuye.

---

## 4. Compilacion e instalacion

```bash
cd apps/mobile
npm install --legacy-peer-deps   # el arbol de peers de Expo 57 choca con react-dom 19.3
npx expo prebuild --platform android
cd android
./gradlew.bat assembleRelease     # Windows
adb install -r app/build/outputs/apk/release/app-release.apk
adb reverse tcp:4096 tcp:4096    # el movil alcanza al server del PC
```

Variables de entorno necesarias en Windows (si no estan en el PATH):

```
JAVA_HOME=C:\Program Files\Android\Android Studio\jbr
ANDROID_HOME=%LOCALAPPDATA%\Android\Sdk
```

`assembleRelease` firma con el keystore de debug, que es lo que deja el template de Expo. Para
distribucion real hace falta un keystore propio.

---

## 5. Plan de reescritura

La v1 funciona pero crecio sin una arquitectura por capas y tiene una deuda concreta (el reducer de
eventos). Esta es la estructura que se propone para una v2.

### 5.1 Capas

```
src/
  transport/        fetch, SSE, auth, errores. Sin conocimiento de dominio.
  domain/           tipos, comandos y reductores puros. Sin React.
  state/            stores y sus hooks. Sin JSX.
  ui/               componentes de presentacion.
  features/         screens, cada una componiendo ui + state.
  platform/         secure-store, notifications, camera. Aislados.
```

Regla: las dependencias apuntan hacia dentro (`ui -> features -> state -> domain -> transport`).
Hoy todo vive plano en `src/` y `app/`, lo que hace imposible probar el dominio sin montar React.

### 5.2 Cliente generado de verdad

Hoy se escribe el `fetch` a mano y los tipos se importan del workspace. La v2 debe consumir el
cliente generado (`@opencode-ai/client`) como dependencia real, empaquetado con `bun pm pack` tal
como hace `packages/app` con su tarball vendorizado. Se elimina `src/api.ts` y con el la
duplicacion de formas de respuesta que hoy obliga a escritura defensiva.

### 5.3 Reducer de eventos en vez de recarga

El punto mas importante. Hoy cualquier frame SSE dispara un refetch. La v2 debe:

1. Tipar el union de eventos del manifest como discriminated union.
2. Reducir `session.next.text.delta` a un append incremental, para tener streaming real sin recargar.
3. Reducir el resto a actualizaciones de estado (herramientas, reasoning, pasos, errores).
4. Recargar solo en `session.idle` como reconciliacion final, usando `?after=<seq>` para no perder
   eventos durante una desconexion.

Esto elimina la recarga de red por token y hace el streaming fluido.

### 5.4 Estado normalizado

Un store por sesion, indexado por id, con paginacion por cursor en vez de recargar la lista
completa. Los mensajes van en una entidad store separada de la sesion para que un delta de texto
no re-renderice la lista.

### 5.5 Directorios como recurso de primer clase

Hoy el directorio es un string libre en un `TextInput`. Debería ser: un endpoint que liste los
proyectos del servidor, seleccionables, persistiendo el ultimo usado y offering un selector en la
app. Esto es lo que hace que la app sea usable con varios proyectos.

### 5.6 Cola offline

Guardar los mensajes enviados sin confirmar y reenviarlos al recuperar conexion, con estado
visible. Implica un idempotency key por mensaje, que el endpoint de prompt ya acepta (`id`).

### 5.7 Push

Es la pieza que hace que el handoff sea util de verdad: sin push, el movil no se entera de que
le enviaste una sesion hasta que lo abres. Requiere un token de push por dispositivo en el
registro, y que el servidor emita al crear un handoff. La arquitectura actual lo permite sin
tocar el bus de eventos, pero conviene decidirlo antes de estabilizar el esquema.

### 5.8 Versionado de protocolo

El cliente habla con un `/api` que se mueve rapido (V1 -> V2 en curso). Anadir un campo
`protocolVersion` al handshake del emparejamiento permitiria al movil avisar de forma clara cuando
el servidor es incompatible, en lugar de fallar con errores de validacion.

### 5.9 Pruebas

- Dominio: reducers puros, sin React ni fetch, con fixtures de eventos reales.
- Transporte: cliente contra un server real efimero, reutilizando el patron de
  `packages/opencode/test/server`.
- UI: una prueba de humo por pantalla contra el server.
- E2E en dispositivo: el flujo de emparejamiento es el que mas conviene proteger con un test
  automatico, porque es el unico que no se puede recuperar remotamente.

---

## 6. Estado actual

- `tsc --noEmit` limpio.
- Flujo completo verificado en dispositivo: emparejar -> listar sesiones -> chatear -> recibir
  handoff -> enviar handoff.
- La UI de bandeja del escritorio quedo implementada en `packages/app` mediante
  `src/utils/device-handoff.ts` + `src/components/dialog-handoffs.tsx`, accesible desde la paleta
  de comandos. Depende de re-vendorizar el tarball del cliente para eliminar el transporte
  local; ver `docs/device-pairing-handoff.md` seccion 7.

## 7. Nota sobre el estado de los datos

El servidor del fork usa `opencode-local.db` y el opencode instalado usa `opencode.db`. Son
instancias separadas: el estado de sesiones no se comparte entre ellas aunque el fichero sea el
mismo. Para que escritorio y movil compartan sesiones deben apuntar al mismo proceso de
`opencode serve`.
