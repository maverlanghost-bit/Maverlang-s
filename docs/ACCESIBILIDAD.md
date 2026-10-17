# Accesibilidad (M85) — Maverlang

Estándar objetivo: **WCAG 2.2 nivel AA**, verificado con [axe-core](https://github.com/dequelabs/axe-core) (`@axe-core/playwright`) sobre las pantallas clave de la app con datos mock.

## Cómo correr las pruebas

Las pruebas viven en `e2e/a11y.spec.ts` y corren dentro del mismo flujo que el resto de los e2e (build de producción + servidor en 127.0.0.1:3456, todo con `DATA_MODE`, `PRICES_MODE` y `AUTH_MODE` en mock):

```
npm run e2e
```

> axe-core se ejecuta con los tags `wcag2a`, `wcag2aa`, `wcag21a`, `wcag21aa` y `wcag22aa`. Cualquier violación `serious` o `critical` **falla la suite**. Las `moderate` no fallan: se imprimen en la salida del test como `pendientes moderadas` y se listan abajo.

## Cobertura del escaneo axe

| Pantalla | Ruta | Sesión |
|---|---|---|
| Portada | `/` | pública |
| Ayuda | `/ayuda` | pública |
| Legal | `/legal/terminos` | pública |
| Ingresar | `/app/ingresar` | pública |
| Registro demo | `/app/registro` | pública |
| Mercado | `/app` | autenticada (demo) |
| Detalle de acción | `/app/accion/AAPLx` | autenticada |
| Hoja de compra abierta | `/app/accion/AAPLx?operar=comprar` | autenticada |
| Cartera | `/app/cartera` | autenticada |
| Billetera | `/app/billetera` | autenticada |
| Ajustes | `/app/ajustes` | autenticada |

## Atajos de teclado

| Atajo | Acción |
|---|---|
| `Tab` / `Shift+Tab` | Navegación normal; foco siempre visible (`focus-visible:ring-4`) |
| `Tab` inicial | Revela el enlace **«Saltar al contenido»** (portada y plataforma) |
| `/` | Abre el buscador de acciones (escritorio, ≥1024px) |
| `Ctrl/Cmd + B` | Colapsa o expande la barra lateral |
| `Esc` | Cierra hojas, diálogos, buscador y menú del perfil |
| `Enter` / `Espacio` | Activan botones y links |
| `↑` / `↓` | Mueven la opción activa en el buscador, selects y pestañas |
| `←` / `→` | Mueven el radio del interruptor de moneda y los rangos del gráfico |

Foco en overlays (`Sheet`, `Dialog`): al abrir, el foco cae en el primer control; `Tab` queda atrapado dentro del panel; `Esc` cierra y el foco vuelve al elemento que lo abrió.

## Estándares WCAG 2.2 AA cumplidos

### Perceptibles
- **1.1.1 Contenido no textual**: logos decorativos con `alt=""`/`aria-hidden`; logos informativos con nombre accesible; gráficos con `role="img"` y `aria-label`, o con la tabla alternativa del detalle.
- **1.3.1 Info y relaciones**: HTML semántico (`header`, `nav`, `main`, `footer`, `h1`→`h2` sin saltos); `dl` en datos; listas reales. Los favoritos y el copiar mint son botones con `aria-label` (nunca links anidados).
- **1.4.3 Contraste (mínimo)**: tokens ajustados en `app/globals.css` (M85). `fg-muted` sobre los fondos claros ≥ 4,8:1; `up`/`down`/`warn` sobre sus fondos ≥ 4,5:1. El placeholder (`fg-subtle`) está exento (no es texto de contenido).
- **1.4.11 Contraste no textual**: bordes y puntos de estado sobre fondo claro ≥ 3:1.

### Operables
- **2.1.1 Teclado**: todo el flujo (mercado → buscar → ficha → comprar → monto → revisar) opera sin mouse, incluida la compra demo completa (test `flujo de compra completo por teclado`).
- **2.4.1 Saltar bloques**: enlace «Saltar al contenido» en la portada (`app/(marketing)/layout.tsx`) y en el shell de la plataforma.
- **2.4.3 Orden de foco**: orden del DOM = orden lógico; en overlays el foco se mueve dentro del panel y regresa al origen al cerrar.
- **2.4.7 Foco visible**: `:focus-visible` global con anillo de 4px (`ring-fg/20`) sobre fondo claro; skip link visible al enfocar.
- **2.5.8 Tamaño del objetivo**: botones e íconos ≥ 40×40px (44px en móvil); chips y tabs ≥ 44px de alto.
- **2.4.11 Foco no oscurecido**: los toasts y el chrome fijo dejan margen de foco (offsets CSS variables). Pendiente: revisión manual con el lector.

### Comprensibles
- **3.3.2 Etiquetas o instrucciones**: todo input con `<label>` o `aria-label` ligado; errores con `role="alert"` e `aria-describedby` apuntando al mensaje; hints con id.
- **3.3.7 Input redundante**: el registro recuerda el correo (`autocomplete="email"`, `new-password` en altas, `current-password` en ingreso).
- **3.3.8 Accesible Authentication (mínimo)**: login con correo+contraseña, sin prueba cognitiva (los checkboxes legales son consentimientos explícitos, no pruebas).

### Robustos
- **4.1.2 Nombre, rol, valor**: botones de ícono con `aria-label`; `aria-pressed` en favoritos/switches; `aria-expanded` en menús/disclosure; `aria-current="page"` en navegación activa; radiogroups con `role="radio"`.
- **4.1.3 Mensajes de estado**: precios en vivo con región `aria-live="polite"` y **throttle de 10 s** (`PRICE_ANNOUNCE_MS` en `components/domain/price-text.tsx`) para no saturar al lector con cada tick de 5/15 s; estados de carga con `role="status"`; errores con `role="alert"`; toasts en región viva `polite`.

## Movimiento reducido (`prefers-reduced-motion`)

`app/globals.css` acorta **todas** las animaciones y transiciones a 1 ms y desactiva la cinta de precios en movimiento (queda la versión estática). El destello de precio (M41) queda como cambio de color breve, sin animación. Los reveals de la portada aparecen sin desplazamiento.

## Violaciones `moderate` conocidas (pendientes)

> No bloquean la suite; se listan aquí para seguimiento. Al agregar pantallas o componentes, revisar si siguen presentes.

- `aria-hidden-focus`: ninguno detectado en las pantallas cubiertas.
- (Lista las que reporte la corrida actual de `npm run e2e`: los tests las imprimen como `[ruta] pendientes moderadas: …`.)

## Notas de implementación

- El throttle del anuncio de precios vive en `components/domain/price-text.tsx` (`PRICE_ANNOUNCE_MS = 10_000`): la región viva parte vacía y solo anuncia cambios reales del precio, agrupando los ticks que caen dentro del cooldown.
- Los contraste AA de los tokens están documentados en `app/globals.css` (comentario M85) y en `docs/styles/tokens.css` (referencia de diseño).
- El detalle de acción expone el gráfico con `role="img"` + `aria-label` y el precio/variación en texto; una revisión con lector real (Narrador de Windows, JAWS o NVDA) queda como verificación manual del operador (checklist M85).
