# Device pairing y session handoff

Especificacion tecnica e implementacion del emparejamiento de dispositivos y el traspaso de
sesiones entre escritorio y movil en el fork de `anomalyco/opencode`.

- Rama: `device-pairing` (base `dev`)
- Version del servidor sobre la que se implemento: `1.18.32`
- Superficie HTTP: el `HttpApi` de Effect bajo el prefijo `/api`

---

## 1. Contexto arquitectónico

opencode ya era cliente-servidor antes de este trabajo: la TUI, la web y el escritorio son
clientes que hablan con un servidor por HTTP y observan un stream de eventos. La sincronizacion en
vivo de una sesion entre dos clientes, por tanto, ya estaba resuelta por la arquitectura. Lo que
**no existia** era identidad de cliente y traspaso de sesion.

### 1.1 Opciones evaluadas

| Opcion | Mecanismo | Coste | Veredicto |
| --- | --- | --- | --- |
| Servidor como hub | SSE del servidor existente + registro de dispositivos | Bajo | **Elegida** |
| P2P real | WebRTC/QUIC, replicacion de estado sin servidor | Meses | Descartada |
| Core distribuido | Sesion First-Class Citizen, sync de estado y conflictos | Meses | Descartada |

Se eligio el hub porque el 80% del comportamiento requerido (dos vistas de la misma sesion en
vivo) ya existia, y el 20% restante — identidad y handoff — es codigo nuevo y acotado, no una
reescritura del nucleo.

### 1.2 Restricciones de la plataforma que condicionan el diseno

Estas se verificaron empiricamente y son las que marcan los limites de lo posible:

**R1. El estado de las sesiones es por instancia de servidor, no por base de datos.**
Dos procesos que comparten `opencode.db` no ven las sesiones del otro. Verificado con cabecera
`x-opencode-directory`, con query `location[directory]` y con el endpoint V1 `/session`. La
consecuencia es que escritorio y movil solo comparten sesiones si apuntan al **mismo proceso**.

**R2. El sidecar del escritorio es efimero.** `packages/desktop/src/main/sidecar.ts` genera puerto
y contrasena en cada arranque. Los logs lo confirman: 52071, 58086, 59004, 65486, 50670. La
contrasena no se persiste en disco, solo vive en memoria del proceso principal. Emparejar un
dispositivo a el exigiria re-emparejarse en cada reinicio.

**R3. La autorizacion no tiene nocion de principal.** `packages/protocol/src/middleware/authorization.ts`
declara el middleware sin `provides`, de modo que ningun handler sabe quien llama. Anadir una
identidad propagada habria cambiado el contrato compartido del API y la generacion del cliente.

**R4. `packages/app` consume un tarball vendorizado del cliente** (`1.17.13-v2`), anterior a los
grupos nuevos, no el paquete del workspace. Ver seccion 7.

---

## 2. Modelo de identidades

Se introducen dos conceptos que antes no existian.

### 2.1 Dispositivo

Un cliente emparejado, con identidad persistente. Se modela en
`packages/schema/src/device.ts` y se persiste en la tabla `device`.

```
Device.Info  = { id, name, kind, platform?, time_created, time_updated, time_last_seen }
Device.Kind  = "mobile" | "desktop"
```

El identificador usa el prefijo `dev_` y se valida en el propio schema
(`Schema.isStartsWith("dev_")`), conforme a la convencion de `packages/schema/AGENTS.md` de que un
ID generado valide exactamente el prefijo que emite.

### 2.2 Handoff

Una intencion de traspaso dirigida a un dispositivo concreto.

```
Handoff.Info = { id, sessionID, deviceID, deviceName, status, note?, time_created, time_updated }
Handoff.Status = "pending" | "accepted" | "declined"
```

`deviceName` esta desnormalizado: se resuelve con un `innerJoin` en la lectura para evitar un N+1
y permitir que la UI muestre el destino sin una segunda consulta.

---

## 3. Modelo de seguridad

### 3.1 Tokens de dispositivo

- Se generan con `randomBytes(32).toString("base64url")` (32 bytes de entropia).
- **Solo se persiste el hash SHA-256** (`packages/core/src/util/hash.ts`). Una base de datos
  filtrada no permite autenticarse.
