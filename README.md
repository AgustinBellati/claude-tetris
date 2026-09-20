# Tetris

Implementación del clásico **Tetris** en JavaScript vanilla, usando HTML5 Canvas y CSS. Sin dependencias externas, sin frameworks, sin proceso de build: solo abrir y jugar.

![Tech](https://img.shields.io/badge/HTML5-Canvas-orange)
![Tech](https://img.shields.io/badge/CSS3-blueviolet)
![Tech](https://img.shields.io/badge/JavaScript-Vanilla-yellow)

---

## Tabla de contenidos

- [Tetris](#tetris)
  - [Tabla de contenidos](#tabla-de-contenidos)
  - [Qué hace el proyecto](#qué-hace-el-proyecto)
  - [Cómo ejecutar el juego](#cómo-ejecutar-el-juego)
    - [Opción 1: abrir el archivo directamente](#opción-1-abrir-el-archivo-directamente)
    - [Opción 2: servidor local (recomendado)](#opción-2-servidor-local-recomendado)
  - [Controles](#controles)
  - [Cómo funciona](#cómo-funciona)
    - [1. `index.html`](#1-indexhtml)
    - [2. `style.css`](#2-stylecss)
    - [3. `game.js`](#3-gamejs)
    - [Flujo del juego](#flujo-del-juego)
  - [Tabla de records local](#tabla-de-records-local)
  - [Tecnologías](#tecnologías)
  - [Estructura del proyecto](#estructura-del-proyecto)
  - [Personalización](#personalización)
  - [Automatizaciones: triage de issues con Claude](#automatizaciones-triage-de-issues-con-claude)
  - [Licencia](#licencia)

---

## Qué hace el proyecto

Es una versión jugable del Tetris clásico con todas las mecánicas que esperarías:

- Tablero de **10 × 20** celdas.
- Las **7 piezas estándar** (I, O, T, S, Z, J, L) con colores diferenciados.
- **Rotación** con _wall kicks_ básicos (pequeños desplazamientos para que la pieza pueda rotar pegada a la pared).
- **Soft drop** (bajada acelerada) y **hard drop** (caída instantánea).
- **Pieza fantasma** (_ghost piece_): muestra dónde aterrizará la pieza actual.
- **Vista previa** de la siguiente pieza.
- **Sistema de puntuación** clásico de Tetris (100 / 300 / 500 / 800 multiplicado por nivel).
- **Niveles** que aumentan cada 10 líneas y aceleran la caída.
- **Pieza especial Bomba** 💣: cada 10 líneas despejadas, la siguiente pieza en la vista previa
  es una bomba; al fijarla, destruye un área 3×3 del tablero centrada en su celda.
- **Pausa** y **Game Over** con opción de reinicio.
- **Tabla de records local**: guarda el top 5 de puntuaciones (con nombre) en `localStorage`,
  resalta si la partida actual entra en el ranking y muestra el mejor combo y la mejor jugada
  (líneas despejadas de una sola vez) tanto en la pantalla de inicio como en el game over.

---

## Cómo ejecutar el juego

No hay nada que instalar ni compilar. Tienes dos opciones:

### Opción 1: abrir el archivo directamente

```bash
open index.html        # macOS
xdg-open index.html    # Linux
start index.html       # Windows
```

### Opción 2: servidor local (recomendado)

Cualquier servidor estático funciona. Algunos ejemplos:

```bash
# Con Python 3
python3 -m http.server 8000

# Con Node.js (npx)
npx serve .

# Con PHP
php -S localhost:8000
```

Después abre `http://localhost:8000` en el navegador.

---

## Controles

| Tecla     | Acción                            |
| --------- | --------------------------------- |
| `←` / `→` | Mover la pieza horizontalmente    |
| `↑` o `X` | Rotar la pieza en sentido horario |
| `↓`       | Soft drop (bajar más rápido)      |
| `Espacio` | Hard drop (caída instantánea)     |
| `P`       | Pausar / reanudar                 |

---

## Cómo funciona

El juego se compone de tres archivos que cooperan:

### 1. `index.html`

Define la estructura visual:

- Un `<canvas id="board">` de **300 × 600** píxeles donde se renderiza el tablero.
- Un panel lateral con `SCORE`, `LINES`, `LEVEL`, vista de la siguiente pieza y la lista de controles.
- Un overlay para los estados **PAUSA** y **GAME OVER**, que en el caso de game over también incluye
  las estadísticas de la partida, un formulario para guardar el nombre si hay nuevo record, y la
  tabla de top 5.
- Una **pantalla de inicio** (`#start-screen`), visible antes de arrancar la primera partida, con
  el top 5 de puntuaciones, el mejor combo/mejor jugada históricos, el botón para jugar y el botón
  para resetear los records.

### 2. `style.css`

Aporta el aspecto visual con estética _dark / retro arcade_: fondo oscuro, tipografía monoespaciada para los marcadores y _backdrop blur_ en los overlays.

### 3. `game.js`

Contiene toda la lógica del juego. A grandes rasgos:

- **Modelo del tablero**: una matriz `ROWS × COLS` donde cada celda guarda `0` (vacía) o un índice de color (1–7) que identifica la pieza.
- **Piezas**: definidas como matrices cuadradas. Para rotar se calcula la transposición + reverso de filas (`rotateCW`).
- **Detección de colisiones** (`collide`): comprueba que ninguna celda de la pieza salga del tablero ni se solape con bloques ya fijados.
- **Wall kicks** (`tryRotate`): si la rotación choca, intenta desplazar la pieza ±1 y ±2 columnas antes de descartar el giro.
- **Game loop** (`loop`): basado en `requestAnimationFrame`, acumula el tiempo transcurrido y baja la pieza una fila cuando se supera `dropInterval`.
- **Limpieza de líneas** (`clearLines`): recorre el tablero de abajo hacia arriba; cada fila completa se elimina y se inserta una vacía en la cima.
- **Puntuación**: usa la tabla clásica `[0, 100, 300, 500, 800]` multiplicada por el nivel actual; el hard drop suma 2 puntos por celda recorrida y el soft drop 1 punto por fila.
- **Nivel y velocidad**: el nivel sube cada 10 líneas; la velocidad de caída se calcula como `max(100, 1000 − (level − 1) × 90)` milisegundos.
- **Ghost piece** (`ghostY`): proyecta la posición final de la pieza actual hacia abajo y la dibuja con `globalAlpha = 0.2`.
- **Pieza especial Bomba**: `randomPiece` genera una pieza de 1×1 de tipo `BOMB_TYPE` cuando hay
  una bomba pendiente (`bombPending`, activado en `clearLines` cada `BOMB_LINE_INTERVAL` líneas
  despejadas). Al fijarse (`lockPiece`), en vez de fusionarse con el tablero como una pieza normal,
  dispara `explodeBomb`, que vacía las celdas del área 3×3 centrada en su posición y suma puntos
  por cada celda destruida. Se dibuja con un icono distintivo (💣) en `drawBlock`.
- **Combo y mejor jugada**: `combo` cuenta los locks consecutivos que despejan al menos una línea
  (se resetea en `lockPiece` cuando un lock no despeja ninguna); `maxCombo` y `maxLinesInOneClear`
  (1 a 4 líneas) guardan los máximos de la partida y se actualizan en `clearLines`. La pieza Bomba
  no pasa por `clearLines`, así que es neutral para el combo: no lo rompe ni lo suma.
- **Tabla de records** (`loadHighScores`/`saveHighScores`/`addHighScore`): persiste el top 5 en
  `localStorage` bajo la key `tetris-highscores`, como un array de objetos
  `{ name, score, lines, maxCombo, maxLinesInOneClear, date }`.

### Flujo del juego

```
init()
  ├─ createBoard()                  → matriz vacía
  ├─ next = randomPiece()
  ├─ spawn()                        → mueve next a current y genera nueva next
  └─ requestAnimationFrame(loop)
        ↓
   loop(timestamp)
     ├─ acumula dt
     ├─ si dt ≥ dropInterval → baja la pieza o llama a lockPiece()
     ├─ draw()  (grid + tablero + ghost + pieza actual)
     └─ requestAnimationFrame(loop)

   keydown → mover / rotar / soft-drop / hard-drop / pausa
```

Cuando una pieza recién generada ya colisiona al aparecer (`spawn`), se dispara `endGame()` y se muestra el overlay de **Game Over**.

---

## Tabla de records local

El juego guarda el top 5 de puntuaciones en `localStorage` (key `tetris-highscores`, sin backend
ni servidor):

- **Pantalla de inicio** (`showStartScreen`): antes de la primera partida se muestra el top 5, el
  mejor combo histórico y la mejor jugada histórica (calculados sobre las entradas guardadas), un
  botón **Jugar** que arranca `init()` y un botón **Resetear records** (`resetHighScores`) que
  borra la key de `localStorage` y vacía la tabla.
- **Game over** (`endGame`): muestra la puntuación, las líneas totales, el mejor combo y la mejor
  jugada de esa partida. Si la puntuación entra en el top 5 (`qualifiesForHighScore`), aparece un
  formulario para ingresar el nombre; al guardar (`saveCurrentScore`) la entrada se inserta,
  reordena y recorta a 5 (`addHighScore`), y la fila nueva se resalta en la tabla
  (clase `highscore-new`).
- Cada entrada guardada es un objeto `{ name, score, lines, maxCombo, maxLinesInOneClear, date }`.

---

## Tecnologías

- **HTML5** — marcado y dos elementos `<canvas>` (tablero y vista previa).
- **CSS3** — _flexbox_, variables de color, `backdrop-filter` y `box-shadow`.
- **JavaScript (ES6+) vanilla** — `const`/`let`, _arrow functions_, _spread operator_, `Array.from`, _template literals_…
- **Canvas 2D API** — para todo el renderizado del juego.
- **`requestAnimationFrame`** — para el bucle de juego sincronizado con el navegador.

**Sin dependencias.** No hay `package.json`, ni bundler, ni transpilador.

---

## Estructura del proyecto

```
03-tetris/
├── index.html      # Estructura del DOM y canvas
├── style.css       # Estilos del juego (dark theme)
├── game.js         # Toda la lógica del Tetris (~300 líneas)
└── README.md
```

---

## Personalización

Algunos parámetros fáciles de tunear en `game.js`:

| Constante      | Significado                              | Por defecto           |
| -------------- | ---------------------------------------- | --------------------- |
| `COLS`         | Columnas del tablero                     | `10`                  |
| `ROWS`         | Filas del tablero                        | `20`                  |
| `BLOCK`        | Tamaño en píxeles de cada celda          | `30`                  |
| `COLORS`       | Paleta de colores por tipo de pieza      | 7 colores             |
| `LINE_SCORES`  | Puntos por 1, 2, 3 o 4 líneas eliminadas | `[0,100,300,500,800]` |
| `dropInterval` | Velocidad inicial de caída en ms         | `1000`                |
| `MAX_HIGHSCORES` | Cantidad de puestos en la tabla de records | `5`                 |

> Si cambias `COLS`, `ROWS` o `BLOCK`, recuerda ajustar también `width` y `height` del `<canvas id="board">` en `index.html` para que coincida (`COLS × BLOCK` × `ROWS × BLOCK`).

---

## Automatizaciones: triage de issues con Claude

El repo incluye un GitHub Action (`.github/workflows/claude-issue-triage.yml`) que corre
automáticamente cada vez que se **crea** o se **edita** el título/cuerpo de un issue. Claude:

1. Lee el issue y el código relevante de `game.js` / `index.html` / `style.css`.
2. Aplica labels de tipo (`bug`, `enhancement`, `documentation`, `question`), área
   (`area:gameplay`, `area:render`, `area:input`, `area:scoring`, `area:ui`) y, si es un bug,
   prioridad (`P1`/`P2`/`P3`).
3. Publica (o actualiza) un único comentario de diagnóstico técnico: resumen, función(es) de
   `game.js` involucradas, causa probable y enfoque de solución sugerido — pensado como punto de
   partida para escribir el fix, no como el fix en sí.

El prompt vive en `.claude/commands/triage-issue.md` y las acciones de escritura pasan por
scripts acotados en `scripts/` (`edit-issue-labels.sh`, `upsert-issue-comment.sh`) para que
Claude solo pueda tocar labels existentes y su propio comentario en el issue que disparó la
corrida. Las labels de área/prioridad se crean una única vez con `scripts/setup-labels.sh`.

Issues que mencionan `@claude` en el título o cuerpo no pasan por este workflow: los atiende
`.github/workflows/claude.yml`, que responde directamente a la mención.

---

## Licencia

Proyecto de uso libre con fines educativos y de práctica.