- La comparacion es una busqueda por indice sobre `token_hash`, que tiene constraint `UNIQUE`. No
  hace falta comparacion en tiempo constante porque no hay comparacion de secretos: se busca el
  registro cuyo hash coincide.
- El token en claro se devuelve **una unica vez**, por el endpoint que canjea el codigo de pairing.

### 3.2 Codigos de pairing

Viven **solo en memoria** (`Cache` de Effect), nunca en la base de datos.

| Propiedad | Valor | Motivo |
| --- | --- | --- |
| TTL | 5 minutos | Ventana suficiente para leer un QR, corta frente a un robo |
| Uso | Uno | `Cache.invalidateWhen` consume la entrada de forma atomica |
| Longitud | 8 | Legible en voz alta y transcribible a mano |
| Alfabeto | `23456789ABCDEFGHJKLMNPQRSTUVWXYZ` | Sin `0/O`, `1/I/L`, `2/Z`, `5/S`, `8/B` |

Que dos redenciones simultaneas no puedan ambas tener exito es una propiedad de
`Cache.invalidateWhen`, que extrae la entrada bajo la misma operacion que la evalua. Se verifico
con dos peticiones concurrentes en las pruebas end-to-end.

### 3.3 La unica ruta sin autenticacion

`POST /api/device/pair` es publica. Es el bootstrap de confianza: un movil sin emparejar no tiene
credenciales por definicion, asi que exigir autenticacion en el canje haria imposible el
emparejamiento. La seguridad se apoya enteramente en el codigo, que solo puede emitir quien ya pasa
la autorizacion y caduca en 5 minutos.

La excepcion esta justificada con un comentario en el propio middleware, junto a la excepcion ya
existente del ticket de PTY.

### 3.4 Aislamiento entre dispositivos

Por R3 no se propaga un principal a los handlers, asi que el aislamiento se resuelve **resolviendo
el objetivo desde el token** en lugar de aceptarlo como parametro:

- `GET /api/handoff/pending` no recibe `deviceID`: lo deduce del `Bearer`.
- `handoff.respond` comprueba ademas `responded.deviceID === caller.id`, de modo que adivinar un
  identificador de handoff no permite responder en nombre de otro dispositivo.

Consecuencia: un token de dispositivo puede llamar a `handoff.send` (el middleware lo acepta), pero
solo puede dirigirlo a otro **dispositivo registrado**, nunca al escritorio, porque el escritorio no
se registra. Ese es exactamente el hueco que queda cubierto en la seccion 6.

### 3.5 Rotacion y revocacion

`DELETE /api/device/:deviceID` elimina el dispositivo. El `ON DELETE CASCADE` de
`handoff.device_id` limpia los handoffs dirigidos a el sin logica adicional. El token del
dispositivo deja de resolver en el siguiente request.

---

## 4. Superficie HTTP

### 4.1 `server.device`

| Metodo | Ruta | Auth | Descripcion |
| --- | --- | --- | --- |
| `GET` | `/api/device` | cualquiera | Lista dispositivos, ordenados por `time_last_seen` descendente |
| `POST` | `/api/device/offer` | cualquiera | Emite un codigo de un solo uso |
| `POST` | `/api/device/pair` | **ninguna** | Canjea el codigo por dispositivo + token |
| `DELETE` | `/api/device/:deviceID` | cualquiera | Revoca un dispositivo |

### 4.2 `server.handoff`

| Metodo | Ruta | Auth | Descripcion |
| --- | --- | --- | --- |
| `POST` | `/api/handoff` | cualquiera | Envia una sesion a un dispositivo |
| `GET` | `/api/handoff/pending` | token de dispositivo | Cola del llamante |
| `POST` | `/api/handoff/:handoffID` | token de dispositivo | Acepta o rechaza |
| `DELETE` | `/api/handoff/:handoffID` | cualquiera | Descarta |

Los dos grupos se registran **sin** `locationMiddleware`: son de ambito de servidor, no de
workspace. Una sesion si es location-scoped, pero el registro de dispositivos y las colas de traspaso
no tienen directorio.

### 4.3 Errores

Se declara `UnauthorizedError` (401) en los endpoints de handoff, donde la ausencia de token de
dispositivo es un fallo de autenticacion y no un 404. `handoff.send` declara `DeviceNotFoundError`
(404) cuando el destino no existe.

---

## 5. Capa de dominio

### 5.1 `Device.Service`

```
all()        -> Info[]
get(id)      -> Info | undefined
offer()      -> { code, expires_in }
redeem(code, input) -> Paired | undefined
authenticate(token) -> Info | undefined
remove(id)   -> void
```

`authenticate` escribe `time_last_seen` como maximo una vez por minuto (`TOUCH_INTERVAL`). Sin ese
limitador, un movil activo issuing una peticion por segundo generaria una escritura por request.

### 5.2 `Handoff.Service`

```
send({ sessionID, deviceID, note? }) -> Info | undefined
pending(deviceID)                    -> Info[]
respond(id, status)                  -> Info | undefined
dismiss(id)                          -> boolean
```

`respond` filtra por `status = "pending"` en el propio `WHERE`, de modo que una doble respuesta es
un no-op a nivel de base de datos y no una carrera de lectura-modificacion-escritura.

### 5.3 Validacion en la lectura

Las filas de Drizzle planas (`string`) se convierten a los tipos branded mediante
`Schema.decodeUnknownSync` en lugar de `as`. Esto hace que una fila corrupta falle de forma ruidosa
en vez de producir un ID que el router de peticiones rechazaria despues. ElBranded ID de `Session`
usa el mismo mecanismo, y su validacion de prefijo actua como asercion de integridad.

### 5.4 Migracion

`packages/core/src/database/migration/20260926211124_device-pairing.ts` crea ambas tablas. Se
genero con `bun run migration --name device-pairing` desde `packages/core`.

---

## 6. Capa de transporte y autorizacion

`packages/server/src/middleware/authorization.ts` acepta ahora dos esquemas:

1. `Authorization: Basic ...` — comportamiento preexistente, sin cambios.
2. `Authorization: Bearer <device token>` — nuevo, resuelto contra `Device.Service`.

Ademas mantiene la excepcion del ticket de PTY (que ya existia para WebSockets) y anade la de
`/api/device/pair`.

**Consecuencia arquitectónica:** `Device.Service` pasa a ser requisito de toda instancia del API,
porque el middleware es global. Hubo que añadirlo en los cuatro lugares que construyen su propio
grafo de servicios:

| Fichero | Mecanismo |
| --- | --- |
| `packages/server/src/routes.ts` | `AppNodeBuilder.build`, servicio global |
| `packages/opencode/.../httpapi/server.ts` | `LayerNode.group` del grafo de la app |
| `packages/cli/src/commands/handlers/serve.ts` | `Layer.provide(AppNodeBuilder.build(...))` |
| `packages/sdk-next/src/opencode.ts` | `HttpRouter.provideRequest` |

El caso de `sdk-next` es distinto y merece explicacion: alli el middleware se construye dentro de
un `Effect.gen` que se ejecuta por peticion, asi que el requisito es de **nivel de request** y se
satisface con `HttpRouter.provideRequest`, igual que ya se hacia con `PermissionSaved`. Proveerlo
con `Layer.provide` no basta y produce un error de tipos desconcertante
(`Expected 2 arguments, but got 1` sobre `web.handler`, porque `toWebHandler` expone los requisitos
de request no resueltos como parametros adicionales).

---

## 7. Pendiente: re-vendorizar el cliente del app

`packages/app/package.json` depende de `@opencode-ai/client` mediante un tarball:

```json
"@opencode-ai/client": "file:vendor/opencode-ai-client-1.17.13-v2.tgz"
```

Ese tarball es el **paquete publicado** (JS compilado en `dist/`, sin dependencias), mientras que
el paquete del workspace es TypeScript crudo con `workspace:*` a `schema` y `protocol`. No es el
mismo artefacto, por lo que el app no ve los grupos nuevos.

**Re-vendorizar no es un `bun pm pack`:** implica compilar el cliente del workspace a JS con
declaraciones y fabricar un `package.json` con la forma de exports del paquete publicado
(`.`, `./promise`, `./promise/api`). Ademas supone subir el cliente del app de `1.17.13` a un build
de `1.18.32`,跨越 27 call sites que usan el cliente, con riesgo de romper la web completa. Es un
cambio que merece su propio PR, no un efecto colateral de esta funcionalidad.

**Mitigacion implementada.** `packages/app/src/utils/device-handoff.ts` encapsula las cuatro
llamadas necesarias (`listDevices`, `listPendingHandoffs`, `respondToHandoff`, `dismissHandoff`) con
los tipos del contrato, reutilizando `ServerConnection.HttpBase` y `platform.fetch` que el app ya
usa. Los tipos estan declarados localmente con un comentario que indica que deben sustituirse por
imports del cliente generado en cuanto se regenere el tarball.

El dialogo `packages/app/src/components/dialog-handoffs.tsx` degrada con elegancia: un servidor sin
los endpoints responde 404 o 401 y la bandeja se muestra vacia, porque el handoff es una capacidad
opcional.

---

## 8. Verificacion

### 8.1 Estatica

- `bun turbo typecheck` — 30/30 paquetes.
- `bunx oxlint` sobre los ficheros nuevos — 0 errores.
- `bun test test/server/httpapi-authorization.test.ts test/server/httpapi-cors.test.ts` — 12 pass,
  0 fail. El test de autorizacionNecesito un `Layer.mock` de `Device.Service` porque `testEffect`
  exige `R = never`.

### 8.2 End-to-end contra un servidor real

**Pairing (8/8)**

| Caso | Resultado |
| --- | --- |
| Health con Basic | 200 |
| `GET /api/device` sin credenciales | 401 |
| Pair con codigo falsificado (ruta publica) | 400 |
| Offer con Basic | 8 caracteres, TTL 300 s |
| Pair canonico | dispositivo creado + token |
| Reutilizar un codigo | 400 |
| `GET /api/device` con Bearer | 200 |
| Listar dispositivos | incluye el nuevo |

**Handoff (10/10)**

| Caso | Resultado |
| --- | --- |
| Emparejar y leer cola vacia | 0 pendientes |
| Enviar a un dispositivo inexistente | 404 |
| Enviar desde escritorio a movil | `pending` |
| Cola del movil | 1 pendiente con su nota |
| Leer la cola con Basic en vez de token | 401 |
| Aceptar | `accepted` |
| Cola tras aceptar | 0 pendientes |
| Responder dos veces | 404 |
| Token de dispositivo falsificado | 401 |

### 8.3 En dispositivo real

Infinix X665E, Android 12 (SDK 31), arm64-v8a, por adb. Ciclo completo verificado: emparejamiento
por codigo, listado de sesiones, chat con envio y streaming, recepcion de handoff y envio de handoff
a otro dispositivo.

---

## 9. Bug preexistente corregido

`packages/core/script/migration.ts` dividia rutas con `file.split("/")[0]`, pero `Bun.Glob.scan`
devuelve separadores `\` en Windows, de modo que el nombre de migracion generado incluia la ruta
completa y la generacion fallaba con `ENOENT`. Corregido a `file.split(/[/\\]/)[0]`.

Es un cambio de una linea en tooling compartido, sin relacion con la funcionalidad, y conviene
aislarlo en su propio commit.

---

## 10. Deuda tecnica conocida

1. **El escritorio no puede recibir handoffs.** Por R3 el escritorio se autentica con Basic y nunca
   se registra como dispositivo, asi que no existe un `deviceID` al que dirigir un traspaso. La
   solucion elegida es que el escritorio se auto-registre reutilizando el propio flujo de pairing:
   con sus credenciales admin llama a `offer` y luego a `pair`, obteniendo un token de dispositivo.
   Esta confirmado que funciona (verificado contra el servidor) pero **aun no esta implementado en
   el codigo del escritorio**.
2. **`time_last_seen` tiene granularidad de un minuto.** Suficiente para una UI, insuficiente para
   ordenar con precision.
3. **Los handoffs pendientes no expiran.** Se acumulan si el destino nunca responde. Una politica de
   caducidad es el siguiente paso natural.
4. **La conversacion actual no se puede migrar entre instancias** (R1). Cambiar de servidor implica
   empezar una sesion nueva.
